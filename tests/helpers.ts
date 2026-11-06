import type { Sound } from "../shared/types";
import { attributionLine, classifyLicence } from "../server/licence/classify";

export function makeSound(overrides: Partial<Sound> & { licenceName?: string; licenceUrl?: string } = {}): Sound {
  const { licenceName, licenceUrl, ...rest } = overrides;
  const sourcePageUrl = "https://example.org/sound/1";
  const licence = classifyLicence({
    name: licenceName ?? "CC0",
    url: licenceUrl ?? null,
    field: "test",
    sourcePageUrl,
  });
  const title = rest.title ?? "School bell";
  return {
    id: "wikimedia:bell.wav",
    provider: "wikimedia",
    providerLabel: "Wikimedia Commons",
    nativeId: "bell.wav",
    title,
    description: "",
    tags: [],
    creator: "A Recordist",
    creatorUrl: null,
    sourcePageUrl,
    durationSec: 10,
    previewUrl: "https://upload.wikimedia.org/bell.wav",
    previewFormat: "wav",
    original: { available: true, needsLogin: false, format: "wav", lossless: true, filename: "bell.wav", sizeBytes: 100, sampleRate: null, bitDepth: null },
    licence,
    licenceReview: "community",
    attribution: attributionLine({ title, creator: "A Recordist", sourcePageUrl, licence }),
    ...rest,
  };
}
