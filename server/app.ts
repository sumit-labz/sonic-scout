import { execFile } from "node:child_process";
import type { ReadableStream as WebStream } from "node:stream/web";
import { Hono, type Context } from "hono";
import type { StatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { AppStatus, Interpretation, Sound } from "../shared/types";
import { fileStream, MAX_FILE_BYTES, parseRange, type AudioCache, type CachedAudio } from "./cache/audioCache";
import type { Config } from "./config";
import { DownloadError, downloadSound } from "./download/download";
import { ProviderError, retryAfter } from "./http";
import type { ClaudeInterpreter } from "./interpret/claude";
import { interpretWithRules } from "./interpret/rules";
import type { LicencePolicy } from "./licence/classify";
import type { LocalLibrary } from "./providers/local";
import type { FreesoundAuth } from "./providers/freesound";
import { isAllowedAudioHost } from "./providers/registry";
import type { SoundProvider } from "./providers/types";
import type { SearchEngine } from "./search/engine";
import { Store, StoreError } from "./store/store";

export interface AppDeps {
  audioCache?: AudioCache;
  local?: LocalLibrary;
  config: Config;
  store: Store;
  engine: SearchEngine;
  providers: SoundProvider[];
  freesound: FreesoundAuth;
  policy: LicencePolicy;
  claude: ClaudeInterpreter | null;
}

const SearchBody = z.object({
  prompt: z.string().trim().min(2).max(1000),
  filters: z
    .object({
      licence: z.enum(["cleared", "no-credit", "credit"]).default("cleared"),
      losslessOnly: z.boolean().default(false),
      downloadableOriginalOnly: z.boolean().default(false),
      includeUnreviewed: z.boolean().default(false),
    })
    .default({ licence: "cleared", losslessOnly: false, downloadableOriginalOnly: false, includeUnreviewed: false }),
});

const SoundBody = z.object({ sound: z.custom<Sound>((value) => typeof value === "object" && value !== null) });
const NameBody = z.object({ name: z.string().trim().min(1).max(120) });
const ProjectBody = NameBody.extend({ collections: z.array(z.string().trim().min(1).max(120)).max(30).default([]) });
const DownloadBody = z.object({
  provider: z.string(),
  nativeId: z.string(),
  projectId: z.string().optional(),
  collectionId: z.string().optional(),
  allowPreview: z.boolean().optional(),
});

const FolderBody = z.object({
  path: z.string().trim().min(1).max(1000),
  name: z.string().trim().max(120).optional(),
  licence: z.enum(["sonniss-gdc", "own", "cc0", "cc-by", "custom", "unsure"]),
  creator: z.string().trim().max(200).optional(),
  sourceUrl: z.string().trim().max(1000).optional(),
  customLabel: z.string().trim().max(120).optional(),
  customUrl: z.string().trim().max(1000).optional(),
  confirmed: z.boolean().default(false),
});

const AUDIO_CACHE_CONTROL = "private, max-age=604800";
const CACHEABLE_DOWNLOAD_MS = 5 * 60 * 1000;
const AUDIO_TYPE = /^(audio\/|application\/ogg)/i;
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

async function interpret(deps: AppDeps, prompt: string): Promise<Interpretation> {
  if (!deps.claude) return interpretWithRules(prompt);
  try {
    return await deps.claude.interpret(prompt);
  } catch (error) {
    console.error("Claude interpretation failed:", error);
    return { ...interpretWithRules(prompt), note: "Claude was unavailable, so the built-in reader was used." };
  }
}

function pickFolder(): Promise<string | null> {
  if (process.platform !== "win32") return Promise.resolve(null);
  const script = `Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = 'Choose a folder'
$w = New-Object System.Windows.Forms.Form
$w.TopMost = $true
if ($f.ShowDialog($w) -eq 'OK') { [Console]::OutputEncoding = [Text.Encoding]::UTF8; Write-Output $f.SelectedPath }`;
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-STA", "-Command", script], { timeout: 5 * 60_000 }, (error, stdout) => {
      resolve(error ? null : stdout.trim() || null);
    });
  });
}

export function createApp(deps: AppDeps): Hono {
  const { config, store, engine, providers, freesound, policy, audioCache, local } = deps;
  const app = new Hono();

  // This server can write files and open dialogs, so only this machine's own
  // pages may talk to it. The Host check also stops DNS rebinding.
  app.use("*", async (c, next) => {
    if (!LOOPBACK.test(c.req.header("host") ?? "")) return c.json({ error: "Forbidden", code: "forbidden" }, 403);
    const origin = c.req.header("origin");
    if (origin && !LOOPBACK.test(hostOf(origin))) return c.json({ error: "Forbidden", code: "forbidden" }, 403);
    await next();
  });

  app.onError((error, c) => {
    if (error instanceof DownloadError) {
      return c.json({ error: error.message, code: error.code }, error.status as never);
    }
    if (error instanceof StoreError) return c.json({ error: error.message, code: "not_found" }, 404);
    if (error instanceof ProviderError) {
      const status = error.kind === "rate_limited" ? 429 : 502;
      return c.json({ error: error.message, code: error.kind }, status);
    }
    if (error instanceof z.ZodError) return c.json({ error: "Invalid request.", code: "invalid" }, 400);
    console.error(error);
    return c.json({ error: "Something went wrong.", code: "internal" }, 500);
  });

  app.get("/api/status", async (c) => {
    const status: AppStatus = {
      interpreter: deps.claude ? "claude" : "rules",
      model: deps.claude ? config.model : null,
      providers: providers.map((provider) => ({
        id: provider.id,
        label: provider.label,
        enabled: provider.disabledReason() === null,
        reason: provider.disabledReason(),
        originals: provider.originals(),
        reviewed: provider.reviewed,
      })),
      freesoundLogin: {
        available: Boolean(config.freesoundKey && config.freesoundClientId),
        connected: await freesound.isConnected(),
      },
      shareAlikeAllowed: policy.allowShareAlike,
    };
    return c.json(status);
  });

  app.post("/api/search", async (c) => {
    const body = SearchBody.parse(await c.req.json());
    return c.json(await engine.search(await interpret(deps, body.prompt), body.filters));
  });

  app.get("/api/audio", async (c) => proxyAudio(c));

  /** Hosts that told us to back off. Going straight back would only make things worse for everyone. */
  const audioCooldown = new Map<string, number>();

  async function proxyAudio(c: Context): Promise<Response> {
    const requested = c.req.query("u") ?? "";
    const range = c.req.header("range");
    let target = requested;
    for (let hop = 0; hop < 5; hop++) {
      let url: URL;
      try {
        url = new URL(target);
      } catch {
        return c.json({ error: "Bad audio URL.", code: "invalid" }, 400);
      }
      if (url.protocol !== "https:" || !isAllowedAudioHost(url.hostname)) {
        return c.json({ error: "That host is not a known sound library.", code: "forbidden" }, 403);
      }
      if (hop === 0) {
        const cached = await audioCache?.get(requested);
        if (cached) return serveCachedAudio(cached, range);
      }
      const until = audioCooldown.get(url.hostname) ?? 0;
      if (until > Date.now()) {
        const seconds = Math.ceil((until - Date.now()) / 1000);
        return new Response(null, { status: 429, headers: { "Retry-After": String(seconds), "Cache-Control": "no-store" } });
      }
      // A request from the top can be saved whole. Anything else is a seek, so it goes straight through.
      const fromStart = !range || range === "bytes=0-";
      const upstream = await fetch(url, {
        redirect: "manual",
        headers: { "User-Agent": config.userAgent, ...(range && !fromStart ? { Range: range } : {}) },
        // A download worth keeping carries on if the page moves away, so the time isn't wasted.
        signal: audioCache && fromStart ? AbortSignal.timeout(CACHEABLE_DOWNLOAD_MS) : c.req.raw.signal,
      });
      if (upstream.status === 429) audioCooldown.set(url.hostname, Date.now() + (retryAfter(upstream) ?? 60) * 1000);
      const location = upstream.headers.get("location");
      if (upstream.status >= 300 && upstream.status < 400 && location) {
        target = new URL(location, url).toString();
        continue;
      }
      // Never let the browser hold on to a failure such as a 429.
      const headers = new Headers({ "Cache-Control": upstream.ok ? AUDIO_CACHE_CONTROL : "no-store" });
      for (const name of ["content-type", "content-length", "content-range", "accept-ranges"]) {
        const value = upstream.headers.get(name);
        if (value) headers.set(name, value);
      }
      let body = upstream.body;
      const contentType = upstream.headers.get("content-type") ?? "";
      const declared = Number(upstream.headers.get("content-length") ?? 0);
      if (audioCache && body && fromStart && upstream.status === 200 && AUDIO_TYPE.test(contentType) && declared <= MAX_FILE_BYTES) {
        const [toClient, toDisk] = body.tee();
        body = toClient;
        void audioCache.put(requested, toDisk as WebStream, contentType, declared || null);
      }
      return new Response(body, { status: upstream.status as StatusCode & number, headers });
    }
    return c.json({ error: "Too many redirects.", code: "upstream" }, 502);
  }

  function serveCachedAudio(audio: CachedAudio, rangeHeader: string | undefined, cacheControl = AUDIO_CACHE_CONTROL): Response {
    const headers = new Headers({ "Cache-Control": cacheControl, "Content-Type": audio.contentType, "Accept-Ranges": "bytes" });
    const range = rangeHeader ? parseRange(rangeHeader, audio.size) : null;
    if (rangeHeader && !range) {
      headers.set("Content-Range", `bytes */${audio.size}`);
      return new Response(null, { status: 416, headers });
    }
    if (!range) {
      headers.set("Content-Length", String(audio.size));
      return new Response(fileStream(audio.path), { headers });
    }
    headers.set("Content-Length", String(range.end - range.start + 1));
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${audio.size}`);
    return new Response(fileStream(audio.path, range), { status: 206, headers });
  }

  if (local) {
    app.get("/api/local/audio/:folder/:file", async (c) => {
      // These are the user's own files, so another site must not be able to embed them.
      const site = c.req.header("sec-fetch-site");
      if (site && site !== "same-origin" && site !== "none") return c.json({ error: "Forbidden", code: "forbidden" }, 403);
      const file = await local.locate(c.req.param("folder"), c.req.param("file"));
      if (!file) return c.json({ error: "That file is no longer available.", code: "not_found" }, 404);
      return serveCachedAudio(file, c.req.header("range"), "no-store");
    });

    app.post("/api/local/folders", async (c) => {
      await local.addFolder(FolderBody.parse(await c.req.json()));
      return c.json(store.snapshot());
    });

    app.post("/api/local/folders/:folder/rescan", async (c) => {
      await local.rescan(c.req.param("folder"));
      return c.json(store.snapshot());
    });

    app.delete("/api/local/folders/:folder", async (c) => {
      await local.removeFolder(c.req.param("folder"));
      return c.json(store.snapshot());
    });
  }

  app.get("/api/library", (c) => c.json(store.snapshot()));

  app.put("/api/library/download-root", async (c) => {
    const { path } = z.object({ path: z.string().trim().min(1).max(500) }).parse(await c.req.json());
    await store.setDownloadRoot(path);
    return c.json(store.snapshot());
  });

  app.post("/api/pick-folder", async (c) => c.json({ path: await pickFolder() }));

  app.post("/api/favourites", async (c) => {
    await store.toggleFavourite(SoundBody.parse(await c.req.json()).sound);
    return c.json(store.snapshot());
  });

  app.post("/api/projects", async (c) => {
    const body = ProjectBody.parse(await c.req.json());
    await store.createProject(body.name, body.collections);
    return c.json(store.snapshot());
  });

  app.delete("/api/projects/:project", async (c) => {
    await store.deleteProject(c.req.param("project"));
    return c.json(store.snapshot());
  });

  app.post("/api/projects/:project/collections", async (c) => {
    await store.addCollection(c.req.param("project"), NameBody.parse(await c.req.json()).name);
    return c.json(store.snapshot());
  });

  app.delete("/api/projects/:project/collections/:collection", async (c) => {
    await store.deleteCollection(c.req.param("project"), c.req.param("collection"));
    return c.json(store.snapshot());
  });

  app.post("/api/projects/:project/collections/:collection/items", async (c) => {
    const { sound } = SoundBody.parse(await c.req.json());
    await store.addToCollection(c.req.param("project"), c.req.param("collection"), sound);
    return c.json(store.snapshot());
  });

  app.delete("/api/projects/:project/collections/:collection/items", async (c) => {
    const { soundId } = z.object({ soundId: z.string() }).parse(await c.req.json());
    await store.removeFromCollection(c.req.param("project"), c.req.param("collection"), soundId);
    return c.json(store.snapshot());
  });

  app.post("/api/download", async (c) => {
    const request = DownloadBody.parse(await c.req.json());
    const { record, alreadyHad } = await downloadSound({ request, providers, store, policy });
    return c.json({ ok: true, record, alreadyHad });
  });

  app.get("/api/freesound/oauth/start", (c) => {
    if (!config.freesoundClientId) return c.text("Set FREESOUND_CLIENT_ID first.", 400);
    return c.redirect(freesound.authorizeUrl());
  });

  app.get("/api/freesound/oauth/callback", async (c) => {
    const code = c.req.query("code");
    if (!code) return c.text("Freesound login was cancelled.", 400);
    await freesound.exchange(code, c.req.query("state") ?? "");
    return c.redirect("/?freesound=connected");
  });

  return app;
}
