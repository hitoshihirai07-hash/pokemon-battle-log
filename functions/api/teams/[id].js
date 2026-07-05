function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' } });
}
function validate(body) {
  const name = String(body?.name || '').trim();
  const pokemon = Array.isArray(body?.pokemon) ? body.pokemon.map(v => String(v || '').trim()).filter(Boolean) : [];
  if (!name) return '構築名を入力してください。';
  if (pokemon.length !== 6) return '自分の構築は6匹ちょうど選んでください。';
  if (new Set(pokemon).size !== 6) return '同じポケモンを重複して登録できません。';
  return null;
}
export async function onRequestPut({ request, env, params }) {
  let body; try { body = await request.json(); } catch { return json({ ok: false, error: '入力内容を読み取れませんでした。' }, 400); }
  const error = validate(body); if (error) return json({ ok: false, error }, 400);
  await env.DB.prepare('UPDATE teams SET name = ?, pokemon_json = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .bind(String(body.name).trim(), JSON.stringify(body.pokemon.map(v => String(v).trim())), params.id).run();
  return json({ ok: true });
}
export async function onRequestDelete({ env, params }) {
  await env.DB.prepare('DELETE FROM teams WHERE id = ?').bind(params.id).run();
  return json({ ok: true });
}
