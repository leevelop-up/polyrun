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
  '/api/search': 86400
};

type Ctx = { waitUntil(p: Promise<unknown>): void };
type EdgeCache = { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> };

export default {
  async fetch(request: Request, env: ApiConfig, ctx: Ctx): Promise<Response> {
    setConfig(env);
    const url = new URL(request.url);
    const ttl = request.method === 'GET' ? CACHE_SECONDS[url.pathname] : undefined;
    const cache = (globalThis as unknown as { caches?: { default?: EdgeCache } }).caches?.default;
    if (ttl && cache) {
      const hit = await cache.match(request);
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
    if (cacheable) headers['Cache-Control'] = 'public, max-age=' + ttl;
    const res = new Response(result.status === 204 ? null : JSON.stringify(result.body), { status: result.status, headers });
    if (cacheable && cache) ctx.waitUntil(cache.put(request, res.clone()));
    return res;
  }
};
