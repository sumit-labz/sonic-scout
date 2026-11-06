import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estimateCost, formatCost, lyriaPrompt } from "../shared/generate";
import { createApp } from "../server/app";
import type { Config } from "../server/config";
import { downloadSound } from "../server/download/download";
import { detectAudio, readAudioEvents } from "../server/generate/openrouter";
import { Studio } from "../server/generate/studio";
import { isCleared, refusalReason } from "../server/licence/classify";
import type { FreesoundAuth } from "../server/providers/freesound";
import { createEngine } from "../server/search/engine";
import { Store } from "../server/store/store";

const LOCAL = { host: "localhost:5178", "content-type": "application/json" };
const MP3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(40, 7)]);
const policy = { allowShareAlike: false };

function events(...lines: string[]) {
  return new Response(lines.map((line) => `${line}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
}

const audioEvent = (data: string, id = "gen-1") => `data: ${JSON.stringify({ id, choices: [{ delta: { audio: { data } } }] })}`;

describe("audio helpers", () => {
  it("recognises formats from the bytes", () => {
    expect(detectAudio(MP3)?.format).toBe("mp3");
    expect(detectAudio(Buffer.from([0xff, 0xfb, 0x90, 0]))?.format).toBe("mp3");
    expect(detectAudio(Buffer.from("RIFF....WAVEfmt "))?.format).toBe("wav");
    expect(detectAudio(Buffer.from("OggS...."))?.format).toBe("ogg");
    expect(detectAudio(Buffer.from("not audio at all"))).toBeNull();
  });

  it("joins audio split across events, whichever way it was split", async () => {
    const whole = MP3.toString("base64");
    const split = await readAudioEvents(events(`: OPENROUTER PROCESSING`, audioEvent(whole.slice(0, 8)), audioEvent(whole.slice(8)), "data: [DONE]").body!);
    expect(split.audio.equals(MP3)).toBe(true);
    expect(split.generationId).toBe("gen-1");

    const separate = await readAudioEvents(events(audioEvent(Buffer.from("ab").toString("base64")), audioEvent(Buffer.from("cd").toString("base64"))).body!);
    expect(separate.audio.toString()).toBe("abcd");
  });

  it("keeps words sent with the audio", async () => {
    const result = await readAudioEvents(events(`data: ${JSON.stringify({ choices: [{ delta: { content: "Verse one" } }] })}`).body!);
    expect(result.text).toBe("Verse one");
  });

  it("surfaces an error that arrives mid-stream", async () => {
    const stream = events(`data: ${JSON.stringify({ error: { code: 402, message: "Out" } })}`).body!;
    await expect(readAudioEvents(stream)).rejects.toMatchObject({ code: "no_credits" });
  });

  it("builds a readable Lyria prompt", () => {
    expect(lyriaPrompt({ generator: "lyria-clip", prompt: "A sad piano theme.", mood: "Tender", instruments: "Felt piano", bpm: 72, instrumental: true }))
      .toBe("A sad piano theme. Mood: Tender. Instruments: Felt piano. Tempo: 72 BPM. Instrumental only, no vocals.");
  });

  it("estimates cost from listed prices", () => {
    expect(estimateCost({ generator: "lyria-clip", prompt: "x", instrumental: false })).toBe(0.04);
    expect(estimateCost({ generator: "eleven-v4", text: "x".repeat(1000), voice: "george" })).toBeCloseTo(0.08);
    expect(estimateCost({ generator: "drama-3", text: "é", instructions: "" })).toBeCloseTo(0.000004);
    expect(formatCost(0.0001)).toBe("under $0.01");
    expect(formatCost(0.08)).toBe("about $0.08");
  });
});

describe("studio", () => {
  let root: string;
  let store: Store;
  let studio: Studio;
  let app: ReturnType<typeof createApp>;

  const post = (body: unknown) =>
    app.request("/api/generate", { method: "POST", headers: LOCAL, body: JSON.stringify(body) });
  const lyria = { generator: "lyria-clip", prompt: "A sad piano theme", instrumental: true };
  const eleven = { generator: "eleven-v4", text: "[sighs] Hello there", voice: "george" };

  function build(key: string | null = "test-key") {
    studio = new Studio(store, join(root, "data"), key);
    app = createApp({
      config: { freesoundKey: null, freesoundClientId: null, model: "m", userAgent: "test" } as Config,
      store,
      engine: createEngine([], policy),
      providers: [studio.provider],
      freesound: { isConnected: async () => false } as FreesoundAuth,
      policy,
      claude: null,
      studio,
    });
  }

  const speech = () => new Response(MP3, { headers: { "content-type": "audio/mpeg", "x-generation-id": "gen-9" } });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "sonic-generate-"));
    store = new Store(join(root, "data"), join(root, "out"));
    build();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(root, { recursive: true, force: true });
  });

  it("sends Eleven v4 its text and voice and keeps the file", async () => {
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) => speech());
    vi.stubGlobal("fetch", fetchSpy);
    const sound = (await (await post(eleven)).json()) as { nativeId: string; title: string; previewUrl: string };

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/audio/speech");
    expect(JSON.parse(init.body as string)).toEqual({ model: "elevenlabs/eleven-v4", input: "[sighs] Hello there", voice: "george", response_format: "mp3" });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(sound.title).toBe("Hello there");

    const audio = await app.request(sound.previewUrl, { headers: LOCAL });
    expect(Buffer.from(await audio.arrayBuffer()).equals(MP3)).toBe(true);
    expect(audio.headers.get("content-type")).toBe("audio/mpeg");
  });

  it("sends Drama 3 its direction and leaves out a blank voice", async () => {
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) => speech());
    vi.stubGlobal("fetch", fetchSpy);
    expect((await post({ generator: "drama-3", text: "[nervous] Hello", instructions: "Tired", voice: "" })).status).toBe(200);
    expect(JSON.parse(fetchSpy.mock.calls[0]![1].body as string)).toEqual({ model: "fish-audio/drama-3", input: "[nervous] Hello", instructions: "Tired", response_format: "mp3" });
  });

  it("asks Lyria for streamed audio, with its seed and picture", async () => {
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) => events(audioEvent(MP3.toString("base64"))));
    vi.stubGlobal("fetch", fetchSpy);
    const image = "data:image/png;base64,AAAA";
    expect((await post({ ...lyria, seed: 7, image })).status).toBe(200);
    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
    expect(fetchSpy.mock.calls[0]![0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(body).toMatchObject({ model: "google/lyria-3-clip-preview", stream: true, modalities: ["text", "audio"], seed: 7 });
    expect(body.messages[0].content[1]).toEqual({ type: "image_url", image_url: { url: image } });
  });

  it("reads a non-streamed Lyria answer too", async () => {
    const answer = { id: "gen-2", choices: [{ message: { audio: { data: MP3.toString("base64") } } }] };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(answer)));
    expect((await post(lyria)).status).toBe(200);
  });

  it("never retries, because every call costs money", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchSpy);
    expect((await post(eleven)).status).toBe(502);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("refuses a second take while one is running", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const first = post(eleven);
    await vi.waitFor(() => expect(finish).toBeDefined());
    expect((await post(eleven)).status).toBe(409);
    finish(speech());
    expect((await first).status).toBe(200);
  });

  it("explains billing and key problems", async () => {
    const respond = (status: number) => vi.fn(async () => Response.json({ error: { code: status, message: "x" } }, { status }));
    vi.stubGlobal("fetch", respond(402));
    expect(await (await post(eleven)).json()).toMatchObject({ code: "no_credits" });
    vi.stubGlobal("fetch", respond(401));
    expect(await (await post(eleven)).json()).toMatchObject({ code: "bad_key" });
  });

  it("saves nothing when the audio can't be recognised", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>nope</html>")));
    expect(await (await post(eleven)).json()).toMatchObject({ code: "unknown_format" });
    expect(store.snapshot().generations).toEqual([]);
  });

  it("needs a key and never calls out without one", async () => {
    build(null);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await (await post(eleven)).json()).toMatchObject({ code: "no_key" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects bad input before spending anything", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await post({ ...eleven, voice: "someone-famous" })).status).toBe(400);
    expect((await post({ ...eleven, text: "x".repeat(10_001) })).status).toBe(400);
    expect((await post({ ...lyria, image: "https://evil.test/a.png" })).status).toBe(400);
    expect((await post({ generator: "drama-3", text: "Hello", voice: "../../etc" })).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never reports a key in status", async () => {
    const text = await (await app.request("/api/status", { headers: LOCAL })).text();
    expect(text).not.toContain("test-key");
    expect(JSON.parse(text).generation.available).toBe(true);
    expect(JSON.parse(text).providers).toEqual([]);
  });

  it("never calls a generated sound cleared, but lets it be saved", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => speech()));
    const sound = await studio.generate({ generator: "eleven-v4", text: "Hello", voice: "george" });
    expect(isCleared(sound.licence, policy)).toBe(false);
    expect(sound.licence.commercialUse).toBe(false);
    expect(refusalReason(sound.licence, policy)).toBeNull();
    expect(await studio.provider.search({ query: "hello", limit: 20 })).toEqual([]);
  });

  it("records a saved take honestly, with identical bytes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => speech()));
    const sound = await studio.generate({ generator: "eleven-v4", text: "Hello there", voice: "george" });
    const { record } = await downloadSound({
      request: { provider: "generated", nativeId: sound.nativeId },
      providers: [studio.provider],
      store,
      policy,
    });
    expect(readFileSync(record.path).equals(MP3)).toBe(true);
    const inventory = readFileSync(join(root, "out", "Unsorted", "sonic-scout-inventory.csv"), "utf8");
    expect(inventory).toContain("AI-generated, rights not verified");
    expect(inventory).toContain("not verified");
    expect(inventory).toContain("prompt: Hello there");
    expect(inventory).toContain("gen-9");
  });

  it("deletes the file with the take", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => speech()));
    const sound = await studio.generate({ generator: "eleven-v4", text: "Hello", voice: "george" });
    const dir = join(root, "data", "generated");
    expect(readdirSync(dir)).toHaveLength(1);
    await app.request(`/api/generated/${sound.nativeId}`, { method: "DELETE", headers: LOCAL });
    expect(readdirSync(dir)).toHaveLength(0);
    expect((await app.request(sound.previewUrl, { headers: LOCAL })).status).toBe(404);
    expect(existsSync(join(dir, `${sound.nativeId}.mp3`))).toBe(false);
  });

  it("serves only known takes, and not to other sites", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => speech()));
    const sound = await studio.generate({ generator: "eleven-v4", text: "Hello", voice: "george" });
    expect((await app.request("/api/generated/..%2F..%2Flibrary/audio", { headers: LOCAL })).status).toBe(404);
    const crossSite = await app.request(sound.previewUrl, { headers: { ...LOCAL, "sec-fetch-site": "cross-site" } });
    expect(crossSite.status).toBe(403);
  });
});
