import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebStream } from "node:stream/web";
import type { DownloadRecord, Sound } from "../../shared/types";
import { refusalReason, type LicencePolicy } from "../licence/classify";
import type { DownloadTarget, SoundProvider } from "../providers/types";
import type { Store } from "../store/store";
import { inventoryRow, writeInventory } from "./inventory";

export class DownloadError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

/** Keeps the creator's filename, changing only what Windows cannot store. */
export function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[<>:"|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/, "").trim();
  if (!clean || /^\.+$/.test(clean)) return "untitled";
  return RESERVED.test(clean) ? `_${clean}` : clean;
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}

async function freePath(directory: string, name: string): Promise<string> {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  let candidate = join(directory, name);
  for (let copy = 2; await exists(candidate); copy++) candidate = join(directory, `${stem} (${copy})${extension}`);
  return candidate;
}

async function openRemote(target: DownloadTarget): Promise<Readable> {
  const response = await fetch(target.url, { headers: target.headers, signal: AbortSignal.timeout(10 * 60_000) });
  if (response.status === 401 || response.status === 403) {
    throw new DownloadError("source_refused", "The source refused the download. Try reconnecting Freesound.", 502);
  }
  if (!response.ok || !response.body) {
    throw new DownloadError("source_failed", `The source returned ${response.status}.`, 502);
  }
  return Readable.fromWeb(response.body as WebStream);
}

export interface DownloadRequest {
  provider: string;
  nativeId: string;
  projectId?: string;
  collectionId?: string;
  /** The user has accepted a lossy preview in place of the original. */
  allowPreview?: boolean;
}

export async function downloadSound(args: {
  request: DownloadRequest;
  providers: SoundProvider[];
  store: Store;
  policy: LicencePolicy;
}): Promise<{ record: DownloadRecord; alreadyHad: boolean; sound: Sound }> {
  const { request, providers, store, policy } = args;
  const provider = providers.find((item) => item.id === request.provider);
  if (!provider) throw new DownloadError("unknown_provider", "Unknown source library.");

  // Re-read from the library so the licence on file is today's, not the client's.
  const sound = await provider.getById(request.nativeId);
  if (!sound) throw new DownloadError("not_found", "This recording is no longer available at its source.", 404);
  const refusal = refusalReason(sound.licence, policy);
  if (refusal) throw new DownloadError("licence_refused", refusal, 403);

  const target = await provider.resolveDownload(sound);
  if (!target) throw new DownloadError("no_file", "The source does not offer this file.", 404);
  if (target.kind === "preview" && !request.allowPreview) {
    throw new DownloadError(
      "preview_only",
      "Only a lossy MP3 preview is available. Connect Freesound for the original, or accept the preview.",
      409,
    );
  }

  const library = store.snapshot();
  const project = request.projectId ? store.project(request.projectId) : null;
  const collection = project && request.collectionId ? store.collection(project.id, request.collectionId) : null;
  const projectDir = join(library.downloadRoot, safeName(project?.name ?? "Unsorted"));
  const directory = collection ? join(projectDir, safeName(collection.name)) : projectDir;
  const wanted = join(directory, safeName(target.filename));

  const previous = library.downloads.find((record) => record.soundId === sound.id && record.path === wanted);
  if (previous && (await exists(previous.path))) return { record: previous, alreadyHad: true, sound };

  await mkdir(directory, { recursive: true });
  const source = target.file ? createReadStream(target.file) : await openRemote(target);

  const finalPath = await freePath(directory, safeName(target.filename));
  const temporary = `${finalPath}.part`;
  const hash = createHash("sha256");
  let sizeBytes = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      hash.update(chunk);
      sizeBytes += chunk.length;
      done(null, chunk);
    },
  });

  try {
    await pipeline(source, meter, createWriteStream(temporary));
    await rename(temporary, finalPath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw new DownloadError("write_failed", `Could not save the file: ${(error as Error).message}`, 500);
  }

  const record: DownloadRecord = {
    soundId: sound.id,
    title: sound.title,
    path: finalPath,
    kind: target.kind,
    format: target.format,
    sizeBytes,
    sha256: hash.digest("hex"),
    downloadedAt: new Date().toISOString(),
  };
  await store.recordDownload(record);
  await writeInventory(
    projectDir,
    inventoryRow({
      record,
      sound,
      project: project?.name ?? "Unsorted",
      collection: collection?.name ?? "",
      filename: finalPath.split(/[\\/]/).pop() ?? "",
    }),
    sound.attribution,
  );
  return { record, alreadyHad: false, sound };
}
