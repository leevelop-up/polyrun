import type { SavedRun } from '../types/run';

const STORAGE_KEY = 'savedRuns';

function safeParse(json: string | null): SavedRun[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export const RunStorage = {
  getAll(): SavedRun[] {
    return safeParse(localStorage.getItem(STORAGE_KEY));
  },

  save(run: SavedRun): void {
    const runs = this.getAll();
    runs.push(run);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  },

  delete(id: string): void {
    const runs = this.getAll().filter((r) => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  },

  updateLabel(id: string, label: string | undefined): void {
    const runs = this.getAll().map((r) =>
      r.id === id ? { ...r, label } : r
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  },
};





