import type { CategoryId, DurationHint, Interpretation } from "../../shared/types";

/** Longest-match list of recordable things, with the category each belongs to. */
const SOURCES: Array<[string, CategoryId]> = [
  ["school bell", "environment"], ["church bell", "environment"], ["bicycle bell", "foley"], ["door bell", "foley"], ["doorbell", "foley"],
  ["railway station", "environment"], ["train station", "environment"], ["steam train", "mechanical"], ["train", "mechanical"],
  ["heartbeat", "human"], ["heart beat", "human"], ["pulse", "human"], ["breathing", "human"], ["breath", "human"], ["whisper", "human"], ["whispers", "human"],
  ["children laughing", "human"], ["children playing", "human"], ["child laughing", "human"], ["baby crying", "human"], ["laughter", "human"], ["laughing", "human"],
  ["crying", "human"], ["sobbing", "human"], ["scream", "human"], ["crowd", "human"], ["footsteps", "foley"], ["clapping", "human"], ["cough", "human"],
  ["wind", "environment"], ["rain", "environment"], ["thunder", "environment"], ["storm", "environment"], ["traffic", "environment"], ["forest", "environment"],
  ["river", "environment"], ["stream", "environment"], ["ocean", "environment"], ["waves", "environment"], ["birdsong", "environment"], ["birds", "environment"],
  ["crickets", "environment"], ["market", "environment"], ["dog barking", "environment"], ["room tone", "environment"], ["corridor", "environment"],
  ["door creak", "foley"], ["door slam", "foley"], ["creaking door", "foley"], ["door", "foley"], ["creak", "foley"], ["fabric", "foley"], ["paper", "foley"], ["glass breaking", "foley"], ["glass", "foley"],
  ["keys", "foley"], ["chair", "foley"], ["furniture", "foley"], ["metal", "foley"], ["water drip", "foley"], ["dripping", "foley"],
  ["ticking clock", "mechanical"], ["clock", "mechanical"], ["ticking", "mechanical"], ["motor", "mechanical"], ["engine", "mechanical"], ["machine", "mechanical"],
  ["electrical hum", "mechanical"], ["fluorescent hum", "mechanical"], ["ventilation", "mechanical"], ["typewriter", "mechanical"], ["elevator", "mechanical"], ["fan", "mechanical"], ["hum", "mechanical"],
  ["bansuri", "musical"], ["tabla", "musical"], ["sitar", "musical"], ["piano", "musical"], ["strings", "musical"], ["violin", "musical"], ["cello", "musical"], ["flute", "musical"], ["percussion", "musical"], ["drum", "musical"],
  ["impact", "cinematic"], ["drone", "cinematic"], ["riser", "cinematic"], ["whoosh", "cinematic"], ["transition", "cinematic"], ["suspense", "cinematic"], ["boom", "cinematic"],
  ["reversed", "abstract"], ["granular", "abstract"], ["glitch", "abstract"], ["distorted voice", "abstract"], ["noise", "abstract"],
  ["bell", "environment"],
];

const PERSPECTIVE: Array<[RegExp, string]> = [
  [/\b(in the distance|distant|far away|far-off|faraway|from afar)\b/, "distant"],
  [/\b(close[- ]?up|close mic|close microphone|up close|intimate)\b/, "close"],
  [/\b(through (a |the )?(closed |shut )?(window|wall|door|floor|ceiling)|muffled|behind (a |the )?(wall|door)|next room)\b/, "muffled"],
  [/\b(empty|abandoned|hollow|cavernous)\b/, "empty"],
  [/\b(corridor|hallway)\b/, "corridor"],
  [/\b(underwater)\b/, "underwater"],
  [/\b(indoors?|interior)\b/, "interior"],
  [/\b(outdoors?|exterior)\b/, "exterior"],
];

/** Emotions rarely appear in tags, so each maps to the words recordists do use. */
const EMOTIONS: Array<[RegExp, string, string[]]> = [
  [/\b(unsettling|uneasy|disturbing|creepy|eerie|haunting)\b/, "Unease", ["eerie", "dark"]],
  [/\b(frightened|scared|afraid|fear|terrified|horror|dread)\b/, "Fear", ["dark", "tense"]],
  [/\b(anxious|anxiety|nervous|tense|tension)\b/, "Anxiety", ["tense"]],
  [/\b(nostalgic|nostalgia|memory|memories|childhood)\b/, "Nostalgia", ["vintage", "old"]],
  [/\b(melanchol\w*|sad|sorrow\w*|mournful|grief|lonely)\b/, "Melancholy", ["soft", "slow"]],
  [/\b(peaceful|calm|serene|gentle|soothing)\b/, "Calm", ["soft", "gentle"]],
  [/\b(joyful|happy|playful|cheerful)\b/, "Joy", ["bright"]],
  [/\b(angry|rage|violent|aggressive)\b/, "Anger", ["harsh"]],
];

const TEXTURES: Array<[RegExp, string]> = [
  [/\b(metallic|metal)\b/, "metallic"], [/\b(low[- ]frequency|deep|bassy|sub)\b/, "deep"], [/\b(muffled|dull)\b/, "muffled"],
  [/\b(wooden|wood)\b/, "wood"], [/\b(glassy|crystalline)\b/, "glass"], [/\b(rumbling|rumble)\b/, "rumble"], [/\b(hollow)\b/, "hollow"],
  [/\b(harsh|gritty|distorted)\b/, "distorted"], [/\b(reverberant|echoing|echoey|reverb)\b/, "reverb"], [/\b(soft)\b/, "soft"], [/\b(sharp|crisp)\b/, "sharp"],
];

const RHYTHM: Array<[RegExp, string]> = [
  [/\b(irregular|erratic|arrhythmic|unsteady|uneven|stuttering)\b/, "Irregular"],
  [/\b(steady|regular|constant|rhythmic)\b/, "Steady"],
];
const SPEED: Array<[RegExp, string]> = [
  [/\b(slow|slowly|sluggish)\b/, "Slow"],
  [/\b(fast|rapid|quick|racing)\b/, "Fast"],
];

const FILLER =
  /\b(find me|find|get me|give me|show me|search for|look for|looking for|i need|i want|i'm after|we need|something like|sound effects?|sfx|recordings?|the sound of|sound of|sounds? like|sounds?|noise of|an?|the|some)\b/g;
const CLAUSE_BREAK = /\b(in|through|from|heard|as if|as though|that|which|with|it should|should|and last\w*|lasting|for about|for around|feels?|feeling|like|behind|at|on|inside|passing)\b|[,.;:]/;
const NOT_SUBJECT =
  /\b(unsettling|nostalgic|melancholic|slightly|very|slow|fast|irregular|steady|distant|faint|quiet|loud|soft|deep|muffled|creepy|eerie|sad|metallic|empty|abandoned)\b/g;

export function parseDuration(text: string): DurationHint | null {
  const unit = (raw: string) => (/^m/i.test(raw) ? 60 : 1);
  const range = text.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(sec\w*|s|min\w*)\b/i);
  if (range) {
    const scale = unit(range[3]!);
    const min = Number(range[1]) * scale;
    const max = Number(range[2]) * scale;
    return { min, max, target: (min + max) / 2 };
  }
  const single = text.match(/(\d+(?:\.\d+)?)\s*[- ]?(sec\w*|s|min\w*)\b/i);
  if (!single) return null;
  const target = Number(single[1]) * unit(single[2]!);
  return { min: target * 0.6, max: target * 1.5, target };
}

function matchAll(text: string, table: Array<[RegExp, string]>): string[] {
  return [...new Set(table.filter(([pattern]) => pattern.test(text)).map(([, value]) => value))];
}

function findSource(text: string): { source: string; category: CategoryId } {
  const longestFirst = [...SOURCES].sort((a, b) => b[0].length - a[0].length);
  // Earliest mention wins, since "wind through a building" is about the wind.
  let best: { index: number; length: number; source: string; category: CategoryId } | null = null;
  for (const [phrase, category] of longestFirst) {
    const index = text.search(new RegExp(`\\b${phrase}\\b`));
    if (index === -1) continue;
    if (!best || index < best.index || (index === best.index && phrase.length > best.length)) {
      best = { index, length: phrase.length, source: phrase, category };
    }
  }
  if (best) return { source: best.source, category: best.category };

  const stripped = text.replace(FILLER, " ").replace(/\s+/g, " ").trim();
  const clause = stripped.split(CLAUSE_BREAK)[0] ?? stripped;
  const subject = clause.replace(NOT_SUBJECT, " ").replace(/\s+/g, " ").trim();
  return { source: subject || stripped.split(" ").slice(0, 3).join(" "), category: "unknown" };
}

export function buildQueries(parts: {
  source: string;
  perspective: string[];
  texture: string[];
  emotionWords: string[];
  rhythm: string | null;
}): string[] {
  const { source } = parts;
  const modifiers = [...parts.perspective, ...parts.texture, parts.rhythm?.toLowerCase()].filter(Boolean) as string[];
  const queries = [source];
  if (modifiers[0]) queries.push(`${modifiers[0]} ${source}`);
  if (modifiers[1]) queries.push(`${modifiers[1]} ${source}`);
  if (parts.emotionWords[0]) queries.push(`${parts.emotionWords[0]} ${source}`);
  return [...new Set(queries)].slice(0, 4);
}

export function interpretWithRules(prompt: string): Interpretation {
  const text = prompt.toLowerCase();
  const { source, category } = findSource(text);
  const perspective = matchAll(text, PERSPECTIVE).filter((word) => !source.includes(word));
  const texture = matchAll(text, TEXTURES).filter((word) => !source.includes(word) && !perspective.includes(word));
  const emotions = EMOTIONS.filter(([pattern]) => pattern.test(text));
  const rhythm = matchAll(text, RHYTHM)[0] ?? null;
  return {
    engine: "rules",
    source,
    category,
    rhythm,
    speed: matchAll(text, SPEED)[0] ?? null,
    emotion: emotions.map(([, name]) => name),
    texture,
    perspective,
    duration: parseDuration(text),
    queries: buildQueries({
      source,
      perspective,
      texture,
      emotionWords: emotions.flatMap(([, , words]) => words),
      rhythm,
    }),
    note: null,
  };
}
