import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Sound } from "../../shared/types";
import { attributionLine, classifyLicence } from "../licence/classify";
import { fetchJson, LOSSLESS_FORMATS, ProviderError } from "../http";
import type { DownloadTarget, ProviderSearch, SoundProvider } from "./types";

const API = "https://freesound.org/apiv2";
const FIELDS =
  "id,name,tags,description,username,license,duration,type,samplerate,bitdepth,filesize,previews,url";

export interface FreesoundItem {
  id: number;
  name: string;
  tags?: string[];
  description?: string;
  username: string;
  license: string;
  duration?: number;
  type?: string;
  samplerate?: number;
  bitdepth?: number;
  filesize?: number;
  url: string;
  previews?: Record<string, string>;
}

interface TokenSet {
  access: string;
  refresh: string;
  expiresAt: number;
}

export function itemToSound(item: FreesoundItem, label: string, loggedIn: boolean): Sound {
  const licence = classifyLicence({ name: item.license, field: "license", sourcePageUrl: item.url });
  const format = item.type?.toLowerCase() ?? null;
  const hasExtension = /\.[a-z0-9]{2,5}$/i.test(item.name);
  const creatorUrl = `https://freesound.org/people/${encodeURIComponent(item.username)}/`;
  return {
    id: `freesound:${item.id}`,
    provider: "freesound",
    providerLabel: label,
    nativeId: String(item.id),
    title: item.name.replace(/\.[a-z0-9]{2,5}$/i, ""),
    description: (item.description ?? "").slice(0, 400),
    tags: item.tags ?? [],
    creator: item.username,
    creatorUrl,
    sourcePageUrl: item.url,
    durationSec: item.duration ?? null,
    previewUrl: item.previews?.["preview-hq-mp3"] ?? item.previews?.["preview-lq-mp3"] ?? "",
    previewFormat: "mp3",
    original: {
      available: true,
      needsLogin: !loggedIn,
      format,
      lossless: LOSSLESS_FORMATS.has(format ?? ""),
      filename: hasExtension || !format ? item.name : `${item.name}.${format}`,
      sizeBytes: item.filesize ?? null,
      sampleRate: item.samplerate ?? null,
      bitDepth: item.bitdepth ?? null,
    },
    licence,
    licenceReview: "community",
    attribution: attributionLine({ title: item.name, creator: item.username, sourcePageUrl: item.url, licence }),
  };
}

export interface FreesoundAuth {
  isConnected(): Promise<boolean>;
  accessToken(): Promise<string | null>;
  authorizeUrl(): string;
  exchange(code: string, state: string): Promise<void>;
}

export function freesoundAuth(options: {
  clientId: string | null;
  clientSecret: string | null;
  dataDir: string;
  userAgent: string;
}): FreesoundAuth {
  const tokenFile = join(options.dataDir, "freesound-token.json");
  let pendingState: string | null = null;

  async function load(): Promise<TokenSet | null> {
    return readFile(tokenFile, "utf8").then((text) => JSON.parse(text) as TokenSet, () => null);
  }

  async function requestToken(fields: Record<string, string>): Promise<TokenSet> {
    const response = await fetch(`${API}/oauth2/access_token/`, {
      method: "POST",
      headers: { "User-Agent": options.userAgent, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: options.clientId ?? "",
        client_secret: options.clientSecret ?? "",
        ...fields,
      }),
    });
    if (!response.ok) throw new ProviderError("auth", `Freesound login failed (${response.status}).`);
    const body = (await response.json()) as { access_token: string; refresh_token: string; expires_in: number };
    const tokens = {
      access: body.access_token,
      refresh: body.refresh_token,
      expiresAt: Date.now() + (body.expires_in - 60) * 1000,
    };
    await mkdir(options.dataDir, { recursive: true });
    await writeFile(tokenFile, JSON.stringify(tokens));
    return tokens;
  }

  return {
    async isConnected() {
      return (await load()) !== null;
    },
    async accessToken() {
      const tokens = await load();
      if (!tokens) return null;
      if (tokens.expiresAt > Date.now()) return tokens.access;
      return (await requestToken({ grant_type: "refresh_token", refresh_token: tokens.refresh })).access;
    },
    authorizeUrl() {
      pendingState = randomBytes(16).toString("hex");
      const params = new URLSearchParams({
        client_id: options.clientId ?? "",
        response_type: "code",
        state: pendingState,
      });
      return `${API}/oauth2/authorize/?${params}`;
    },
    async exchange(code, state) {
      if (!pendingState || state !== pendingState) throw new ProviderError("auth", "Freesound login state mismatch.");
      pendingState = null;
      await requestToken({ grant_type: "authorization_code", code });
    },
  };
}

export function freesoundProvider(options: {
  apiKey: string | null;
  auth: FreesoundAuth;
  userAgent: string;
}): SoundProvider {
  const label = "Freesound";
  const { apiKey, auth, userAgent } = options;

  function headers(): Record<string, string> {
    return { Authorization: `Token ${apiKey}` };
  }

  return {
    id: "freesound",
    label,
    reviewed: true,
    originals: () => "Originals after you connect your Freesound account",
    disabledReason: () => (apiKey ? null : "Add FREESOUND_API_KEY for direct search."),

    async search({ query, limit }: ProviderSearch) {
      const url = new URL(`${API}/search/`);
      url.searchParams.set("query", query);
      url.searchParams.set("filter", 'license:("Creative Commons 0" OR "Attribution")');
      url.searchParams.set("fields", FIELDS);
      url.searchParams.set("page_size", String(Math.min(limit, 50)));
      const body = await fetchJson<{ results?: FreesoundItem[] }>(url.toString(), {
        userAgent,
        label,
        headers: headers(),
      });
      const loggedIn = await auth.isConnected();
      return (body.results ?? []).map((item) => itemToSound(item, label, loggedIn));
    },

    async getById(nativeId) {
      const url = `${API}/sounds/${encodeURIComponent(nativeId)}/?fields=${FIELDS}`;
      const item = await fetchJson<FreesoundItem>(url, { userAgent, label, headers: headers() });
      return itemToSound(item, label, await auth.isConnected());
    },

    async resolveDownload(sound): Promise<DownloadTarget | null> {
      const token = await auth.accessToken();
      if (!token) {
        return {
          url: sound.previewUrl,
          headers: { "User-Agent": userAgent },
          filename: `${sound.title}.mp3`,
          format: "mp3",
          kind: "preview",
        };
      }
      return {
        url: `${API}/sounds/${encodeURIComponent(sound.nativeId)}/download/`,
        headers: { "User-Agent": userAgent, Authorization: `Bearer ${token}` },
        filename: sound.original.filename ?? sound.title,
        format: sound.original.format ?? "bin",
        kind: "original",
      };
    },
  };
}
