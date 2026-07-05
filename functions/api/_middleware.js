function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' }
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' } });
  }
  const path = new URL(request.url).pathname;
  if (path === '/api/auth') return context.next();
  if (!env.APP_PIN) return json({ ok: false, error: 'CloudflareのAPP_PINシークレットが未設定です。' }, 500);
  const pin = request.headers.get('x-app-pin');
  if (!pin || pin !== env.APP_PIN) return json({ ok: false, error: '認証が必要です。' }, 401);
  return context.next();
}
