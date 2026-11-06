import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Collection, DownloadRecord, Library, Project, Sound, SoundFolder } from "../../shared/types";

export class StoreError extends Error {}

export class Store {
  private library: Library;
  private file: string;
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private dataDir: string,
    defaultDownloadRoot: string,
  ) {
    this.file = join(dataDir, "library.json");
    const fresh: Library = { downloadRoot: defaultDownloadRoot, favourites: [], projects: [], downloads: [], soundFolders: [] };
    this.library = existsSync(this.file)
      ? { ...fresh, ...(JSON.parse(readFileSync(this.file, "utf8")) as Partial<Library>) }
      : fresh;
  }

  snapshot(): Library {
    return this.library;
  }

  /** Writes are serial and atomic, so a crash cannot leave half a library file. */
  private save(): Promise<void> {
    const text = JSON.stringify(this.library, null, 2);
    this.writing = this.writing.then(async () => {
      await mkdir(this.dataDir, { recursive: true });
      const temporary = `${this.file}.tmp`;
      await writeFile(temporary, text);
      await rename(temporary, this.file);
    });
    return this.writing;
  }

  async setDownloadRoot(path: string) {
    this.library.downloadRoot = path;
    await this.save();
  }

  async toggleFavourite(sound: Sound) {
    const index = this.library.favourites.findIndex((item) => item.id === sound.id);
    if (index >= 0) this.library.favourites.splice(index, 1);
    else this.library.favourites.unshift(sound);
    await this.save();
  }

  async createProject(name: string, collectionNames: string[]): Promise<Project> {
    const project: Project = {
      id: randomUUID(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      collections: collectionNames.map((collection) => this.newCollection(collection)),
    };
    this.library.projects.unshift(project);
    await this.save();
    return project;
  }

  async deleteProject(projectId: string) {
    this.library.projects = this.library.projects.filter((project) => project.id !== projectId);
    await this.save();
  }

  private newCollection(name: string): Collection {
    return { id: randomUUID(), name: name.trim(), items: [] };
  }

  project(projectId: string): Project {
    const project = this.library.projects.find((item) => item.id === projectId);
    if (!project) throw new StoreError("Project not found.");
    return project;
  }

  collection(projectId: string, collectionId: string): Collection {
    const collection = this.project(projectId).collections.find((item) => item.id === collectionId);
    if (!collection) throw new StoreError("Collection not found.");
    return collection;
  }

  async addCollection(projectId: string, name: string): Promise<Collection> {
    const collection = this.newCollection(name);
    this.project(projectId).collections.push(collection);
    await this.save();
    return collection;
  }

  async deleteCollection(projectId: string, collectionId: string) {
    const project = this.project(projectId);
    project.collections = project.collections.filter((item) => item.id !== collectionId);
    await this.save();
  }

  async addToCollection(projectId: string, collectionId: string, sound: Sound) {
    const collection = this.collection(projectId, collectionId);
    if (collection.items.some((item) => item.sound.id === sound.id)) return;
    collection.items.push({ sound, addedAt: new Date().toISOString() });
    await this.save();
  }

  async removeFromCollection(projectId: string, collectionId: string, soundId: string) {
    const collection = this.collection(projectId, collectionId);
    collection.items = collection.items.filter((item) => item.sound.id !== soundId);
    await this.save();
  }

  async addSoundFolder(folder: SoundFolder) {
    this.library.soundFolders.push(folder);
    await this.save();
  }

  async updateSoundFolder(folderId: string, changes: Partial<SoundFolder>) {
    const folder = this.library.soundFolders.find((item) => item.id === folderId);
    if (!folder) throw new StoreError("Folder not found.");
    Object.assign(folder, changes);
    await this.save();
  }

  async removeSoundFolder(folderId: string) {
    this.library.soundFolders = this.library.soundFolders.filter((folder) => folder.id !== folderId);
    await this.save();
  }

  async recordDownload(record: DownloadRecord) {
    this.library.downloads.unshift(record);
    await this.save();
  }
}
