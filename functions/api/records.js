function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' } });
}
const parse = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
function toRecord(row) {
  return {
    id: row.id, battleDate: row.battle_date, result: row.result, teamId: row.team_id,
    selfPokemon: parse(row.self_pokemon_json, []), opponentPokemon: parse(row.opponent_pokemon_json, []),
    speed: parse(row.speed_json, []), damage: parse(row.damage_json, []), note: row.note || '', otherNote: row.other_note || '',
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}
function validate(body) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body?.battleDate || ''))) return '対戦日を入力してください。';
  if (!['win', 'lose', 'draw', 'other'].includes(body?.result)) return '勝敗を選択してください。';
  if (!Array.isArray(body?.selfPokemon) || body.selfPokemon.filter(Boolean).length !== 3) return '自分の選出は3匹選んでください。';
  if (!Array.isArray(body?.opponentPokemon) || body.opponentPokemon.length !== 6) return '相手の6匹を入力してください。';
  const names = body.opponentPokemon.map(p => String(p?.baseName || '').trim());
  if (names.some(v => !v)) return '相手の6匹をすべて選んでください。';
  if (new Set(names).size !== 6) return '相手の6匹に同じポケモンが重複しています。';
  if (body.opponentPokemon.filter(p => p?.selected).length !== 3) return '相手の選出は3匹選んでください。';
  return null;
}
function normalise(body) {
  return {
    battleDate: String(body.battleDate), result: body.result, teamId: body.teamId || null,
    selfPokemon: body.selfPokemon.map(v => String(v || '').trim()),
    opponentPokemon: body.opponentPokemon.map(p => ({
      baseName: String(p?.baseName || '').trim(), selected: Boolean(p?.selected), megaName: String(p?.megaName || '').trim(),
      moves: Array.isArray(p?.moves) ? p.moves.map(v => String(v || '').trim()).filter(Boolean).slice(0, 4) : [],
      item: String(p?.item || '').trim(), ability: String(p?.ability || '').trim(), note: String(p?.note || '').trim()
    })),
    speed: Array.isArray(body.speed) ? body.speed.map(s => ({ selfName: String(s?.selfName || '').trim(), opponentName: String(s?.opponentName || '').trim(), result: String(s?.result || ''), condition: String(s?.condition || ''), note: String(s?.note || '').trim() })).filter(s => s.selfName && s.opponentName && s.result) : [],
    damage: Array.isArray(body.damage) ? body.damage.map(d => ({ side: String(d?.side || ''), attacker: String(d?.attacker || '').trim(), defender: String(d?.defender || '').trim(), move: String(d?.move || '').trim(), percent: String(d?.percent || '').trim(), amount: String(d?.amount || '').trim(), note: String(d?.note || '').trim() })).filter(d => d.attacker && d.defender) : [],
    note: String(body.note || '').trim(), otherNote: String(body.otherNote || '').trim()
  };
}
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare('SELECT * FROM records ORDER BY battle_date DESC, created_at DESC').all();
  return json({ ok: true, records: results.map(toRecord) });
}
export async function onRequestPost({ request, env }) {
  let body; try { body = await request.json(); } catch { return json({ ok: false, error: '入力内容を読み取れませんでした。' }, 400); }
  const error = validate(body); if (error) return json({ ok: false, error }, 400);
  const record = normalise(body); const id = body.id || crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO records (id, battle_date, result, team_id, self_pokemon_json, opponent_pokemon_json, speed_json, damage_json, note, other_note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`)
    .bind(id, record.battleDate, record.result, record.teamId, JSON.stringify(record.selfPokemon), JSON.stringify(record.opponentPokemon), JSON.stringify(record.speed), JSON.stringify(record.damage), record.note, record.otherNote).run();
  return json({ ok: true, id });
}
