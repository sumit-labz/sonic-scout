import type { Sound } from "../../shared/types";
import { attributionLine, classifyLicence } from "../licence/classify";
import { fetchJson, LOSSLESS_FORMATS, formatFromName, mapLimit } from "../http";
import type { DownloadTarget, ProviderSearch, SoundProvider } from "./types";

const SEARCH = "https://archive.org/advancedsearch.php";
const METADATA = "https://archive.org/metadata/";
const LONGEST_SOUND_SEC = 600;
const ITEMS_PER_QUERY = 6;

// The licenses we can clear, written as Solr wildcards. Escaped slashes because
// an unescaped one starts a regex in Lucene query syntax.
const LICENCE_QUERY = "(licenseurl:*publicdomain* OR licenseurl:*licenses\\/by\\/*)";
const AUDIO_EXT = /\.(wav|wave|aif|aiff|flac|mp3|ogg)$/i;

interface ArchiveFile {
  name: string;
  source?: string;
  format?: string;
  length?: string;
  size?: string;
}

export interface ArchiveItem {
  metadata?: {
    identifier?: string;
    title?: string | string[];
    creator?: string | string[];
    description?: string | string[];
    subject?: string | string[];
    licenseurl?: string;
  };
  files?: ArchiveFile[];
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function list(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : value.split(/[;,]/)).map((tag) => tag.trim()).filter(Boolean);
}

function lengthSec(file: ArchiveFile): number | null {
  if (!file.length) return null;
  if (file.length.includes(":")) return file.length.split(":").reduce((total, part) => total * 60 + Number(part), 0);
  const seconds = Number(file.length);
  return Number.isFinite(seconds) ? seconds : null;
}

function fileUrl(identifier: string, name: string): string {
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${name.split("/").map(encodeURIComponent).join("/")}`;
}

function stem(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

export function itemToSound(item: ArchiveItem, wantedFile: string | null, label: string): Sound | null {
  const identifier = item.metadata?.identifier;
  if (!identifier) return null;
  const files = item.files ?? [];
  const originals = files.filter((file) => file.source === "original" && AUDIO_EXT.test(file.name));
  const file = wantedFile
    ? originals.find((candidate) => candidate.name === wantedFile)
    : originals.find((candidate) => (lengthSec(candidate) ?? 0) <= LONGEST_SOUND_SEC);
  if (!file) return null;

  const sourcePageUrl = `https://archive.org/details/${identifier}`;
  const licence = classifyLicence({
    url: item.metadata?.licenseurl,
    field: "metadata.licenseurl",
    sourcePageUrl,
  });
  const title = first(item.metadata?.title) || stem(file.name);
  const creator = first(item.metadata?.creator) || "Unknown";
  const format = formatFromName(file.name);
  const lossyTwin = files.find((candidate) => stem(candidate.name) === stem(file.name) && /\.mp3$/i.test(candidate.name));
  const preview = lossyTwin ?? file;

  return {
    id: `archive:${identifier}/${file.name}`,
    provider: "archive",
    providerLabel: label,
    nativeId: `${identifier}/${file.name}`,
    title,
    description: first(item.metadata?.description).replace(/<[^>]*>/g, " ").slice(0, 400),
    tags: list(item.metadata?.subject),
    creator,
    creatorUrl: null,
    sourcePageUrl,
    durationSec: lengthSec(file),
    previewUrl: fileUrl(identifier, preview.name),
    previewFormat: formatFromName(preview.name),
    original: {
      available: true,
      needsLogin: false,
      format,
      lossless: LOSSLESS_FORMATS.has(format ?? ""),
      filename: file.name.split("/").pop() ?? file.name,
      sizeBytes: file.size ? Number(file.size) : null,
      sampleRate: null,
      bitDepth: null,
    },
    licence,
    licenceReview: "unreviewed",
    attribution: attributionLine({ title, creator, sourcePageUrl, licence }),
  };
}

export function archiveProvider(userAgent: string): SoundProvider {
  const label = "Internet Archive";

  function loadItem(identifier: string): Promise<ArchiveItem> {
    return fetchJson<ArchiveItem>(`${METADATA}${encodeURIComponent(identifier)}`, { userAgent, label });
  }

  return {
    id: "archive",
    label,
    // Uploaders pick their own licence and nobody checks it. Ripped game audio
    // marked "public domain" turned up in testing.
    reviewed: false,
    originals: () => "Original files, no login needed",
    disabledReason: () => null,

    async search({ query }: ProviderSearch) {
      const terms = query.replace(/["():\\]/g, " ").trim();
      const url = new URL(SEARCH);
      url.searchParams.set("q", `(title:(${terms}) OR subject:(${terms})) AND mediatype:audio AND ${LICENCE_QUERY}`);
      url.searchParams.append("fl[]", "identifier");
      url.searchParams.set("rows", String(ITEMS_PER_QUERY));
      url.searchParams.set("output", "json");
      const body = await fetchJson<{ response?: { docs?: Array<{ identifier: string }> } }>(url.toString(), {
        userAgent,
        label,
      });
      const docs = body.response?.docs ?? [];
      const items = await mapLimit(docs, 4, (doc) => loadItem(doc.identifier).catch(() => null));
      return items.flatMap((item) => (item ? (itemToSound(item, null, label) ?? []) : []));
    },

    async getById(nativeId) {
      const slash = nativeId.indexOf("/");
      if (slash < 1) return null;
      return itemToSound(await loadItem(nativeId.slice(0, slash)), nativeId.slice(slash + 1), label);
    },

    async resolveDownload(sound): Promise<DownloadTarget> {
      const slash = sound.nativeId.indexOf("/");
      return {
        url: fileUrl(sound.nativeId.slice(0, slash), sound.nativeId.slice(slash + 1)),
        headers: { "User-Agent": userAgent },
        filename: sound.original.filename ?? sound.nativeId.slice(slash + 1),
        format: sound.original.format ?? "bin",
        kind: "original",
      };
    },
  };
}
