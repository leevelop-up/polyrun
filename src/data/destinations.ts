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
}

const PICKS = picksData as Record<string, { areas: string[]; picks: PlacePick[] }>;
type CityRow = { id: string; name: string; code: string; center: number[]; zoom: number };

export const DESTINATIONS: Destination[] = (citiesData as CityRow[]).map((c) => ({
  id: c.id,
  name: c.name,
  code: c.code,
  center: [c.center[0], c.center[1]],
  zoom: c.zoom,
  areas: PICKS[c.name]?.areas || [],
  picks: PICKS[c.name]?.picks || []
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
