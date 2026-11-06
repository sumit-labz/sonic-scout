import type {
  BlockedSummary,
  Interpretation,
  RankedSound,
  SearchFilters,
  SearchResponse,
  Sound,
  SourceReport,
} from "../../shared/types";
import { SearchCache } from "../cache/searchCache";
import { ProviderError } from "../http";
import { isCleared, type LicencePolicy } from "../licence/classify";
import type { SoundProvider } from "../providers/types";
import { rankSounds } from "./rank";

const RESULTS_PER_QUERY = 20;
const MAX_RESULTS = 60;

export interface SearchEngine {
  search(interpretation: Interpretation, filters: SearchFilters): Promise<SearchResponse>;
}

interface ProviderOutcome {
  report: SourceReport;
  sounds: Sound[];
}

/** Removes everything not cleared for commercial use, keeping a count of why. */
export function gate(sounds: Sound[], policy: LicencePolicy) {
  const allowed: Sound[] = [];
  const byLicence: Record<string, number> = {};
  for (const sound of sounds) {
    if (isCleared(sound.licence, policy)) {
      allowed.push(sound);
    } else {
      const key = sound.licence.conflict ? "Conflicting licence data" : sound.licence.label.replace(/ \d\.\d$/, "");
      byLicence[key] = (byLicence[key] ?? 0) + 1;
    }
  }
  return { allowed, byLicence };
}

export function applyFilters(results: RankedSound[], filters: SearchFilters): RankedSound[] {
  return results.filter((sound) => {
    if (filters.licence === "no-credit" && sound.licence.attributionRequired) return false;
    if (filters.licence === "credit" && !sound.licence.attributionRequired) return false;
    if (filters.losslessOnly && !sound.original.lossless) return false;
    if (filters.downloadableOriginalOnly && (!sound.original.available || sound.original.needsLogin)) return false;
    return true;
  });
}

function merge(target: Record<string, number>, source: Record<string, number>) {
  for (const [key, count] of Object.entries(source)) target[key] = (target[key] ?? 0) + count;
}

export function createEngine(providers: SoundProvider[], policy: LicencePolicy, cache = new SearchCache()): SearchEngine {
  const cooldownUntil = new Map<string, number>();
  const inFlight = new Map<string, Promise<Sound[]>>();

  function noteRateLimit(provider: SoundProvider, error: unknown) {
    if (error instanceof ProviderError && error.kind === "rate_limited") {
      cooldownUntil.set(provider.id, Date.now() + (error.retryAfterSec ?? 60) * 1000);
    }
  }

  function fetchFromLibrary(provider: SoundProvider, key: string, query: string): Promise<Sound[]> {
    const running = inFlight.get(key);
    if (running) return running;
    const request = provider
      .search({ query, limit: RESULTS_PER_QUERY })
      .then((sounds) => {
        cache.write(key, sounds);
        return sounds;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
  }

  async function queryProvider(provider: SoundProvider, query: string): Promise<Sound[]> {
    const key = `${provider.id}:${query.toLowerCase().trim().replace(/\s+/g, " ")}`;
    const cached = cache.read(key);
    if (cached?.fresh) return cached.sounds;

    const until = cooldownUntil.get(provider.id) ?? 0;
    const coolingDown = until > Date.now();
    if (cached) {
      if (!coolingDown) void fetchFromLibrary(provider, key, query).catch((error) => noteRateLimit(provider, error));
      return cached.sounds;
    }
    if (coolingDown) {
      const seconds = Math.ceil((until - Date.now()) / 1000);
      throw new ProviderError("rate_limited", `Rate limited. Retrying in ${seconds}s.`, seconds);
    }
    return fetchFromLibrary(provider, key, query);
  }

  async function runProvider(provider: SoundProvider, queries: string[], filters: SearchFilters): Promise<ProviderOutcome> {
    const report: SourceReport = {
      id: provider.id,
      label: provider.label,
      status: "ok",
      message: null,
      found: 0,
      blocked: 0,
    };
    const disabled =
      provider.disabledReason() ??
      (!provider.reviewed && !filters.includeUnreviewed ? "Off. Nobody reviews its licence claims." : null);
    if (disabled) return { report: { ...report, status: "disabled", message: disabled }, sounds: [] };

    const settled = await Promise.allSettled(queries.map((query) => queryProvider(provider, query)));
    const sounds = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
    const failure = settled.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") {
      const error = failure.reason;
      noteRateLimit(provider, error);
      report.status = error instanceof ProviderError && error.kind === "rate_limited" ? "rate_limited" : "error";
      report.message = error instanceof Error ? error.message : "Search failed.";
    }
    return { report, sounds };
  }

  return {
    async search(interpretation, filters) {
      const outcomes = await Promise.all(providers.map((provider) => runProvider(provider, interpretation.queries, filters)));

      const blocked: BlockedSummary = { total: 0, byLicence: {} };
      const unique = new Map<string, Sound>();
      const queryRanks = new Map<string, number>();

      for (const outcome of outcomes) {
        // The same recording often comes back from several queries of one library.
        const distinct = [...new Map(outcome.sounds.map((sound) => [sound.id, sound])).values()];
        const { allowed, byLicence } = gate(distinct, policy);
        outcome.report.found = allowed.length;
        outcome.report.blocked = distinct.length - allowed.length;
        blocked.total += outcome.report.blocked;
        merge(blocked.byLicence, byLicence);
        allowed.forEach((sound, index) => {
          if (!unique.has(sound.id)) unique.set(sound.id, sound);
          queryRanks.set(sound.id, Math.min(queryRanks.get(sound.id) ?? Infinity, index));
        });
      }

      const ranked = rankSounds([...unique.values()], interpretation, queryRanks);
      return {
        interpretation,
        results: applyFilters(ranked, filters).slice(0, MAX_RESULTS),
        sources: outcomes.map((outcome) => outcome.report),
        blocked,
      };
    },
  };
}
