import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../server/app";
import type { Config } from "../server/config";
import { downloadSound } from "../server/download/download";
import { interpretWithRules } from "../server/interpret/rules";
import { folderLicence, isCleared } from "../server/licence/classify";
import type { FreesoundAuth } from "../server/providers/freesound";
import { LocalLibrary, type FolderInput } from "../server/providers/local";
import { createEngine } from "../server/search/engine";
import { Store } from "../server/store/store";
import type { Library, SearchFilters, SoundFolder } from "../shared/types";

const LOCAL = { host: "localhost:5178" };
const filters: SearchFilters = { licence: "cleared", losslessOnly: false, downloadableOriginalOnly: false, includeUnreviewed: false };
const policy = { allowShareAlike: false };

/** A real PCM WAV: 48 kHz, 24-bit mono. */
function wav(seconds: number): Buffer {
  const dataSize = Math.round(48000 * 3 * seconds);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVEfmt ", 8, "latin1");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(48000, 24);
  header.writeUInt32LE(48000 * 3, 28);
  header.writeUInt16LE(3, 32);
  header.writeUInt16LE(24, 34);
  header.write("data", 36, "latin1");
  header.writeUInt32LE(dataSize, 40);
  const body = Buffer.alloc(dataSize);
  for (let index = 0; index < dataSize; index++) body[index] = index % 251;
  return Buffer.concat([header, body]);
}

/** Just enough FLAC: the magic number and a STREAMINFO block for 3 seconds at 44.1 kHz, 16-bit. */
function flac(): Buffer {
  const file = Buffer.alloc(64);
  file.write("fLaC", 0, "latin1");
  file[18] = 44100 >> 12;
  file[19] = (44100 >> 4) & 0xff;
  file[20] = ((44100 & 0x0f) << 4) | 0x00 | ((15 >> 4) & 1);
  file[21] = (15 & 0x0f) << 4;
  file.writeUInt32BE(44100 * 3, 22);
  return file;
}

function folderOf(overrides: Partial<SoundFolder>): SoundFolder {
  return {
    id: "f",
    name: "Pack",
    path: "/nowhere",
    licence: "unsure",
    creator: null,
    sourceUrl: null,
    customLabel: null,
    customUrl: null,
    confirmedAt: "2026-11-06T10:00:00.000Z",
    fileCount: 0,
    scannedAt: "2026-11-06T10:00:00.000Z",
    truncated: false,
    ...overrides,
  };
}

describe("folderLicence", () => {
  const cleared = (overrides: Partial<SoundFolder>) => isCleared(folderLicence(folderOf(overrides)), policy);

  it("clears only a confirmed, complete declaration", () => {
    expect(cleared({ licence: "sonniss-gdc" })).toBe(true);
    expect(cleared({ licence: "own" })).toBe(true);
    expect(cleared({ licence: "cc0" })).toBe(true);
    expect(cleared({ licence: "custom", customLabel: "Pack licence", customUrl: "https://example.org/licence" })).toBe(true);
    expect(cleared({ licence: "cc-by", creator: "A Recordist", sourceUrl: "https://example.org/pack" })).toBe(true);

    expect(cleared({ licence: "unsure" })).toBe(false);
    expect(cleared({ licence: "sonniss-gdc", confirmedAt: null })).toBe(false);
    expect(cleared({ licence: "cc-by" })).toBe(false);
    expect(cleared({ licence: "custom", customLabel: "Pack licence" })).toBe(false);
    expect(cleared({ licence: "custom", customLabel: "Pack licence", customUrl: "javascript:alert(1)" })).toBe(false);
  });

  it("records the declaration as a declaration", () => {
    const licence = folderLicence(folderOf({ licence: "sonniss-gdc" }));
    expect(licence).toMatchObject({ label: "Sonniss GDC licence", url: "https://sonniss.com/gdc-bundle-license", attributionRequired: false });
    expect(licence.evidence.rawValue).toBe("Sonniss GDC licence, declared by you on 2026-11-06");
    expect(licence.evidence.field).toBe("your folder settings");
  });

  it("keeps the credit duty of CC BY", () => {
    expect(folderLicence(folderOf({ licence: "cc-by", creator: "A", sourceUrl: "https://example.org" })).attributionRequired).toBe(true);
  });
});

describe("LocalLibrary", () => {
  let root: string;
  let pack: string;
  let store: Store;
  let local: LocalLibrary;
  const providers = () => [local.provider];

  const sonniss = (path = pack): FolderInput => ({ path, licence: "sonniss-gdc", confirmed: true });

  function app() {
    return createApp({
      config: { freesoundKey: null, freesoundClientId: null, model: "m", userAgent: "test" } as Config,
      store,
      engine: createEngine(providers(), policy),
      providers: providers(),
      freesound: { isConnected: async () => false } as FreesoundAuth,
      policy,
      claude: null,
      local,
    });
  }

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "sonic-local-")));
    pack = join(root, "Sonniss GDC");
    mkdirSync(join(pack, "Boom Library", "Doors"), { recursive: true });
    writeFileSync(join(pack, "Boom Library", "Doors", "DOOR_Wood_Creak_Slow.wav"), wav(0.5));
    writeFileSync(join(pack, "Boom Library", "MetalImpact_Heavy.wav"), wav(0.25));
    writeFileSync(join(pack, "rain.flac"), flac());
    writeFileSync(join(pack, "notes.txt"), "not audio");
    store = new Store(join(root, "data"), join(root, "out"));
    local = new LocalLibrary(store, join(root, "data"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(root, { recursive: true, force: true });
  });

  const searchFor = (query: string) => local.provider.search({ query, limit: 20 });

  it("indexes audio files and reads their headers", async () => {
    const folder = await local.addFolder(sonniss());
    expect(folder.fileCount).toBe(3);
    const [door] = await searchFor("door");
    expect(door).toMatchObject({ title: "DOOR Wood Creak Slow", creator: "Boom Library", provider: "local", licenceReview: "declared" });
    expect(door?.durationSec).toBeCloseTo(0.5);
    expect(door?.original).toMatchObject({ sampleRate: 48000, bitDepth: 24, format: "wav", lossless: true, needsLogin: false });
    const [rain] = await searchFor("rain");
    expect(rain?.durationSec).toBeCloseTo(3);
    expect(rain?.original).toMatchObject({ sampleRate: 44100, bitDepth: 16, format: "flac" });
  });

  it("finds words in camelCase names and folder names", async () => {
    await local.addFolder(sonniss());
    expect((await searchFor("impact"))[0]?.title).toBe("Metal Impact Heavy");
    expect((await searchFor("doors")).length).toBe(1);
  });

  it("keeps the browser away from real paths", async () => {
    await local.addFolder(sonniss());
    const [door] = await searchFor("door");
    expect(JSON.stringify(door)).not.toContain(root.replace(/\\/g, "\\\\"));
    expect(door?.previewUrl).toMatch(/^\/api\/local\/audio\/[\w-]+\/[0-9a-f]{32}$/);
  });

  it("shows up through the search engine and is never served from a stale cache", async () => {
    await local.addFolder(sonniss());
    const engine = createEngine(providers(), policy);
    const reading = { ...interpretWithRules("thunder"), queries: ["thunder"], source: "thunder" };
    expect((await engine.search(reading, filters)).results).toHaveLength(0);
    writeFileSync(join(pack, "thunder.wav"), wav(0.1));
    await local.rescan(store.snapshot().soundFolders[0]!.id);
    expect((await engine.search(reading, filters)).results).toHaveLength(1);
  });

  it("blocks and counts a folder with no licence", async () => {
    await local.addFolder({ path: pack, licence: "unsure", confirmed: false });
    const engine = createEngine(providers(), policy);
    const response = await engine.search({ ...interpretWithRules("door"), queries: ["door"], source: "door" }, filters);
    expect(response.results).toHaveLength(0);
    expect(response.blocked.total).toBe(1);
  });

  it("refuses a download from a folder with no licence, whatever the browser sends", async () => {
    await local.addFolder({ path: pack, licence: "unsure", confirmed: false });
    const [door] = await searchFor("door");
    const response = await app().request("/api/download", {
      method: "POST",
      headers: { ...LOCAL, "content-type": "application/json" },
      body: JSON.stringify({ provider: "local", nativeId: door!.nativeId, licence: { code: "cc0", commercialUse: true } }),
    });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe("licence_refused");
  });

  it("saves a byte-identical copy with an honest inventory", async () => {
    await local.addFolder(sonniss());
    const [door] = await searchFor("door");
    const { record } = await downloadSound({ request: { provider: "local", nativeId: door!.nativeId }, providers: providers(), store, policy });
    const original = readFileSync(join(pack, "Boom Library", "Doors", "DOOR_Wood_Creak_Slow.wav"));
    expect(readFileSync(record.path).equals(original)).toBe(true);
    expect(record.path.endsWith("DOOR_Wood_Creak_Slow.wav")).toBe(true);
    expect(record.sha256).toBe(createHash("sha256").update(original).digest("hex"));
    const csv = readFileSync(join(root, "out", "Unsorted", "sonic-scout-inventory.csv"), "utf8");
    expect(csv).toContain("declared by you for this folder");
    expect(csv).toContain("Sonniss GDC licence, declared by you on");
    expect(csv).toContain("Local folder: Sonniss GDC");
  });

  it("writes the credit line for a CC BY folder", async () => {
    await local.addFolder({ path: pack, licence: "cc-by", confirmed: true, creator: "A Recordist", sourceUrl: "https://example.org/pack" });
    const [door] = await searchFor("door");
    expect(door?.attribution).toContain("A Recordist");
    await downloadSound({ request: { provider: "local", nativeId: door!.nativeId }, providers: providers(), store, policy });
    expect(readFileSync(join(root, "out", "Unsorted", "CREDITS.txt"), "utf8")).toContain("https://example.org/pack");
  });

  it("uses today's declaration, not the one the browser saw", async () => {
    await local.addFolder(sonniss());
    const [door] = await searchFor("door");
    await store.updateSoundFolder(store.snapshot().soundFolders[0]!.id, { licence: "unsure", confirmedAt: null });
    await expect(downloadSound({ request: { provider: "local", nativeId: door!.nativeId }, providers: providers(), store, policy })).rejects.toMatchObject({ code: "licence_refused" });
  });

  it("serves audio by id, with ranges", async () => {
    await local.addFolder(sonniss());
    const [door] = await searchFor("door");
    const server = app();
    const whole = await server.request(door!.previewUrl, { headers: LOCAL });
    expect(whole.status).toBe(200);
    expect(whole.headers.get("content-type")).toBe("audio/wav");
    expect(whole.headers.get("cache-control")).toBe("no-store");
    expect(Number(whole.headers.get("content-length"))).toBe(44 + 72000);
    const part = await server.request(door!.previewUrl, { headers: { ...LOCAL, range: "bytes=44-47" } });
    expect(part.status).toBe(206);
    expect([...new Uint8Array(await part.arrayBuffer())]).toEqual([0, 1, 2, 3]);
  });

  it("only serves files in the index", async () => {
    await local.addFolder(sonniss());
    const folderId = store.snapshot().soundFolders[0]!.id;
    const server = app();
    for (const path of [
      `/api/local/audio/${folderId}/${"0".repeat(32)}`,
      `/api/local/audio/nope/${"0".repeat(32)}`,
      `/api/local/audio/${folderId}/..%2F..%2Fdata%2Flibrary.json`,
      `/api/local/audio/${folderId}/notes.txt`,
    ]) {
      expect((await server.request(path, { headers: LOCAL })).status).toBe(404);
    }
  });

  it("won't let another site embed your files", async () => {
    await local.addFolder(sonniss());
    const [door] = await searchFor("door");
    const response = await app().request(door!.previewUrl, { headers: { ...LOCAL, "sec-fetch-site": "cross-site" } });
    expect(response.status).toBe(403);
  });

  it("does not follow links out of the folder", async () => {
    const outside = join(root, "private");
    mkdirSync(outside);
    writeFileSync(join(outside, "secret_tape.wav"), wav(0.1));
    symlinkSync(outside, join(pack, "link"), "junction");
    await local.addFolder(sonniss());
    expect(await searchFor("secret")).toEqual([]);
  });

  it("refuses a file swapped for a link after scanning", async () => {
    await local.addFolder(sonniss());
    const [door] = await searchFor("door");
    const file = join(pack, "Boom Library", "Doors");
    rmSync(file, { recursive: true });
    const outside = join(root, "private");
    mkdirSync(outside);
    writeFileSync(join(outside, "DOOR_Wood_Creak_Slow.wav"), wav(0.1));
    symlinkSync(outside, file, "junction");
    expect((await app().request(door!.previewUrl, { headers: LOCAL })).status).toBe(404);
  });

  it("picks up added, changed and removed files on rescan", async () => {
    await local.addFolder(sonniss());
    const folderId = store.snapshot().soundFolders[0]!.id;
    const changed = join(pack, "Boom Library", "MetalImpact_Heavy.wav");
    writeFileSync(changed, wav(1));
    utimesSync(changed, new Date(), new Date(Date.now() + 5000));
    rmSync(join(pack, "rain.flac"));
    writeFileSync(join(pack, "wind_gust.wav"), wav(0.1));
    await local.rescan(folderId);
    expect(store.snapshot().soundFolders[0]?.fileCount).toBe(3);
    expect(await searchFor("rain")).toEqual([]);
    expect((await searchFor("wind")).length).toBe(1);
    expect((await searchFor("impact"))[0]?.durationSec).toBeCloseTo(1);
  });

  it("keeps the index when the drive is unplugged", async () => {
    await local.addFolder(sonniss());
    const folderId = store.snapshot().soundFolders[0]!.id;
    rmSync(pack, { recursive: true });
    await expect(local.rescan(folderId)).rejects.toMatchObject({ code: "folder_missing" });
    expect((await searchFor("door")).length).toBe(1);
    expect(await local.provider.getById((await searchFor("door"))[0]!.nativeId)).toBeNull();
  });

  it("survives a restart", async () => {
    await local.addFolder(sonniss());
    const reopened = new LocalLibrary(new Store(join(root, "data"), join(root, "out")), join(root, "data"));
    expect((await reopened.provider.search({ query: "door", limit: 5 })).length).toBe(1);
  });

  it("removing a folder leaves your files alone", async () => {
    await local.addFolder(sonniss());
    const folderId = store.snapshot().soundFolders[0]!.id;
    const response = await app().request(`/api/local/folders/${folderId}`, { method: "DELETE", headers: LOCAL });
    expect(((await response.json()) as Library).soundFolders).toEqual([]);
    expect(await searchFor("door")).toEqual([]);
    expect(existsSync(join(pack, "rain.flac"))).toBe(true);
    expect(local.provider.disabledReason()).not.toBeNull();
  });

  it("refuses bad folders", async () => {
    await expect(local.addFolder(sonniss(join(root, "missing")))).rejects.toMatchObject({ code: "folder_invalid" });
    await expect(local.addFolder(sonniss("relative/path"))).rejects.toMatchObject({ code: "folder_invalid" });
    await expect(local.addFolder(sonniss(process.platform === "win32" ? "C:\\" : "/"))).rejects.toThrow("whole drive");
    const empty = join(root, "empty");
    mkdirSync(empty);
    await expect(local.addFolder(sonniss(empty))).rejects.toThrow("No audio files");
    await expect(local.addFolder({ path: pack, licence: "cc0", confirmed: false })).rejects.toThrow("Confirm the licence");
    await expect(local.addFolder({ path: pack, licence: "cc-by", confirmed: true })).rejects.toThrow("creator");
    await expect(local.addFolder({ path: pack, licence: "custom", confirmed: true, customLabel: "X" })).rejects.toThrow("web link");
  });

  it("refuses folders that overlap, because a file can only have one licence", async () => {
    await local.addFolder(sonniss());
    await expect(local.addFolder(sonniss())).rejects.toThrow("overlaps");
    await expect(local.addFolder(sonniss(join(pack, "Boom Library")))).rejects.toThrow("overlaps");
    await expect(local.addFolder(sonniss(root))).rejects.toThrow("overlaps");
  });

  it("adds a folder over HTTP and rejects a bad licence kind", async () => {
    const server = app();
    const post = (body: unknown) =>
      server.request("/api/local/folders", { method: "POST", headers: { ...LOCAL, "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await post({ path: pack, licence: "made-up", confirmed: true })).status).toBe(400);
    const added = await post({ path: pack, licence: "cc0", confirmed: true, name: "", creator: "", sourceUrl: "", customLabel: "", customUrl: "" });
    expect(added.status).toBe(200);
    expect(((await added.json()) as Library).soundFolders[0]).toMatchObject({ name: "Sonniss GDC", fileCount: 3, sourceUrl: null });
  });

  it("ignores a damaged index", async () => {
    await local.addFolder(sonniss());
    writeFileSync(join(root, "data", "local-index.json"), "{broken");
    const reopened = new LocalLibrary(store, join(root, "data"));
    expect(await reopened.provider.search({ query: "door", limit: 5 })).toEqual([]);
  });
});
