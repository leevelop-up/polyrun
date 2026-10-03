// 목적지마다 아고다 도시 ID 를 찾아 src/data/cities.json 의 "agoda" 에 채운다 (숙소 예약 링크용).
// 이미 채운 목적지는 건너뛴다. 실행: node scripts/agoda-cities.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../src/data/cities.json', import.meta.url);
const cities = JSON.parse(readFileSync(FILE, 'utf8'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kmBetween = (a, b) => {
  const rad = Math.PI / 180;
  const h = Math.sin(((b[0] - a[0]) * rad) / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(((b[1] - a[1]) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

async function suggest(text) {
  const url = 'https://www.agoda.com/api/cronos/search/GetUnifiedSuggestResult/3/1/1/0/ko-kr/?origin=KR&searchText=' + encodeURIComponent(text);
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return (await res.json()).ViewModelList || [];
}

// 검색으로는 다른 도시가 잡히는 곳: LA → 비엔티안/라스베이거스, 빈 → 베트남 Vinh, 보스턴 → 영국 Boston
const FIXED = { 'la-vegas': 12772, vienna: 16582, boston: 9254 };

for (const c of cities) {
  // "바르셀로나 · 마드리드" 처럼 여러 도시면 첫 도시, "LA · 라스베가스" 도 첫 도시
  if (FIXED[c.id]) c.agoda = FIXED[c.id];
  if (c.agoda) continue;
  const first = c.name.split(',')[0].split('·')[0].replace(/\(.*\)/, '').trim();
  const tries = [first, c.id.replace(/-/g, ' ')];
  let found = null;
  for (const t of tries) {
    const list = await suggest(t).catch(() => []);
    // 도시(PageTypeId 5) 중 지도 중심에서 가까운 것
    const city = list.find((v) => v.PageTypeId === 5 && v.ObjectId > 0 && (!v.Latitude || kmBetween(c.center, [v.Latitude, v.Longtitude]) < 150));
    if (city) {
      // 같은 ID 의 '도시, 나라' 줄로 맞는 도시인지 눈으로 확인한다
      const full = list.find((v) => v.ObjectId === city.ObjectId && /,/.test(v.ResultText || ''));
      found = { id: city.ObjectId, text: (full || city).ResultText };
      break;
    }
    await sleep(300);
  }
  console.log(c.name.padEnd(20), found ? found.id + ' ' + found.text : '-- not found');
  if (found) c.agoda = found.id;
  await sleep(300);
}

// 한 줄에 한 목적지 (원래 모양 유지)
const keys = ['id', 'name', 'code', 'center', 'zoom', 'search', 'aliases', 'agoda'];
const line = (c) => '  {' + [...keys.filter((k) => k in c), ...Object.keys(c).filter((k) => !keys.includes(k))].map((k) => JSON.stringify(k) + ': ' + JSON.stringify(c[k]).replace(/,"/g, ', "')).join(', ') + '}';
writeFileSync(FILE, '[\n' + cities.map(line).join(',\n') + '\n]\n');
