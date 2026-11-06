import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, open, readdir, realpath, rename, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { webHost } from "../../shared/links";
import type { FolderLicenceKind, Sound, SoundFolder } from "../../shared/types";
import { DownloadError } from "../download/download";
import { LOSSLESS_FORMATS, mapLimit } from "../http";
import { attributionLine, folderLicence, folderSource } from "../licence/classify";
import { stem, words } from "../search/rank";
import type { Store } from "../store/store";
import type { SoundProvider } from "./types";

const MAX_FILES = 200_000;
const HEADER_BYTES = 64 * 1024;
const HEADER_READS = 8;

const AUDIO_TYPES: Record<string, string> = {
  wav: "audio/wav",
  flac: "audio/flac",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aif: "audio/aiff",
  aiff: "audio/aiff",
};

interface FileEntry {
  /** Opaque, so the browser never holds a path it could change. */
  id: string;
  relativePath: string;
  size: number;
  mtimeMs: number;
  sampleRate: number | null;
  bitDepth: number | null;
  durationSec: number | null;
}

interface IndexedFile extends FileEntry {
  stems: Set<string>;
}

interface AudioFacts {
  sampleRate: number | null;
  bitDepth: number | null;
  durationSec: number | null;
}

const NO_FACTS: AudioFacts = { sampleRate: null, bitDepth: null, durationSec: null };

function wavFacts(header: Buffer, fileSize: number): AudioFacts {
  const facts = { ...NO_FACTS };
  let byteRate = 0;
  for (let position = 12; position + 8 <= header.length; ) {
    const id = header.toString("latin1", position, position + 4);
    const size = header.readUInt32LE(position + 4);
    const body = position + 8;
    if (id === "fmt " && body + 16 <= header.length) {
      facts.sampleRate = header.readUInt32LE(body + 4);
      byteRate = header.readUInt32LE(body + 8);
      facts.bitDepth = header.readUInt16LE(body + 14);
    } else if (id === "data") {
      // RF64 writes all ones here, and a damaged file can claim more than it holds.
      const available = Math.max(0, fileSize - body);
      if (byteRate > 0) facts.durationSec = Math.min(size, available) / byteRate;
      break;
    }
    position = body + size + (size % 2);
  }
  return facts;
}

function flacFacts(header: Buffer): AudioFacts {
  if (header.length < 26) return NO_FACTS;
  const sampleRate = (header[18]! << 12) | (header[19]! << 4) | (header[20]! >> 4);
  const bitDepth = (((header[20]! & 1) << 4) | (header[21]! >> 4)) + 1;
  const samples = (header[21]! & 0x0f) * 2 ** 32 + header.readUInt32BE(22);
  return { sampleRate, bitDepth, durationSec: sampleRate > 0 && samples > 0 ? samples / sampleRate : null };
}

/** Reads what the file's own header says. A damaged file still gets indexed, just with blanks. */
async function readFacts(path: string, size: number): Promise<AudioFacts> {
  let handle;
  try {
    handle = await open(path, "r");
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(Math.min(HEADER_BYTES, size)), 0, Math.min(HEADER_BYTES, size), 0);
    const header = buffer.subarray(0, bytesRead);
    const magic = header.toString("latin1", 0, 4);
    if ((magic === "RIFF" || magic === "RF64") && header.toString("latin1", 8, 12) === "WAVE") return wavFacts(header, size);
    if (magic === "fLaC") return flacFacts(header);
    return NO_FACTS;
  } catch {
    return NO_FACTS;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function extensionOf(path: string): string {
  return parse(path).ext.slice(1).toLowerCase();
}

/** Every audio file under a folder. Links are skipped, so a scan can't wander outside the folder the user chose. */
async function audioFiles(root: string): Promise<{ paths: string[]; truncated: boolean }> {
  const paths: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name.startsWith("$")) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile() && AUDIO_TYPES[extensionOf(entry.name)]) {
        if (paths.length >= MAX_FILES) return { paths, truncated: true };
        paths.push(path);
      }
    }
  }
  return { paths, truncated: false };
}

function titleOf(relativePath: string): string {
  return parse(relativePath).name
    .replace(/_+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function folderTags(relativePath: string): string[] {
  return relativePath.split("/").slice(0, -1);
}

function stemsOf(entry: FileEntry): Set<string> {
  const searchable = `${titleOf(entry.relativePath)} ${folderTags(entry.relativePath).join(" ")}`;
  return new Set(words(searchable.replace(/([a-z])([A-Z])/g, "$1 $2")).map(stem));
}

function comparable(path: string): string {
  const clean = path.endsWith(sep) ? path : path + sep;
  return process.platform === "win32" ? clean.toLowerCase() : clean;
}

export interface FolderInput {
  path: string;
  name?: string | undefined;
  licence: FolderLicenceKind;
  creator?: string | undefined;
  sourceUrl?: string | undefined;
  customLabel?: string | undefined;
  customUrl?: string | undefined;
  confirmed: boolean;
}

function checkDeclaration(input: FolderInput) {
  const refuse = (message: string) => new DownloadError("folder_invalid", message);
  if (input.licence === "unsure") return;
  if (!input.confirmed) throw refuse("Confirm the licence first, or choose \"Not sure yet\".");
  if (input.licence === "cc-by" && !(input.creator?.trim() && webHost(input.sourceUrl))) {
    throw refuse("CC BY needs the creator's name and a web link, so the credit line is complete.");
  }
  if (input.licence === "custom" && !(input.customLabel?.trim() && webHost(input.customUrl))) {
    throw refuse("Give the licence a name and a web link to its text.");
  }
}

export interface LocalFile {
  path: string;
  size: number;
  contentType: string;
}

/** The user's own sound folders: scanned once, searched here, and never sent anywhere. */
export class LocalLibrary {
  private files = new Map<string, Map<string, IndexedFile>>();
  private indexFile: string;
  private saving: Promise<void> = Promise.resolve();

  readonly provider: SoundProvider;

  constructor(
    private store: Store,
    private dataDir: string,
  ) {
    this.indexFile = join(dataDir, "local-index.json");
    if (existsSync(this.indexFile)) {
      try {
        const saved = JSON.parse(readFileSync(this.indexFile, "utf8")) as Record<string, FileEntry[]>;
        for (const [folderId, entries] of Object.entries(saved)) this.remember(folderId, entries);
      } catch {
        // A damaged index only means Rescan is needed.
      }
    }
    this.provider = this.buildProvider();
  }

  private remember(folderId: string, entries: FileEntry[]) {
    this.files.set(folderId, new Map(entries.map((entry) => [entry.id, { ...entry, stems: stemsOf(entry) }])));
  }

  private folder(folderId: string): SoundFolder | undefined {
    return this.store.snapshot().soundFolders.find((folder) => folder.id === folderId);
  }

  private saveIndex(): Promise<void> {
    const saved = Object.fromEntries(
      [...this.files].map(([folderId, files]) => [folderId, [...files.values()].map(({ stems: _stems, ...entry }) => entry)]),
    );
    const text = JSON.stringify(saved);
    this.saving = this.saving.then(async () => {
      await mkdir(this.dataDir, { recursive: true });
      const temporary = `${this.indexFile}.tmp`;
      await writeFile(temporary, text);
      await rename(temporary, this.indexFile);
    });
    return this.saving;
  }

  private async scan(root: string, known: Map<string, IndexedFile> | undefined) {
    const { paths, truncated } = await audioFiles(root);
    const entries = await mapLimit(paths, HEADER_READS, async (path): Promise<FileEntry | null> => {
      const relativePath = relative(root, path).split(sep).join("/");
      const id = createHash("sha256").update(relativePath).digest("hex").slice(0, 32);
      const info = await stat(path).catch(() => null);
      if (!info) return null;
      const previous = known?.get(id);
      if (previous && previous.size === info.size && previous.mtimeMs === info.mtimeMs) {
        const { stems: _stems, ...entry } = previous;
        return entry;
      }
      return { id, relativePath, size: info.size, mtimeMs: info.mtimeMs, ...(await readFacts(path, info.size)) };
    });
    return { entries: entries.filter((entry) => entry !== null), truncated };
  }

  async addFolder(input: FolderInput): Promise<SoundFolder> {
    const refuse = (message: string) => new DownloadError("folder_invalid", message);
    checkDeclaration(input);
    if (!isAbsolute(input.path)) throw refuse("Give the folder's full path.");
    const path = resolve(input.path);
    if (parse(path).root === path) throw refuse("Choose a folder rather than a whole drive.");
    const real = await realpath(path).catch(() => null);
    if (!real || !(await stat(real)).isDirectory()) throw refuse("That folder doesn't exist.");

    const wanted = comparable(real);
    for (const existing of this.store.snapshot().soundFolders) {
      const other = comparable(await realpath(existing.path).catch(() => existing.path));
      if (wanted.startsWith(other) || other.startsWith(wanted)) {
        throw refuse(`That overlaps "${existing.name}", which is already added. A file can only have one licence.`);
      }
    }

    const { entries, truncated } = await this.scan(real, undefined);
    if (entries.length === 0) throw refuse("No audio files found in that folder.");
    const now = new Date().toISOString();
    const folder: SoundFolder = {
      id: randomUUID(),
      name: input.name?.trim() || basename(real),
      path: real,
      licence: input.licence,
      creator: input.creator?.trim() || null,
      sourceUrl: input.sourceUrl?.trim() || null,
      customLabel: input.customLabel?.trim() || null,
      customUrl: input.customUrl?.trim() || null,
      confirmedAt: input.licence === "unsure" ? null : now,
      fileCount: entries.length,
      scannedAt: now,
      truncated,
    };
    this.remember(folder.id, entries);
    await this.saveIndex();
    await this.store.addSoundFolder(folder);
    return folder;
  }

  async rescan(folderId: string) {
    const folder = this.folder(folderId);
    if (!folder) throw new DownloadError("not_found", "Folder not found.", 404);
    const info = await stat(folder.path).catch(() => null);
    // A drive that's unplugged shouldn't wipe the index.
    if (!info?.isDirectory()) throw new DownloadError("folder_missing", `Can't reach ${folder.path}. Is the drive connected?`);
    const { entries, truncated } = await this.scan(folder.path, this.files.get(folderId));
    this.remember(folderId, entries);
    await this.saveIndex();
    await this.store.updateSoundFolder(folderId, { fileCount: entries.length, truncated, scannedAt: new Date().toISOString() });
  }

  /** Forgets a folder. The files themselves are never touched. */
  async removeFolder(folderId: string) {
    this.files.delete(folderId);
    await this.saveIndex();
    await this.store.removeSoundFolder(folderId);
  }

  /** The only way from an id to a file: it has to be in the index and still inside its folder. */
  async locate(folderId: string, fileId: string): Promise<LocalFile | null> {
    const folder = this.folder(folderId);
    const entry = this.files.get(folderId)?.get(fileId);
    if (!folder || !entry) return null;
    try {
      const root = await realpath(folder.path);
      const path = await realpath(join(root, entry.relativePath));
      const inside = relative(root, path);
      if (!inside || inside.startsWith("..") || isAbsolute(inside)) return null;
      const info = await stat(path);
      if (!info.isFile()) return null;
      return { path, size: info.size, contentType: AUDIO_TYPES[extensionOf(path)] ?? "application/octet-stream" };
    } catch {
      return null;
    }
  }

  private toSound(folder: SoundFolder, entry: FileEntry): Sound {
    const title = titleOf(entry.relativePath);
    const filename = entry.relativePath.split("/").pop() ?? "";
    const format = extensionOf(filename);
    const tags = folderTags(entry.relativePath);
    const creator = folder.licence === "own" ? "You" : (folder.creator ?? tags[0] ?? folder.name);
    const sourcePageUrl = folderSource(folder);
    const licence = folderLicence(folder);
    return {
      id: `local:${folder.id}/${entry.id}`,
      provider: "local",
      providerLabel: folder.name,
      nativeId: `${folder.id}/${entry.id}`,
      title,
      description: entry.relativePath,
      tags,
      creator,
      creatorUrl: null,
      sourcePageUrl,
      durationSec: entry.durationSec,
      previewUrl: `/api/local/audio/${folder.id}/${entry.id}`,
      previewFormat: format,
      original: {
        available: true,
        needsLogin: false,
        format,
        lossless: LOSSLESS_FORMATS.has(format),
        filename,
        sizeBytes: entry.size,
        sampleRate: entry.sampleRate,
        bitDepth: entry.bitDepth,
      },
      licence,
      licenceReview: "declared",
      attribution: attributionLine({ title, creator, sourcePageUrl, licence }),
    };
  }

  private buildProvider(): SoundProvider {
    return {
      id: "local",
      label: "Your folders",
      // Nobody else can review these. The declaration is the user's, and every card says so.
      reviewed: true,
      live: true,
      originals: () => "Your original files",
      disabledReason: () => (this.store.snapshot().soundFolders.length > 0 ? null : "Add a folder in Setup."),
      search: async ({ query, limit }) => {
        const wanted = [...new Set(words(query).map(stem))];
        const hits: Array<{ folder: SoundFolder; entry: IndexedFile; score: number }> = [];
        for (const folder of this.store.snapshot().soundFolders) {
          for (const entry of this.files.get(folder.id)?.values() ?? []) {
            const score = wanted.filter((word) => entry.stems.has(word)).length;
            if (score > 0) hits.push({ folder, entry, score });
          }
        }
        return hits
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map(({ folder, entry }) => this.toSound(folder, entry));
      },
      getById: async (nativeId) => {
        const [folderId = "", fileId = ""] = nativeId.split("/");
        const folder = this.folder(folderId);
        const entry = this.files.get(folderId)?.get(fileId);
        if (!folder || !entry || !(await this.locate(folderId, fileId))) return null;
        return this.toSound(folder, entry);
      },
      resolveDownload: async (sound) => {
        const [folderId = "", fileId = ""] = sound.nativeId.split("/");
        const file = await this.locate(folderId, fileId);
        if (!file || !sound.original.filename || !sound.original.format) return null;
        return { url: "", headers: {}, filename: sound.original.filename, format: sound.original.format, kind: "original", file: file.path };
      },
    };
  }
}
