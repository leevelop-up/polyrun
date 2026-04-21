import type { LatLng } from '../types/geo';

export interface SavedRoute {
  id: string;
  date: string;
  label?: string;
  distanceM: number;
  path: LatLng[];
}

const KEY = 'savedRoutes';

function safeParse(json: string | null): SavedRoute[] {
  if (!json) return [];
  try {
    const p = JSON.parse(json);
    return Array.isArray(p) ? p : [];
  } catch { return []; }
}

export const RouteStorage = {
  getAll(): SavedRoute[] {
    return safeParse(localStorage.getItem(KEY));
  },
  save(route: SavedRoute): void {
    const all = this.getAll();
    all.push(route);
    localStorage.setItem(KEY, JSON.stringify(all));
  },
  delete(id: string): void {
    localStorage.setItem(KEY, JSON.stringify(this.getAll().filter(r => r.id !== id)));
  },
  updateLabel(id: string, label: string | undefined): void {
    localStorage.setItem(KEY, JSON.stringify(
      this.getAll().map(r => r.id === id ? { ...r, label } : r)
    ));
  },
};
