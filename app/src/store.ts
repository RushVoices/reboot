// Your apps live in this browser (localStorage). Every build or change adds a
// version, so any earlier state can be restored.

export interface Version {
  html: string;
  prompt: string;
  note: string;
  at: number;
  /** The blueprint a remake was built from. */
  plan?: string;
  /** How long the build took, in seconds. */
  secs?: number;
}

export interface Coin {
  mint: string;
  symbol: string;
  at: number;
}

export interface Project {
  id: string;
  name: string;
  created: number;
  updated: number;
  versions: Version[];
  /** Index into versions of the one being shown. */
  current: number;
  publishedUrl?: string;
  publishedVersion?: number;
  coin?: Coin;
}

// Named from the app's first name (NextApp); kept so apps already saved still load.
const KEY = "nextapp.projects.v1";

function readAll(): Project[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeAll(list: Project[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: keep only the 20 most recently updated apps, then give up quietly.
    try { localStorage.setItem(KEY, JSON.stringify(list.sort((a, b) => b.updated - a.updated).slice(0, 20))); } catch { /* ignore */ }
  }
}

export const listProjects = () => readAll().sort((a, b) => b.updated - a.updated);
export const getProject = (id: string) => readAll().find((p) => p.id === id) ?? null;

export function saveProject(p: Project) {
  const list = readAll().filter((x) => x.id !== p.id);
  list.push(p);
  writeAll(list);
}

export function deleteProject(id: string) {
  writeAll(readAll().filter((p) => p.id !== id));
}

export function newProject(name: string): Project {
  const now = Date.now();
  return { id: Math.random().toString(36).slice(2, 10), name, created: now, updated: now, versions: [], current: -1 };
}

/** The app's <title>, or a few words from the first request. */
export function nameFrom(html: string, prompt: string): string {
  const t = html.match(/<title>([^<]{1,60})<\/title>/i)?.[1]?.trim();
  if (t) return t;
  return prompt.split(/\s+/).slice(0, 4).join(" ").replace(/[^\w\s-]/g, "") || "Untitled app";
}
