import { database } from '../_lib/db.js';
import { json, message, errorStatus } from '../_lib/http.js';

function validate(body) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body?.battleDate || ''))) return '対戦日を入力してください。';
  if (!['win', 'lose', 'draw', 'other'].includes(body?.result)) return '勝敗を選択してください。';
  if (!Array.isArray(body?.selfPokemon) || body.selfPokemon.filter(Boolean).length !== 3) return '自分の選出は3匹選んでください。';
  if (!Array.isArray(body?.opponentPokemon) || body.opponentPokemon.length !== 6) return '相手の6匹を入力してください。';
  const names = body.opponentPokemon.map(p => String(p?.baseName || '').trim());
  if (names.some(v => !v) || new Set(names).size !== 6) return '相手の6匹を確認してください。';
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
      item: String(p?.item || '').trim(), ability: String(p?.ability || '').trim(), note: String(p?.note || '').trim(),
    })),
    speed: Array.isArray(body.speed) ? body.speed.map(s => ({ selfName: String(s?.selfName || '').trim(), opponentName: String(s?.opponentName || '').trim(), result: String(s?.result || ''), condition: String(s?.condition || ''), note: String(s?.note || '').trim() })).filter(s => s.selfName && s.opponentName && s.result) : [],
    damage: Array.isArray(body.damage) ? body.damage.map(d => ({ side: String(d?.side || ''), attacker: String(d?.attacker || '').trim(), defender: String(d?.defender || '').trim(), move: String(d?.move || '').trim(), percent: String(d?.percent || '').trim(), amount: String(d?.amount || '').trim(), note: String(d?.note || '').trim() })).filter(d => d.attacker && d.defender) : [],
    note: String(body.note || '').trim(), otherNote: String(body.otherNote || '').trim(),
  };
}

export async function onRequestPut({ request, env, params }) {
  let body;
  try { body = await request.json(); } catch { return message('入力内容を読み取れませんでした。', 400); }
  const validationError = validate(body);
  if (validationError) return message(validationError, 400);

  try {
    const DB = await database(env);
    const record = normalise(body);
    await DB.prepare(`UPDATE records SET battle_date = ?, result = ?, team_id = ?, self_pokemon_json = ?, opponent_pokemon_json = ?, speed_json = ?, damage_json = ?, note = ?, other_note = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(record.battleDate, record.result, record.teamId, JSON.stringify(record.selfPokemon), JSON.stringify(record.opponentPokemon), JSON.stringify(record.speed), JSON.stringify(record.damage), record.note, record.otherNote, params.id).run();
    return json({ ok: true });
  } catch (error) {
    return message(error.message || '対戦記録を更新できませんでした。', errorStatus(error));
  }
}

export async function onRequestDelete({ env, params }) {
  try {
    const DB = await database(env);
    await DB.prepare('DELETE FROM records WHERE id = ?').bind(params.id).run();
    return json({ ok: true });
  } catch (error) {
    return message(error.message || '対戦記録を削除できませんでした。', errorStatus(error));
  }
}
