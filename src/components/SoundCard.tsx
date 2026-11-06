import { useState } from "react";
import { webHost } from "../../shared/links";
import type { Library, RankedSound, Sound } from "../../shared/types";
import { ApiFailure, api } from "../api";
import { usePlayer } from "../player";
import { useApp } from "../state";
import { Waveform } from "./Waveform";

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "–";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

function formatSize(bytes: number | null): string | null {
  if (!bytes) return null;
  return bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`;
}

function fileLine(sound: Sound): string {
  const { original } = sound;
  if (!original.available) return `${(sound.previewFormat ?? "audio").toUpperCase()} preview only`;
  const parts = [original.format?.toUpperCase(), original.lossless ? "lossless" : null];
  if (original.sampleRate) parts.push(`${(original.sampleRate / 1000).toFixed(1)} kHz`);
  if (original.bitDepth) parts.push(`${original.bitDepth}-bit`);
  parts.push(formatSize(original.sizeBytes));
  if (original.needsLogin) parts.push("needs Freesound login");
  return parts.filter(Boolean).join(" · ");
}

function LicenceBadge({ sound, open, onClick }: { sound: Sound; open: boolean; onClick: () => void }) {
  const declared = sound.licenceReview === "declared";
  const tone = sound.licenceReview === "unreviewed" ? "warn" : declared ? "declared" : sound.licence.attributionRequired ? "credit" : "free";
  const credit = sound.licence.attributionRequired ? "credit required" : "no credit";
  const text = `${declared ? "Your declaration" : "Commercial OK"} · ${credit}`;
  return (
    <button className={`licence ${tone}`} aria-expanded={open} onClick={onClick}>
      <strong>{sound.licence.label}</strong> {text}
    </button>
  );
}

function LicenceDetails({ sound }: { sound: Sound }) {
  const { licence } = sound;
  const sourceHost = webHost(sound.sourcePageUrl);
  const copy = () => void navigator.clipboard.writeText(sound.attribution ?? "");
  return (
    <div className="details">
      {sound.licenceReview === "unreviewed" && (
        <p className="caution">
          The uploader set this licence and nobody has reviewed it. Check that they own the recording before you clear it.
        </p>
      )}
      {sound.licenceReview === "declared" && (
        <p className="caution">
          This is the licence you declared for this folder. Local files carry no licence data, so Sonic Scout hasn't checked it.
        </p>
      )}
      <dl>
        <dt>Licence</dt>
        <dd>
          {webHost(licence.url) ? (
            <a href={licence.url!} target="_blank" rel="noreferrer">{licence.label}</a>
          ) : (
            licence.label
          )}
        </dd>
        <dt>Creator</dt>
        <dd>{webHost(sound.creatorUrl) ? <a href={sound.creatorUrl!} target="_blank" rel="noreferrer">{sound.creator}</a> : sound.creator}</dd>
        <dt>{sound.licenceReview === "declared" ? "Declaration" : "Source says"}</dt>
        <dd><code>{licence.evidence.rawValue}</code> in {licence.evidence.field}</dd>
        <dt>{sound.licenceReview === "declared" ? "Declared" : "Checked"}</dt>
        <dd>
          {new Date(licence.evidence.checkedAt).toLocaleString()}.
          {sound.licenceReview === "declared" ? " Your current declaration is read again when you save." : " Checked again when you download."}
        </dd>
        <dt>{sourceHost ? "Source page" : "Source"}</dt>
        <dd>{sourceHost ? <a href={sound.sourcePageUrl} target="_blank" rel="noreferrer">{sound.sourcePageUrl}</a> : sound.sourcePageUrl}</dd>
      </dl>
      {sound.attribution && (
        <div className="credit-line">
          <span>Credit line</span>
          <p>{sound.attribution}</p>
          <button className="text" onClick={copy}>Copy</button>
        </div>
      )}
    </div>
  );
}

function CollectionMenu({ sound, library, onDone }: { sound: Sound; library: Library; onDone: () => void }) {
  const { setLibrary, notify, go } = useApp();
  if (library.projects.length === 0) {
    return (
      <div className="menu">
        <p>No projects yet.</p>
        <button className="text" onClick={() => go("projects")}>Create a project</button>
      </div>
    );
  }
  return (
    <div className="menu">
      {library.projects.map((project) => (
        <div key={project.id}>
          <h4>{project.name}</h4>
          {project.collections.length === 0 && <p>No collections</p>}
          {project.collections.map((collection) => (
            <button
              key={collection.id}
              onClick={async () => {
                setLibrary(await api.addToCollection(project.id, collection.id, sound));
                notify(`Added to ${collection.name}`);
                onDone();
              }}
            >
              {collection.name}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

interface Props {
  sound: Sound | RankedSound;
  queue: Sound[];
  target?: { projectId: string; collectionId: string };
  onRemove?: () => void;
}

export function SoundCard({ sound, queue, target, onRemove }: Props) {
  const player = usePlayer();
  const { library, setLibrary, notify } = useApp();
  const [details, setDetails] = useState(false);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmPreview, setConfirmPreview] = useState(false);

  const active = player.current?.id === sound.id;
  const progress = active && player.duration ? player.time / player.duration : null;
  const favourite = library.favourites.some((item) => item.id === sound.id);
  const relevance = "relevance" in sound ? sound : null;
  const sourceHost = webHost(sound.sourcePageUrl);

  async function download(allowPreview: boolean) {
    setBusy(true);
    setConfirmPreview(false);
    try {
      const result = await api.download(sound, target ?? {}, allowPreview);
      setLibrary(await api.library());
      notify(result.alreadyHad ? `Already saved: ${result.record.path}` : `Saved: ${result.record.path}`);
    } catch (error) {
      if (error instanceof ApiFailure && error.code === "preview_only") setConfirmPreview(true);
      else notify(error instanceof Error ? error.message : "Download failed.", true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`card${active ? " active" : ""}`}>
      <button
        className="play"
        aria-label={active && player.playing ? `Pause ${sound.title}` : `Play ${sound.title}`}
        onClick={() => player.play(sound, queue)}
      >
        <span className={active && player.playing ? "icon-pause" : "icon-play"} />
      </button>

      <div className="card-main">
        <div className="card-title">
          <h3 title={sound.title}>{sound.title}</h3>
          <p>{sound.creator} · {sound.providerLabel}</p>
        </div>
        <Waveform
          url={sound.previewUrl}
          progress={progress}
          onSeek={(fraction) => {
            if (active) player.seek(fraction);
            else player.play(sound, queue);
          }}
        />
        <div className="card-meta">
          <LicenceBadge sound={sound} open={details} onClick={() => setDetails(!details)} />
          <span>{formatDuration(sound.durationSec)}</span>
          <span>{fileLine(sound)}</span>
          {relevance && (
            <span
              className="relevance"
              title={`Metadata match, not audio analysis. Matched: ${relevance.matchedTerms.join(", ") || "search rank only"}`}
            >
              {relevance.relevance}% match
            </span>
          )}
          {sourceHost && (
            <a
              className="source-link"
              href={sound.sourcePageUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${sound.title} on ${sourceHost}`}
              title={sound.sourcePageUrl}
            >
              {sourceHost} ↗
            </a>
          )}
        </div>
        {details && <LicenceDetails sound={sound} />}
        {confirmPreview && (
          <div className="confirm">
            <span>The original needs a Freesound login. Save the lossy MP3 preview instead?</span>
            <button className="text" onClick={() => void download(true)}>Save preview</button>
            <button className="text" onClick={() => setConfirmPreview(false)}>Cancel</button>
          </div>
        )}
      </div>

      <div className="card-actions">
        <button
          className={`icon-button${favourite ? " on" : ""}`}
          aria-pressed={favourite}
          aria-label="Favourite"
          title="Favourite (F)"
          onClick={async () => setLibrary(await api.toggleFavourite(sound))}
        >
          {favourite ? "★" : "☆"}
        </button>
        <div className="menu-anchor">
          <button className="icon-button" aria-label="Add to collection" title="Add to collection" onClick={() => setMenu(!menu)}>＋</button>
          {menu && <CollectionMenu sound={sound} library={library} onDone={() => setMenu(false)} />}
        </div>
        <button className="icon-button" aria-label="Download" title="Download" disabled={busy} onClick={() => void download(false)}>
          {busy ? "…" : "↓"}
        </button>
        {onRemove && <button className="icon-button" aria-label="Remove" title="Remove" onClick={onRemove}>×</button>}
      </div>
    </article>
  );
}
