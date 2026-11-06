import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Sound } from "../shared/types";
import { audioUrl } from "./api";

interface Player {
  current: Sound | null;
  playing: boolean;
  time: number;
  duration: number;
  loop: boolean;
  volume: number;
  error: string | null;
  play: (sound: Sound, queue?: Sound[]) => void;
  toggle: () => void;
  stop: () => void;
  seek: (fraction: number) => void;
  step: (direction: 1 | -1) => void;
  setLoop: (loop: boolean) => void;
  setVolume: (volume: number) => void;
}

const PlayerContext = createContext<Player | null>(null);

export function usePlayer(): Player {
  const player = useContext(PlayerContext);
  if (!player) throw new Error("usePlayer needs a PlayerProvider");
  return player;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null);
  const queue = useRef<Sound[]>([]);
  const [current, setCurrent] = useState<Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loop, setLoop] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);

  const start = useCallback((sound: Sound) => {
    const element = audio.current;
    if (!element) return;
    setError(null);
    setCurrent(sound);
    setTime(0);
    setDuration(sound.durationSec ?? 0);
    element.src = audioUrl(sound.previewUrl);
    element.play().catch((reason: Error) => {
      if (reason.name !== "AbortError") setError("This preview can't be played.");
    });
  }, []);

  const play = useCallback(
    (sound: Sound, nextQueue?: Sound[]) => {
      if (nextQueue) queue.current = nextQueue;
      if (current?.id === sound.id && audio.current) {
        if (audio.current.paused) void audio.current.play();
        else audio.current.pause();
        return;
      }
      start(sound);
    },
    [current, start],
  );

  const toggle = useCallback(() => {
    const element = audio.current;
    if (!element || !current) return;
    if (element.paused) void element.play();
    else element.pause();
  }, [current]);

  const stop = useCallback(() => {
    const element = audio.current;
    if (!element) return;
    element.pause();
    element.currentTime = 0;
  }, []);

  const seek = useCallback((fraction: number) => {
    const element = audio.current;
    if (element && Number.isFinite(element.duration)) element.currentTime = fraction * element.duration;
  }, []);

  const step = useCallback(
    (direction: 1 | -1) => {
      const list = queue.current;
      if (list.length === 0) return;
      const index = list.findIndex((sound) => sound.id === current?.id);
      const next = list[index === -1 ? 0 : index + direction];
      if (next) start(next);
    },
    [current, start],
  );

  const value = useMemo(
    () => ({ current, playing, time, duration, loop, volume, error, play, toggle, stop, seek, step, setLoop, setVolume }),
    [current, playing, time, duration, loop, volume, error, play, toggle, stop, seek, step],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audio}
        loop={loop}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration);
        }}
        onError={() => {
          setPlaying(false);
          if (audio.current?.getAttribute("src")) setError("This preview can't be played.");
        }}
      />
    </PlayerContext.Provider>
  );
}
