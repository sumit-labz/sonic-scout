import { useEffect, useRef, useState } from "react";
import { webHost } from "../shared/links";
import { audioUrl } from "./api";

const BARS = 120;
const MAX_DECODE_BYTES = 20 * 1024 * 1024;
const MAX_CONCURRENT = 3;
const STORE_PREFIX = "peaks:";
const TIMEOUT_MS = 30_000;
/** Commons and the Archive serve whole originals and run on donations, so their outlines wait until the sound is played. */
const WAITS_FOR_PLAY = /(^|\.)(wikimedia|archive)\.org$/;

const cache = new Map<string, Float32Array | null>();
const waiting: Array<() => void> = [];
let running = 0;
let audioContext: OfflineAudioContext | null = null;

function context(): OfflineAudioContext {
  audioContext ??= new OfflineAudioContext(1, 1, 22050);
  return audioContext;
}

/** Saved outlines mean a sound seen once never downloads just to draw itself. Storage may be unavailable, which only costs time. */
function readSaved(url: string): Float32Array | undefined {
  try {
    const saved = localStorage.getItem(STORE_PREFIX + url);
    return saved ? Float32Array.from(saved.split(","), (value) => Number(value) / 255) : undefined;
  } catch {
    return undefined;
  }
}

function save(url: string, peaks: Float32Array) {
  try {
    localStorage.setItem(STORE_PREFIX + url, Array.from(peaks, (peak) => Math.round(peak * 255)).join(","));
  } catch {
    // Full or blocked.
  }
}

async function slot<T>(run: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await run();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

function toPeaks(buffer: AudioBuffer): Float32Array {
  const samples = buffer.getChannelData(0);
  const peaks = new Float32Array(BARS);
  const size = Math.max(1, Math.floor(samples.length / BARS));
  let loudest = 0;
  for (let bar = 0; bar < BARS; bar++) {
    let peak = 0;
    const end = Math.min(samples.length, (bar + 1) * size);
    // Sampling a stride keeps long files quick and barely changes the outline.
    for (let index = bar * size; index < end; index += 16) peak = Math.max(peak, Math.abs(samples[index] ?? 0));
    peaks[bar] = peak;
    loudest = Math.max(loudest, peak);
  }
  return loudest > 0 ? peaks.map((peak) => peak / loudest) : peaks;
}

async function loadPeaks(url: string): Promise<Float32Array | null> {
  // Freesound's low-quality preview has the same outline for half the download.
  const response = await fetch(audioUrl(url.replace(/-hq\.mp3$/, "-lq.mp3")), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Audio returned ${response.status}.`);
  if (Number(response.headers.get("content-length") ?? 0) > MAX_DECODE_BYTES) return null;
  return toPeaks(await context().decodeAudioData(await response.arrayBuffer()));
}

/** Real peaks decoded from the recording. Null when it can't be measured, never faked. */
export function useWaveform(url: string, visible: boolean, playing: boolean) {
  const [peaks, setPeaks] = useState<Float32Array | null | undefined>(() => {
    const known = cache.get(url) ?? readSaved(url);
    if (known) cache.set(url, known);
    return cache.has(url) ? cache.get(url) : undefined;
  });
  const started = useRef(false);
  const played = useRef(false);
  if (playing) played.current = true;
  const ready = visible && (played.current || !WAITS_FOR_PLAY.test(webHost(url) ?? ""));

  useEffect(() => {
    if (!ready || started.current || cache.has(url)) return;
    started.current = true;
    let live = true;
    slot(() => loadPeaks(url))
      .then((result) => {
        cache.set(url, result);
        if (result) save(url, result);
        if (live) setPeaks(result);
      })
      // A failed fetch may just be a rate limit, so the next search tries again.
      .catch(() => {
        if (live) setPeaks(null);
      });
    return () => {
      live = false;
    };
  }, [url, ready]);

  return peaks;
}
