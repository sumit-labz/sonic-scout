import type { Interpretation, RankedSound, Sound } from "../../shared/types";

export function stem(word: string): string {
  return word
    .toLowerCase()
    .replace(/(ing|ings)$/, "")
    .replace(/(ies)$/, "y")
    .replace(/(es|s)$/, "")
    .replace(/(.)\1$/, "$1");
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 1);
}

const IGNORED = new Set(["of", "the", "and", "in", "on", "at", "for", "with", "human"]);

function terms(text: string): string[] {
  return words(text).filter((word) => !IGNORED.has(word));
}

/** Long-form speech and music that happen to share a word with the request. */
const OFF_TARGET = /\b(podcast|episode|interview|lecture|sermon|radio show|audiobook|chapter|song|remix|album|lyrics)\b/i;

interface Fields {
  title: Set<string>;
  tags: Set<string>;
  description: Set<string>;
}

function fieldsOf(sound: Sound): Fields {
  const toStems = (text: string) => new Set(words(text).map(stem));
  return {
    title: toStems(sound.title),
    tags: toStems(sound.tags.join(" ")),
    description: toStems(sound.description),
  };
}

function strength(term: string, fields: Fields): number {
  const value = stem(term);
  if (fields.title.has(value)) return 1;
  if (fields.tags.has(value)) return 0.85;
  if (fields.description.has(value)) return 0.45;
  return 0;
}

function durationFactor(sound: Sound, interpretation: Interpretation): number {
  const hint = interpretation.duration;
  if (!hint || sound.durationSec === null) return 1;
  if (sound.durationSec >= hint.min && sound.durationSec <= hint.max) return 1;
  const ratio = sound.durationSec < hint.min ? sound.durationSec / hint.min : hint.max / sound.durationSec;
  return 0.6 + 0.4 * ratio;
}

const MINIMUM_RELEVANCE = 20;

/**
 * Scores how well a recording's own metadata matches the request. It cannot hear
 * the audio, which is why the UI labels this a metadata match.
 */
export function rankSounds(
  sounds: Sound[],
  interpretation: Interpretation,
  queryRanks: Map<string, number>,
): RankedSound[] {
  const sourceTerms = terms(interpretation.source);
  const descriptive = [
    ...interpretation.perspective,
    ...interpretation.texture,
    ...(interpretation.rhythm ? [interpretation.rhythm] : []),
    ...(interpretation.speed ? [interpretation.speed] : []),
  ].flatMap(terms);
  const expanded = interpretation.queries
    .flatMap(terms)
    .filter((term) => !sourceTerms.includes(term) && !descriptive.includes(term));

  const ranked = sounds.map((sound): RankedSound => {
    const fields = fieldsOf(sound);
    const matched = new Set<string>();
    const score = (list: string[]) => {
      if (list.length === 0) return 0;
      let total = 0;
      for (const term of list) {
        const hit = strength(term, fields);
        total += hit;
        if (hit > 0) matched.add(term);
      }
      return total / list.length;
    };

    const source = score(sourceTerms);
    const detail = score(descriptive);
    const extra = score(expanded);
    const providerRank = queryRanks.get(sound.id) ?? 30;
    const position = 1 / (1 + providerRank / 8);

    // With no descriptive words, their share moves to the source match.
    const base =
      descriptive.length > 0
        ? source * 0.62 + detail * 0.2 + extra * 0.06 + position * 0.12
        : source * 0.76 + extra * 0.1 + position * 0.14;

    const offTarget = interpretation.category !== "musical" && OFF_TARGET.test(`${sound.title} ${sound.tags.join(" ")}`);
    const relevance = Math.round(100 * base * durationFactor(sound, interpretation) * (offTarget ? 0.5 : 1));
    return { ...sound, relevance, matchedTerms: [...matched] };
  });

  return ranked
    .filter((sound) => sound.relevance >= MINIMUM_RELEVANCE)
    .sort((a, b) => b.relevance - a.relevance);
}
