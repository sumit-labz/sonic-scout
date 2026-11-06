import { useState, type FormEvent } from "react";
import { CATEGORIES } from "../../shared/categories";
import type { AppStatus, Collection, Project } from "../../shared/types";
import { api } from "../api";
import { useApp } from "../state";
import { SoundCard } from "./SoundCard";

const FILM_TEMPLATE = ["Environmental Atmosphere", "Human Body", "Psychological Tension", "Childhood Memories", "Musical Motifs"];

export function BrowseView() {
  const { runSearch } = useApp();
  return (
    <>
      <header className="page"><h1>Browse</h1></header>
      <div className="categories">
        {CATEGORIES.map((category) => (
          <section key={category.id}>
            <h2>{category.name}</h2>
            <div className="chips">
              {category.terms.map((term) => <button key={term} onClick={() => runSearch(term)}>{term}</button>)}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

export function FavouritesView() {
  const { library, go } = useApp();
  return (
    <>
      <header className="page"><h1>Favourites</h1></header>
      {library.favourites.length === 0 ? (
        <div className="empty">
          <h2>Nothing starred yet.</h2>
          <button className="text" onClick={() => go("search")}>Go scouting</button>
        </div>
      ) : (
        <div className="results">
          {library.favourites.map((sound) => <SoundCard key={sound.id} sound={sound} queue={library.favourites} />)}
        </div>
      )}
    </>
  );
}

function CollectionPanel({ project, collection }: { project: Project; collection: Collection }) {
  const { setLibrary, notify } = useApp();
  const [saving, setSaving] = useState<string | null>(null);
  const queue = collection.items.map((item) => item.sound);

  async function downloadAll() {
    let saved = 0;
    const skipped: string[] = [];
    for (const [index, sound] of queue.entries()) {
      setSaving(`${index + 1} of ${queue.length}`);
      try {
        await api.download(sound, { projectId: project.id, collectionId: collection.id });
        saved++;
      } catch (error) {
        skipped.push(`${sound.title}: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
    setSaving(null);
    setLibrary(await api.library());
    notify(
      skipped.length ? `Saved ${saved}, skipped ${skipped.length}. ${skipped[0]}` : `Saved ${saved} to ${collection.name}`,
      skipped.length > 0,
    );
  }

  return (
    <section className="collection">
      <header>
        <h3>{collection.name}</h3>
        <span>{queue.length} {queue.length === 1 ? "sound" : "sounds"}</span>
        {queue.length > 0 && (
          <button className="text" disabled={saving !== null} onClick={() => void downloadAll()}>
            {saving ? `Saving ${saving}…` : "Download all"}
          </button>
        )}
        <button className="text quiet" onClick={async () => setLibrary(await api.deleteCollection(project.id, collection.id))}>Delete</button>
      </header>
      {queue.length === 0 && <p className="hint">Use ＋ on any sound to add it here.</p>}
      {queue.map((sound) => (
        <SoundCard
          key={sound.id}
          sound={sound}
          queue={queue}
          target={{ projectId: project.id, collectionId: collection.id }}
          onRemove={async () => setLibrary(await api.removeFromCollection(project.id, collection.id, sound.id))}
        />
      ))}
    </section>
  );
}

function ProjectPanel({ project }: { project: Project }) {
  const { setLibrary } = useApp();
  const [name, setName] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setLibrary(await api.addCollection(project.id, name));
    setName("");
  }

  return (
    <article className="project">
      <header>
        <h2>{project.name}</h2>
        {confirming ? (
          <>
            <span className="hint">Delete project? Saved files stay on disk.</span>
            <button className="text danger" onClick={async () => setLibrary(await api.deleteProject(project.id))}>Delete</button>
            <button className="text" onClick={() => setConfirming(false)}>Keep</button>
          </>
        ) : (
          <button className="text quiet" onClick={() => setConfirming(true)}>Delete project</button>
        )}
      </header>
      {project.collections.map((collection) => <CollectionPanel key={collection.id} project={project} collection={collection} />)}
      <form className="inline" onSubmit={(event) => void add(event)}>
        <input aria-label="New collection name" placeholder="New collection" value={name} onChange={(event) => setName(event.target.value)} />
        <button className="text">Add</button>
      </form>
    </article>
  );
}

export function ProjectsView() {
  const { library, setLibrary } = useApp();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState(true);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setLibrary(await api.createProject(name, template ? FILM_TEMPLATE : []));
    setName("");
  }

  return (
    <>
      <header className="page"><h1>Projects</h1></header>
      <form className="new-project" onSubmit={(event) => void create(event)}>
        <input aria-label="Film project name" placeholder="Film project name" value={name} onChange={(event) => setName(event.target.value)} />
        <label><input type="checkbox" checked={template} onChange={(event) => setTemplate(event.target.checked)} /> Start with film collections</label>
        <button className="primary" disabled={!name.trim()}>Create</button>
      </form>
      {library.projects.map((project) => <ProjectPanel key={project.id} project={project} />)}
    </>
  );
}

export function SettingsView({ status }: { status: AppStatus | null }) {
  const { library, setLibrary, notify } = useApp();
  const [path, setPath] = useState(library.downloadRoot);

  async function choose() {
    const picked = await api.pickFolder();
    if (!picked.path) return;
    setPath(picked.path);
    setLibrary(await api.setDownloadRoot(picked.path));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setLibrary(await api.setDownloadRoot(path));
    notify("Download folder saved");
  }

  return (
    <>
      <header className="page"><h1>Setup</h1></header>
      <section className="settings">
        <h2>Download folder</h2>
        <p className="hint">Files go to Folder / Project / Collection, with an inventory CSV and CREDITS.txt per project. Add this folder to Places in Ableton's browser.</p>
        <form className="inline" onSubmit={(event) => void save(event)}>
          <input aria-label="Download folder" value={path} onChange={(event) => setPath(event.target.value)} />
          <button type="button" className="text" onClick={() => void choose()}>Choose…</button>
          <button className="text">Save</button>
        </form>
      </section>
      <section className="settings">
        <h2>Sound libraries</h2>
        <table>
          <tbody>
            {status?.providers.map((provider) => (
              <tr key={provider.id}>
                <td>{provider.label}</td>
                <td>{provider.enabled ? (provider.reviewed ? "On" : "Opt-in per search") : provider.reason}</td>
                <td>{provider.originals}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {status?.freesoundLogin.available && (
          status.freesoundLogin.connected
            ? <p className="hint">Freesound account connected.</p>
            : <a className="text" href="/api/freesound/oauth/start">Connect Freesound for original files</a>
        )}
      </section>
      <section className="settings">
        <h2>Licence rules</h2>
        <p className="hint">
          Only CC0, public domain and CC BY recordings are shown. CC BY needs the credit line in your film's credits.
          Non-commercial, no-derivatives and unknown licences are always blocked.
          CC BY-SA is {status?.shareAlikeAllowed ? "allowed by your setting" : "blocked, because ShareAlike can extend to a film the sound is synced into"}.
        </p>
      </section>
      <section className="settings">
        <h2>Description reader</h2>
        <p className="hint">{status?.interpreter === "claude" ? `Claude (${status.model})` : "Built-in rules. Add ANTHROPIC_API_KEY to .env for Claude."}</p>
      </section>
    </>
  );
}
