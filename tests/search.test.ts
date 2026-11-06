import { describe, expect, it } from "vitest";
import type { SearchFilters, Sound } from "../shared/types";
import { ProviderError } from "../server/http";
import { interpretWithRules } from "../server/interpret/rules";
import type { SoundProvider } from "../server/providers/types";
import { applyFilters, createEngine, gate } from "../server/search/engine";
import { rankSounds } from "../server/search/rank";
import { makeSound } from "./helpers";

const filters: SearchFilters = { licence: "cleared", losslessOnly: false, downloadableOriginalOnly: false, includeUnreviewed: false };
const policy = { allowShareAlike: false };

function provider(overrides: Partial<SoundProvider>): SoundProvider {
  return {
    id: "wikimedia",
    label: "Test",
    reviewed: true,
    originals: () => "",
    disabledReason: () => null,
    search: async () => [],
    getById: async () => null,
    resolveDownload: async () => null,
    ...overrides,
  };
}

describe("gate", () => {
  it("removes non-commercial recordings and says why", () => {
    const sounds = [
      makeSound({ id: "a" }),
      makeSound({ id: "b", licenceName: "Attribution NonCommercial" }),
      makeSound({ id: "c", licenceName: "mystery" }),
    ];
    const { allowed, byLicence } = gate(sounds, policy);
    expect(allowed.map((sound) => sound.id)).toEqual(["a"]);
    expect(byLicence).toEqual({ "CC BY-NC": 1, "Unknown licence": 1 });
  });
});

describe("engine", () => {
  const reading = interpretWithRules("school bell");

  it("never returns a blocked recording, whatever the provider sends", async () => {
    const engine = createEngine(
      [provider({ search: async () => [makeSound({ id: "ok" }), makeSound({ id: "nc", licenceName: "CC BY-NC 4.0" })] })],
      policy,
    );
    const response = await engine.search(reading, filters);
    expect(response.results.map((sound) => sound.id)).toEqual(["ok"]);
    expect(response.blocked.total).toBe(1);
  });

  it("counts a recording found by several queries once", async () => {
    const engine = createEngine(
      [provider({ search: async () => [makeSound({ id: "nc", licenceName: "CC BY-NC 4.0" })] })],
      policy,
    );
    const response = await engine.search(interpretWithRules("distant metallic school bell"), filters);
    expect(response.blocked.total).toBe(1);
    expect(response.blocked.byLicence["CC BY-NC"]).toBe(1);
  });

  it("keeps working when one library fails", async () => {
    const engine = createEngine(
      [
        provider({ id: "archive", search: async () => { throw new ProviderError("upstream", "Archive down."); } }),
        provider({ search: async () => [makeSound()] }),
      ],
      policy,
    );
    const response = await engine.search(reading, { ...filters, includeUnreviewed: true });
    expect(response.results).toHaveLength(1);
    expect(response.sources[0]).toMatchObject({ status: "error", message: "Archive down." });
  });

  it("backs off after a rate limit instead of hitting the library again", async () => {
    let calls = 0;
    const engine = createEngine(
      [provider({ search: async () => { calls++; throw new ProviderError("rate_limited", "Slow down.", 120); } })],
      policy,
    );
    expect((await engine.search(reading, filters)).sources[0]?.status).toBe("rate_limited");
    const before = calls;
    expect((await engine.search(interpretWithRules("a different query"), filters)).sources[0]?.status).toBe("rate_limited");
    expect(calls).toBe(before);
  });

  it("does not search an unreviewed library unless asked", async () => {
    let calls = 0;
    const engine = createEngine(
      [provider({ id: "archive", reviewed: false, search: async () => { calls++; return [makeSound()]; } })],
      policy,
    );
    const off = await engine.search(reading, filters);
    expect(calls).toBe(0);
    expect(off.sources[0]?.status).toBe("disabled");
    await engine.search(reading, { ...filters, includeUnreviewed: true });
    expect(calls).toBeGreaterThan(0);
  });

  it("caches repeat queries", async () => {
    let calls = 0;
    const engine = createEngine([provider({ search: async () => { calls++; return []; } })], policy);
    await engine.search(reading, filters);
    const after = calls;
    await engine.search(reading, filters);
    expect(calls).toBe(after);
  });
});

describe("rankSounds", () => {
  const reading = interpretWithRules("a distant school bell, about 10 seconds");
  const rank = (sounds: Sound[]) => rankSounds(sounds, reading, new Map());

  it("prefers title matches over description matches", () => {
    const [first] = rank([
      makeSound({ id: "weak", title: "Field recording", description: "a school bell somewhere" }),
      makeSound({ id: "strong", title: "Distant school bell" }),
    ]);
    expect(first?.id).toBe("strong");
  });

  it("prefers recordings near the requested length", () => {
    const [first] = rank([
      makeSound({ id: "long", durationSec: 300 }),
      makeSound({ id: "right", durationSec: 11 }),
    ]);
    expect(first?.id).toBe("right");
  });

  it("drops recordings that share no words with the request", () => {
    expect(rank([makeSound({ title: "Thunderstorm" })])).toEqual([]);
  });

  it("marks down podcasts that merely mention the subject", () => {
    const results = rank([
      makeSound({ id: "show", title: "School bell podcast episode" }),
      makeSound({ id: "sound", title: "School bell ringing" }),
    ]);
    expect(results[0]?.id).toBe("sound");
  });

  it("matches word forms", () => {
    const results = rankSounds([makeSound({ title: "Bells ringing" })], interpretWithRules("bell"), new Map());
    expect(results[0]?.matchedTerms).toContain("bell");
  });
});

describe("applyFilters", () => {
  const ranked = [
    { ...makeSound({ id: "free" }), relevance: 80, matchedTerms: [] },
    { ...makeSound({ id: "credit", licenceName: "CC BY 4.0" }), relevance: 70, matchedTerms: [] },
  ];

  it("separates credit-free from credit-required", () => {
    expect(applyFilters(ranked, { ...filters, licence: "no-credit" }).map((sound) => sound.id)).toEqual(["free"]);
    expect(applyFilters(ranked, { ...filters, licence: "credit" }).map((sound) => sound.id)).toEqual(["credit"]);
  });
});
