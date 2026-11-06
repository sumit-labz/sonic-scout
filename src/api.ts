import type { GenerateRequest } from "../shared/generate";
import type {
  ApiError,
  AppStatus,
  DownloadResult,
  FolderLicenceKind,
  Library,
  SearchFilters,
  SearchResponse,
  Sound,
} from "../shared/types";

export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiFailure("Sonic Scout's local server isn't responding.", "offline");
  }
  if (!response.ok) {
    const failure = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiFailure(failure?.error ?? `Request failed (${response.status}).`, failure?.code ?? "failed");
  }
  return (await response.json()) as T;
}

// Local files are already served by this app. Everything else goes through the proxy.
export const audioUrl = (url: string) => (url.startsWith("/api/") ? url : `/api/audio?u=${encodeURIComponent(url)}`);

export interface NewFolder {
  path: string;
  name: string;
  licence: FolderLicenceKind;
  creator: string;
  sourceUrl: string;
  customLabel: string;
  customUrl: string;
  confirmed: boolean;
}

export const api = {
  status: () => request<AppStatus>("/api/status"),
  library: () => request<Library>("/api/library"),
  search: (prompt: string, filters: SearchFilters) =>
    request<SearchResponse>("/api/search", "POST", { prompt, filters }),
  toggleFavourite: (sound: Sound) => request<Library>("/api/favourites", "POST", { sound }),
  createProject: (name: string, collections: string[]) =>
    request<Library>("/api/projects", "POST", { name, collections }),
  deleteProject: (id: string) => request<Library>(`/api/projects/${id}`, "DELETE"),
  addCollection: (projectId: string, name: string) =>
    request<Library>(`/api/projects/${projectId}/collections`, "POST", { name }),
  deleteCollection: (projectId: string, collectionId: string) =>
    request<Library>(`/api/projects/${projectId}/collections/${collectionId}`, "DELETE"),
  addToCollection: (projectId: string, collectionId: string, sound: Sound) =>
    request<Library>(`/api/projects/${projectId}/collections/${collectionId}/items`, "POST", { sound }),
  removeFromCollection: (projectId: string, collectionId: string, soundId: string) =>
    request<Library>(`/api/projects/${projectId}/collections/${collectionId}/items`, "DELETE", { soundId }),
  setDownloadRoot: (path: string) => request<Library>("/api/library/download-root", "PUT", { path }),
  generated: () => request<Sound[]>("/api/generated"),
  generate: (body: GenerateRequest) => request<Sound>("/api/generate", "POST", body),
  deleteGenerated: (id: string) => request<Sound[]>(`/api/generated/${id}`, "DELETE"),
  pickFolder: () => request<{ path: string | null }>("/api/pick-folder", "POST"),
  addFolder: (folder: NewFolder) => request<Library>("/api/local/folders", "POST", folder),
  rescanFolder: (id: string) => request<Library>(`/api/local/folders/${id}/rescan`, "POST"),
  removeFolder: (id: string) => request<Library>(`/api/local/folders/${id}`, "DELETE"),
  download: (sound: Sound, target: { projectId?: string; collectionId?: string }, allowPreview = false) =>
    request<DownloadResult>("/api/download", "POST", {
      provider: sound.provider,
      nativeId: sound.nativeId,
      allowPreview,
      ...target,
    }),
};
