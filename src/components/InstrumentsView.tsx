import { useMemo, useState } from "react";
import { FAMILIES, HOSTS, INSTRUMENTS, KITS, LEFT_OUT, RIGHTS, type FamilyId, type HostId, type Instrument, type RightsLevel } from "../../shared/instruments";

const GLYPHS: Record<FamilyId, string> = {
  orchestra: "M20 10v44M12 22v32M28 22v32M36 16v38M44 26v28M52 34v20",
  strings: "M32 6v10M24 16h16M26 16c-6 8 4 12-2 20-5 7-1 22 8 22s13-15 8-22c-6-8 4-12-2-20M28 34h8M32 16v28",
  winds: "M8 26v12l10-3h22c8 0 12 7 16 13V16c-4 6-8 13-16 13H18z",
  piano: "M8 18h48v28H8zM16 18v18M24 18v18M32 18v18M40 18v18M48 18v18M8 36h48",
  keys: "M6 24h52v16H6zM14 24v10M22 24v10M34 24v10M42 24v10M50 24v10M12 40v12M52 40v12",
  choir: "M20 24a7 7 0 1 0 0-.1M44 24a7 7 0 1 0 0-.1M8 54c0-12 6-18 12-18s12 6 12 18M32 54c0-12 6-18 12-18s12 6 12 18",
  drums: "M12 26c0-5 9-9 20-9s20 4 20 9-9 9-20 9-20-4-20-9zM12 26v16c0 5 9 9 20 9s20-4 20-9V26M20 6l10 14M44 6L34 20",
  percussion: "M32 8c-10 0-14 10-14 20 0 10-6 14-6 18h40c0-4-6-8-6-18 0-10-4-20-14-20zM26 46c0 5 3 8 6 8s6-3 6-8",
  guitar: "M46 8l10 10-8 4-16 16c3 6 2 11-3 15s-14 2-18-3-4-13 1-17 10-5 15-3l16-16zM24 44l-6-6",
  world: "M32 8a24 24 0 1 0 .1 0M8 32h48M32 8c-14 14-14 34 0 48M32 8c14 14 14 34 0 48",
  synth: "M6 40c6-24 12-24 18 0s12 24 18 0 12-24 16-4",
  texture: "M6 22c10-8 16 8 26 0s16 8 26 0M6 34c10-8 16 8 26 0s16 8 26 0M6 46c10-8 16 8 26 0s16 8 26 0",
  players: "M32 8v30M20 28l12 12 12-12M10 44v10h44V44",
};

function FamilyArt({ family }: { family: FamilyId }) {
  const hue = FAMILIES.find((item) => item.id === family)!.hue;
  return (
    <div className="art" style={{ background: `radial-gradient(120% 120% at 20% 10%, hsl(${hue} 55% 34%), hsl(${hue} 40% 13%))` }} aria-hidden="true">
      <svg viewBox="0 0 64 64"><path d={GLYPHS[family]} /></svg>
    </div>
  );
}

function Picture({ item }: { item: Instrument }) {
  const [failed, setFailed] = useState(false);
  if (!item.image || failed) return <FamilyArt family={item.family} />;
  return <img src={item.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

function InstrumentCard({ item, role }: { item: Instrument; role?: string }) {
  return (
    <article className="instrument">
      <a className="instrument-picture" href={item.url} target="_blank" rel="noreferrer" tabIndex={-1} aria-hidden="true"><Picture item={item} /></a>
      <div className="instrument-body">
        {role && <p className="role">{role}</p>}
        <h3>{item.name}{item.pick && <span className="pick">Start here</span>}</h3>
        <p className="maker">{item.maker}</p>
        <p>{item.blurb}</p>
        {item.caution && <p className="caution">{item.caution}</p>}
        <dl>
          <dt>Runs in</dt><dd>{HOSTS[item.host]}</dd>
          <dt>System</dt><dd>{item.os}{item.size ? `, ${item.size}` : ""}</dd>
          <dt>Sign-up</dt><dd>{item.account ? "Free account or email" : "None mentioned"}</dd>
        </dl>
        <div className="instrument-foot">
          <span className={`right ${item.rights}`} title={RIGHTS[item.rights].detail}>{RIGHTS[item.rights].label}</span>
          <a href={item.url} target="_blank" rel="noreferrer">Get it ↗</a>
        </div>
      </div>
    </article>
  );
}

export function InstrumentsView() {
  const [family, setFamily] = useState<FamilyId | null>(null);
  const [kitId, setKitId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [host, setHost] = useState<HostId | "">("");
  const [cleared, setCleared] = useState(false);
  const [noKontakt, setNoKontakt] = useState(false);

  const kit = KITS.find((item) => item.id === kitId);
  const matches = useMemo(() => {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    const safe: RightsLevel[] = ["open", "stated", "reported", "credit"];
    return INSTRUMENTS.filter((item) => {
      if (family && item.family !== family) return false;
      if (host && item.host !== host) return false;
      if (cleared && !safe.includes(item.rights)) return false;
      if (noKontakt && item.host === "kontakt") return false;
      const haystack = `${item.name} ${item.maker} ${item.blurb} ${FAMILIES.find((f) => f.id === item.family)!.name}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  }, [family, host, cleared, noKontakt, text]);

  const pickFamily = (id: FamilyId) => { setKitId(null); setFamily(family === id ? null : id); };
  const pickKit = (id: string) => { setFamily(null); setKitId(kitId === id ? null : id); };
  const groups = FAMILIES.map((f) => ({ ...f, items: matches.filter((item) => item.family === f.id).sort((a, b) => Number(!!b.pick) - Number(!!a.pick)) })).filter((group) => group.items.length > 0);

  return (
    <div className="instruments">
      <header className="page">
        <h1>Instruments</h1>
        <p className="lede">{INSTRUMENTS.length} free instruments for scoring in Ableton Live, checked on 7 November 2026. Pick a cue type or an instrument family.</p>
      </header>

      <h2 className="section-title">Start from the cue</h2>
      <div className="kits">
        {KITS.map((item) => (
          <button key={item.id} className={kitId === item.id ? "on" : ""} aria-pressed={kitId === item.id} onClick={() => pickKit(item.id)}>
            <strong>{item.name}</strong><span>{item.brief}</span>
          </button>
        ))}
      </div>

      <h2 className="section-title">Or from the instrument</h2>
      <div className="families">
        {FAMILIES.map((item) => (
          <button key={item.id} className={family === item.id ? "on" : ""} aria-pressed={family === item.id} onClick={() => pickFamily(item.id)}>
            <FamilyArt family={item.id} />
            <span>{item.name}</span>
            <small>{INSTRUMENTS.filter((entry) => entry.family === item.id).length}</small>
          </button>
        ))}
      </div>

      {kit ? (
        <section aria-label={kit.name}>
          <div className="group-head"><h2>{kit.name}</h2><button className="text" onClick={() => setKitId(null)}>Show everything</button></div>
          <p className="kit-note">A suggested starting palette. Install the players it needs first.</p>
          <div className="instrument-grid">
            {kit.parts.map((part) => <InstrumentCard key={part.role + part.id} item={INSTRUMENTS.find((entry) => entry.id === part.id)!} role={part.role} />)}
          </div>
        </section>
      ) : (
        <>
          <div className="instrument-filters">
            <input aria-label="Search instruments" placeholder="Search: cello, sitar, felt, FM…" value={text} onChange={(event) => setText(event.target.value)} />
            <select aria-label="Runs in" value={host} onChange={(event) => setHost(event.target.value as HostId | "")}>
              <option value="">Runs in anything</option>
              {Object.entries(HOSTS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <label><input type="checkbox" checked={noKontakt} onChange={(event) => setNoKontakt(event.target.checked)} /> No Kontakt</label>
            <label title="Hides anything still marked Read the licence."><input type="checkbox" checked={cleared} onChange={(event) => setCleared(event.target.checked)} /> Commercial use confirmed or reported</label>
            <span className="count">{matches.length} shown</span>
          </div>
          {groups.length === 0 && <div className="empty"><h2>Nothing matches.</h2><p>Try fewer filters.</p></div>}
          {groups.map((group) => (
            <section key={group.id} aria-label={group.name}>
              <div className="group-head"><h2>{group.name}</h2><span>{group.items.length}</span></div>
              <div className="instrument-grid">{group.items.map((item) => <InstrumentCard key={item.id} item={item} />)}</div>
            </section>
          ))}
        </>
      )}

      <details className="instrument-notes">
        <summary>Installing in Ableton, and what "free" means here</summary>
        <ul>
          <li><strong>Getting them into Live:</strong> install the plugin, then in Live open Settings, Plug-Ins and turn on the VST3 system folders. On Windows that's <code>C:\Program Files\Common Files\VST3</code>. Press Rescan if it doesn't appear.</li>
          <li><strong>Kontakt Player:</strong> anything marked Kontakt Player runs in it for free. Libraries made for full Kontakt only run for 15 minutes in the Player.</li>
          <li><strong>32-bit plugins:</strong> Live is 64-bit only, so they won't load.</li>
          <li><strong>Licences:</strong> hover a badge for what it means. Read the licence itself before delivering paid work. Almost all of these let you use the music you make, but not resell the samples.</li>
          <li><strong>This isn't every free plugin.</strong> Thousands exist. This is what could be confirmed as free, usable in 2026 and worth a scorer's time. Pianobook alone has more packs than this whole page.</li>
          <li><strong>Pictures</strong> load from each maker's website when you open this page. Instruments without one, or whose picture can't load, show a drawn icon.</li>
          <li><strong>Left out on purpose:</strong> {LEFT_OUT.map((item) => `${item.name}: ${item.why}`).join(" ")}</li>
        </ul>
      </details>
    </div>
  );
}
