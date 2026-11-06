import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReadableStream as WebStream } from "node:stream/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../server/app";
import { AudioCache, parseRange } from "../server/cache/audioCache";
import { FRESH_MS, SearchCache, STALE_MS } from "../server/cache/searchCache";
import type { Config } from "../server/config";
import { ProviderError } from "../server/http";
import { interpretWithRules } from "../server/interpret/rules";
import type { FreesoundAuth } from "../server/providers/freesound";
import type { SoundProvider } from "../server/providers/types";
import { createEngine } from "../server/search/engine";
import { Store } from "../server/store/store";
import type { SearchFilters, Sound } from "../shared/types";

const LOCAL = { host: "localhost:5178" };
const filters: SearchFilters = { licence: "cleared", losslessOnly: false, downloadableOriginalOnly: false, includeUnreviewed: false };
const reading = { ...interpretWithRules("door"), queries: ["door"] };
const audioUrl = "https://cdn.freesound.org/previews/1/1-hq.mp3";

function provider(search: SoundProvider["search"]): SoundProvider {
  return {
    id: "openverse",
    label: "Test",
    reviewed: true,
    originals: "",
    disabledReason: () => null,
    search,
    getSound: async () => { throw new Error("unused"); },
    originalDownload: async () => null,
  } as unknown as SoundProvider;
}

function bodyOf(text: string) {
  return new Response(text).body as unknown as WebStream;
}

describe("search cache", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "sonic-cache-"));
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(root, { recursive: true, force: true });
  });

  it("survives a restart", async () => {
    const file = join(root, "cache", "search.json");
    const first = new SearchCache(file);
    first.write("key", []);
    await first.flush();
    expect(new SearchCache(file).read("key")).toEqual({ sounds: [], fresh: true });
  });

  it("ignores a damaged file", () => {
    const file = join(root, "search.json");
    writeFileSync(file, "{not json");
    expect(new SearchCache(file).read("key")).toBeNull();
  });

  it("ages from fresh to stale to gone", () => {
    vi.useFakeTimers();
    const cache = new SearchCache();
    cache.write("key", []);
    vi.advanceTimersByTime(FRESH_MS + 1);
    expect(cache.read("key")?.fresh).toBe(false);
    vi.advanceTimersByTime(STALE_MS);
    expect(cache.read("key")).toBeNull();
  });

  it("serves stale answers at once and refreshes behind the scenes", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const engine = createEngine([provider(async () => { calls++; return []; })], { allowShareAlike: false });
    await engine.search(reading, filters);
    vi.advanceTimersByTime(FRESH_MS + 1);
    await engine.search(reading, filters);
    expect(calls).toBe(2);
  });

  it("does not cache failures", async () => {
    let calls = 0;
    const engine = createEngine(
      [provider(async () => { calls++; throw new Error("down"); })],
      { allowShareAlike: false },
    );
    await engine.search(reading, filters);
    expect((await engine.search(reading, filters)).sources[0]?.status).toBe("error");
    expect(calls).toBe(2);
  });

  it("keeps answering from cache during a rate limit", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const engine = createEngine(
      [provider(async () => {
        if (++calls > 1) throw new ProviderError("rate_limited", "Slow down.", 120);
        return [];
      })],
      { allowShareAlike: false },
    );
    await engine.search(reading, filters);
    vi.advanceTimersByTime(FRESH_MS + 1);
    await engine.search(reading, filters);
    await vi.advanceTimersByTimeAsync(0);
    expect((await engine.search(reading, filters)).sources[0]?.status).toBe("ok");
    expect(calls).toBe(2);
  });

  it("gates cached results again, so a cached licence can't slip through", async () => {
    const blocked = { id: "x", licence: { code: "cc-by-nc", label: "CC BY-NC 4.0", conflict: null, commercialUse: false } } as unknown as Sound;
    const cache = new SearchCache();
    cache.write("openverse:door", [blocked]);
    const engine = createEngine([provider(async () => [])], { allowShareAlike: false }, cache);
    const response = await engine.search(reading, filters);
    expect(response.results).toHaveLength(0);
    expect(response.blocked.total).toBe(1);
  });
});

describe("audio cache", () => {
  let root: string;
  let cache: AudioCache;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "sonic-audio-"));
    cache = new AudioCache(join(root, "audio"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(root, { recursive: true, force: true });
  });

  function app() {
    const policy = { allowShareAlike: false };
    return createApp({
      config: { freesoundKey: null, freesoundClientId: null, model: "m", userAgent: "test" } as Config,
      store: new Store(join(root, "data"), join(root, "out")),
      engine: createEngine([], policy),
      providers: [],
      freesound: { isConnected: async () => false } as FreesoundAuth,
      policy,
      claude: null,
      audioCache: cache,
    });
  }

  const request = (headers: Record<string, string> = {}, url = audioUrl) =>
    app().request(`/api/audio?u=${encodeURIComponent(url)}`, { headers: { ...LOCAL, ...headers } });

  it("reads ranges", () => {
    expect(parseRange("bytes=0-", 10)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=2-4", 10)).toEqual({ start: 2, end: 4 });
    expect(parseRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
    expect(parseRange("bytes=20-", 10)).toBeNull();
    expect(parseRange("nonsense", 10)).toBeNull();
  });

  it("drops an incomplete download", async () => {
    await cache.put(audioUrl, bodyOf("short"), "audio/mpeg", 999);
    expect(await cache.get(audioUrl)).toBeNull();
    expect(readdirSync(join(root, "audio")).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("fetches audio once, then serves it from disk with ranges", async () => {
    const fetchSpy = vi.fn(async () => new Response("0123456789", { headers: { "content-type": "audio/mpeg", "content-length": "10" } }));
    vi.stubGlobal("fetch", fetchSpy);
    expect(await (await request()).text()).toBe("0123456789");
    await vi.waitFor(async () => expect(await cache.get(audioUrl)).not.toBeNull());

    const whole = await request();
    expect(await whole.text()).toBe("0123456789");
    expect(whole.headers.get("content-type")).toBe("audio/mpeg");

    const part = await request({ range: "bytes=2-4" });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 2-4/10");
    expect(await part.text()).toBe("234");
    expect((await request({ range: "bytes=50-" })).status).toBe(416);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("never stores or lets the browser keep a failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("slow down", { status: 429, headers: { "content-type": "text/html" } })));
    const response = await request();
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await cache.get(audioUrl)).toBeNull();
  });

  it("backs off a host that asks it to, while cached audio keeps playing", async () => {
    await cache.put(audioUrl, bodyOf("cached"), "audio/mpeg", 6);
    const fetchSpy = vi.fn(async () => new Response(null, { status: 429, headers: { "retry-after": "600" } }));
    vi.stubGlobal("fetch", fetchSpy);
    const server = app();
    const get = (url: string) => server.request(`/api/audio?u=${encodeURIComponent(url)}`, { headers: LOCAL });
    const other = "https://cdn.freesound.org/previews/2/2-hq.mp3";
    expect((await get(other)).status).toBe(429);
    const second = await get(other);
    expect(second.status).toBe(429);
    expect(Number(second.headers.get("retry-after"))).toBeGreaterThan(590);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await (await get(audioUrl)).text()).toBe("cached");
  });

  it("does not store pages pretending to be audio", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { headers: { "content-type": "text/html" } })));
    await (await request()).text();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(existsSync(join(root, "audio"))).toBe(false);
  });

  it("still refuses other hosts before looking in the cache", async () => {
    const evil = "https://evil.test/a.mp3";
    await cache.put(evil, bodyOf("x"), "audio/mpeg", 1);
    expect(readFileSync((await cache.get(evil))!.path, "utf8")).toBe("x");
    expect((await request({}, evil)).status).toBe(403);
  });
});
