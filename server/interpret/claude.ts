import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Interpretation } from "../../shared/types";
import { parseDuration } from "./rules";

const Schema = z.object({
  source: z.string(),
  category: z.enum(["human", "environment", "foley", "mechanical", "musical", "cinematic", "abstract", "unknown"]),
  rhythm: z.string().nullable(),
  speed: z.string().nullable(),
  emotion: z.array(z.string()),
  texture: z.array(z.string()),
  perspective: z.array(z.string()),
  queries: z.array(z.string()),
});

const SYSTEM = `You help a film sound designer search sound-effect libraries such as Freesound and Wikimedia Commons. Those libraries are keyword searched against titles and tags written by the recordists.

Read the description and extract:
- source: the physical thing making the sound, in two or three plain words ("school bell", "human heartbeat")
- category: the best fit
- rhythm and speed: only if stated, otherwise null
- emotion: the feelings asked for, capitalised
- texture: acoustic qualities, as single lowercase words ("muffled", "metallic")
- perspective: where the listener is, as single lowercase words ("distant", "corridor")
- queries: 3 or 4 short keyword searches, best first. Two to four words each. Use concrete words recordists would type as tags. Emotions rarely appear in tags, so translate them into sonic words instead ("unsettling" becomes "eerie" or "dark"). The first query must be the bare source.

Your output steers a keyword search only. Never state what any actual recording sounds like.`;

const FORMAT = { type: "json_schema" as const, schema: z.toJSONSchema(Schema) };

export interface ClaudeInterpreter {
  interpret(prompt: string): Promise<Interpretation>;
}

export function claudeInterpreter(apiKey: string, model: string): ClaudeInterpreter {
  const client = new Anthropic({ apiKey, timeout: 15_000, maxRetries: 1 });

  return {
    async interpret(prompt) {
      const message = await client.beta.messages.create({
        model,
        max_tokens: 4000,
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
        output_config: { effort: "low", format: FORMAT },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      if (message.stop_reason === "refusal") throw new Error("Claude declined this description.");
      if (message.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off.");
      const text = message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
      const parsed = Schema.parse(JSON.parse(text));
      return {
        engine: "claude",
        ...parsed,
        // Durations are read from the words directly so they cannot be invented.
        duration: parseDuration(prompt.toLowerCase()),
        queries: [...new Set(parsed.queries.map((query) => query.trim()).filter(Boolean))].slice(0, 4),
        note: null,
      };
    },
  };
}
