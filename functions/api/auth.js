import { json, message } from './_lib/http.js';

export async function onRequestPost({ request, env }) {
  if (!env.APP_PIN) {
    return message('CloudflareのAPP_PINシークレットが未設定です。Pagesの「設定 > 変数とシークレット」で、APP_PINを暗号化して追加し、本番を再デプロイしてください。', 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return message('入力内容を読み取れませんでした。', 400);
  }

  if (!body?.pin || body.pin !== env.APP_PIN) return message('PINが違います。', 401);
  return json({ ok: true });
}
