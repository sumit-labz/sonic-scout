import type { ProviderId, Sound } from "../../shared/types";

export interface ProviderSearch {
  query: string;
  limit: number;
}

export interface DownloadTarget {
  url: string;
  headers: Record<string, string>;
  filename: string;
  format: string;
  kind: "original" | "preview";
}

/**
 * One sound library. To add a library, implement this and register it in
 * registry.ts. Licences are gated centrally, so a provider only has to report
 * what the library says, never decide what is usable.
 */
export interface SoundProvider {
  id: ProviderId;
  label: string;
  /**
   * True when someone other than the uploader checks submissions. Unreviewed
   * libraries stay out of results unless the user opts in.
   */
  reviewed: boolean;
  /** Human summary of whether full-quality originals can be fetched. */
  originals(): string;
  disabledReason(): string | null;
  search(request: ProviderSearch): Promise<Sound[]>;
  /** Re-reads one record from the library, so a download never trusts stale data. */
  getById(nativeId: string): Promise<Sound | null>;
  resolveDownload(sound: Sound): Promise<DownloadTarget | null>;
}
