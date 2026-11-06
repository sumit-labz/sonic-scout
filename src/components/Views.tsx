import { useState, type FormEvent } from "react";
import { CATEGORIES } from "../../shared/categories";
import type { AppStatus, Collection, FolderLicenceKind, Project, SoundFolder } from "../../shared/types";
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

const FOLDER_LICENCES: Array<[FolderLicenceKind, string]> = [
  ["sonniss-gdc", "Sonniss GDC bundle"],
  ["own", "My own recordings"],
  ["cc0", "CC0"],
  ["cc-by", "CC BY (credit required)"],
  ["custom", "Another licence"],
  ["unsure", "Not sure yet (stays blocked)"],
];

const FOLDER_CONFIRMATIONS: Record<Exclude<FolderLicenceKind, "unsure" | "sonniss-gdc">, string> = {
  own: "I recorded these sounds myself and hold the rights.",
  cc0: "I've checked that these sounds were released under CC0.",
  "cc-by": "I've checked that these sounds were released under CC BY.",
  custom: "I've read this licence, and it allows commercial use in a film.",
};

function folderLicenceName(folder: SoundFolder): string {
  if (folder.licence === "custom") return folder.customLabel ?? "Another licence";
  return FOLDER_LICENCES.find(([kind]) => kind === folder.licence)?.[1] ?? folder.licence;
}

function SoundFolders() {
  const { library, setLibrary, notify } = useApp();
  const blank = { path: "", name: "", creator: "", sourceUrl: "", customLabel: "", customUrl: "" };
  const [form, setForm] = useState(blank);
  const [licence, setLicence] = useState<FolderLicenceKind | "">("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const field = (key: keyof typeof blank, label: string, placeholder = label) => (
    <input
      aria-label={label}
      placeholder={placeholder}
      value={form[key]}
      onChange={(event) => setForm({ ...form, [key]: event.target.value })}
    />
  );

  async function choose() {
    const picked = await api.pickFolder();
    if (picked.path) setForm({ ...form, path: picked.path });
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!licence) return;
    setBusy("add");
    try {
      const next = await api.addFolder({ ...form, licence, confirmed });
      setLibrary(next);
      const added = next.soundFolders[next.soundFolders.length - 1];
      notify(added ? `Found ${added.fileCount.toLocaleString()} sounds in ${added.name}` : "Folder added");
      setForm(blank);
      setLicence("");
      setConfirmed(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not add that folder.", true);
    } finally {
      setBusy(null);
    }
  }

  async function rescan(id: string) {
    setBusy(id);
    try {
      setLibrary(await api.rescanFolder(id));
      notify("Folder rescanned");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not rescan that folder.", true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="settings">
      <h2>Your sound folders</h2>
      <p className="hint">
        Search packs you've already downloaded alongside the online libraries. Files stay where they are, and filenames never leave this computer.
        Audio files carry no licence, so you declare one for each folder. Sonic Scout can't check what you declare.
      </p>
      {library.soundFolders.length > 0 && (
        <table className="folders">
          <tbody>
            {library.soundFolders.map((folder) => (
              <tr key={folder.id}>
                <td title={folder.path}>{folder.name}</td>
                <td>{folderLicenceName(folder)}</td>
                <td>
                  {folder.fileCount.toLocaleString()} {folder.fileCount === 1 ? "sound" : "sounds"}
                  {folder.truncated ? " (limit reached, so some were skipped)" : ""}
                </td>
                <td className="folder-actions">
                  {removing === folder.id ? (
                    <>
                      <span className="hint">Your files won't be deleted.</span>
                      <button
                        className="text danger"
                        onClick={async () => {
                          setLibrary(await api.removeFolder(folder.id));
                          setRemoving(null);
                        }}
                      >
                        Remove
                      </button>
                      <button className="text" onClick={() => setRemoving(null)}>Keep</button>
                    </>
                  ) : (
                    <>
                      <button className="text" disabled={busy !== null} onClick={() => void rescan(folder.id)}>
                        {busy === folder.id ? "Rescanning…" : "Rescan"}
                      </button>
                      <button className="text quiet" onClick={() => setRemoving(folder.id)}>Remove</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form className="folder-form" onSubmit={(event) => void add(event)}>
        <div className="inline">
          {field("path", "Folder path", "Folder path, like D:\\Sounds\\Sonniss GDC 2026")}
          <button type="button" className="text" onClick={() => void choose()}>Choose…</button>
        </div>
        <div className="inline">
          {field("name", "Folder name", "Name (optional)")}
          <select
            aria-label="Licence for this folder"
            value={licence}
            onChange={(event) => {
              setLicence(event.target.value as FolderLicenceKind | "");
              setConfirmed(false);
            }}
          >
            <option value="">What licence covers these sounds?</option>
            {FOLDER_LICENCES.map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
          </select>
        </div>
        {licence === "cc-by" && (
          <div className="inline">
            {field("creator", "Creator name")}
            {field("sourceUrl", "Web link for the credit", "Web link for the credit")}
          </div>
        )}
        {licence === "custom" && (
          <div className="inline">
            {field("customLabel", "Licence name")}
            {field("customUrl", "Web link to the licence text", "Web link to the licence text")}
          </div>
        )}
        {licence === "unsure" && (
          <p className="hint">These sounds stay out of your results until you add the folder again with a licence. They're counted as blocked.</p>
        )}
        {licence && licence !== "unsure" && (
          <label className="confirm-licence">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>
              {licence === "sonniss-gdc" ? (
                <>
                  These came from a Sonniss GDC bundle, and I've read <a href="https://sonniss.com/gdc-bundle-license" target="_blank" rel="noreferrer">its licence</a>.
                  It allows commercial use including film, but not sharing the sounds themselves or training AI on them.
                </>
              ) : FOLDER_CONFIRMATIONS[licence]}
            </span>
          </label>
        )}
        <button className="primary" disabled={busy !== null || !form.path.trim() || !licence || (licence !== "unsure" && !confirmed)}>
          {busy === "add" ? "Scanning…" : "Add folder"}
        </button>
      </form>
    </section>
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
      <SoundFolders />
      <section className="settings">
        <h2>Sound libraries</h2>
        <table>
          <tbody>
            {status?.providers.filter((provider) => provider.id !== "local").map((provider) => (
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
          Sounds in your own folders use the licence you declare for that folder, and it's labelled as your declaration wherever it appears.
        </p>
      </section>
      <section className="settings">
        <h2>Sound generation</h2>
        <p className="hint">{status?.generation.available ? "On, using your OpenRouter key." : "Add OPENROUTER_API_KEY to .env to generate music and voices."}</p>
      </section>
      <section className="settings">
        <h2>Description reader</h2>
        <p className="hint">{status?.interpreter === "claude" ? `Claude (${status.model})` : "Built-in rules. Add ANTHROPIC_API_KEY to .env for Claude."}</p>
      </section>
    </>
  );
}
