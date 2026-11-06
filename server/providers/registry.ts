import type { Config } from "../config";
import { archiveProvider } from "./archive";
import { freesoundAuth, freesoundProvider, type FreesoundAuth } from "./freesound";
import { openverseProvider } from "./openverse";
import type { SoundProvider } from "./types";
import { wikimediaProvider } from "./wikimedia";

export interface ProviderSet {
  providers: SoundProvider[];
  freesound: FreesoundAuth;
}

export function buildProviders(config: Config): ProviderSet {
  const freesound = freesoundAuth({
    clientId: config.freesoundClientId,
    // Freesound uses the API key as the OAuth client secret.
    clientSecret: config.freesoundKey,
    dataDir: config.dataDir,
    userAgent: config.userAgent,
  });
  return {
    freesound,
    providers: [
      freesoundProvider({ apiKey: config.freesoundKey, auth: freesound, userAgent: config.userAgent }),
      openverseProvider(config.userAgent, config.freesoundKey),
      wikimediaProvider(config.userAgent),
      archiveProvider(config.userAgent),
    ],
  };
}

/** Hosts the audio proxy may fetch from, including redirects. */
const AUDIO_HOSTS = [/^cdn\.freesound\.org$/, /^freesound\.org$/, /^upload\.wikimedia\.org$/, /^archive\.org$/, /^[a-z0-9-]+\.(us\.)?archive\.org$/];

export function isAllowedAudioHost(hostname: string): boolean {
  return AUDIO_HOSTS.some((pattern) => pattern.test(hostname));
}
