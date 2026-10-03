// 로컬 개발용 API 서버: npm run server (Node 23.6+ 는 .ts 를 그대로 실행). 웹 개발 중에는 vite 가 /api 를 여기로 넘긴다.
// 배포는 Cloudflare Workers (server/worker.ts). 실제 로직은 둘 다 server/core.ts
// - GET /api/reverse?lat=&lng=          좌표 -> 장소 이름
// - GET /api/search?q=&lat=&lng=&radius=&full=1  장소명 -> 좌표 목록 (full=1이면 Nominatim까지 조회)
// - GET /api/route?points=lat,lng;lat,lng   연속한 지점 사이 도보/차량 이동 시간
// - GET /api/matrix?points=lat,lng;lat,lng  모든 지점 쌍의 도보/차량 이동 시간 (자동 정렬용)
// - GET /api/path?points=lat,lng;lat,lng&profile=foot|car  두 지점 사이 실제 길 모양 (이동 중 화면용)
import { createServer, type ServerResponse } from 'node:http';
import { handleApi, RESPONSE_HEADERS, setConfig, type ApiConfig } from './core.ts';

setConfig(process.env as ApiConfig);
const PORT = Number(process.env.PORT || 8787);

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, RESPONSE_HEADERS);
  res.end(status === 204 ? '' : JSON.stringify(body));
};

createServer((req, res) => {
  let closed = false;
  res.on('close', () => {
    if (!res.writableFinished) closed = true;
  });
  const url = new URL(req.url || '/', 'http://localhost');
  handleApi(req.method || 'GET', url, () => closed)
    .then((r) => {
      if (r) send(res, r.status, r.body);
    })
    .catch((e) => {
      console.error('[error]', req.url, (e as Error).message);
      send(res, 502, { error: 'upstream failed' });
    });
}).listen(PORT, () => {
  console.log(`geocoding server listening on http://localhost:${PORT}`);
});
