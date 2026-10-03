// 지오코딩 백엔드(server/index.ts) 호출.
// 웹 개발 중에는 vite 프록시가 /api 를 백엔드로 넘기고,
// Capacitor 앱 빌드에서는 VITE_API_BASE 에 배포된 백엔드 주소를 넣는다.
import type { Category } from '../context/TripContext';
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || '';

// 검색 범위: 중심 좌표와 반경(km). 반경이 없으면 서버 기본값(800km)
export type SearchArea = { lat: number; lng: number; radiusKm?: number };

export type GeoSearchResult = { name: string; label: string; lat: number; lng: number; cat?: Category };

export const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
  const res = await fetch(`${API_BASE}/api/reverse?lat=${lat}&lng=${lng}`);
  if (!res.ok) throw new Error('reverse geocoding failed');
  const data = (await res.json()) as { name: string | null };
  return data.name;
};

type SearchOpts = { full?: boolean; city?: boolean; near?: SearchArea; signal?: AbortSignal };

// full=false: 입력 중 자동완성(Photon), full=true: Enter 확정 검색(Nominatim 포함), city=true: 도시만 검색
export const searchPlaces = async (q: string, opts: SearchOpts = {}): Promise<GeoSearchResult[]> => (await searchPlacesDetailed(q, opts)).results;

// partial: 검색 서버 하나가 응답하지 않아 결과가 빠졌을 수 있음
export const searchPlacesDetailed = async (q: string, opts: SearchOpts = {}): Promise<{ results: GeoSearchResult[]; partial: boolean }> => {
  const params = new URLSearchParams({ q });
  if (opts.full) params.set('full', '1');
  if (opts.city) params.set('kind', 'city');
  if (opts.near) {
    params.set('lat', opts.near.lat.toFixed(4));
    params.set('lng', opts.near.lng.toFixed(4));
    if (opts.near.radiusKm) params.set('radius', String(Math.round(opts.near.radiusKm)));
  }
  const res = await fetch(`${API_BASE}/api/search?${params.toString()}`, { signal: opts.signal });
  if (!res.ok) throw new Error('search failed');
  const data = (await res.json()) as { results: GeoSearchResult[]; partial?: boolean };
  return { results: data.results, partial: !!data.partial };
};

// 연속한 두 지점 사이 실제 길 기준 이동 시간
export type RouteLeg = { walkMin: number; driveMin: number; km: number };

export const fetchRouteLegs = async (points: { lat: number; lng: number }[], signal?: AbortSignal): Promise<RouteLeg[]> => {
  const q = points.map((p) => p.lat.toFixed(5) + ',' + p.lng.toFixed(5)).join(';');
  const res = await fetch(`${API_BASE}/api/route?points=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error('route failed');
  return ((await res.json()) as { legs: RouteLeg[] }).legs;
};

// 모든 지점 쌍 사이 이동 시간: legs[i][j] 는 i -> j (같은 지점이거나 길을 못 찾으면 null)
export const fetchRouteMatrix = async (points: { lat: number; lng: number }[], signal?: AbortSignal): Promise<(RouteLeg | null)[][]> => {
  const q = points.map((p) => p.lat.toFixed(5) + ',' + p.lng.toFixed(5)).join(';');
  const res = await fetch(`${API_BASE}/api/matrix?points=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error('matrix failed');
  return ((await res.json()) as { legs: (RouteLeg | null)[][] }).legs;
};

// 두 지점 사이 실제 길 모양 (이동 중 화면). coords 는 [lat, lng], distance 는 m, duration 은 초
export type RoutePath = { coords: [number, number][]; distance: number; duration: number };

export const fetchPath = async (a: { lat: number; lng: number }, b: { lat: number; lng: number }, profile: 'foot' | 'car', signal?: AbortSignal): Promise<RoutePath> => {
  const q = [a, b].map((p) => p.lat.toFixed(5) + ',' + p.lng.toFixed(5)).join(';');
  const res = await fetch(`${API_BASE}/api/path?points=${encodeURIComponent(q)}&profile=${profile}`, { signal });
  if (!res.ok) throw new Error('path failed');
  return (await res.json()) as RoutePath;
};
