// 추천 일정: 목적지의 추천 장소(직접 고른 곳 먼저, 그 뒤 인지도순)로 날마다 가까운 곳끼리 묶어 채운다.
import type { Place } from '../context/TripContext';
import type { Destination, PlacePick } from '../data/destinations';
import { distM } from './nav';

export type Pace = 'easy' | 'normal' | 'busy';
// 하루 관광지 수 (식당이 있는 목적지는 점심 1곳을 더 넣는다)
export const PACE_SIGHTS: Record<Pace, number> = { easy: 3, normal: 4, busy: 6 };
export const PACE_LABEL: Record<Pace, string> = { easy: '여유롭게', normal: '보통', busy: '알차게' };

const newId = () => 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// 하루에 다닐 만한 반경(km): 목적지 범위가 넓을수록(제주, 발리) 넓게
export const daySpreadKm = (dest: Destination): number => {
  const km = Math.max(...dest.search.map((s) => s[2]));
  return Math.min(25, Math.max(3, km / 4));
};

const centroid = (l: PlacePick[]) => ({
  lat: l.reduce((s, p) => s + p.lat, 0) / l.length,
  lng: l.reduce((s, p) => s + p.lng, 0) / l.length
});

// 가까운 곳부터 차례로 잇는다 (정확한 순서는 일정 화면의 "자동 정렬"로 다듬는다)
const nearestOrder = (l: PlacePick[]): PlacePick[] => {
  if (l.length < 3) return l;
  const rest = l.slice(1);
  const out = [l[0]];
  while (rest.length) {
    const last = out[out.length - 1];
    let bi = 0;
    rest.forEach((x, i) => {
      if (distM(last, x) < distM(last, rest[bi])) bi = i;
    });
    out.push(rest.splice(bi, 1)[0]);
  }
  return out;
};

// dayCount 일치 일정을 만든다. exclude 에 있는 이름(이미 일정에 넣은 곳)은 빼고, 모자라면 뒤쪽 날은 비거나 짧아진다.
export function recommendDays(picks: PlacePick[], dayCount: number, pace: Pace, spreadKm: number, exclude: Set<string>): Place[][] {
  // 직접 고른 추천과 관광지 파일에 같은 곳이 겹칠 수 있다: 이름이 같거나 80m 안이면 앞의 것만
  const usable: PlacePick[] = [];
  for (const p of picks) {
    if (p.cat === '숙박' || p.cat === '교통' || exclude.has(p.name) || !Number.isFinite(p.lat)) continue;
    const key = p.name.replace(/\s/g, '');
    if (usable.some((u) => u.name.replace(/\s/g, '') === key || distM(u, p) < 80)) continue;
    usable.push(p);
  }
  const perDay = PACE_SIGHTS[pace];
  const sights = usable.filter((p) => p.cat !== '식당').slice(0, Math.max(60, dayCount * perDay * 3));
  const foods = usable.filter((p) => p.cat === '식당');
  const used = new Set<PlacePick>();
  // 날마다 다른 지역에서 시작한다 (제주: 제주시 → 성산·우도 → 애월·협재 …)
  const seedAreas = new Set<string>();
  const days: Place[][] = [];

  for (let d = 0; d < dayCount; d++) {
    const seed = sights.find((p) => !used.has(p) && !seedAreas.has(p.area)) || sights.find((p) => !used.has(p));
    if (!seed) {
      days.push([]);
      continue;
    }
    used.add(seed);
    seedAreas.add(seed.area);
    const group = [seed];
    // 가까이에 갈 곳이 모자라면(제주, 진주만처럼 띄엄띄엄한 곳) 반경을 두 배씩 넓혀 본다
    for (let reach = spreadKm; group.length < perDay && reach <= Math.max(spreadKm * 4, 40); reach *= 2) {
      while (group.length < perDay) {
        const c = centroid(group);
        // 인지도 순위와 거리를 함께 본다: 1km 멀어지는 것 ≈ 순위 6계단 뒤
        let best: PlacePick | null = null;
        let bestScore = Infinity;
        sights.forEach((p, rank) => {
          if (used.has(p)) return;
          const km = distM(c, p) / 1000;
          if (km > reach) return;
          const score = rank + (km * 6 * spreadKm) / reach;
          if (score < bestScore) {
            bestScore = score;
            best = p;
          }
        });
        if (!best) break;
        used.add(best);
        group.push(best);
      }
    }
    const ordered = nearestOrder(group);
    // 점심: 이 날 동선 가운데쯤에서 가까운 식당
    const c = centroid(group);
    const food = foods
      .filter((f) => !used.has(f) && distM(c, f) / 1000 <= spreadKm)
      .sort((a, b) => distM(c, a) - distM(c, b))[0];
    if (food) {
      used.add(food);
      ordered.splice(Math.min(2, ordered.length), 0, food);
    }
    days.push(ordered.map((p) => ({ id: newId(), name: p.name, cat: p.cat, lat: p.lat, lng: p.lng, ...(p.wd ? { wd: p.wd } : {}) })));
  }
  return days;
}
