import type { Sound } from "../../shared/types";
import { attributionLine, classifyLicence } from "../licence/classify";
import { fetchJson, formatFromName, LOSSLESS_FORMATS, stripHtml } from "../http";
import type { DownloadTarget, ProviderSearch, SoundProvider } from "./types";

const API = "https://commons.wikimedia.org/w/api.php";
const META_FIELDS = "LicenseShortName|LicenseUrl|Artist|ImageDescription|Categories|AttributionRequired";
const LONGEST_SOUND_SEC = 900;

interface ExtValue {
  value?: string;
}

interface ImageInfo {
  url: string;
  descriptionurl: string;
  size?: number;
  duration?: number;
  mime?: string;
  extmetadata?: Record<string, ExtValue | undefined>;
}

interface Page {
  title: string;
  imageinfo?: ImageInfo[];
}

interface QueryResponse {
  query?: { pages?: Page[] };
}

const PRONUNCIATION = /^(LL-Q\d+|[A-Za-z]{2,3}-[a-z]{2,}-|[A-Za-z]{2,3}-)/;

export function pageToSound(page: Page, label: string): Sound | null {
  const info = page.imageinfo?.[0];
  if (!info) return null;
  const mime = info.mime ?? "";
  if (mime.includes("midi")) return null;
  const filename = page.title.replace(/^File:/, "");
  if (PRONUNCIATION.test(filename)) return null;
  if (info.duration && info.duration > LONGEST_SOUND_SEC) return null;

  const meta = info.extmetadata ?? {};
  const licence = classifyLicence({
    name: stripHtml(meta.LicenseShortName?.value),
    url: meta.LicenseUrl?.value,
    field: "extmetadata.LicenseShortName, LicenseUrl",
    sourcePageUrl: info.descriptionurl,
  });
  const title = filename.replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " ");
  const creator = stripHtml(meta.Artist?.value) || "Unknown";
  const format = formatFromName(filename);
  const url = info.url.split("?")[0]!;

  return {
    id: `wikimedia:${filename}`,
    provider: "wikimedia",
    providerLabel: label,
    nativeId: filename,
    title,
    description: stripHtml(meta.ImageDescription?.value).slice(0, 400),
    tags: (meta.Categories?.value ?? "").split("|").map((tag) => tag.replace(/_/g, " ")).filter(Boolean),
    creator,
    creatorUrl: null,
    sourcePageUrl: info.descriptionurl,
    durationSec: info.duration ?? null,
    previewUrl: url,
    previewFormat: format,
    original: {
      available: true,
      needsLogin: false,
      format,
      lossless: LOSSLESS_FORMATS.has(format ?? ""),
      filename,
      sizeBytes: info.size ?? null,
      sampleRate: null,
      bitDepth: null,
    },
    licence,
    licenceReview: "community",
    attribution: attributionLine({ title, creator, sourcePageUrl: info.descriptionurl, licence }),
  };
}

export function wikimediaProvider(userAgent: string): SoundProvider {
  const label = "Wikimedia Commons";

  async function query(params: Record<string, string>): Promise<Page[]> {
    const url = new URL(API);
    const shared = {
      action: "query",
      prop: "imageinfo",
      iiprop: "url|mime|size|extmetadata",
      iiextmetadatafilter: META_FIELDS,
      iiextmetadatalanguage: "en",
      format: "json",
      formatversion: "2",
    };
    for (const [key, value] of Object.entries({ ...shared, ...params })) url.searchParams.set(key, value);
    const body = await fetchJson<QueryResponse>(url.toString(), { userAgent, label });
    return body.query?.pages ?? [];
  }

  return {
    id: "wikimedia",
    label,
    reviewed: true,
    originals: () => "Original files, no login needed",
    disabledReason: () => null,

    async search({ query: text, limit }: ProviderSearch) {
      const pages = await query({
        generator: "search",
        gsrsearch: `filetype:audio ${text}`,
        gsrnamespace: "6",
        // Most Commons audio is share-alike, so over-fetch to survive the gate.
        gsrlimit: String(Math.min(limit * 2, 50)),
      });
      return pages.flatMap((page) => pageToSound(page, label) ?? []);
    },

    async getById(nativeId) {
      const pages = await query({ titles: `File:${nativeId}` });
      return pages[0] ? pageToSound(pages[0], label) : null;
    },

    async resolveDownload(sound): Promise<DownloadTarget> {
      return {
        url: sound.previewUrl,
        headers: { "User-Agent": userAgent },
        filename: sound.original.filename ?? sound.nativeId,
        format: sound.original.format ?? "bin",
        kind: "original",
      };
    },
  };
}
