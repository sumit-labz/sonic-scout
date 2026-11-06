import { usePlayer } from "../player";
import { formatDuration } from "./SoundCard";

export function Transport() {
  const player = usePlayer();
  if (!player.current) return null;
  const percent = player.duration ? (player.time / player.duration) * 100 : 0;

  return (
    <footer className="transport">
      <div className="transport-keys">
        <button aria-label="Previous" title="Previous (K)" onClick={() => player.step(-1)}>⏮</button>
        <button className="play" aria-label={player.playing ? "Pause" : "Play"} title="Space" onClick={player.toggle}>
          <span className={player.playing ? "icon-pause" : "icon-play"} />
        </button>
        <button aria-label="Next" title="Next (J)" onClick={() => player.step(1)}>⏭</button>
        <button className={player.loop ? "on" : ""} aria-pressed={player.loop} title="Loop (L)" onClick={() => player.setLoop(!player.loop)}>⟲</button>
      </div>
      <div className="transport-info">
        <strong>{player.current.title}</strong>
        <span>{player.error ?? `${player.current.creator} · ${player.current.licence.label}`}</span>
      </div>
      <button
        className="scrub"
        aria-label="Seek"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          player.seek((event.clientX - rect.left) / rect.width);
        }}
      >
        <i style={{ width: `${percent}%` }} />
      </button>
      <span className="time">{formatDuration(player.time)} / {formatDuration(player.duration || null)}</span>
      <input
        type="range"
        aria-label="Volume"
        min={0}
        max={1}
        step={0.01}
        value={player.volume}
        onChange={(event) => player.setVolume(Number(event.target.value))}
      />
    </footer>
  );
}
