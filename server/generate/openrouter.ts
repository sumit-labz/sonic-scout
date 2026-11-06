const API = "https://openrouter.ai/api/v1";
const TIMEOUT_MS = 3 * 60_000;
const MAX_MESSAGE_CHARS = 300;

export class GenerateError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

export interface AudioResult {
  audio: Buffer;
  /** OpenRouter's id for this generation, kept as the record of where the file came from. */
  generationId: string | null;
  /** Any words the model sent alongside the audio, such as lyrics. */
  text: string;
}

export interface AudioFormat {
  format: string;
  contentType: string;
}

/** Trusts the bytes, not the label. Lyria's output format isn't documented, so it has to be recognised. */
export function detectAudio(bytes: Buffer): AudioFormat | null {
  const head = (length: number) => bytes.toString("latin1", 0, length);
  if (head(4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WAVE") return { format: "wav", contentType: "audio/wav" };
  if (head(3) === "ID3" || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)) return { format: "mp3", contentType: "audio/mpeg" };
  if (head(4) === "fLaC") return { format: "flac", contentType: "audio/flac" };
  if (head(4) === "OggS") return { format: "ogg", contentType: "audio/ogg" };
  if (bytes.toString("latin1", 4, 8) === "ftyp") return { format: "m4a", contentType: "audio/mp4" };
  return null;
}

function explain(status: number, detail: string | null): GenerateError {
  if (status === 401) return new GenerateError("bad_key", "OpenRouter rejected your API key. Check OPENROUTER_API_KEY in .env.", 401);
  if (status === 402) return new GenerateError("no_credits", "Your OpenRouter account is out of credits. Add more at openrouter.ai/credits.", 402);
  if (status === 429) return new GenerateError("rate_limited", "OpenRouter is rate limiting you. Wait a moment and try again.", 429);
  const reason = detail?.slice(0, MAX_MESSAGE_CHARS);
  if (status === 403) return new GenerateError("refused", reason ?? "The model refused this request.", 403);
  return new GenerateError("failed", reason ?? `OpenRouter returned ${status}.`, status >= 500 ? 502 : 400);
}

async function failure(response: Response): Promise<GenerateError> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return explain(response.status, body?.error?.message ?? null);
}

/**
 * Never retried. Every call can spend the user's money, so a failure goes back to
 * them to decide, and fetchJson's automatic retry mustn't be used here.
 */
async function post(apiKey: string, path: string, body: unknown): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new GenerateError(timedOut ? "timeout" : "offline", timedOut ? "The model took too long to respond." : "Could not reach OpenRouter.");
  }
  if (!response.ok) throw await failure(response);
  return response;
}

export async function speak(
  apiKey: string,
  request: { model: string; input: string; voice?: string; instructions?: string },
): Promise<AudioResult> {
  const response = await post(apiKey, "/audio/speech", {
    model: request.model,
    input: request.input,
    response_format: "mp3",
    ...(request.voice ? { voice: request.voice } : {}),
    ...(request.instructions ? { instructions: request.instructions } : {}),
  });
  return {
    audio: Buffer.from(await response.arrayBuffer()),
    generationId: response.headers.get("x-generation-id"),
    text: "",
  };
}

function decode(chunks: string[]): Buffer {
  const clean = chunks.map((chunk) => chunk.replace(/^data:[^,]*,/, ""));
  // Padding mid-stream means each chunk was encoded on its own.
  if (clean.slice(0, -1).some((chunk) => chunk.endsWith("="))) return Buffer.concat(clean.map((chunk) => Buffer.from(chunk, "base64")));
  return Buffer.from(clean.join(""), "base64");
}

interface ChatEvent {
  id?: string;
  error?: { code?: number; message?: string };
  choices?: Array<{
    delta?: { content?: string | null; audio?: { data?: string } };
    message?: { content?: string | null; audio?: { data?: string } };
  }>;
}

/** Audio arrives as base64 in a stream of events. An error can arrive mid-stream with a 200 status. */
export async function readAudioEvents(body: ReadableStream<Uint8Array>): Promise<AudioResult> {
  const chunks: string[] = [];
  let text = "";
  let generationId: string | null = null;
  let buffer = "";

  const handle = (line: string) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    const event = JSON.parse(payload) as ChatEvent;
    if (event.error) throw explain(event.error.code ?? 502, event.error.message ?? null);
    generationId ??= event.id ?? null;
    const part = event.choices?.[0]?.delta;
    if (part?.audio?.data) chunks.push(part.audio.data);
    if (part?.content) text += part.content;
  };

  const decoder = new TextDecoder();
  for await (const piece of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(piece, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(handle);
  }
  handle(buffer);
  return { audio: decode(chunks), generationId, text: text.trim() };
}

export async function compose(
  apiKey: string,
  request: { model: string; prompt: string; seed?: number; image?: string },
): Promise<AudioResult> {
  const content = request.image
    ? [{ type: "text", text: request.prompt }, { type: "image_url", image_url: { url: request.image } }]
    : request.prompt;
  const response = await post(apiKey, "/chat/completions", {
    model: request.model,
    messages: [{ role: "user", content }],
    modalities: ["text", "audio"],
    stream: true,
    ...(request.seed === undefined ? {} : { seed: request.seed }),
  });
  if (response.headers.get("content-type")?.includes("json")) {
    const event = (await response.json()) as ChatEvent;
    if (event.error) throw explain(event.error.code ?? 502, event.error.message ?? null);
    const message = event.choices?.[0]?.message;
    return {
      audio: decode(message?.audio?.data ? [message.audio.data] : []),
      generationId: event.id ?? null,
      text: message?.content?.trim() ?? "",
    };
  }
  if (!response.body) throw new GenerateError("failed", "OpenRouter sent back nothing.");
  return readAudioEvents(response.body);
}
