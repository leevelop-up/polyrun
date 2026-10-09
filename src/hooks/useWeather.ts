import { useEffect, useState } from 'react';
import type { Trip } from '../context/TripContext';
import { DayWeather, fetchWeather } from '../api/geo';
import { dayDate, tripCenter } from '../utils/trip';
import { findTripDestination } from '../data/destinations';

// 예보가 나오는 기간 (서버가 주는 약 9일)
export const FORECAST_DAYS = 9;
const DAY_MS = 86400000;
// 같은 여행지 예보는 앱이 켜져 있는 동안 30분 동안 다시 묻지 않는다
const FRESH_MS = 30 * 60000;
const cache = new Map<string, { at: number; days: DayWeather[] }>();

// 2026-10-09
export const dateKey = (d: Date): string =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

// 여행 일차가 예보 기간 안에 있는지 (지났거나 너무 먼 날은 예보가 없다)
export const inForecastRange = (trip: Pick<Trip, 'startDate'>, dayIdx: number, now = Date.now()): boolean => {
  const d = dayDate(trip, dayIdx);
  if (!d) return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / DAY_MS);
  return diff >= 0 && diff < FORECAST_DAYS;
};

// 날씨를 볼 위치: 직접 고른 도시 → 목적지의 첫 관광지 범위(도시 중심) → 지도 중심.
// 지도 중심은 섬 전체를 보이게 잡은 곳이라 산 위일 수 있다 (제주 → 한라산)
const weatherSpot = (trip: Trip | null | undefined): [number, number] => {
  if (trip?.center) return trip.center;
  const s = trip ? findTripDestination(trip)?.search[0] : undefined;
  return s ? [s[0], s[1]] : tripCenter(trip || null).center;
};

// 여행 일차별 날씨: day 번호 → 예보 (예보가 없는 날은 빠진다)
export function useWeather(trip: Trip | null | undefined): Map<number, DayWeather> {
  // 어느 위치의 예보인지 같이 들고 있는다 (다른 여행으로 바뀐 직후 예전 여행지 날씨를 보여 주지 않게)
  const [got, setGot] = useState<{ key: string; days: DayWeather[] } | null>(null);
  const n = trip?.days.length || 0;
  const wanted = !!trip && Array.from({ length: n }, (_, i) => i).some((i) => inForecastRange(trip, i));
  const center = weatherSpot(trip);
  const key = center[0].toFixed(2) + ',' + center[1].toFixed(2);

  useEffect(() => {
    if (!wanted) return;
    const hit = cache.get(key);
    if (hit) setGot({ key, days: hit.days });
    if (hit && Date.now() - hit.at < FRESH_MS) return;
    const ctrl = new AbortController();
    fetchWeather(center[0], center[1], ctrl.signal)
      .then((d) => {
        cache.set(key, { at: Date.now(), days: d });
        setGot({ key, days: d });
      })
      // 날씨는 없어도 일정은 그대로 쓸 수 있으니 조용히 넘어간다
      .catch(() => undefined);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, wanted]);

  const out = new Map<number, DayWeather>();
  if (!trip || !wanted || got?.key !== key) return out;
  const byDate = new Map(got.days.map((d) => [d.date, d]));
  for (let i = 0; i < n; i++) {
    const d = dayDate(trip, i);
    const w = d && byDate.get(dateKey(d));
    if (w) out.set(i, w);
  }
  return out;
}
