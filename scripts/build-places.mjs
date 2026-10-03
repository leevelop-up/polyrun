// 도시별 관광지 데이터 만들기: src/data/cities.json 의 도시마다 Wikidata 에서 관광지를 받아 src/data/places/<id>.json 으로 저장한다.
// 실행: node scripts/build-places.mjs            (받아 둔 도시는 건너뜀)
//       node scripts/build-places.mjs tokyo kyoto (그 도시만 다시)
// - Wikidata 는 CC0(퍼블릭 도메인)이라 받은 데이터를 앱에 그대로 저장·가공해도 된다.
// - 인지도 = 위키백과 언어판 수(sitelinks). 많이 알려진 곳부터 도시마다 최대 MAX_PER_CITY 곳.
// - 직접 고른 추천 장소(src/data/picks.json)와 같은 곳은 빼고, 그 수만큼 덜 받는다 (도시당 합계 최대 MAX_PER_CITY).
// - 받은 원본은 scripts/.wikidata-cache/ 에 저장해 다시 돌릴 때 재사용한다 (지우면 새로 받음).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const CITIES = new URL('../src/data/cities.json', import.meta.url);
const CURATED = new URL('../src/data/picks.json', import.meta.url);
const OUT_DIR = new URL('../src/data/places/', import.meta.url);
const CACHE_DIR = new URL('./.wikidata-cache/', import.meta.url);
const USER_AGENT = process.env.GEO_USER_AGENT || 'trip-scheduler/0.0.1 (attraction data build script)';
const MAX_PER_CITY = 100;
const CONCURRENCY = 1;

// 관광지로 보는 종류 (하위 종류 1단계까지 포함)
const INCLUDE = {
  Q570116: '관광', // tourist attraction
  Q33506: '관광', // museum
  Q207694: '관광', // art museum
  Q16735822: '관광', // history museum
  Q588140: '관광', // science museum
  Q1007870: '관광', // art gallery
  Q44539: '관광', // temple
  Q160742: '관광', // Buddhist temple
  Q842402: '관광', // Hindu temple
  Q845945: '관광', // Shinto shrine
  Q32815: '관광', // mosque
  Q16970: '관광', // church building
  Q2977: '관광', // cathedral
  Q163687: '관광', // basilica
  Q22698: '관광', // park
  Q22746: '관광', // urban park
  Q1107656: '관광', // garden
  Q1195942: '관광', // Japanese garden
  Q167346: '관광', // botanical garden
  Q46169: '관광', // national park
  Q23413: '관광', // castle
  Q57821: '관광', // fortification
  Q16560: '관광', // palace
  Q12518: '관광', // tower
  Q1440300: '관광', // observation tower
  Q6017969: '관광', // viewpoint
  Q174782: '관광', // square
  Q4989906: '관광', // monument
  Q179700: '관광', // statue
  Q5003624: '관광', // memorial
  Q2319498: '관광', // landmark
  Q483453: '관광', // fountain
  Q12280: '관광', // bridge
  Q43501: '관광', // zoo
  Q2281788: '관광', // public aquarium
  Q194195: '관광', // amusement park
  Q2416723: '관광', // theme park
  Q3914: '관광', // school? (no) -> kept out below via EXCLUDE when needed
  Q24354: '관광', // theater building
  Q153562: '관광', // opera house
  Q1060829: '관광', // concert hall
  Q839954: '관광', // archaeological site
  Q109607: '관광', // ruins
  Q1081138: '관광', // historic site
  Q2065736: '관광', // cultural property
  Q17350442: '관광', // venue? (Japanese cultural heritage etc.)
  Q575759: '관광', // war memorial
  Q5393308: '관광', // Buddhist monastery
  Q40080: '관광', // beach
  Q34038: '관광', // waterfall
  Q41176: '관광', // building (only with enough sitelinks; filtered by EXCLUDE)
  Q811165: '관광', // architectural heritage monument
  Q1371849: '관광', // heritage? (Dutch rijksmonument-like)
  Q37654: '쇼핑', // market
  Q1144349: '쇼핑', // night market
  Q11315: '쇼핑', // shopping mall
  Q31374404: '쇼핑', // shopping center
  Q1048525: '쇼핑' // shopping street / district
};
delete INCLUDE.Q3914; // 학교는 관광지가 아니다 (위 목록 정리용)

// 관광지 종류에 걸려도 빼는 것 (빌딩, 사무·주거·교통·교육·행정 시설, 경기장 등)
const EXCLUDE = [
  'Q11303', // skyscraper
  'Q18142', // high-rise building
  'Q1021645', // office building
  'Q27686', // hotel
  'Q55488', // railway station
  'Q928830', // metro station
  'Q3918', // university
  'Q16917', // hospital
  'Q3917681', // embassy
  'Q11755880', // residential building
  'Q1248784', // airport
  'Q4830453', // business
  'Q2526255', // film director? (기존 시험에서 쓴 값 유지)
  'Q856584', // library building
  'Q7075', // library
  'Q3947', // house
  'Q18674739', // event venue
  'Q1076486', // sports venue
  'Q483110', // stadium
  'Q1497375', // official residence
  'Q16831714', // government building
  'Q1329623', // cultural center
  'Q860861', // sculpture (박물관 안 작품: 밀로의 비너스 등)
  'Q838948', // work of art
  'Q3305213', // painting
  'Q15661340' // ancient city (루테티아 같은 옛 도시)
];

const readJson = (url, fallback) => (existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : fallback);
const cities = readJson(CITIES, []);
const curated = readJson(CURATED, {});
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(CACHE_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const query = (lat, lng, km, minLinks, limit) => `
SELECT ?item ?ko ?en ?coord ?links (SAMPLE(?cls) AS ?kind) (SAMPLE(?adminKo) AS ?aKo) (SAMPLE(?adminEn) AS ?aEn) WHERE {
  SERVICE wikibase:around { ?item wdt:P625 ?coord . bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral ; wikibase:radius "${km}" . }
  ?item wikibase:sitelinks ?links . FILTER(?links >= ${minLinks})
  VALUES ?cls { ${Object.keys(INCLUDE).map((c) => 'wd:' + c).join(' ')} }
  ?item wdt:P31 ?t . ?t wdt:P279? ?cls .
  FILTER NOT EXISTS { VALUES ?ex { ${EXCLUDE.map((c) => 'wd:' + c).join(' ')} } ?item wdt:P31 ?ex . }
  # 지금은 없는 곳(철거·해체 날짜 P576)과 소장처가 있는 작품(P195)은 뺀다
  FILTER NOT EXISTS { ?item wdt:P576 ?gone . }
  FILTER NOT EXISTS { ?item wdt:P195 ?collection . }
  OPTIONAL { ?item rdfs:label ?ko . FILTER(LANG(?ko) = "ko") }
  OPTIONAL { ?item rdfs:label ?en . FILTER(LANG(?en) = "en") }
  OPTIONAL { ?item wdt:P131 ?adm . OPTIONAL { ?adm rdfs:label ?adminKo . FILTER(LANG(?adminKo) = "ko") } OPTIONAL { ?adm rdfs:label ?adminEn . FILTER(LANG(?adminEn) = "en") } }
}
GROUP BY ?item ?ko ?en ?coord ?links
ORDER BY DESC(?links) LIMIT ${limit}`;

const sparql = async (q) => {
  const res = await fetch('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'query=' + encodeURIComponent(q),
    signal: AbortSignal.timeout(90000)
  });
  if (res.status === 429) {
    const wait = Number(res.headers.get('retry-after') || 30);
    await sleep(wait * 1000);
    throw new Error('429');
  }
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()).results.bindings;
};

// 원 하나(중심, 반경 km)의 관광지. minLinks: 인지도 기준(위키백과 언어판 수 이상).
// 파리처럼 좌표 달린 항목이 너무 많아 시간 초과(504)가 나면 반경 절반인 원 7개(가운데 + 둘레 6개, 원래 원을 다 덮음)로 쪼개 다시 묻고,
// 더 쪼갤 수 없으면 인지도 기준을 올려 묻는다 (런던·베를린).
const fetchCircle = async (id, lat, lng, km, depth = 0, minLinks = 3) => {
  const file = new URL(`${id}@${lat.toFixed(4)},${lng.toFixed(4)},${km}${minLinks === 3 ? '' : '+' + minLinks}.json`, CACHE_DIR);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const tryQuery = async (links) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const rows = await sparql(query(lat, lng, km, links, 160));
        writeFileSync(file, JSON.stringify(rows));
        return rows;
      } catch (e) {
        console.warn(`  ! ${id} ${lat.toFixed(3)},${lng.toFixed(3)} r${km} links>=${links} ${e.message}`);
        if (e.message === '504' || e.name === 'TimeoutError') return null;
        await sleep(5000);
      }
    }
    return null;
  };
  const rows = await tryQuery(minLinks);
  if (rows) return rows;
  if (depth >= 2 || km < 2) {
    const strict = minLinks < 10 ? await tryQuery(10) : null;
    if (strict) return strict;
    throw new Error(`${id} ${lat},${lng} r${km} failed`);
  }
  const r = +(km / 2).toFixed(2);
  const d = km * 0.866;
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const parts = [[lat, lng]];
  for (let k = 0; k < 6; k++) {
    const ang = (k * Math.PI) / 3;
    parts.push([lat + (d * Math.sin(ang)) / 110.54, lng + (d * Math.cos(ang)) / kx]);
  }
  const merged = [];
  for (const [la, ln] of parts) merged.push(...(await fetchCircle(id, la, ln, r, depth + 1, minLinks)));
  return merged;
};

// 고른 장소들의 한국어 별칭 (예: 로쿠온지 → 금각사). 검색에 걸리게 aliases 에 넣는다.
const fetchKoAliases = async (id, qids) => {
  const file = new URL(`${id}-aliases.json`, CACHE_DIR);
  const cached = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const missing = qids.filter((q) => !(q in cached));
  for (let i = 0; i < missing.length; i += 50) {
    const ids = missing.slice(i, i + 50).join('|');
    // 너무 자주 물으면 429: 알려 준 시간(없으면 점점 길게)만큼 기다렸다 다시. 끝내 안 되면 별칭 없이 진행
    let entities = null;
    for (let attempt = 0; attempt < 5 && !entities; attempt++) {
      const res = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=aliases&languages=ko&maxlag=5&ids=${ids}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(30000)
      }).catch(() => null);
      const data = res && res.ok ? await res.json().catch(() => null) : null;
      if (data?.entities) entities = data.entities;
      else await sleep((Number(res?.headers.get('retry-after')) || 10 * (attempt + 1)) * 1000);
    }
    if (!entities) {
      console.warn(`  ! ${id} 한국어 별칭을 받지 못해 건너뜀`);
      break;
    }
    for (const [q, e] of Object.entries(entities)) cached[q] = (e.aliases?.ko || []).map((a) => a.value);
    await sleep(1500);
  }
  writeFileSync(file, JSON.stringify(cached));
  return cached;
};

const norm = (s) => s.toLowerCase().replace(/[\s·・'’.\-()]/g, '');
const distM = (a, b) => {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
};

const buildCity = async (city) => {
  const rows = [];
  for (const [lat, lng, km] of city.search) rows.push(...(await fetchCircle(city.id, lat, lng, km)));
  // 위키백과 문서가 적은 곳(휴양지, 국내 소도시)은 인지도 기준을 낮춰 더 받는다
  if (new Set(rows.map((b) => b.item.value)).size < 40) {
    for (const [lat, lng, km] of city.search) rows.push(...(await fetchCircle(city.id, lat, lng, km, 0, 1)));
  }

  const mine = curated[city.name]?.picks || [];
  const taken = new Set(mine.flatMap((p) => [p.name, ...(p.aliases || [])]).map(norm));
  const seenItems = new Set();
  const picks = [];
  for (const b of rows.sort((x, y) => +y.links.value - +x.links.value)) {
    const wd = b.item.value.split('/').pop();
    if (seenItems.has(wd)) continue;
    seenItems.add(wd);
    const ko = b.ko?.value;
    const en = b.en?.value;
    const name = ko || en;
    if (!name || /^Q\d+$/.test(name)) continue;
    const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(b.coord.value);
    if (!m) continue;
    const p = { name, cat: INCLUDE[b.kind?.value.split('/').pop()] || '관광', area: b.aKo?.value || b.aEn?.value || '', lat: +(+m[2]).toFixed(5), lng: +(+m[1]).toFixed(5) };
    // 직접 고른 추천과 같은 곳(이름이 같거나 80m 안)은 뺀다
    if (taken.has(norm(name)) || (en && taken.has(norm(en))) || mine.some((c) => distM(c, p) < 80)) continue;
    // 이름이 같은 다른 항목(예: 같은 이름의 공원 두 곳)은 더 알려진 쪽만
    if (picks.some((x) => norm(x.name) === norm(name))) continue;
    if (en && en !== name) p.aliases = [en];
    p.wd = wd;
    picks.push(p);
    if (picks.length >= Math.max(0, MAX_PER_CITY - mine.length)) break;
  }
  // 한국어 별칭을 검색용으로 더한다 (이름과 같은 건 빼고 최대 3개)
  const koAliases = await fetchKoAliases(city.id, picks.map((p) => p.wd));
  for (const p of picks) {
    const extra = (koAliases[p.wd] || []).filter((a) => norm(a) !== norm(p.name)).slice(0, 3);
    if (extra.length) p.aliases = [...new Set([...(p.aliases || []), ...extra])];
  }
  writeFileSync(new URL(`${city.id}.json`, OUT_DIR), JSON.stringify({ source: 'Wikidata (CC0)', builtAt: new Date().toISOString().slice(0, 10), picks }, null, 1) + '\n');
  const ko = picks.filter((p) => !p.aliases || p.name !== p.aliases[0]).length;
  console.log(`${city.name}: 추천 ${mine.length} + Wikidata ${picks.length} (한국어 이름 ${picks.filter((p) => /[가-힣]/.test(p.name)).length})`);
  return { city: city.name, curated: mine.length, added: picks.length, ko };
};

const only = process.argv.slice(2);
const todo = cities.filter((c) => (only.length ? only.includes(c.id) : !existsSync(new URL(`${c.id}.json`, OUT_DIR))));
console.log(`${todo.length}개 도시 처리 (전체 ${cities.length})`);
const failed = [];
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < todo.length) {
      const city = todo[next++];
      try {
        await buildCity(city);
      } catch (e) {
        failed.push(city.id);
        console.warn(`✗ ${city.name}: ${e.message}`);
      }
    }
  })
);
if (failed.length) {
  console.log(`실패 ${failed.length}곳 (다시 실행하면 이어서 받음): ${failed.join(' ')}`);
  process.exitCode = 1;
}
