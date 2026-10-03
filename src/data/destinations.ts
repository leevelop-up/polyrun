import type { Category } from '../context/TripContext';
// 직접 고른 추천 장소. scripts/picks-source.json 을 고친 뒤 `node scripts/geocode-picks.mjs` 로 좌표를 채워 생성한다.
import picksData from './picks.json';
// 목적지 100곳 (이름, 지도 위치, Wikidata 에서 관광지를 받을 범위)
import citiesData from './cities.json';

export interface PlacePick {
  name: string;
  cat: Category;
  area: string;
  lat: number;
  lng: number;
  // 영어/현지 이름, 한국어 별칭 등 다른 표기 (추천 목록 검색용)
  aliases?: string[];
  // Wikidata 항목 ID (장소 상세정보: 사진·설명·위키백과)
  wd?: string;
}

export interface Destination {
  id: string;
  name: string;
  code: string;
  center: [number, number];
  zoom: number;
  // 추천 장소를 묶는 지역 (화면의 지역 칩 순서). 직접 고른 추천이 있는 목적지만 있다.
  areas: string[];
  // 직접 고른 추천 장소 (바로 쓸 수 있음). Wikidata 관광지까지 합친 목록은 loadPicks 로 받는다.
  picks: PlacePick[];
  // 목적지 검색용 다른 이름 (LA, 로스앤젤레스, 하와이 등)
  aliases: string[];
  // 관광지 범위 [lat, lng, km]: 검색으로 만든 일정도 이 안이면 이 목적지로 본다
  search: [number, number, number][];
  // 아고다 도시 ID (숙소 예약 링크)
  agoda?: number;
}

const PICKS = picksData as Record<string, { areas: string[]; picks: PlacePick[] }>;
type CityRow = { id: string; name: string; code: string; center: number[]; zoom: number; search: number[][]; aliases?: string[]; agoda?: number };

export const DESTINATIONS: Destination[] = (citiesData as CityRow[]).map((c) => ({
  id: c.id,
  name: c.name,
  code: c.code,
  center: [c.center[0], c.center[1]],
  zoom: c.zoom,
  areas: PICKS[c.name]?.areas || [],
  picks: PICKS[c.name]?.picks || [],
  aliases: c.aliases || [],
  agoda: c.agoda,
  search: c.search.map((x) => [x[0], x[1], x[2]] as [number, number, number])
}));

// 도시별 Wikidata 관광지 (scripts/build-places.mjs 로 생성). 도시를 열 때만 그 파일을 불러온다.
const PLACE_FILES = import.meta.glob<{ picks: PlacePick[] }>('./places/*.json', { import: 'default' });
const loaded = new Map<string, Promise<PlacePick[]>>();

// 목적지의 전체 추천 장소: 직접 고른 추천 먼저, 그 뒤에 인지도순 관광지
export const loadPicks = (dest: Destination): Promise<PlacePick[]> => {
  let p = loaded.get(dest.id);
  if (!p) {
    const file = PLACE_FILES['./places/' + dest.id + '.json'];
    p = (file ? file().then((d) => d.picks) : Promise.resolve([] as PlacePick[]))
      .catch(() => [] as PlacePick[])
      .then((more) => dest.picks.concat(more));
    loaded.set(dest.id, p);
  }
  return p;
};

// 추천 장소 검색: 띄어쓰기·대소문자·표기 흔들림(유니버셜/유니버설)을 무시하고,
// 검색어의 단어가 모두 이름/지역/별칭 어딘가에 있으면 맞는 것으로 본다 ("유니버셜스튜디오 LA").
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/셜/g, '설').replace(/쥬/g, '주');
export const matchPick = (p: PlacePick, query: string): boolean => {
  const words = query.trim().split(/\s+/).filter(Boolean).map(norm);
  if (!words.length) return true;
  const hay = [p.name, p.area, p.cat, ...(p.aliases || [])].map(norm).join('|');
  return words.every((w) => hay.includes(w));
};

// 이름이 바뀐 목적지: 예전에 만든 일정도 지도 위치와 추천 장소가 나오도록 새 이름으로 연결한다
const RENAMED: Record<string, string> = { '스페인·포르투갈': '바르셀로나 · 마드리드' };

export const findDestination = (name: string): Destination | undefined =>
  DESTINATIONS.find((d) => d.name === (RENAMED[name] || name));

// 목적지 목록 검색: 대소문자·띄어쓰기 무시, 한국어 이름·영어 id·별칭 어디에든 들어 있으면 맞음 ("La" → LA · 라스베가스)
export const matchDestination = (d: Destination, query: string): boolean => {
  const q = norm(query);
  return !q || [d.name, d.id, ...d.aliases].some((x) => norm(x).includes(q));
};

const kmBetween = (a: [number, number], b: [number, number]): number => {
  const rad = Math.PI / 180;
  const h = Math.sin(((b[0] - a[0]) * rad) / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(((b[1] - a[1]) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

// 일정의 목적지: 이름이 목록과 같으면 그 목적지, 아니면(검색으로 고른 "로스앤젤레스, 미국" 등) 지도 중심이 관광지 범위 안인 목적지
export const findTripDestination = (trip: { destination: string; center?: [number, number] }): Destination | undefined => {
  const byName = findDestination(trip.destination);
  if (byName || !trip.center) return byName;
  const c = trip.center;
  return DESTINATIONS.find((d) => d.search.some(([lat, lng, km]) => kmBetween(c, [lat, lng]) <= km));
};
