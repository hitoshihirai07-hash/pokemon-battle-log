import { database } from './_lib/db.js';
import { json, message, errorStatus } from './_lib/http.js';

const parse = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };

export async function onRequestGet({ env }) {
  try {
    const DB = await database(env);
    const teams = await DB.prepare('SELECT * FROM teams ORDER BY created_at').all();
    const records = await DB.prepare('SELECT * FROM records ORDER BY battle_date, created_at').all();
    return json({
      ok: true,
      app: 'Pokemon Battle Log',
      exportedAt: new Date().toISOString(),
      teams: teams.results.map(row => ({ id: row.id, name: row.name, pokemon: parse(row.pokemon_json, []), createdAt: row.created_at, updatedAt: row.updated_at })),
      records: records.results.map(row => ({ id: row.id, battleDate: row.battle_date, result: row.result, teamId: row.team_id, selfPokemon: parse(row.self_pokemon_json, []), opponentPokemon: parse(row.opponent_pokemon_json, []), speed: parse(row.speed_json, []), damage: parse(row.damage_json, []), note: row.note || '', otherNote: row.other_note || '', createdAt: row.created_at, updatedAt: row.updated_at })),
    });
  } catch (error) {
    return message(error.message || 'バックアップを作成できませんでした。', errorStatus(error));
  }
}
