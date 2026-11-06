export type LicenceCode =
  | "cc0"
  | "pdm"
  | "cc-by"
  | "cc-by-sa"
  | "cc-by-nd"
  | "cc-by-nc"
  | "cc-by-nc-sa"
  | "cc-by-nc-nd"
  | "sampling-plus"
  | "commercial"
  | "personal"
  | "unknown";

export interface LicenceEvidence {
  /** The value exactly as the provider returned it. */
  rawValue: string;
  /** Which provider field it came from. */
  field: string;
  /** Page where a person can check the claim themselves. */
  sourcePageUrl: string;
  checkedAt: string;
}

export interface LicenceInfo {
  code: LicenceCode;
  label: string;
  version: string | null;
  url: string | null;
  /** True only when the licence text itself grants commercial use. */
  commercialUse: boolean;
  attributionRequired: boolean;
  shareAlike: boolean;
  noDerivatives: boolean;
  /** Set when the provider's own fields contradict each other. */
  conflict: string | null;
  evidence: LicenceEvidence;
}

export type ProviderId = "freesound" | "openverse" | "wikimedia" | "archive";

export interface OriginalFile {
  /** The file as the creator uploaded it, not a lossy preview. */
  available: boolean;
  /** Needs a Freesound login before it can be fetched. */
  needsLogin: boolean;
  format: string | null;
  lossless: boolean;
  filename: string | null;
  sizeBytes: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
}

export interface Sound {
  id: string;
  provider: ProviderId;
  providerLabel: string;
  nativeId: string;
  title: string;
  description: string;
  tags: string[];
  creator: string;
  creatorUrl: string | null;
  sourcePageUrl: string;
  durationSec: number | null;
  previewUrl: string;
  previewFormat: string | null;
  original: OriginalFile;
  licence: LicenceInfo;
  /** Whether anyone but the uploader has looked at the licence claim. */
  licenceReview: "community" | "unreviewed";
  /** Ready-to-paste credit line. Null when the licence requires none. */
  attribution: string | null;
}

export interface RankedSound extends Sound {
  relevance: number;
  matchedTerms: string[];
}

export type CategoryId =
  | "human"
  | "environment"
  | "foley"
  | "mechanical"
  | "musical"
  | "cinematic"
  | "abstract"
  | "unknown";

export interface DurationHint {
  min: number;
  max: number;
  target: number;
}

export interface Interpretation {
  engine: "claude" | "rules";
  source: string;
  category: CategoryId;
  rhythm: string | null;
  speed: string | null;
  emotion: string[];
  texture: string[];
  perspective: string[];
  duration: DurationHint | null;
  queries: string[];
  /** Why the rule reader was used, when Claude was configured but failed. */
  note: string | null;
}

export type LicenceFilter = "cleared" | "no-credit" | "credit";

export interface SearchFilters {
  licence: LicenceFilter;
  losslessOnly: boolean;
  downloadableOriginalOnly: boolean;
  /** Opt in to libraries where nobody reviews the uploader's licence claim. */
  includeUnreviewed: boolean;
}

export interface SourceReport {
  id: ProviderId;
  label: string;
  status: "ok" | "rate_limited" | "error" | "disabled";
  message: string | null;
  found: number;
  /** Recordings removed because the licence is not cleared for commercial use. */
  blocked: number;
}

export interface BlockedSummary {
  total: number;
  byLicence: Record<string, number>;
}

export interface SearchResponse {
  interpretation: Interpretation;
  results: RankedSound[];
  sources: SourceReport[];
  blocked: BlockedSummary;
}

export interface CollectionItem {
  sound: Sound;
  addedAt: string;
}

export interface Collection {
  id: string;
  name: string;
  items: CollectionItem[];
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  collections: Collection[];
}

export interface DownloadRecord {
  soundId: string;
  title: string;
  path: string;
  kind: "original" | "preview";
  format: string;
  sizeBytes: number;
  sha256: string;
  downloadedAt: string;
}

export interface Library {
  downloadRoot: string;
  favourites: Sound[];
  projects: Project[];
  downloads: DownloadRecord[];
}

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  enabled: boolean;
  reason: string | null;
  originals: string;
  reviewed: boolean;
}

export interface AppStatus {
  interpreter: "claude" | "rules";
  model: string | null;
  providers: ProviderStatus[];
  freesoundLogin: { available: boolean; connected: boolean };
  shareAlikeAllowed: boolean;
}

export interface DownloadResult {
  ok: true;
  record: DownloadRecord;
  alreadyHad: boolean;
}

export interface ApiError {
  error: string;
  code: string;
}
