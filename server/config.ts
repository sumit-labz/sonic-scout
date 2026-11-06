import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  port: number;
  dataDir: string;
  defaultDownloadRoot: string;
  anthropicKey: string | null;
  openrouterKey: string | null;
  model: string;
  freesoundKey: string | null;
  freesoundClientId: string | null;
  allowShareAlike: boolean;
  userAgent: string;
}

function value(name: string): string | null {
  const raw = process.env[name]?.trim();
  return raw ? raw : null;
}

export function loadConfig(): Config {
  const contact = value("SONIC_SCOUT_CONTACT");
  return {
    port: Number(value("SONIC_SCOUT_PORT") ?? 5178),
    dataDir: value("SONIC_SCOUT_DATA") ?? join(process.cwd(), "data"),
    defaultDownloadRoot: join(homedir(), "Music", "Sonic Scout"),
    anthropicKey: value("ANTHROPIC_API_KEY"),
    openrouterKey: value("OPENROUTER_API_KEY"),
    model: value("SONIC_SCOUT_MODEL") ?? "claude-opus-5-5",
    freesoundKey: value("FREESOUND_API_KEY"),
    freesoundClientId: value("FREESOUND_CLIENT_ID"),
    allowShareAlike: value("ALLOW_SHARE_ALIKE") === "true",
    userAgent: `SonicScout/0.1 (${contact ?? "https://github.com/sumit-labz/sonic-scout"})`,
  };
}
