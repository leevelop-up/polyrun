// 추천 장소 좌표 채우기: scripts/picks-source.json -> src/data/picks.json
// 실행: node scripts/geocode-picks.mjs
// - Nominatim 이용 정책(초당 1회, 식별 가능한 User-Agent)을 지킨다.
// - 찾은 좌표는 scripts/.geocode-cache.json 에 바로바로 저장해, 중간에 끊기거나 목록을 고쳐 다시 돌려도 새 장소만 조회한다.
// - src/data/picks.json 은 마지막에 한 번만 쓴다. (진행 중에 src 를 계속 고치면 개발 서버가 매번 앱을 새로고침한다)
// - 지역 center 주변(약 13km)에서만 찾아, 같은 이름의 다른 도시 장소가 잡히지 않게 한다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SRC = new URL('./picks-source.json', import.meta.url);
const CACHE = new URL('./.geocode-cache.json', import.meta.url);
const OUT = new URL('../src/data/picks.json', import.meta.url);
const USER_AGENT = process.env.GEO_USER_AGENT || 'runtrip/0.0.8 (picks geocoding script)';
const NOMINATIM_URL = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';

const readJson = (url) => (existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : {});
const source = readJson(SRC);
const keyOf = (area, name) => `${area}|${name}`;

// 캐시: "지역|이름" -> {lat, lng}. 캐시 파일이 없을 때만 기존 picks.json 결과로 채운다.
// (좌표가 틀린 장소는 캐시에서 해당 키를 지우고 다시 돌리면 새로 조회한다)
const cache = readJson(CACHE);
if (!existsSync(CACHE)) {
  for (const dest of Object.values(readJson(OUT))) {
    for (const p of dest.picks || []) cache[keyOf(p.area, p.name)] = { lat: p.lat, lng: p.lng };
  }
}
const saveCache = () => writeFileSync(CACHE, JSON.stringify(cache, null, 1) + '\n');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const search = async (q, [lat, lng], r) => {
  await sleep(1100);
  const viewbox = `${lng - r},${lat + r},${lng + r},${lat - r}`;
  const url = `${NOMINATIM_URL}/search?format=jsonv2&limit=1&bounded=1&viewbox=${viewbox}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status}`);
  const [hit] = await res.json();
  return hit ? { lat: +(+hit.lat).toFixed(5), lng: +(+hit.lon).toFixed(5) } : null;
};

const out = {};
const failed = [];
for (const [destName, areas] of Object.entries(source)) {
  if (destName.startsWith('_')) continue;
  const picks = [];
  for (const { area, center, places } of areas) {
    for (const [name, cat, q] of places) {
      const key = keyOf(area, name);
      if (!cache[key]) {
        try {
          const coord = (await search(q, center, 0.12)) || (await search(q, center, 0.35));
          if (coord) {
            cache[key] = coord;
            saveCache();
            console.log(`${destName} / ${area} / ${name} -> ${coord.lat}, ${coord.lng}`);
          }
        } catch (e) {
          console.warn(`  ! ${destName} / ${area} / ${name}: ${e.message}`);
        }
      }
      const coord = cache[key];
      if (!coord) {
        failed.push(`${destName} / ${area} / ${name} (${q})`);
        continue;
      }
      const pick = { name, cat, area, lat: coord.lat, lng: coord.lng };
      // 영어/현지 이름도 추천 목록 검색에 걸리게 별칭으로 남긴다
      if (q !== name) pick.aliases = [q];
      picks.push(pick);
    }
  }
  out[destName] = { areas: areas.map((a) => a.area), picks };
}

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`\n완료: ${Object.values(out).reduce((s, d) => s + d.picks.length, 0)}곳`);
if (failed.length) {
  console.log(`좌표를 못 찾은 장소 ${failed.length}곳 (검색어를 고쳐 다시 실행):`);
  failed.forEach((f) => console.log('  - ' + f));
  process.exitCode = 1;
}
