import { database } from './_lib/db.js';
import { json, message, errorStatus } from './_lib/http.js';

export async function onRequestGet({ env }) {
  if (!env.APP_PIN) {
    return message('CloudflareのAPP_PINシークレットが未設定です。Pagesの「設定 > 変数とシークレット」で、APP_PINを暗号化して追加し、本番を再デプロイしてください。', 503);
  }
  try {
    await database(env);
    return json({ ok: true });
  } catch (error) {
    return message(error.message || 'D1への接続を確認できませんでした。', errorStatus(error, 503));
  }
}
