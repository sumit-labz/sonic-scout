import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sound } from "../shared/types";
import { DownloadError, downloadSound, safeName } from "../server/download/download";
import { csvCell } from "../server/download/inventory";
import type { SoundProvider } from "../server/providers/types";
import { Store } from "../server/store/store";
import { makeSound } from "./helpers";

const BYTES = Buffer.from("RIFF fake wav bytes");
const policy = { allowShareAlike: false };

function provider(sound: Sound | null, kind: "original" | "preview" = "original"): SoundProvider {
  return {
    id: "wikimedia",
    label: "Test",
    reviewed: true,
    originals: () => "",
    disabledReason: () => null,
    search: async () => [],
    getById: async () => sound,
    resolveDownload: async (item) => ({
      url: item.previewUrl,
      headers: {},
      filename: "School Bell, take 2.wav",
      format: "wav",
      kind,
    }),
  };
}

describe("downloadSound", () => {
  let root: string;
  let store: Store;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "sonic-scout-"));
    store = new Store(join(root, "data"), join(root, "out"));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(BYTES)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(root, { recursive: true, force: true });
  });

  const request = { provider: "wikimedia", nativeId: "bell.wav" };

  it("files the sound under its project and collection with an inventory", async () => {
    const project = await store.createProject("The Man Inside His Head", ["Childhood Memories"]);
    const collection = project.collections[0]!;
    const sound = makeSound({ licenceName: "CC BY 4.0" });

    const { record } = await downloadSound({
      request: { ...request, projectId: project.id, collectionId: collection.id },
      providers: [provider(sound)],
      store,
      policy,
    });

    const projectDir = join(root, "out", "The Man Inside His Head");
    expect(record.path).toBe(join(projectDir, "Childhood Memories", "School Bell, take 2.wav"));
    expect(readFileSync(record.path)).toEqual(BYTES);
    expect(record.sha256).toBe(createHash("sha256").update(BYTES).digest("hex"));

    const csv = readFileSync(join(projectDir, "sonic-scout-inventory.csv"), "utf8");
    expect(csv).toContain("CC BY 4.0");
    expect(csv).toContain('"School Bell, take 2.wav"');
    expect(csv).toContain(record.sha256);
    expect(readFileSync(join(projectDir, "CREDITS.txt"), "utf8")).toContain("A Recordist");
  });

  it("re-checks the live licence and refuses if it is no longer cleared", async () => {
    const changed = makeSound({ licenceName: "Attribution NonCommercial" });
    const attempt = downloadSound({ request, providers: [provider(changed)], store, policy });
    await expect(attempt).rejects.toMatchObject({ code: "licence_refused" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("only trusts the library's record, so a forged client request cannot pass", async () => {
    const attempt = downloadSound({ request, providers: [provider(null)], store, policy });
    await expect(attempt).rejects.toBeInstanceOf(DownloadError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("will not save a lossy preview without being told to", async () => {
    const providers = [provider(makeSound(), "preview")];
    await expect(downloadSound({ request, providers, store, policy })).rejects.toMatchObject({ code: "preview_only" });
    const { record } = await downloadSound({ request: { ...request, allowPreview: true }, providers, store, policy });
    expect(record.kind).toBe("preview");
    const csv = readFileSync(join(root, "out", "Unsorted", "sonic-scout-inventory.csv"), "utf8");
    expect(csv).toContain("lossy preview");
  });

  it("does not save the same sound twice, and never overwrites a different one", async () => {
    const providers = [provider(makeSound())];
    await downloadSound({ request, providers, store, policy });
    const again = await downloadSound({ request, providers, store, policy });
    expect(again.alreadyHad).toBe(true);

    const other = [provider(makeSound({ id: "wikimedia:other.wav" }))];
    const { record } = await downloadSound({ request, providers: other, store, policy });
    expect(record.path).toContain("(2).wav");
  });

  it("leaves no partial file when the source fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    await expect(downloadSound({ request, providers: [provider(makeSound())], store, policy })).rejects.toMatchObject({ code: "source_failed" });
    expect(readdirSync(join(root, "out", "Unsorted"))).toEqual([]);
  });
});

describe("safeName", () => {
  it("keeps normal names untouched", () => {
    expect(safeName("School Bell, take 2 (close).wav")).toBe("School Bell, take 2 (close).wav");
  });

  it("cannot escape the target folder", () => {
    expect(safeName("../../Windows/evil.wav")).toBe("evil.wav");
    expect(safeName("..\\..\\evil.wav")).toBe("evil.wav");
    expect(safeName("..")).toBe("untitled");
  });

  it("handles names Windows refuses", () => {
    expect(safeName('a:b?"c.wav')).toBe("a_b__c.wav");
    expect(safeName("CON.wav")).toBe("_CON.wav");
    expect(safeName("trailing. ")).toBe("trailing");
  });
});

describe("csvCell", () => {
  it("quotes and neutralises formulas", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(null)).toBe("");
  });
});
