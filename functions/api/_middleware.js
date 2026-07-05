import { message } from './_lib/http.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' },
    });
  }

  const path = new URL(request.url).pathname;
  if (path === '/api/auth' || path === '/api/health') return context.next();

  if (!env.APP_PIN) {
    return message('CloudflareのAPP_PINシークレットが未設定です。Pagesの「設定 > 変数とシークレット」で、APP_PINを暗号化して追加し、本番を再デプロイしてください。', 503);
  }

  const pin = request.headers.get('x-app-pin');
  if (!pin || pin !== env.APP_PIN) return message('認証が必要です。', 401);
  return context.next();
}
