import { useCallback, useEffect, useState } from 'react';
import type { Place } from '../context/TripContext';
import { fetchRouteLegs, fetchRouteMatrix, RouteLeg } from '../api/geo';
import type { LegLookup } from '../utils/trip';

// 실제 길 기준 이동 시간: 일차별 장소 목록에서 연속한 두 곳 사이 시간을 서버(OSRM)에서 받아 온다.
// 받은 구간은 앱이 켜져 있는 동안 기억해서, 순서를 바꾸거나 일차를 오가도 다시 묻지 않는다.
// null: 길로 갈 수 없는 구간(섬). 다시 묻지 않고 직선거리로 추정한다
const cache = new Map<string, RouteLeg | null>();
// 실패한 요청은 잠시 다시 묻지 않는다 (서버 장애 중 화면이 바뀔 때마다 요청하지 않도록)
const failedUntil = new Map<string, number>();
const RETRY_MS = 60000;

type Pt = { lat: number; lng: number };
const hasCoord = (p: Place): p is Place & Pt => typeof p.lat === 'number' && typeof p.lng === 'number';
const ptKey = (p: Pt) => p.lat.toFixed(5) + ',' + p.lng.toFixed(5);
const legKey = (a: Pt, b: Pt) => ptKey(a) + '>' + ptKey(b);

// 아직 시간을 모르는 구간이 있는 일차의 좌표 목록 ("lat,lng;lat,lng")
const pendingDays = (days: Place[][]): string[] =>
  days
    .map((d) => d.filter(hasCoord))
    .filter((pts) => pts.slice(1).some((p, i) => !cache.has(legKey(pts[i], p))))
    .map((pts) => pts.map(ptKey).join(';'));

// 자동 정렬 전에 장소들 사이 모든 구간의 시간을 한 번에 받아 둔다 (OSRM table).
// 이미 다 알고 있으면 묻지 않는다. 받지 못하면 false (호출한 쪽은 직선거리 추정으로 정렬).
const MAX_MATRIX_POINTS = 30;
// 길 찾기 서버가 느리면 이만큼만 기다리고 직선거리 추정으로 정렬한다 ("동선 계산 중…"이 계속 떠 있지 않게)
const MATRIX_WAIT_MS = 12000;
export async function loadAllLegs(places: Place[]): Promise<boolean> {
  const seen = new Set<string>();
  const pts = places.filter(hasCoord).filter((p) => {
    const k = ptKey(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (pts.length < 2) return false;
  if (pts.every((a) => pts.every((b) => a === b || cache.has(legKey(a, b))))) return true;
  if (pts.length > MAX_MATRIX_POINTS) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MATRIX_WAIT_MS);
  try {
    const legs = await fetchRouteMatrix(pts, ctrl.signal);
    legs.forEach((row, i) => row.forEach((leg, j) => leg && cache.set(legKey(pts[i], pts[j]), leg)));
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function useRouteLegs(days: Place[][]): LegLookup {
  // 새 구간을 받으면 화면을 다시 그리기 위한 값
  const [, setVersion] = useState(0);
  const reqKey = pendingDays(days).join('|');

  useEffect(() => {
    if (!reqKey) return;
    const ctrl = new AbortController();
    // 드래그·연속 추가 중에는 잠깐 기다렸다가 한 번만 묻는다
    const timer = setTimeout(async () => {
      for (const day of reqKey.split('|')) {
        if (ctrl.signal.aborted) return;
        if ((failedUntil.get(day) || 0) > Date.now()) continue;
        const pts = day.split(';').map((s) => {
          const [lat, lng] = s.split(',').map(Number);
          return { lat, lng };
        });
        try {
          const legs = await fetchRouteLegs(pts, ctrl.signal);
          legs.forEach((leg, i) => cache.set(legKey(pts[i], pts[i + 1]), leg));
          setVersion((v) => v + 1);
        } catch {
          if (!ctrl.signal.aborted) failedUntil.set(day, Date.now() + RETRY_MS);
        }
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [reqKey]);

  return useCallback((a: Place, b: Place) => (hasCoord(a) && hasCoord(b) ? cache.get(legKey(a, b)) || undefined : undefined), []);
}
