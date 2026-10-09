import type { Category, Place, Trip } from '../context/TripContext';
import { DESTINATIONS, findTripDestination } from '../data/destinations';
import type { RouteLeg, SearchArea } from '../api/geo';
import { normalizeFlightNo } from './flight';

const DAY_MS = 86400000;
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
// 도쿄 기준 기본 지도 중심 좌표 (목적지 정보를 못 찾을 때만 사용)
const FALLBACK_CENTER: [number, number] = [35.6812, 139.7671];

// 여행 일수 (날짜가 없으면 1일)
export const dayCount = (startDate: number | null, endDate: number | null): number => {
  if (!startDate || !endDate) return 1;
  return Math.max(1, Math.round((endDate - startDate) / DAY_MS) + 1);
};

// 여행 n일차의 날짜 (시작일이 없으면 null)
export const dayDate = (trip: Pick<Trip, 'startDate'>, dayIdx: number): Date | null =>
  trip.startDate ? new Date(trip.startDate + dayIdx * DAY_MS) : null;

// "10.5 (월)"
export const fmtDay = (d: Date): string => d.getMonth() + 1 + '.' + d.getDate() + ' (' + DAY_LABELS[d.getDay()] + ')';

// "10.5 (월) – 10.7 (수)"
export const tripRange = (trip: Pick<Trip, 'startDate' | 'endDate'>): string => {
  if (!trip.startDate) return '날짜 미정';
  const s = fmtDay(new Date(trip.startDate));
  if (!trip.endDate || trip.endDate === trip.startDate) return s;
  return s + ' – ' + fmtDay(new Date(trip.endDate));
};

// 지도 시작 위치: 저장된 목적지 좌표 → 목적지 목록 → 이미 추가한 장소 → 기본값 순
export const tripCenter = (trip: Trip | null): { center: [number, number]; zoom: number } => {
  if (trip?.center) return { center: trip.center, zoom: 12 };
  const dest = trip ? findTripDestination(trip) : undefined;
  if (dest) return { center: dest.center, zoom: dest.zoom };
  const placed = trip?.days.flat().find((p) => typeof p.lat === 'number' && typeof p.lng === 'number');
  if (placed) return { center: [placed.lat as number, placed.lng as number], zoom: 13 };
  return { center: FALLBACK_CENTER, zoom: 13 };
};

// 장소 검색 범위: 도시 여행은 근교 당일치기(교토·나라, 요코하마·닛코)까지 150km,
// 여러 도시를 묶은 목적지(LA · 라스베가스 등, 지도 줌이 작음)는 800km.
// 목적지 위치를 모르면 범위 없이 찾는다.
const CITY_RADIUS_KM = 150;
const REGION_RADIUS_KM = 800;
export const tripSearchArea = (trip: Trip | null): SearchArea | undefined => {
  if (!trip) return undefined;
  if (trip.center) return { lat: trip.center[0], lng: trip.center[1], radiusKm: CITY_RADIUS_KM };
  const dest = findTripDestination(trip);
  if (dest) return { lat: dest.center[0], lng: dest.center[1], radiusKm: dest.zoom >= 10 ? CITY_RADIUS_KM : REGION_RADIUS_KM };
  const placed = trip.days.flat().find((p) => typeof p.lat === 'number' && typeof p.lng === 'number');
  if (placed) return { lat: placed.lat as number, lng: placed.lng as number, radiusKm: CITY_RADIUS_KM };
  return undefined;
};

// 보관 기간: 여행이 끝난 날(날짜가 없으면 만든 날)부터 30일
export const RETENTION_DAYS = 30;
// 보관(keep)한 일정은 지우지 않는다
export const tripExpiresAt = (trip: Pick<Trip, 'createdAt' | 'startDate' | 'endDate' | 'keep'>): number =>
  trip.keep ? Infinity : Math.max(trip.createdAt, trip.endDate ?? trip.startDate ?? trip.createdAt) + RETENTION_DAYS * DAY_MS;

// 여행 상태: 출발 전(D-n), 여행 중(n일차), 다녀옴
export type TripStatus = { kind: 'before'; dDay: number } | { kind: 'during'; day: number } | { kind: 'after' } | { kind: 'undated' };
export const tripStatus = (trip: Pick<Trip, 'startDate' | 'endDate'>, now = Date.now()): TripStatus => {
  if (!trip.startDate) return { kind: 'undated' };
  const t = new Date(now);
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const end = trip.endDate ?? trip.startDate;
  if (today < trip.startDate) return { kind: 'before', dDay: Math.round((trip.startDate - today) / DAY_MS) };
  if (today <= end) return { kind: 'during', day: Math.round((today - trip.startDate) / DAY_MS) + 1 };
  return { kind: 'after' };
};

// ---------- 백업 파일 ----------
const BACKUP_APP = 'runtrip-trips';
// 예전 이름으로 저장한 백업도 불러온다
const BACKUP_APPS = [BACKUP_APP, 'polyrun-trips'];
const CATS: Category[] = ['식당', '관광', '쇼핑', '숙박', '교통'];
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const backupJson = (trips: Trip[]): string => JSON.stringify({ app: BACKUP_APP, version: 1, exportedAt: Date.now(), trips }, null, 2);

// 백업 파일을 읽어 일정 목록으로 바꾼다. 형식이 틀린 항목은 버린다. 파일 자체가 틀리면 null.
export const parseBackup = (text: string): Trip[] | null => {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const raw = Array.isArray(data) ? data : BACKUP_APPS.includes((data as { app?: string })?.app || '') ? (data as { trips: unknown }).trips : null;
  if (!Array.isArray(raw)) return null;
  const place = (p: Record<string, unknown>): Place | null => {
    if (typeof p?.id !== 'string' || typeof p.name !== 'string' || !CATS.includes(p.cat as Category)) return null;
    const out: Place = { id: p.id, name: p.name, cat: p.cat as Category };
    if (num(p.lat) && num(p.lng)) {
      out.lat = p.lat;
      out.lng = p.lng;
    }
    if (num(p.x) && num(p.y)) {
      out.x = p.x;
      out.y = p.y;
    }
    if (typeof p.time === 'string' && parseHM(p.time) !== null) out.time = p.time;
    if (num(p.stay) && p.stay >= 0) out.stay = p.stay;
    return out;
  };
  return raw.flatMap((t: Record<string, unknown>) => {
    if (typeof t?.id !== 'string' || typeof t.destination !== 'string' || !Array.isArray(t.days) || !num(t.createdAt)) return [];
    const days = (t.days as unknown[]).map((d) => (Array.isArray(d) ? d.map(place).filter((p): p is Place => !!p) : []));
    const trip: Trip = {
      id: t.id,
      destination: t.destination,
      startDate: num(t.startDate) ? t.startDate : null,
      endDate: num(t.endDate) ? t.endDate : null,
      pax: num(t.pax) ? Math.min(10, Math.max(1, Math.round(t.pax))) : 1,
      days: days.length ? days : [[]],
      createdAt: t.createdAt
    };
    const c = t.center as unknown[];
    if (Array.isArray(c) && num(c[0]) && num(c[1])) trip.center = [c[0], c[1]];
    if (t.keep === true) trip.keep = true;
    if (typeof t.title === 'string' && t.title.trim()) trip.title = t.title.trim().slice(0, 40);
    if (Array.isArray(t.expenses)) {
      const n = trip.days.length;
      trip.expenses = (t.expenses as Record<string, unknown>[]).flatMap((e) =>
        typeof e?.id === 'string' && num(e.day) && num(e.amount) && e.amount >= 0
          ? [{ id: e.id, day: Math.min(n - 1, Math.max(0, Math.round(e.day))), title: typeof e.title === 'string' ? e.title : '', amount: Math.round(e.amount) }]
          : []
      );
    }
    if (t.flights && typeof t.flights === 'object') {
      const f = t.flights as Record<string, { no?: unknown; time?: unknown }>;
      trip.flights = {};
      for (const k of ['out', 'back'] as const) {
        const no = typeof f[k]?.no === 'string' ? normalizeFlightNo(f[k].no as string) : null;
        if (!no) continue;
        trip.flights[k] = { no };
        if (typeof f[k].time === 'string' && parseHM(f[k].time as string) !== null) trip.flights[k]!.time = f[k].time as string;
      }
    }
    if (Array.isArray(t.checklist)) {
      trip.checklist = (t.checklist as Record<string, unknown>[]).flatMap((c) =>
        typeof c?.id === 'string' && typeof c.text === 'string' && c.text.trim()
          ? [{ id: c.id, text: c.text.trim().slice(0, 40), done: c.done === true, group: typeof c.group === 'string' && c.group ? c.group.slice(0, 20) : '내가 추가' }]
          : []
      );
    }
    return [trip];
  });
};

const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

// 두 장소 사이 예상 이동 시간(분). 좌표가 있으면 실제 거리로, 없으면 예전 데이터의 x/y 값으로 어림한다.
export const travelMins = (a: Place, b: Place): number => {
  if (typeof a.lat === 'number' && typeof a.lng === 'number' && typeof b.lat === 'number' && typeof b.lng === 'number') {
    const km = haversineKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
    // 시내 대중교통/도보 섞어서 대략 km당 4분 + 기본 3분, 장거리(50km 이상)는 차량 시속 80km로 계산
    return Math.max(5, Math.round(km < 50 ? km * 4 + 3 : (km / 80) * 60));
  }
  if (typeof a.x === 'number' && typeof a.y === 'number' && typeof b.x === 'number' && typeof b.y === 'number') {
    return Math.max(5, Math.round(Math.hypot(a.x - b.x, (a.y - b.y) * 0.94) * 0.8));
  }
  return 10;
};

// ---------- 하루 시간표 ----------
// 카테고리별 기본 머무는 시간(분)
// 검색 결과 순서: 관광 → 쇼핑 → 숙박 → 교통 → 식당 (서버 server/core.ts 의 CAT_RANK 와 같게)
export const CAT_RANK: Record<Category, number> = { 관광: 0, 쇼핑: 1, 숙박: 2, 교통: 3, 식당: 4 };
// 종류를 모르는 결과는 관광으로 본다
const catRank = (c?: Category) => (c ? CAT_RANK[c] : 0);
const byCat = <T extends { cat?: Category }>(a: T, b: T) => catRank(a.cat) - catRank(b.cat);
// 검색 결과를 관광지 먼저로 (같은 종류 안에서는 원래 순서)
export const sortByCat = <T extends { cat?: Category }>(l: T[]): T[] => [...l].sort(byCat);

export const DEFAULT_STAY: Record<Category, number> = { 식당: 60, 관광: 90, 쇼핑: 60, 숙박: 0, 교통: 15 };
// 첫 장소에 도착 시각을 정하지 않았을 때의 하루 시작 시각
export const DAY_START = '10:00';

export const stayOf = (p: Place): number => p.stay ?? DEFAULT_STAY[p.cat];

// "09:30" -> 570 (형식이 틀리면 null)
export const parseHM = (s: string | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || '');
  if (!m) return null;
  const h = +m[1];
  const min = +m[2];
  return h < 24 && min < 60 ? h * 60 + min : null;
};

// 570 -> "09:30", 자정을 넘기면 "+1" 표시 (1530 -> "01:30+1")
export const fmtHM = (mins: number): string => {
  const d = Math.floor(mins / 1440);
  const m = ((mins % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') + (d > 0 ? '+' + d : '');
};

// 머무는 시간 표시: 90 -> "1시간 30분"
export const fmtStay = (m: number): string => {
  if (m < 60) return m + '분';
  return Math.floor(m / 60) + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : '');
};

// ---------- 이동 수단/시간 ----------
// 실제 길 기준 시간(RouteLeg)이 있으면: 걸어서 이 시간 안이면 도보, 넘으면 차량 시간.
// 없으면(서버 오류, 좌표 없음) 직선거리 추정.
export const WALK_MAX_MIN = 20;
// OSRM 차량 시간은 신호·정체 없이 제한속도로 달린다고 본 값이라 도심에서 크게 짧다 (예: 9.9km 13분).
// 실제에 가깝게 이만큼 늘려 쓴다. 이동 안내 중에는 실제 이동 속도로 다시 계산한다.
export const CAR_TRAFFIC_FACTOR = 1.5;
export const carMins = (osrmMin: number): number => Math.max(1, Math.round(osrmMin * CAR_TRAFFIC_FACTOR));
export type TravelMode = 'walk' | 'car' | 'est';
export interface Travel {
  mins: number;
  mode: TravelMode;
}
export type LegLookup = (a: Place, b: Place) => RouteLeg | undefined;

export const travelBetween = (a: Place, b: Place, legOf?: LegLookup): Travel => {
  const leg = legOf?.(a, b);
  if (leg) return leg.walkMin <= WALK_MAX_MIN ? { mins: Math.max(1, leg.walkMin), mode: 'walk' } : { mins: carMins(leg.driveMin), mode: 'car' };
  return { mins: travelMins(a, b), mode: 'est' };
};

// "도보 8분", "차로 25분", "이동 약 31분"(추정)
export const fmtTravel = (t: Travel): string => {
  if (t.mode === 'walk') return '도보 ' + t.mins + '분';
  if (t.mode === 'car') return '차로 ' + fmtMins(t.mins).replace('약 ', '');
  return '이동 ' + fmtMins(t.mins);
};

export interface ScheduleRow {
  arrive: number; // 도착 (자정부터 분)
  leave: number; // 떠나는 시각 = 도착 + 머무는 시간
  travel: number; // 앞 장소에서 오는 이동 시간 (첫 장소는 0)
  mode: TravelMode; // 이동 시간을 어떻게 구했는지 (첫 장소는 'est')
  fixed: boolean; // 도착 시각을 직접 정했는지
  late: number; // 정한 도착 시각에 맞추려면 모자라는 시간(분): 앞 일정과 겹침
}

// 첫 장소부터 차례로 도착/출발 시각을 계산한다. 도착 시각을 정한 장소는 그 시각에 맞추고(일찍 도착하면 기다림),
// 앞 일정이 늦게 끝나 못 맞추면 late 로 알려준다.
export const daySchedule = (list: Place[], legOf?: LegLookup): ScheduleRow[] => {
  const rows: ScheduleRow[] = [];
  let prevLeave = parseHM(DAY_START) as number;
  list.forEach((p, k) => {
    const t: Travel = k === 0 ? { mins: 0, mode: 'est' } : travelBetween(list[k - 1], p, legOf);
    const travel = t.mins;
    const earliest = k === 0 ? prevLeave : prevLeave + travel;
    const fixedAt = parseHM(p.time);
    // 자정을 넘긴 일정(앞 장소가 23시에 끝남)에서 "01:00"을 정했다면 다음 날 01시로 본다
    const fixed = fixedAt === null ? null : fixedAt + Math.floor(earliest / 1440) * 1440;
    const arrive = fixed ?? earliest;
    const late = fixed !== null && k > 0 ? Math.max(0, earliest - fixed) : 0;
    const leave = arrive + stayOf(p);
    rows.push({ arrive, leave, travel, mode: t.mode, fixed: fixed !== null, late });
    prevLeave = leave;
  });
  return rows;
};

export const fmtMins = (m: number): string => {
  if (m < 90) return '약 ' + m + '분';
  // 10분 단위로 먼저 반올림해야 "2시간 60분"이 아니라 "3시간"이 된다
  const total = Math.round(m / 10) * 10;
  const h = Math.floor(total / 60);
  const r = total % 60;
  return '약 ' + h + '시간' + (r ? ' ' + r + '분' : '');
};

// 마우스만 있는 환경에서는 "스와이프" 안내를 숨긴다
export const isTouchDevice = (): boolean => {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
};

export const readDayParam = (search: string, dayCount: number): number => {
  const n = parseInt(new URLSearchParams(search).get('day') || '', 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(0, n), Math.max(0, dayCount - 1));
};

// 좌표 없이 저장된 예전 장소(가상 지도 좌표 x/y 시절)에 추천 장소 데이터의 좌표를 채운다.
// 이름(또는 다른 표기)이 정확히 같은 추천 장소만 쓴다. 그 목적지의 추천을 먼저 보고, 없으면 다른 목적지도 본다.
const sameName = (a: string, b: string) => a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase();
export const fillMissingCoords = (trips: Trip[]): Trip[] =>
  trips.map((t) => {
    if (t.days.every((d) => d.every((p) => typeof p.lat === 'number'))) return t;
    const own = findTripDestination(t);
    const picks = (own ? [own] : []).concat(DESTINATIONS.filter((d) => d !== own)).flatMap((d) => d.picks);
    let changed = false;
    const days = t.days.map((d) =>
      d.map((p) => {
        if (typeof p.lat === 'number' && typeof p.lng === 'number') return p;
        const hit = picks.find((k) => sameName(k.name, p.name) || (k.aliases || []).some((a) => sameName(a, p.name)));
        if (!hit) return p;
        changed = true;
        return { ...p, lat: hit.lat, lng: hit.lng };
      })
    );
    return changed ? { ...t, days } : t;
  });

// 화면에 보여 줄 일정 이름: 제목이 있으면 제목, 없으면 여행지
export const tripTitle = (t: Pick<Trip, 'title' | 'destination'>): string => t.title?.trim() || t.destination;

// ---------- 사용 금액 ----------
// 일차의 사용 금액 합계 (day 를 빼면 여행 전체)
export const spentOf = (trip: Pick<Trip, 'expenses'>, day?: number): number =>
  (trip.expenses || []).reduce((s, e) => (day === undefined || e.day === day ? s + e.amount : s), 0);

// 12000 -> "12,000원"
export const fmtWon = (n: number): string => n.toLocaleString('ko-KR') + '원';

// 여행지를 부르는 이름들 ("제주, 한국" → 제주, 제주도, 서귀포). 장소 상세정보에서 같은 이름의 다른 지역 문서를 거른다
export const tripRegion = (trip: Pick<Trip, 'destination' | 'center'>): string[] => {
  const parts = trip.destination.split(',')[0].split('·').map((s) => s.trim()).filter(Boolean);
  const dest = findTripDestination(trip);
  return [...new Set([...parts, ...(dest?.aliases || [])])].slice(0, 4);
};
