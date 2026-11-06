import { mkdirSync, readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Sound } from "../../shared/types";

/** Newer than this is served without asking the library. */
export const FRESH_MS = 24 * 60 * 60 * 1000;
/** Older than FRESH_MS and newer than this is served at once and refreshed behind the scenes. */
export const STALE_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_ENTRIES = 2000;
const SAVE_DELAY_MS = 500;

interface Entry {
  storedAt: number;
  sounds: Sound[];
}

/**
 * Library answers kept between runs. Holding a licence here is safe because every result
 * is gated again on the way out and every download re-reads the record from the library.
 */
export class SearchCache {
  private entries = new Map<string, Entry>();
  private timer: NodeJS.Timeout | null = null;
  private saving: Promise<void> = Promise.resolve();

  constructor(private file: string | null = null) {
    if (!file) return;
    try {
      const saved = JSON.parse(readFileSync(file, "utf8")) as Array<[string, Entry]>;
      this.entries = new Map(saved.filter(([, entry]) => Date.now() - entry.storedAt < STALE_MS));
    } catch {
      // No cache yet, or a damaged one. Either way the libraries still have the answers.
    }
  }

  read(key: string): { sounds: Sound[]; fresh: boolean } | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    const age = Date.now() - entry.storedAt;
    if (age >= STALE_MS) {
      this.entries.delete(key);
      return null;
    }
    return { sounds: entry.sounds, fresh: age < FRESH_MS };
  }

  write(key: string, sounds: Sound[]): void {
    this.entries.delete(key);
    this.entries.set(key, { storedAt: Date.now(), sounds });
    if (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.scheduleSave();
  }

  private scheduleSave() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.saving = this.saving.then(() => this.save()).catch(() => undefined);
    }, SAVE_DELAY_MS);
    this.timer.unref();
  }

  private async save() {
    const file = this.file!;
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    await writeFile(temp, JSON.stringify([...this.entries]));
    await rename(temp, file);
  }

  /** Waits for anything still being written. */
  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.saving = this.saving.then(() => this.save());
    }
    await this.saving;
  }
}
