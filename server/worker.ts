// Cloudflare Workers 진입점 (배포용). 설정은 wrangler.toml, 배포는 npm run api:deploy
// 실제 로직은 server/core.ts (로컬 개발용 Node 서버 server/index.ts 와 같다)
import { handleApi, RESPONSE_HEADERS, setConfig, type ApiConfig } from './core.ts';

// 같은 요청은 Cloudflare 캐시에서 바로 돌려준다 (경로별 보관 시간, 초).
// Cloudflare 캐시는 사용자 정의 도메인에서만 동작하고 *.workers.dev 에서는 저장되지 않는다 (그때는 core 의 메모리 캐시만 씀)
const CACHE_SECONDS: Record<string, number> = {
  '/api/route': 30 * 86400,
  '/api/matrix': 30 * 86400,
  '/api/path': 86400,
  '/api/reverse': 7 * 86400,
  '/api/search': 86400,
  '/api/place': 7 * 86400,
  '/api/weather': 3600
};

// 결과를 만드는 방식이 바뀌면 올린다: 엣지에 캐시된 예전 결과를 쓰지 않게 (검색 중복 정리 → 2, 관광지 먼저 → 3)
const CACHE_VERSION = '3';

type Ctx = { waitUntil(p: Promise<unknown>): void };
type EdgeCache = { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> };

export default {
  async fetch(request: Request, env: ApiConfig, ctx: Ctx): Promise<Response> {
    setConfig(env);
    const url = new URL(request.url);
    const ttl = request.method === 'GET' ? CACHE_SECONDS[url.pathname] : undefined;
    const cache = (globalThis as unknown as { caches?: { default?: EdgeCache } }).caches?.default;
    const cacheKey = new Request(url.toString() + (url.search ? '&' : '?') + '_cv=' + CACHE_VERSION, { method: 'GET' });
    if (ttl && cache) {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    }

    let result;
    try {
      result = await handleApi(request.method, url, () => request.signal?.aborted ?? false);
    } catch (e) {
      console.error('[error]', url.pathname + url.search, (e as Error).message);
      result = { status: 502, body: { error: 'upstream failed' } };
    }
    // 앱이 요청을 취소함
    if (!result) return new Response(null, { status: 499 });

    // 검색 서버 하나가 응답하지 않아 결과가 빠졌으면(partial) 캐시하지 않는다
    const cacheable = !!ttl && result.status === 200 && !(result.body as { partial?: boolean } | null)?.partial;
    const headers: Record<string, string> = { ...RESPONSE_HEADERS };
    // 엣지(s-maxage)는 오래, 앱·브라우저(max-age)는 5분만: 서버에서 결과를 고쳐도 앱이 예전 결과를 하루 동안 쓰지 않게
    if (cacheable) headers['Cache-Control'] = 'public, max-age=' + Math.min(ttl, 300) + ', s-maxage=' + ttl;
    const res = new Response(result.status === 204 ? null : JSON.stringify(result.body), { status: result.status, headers });
    if (cacheable && cache) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  }
};
