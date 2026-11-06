import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GENERATORS, estimateCost, lyriaPrompt, type GenerateRequest, type GeneratorId } from "../../shared/generate";
import type { Generation, Sound } from "../../shared/types";
import type { CachedAudio } from "../cache/audioCache";
import { generatedLicence } from "../licence/classify";
import type { SoundProvider } from "../providers/types";
import type { Store } from "../store/store";
import { compose, detectAudio, GenerateError, speak, type AudioResult } from "./openrouter";

const TITLE_CHARS = 60;

const CONTENT_TYPES: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  flac: "audio/flac",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
};

function promptOf(request: GenerateRequest): string {
  return request.generator === "lyria-clip" ? lyriaPrompt(request) : request.text.trim();
}

function titleOf(request: GenerateRequest): string {
  const words = (request.generator === "lyria-clip" ? request.prompt : request.text).replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return GENERATORS[request.generator].name;
  return words.length > TITLE_CHARS ? `${words.slice(0, TITLE_CHARS).trim()}…` : words;
}

function callModel(apiKey: string, request: GenerateRequest): Promise<AudioResult> {
  const { model } = GENERATORS[request.generator];
  if (request.generator === "lyria-clip") return compose(apiKey, { model, prompt: lyriaPrompt(request), seed: request.seed, image: request.image });
  if (request.generator === "eleven-v4") return speak(apiKey, { model, input: request.text, voice: request.voice });
  return speak(apiKey, { model, input: request.text, voice: request.voice, instructions: request.instructions });
}

/** Sounds made with the user's own OpenRouter key, kept beside the rest of their library. */
export class Studio {
  private dir: string;
  /** A double click must not pay for two takes. */
  private running = new Set<GeneratorId>();
  readonly provider: SoundProvider;

  constructor(
    private store: Store,
    dataDir: string,
    private apiKey: string | null,
  ) {
    this.dir = join(dataDir, "generated");
    this.provider = {
      id: "generated",
      label: "Generated",
      // Nothing to review: these are the user's own requests, and the card says what is unknown.
      reviewed: true,
      live: true,
      originals: () => "Saved as the model returned them",
      disabledReason: () => (this.apiKey ? null : "Add OPENROUTER_API_KEY to .env."),
      // Search only shows sounds with a licence, and these have none.
      search: async () => [],
      getById: async (id) => {
        const generation = this.find(id);
        return generation && (await this.locate(id)) ? this.sound(generation) : null;
      },
      resolveDownload: async (sound) => {
        const file = await this.locate(sound.nativeId);
        if (!file || !sound.original.filename) return null;
        return { url: "", file: file.path, headers: {}, filename: sound.original.filename, format: sound.original.format ?? "", kind: "original" };
      },
    };
  }

  get available(): boolean {
    return this.apiKey !== null;
  }

  private find(id: string): Generation | undefined {
    return this.store.snapshot().generations.find((generation) => generation.id === id);
  }

  private path(generation: Generation): string {
    return join(this.dir, `${generation.id}.${generation.format}`);
  }

  list(): Sound[] {
    return this.store.snapshot().generations.map((generation) => this.sound(generation));
  }

  async generate(request: GenerateRequest): Promise<Sound> {
    if (!this.apiKey) throw new GenerateError("no_key", "Add OPENROUTER_API_KEY to .env and restart.", 400);
    if (this.running.has(request.generator)) throw new GenerateError("busy", "This model is already working on a take.", 409);
    this.running.add(request.generator);
    try {
      const result = await callModel(this.apiKey, request);
      if (result.audio.length === 0) throw new GenerateError("no_audio", "The model returned no audio. It may have declined the request.");
      const detected = detectAudio(result.audio);
      if (!detected) throw new GenerateError("unknown_format", "The model returned audio in a format Sonic Scout doesn't recognise, so nothing was saved.");

      const generation: Generation = {
        id: randomUUID(),
        generator: request.generator,
        title: titleOf(request),
        prompt: promptOf(request),
        voice: request.generator === "lyria-clip" ? null : (request.voice ?? null),
        modelText: result.text,
        format: detected.format,
        sizeBytes: result.audio.length,
        generationId: result.generationId,
        estimatedCostUsd: estimateCost(request),
        createdAt: new Date().toISOString(),
      };
      await mkdir(this.dir, { recursive: true });
      const temporary = join(this.dir, `${generation.id}.tmp`);
      await writeFile(temporary, result.audio);
      await rename(temporary, this.path(generation));
      await this.store.addGeneration(generation);
      return this.sound(generation);
    } finally {
      this.running.delete(request.generator);
    }
  }

  async locate(id: string): Promise<CachedAudio | null> {
    const generation = this.find(id);
    if (!generation) return null;
    const path = this.path(generation);
    try {
      return { path, size: (await stat(path)).size, contentType: CONTENT_TYPES[generation.format] ?? "application/octet-stream" };
    } catch {
      return null;
    }
  }

  async remove(id: string): Promise<void> {
    const generation = this.find(id);
    if (!generation) return;
    await rm(this.path(generation), { force: true });
    await this.store.removeGeneration(id);
  }

  sound(generation: Generation): Sound {
    const { model, name, maker, rights } = GENERATORS[generation.generator];
    const sourcePageUrl = `https://openrouter.ai/${model}`;
    const slug = generation.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40);
    return {
      id: `generated:${generation.id}`,
      provider: "generated",
      providerLabel: "Generated",
      nativeId: generation.id,
      title: generation.title,
      description: generation.prompt,
      tags: [],
      creator: `${maker} ${name}${generation.voice ? ` (${generation.voice})` : ""}`,
      creatorUrl: null,
      sourcePageUrl,
      durationSec: null,
      previewUrl: `/api/generated/${generation.id}/audio`,
      previewFormat: generation.format,
      original: {
        available: true,
        needsLogin: false,
        format: generation.format,
        lossless: generation.format === "wav" || generation.format === "flac",
        filename: `${slug || "generated"}-${generation.id.slice(0, 8)}.${generation.format}`,
        sizeBytes: generation.sizeBytes,
        sampleRate: null,
        bitDepth: null,
      },
      licence: generatedLicence({ model, generationId: generation.generationId, createdAt: generation.createdAt, sourcePageUrl, termsUrl: rights.termsUrl }),
      rights,
      licenceReview: "generated",
      attribution: null,
    };
  }
}
