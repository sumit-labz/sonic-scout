import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../server/app";
import type { Config } from "../server/config";
import type { FreesoundAuth } from "../server/providers/freesound";
import { createEngine } from "../server/search/engine";
import { Store } from "../server/store/store";

const LOCAL = { host: "localhost:5178" };

describe("HTTP API", () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "sonic-scout-"));
    const policy = { allowShareAlike: false };
    app = createApp({
      config: { freesoundKey: null, freesoundClientId: null, model: "m", userAgent: "test" } as Config,
      store: new Store(join(root, "data"), join(root, "out")),
      engine: createEngine([], policy),
      providers: [],
      freesound: { isConnected: async () => false } as FreesoundAuth,
      policy,
      claude: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(root, { recursive: true, force: true });
  });

  it("answers its own pages", async () => {
    expect((await app.request("/api/status", { headers: LOCAL })).status).toBe(200);
  });

  it("refuses other sites and DNS rebinding", async () => {
    const crossSite = await app.request("/api/download", {
      method: "POST",
      headers: { ...LOCAL, origin: "https://evil.test" },
      body: "{}",
    });
    expect(crossSite.status).toBe(403);
    expect((await app.request("/api/status", { headers: { host: "evil.test" } })).status).toBe(403);
  });

  it("validates search input", async () => {
    const response = await app.request("/api/search", {
      method: "POST",
      headers: { ...LOCAL, "content-type": "application/json" },
      body: JSON.stringify({ prompt: "" }),
    });
    expect(response.status).toBe(400);
  });

  it("refuses to proxy anything but sound libraries", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    for (const url of ["http://169.254.169.254/latest", "https://localhost/x", "https://evil.test/a.mp3", "http://archive.org/a.mp3"]) {
      const response = await app.request(`/api/audio?u=${encodeURIComponent(url)}`, { headers: LOCAL });
      expect(response.status).toBe(403);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("re-checks hosts on redirects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://evil.test/x" } })));
    const url = encodeURIComponent("https://archive.org/download/a/b.mp3");
    expect((await app.request(`/api/audio?u=${url}`, { headers: LOCAL })).status).toBe(403);
  });

  it("creates a project with collections", async () => {
    const response = await app.request("/api/projects", {
      method: "POST",
      headers: { ...LOCAL, "content-type": "application/json" },
      body: JSON.stringify({ name: "The Man Inside His Head", collections: ["Human Body"] }),
    });
    const library = (await response.json()) as { projects: Array<{ name: string; collections: unknown[] }> };
    expect(library.projects[0]).toMatchObject({ name: "The Man Inside His Head" });
    expect(library.projects[0]?.collections).toHaveLength(1);
  });
});
