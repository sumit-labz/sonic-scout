export type GeneratorId = "lyria-clip" | "drama-3" | "eleven-v4";

export const MAX_SPEECH_CHARS = 10_000;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Eleven v4's voices, as OpenRouter's models API lists them. */
export const ELEVEN_VOICES = [
  "george", "sarah", "adam", "alice", "bella", "bill", "brian", "callum", "charlie", "chris", "daniel",
  "eric", "harry", "jessica", "laura", "liam", "lily", "matilda", "river", "roger", "will",
] as const;

export type ElevenVoice = (typeof ELEVEN_VOICES)[number];

export interface GeneratorInfo {
  id: GeneratorId;
  model: string;
  name: string;
  /** Who makes the model, for the record of where a sound came from. */
  maker: string;
  blurb: string;
}

export const GENERATORS: Record<GeneratorId, GeneratorInfo> = {
  "lyria-clip": {
    id: "lyria-clip",
    model: "google/lyria-3-clip-preview",
    name: "Lyria 3 Clip",
    maker: "Google",
    blurb: "30-second music sketches and score ideas.",
  },
  "drama-3": {
    id: "drama-3",
    model: "fish-audio/drama-3",
    name: "Drama 3",
    maker: "Fish Audio",
    blurb: "Directed voice performances, led by [directions] in your text.",
  },
  "eleven-v4": {
    id: "eleven-v4",
    model: "elevenlabs/eleven-v4",
    name: "Eleven v4",
    maker: "ElevenLabs",
    blurb: "Expressive voices with inline audio tags, in 90+ languages.",
  },
};

export interface LyriaRequest {
  generator: "lyria-clip";
  prompt: string;
  mood?: string;
  instruments?: string;
  bpm?: number;
  instrumental: boolean;
  seed?: number;
  /** A data URL. Lyria can take its mood from a picture, such as a film still. */
  image?: string;
}

export interface DramaRequest {
  generator: "drama-3";
  text: string;
  /** Delivery for the whole take. OpenRouter adds it to the text, so Fish bills it. */
  instructions?: string;
  /** A Fish Audio voice id. OpenRouter doesn't list them, so left out means Fish's default. */
  voice?: string;
}

export interface ElevenRequest {
  generator: "eleven-v4";
  text: string;
  voice: ElevenVoice;
}

export type GenerateRequest = LyriaRequest | DramaRequest | ElevenRequest;

/** Lyria takes one prompt, so the form's fields become plain sentences you can read back. */
export function lyriaPrompt(request: LyriaRequest): string {
  const parts = [request.prompt.trim().replace(/[.\s]+$/, "")];
  if (request.mood?.trim()) parts.push(`Mood: ${request.mood.trim()}`);
  if (request.instruments?.trim()) parts.push(`Instruments: ${request.instruments.trim()}`);
  if (request.bpm) parts.push(`Tempo: ${request.bpm} BPM`);
  if (request.instrumental) parts.push("Instrumental only, no vocals");
  return `${parts.join(". ")}.`;
}

const LYRIA_CLIP_USD = 0.04;
const DRAMA_USD_PER_BYTE = 0.000002;
const ELEVEN_USD_PER_CHAR = 0.00008;

/** OpenRouter's listed prices. An estimate, because the bill is theirs to work out. */
export function estimateCost(request: GenerateRequest): number {
  if (request.generator === "lyria-clip") return LYRIA_CLIP_USD;
  if (request.generator === "eleven-v4") return request.text.length * ELEVEN_USD_PER_CHAR;
  const billed = `${request.instructions ?? ""}${request.text}`;
  return new TextEncoder().encode(billed).length * DRAMA_USD_PER_BYTE;
}

export function formatCost(usd: number): string {
  return usd < 0.01 ? "under $0.01" : `about $${usd.toFixed(2)}`;
}
