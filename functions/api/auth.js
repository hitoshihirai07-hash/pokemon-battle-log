function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' } });
}

export async function onRequestPost({ request, env }) {
  if (!env.APP_PIN) return json({ ok: false, error: 'CloudflareのAPP_PINシークレットが未設定です。' }, 500);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: '入力内容を読み取れませんでした。' }, 400); }
  if (!body?.pin || body.pin !== env.APP_PIN) return json({ ok: false, error: 'PINが違います。' }, 401);
  return json({ ok: true });
}
