import type { LatLng } from './geo';

export interface SavedRun {
  id: string;
  date: string;
  distance: number;
  time: number;
  avgSpeed: number;
  path: LatLng[];
  label?: string;
  elevations?: number[]; // 각 path 점의 고도(m)
}





