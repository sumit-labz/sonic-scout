import { createContext, useContext } from "react";
import type { Library } from "../shared/types";

export type View = "search" | "browse" | "favourites" | "projects" | "settings";

export interface AppState {
  library: Library;
  setLibrary: (library: Library) => void;
  notify: (message: string, isError?: boolean) => void;
  go: (view: View) => void;
  runSearch: (prompt: string) => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const state = useContext(AppContext);
  if (!state) throw new Error("useApp needs AppContext");
  return state;
}
