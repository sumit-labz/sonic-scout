import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppStatus, Library, SearchFilters, SearchResponse } from "../shared/types";
import { api } from "./api";
import { SearchView } from "./components/SearchView";
import { Transport } from "./components/Transport";
import { BrowseView, FavouritesView, ProjectsView, SettingsView } from "./components/Views";
import { usePlayer } from "./player";
import { AppContext, type AppState, type View } from "./state";

const NAV: Array<[View, string]> = [
  ["search", "Scout"],
  ["browse", "Browse"],
  ["favourites", "Favourites"],
  ["projects", "Projects"],
  ["settings", "Setup"],
];

const DEFAULT_FILTERS: SearchFilters = {
  licence: "cleared",
  losslessOnly: false,
  downloadableOriginalOnly: false,
  includeUnreviewed: false,
};

export function App() {
  const player = usePlayer();
  const [view, setView] = useState<View>("search");
  const [library, setLibrary] = useState<Library | null>(null);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null);

  const [prompt, setPrompt] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const lastPrompt = useRef("");
  const searchId = useRef(0);

  useEffect(() => {
    let live = true;
    // The web server can come up a moment before the API does.
    async function boot(attemptsLeft: number) {
      try {
        const [nextLibrary, nextStatus] = await Promise.all([api.library(), api.status()]);
        if (!live) return;
        setLibrary(nextLibrary);
        setStatus(nextStatus);
      } catch (reason) {
        if (!live) return;
        if (attemptsLeft > 0) setTimeout(() => void boot(attemptsLeft - 1), 500);
        else setFatal(reason instanceof Error ? reason.message : "Could not start.");
      }
    }
    void boot(16);
    return () => {
      live = false;
    };
  }, []);

  const notify = useCallback((message: string, isError = false) => setToast({ message, isError }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.isError ? 9000 : 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const search = useCallback(async (text: string, nextFilters: SearchFilters) => {
    if (text.trim().length < 2) return;
    const id = ++searchId.current;
    lastPrompt.current = text;
    setLoading(true);
    setError(null);
    try {
      const result = await api.search(text, nextFilters);
      if (id === searchId.current) setResponse(result);
    } catch (reason) {
      if (id === searchId.current) {
        setResponse(null);
        setError(reason instanceof Error ? reason.message : "Search failed.");
      }
    } finally {
      if (id === searchId.current) setLoading(false);
    }
  }, []);

  const runSearch = useCallback(
    (text: string) => {
      setPrompt(text);
      setView("search");
      void search(text, filters);
    },
    [filters, search],
  );

  const changeFilters = useCallback(
    (next: SearchFilters) => {
      setFilters(next);
      if (lastPrompt.current) void search(lastPrompt.current, next);
    },
    [search],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName) && event.key === " ") {
        if (target.tagName !== "BUTTON") return;
      }
      if (["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === " ") {
        event.preventDefault();
        player.toggle();
      } else if (key === "j" || key === "arrowdown") {
        event.preventDefault();
        player.step(1);
      } else if (key === "k" || key === "arrowup") {
        event.preventDefault();
        player.step(-1);
      } else if (key === "l") {
        player.setLoop(!player.loop);
      } else if (key === "f" && player.current) {
        void api.toggleFavourite(player.current).then(setLibrary);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player]);

  const state = useMemo<AppState | null>(
    () => (library ? { library, setLibrary, notify, go: setView, runSearch } : null),
    [library, notify, runSearch],
  );

  if (fatal) {
    return <main className="boot"><h1>Sonic Scout can't start</h1><p>{fatal}</p><p>Is the server running? Try <code>npm run dev</code>.</p></main>;
  }
  if (!state) return <main className="boot" role="status">Loading…</main>;

  return (
    <AppContext.Provider value={state}>
      <div className={`shell${player.current ? " has-transport" : ""}`}>
        <nav aria-label="Main">
          <div className="brand">Sonic Scout</div>
          {NAV.map(([id, label]) => (
            <button key={id} className={view === id ? "on" : ""} aria-current={view === id ? "page" : undefined} onClick={() => setView(id)}>
              {label}
              {id === "favourites" && library!.favourites.length > 0 && <span>{library!.favourites.length}</span>}
            </button>
          ))}
          <p className="keys"><kbd>Space</kbd> play <kbd>J</kbd><kbd>K</kbd> next, previous <kbd>F</kbd> favourite <kbd>L</kbd> loop</p>
        </nav>
        <main>
          {view === "search" && (
            <SearchView
              prompt={prompt}
              setPrompt={setPrompt}
              filters={filters}
              setFilters={changeFilters}
              loading={loading}
              error={error}
              response={response}
              onSearch={(text) => void search(text, filters)}
            />
          )}
          {view === "browse" && <BrowseView />}
          {view === "favourites" && <FavouritesView />}
          {view === "projects" && <ProjectsView />}
          {view === "settings" && <SettingsView status={status} />}
        </main>
        <Transport />
      </div>
      {toast && <div className={`toast${toast.isError ? " bad" : ""}`} role="status">{toast.message}</div>}
    </AppContext.Provider>
  );
}
