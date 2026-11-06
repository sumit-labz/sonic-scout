import { afterEach, describe, expect, it, vi } from "vitest";
import { interpretWithRules, parseDuration } from "../server/interpret/rules";

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { create } };
  },
}));

const { claudeInterpreter } = await import("../server/interpret/claude");

describe("interpretWithRules", () => {
  it("reads the school bell brief", () => {
    const reading = interpretWithRules(
      "Find me a school bell ringing in the distance, heard through a closed window. It should feel nostalgic, slightly melancholic, and last approximately 10 seconds.",
    );
    expect(reading.source).toBe("school bell");
    expect(reading.perspective).toEqual(expect.arrayContaining(["distant", "muffled"]));
    expect(reading.emotion).toEqual(expect.arrayContaining(["Nostalgia", "Melancholy"]));
    expect(reading.duration?.target).toBe(10);
    expect(reading.queries[0]).toBe("school bell");
  });

  it("reads the heartbeat brief", () => {
    const reading = interpretWithRules("An unsettling heartbeat, slow and irregular, as if someone is frightened.");
    expect(reading.source).toBe("heartbeat");
    expect(reading.category).toBe("human");
    expect(reading.rhythm).toBe("Irregular");
    expect(reading.speed).toBe("Slow");
    expect(reading.emotion).toContain("Fear");
    expect(reading.queries.length).toBeGreaterThan(1);
  });

  it("falls back to the opening noun phrase for unknown subjects", () => {
    expect(interpretWithRules("I need a rusty gate in the night").source).toBe("rusty gate");
  });

  it("never returns an empty query list", () => {
    for (const prompt of ["ok", "a", "something unsettling"]) {
      expect(interpretWithRules(prompt).queries.length).toBeGreaterThan(0);
    }
  });
});

describe("parseDuration", () => {
  it("reads ranges and units", () => {
    expect(parseDuration("5-15 seconds")).toMatchObject({ min: 5, max: 15 });
    expect(parseDuration("2 minutes")?.target).toBe(120);
    expect(parseDuration("10s")?.target).toBe(10);
  });

  it("does not invent a duration", () => {
    expect(parseDuration("a slow bell")).toBeNull();
  });
});

describe("claudeInterpreter", () => {
  const answer = {
    source: "school bell",
    category: "environment",
    rhythm: null,
    speed: null,
    emotion: ["Nostalgia"],
    texture: ["muffled"],
    perspective: ["distant"],
    queries: ["school bell", "distant bell", "distant bell"],
  };

  function reply(text: string, stop_reason = "end_turn") {
    return { stop_reason, content: [{ type: "text", text }] };
  }

  afterEach(() => create.mockReset());

  it("parses the reading and takes duration from the user's own words", async () => {
    create.mockResolvedValue(reply(JSON.stringify(answer)));
    const reading = await claudeInterpreter("key", "claude-opus-5-5").interpret("a distant bell for 10 seconds");
    expect(reading.engine).toBe("claude");
    expect(reading.duration?.target).toBe(10);
    expect(reading.queries).toEqual(["school bell", "distant bell"]);
  });

  it("rejects malformed output and refusals so the rule reader can take over", async () => {
    create.mockResolvedValue(reply('{"source":1}'));
    await expect(claudeInterpreter("key", "m").interpret("x")).rejects.toThrow();
    create.mockResolvedValue(reply("", "refusal"));
    await expect(claudeInterpreter("key", "m").interpret("x")).rejects.toThrow(/declined/);
  });
});
