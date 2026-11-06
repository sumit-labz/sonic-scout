import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebStream } from "node:stream/web";

const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ABANDONED_MS = 60 * 60 * 1000;

export interface CachedAudio {
  path: string;
  size: number;
  contentType: string;
}

/** A byte range out of a file of `size`, or null when the header can't be honoured. */
export function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return start <= end && start < size ? { start, end } : null;
}

export function fileStream(path: string, range?: { start: number; end: number }): ReadableStream {
  return Readable.toWeb(createReadStream(path, range)) as ReadableStream;
}

/** Preview audio on disk, so a sound heard once starts at once. Oldest-used files go first past 1 GB. */
export class AudioCache {
  constructor(private dir: string) {}

  private base(url: string) {
    return join(this.dir, createHash("sha256").update(url).digest("hex"));
  }

  async get(url: string): Promise<CachedAudio | null> {
    const path = `${this.base(url)}.audio`;
    try {
      const [info, contentType] = await Promise.all([stat(path), readFile(`${this.base(url)}.type`, "utf8")]);
      const now = new Date();
      void utimes(path, now, now).catch(() => undefined);
      return { path, size: info.size, contentType };
    } catch {
      return null;
    }
  }

  /** Saves a complete download. A short or oversized one leaves nothing behind. */
  async put(url: string, body: WebStream, contentType: string, expectedBytes: number | null): Promise<void> {
    const temp = join(this.dir, `${randomUUID()}.tmp`);
    try {
      await mkdir(this.dir, { recursive: true });
      let bytes = 0;
      const counted = async function* (source: AsyncIterable<Uint8Array>) {
        for await (const chunk of source) {
          bytes += chunk.byteLength;
          if (bytes > MAX_FILE_BYTES) throw new Error("Too large to cache.");
          yield chunk;
        }
      };
      await pipeline(Readable.fromWeb(body), counted, createWriteStream(temp));
      if (expectedBytes !== null && bytes !== expectedBytes) throw new Error("Incomplete download.");
      await writeFile(`${this.base(url)}.type`, contentType);
      await rename(temp, `${this.base(url)}.audio`);
      await this.trim();
    } catch {
      await rm(temp, { force: true }).catch(() => undefined);
    }
  }

  private async trim() {
    const entries = await readdir(this.dir);
    // A download cut off by the server stopping leaves one of these behind.
    await Promise.all(
      entries
        .filter((name) => name.endsWith(".tmp"))
        .map(async (name) => {
          const path = join(this.dir, name);
          if (Date.now() - (await stat(path)).mtimeMs > ABANDONED_MS) await rm(path, { force: true });
        }),
    );
    const names = entries.filter((name) => name.endsWith(".audio"));
    const files = await Promise.all(
      names.map(async (name) => {
        const info = await stat(join(this.dir, name));
        return { name, size: info.size, used: info.mtimeMs };
      }),
    );
    let total = files.reduce((sum, file) => sum + file.size, 0);
    for (const file of files.sort((a, b) => a.used - b.used)) {
      if (total <= MAX_TOTAL_BYTES) return;
      total -= file.size;
      await rm(join(this.dir, file.name), { force: true });
      await rm(join(this.dir, file.name.replace(/\.audio$/, ".type")), { force: true });
    }
  }
}
