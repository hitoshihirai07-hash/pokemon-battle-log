import { database } from '../_lib/db.js';
import { json, message, errorStatus } from '../_lib/http.js';

function validate(body) {
  const name = String(body?.name || '').trim();
  const pokemon = Array.isArray(body?.pokemon) ? body.pokemon.map(v => String(v || '').trim()).filter(Boolean) : [];
  if (!name) return '構築名を入力してください。';
  if (pokemon.length !== 6) return '自分の構築は6匹ちょうど選んでください。';
  if (new Set(pokemon).size !== 6) return '同じポケモンを重複して登録できません。';
  return null;
}

export async function onRequestPut({ request, env, params }) {
  let body;
  try { body = await request.json(); } catch { return message('入力内容を読み取れませんでした。', 400); }
  const validationError = validate(body);
  if (validationError) return message(validationError, 400);

  try {
    const DB = await database(env);
    await DB.prepare('UPDATE teams SET name = ?, pokemon_json = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind(String(body.name).trim(), JSON.stringify(body.pokemon.map(v => String(v).trim())), params.id).run();
    return json({ ok: true });
  } catch (error) {
    return message(error.message || '構築を更新できませんでした。', errorStatus(error));
  }
}

export async function onRequestDelete({ env, params }) {
  try {
    const DB = await database(env);
    await DB.prepare('DELETE FROM teams WHERE id = ?').bind(params.id).run();
    return json({ ok: true });
  } catch (error) {
    return message(error.message || '構築を削除できませんでした。', errorStatus(error));
  }
}
