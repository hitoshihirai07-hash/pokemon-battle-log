function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' } });
}
const parse = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
function toTeam(row) { return { ...row, pokemon: parse(row.pokemon_json, []) }; }
function validate(body) {
  const name = String(body?.name || '').trim();
  const pokemon = Array.isArray(body?.pokemon) ? body.pokemon.map(v => String(v || '').trim()).filter(Boolean) : [];
  if (!name) return '構築名を入力してください。';
  if (pokemon.length !== 6) return '自分の構築は6匹ちょうど選んでください。';
  if (new Set(pokemon).size !== 6) return '同じポケモンを重複して登録できません。';
  return null;
}
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare('SELECT * FROM teams ORDER BY updated_at DESC, created_at DESC').all();
  return json({ ok: true, teams: results.map(toTeam) });
}
export async function onRequestPost({ request, env }) {
  let body; try { body = await request.json(); } catch { return json({ ok: false, error: '入力内容を読み取れませんでした。' }, 400); }
  const error = validate(body); if (error) return json({ ok: false, error }, 400);
  const id = body.id || crypto.randomUUID();
  const team = { id, name: String(body.name).trim(), pokemon: body.pokemon.map(v => String(v).trim()) };
  await env.DB.prepare('INSERT INTO teams (id, name, pokemon_json, created_at, updated_at) VALUES (?, ?, ?, datetime(\'now\'), datetime(\'now\'))')
    .bind(team.id, team.name, JSON.stringify(team.pokemon)).run();
  return json({ ok: true, team });
}
