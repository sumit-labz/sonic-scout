import type { Sound } from "../../shared/types";
import { attributionLine, classifyLicence } from "../licence/classify";
import { fetchJson } from "../http";
import type { DownloadTarget, ProviderSearch, SoundProvider } from "./types";

const API = "https://api.openverse.org/v1/audio/";

export interface OpenverseAudio {
  id: string;
  title: string | null;
  foreign_landing_url: string;
  url: string;
  creator: string | null;
  creator_url: string | null;
  license: string;
  license_version: string | null;
  license_url: string | null;
  filetype: string | null;
  filesize: number | null;
  duration: number | null;
  tags: Array<{ name: string }> | null;
}

export function audioToSound(item: OpenverseAudio, label: string): Sound {
  const name = item.license === "cc0" ? "CC0" : item.license === "pdm" ? "PDM" : `CC ${item.license.toUpperCase()}`;
  const licence = classifyLicence({
    name,
    url: item.license_url,
    field: "Openverse license, license_url",
    sourcePageUrl: item.foreign_landing_url,
  });
  const title = item.title?.trim() || "Untitled";
  const creator = item.creator?.trim() || "Unknown";
  const previewName = item.url.split("/").pop()?.split("?")[0] ?? null;

  return {
    id: `openverse:${item.id}`,
    provider: "openverse",
    providerLabel: label,
    nativeId: item.id,
    title,
    description: "",
    tags: (item.tags ?? []).map((tag) => tag.name),
    creator,
    creatorUrl: item.creator_url,
    sourcePageUrl: item.foreign_landing_url,
    durationSec: item.duration ? item.duration / 1000 : null,
    previewUrl: item.url,
    previewFormat: item.filetype,
    // Openverse's `url` for Freesound is the 128 kbps preview. The real original
    // sits behind Freesound's OAuth, which Openverse cannot reach.
    original: {
      available: false,
      needsLogin: true,
      format: null,
      lossless: false,
      filename: previewName,
      sizeBytes: null,
      sampleRate: null,
      bitDepth: null,
    },
    licence,
    licenceReview: "community",
    attribution: attributionLine({ title, creator, sourcePageUrl: item.foreign_landing_url, licence }),
  };
}

export function openverseProvider(userAgent: string, freesoundKey: string | null): SoundProvider {
  const label = "Freesound via Openverse";

  return {
    id: "openverse",
    label,
    reviewed: true,
    originals: () => "MP3 previews only. Add a Freesound key for originals",
    disabledReason: () => (freesoundKey ? "Freesound is being searched directly." : null),

    async search({ query, limit }: ProviderSearch) {
      const url = new URL(API);
      url.searchParams.set("q", query);
      // Server-side filter to spend fewer of Openverse's 200 anonymous requests a
      // day. The central gate still checks every record.
      url.searchParams.set("license", "cc0,pdm,by");
      url.searchParams.set("source", "freesound");
      url.searchParams.set("mature", "false");
      url.searchParams.set("page_size", String(Math.min(limit, 20)));
      const body = await fetchJson<{ results?: OpenverseAudio[] }>(url.toString(), { userAgent, label: "Openverse" });
      return (body.results ?? []).map((item) => audioToSound(item, label));
    },

    async getById(nativeId) {
      const item = await fetchJson<OpenverseAudio>(`${API}${encodeURIComponent(nativeId)}/`, {
        userAgent,
        label: "Openverse",
      });
      return audioToSound(item, label);
    },

    async resolveDownload(sound): Promise<DownloadTarget> {
      const filename = sound.original.filename ?? `${sound.title}.mp3`;
      return {
        url: sound.previewUrl,
        headers: { "User-Agent": userAgent },
        filename,
        format: sound.previewFormat ?? "mp3",
        kind: "preview",
      };
    },
  };
}
