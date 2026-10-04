// 지오코딩 백엔드: 공개 OSM API(Photon / Nominatim)를 대신 호출하고 결과를 캐싱한다.
// - GET /api/reverse?lat=&lng=          좌표 -> 장소 이름
// - GET /api/search?q=&lat=&lng=&radius=&full=1  장소명 -> 좌표 목록 (full=1이면 Nominatim까지 조회)
// - GET /api/route?points=lat,lng;lat,lng   연속한 지점 사이 도보/차량 이동 시간
// - GET /api/matrix?points=lat,lng;lat,lng  모든 지점 쌍의 도보/차량 이동 시간 (자동 정렬용)
// - GET /api/path?points=lat,lng;lat,lng&profile=foot|car  두 지점 사이 실제 길 모양 (이동 중 화면용)
// - GET /api/place?name=&lat=&lng=&wd=&alt=&region=  장소 상세정보 (위키백과 요약·사진·링크)
// 이 파일은 실행 환경과 상관없는 로직만 담는다. 실행은
// - 로컬 개발: server/index.ts (npm run server)
// - 배포: server/worker.ts (Cloudflare Workers, npm run api:deploy)

// 실행 환경의 설정값 (Node: process.env, Workers: wrangler.toml 의 vars)
export type ApiConfig = { GEO_USER_AGENT?: string; NOMINATIM_URL?: string; PHOTON_URL?: string; ROUTING_URL?: string };
// Nominatim 이용 정책상 앱을 식별할 수 있는 User-Agent 필수
let USER_AGENT = 'runtrip/0.0.8 (geocoding backend)';
let NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
let PHOTON_URL = 'https://photon.komoot.io';
// 길찾기: OSRM (FOSSGIS 공개 서버)
let ROUTING_URL = 'https://routing.openstreetmap.de';
export const setConfig = (c: ApiConfig) => {
  if (c.GEO_USER_AGENT) USER_AGENT = c.GEO_USER_AGENT;
  if (c.NOMINATIM_URL) NOMINATIM_URL = c.NOMINATIM_URL;
  if (c.PHOTON_URL) PHOTON_URL = c.PHOTON_URL;
  if (c.ROUTING_URL) ROUTING_URL = c.ROUTING_URL;
};
const WIKIDATA_URL = 'https://www.wikidata.org/w/api.php';

type Category = '식당' | '관광' | '쇼핑' | '숙박' | '교통';
type SearchResult = { name: string; label: string; lat: number; lng: number; cat: Category };

// 검색 결과 순서: 관광 → 쇼핑 → 숙박 → 교통 → 식당
const CAT_RANK: Record<Category, number> = { 관광: 0, 쇼핑: 1, 숙박: 2, 교통: 3, 식당: 4 };

// OSM 태그(key/value)로 앱의 장소 카테고리를 추정한다
const FOOD = new Set(['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'food_court', 'ice_cream', 'biergarten']);
const LODGING = new Set(['hotel', 'hostel', 'guest_house', 'motel', 'apartment', 'chalet']);
const categorize = (key?: string, value?: string): Category => {
  const v = value || '';
  if (key === 'amenity' && FOOD.has(v)) return '식당';
  if (key === 'shop' || (key === 'amenity' && v === 'marketplace')) return '쇼핑';
  if (key === 'tourism' && LODGING.has(v)) return '숙박';
  if (key === 'railway' || key === 'public_transport' || key === 'aeroway'
    || (key === 'amenity' && (v === 'bus_station' || v === 'ferry_terminal')) || (key === 'highway' && v === 'bus_stop')) return '교통';
  return '관광';
};

// ---------- 캐시 (TTL + 최대 개수, 오래된 것부터 제거) ----------
class TtlCache<T> {
  private map = new Map<string, { value: T; expires: number }>();
  private ttlMs: number;
  private maxSize: number;
  constructor(ttlMs: number, maxSize: number) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // 최근 사용 항목을 맨 뒤로 옮겨 LRU처럼 동작
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: string, value: T) {
    this.map.delete(key);
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}

const DAY = 24 * 60 * 60 * 1000;
const reverseCache = new TtlCache<string | null>(7 * DAY, 5000);
const reverseFallbackCache = new TtlCache<string | null>(10 * 60 * 1000, 5000);
const searchCache = new TtlCache<SearchResult[]>(1 * DAY, 5000);

// ---------- 공개 API 요청 간격 제한 ----------
// 요청을 한 줄로 세워 intervalMs 간격으로 보낸다.
// isCancelled: 차례가 왔을 때 요청한 클라이언트가 이미 떠났으면(입력 중 버려진 검색) 호출하지 않고 건너뛴다.
// 안 그러면 버려진 요청들이 줄을 막아 마지막 검색이 몇 초씩 늦어진다.
const makeThrottle = (intervalMs: number) => {
  let chain: Promise<unknown> = Promise.resolve();
  let lastAt = 0;
  return <T>(fn: () => Promise<T>, isCancelled: () => boolean = () => false): Promise<T> => {
    const run = chain.then(async () => {
      if (isCancelled()) throw new Error('cancelled');
      const wait = lastAt + intervalMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (isCancelled()) throw new Error('cancelled');
      lastAt = Date.now();
      return fn();
    });
    chain = run.catch(() => undefined);
    return run;
  };
};
// Nominatim 이용 정책: 초당 1회
const throttledNominatim = makeThrottle(1100);
// Wikidata 는 짧은 시간에 몰아서 보내면 429 를 준다
const throttledWikidata = makeThrottle(500);

const fetchJson = async (url: string, init: RequestInit = {}, timeoutMs = 10000) => {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ko', ...(init.headers || {}) },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
};

// ---------- 역지오코딩 ----------
// 명소/역 후보로 볼 OSM 태그 (Photon osm_tag 필터 형식).
// historic 은 넣지 않는다: 절/신사 경내에 비석·기념물이 수십 개씩 있어 결과 개수 제한(50)을 채워버리고
// 정작 센소지 같은 본체가 밀려난다. 경복궁처럼 주요 유적은 tourism=attraction 으로도 등록돼 있다.
const LANDMARK_TAGS = ['tourism', 'railway:station', 'amenity:place_of_worship', 'amenity:marketplace', 'leisure:park'];
// 안내판/조형물/숙소 등은 관광지 "본체"가 아니므로 후보에서 제외
const MINOR_TAGS: Record<string, Set<string>> = {
  tourism: new Set(['information', 'artwork', 'viewpoint', 'picnic_site', 'hotel', 'hostel', 'guest_house', 'apartment', 'motel'])
};
// 감싸는 영역이 이보다 크면(약 3km x 3km) 지역 단위라서 장소 이름으로 쓰지 않는다
const MAX_ENCLOSING_AREA = 1e-3; // 도(degree)^2
// 감싸지 않는 후보는 이 거리(약 120m) 안의 것만 쓴다. 멀리 있는 절 이름이 주택가 클릭 결과로 나오는 것 방지
const MAX_NEARBY_DIST = 0.0012; // 도(degree)

type PhotonReverseFeature = {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; osm_key?: string; osm_value?: string; osm_type?: string; osm_id?: number; extent?: [number, number, number, number] };
};
type Landmark = { name: string; osmId: string; isStation: boolean };

// Photon 역지오코딩으로 클릭 지점 주변(300m) 명소/역을 찾는다. 우선순위:
// 1. 클릭 지점을 감싸는 (공원이 아닌) 영역 중 가장 큰 것
//    - 센소지 본당을 찍으면 "본당"이 아니라 경내 전체인 "센소지", 도쿄국립박물관 본관을 찍으면 "도쿄국립박물관"
// 2. 가까운(120m 이내) 명소/역 중 가장 가까운 것
// 3. 클릭 지점을 감싸는 공원 (공원 안의 명소를 공원 이름이 가리지 않도록 가장 뒤로)
const findLandmark = async (lat: number, lng: number): Promise<Landmark | null> => {
  // 공개 Photon 서버는 짧은 시간에 요청이 몰리면 503/접속 차단을 하므로 클릭당 1회만 호출한다.
  // 응답이 보통 3초 안팎이라 오래 기다리지 않는다 (못 받으면 Nominatim 결과를 쓴다)
  const tags = LANDMARK_TAGS.map((t) => `&osm_tag=${t}`).join('');
  const data = await fetchJson(`${PHOTON_URL}/reverse?lat=${lat}&lon=${lng}&radius=0.3&limit=50${tags}`, {}, REVERSE_PHOTON_TIMEOUT_MS);
  const candidates = ((data.features || []) as PhotonReverseFeature[])
    .filter((f) => {
      const p = f.properties;
      return p.name && !(p.osm_key && MINOR_TAGS[p.osm_key]?.has(p.osm_value || ''));
    })
    .map((f) => {
      const [flng, flat] = f.geometry.coordinates;
      const e = f.properties.extent; // [minLon, maxLat, maxLon, minLat]
      const area = e ? (e[2] - e[0]) * (e[1] - e[3]) : 0;
      const encloses = !!e && lng >= e[0] && lng <= e[2] && lat >= e[3] && lat <= e[1] && area <= MAX_ENCLOSING_AREA;
      return { f, area, encloses, isPark: f.properties.osm_key === 'leisure', dist: Math.hypot(flat - lat, flng - lng) };
    });

  const enclosingLandmark = candidates.filter((c) => c.encloses && !c.isPark).sort((a, b) => b.area - a.area)[0];
  const nearby = candidates.filter((c) => !c.isPark && c.dist <= MAX_NEARBY_DIST).sort((a, b) => a.dist - b.dist)[0];
  const enclosingPark = candidates.filter((c) => c.encloses && c.isPark).sort((a, b) => a.area - b.area)[0];
  const best = (enclosingLandmark || nearby || enclosingPark)?.f;
  if (!best) return null;

  const p = best.properties;
  return {
    name: p.name as string,
    osmId: `${p.osm_type}${p.osm_id}`,
    isStation: p.osm_key === 'railway' || p.osm_key === 'public_transport'
  };
};

// Photon은 현지어 이름만 주므로 Nominatim lookup으로 한국어 이름(name:ko)을 받아온다
const koreanName = async (osmId: string): Promise<string | null> => {
  const data = await throttledNominatim(() =>
    fetchJson(`${NOMINATIM_URL}/lookup?format=jsonv2&osm_ids=${osmId}&accept-language=ko`)
  );
  return (data as Array<{ name?: string }>)[0]?.name || null;
};

const REVERSE_PHOTON_TIMEOUT_MS = 2500;
const HANGUL = /[가-힣]/;

const nominatimReverse = async (lat: number, lng: number): Promise<string | null> => {
  const data = await throttledNominatim(() =>
    fetchJson(`${NOMINATIM_URL}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&accept-language=ko`)
  );
  const addr = data.address || {};
  // 도로(길) 위를 찍은 경우엔 도로명 대신 동네명을 사용
  const poiName = data.addresstype !== 'road' ? data.name : null;
  const name: string | null = poiName || addr.railway || addr.station || addr.public_transport
    || addr.amenity || addr.shop || addr.tourism || addr.building
    || addr.neighbourhood || addr.suburb || addr.village || addr.town || addr.city
    || data.display_name || null;
  if (!name || HANGUL.test(name)) return name;
  // 한글 이름이 없는 곳(일본 동네 이름 등)은 한글로 된 상위 지역을 붙여 어딘지 알 수 있게 한다
  // 예) "谷町四丁目" -> "谷町四丁目 (오사카시)"
  const area = [addr.city_district, addr.suburb, addr.city, addr.town, addr.village, addr.county, addr.province, addr.state]
    .find((v: string | undefined) => v && HANGUL.test(v) && v !== name);
  return area ? `${name} (${area})` : name;
};

const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
  // 소수점 4자리(약 10m)로 반올림해 같은 지점 반복 클릭은 캐시에서 응답
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = reverseCache.get(key) ?? reverseFallbackCache.get(key);
  if (cached !== undefined) return cached;

  // 명소 찾기(Photon)와 일반 역지오코딩(Nominatim)을 동시에 시작한다.
  // 예전엔 Photon 을 5초까지 기다린 뒤에야 Nominatim 을 불러 이름이 6초 가까이 걸렸다.
  const reverseP = nominatimReverse(lat, lng).catch((e) => {
    console.warn('[reverse] nominatim failed:', (e as Error).message);
    return null;
  });
  let photonOk = true;
  let landmark: Landmark | null = null;
  try {
    landmark = await findLandmark(lat, lng);
  } catch (e) {
    photonOk = false;
    console.warn('[reverse] photon failed, fallback to nominatim:', (e as Error).message);
  }

  let name: string | null;
  if (landmark) {
    name = (await koreanName(landmark.osmId).catch(() => null)) || landmark.name;
    // 한국 철도역은 OSM에 "역" 접미사 없이 등록된 경우가 많아 보정 (예: "용산" -> "용산역")
    if (landmark.isStation && /[가-힣]$/.test(name) && !name.endsWith('역')) name += '역';
  } else {
    // 주변에 명소/역이 없으면 일반 역지오코딩(가게/건물/동네 이름)
    name = await reverseP;
  }
  if (photonOk) reverseCache.set(key, name);
  else reverseFallbackCache.set(key, name); // Photon 장애 중 결과는 잠깐만 기억하고 나중에 다시 시도
  return name;
};

// ---------- 장소 검색 ----------
type PhotonFeature = { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> };

// Photon: 입력 중 자동완성용. 한국 장소 한글 검색과 부분 일치에 강하다.
// 공개 서버는 보통 3초 안팎 걸린다. 자동완성 -> (결과 없으면) 확정 검색이 같은 검색어로 이어 부르므로
// 진행 중인 같은 요청은 새로 보내지 않고 함께 기다린다.
const PHOTON_TIMEOUT_MS = 4500;
const photonInflight = new Map<string, Promise<SearchResult[]>>();
const photonSearch = (q: string, lat: number | undefined, lng: number | undefined, radiusKm: number): Promise<SearchResult[]> => {
  const key = `${q}|${lat},${lng}|${radiusKm}`;
  const pending = photonInflight.get(key);
  if (pending) return pending;
  const p = photonFetch(q, lat, lng, radiusKm, PHOTON_TIMEOUT_MS).finally(() => photonInflight.delete(key));
  photonInflight.set(key, p);
  return p;
};
const photonFetch = async (q: string, lat: number | undefined, lng: number | undefined, radiusKm: number, timeoutMs: number): Promise<SearchResult[]> => {
  // 여행지 반경을 bbox 로 넘겨야 limit(8) 이 먼 곳 결과로 채워지지 않는다
  const box = lat !== undefined && lng !== undefined ? boxAround(lat, lng, radiusKm) : null;
  const bias = box ? `&lat=${lat}&lon=${lng}&bbox=${box.minLng},${box.minLat},${box.maxLng},${box.maxLat}` : '';
  const data = await fetchJson(`${PHOTON_URL}/api/?q=${encodeURIComponent(q)}&limit=8${bias}`, {}, timeoutMs);
  return ((data.features || []) as PhotonFeature[])
    .filter((f) => f.properties.name)
    .map((f) => {
      const p = f.properties;
      const label = [p.name, p.street, p.district, p.city, p.state, p.country].filter(Boolean).join(', ');
      return { name: p.name as string, label, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], cat: categorize(p.osm_key, p.osm_value) };
    });
};

// Nominatim: Enter로 확정 검색할 때만 사용. name:ko 를 활용해 해외 장소 한글 검색(예: 센소지)에 강하다.
// Nominatim 의 한국어 이름(name:ko)은 띄어쓰기까지 맞아야 찾아진다.
// "신주쿠교엔"/"도쿄타워"는 0건, "신주쿠 교엔"/"도쿄 타워"는 찾아짐 -> 결과가 없으면 띄어쓰기를 바꿔 다시 찾는다.
const KO_SUFFIXES = [
  '해수욕장', '스카이트리', '박물관', '미술관', '전망대', '수족관', '스튜디오', '대성당', '성당', '교엔', '공원', '신궁', '신사',
  '타워', '시장', '거리', '사원', '온천', '공항', '대교', '다리', '스퀘어', '빌딩', '센터', '호텔', '마켓', '파크', '랜드',
  '월드', '비치', '궁전', '궁', '성', '역'
];
// 외래어 표기가 흔들리는 글자 (유니버셜/유니버설, 쥬/주)
const KO_SPELLING: [RegExp, string][] = [[/셜/g, '설'], [/설/g, '셜'], [/쥬/g, '주']];
const MAX_VARIANTS = 5;
const koreanVariants = (q: string): string[] => {
  const out = [q];
  const add = (v: string) => {
    const t = v.trim().replace(/\s+/g, ' ');
    if (t && !out.includes(t)) out.push(t);
  };
  if (!/[가-힣]/.test(q)) return out;
  const compact = q.replace(/\s+/g, '');
  // 일본 역은 name:ko 가 "시부야"처럼 "역" 없이 등록된 경우가 많다 -> 접미사 떼고 재검색
  if (/[가-힣]역$/.test(compact)) add(compact.slice(0, -1));
  const suffix = KO_SUFFIXES.find((s) => compact.length > s.length && compact.endsWith(s));
  const spaced = suffix ? compact.slice(0, -suffix.length) + ' ' + suffix : compact;
  add(spaced);
  add(compact);
  for (const [re, to] of KO_SPELLING) if (re.test(spaced)) add(spaced.replace(re, to));
  return out.slice(0, MAX_VARIANTS);
};

// ---------- Wikidata: OSM 에 한글 이름이 없는 해외 장소용 ----------
// 예) 유니버설 스튜디오 할리우드, 디즈니랜드, 그리피스 천문대는 OSM name:ko 가 없어 Nominatim 으로는 0건이지만
// Wikidata 에는 한국어 이름(위키백과 제목)과 좌표(P625)가 있다.
type WikidataEntity = {
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  claims?: { P625?: Array<{ mainsnak?: { datavalue?: { value?: { latitude: number; longitude: number } } } }> };
};
const wikidataCache = new TtlCache<SearchResult[]>(1 * DAY, 5000);
const wikidataLookup = async (text: string, isCancelled: () => boolean): Promise<SearchResult[]> => {
  const cached = wikidataCache.get(text);
  if (cached) return cached;
  const found = await throttledWikidata(() => fetchJson(
    `${WIKIDATA_URL}?action=wbsearchentities&format=json&language=ko&uselang=ko&type=item&limit=10&search=${encodeURIComponent(text)}`, {}, 5000
  ), isCancelled);
  const ids = ((found.search || []) as Array<{ id: string }>).map((s) => s.id);
  let results: SearchResult[] = [];
  if (ids.length) {
    const data = await throttledWikidata(() => fetchJson(
      `${WIKIDATA_URL}?action=wbgetentities&format=json&props=labels|descriptions|claims&languages=ko|en&ids=${ids.join('|')}`, {}, 5000
    ), isCancelled);
    const entities = (data.entities || {}) as Record<string, WikidataEntity>;
    results = ids.flatMap((id) => {
      const e = entities[id];
      const coord = e?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
      const name = e?.labels?.ko?.value || e?.labels?.en?.value;
      if (!coord || !name) return []; // 좌표 없는 항목(동음이의 문서, 개념 등)은 장소가 아니다
      const desc = e.descriptions?.ko?.value || e.descriptions?.en?.value || '';
      return [{ name, label: desc ? `${name}, ${desc}` : name, lat: coord.latitude, lng: coord.longitude, cat: '관광' as Category }];
    });
  }
  wikidataCache.set(text, results);
  return results;
};

const wikidataSearch = async (q: string, lat: number | undefined, lng: number | undefined, radiusKm: number, isCancelled: () => boolean): Promise<SearchResult[]> => {
  if (!/[가-힣]/.test(q)) return [];
  // Wikidata 도 띄어쓰기에 민감하다 ("유니버셜스튜디오" 0건, "유니버셜 스튜디오" 찾음). 요청 수를 아끼려고 앞의 2개 변형만 쓴다.
  for (const text of koreanVariants(q).slice(0, 2)) {
    if (isCancelled()) return [];
    const results = nearOnly(await wikidataLookup(text, isCancelled), lat, lng, radiusKm);
    // 여행지에서 가까운 순
    if (lat !== undefined && lng !== undefined) results.sort((a, b) => distanceKm(lat, lng, a.lat, a.lng) - distanceKm(lat, lng, b.lat, b.lng));
    if (results.length) return results;
  }
  return [];
};

const nominatimSearch = async (q: string, lat: number | undefined, lng: number | undefined, radiusKm: number, isCancelled: () => boolean): Promise<SearchResult[]> => {
  // 여행지 반경 안에서만 찾는다 (bounded=1). 범위 밖까지 찾으면 limit(6) 이 먼 결과로 채워져 정작 근처 장소가 빠진다.
  const box = lat !== undefined && lng !== undefined ? boxAround(lat, lng, radiusKm) : null;
  const viewbox = box ? `&viewbox=${box.minLng},${box.maxLat},${box.maxLng},${box.minLat}&bounded=1` : '';
  const call = (text: string) =>
    throttledNominatim(
      () => fetchJson(`${NOMINATIM_URL}/search?format=jsonv2&q=${encodeURIComponent(text)}&limit=6&accept-language=ko${viewbox}`),
      isCancelled
    );
  // 공개 Nominatim 은 가끔 응답이 10초 넘게 늦으므로 한 번은 다시 시도한다
  const query = async (text: string) => {
    try {
      return await call(text);
    } catch (e) {
      if (isCancelled()) throw e;
      console.warn('[search] nominatim retry:', (e as Error).message);
      return call(text);
    }
  };
  const toResults = (data: unknown[]): SearchResult[] =>
    (data as Array<{ display_name: string; name?: string; lat: string; lon: string; category?: string; type?: string }>).map((d) => ({
      name: d.name || d.display_name.split(',')[0],
      label: d.display_name,
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
      cat: categorize(d.category, d.type)
    }));
  for (const text of koreanVariants(q)) {
    if (isCancelled()) throw new Error('cancelled');
    // 여행지에서 먼 결과는 버린다 (LA 일정에서 "유니버셜 스튜디오" -> 오사카 USJ 방지)
    const results = nearOnly(toResults(await query(text)), lat, lng, radiusKm);
    if (results.length > 0) return results;
  }
  return [];
};

// 목적지(도시) 검색: 가게/건물 말고 도시·마을만 찾는다
const citySearch = async (q: string): Promise<SearchResult[]> => {
  const key = `city|${q.toLowerCase()}`;
  const cached = searchCache.get(key);
  if (cached) return cached;
  const data = await throttledNominatim(() =>
    fetchJson(`${NOMINATIM_URL}/search?format=jsonv2&q=${encodeURIComponent(q)}&featureType=settlement&limit=6&accept-language=ko`)
  );
  const results = (data as Array<{ display_name: string; name?: string; lat: string; lon: string }>).map((d) => ({
    name: d.name || d.display_name.split(',')[0],
    label: d.display_name,
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
    cat: '관광' as Category
  }));
  searchCache.set(key, results);
  return results;
};

// 같은 이름이 약 100m 이내에 겹치면 하나만 남긴다.
// 정류장·역 출입구(교통)는 이름이 장소 이름을 따라 붙어서 "광화문"을 찾으면 길 양쪽 정류장까지 4~5개가 나온다:
// 같은 이름의 장소(관광 등)가 1km 안에 있으면 교통은 빼고, 교통끼리는 1km 안이면 하나만 (큰 역은 출입구·정류장이 700m 넘게 퍼져 있다).
// (같은 이름의 식당·가게 지점은 서로 다른 곳이라 그대로 둔다)
const dedupe = (results: SearchResult[]): SearchResult[] => {
  const out: SearchResult[] = [];
  for (const r of results) {
    const km = (o: SearchResult) => distanceKm(o.lat, o.lng, r.lat, r.lng);
    const sameName = (o: SearchResult) => o.name === r.name;
    if (out.some((o) => sameName(o) && km(o) < 0.1)) continue;
    if (r.cat === '교통' && results.some((o) => o !== r && sameName(o) && o.cat !== '교통' && km(o) < 1)) continue;
    if (r.cat === '교통' && out.some((o) => sameName(o) && o.cat === '교통' && km(o) < 1)) continue;
    out.push(r);
  }
  // 관광지를 먼저, 식당은 맨 뒤 (같은 종류 안에서는 원래 순서 = 여행지에서 가까운 순)
  return out.sort((a, b) => CAT_RANK[a.cat] - CAT_RANK[b.cat]).slice(0, 8);
};

// 여행지 기준 검색 반경. 앱이 radius 로 여행지에 맞는 값(도시 150km, 여러 도시 묶음 800km)을 보내고,
// "여행지 밖까지 찾기"는 MAX_RADIUS_KM 를 보낸다. radius 가 없으면 DEFAULT_RADIUS_KM.
const DEFAULT_RADIUS_KM = 800;
const MIN_RADIUS_KM = 10;
const MAX_RADIUS_KM = 3000;
const distanceKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const rad = Math.PI / 180;
  const h = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const nearOnly = (results: SearchResult[], lat: number | undefined, lng: number | undefined, radiusKm: number): SearchResult[] =>
  lat !== undefined && lng !== undefined ? results.filter((r) => distanceKm(lat, lng, r.lat, r.lng) <= radiusKm) : results;
// 중심에서 반경 radiusKm 를 덮는 위경도 상자
const boxAround = (lat: number, lng: number, radiusKm: number) => {
  const dLat = Math.min(89, radiusKm / 111);
  const dLng = Math.min(179, radiusKm / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180))));
  return {
    minLat: Math.max(-90, lat - dLat), maxLat: Math.min(90, lat + dLat),
    minLng: Math.max(-180, lng - dLng), maxLng: Math.min(180, lng + dLng)
  };
};

// partial: 검색 서버 중 하나가 응답하지 않아 결과가 빠졌을 수 있음 (앱이 "결과 없음" 대신 "다시 시도"를 띄움)
type SearchResponse = { results: SearchResult[]; partial: boolean };
const searchPlaces = async (q: string, full: boolean, lat: number | undefined, lng: number | undefined, radiusKm: number, isCancelled: () => boolean): Promise<SearchResponse> => {
  // 위치 편향은 약 10km 단위로 묶어 캐시 적중률을 높인다
  const biasKey = lat !== undefined && lng !== undefined ? `${lat.toFixed(1)},${lng.toFixed(1)},${radiusKm}` : '';
  const key = `${full ? 'full' : 'auto'}|${biasKey}|${q.toLowerCase()}`;
  const cached = searchCache.get(key);
  if (cached) return { results: cached, partial: false };

  let nominatimFailed = false;
  let wikidataFailed = false;
  let photonFailed = false;
  // 한국 밖 여행지의 한글 검색어는 Photon 이 거의 항상 0건이고 느리기만 하다 -> 확정 검색에서는 부르지 않는다
  const outsideKorea = lat !== undefined && lng !== undefined && !(lat > 33 && lat < 38.7 && lng > 124.5 && lng < 131);
  const skipPhoton = full && outsideKorea && HANGUL.test(q);
  const photonP = (skipPhoton ? Promise.resolve([] as SearchResult[]) : photonSearch(q, lat, lng, radiusKm)).catch((e) => {
    photonFailed = true;
    console.warn('[search] photon failed:', (e as Error).message);
    return [] as SearchResult[];
  });
  // Wikidata 는 Nominatim 과 서버가 달라 같이 호출해도 된다 (한글 검색어일 때만)
  const wikidataP = full
    ? wikidataSearch(q, lat, lng, radiusKm, isCancelled).catch((e) => {
      wikidataFailed = true;
      if (!isCancelled()) console.warn('[search] wikidata failed:', (e as Error).message);
      return [] as SearchResult[];
    })
    : Promise.resolve([] as SearchResult[]);
  const nominatim = full
    ? await nominatimSearch(q, lat, lng, radiusKm, isCancelled).catch((e) => {
      nominatimFailed = true;
      if (!isCancelled()) console.warn('[search] nominatim failed:', (e as Error).message);
      return [] as SearchResult[];
    })
    : [];
  // Nominatim 이 이미 찾았으면 Photon 은 아주 잠깐만 기다리고 넘어간다
  const photonAll = nominatim.length
    ? await Promise.race([photonP, new Promise<SearchResult[]>((r) => setTimeout(() => r([]), 200))])
    : await photonP;
  // Photon 은 한글 이름이 붙은 장소(대부분 한국)만 맞추므로, 방콕에서 "시암"을 찾으면 김포 "시암리"가 나온다.
  // 여행지에서 너무 먼 결과는 버리고, 비면 클라이언트가 확정 검색(Nominatim)으로 다시 찾는다.
  const photon = nearOnly(photonAll, lat, lng, radiusKm);
  const wikidata = await wikidataP;
  // 확정 검색에서는 Nominatim 결과(한국어 이름 정확도 높음)를 앞에 두고, OSM 에 한글 이름이 없는 곳은 Wikidata 로 채운다.
  // 같은 장소가 이름만 달리 겹치면(약 300m 이내) 먼저 나온 것만 남긴다.
  const merged = nominatim.concat(photon);
  for (const w of wikidata) {
    if (!merged.some((m) => distanceKm(m.lat, m.lng, w.lat, w.lng) < 0.3)) merged.push(w);
  }
  // 여행지에서 가까운 순으로 보여준다
  if (lat !== undefined && lng !== undefined) merged.sort((a, b) => distanceKm(lat, lng, a.lat, a.lng) - distanceKm(lat, lng, b.lat, b.lng));
  const results = dedupe(merged);
  // Nominatim 이 실패했을 때는 캐시하지 않는다 (다음 검색에서 다시 시도). 보여줄 게 하나도 없으면 에러로 알려
  // 앱이 "결과 없음" 대신 "다시 시도"를 띄우게 한다.
  if (nominatimFailed) {
    if (results.length === 0) throw new Error('nominatim failed');
    return { results, partial: true };
  }
  // Photon/Wikidata 가 실패(타임아웃, 429 등)했으면 다음 검색에서 다시 시도하도록 캐시하지 않는다.
  // (예전엔 Photon 타임아웃으로 빈 자동완성 결과가 하루 동안 캐시됐다)
  if (!wikidataFailed && !photonFailed) searchCache.set(key, results);
  return { results, partial: wikidataFailed || photonFailed };
};

// ---------- 이동 시간: 실제 길 기준 (OSRM, FOSSGIS 공개 서버) ----------
// - GET /api/route?points=lat,lng;lat,lng;...  연속한 두 지점 사이 도보/차량 시간
// - GET /api/matrix?points=...                  모든 지점 쌍 사이 시간 (OSRM table, 자동 정렬용)
// 직선거리 추정은 강·바다를 건너는 구간에서 크게 틀린다.
const MAX_ROUTE_POINTS = 30;
type RouteLeg = { walkMin: number; driveMin: number; km: number };
const legCache = new TtlCache<RouteLeg>(30 * DAY, 20000);
const legKey = (a: [number, number], b: [number, number]) => `${a[0].toFixed(5)},${a[1].toFixed(5)}>${b[0].toFixed(5)},${b[1].toFixed(5)}`;
// 공개 서버라 요청을 몰아서 보내지 않는다
const throttledRouting = makeThrottle(300);

const osrmLegs = async (profile: 'foot' | 'car', pts: [number, number][]): Promise<Array<{ duration: number; distance: number }>> => {
  const coords = pts.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');
  const data = await throttledRouting(() =>
    fetchJson(`${ROUTING_URL}/routed-${profile}/route/v1/driving/${coords}?overview=false&steps=false`, {}, 8000)
  );
  if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error(`routing ${profile}: ${data.code}`);
  return data.routes[0].legs;
};

const routeLegs = async (pts: [number, number][]): Promise<RouteLeg[]> => {
  const keys = pts.slice(1).map((p, i) => legKey(pts[i], p));
  const cached = keys.map((k) => legCache.get(k));
  if (cached.every((c) => c !== undefined)) return cached as RouteLeg[];
  // 여러 지점을 한 번에 경로로 요청하면 구간(leg)별 시간이 나온다 (구간마다 요청하지 않음)
  const [foot, car] = await Promise.all([osrmLegs('foot', pts), osrmLegs('car', pts)]);
  return keys.map((k, i) => {
    const leg = { walkMin: Math.round(foot[i].duration / 60), driveMin: Math.round(car[i].duration / 60), km: Math.round(car[i].distance / 100) / 10 };
    legCache.set(k, leg);
    return leg;
  });
};

// 모든 지점 쌍의 시간/거리 (OSRM table). 자동 정렬이 순서를 고를 때 쓴다.
const osrmTable = async (profile: 'foot' | 'car', pts: [number, number][]): Promise<{ durations: (number | null)[][]; distances: (number | null)[][] }> => {
  const coords = pts.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');
  const data = await throttledRouting(() =>
    fetchJson(`${ROUTING_URL}/routed-${profile}/table/v1/driving/${coords}?annotations=duration,distance`, {}, 10000)
  );
  if (data.code !== 'Ok' || !data.durations) throw new Error(`table ${profile}: ${data.code}`);
  return data;
};

// legs[i][j]: i -> j 구간 (i === j 이거나 길을 못 찾으면 null). 받은 구간은 /api/route 캐시에도 넣는다.
const routeMatrix = async (pts: [number, number][]): Promise<(RouteLeg | null)[][]> => {
  const keyOf = (i: number, j: number) => legKey(pts[i], pts[j]);
  const all = pts.every((_, i) => pts.every((_, j) => i === j || legCache.get(keyOf(i, j)) !== undefined));
  if (all) return pts.map((_, i) => pts.map((_, j) => (i === j ? null : (legCache.get(keyOf(i, j)) as RouteLeg))));
  const [foot, car] = await Promise.all([osrmTable('foot', pts), osrmTable('car', pts)]);
  return pts.map((_, i) =>
    pts.map((_, j) => {
      const walk = foot.durations[i]?.[j];
      const drive = car.durations[i]?.[j];
      const dist = car.distances[i]?.[j];
      if (i === j || walk == null || drive == null || dist == null) return null;
      const leg = { walkMin: Math.round(walk / 60), driveMin: Math.round(drive / 60), km: Math.round(dist / 100) / 10 };
      legCache.set(keyOf(i, j), leg);
      return leg;
    })
  );
};

// 두 지점 사이 실제 길 모양. 이동 중 화면에서 사람 아이콘이 이 선을 따라 움직인다.
type RoutePath = { coords: [number, number][]; distance: number; duration: number };
const pathCache = new TtlCache<RoutePath>(DAY, 2000);
const routePath = async (profile: 'foot' | 'car', a: [number, number], b: [number, number]): Promise<RoutePath> => {
  const key = profile + ':' + legKey(a, b);
  const hit = pathCache.get(key);
  if (hit) return hit;
  const coords = [a, b].map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');
  const data = await throttledRouting(() =>
    fetchJson(`${ROUTING_URL}/routed-${profile}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`, {}, 8000)
  );
  const r = data.routes?.[0];
  if (data.code !== 'Ok' || !r) throw new Error(`path ${profile}: ${data.code}`);
  const path: RoutePath = {
    coords: (r.geometry.coordinates as [number, number][]).map(([lng, lat]) => [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5]),
    distance: Math.round(r.distance),
    duration: Math.round(r.duration)
  };
  pathCache.set(key, path);
  return path;
};

const parsePoints = (v: string | null): [number, number][] | null => {
  if (!v) return null;
  const pts = v.split(';').map((s) => s.split(',').map(Number));
  if (pts.length < 2 || pts.length > MAX_ROUTE_POINTS) return null;
  if (!pts.every((p) => p.length === 2 && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180 && p.every(Number.isFinite))) return null;
  return pts as [number, number][];
};

// ---------- 장소 상세정보 (위키백과 요약: 설명, 사진, 링크) ----------
export type PlaceInfo = { title: string; lang: 'ko' | 'en'; extract: string; image: string | null; url: string; description: string | null };
const placeCache = new TtlCache<PlaceInfo | null>(7 * DAY, 5000);
const throttledWiki = makeThrottle(200);
const normTitle = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[\s·・'’.,\-_]/g, '');

// 위키백과 문서 요약. 동음이의 문서나 내용이 없으면 null
// coord: 문서에 적힌 좌표 (없으면 undefined). 이름으로 바로 찾은 문서가 맞는 곳인지 확인할 때 쓴다
const wikiSummary = async (lang: 'ko' | 'en', title: string, coord?: { lat?: number; lng?: number }): Promise<PlaceInfo | null> => {
  const s = await throttledWiki(() =>
    fetchJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`)
  ).catch(() => null);
  if (!s || s.type === 'disambiguation' || !s.extract) return null;
  const extract = String(s.extract);
  if (coord && s.coordinates) {
    coord.lat = s.coordinates.lat;
    coord.lng = s.coordinates.lon;
  }
  return {
    title: s.title,
    lang,
    extract: extract.length > 700 ? extract.slice(0, 700).replace(/[^.。!?]*$/, '') || extract.slice(0, 700) + '…' : extract,
    // 요약의 썸네일(330px)은 화면에 작아서 500px 로 받는다 (위키미디어는 정해진 폭만 허용: 250, 330, 500, 960 …)
    image: s.thumbnail?.source ? String(s.thumbnail.source).replace(/\/(\d+)px-/,(m: string, w: string) => (+w < 500 ? '/500px-' : m)) : null,
    url: s.content_urls?.mobile?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    description: s.description || null
  };
};

// 좌표 주변(1.5km) 위키백과 문서 중 이름이 맞는 것
const wikiNearby = async (lang: 'ko' | 'en', names: string[], lat: number, lng: number): Promise<string | null> => {
  const data = await throttledWiki(() =>
    fetchJson(`https://${lang}.wikipedia.org/w/api.php?action=query&format=json&list=geosearch&gscoord=${lat}|${lng}&gsradius=1500&gslimit=50`)
  ).catch(() => null);
  const pages: { title: string; dist: number }[] = data?.query?.geosearch || [];
  const keys = names.map(normTitle).filter((k) => k.length >= 2);
  const hit = pages.find((p) => keys.some((k) => normTitle(p.title) === k))
    || pages.find((p) => keys.some((k) => { const t = normTitle(p.title); return t.length >= 2 && (t.includes(k) || k.includes(t)); }));
  return hit ? hit.title : null;
};

// region: 여행지 이름들 (제주, 도쿄 …). 좌표 없는 문서를 이름으로 찾았을 때 다른 지역의 같은 이름 문서를 거르는 데 쓴다
const placeInfo = async (name: string, alt: string[], region: string[], lat?: number, lng?: number, wd?: string): Promise<PlaceInfo | null> => {
  const key = [wd || '', name, lat?.toFixed(3), lng?.toFixed(3), region.join(',')].join('|');
  const cached = placeCache.get(key);
  if (cached !== undefined) return cached;
  let info: PlaceInfo | null = null;
  if (wd) {
    // Wikidata 항목이 있으면 거기 연결된 한국어(없으면 영어) 문서
    const data = await throttledWikidata(() =>
      fetchJson(`${WIKIDATA_URL}?action=wbgetentities&format=json&ids=${wd}&props=sitelinks&sitefilter=kowiki|enwiki`)
    ).catch(() => null);
    const links = data?.entities?.[wd]?.sitelinks || {};
    if (links.kowiki) info = await wikiSummary('ko', links.kowiki.title);
    if (!info && links.enwiki) info = await wikiSummary('en', links.enwiki.title);
  }
  if (!info && lat !== undefined && lng !== undefined) {
    const ko = await wikiNearby('ko', [name, ...alt], lat, lng);
    if (ko) info = await wikiSummary('ko', ko);
    if (!info && alt.length) {
      const en = await wikiNearby('en', [name, ...alt], lat, lng);
      if (en) info = await wikiSummary('en', en);
    }
  }
  // 문서에 좌표가 없어 주변 검색에 안 걸리는 곳(예: 용두암)은 이름으로 바로 찾는다.
  // 문서 좌표가 5km 안이거나, 좌표가 없으면 설명에 여행지 이름이 들어 있어야 같은 곳으로 본다
  if (!info && name.length >= 2) {
    const c: { lat?: number; lng?: number } = {};
    const s = await wikiSummary('ko', name, c);
    if (s) {
      const near = c.lat !== undefined && c.lng !== undefined && lat !== undefined && lng !== undefined
        ? Math.hypot(c.lat - lat, (c.lng - lng) * Math.cos((lat * Math.PI) / 180)) * 111 < 5
        : c.lat === undefined && region.some((r) => r.length >= 2 && s.extract.includes(r));
      if (near) info = s;
    }
  }
  placeCache.set(key, info);
  return info;
};

// ---------- 요청 처리 (Node 서버와 Cloudflare Workers 공통) ----------
export const RESPONSE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  // 웹(vite)과 Capacitor 앱(capacitor://localhost, https://localhost) 양쪽에서 호출
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

// null: 응답하지 않는다 (앱이 요청을 취소해 연결이 끊김)
export type ApiResult = { status: number; body: unknown } | null;
const send = (status: number, body: unknown): ApiResult => ({ status, body });

const parseCoord = (v: string | null, min: number, max: number): number | undefined => {
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

// isClosed: 앱이 응답을 기다리다 연결을 끊었는지 (끊겼으면 남은 외부 호출을 건너뛴다)
export const handleApi = async (method: string, url: URL, isClosed: () => boolean = () => false): Promise<ApiResult> => {
  if (method === 'OPTIONS') return send(204, null);
  if (method !== 'GET') return send(405, { error: 'method not allowed' });

  const lat = parseCoord(url.searchParams.get('lat'), -90, 90);
  const lng = parseCoord(url.searchParams.get('lng'), -180, 180);

  if (url.pathname === '/api/reverse') {
    if (lat === undefined || lng === undefined) return send(400, { error: 'lat, lng required' });
    const name = await reverseGeocode(lat, lng);
    return send(200, { name });
  }

  if (url.pathname === '/api/search') {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    if (!q) return send(200, { results: [] });
    if (url.searchParams.get('kind') === 'city') return send(200, { results: await citySearch(q) });
    // 응답 전에 연결이 끊겼으면(앱이 새 검색으로 이전 요청을 취소) 대기 중인 Nominatim 호출을 건너뛴다
    const r = Number(url.searchParams.get('radius'));
    const radiusKm = Number.isFinite(r) && r > 0 ? Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, Math.round(r))) : DEFAULT_RADIUS_KM;
    const result = await searchPlaces(q, url.searchParams.get('full') === '1', lat, lng, radiusKm, isClosed);
    if (isClosed()) return null;
    return send(200, result);
  }

  if (url.pathname === '/api/route') {
    const pts = parsePoints(url.searchParams.get('points'));
    if (!pts) return send(400, { error: `points: 2~${MAX_ROUTE_POINTS} 개의 lat,lng 를 ; 로 구분` });
    return send(200, { legs: await routeLegs(pts) });
  }

  if (url.pathname === '/api/matrix') {
    const pts = parsePoints(url.searchParams.get('points'));
    if (!pts) return send(400, { error: `points: 2~${MAX_ROUTE_POINTS} 개의 lat,lng 를 ; 로 구분` });
    return send(200, { legs: await routeMatrix(pts) });
  }

  if (url.pathname === '/api/path') {
    const pts = parsePoints(url.searchParams.get('points'));
    const profile = url.searchParams.get('profile') === 'car' ? 'car' : 'foot';
    if (!pts || pts.length !== 2) return send(400, { error: 'points: lat,lng;lat,lng (2개)' });
    return send(200, await routePath(profile, pts[0], pts[1]));
  }

  if (url.pathname === '/api/place') {
    const name = (url.searchParams.get('name') || '').trim().slice(0, 100);
    const wdParam = url.searchParams.get('wd') || '';
    const wd = /^Q\d{1,12}$/.test(wdParam) ? wdParam : undefined;
    const alt = url.searchParams.getAll('alt').map((a) => a.trim().slice(0, 100)).filter(Boolean).slice(0, 3);
    const region = url.searchParams.getAll('region').map((a) => a.trim().slice(0, 40)).filter(Boolean).slice(0, 4);
    if (!name && !wd) return send(400, { error: 'name or wd required' });
    return send(200, { info: await placeInfo(name, alt, region, lat, lng, wd) });
  }

  if (url.pathname === '/api/health') return send(200, { ok: true });
  return send(404, { error: 'not found' });
};
