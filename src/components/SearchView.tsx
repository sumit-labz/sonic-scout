import { useMemo, type FormEvent } from "react";
import type { Interpretation, LicenceFilter, SearchFilters, SearchResponse } from "../../shared/types";
import { SoundCard } from "./SoundCard";

const EXAMPLES = [
  "A school bell ringing in the distance, heard through a closed window. Nostalgic, slightly melancholic, about 10 seconds.",
  "An unsettling heartbeat, slow and irregular, as if someone is frightened.",
  "Children laughing in an empty corridor",
  "A metallic ticking sound that feels unsettling",
  "Wind passing through an abandoned building",
];

const LICENCE_OPTIONS: Array<[LicenceFilter, string]> = [
  ["cleared", "All cleared"],
  ["no-credit", "No credit needed"],
  ["credit", "Credit required"],
];

function Reading({ reading }: { reading: Interpretation }) {
  const rows: Array<[string, string | null]> = [
    ["Source", reading.source],
    ["Category", reading.category === "unknown" ? null : reading.category],
    ["Rhythm", reading.rhythm],
    ["Speed", reading.speed],
    ["Emotion", reading.emotion.join(", ") || null],
    ["Texture", reading.texture.join(", ") || null],
    ["Perspective", reading.perspective.join(", ") || null],
    ["Length", reading.duration ? `${Math.round(reading.duration.min)}–${Math.round(reading.duration.max)}s` : null],
  ];
  return (
    <section className="reading" aria-label="How your description was read">
      <div className="reading-grid">
        {rows.filter(([, value]) => value).map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="queries">
        Searched for {reading.queries.map((query) => <code key={query}>{query}</code>)}
        <em>{reading.engine === "claude" ? "Read by Claude" : "Read by built-in rules"}</em>
      </p>
      {reading.note && <p className="note">{reading.note}</p>}
    </section>
  );
}

function SourcesLine({ response }: { response: SearchResponse }) {
  return (
    <div className="sources">
      {/* Only one route to Freesound runs at a time, so the idle one is noise. */}
      {response.sources.filter((source) => source.status !== "disabled" || source.id === "archive").map((source) => (
        <span key={source.id} className={`source ${source.status}`} title={source.message ?? undefined}>
          <i />
          {source.label}
          {source.status === "ok" ? ` ${source.found}` : source.status === "disabled" ? " off" : ` (${source.status === "rate_limited" ? "rate limited" : "failed"})`}
        </span>
      ))}
      {response.blocked.total > 0 && (
        <span
          className="blocked"
          title={Object.entries(response.blocked.byLicence).map(([name, count]) => `${name}: ${count}`).join("\n")}
        >
          {response.blocked.total} blocked by licence
        </span>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-label="Searching" role="status">
      {[0, 1, 2, 3].map((row) => <div key={row} className="card skeleton" />)}
    </div>
  );
}

interface Props {
  prompt: string;
  setPrompt: (prompt: string) => void;
  filters: SearchFilters;
  setFilters: (filters: SearchFilters) => void;
  loading: boolean;
  error: string | null;
  response: SearchResponse | null;
  onSearch: (prompt: string) => void;
}

export function SearchView({ prompt, setPrompt, filters, setFilters, loading, error, response, onSearch }: Props) {
  const results = useMemo(() => response?.results ?? [], [response]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSearch(prompt);
  };
  const failedSources = response?.sources.filter((source) => source.status === "error" || source.status === "rate_limited") ?? [];

  return (
    <>
      <form className={`prompt${response || loading ? " compact" : ""}`} onSubmit={submit}>
        {!response && !loading && <h1>Describe the sound you're hearing.</h1>}
        <div className="prompt-box">
          <textarea
            aria-label="Describe a sound"
            value={prompt}
            rows={response ? 2 : 3}
            placeholder="A distant school bell, heard through a closed window…"
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSearch(prompt);
              }
            }}
          />
          <button className="primary" disabled={loading || prompt.trim().length < 2}>
            {loading ? "Scouting…" : "Scout"}
          </button>
        </div>
      </form>

      {!response && !loading && !error && (
        <div className="examples">
          {EXAMPLES.map((example) => (
            <button key={example} onClick={() => { setPrompt(example); onSearch(example); }}>{example}</button>
          ))}
        </div>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      {loading && <Skeleton />}

      {response && !loading && (
        <>
          <Reading reading={response.interpretation} />
          <div className="filters">
            <div className="segments" role="group" aria-label="Licence">
              {LICENCE_OPTIONS.map(([value, label]) => (
                <button
                  key={value}
                  className={filters.licence === value ? "on" : ""}
                  onClick={() => setFilters({ ...filters, licence: value })}
                >
                  {label}
                </button>
              ))}
            </div>
            <label><input type="checkbox" checked={filters.losslessOnly} onChange={(event) => setFilters({ ...filters, losslessOnly: event.target.checked })} /> Lossless only</label>
            <label><input type="checkbox" checked={filters.downloadableOriginalOnly} onChange={(event) => setFilters({ ...filters, downloadableOriginalOnly: event.target.checked })} /> Original file ready</label>
            <label title="Adds Internet Archive, where nobody reviews the uploader's licence claim"><input type="checkbox" checked={filters.includeUnreviewed} onChange={(event) => setFilters({ ...filters, includeUnreviewed: event.target.checked })} /> Include unreviewed</label>
          </div>
          <SourcesLine response={response} />
          {failedSources.length > 0 && (
            <p className="note">{failedSources.map((source) => source.message).join(" ")}</p>
          )}
          {results.length === 0 ? (
            <div className="empty">
              <h2>No cleared recordings match.</h2>
              <p>
                {response.blocked.total > 0
                  ? `${response.blocked.total} matches were blocked by licence. `
                  : ""}
                Try the plain name of the source, or loosen the filters.
              </p>
            </div>
          ) : (
            <div className="results">
              {results.map((sound) => <SoundCard key={sound.id} sound={sound} queue={results} />)}
            </div>
          )}
        </>
      )}
    </>
  );
}
