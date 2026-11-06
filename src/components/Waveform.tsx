import { useEffect, useRef, useState } from "react";
import { useWaveform } from "../waveform";

interface Props {
  url: string;
  progress: number | null;
  onSeek: (fraction: number) => void;
}

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function Waveform({ url, progress, onSeek }: Props) {
  const box = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const peaks = useWaveform(url, visible, progress !== null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) setVisible(true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const scale = window.devicePixelRatio || 1;
    const { width, height } = element.getBoundingClientRect();
    element.width = width * scale;
    element.height = height * scale;
    const draw = element.getContext("2d");
    if (!draw) return;
    draw.scale(scale, scale);
    draw.clearRect(0, 0, width, height);

    const idle = css("--wave");
    const played = css("--accent");
    if (!peaks) {
      draw.fillStyle = idle;
      draw.fillRect(0, height / 2, width, 1);
      return;
    }
    const gap = width / peaks.length;
    peaks.forEach((peak, index) => {
      const bar = Math.max(1, peak * (height - 4));
      draw.fillStyle = progress !== null && index / peaks.length <= progress ? played : idle;
      draw.fillRect(index * gap, (height - bar) / 2, Math.max(1, gap - 1), bar);
    });
  }, [peaks, progress]);

  return (
    <button
      ref={box}
      className="waveform"
      aria-label="Seek in recording"
      title={peaks === null ? "Waveform unavailable for this file" : undefined}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onSeek((event.clientX - rect.left) / rect.width);
      }}
    >
      <canvas ref={canvas} />
    </button>
  );
}
