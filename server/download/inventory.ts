import { appendFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { DownloadRecord, Sound } from "../../shared/types";

const COLUMNS = [
  "downloaded_at", "project", "collection", "filename", "file_kind", "format", "size_bytes", "sha256",
  "title", "source_library", "creator", "creator_url", "source_url", "duration_sec",
  "licence", "licence_url", "commercial_use", "attribution_required", "attribution_text",
  "licence_review", "licence_evidence", "licence_field", "licence_checked_at",
] as const;

const REVIEW_LABELS: Record<Sound["licenceReview"], string> = {
  community: "community reviewed library",
  unreviewed: "unreviewed uploader claim",
  declared: "declared by you for this folder",
};

export function csvCell(value: string | number | boolean | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  // Stops a hostile title from running as a spreadsheet formula.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function inventoryRow(args: {
  record: DownloadRecord;
  sound: Sound;
  project: string;
  collection: string;
  filename: string;
}): string {
  const { record, sound, project, collection, filename } = args;
  const values: Record<(typeof COLUMNS)[number], string | number | boolean | null> = {
    downloaded_at: record.downloadedAt,
    project,
    collection,
    filename,
    file_kind: record.kind === "original" ? "original" : "lossy preview",
    format: record.format,
    size_bytes: record.sizeBytes,
    sha256: record.sha256,
    title: sound.title,
    source_library: sound.providerLabel,
    creator: sound.creator,
    creator_url: sound.creatorUrl,
    source_url: sound.sourcePageUrl,
    duration_sec: sound.durationSec === null ? null : Number(sound.durationSec.toFixed(2)),
    licence: sound.licence.label,
    licence_url: sound.licence.url,
    commercial_use: sound.licence.commercialUse,
    attribution_required: sound.licence.attributionRequired,
    attribution_text: sound.attribution,
    licence_review: REVIEW_LABELS[sound.licenceReview],
    licence_evidence: sound.licence.evidence.rawValue,
    licence_field: sound.licence.evidence.field,
    licence_checked_at: sound.licence.evidence.checkedAt,
  };
  return COLUMNS.map((column) => csvCell(values[column])).join(",");
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}

/** Appends to the inventory and, for credit-required sounds, to CREDITS.txt. */
export async function writeInventory(projectDir: string, row: string, attribution: string | null) {
  const csv = join(projectDir, "sonic-scout-inventory.csv");
  // The BOM makes Excel read names with accents correctly.
  if (!(await exists(csv))) await appendFile(csv, `﻿${COLUMNS.join(",")}\r\n`);
  await appendFile(csv, `${row}\r\n`);
  if (attribution) await appendFile(join(projectDir, "CREDITS.txt"), `${attribution}\r\n`);
}
