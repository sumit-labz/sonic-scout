import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { join } from "node:path";
import { createApp } from "./app";
import { AudioCache } from "./cache/audioCache";
import { SearchCache } from "./cache/searchCache";
import { loadConfig } from "./config";
import { claudeInterpreter } from "./interpret/claude";
import { buildProviders } from "./providers/registry";
import { createEngine } from "./search/engine";
import { Store } from "./store/store";

const config = loadConfig();
const policy = { allowShareAlike: config.allowShareAlike };
const { providers, freesound } = buildProviders(config);

const app = createApp({
  config,
  policy,
  providers,
  freesound,
  store: new Store(config.dataDir, config.defaultDownloadRoot),
  engine: createEngine(providers, policy, new SearchCache(join(config.dataDir, "cache", "search.json"))),
  audioCache: new AudioCache(join(config.dataDir, "cache", "audio")),
  claude: config.anthropicKey ? claudeInterpreter(config.anthropicKey, config.model) : null,
});

if (existsSync("dist")) {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

// Loopback only. Nothing here should be reachable from the network.
serve({ fetch: app.fetch, port: config.port, hostname: "127.0.0.1" }, ({ port }) => {
  console.log(`Sonic Scout API on http://localhost:${port}`);
});
