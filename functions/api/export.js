function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' } });
}
const parse = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
export async function onRequestGet({ env }) {
  const teams = await env.DB.prepare('SELECT * FROM teams ORDER BY created_at').all();
  const records = await env.DB.prepare('SELECT * FROM records ORDER BY battle_date, created_at').all();
  return json({
    app: 'Pokemon Battle Log', exportedAt: new Date().toISOString(),
    teams: teams.results.map(r => ({ id: r.id, name: r.name, pokemon: parse(r.pokemon_json, []), createdAt: r.created_at, updatedAt: r.updated_at })),
    records: records.results.map(r => ({ id: r.id, battleDate: r.battle_date, result: r.result, teamId: r.team_id, selfPokemon: parse(r.self_pokemon_json, []), opponentPokemon: parse(r.opponent_pokemon_json, []), speed: parse(r.speed_json, []), damage: parse(r.damage_json, []), note: r.note || '', otherNote: r.other_note || '', createdAt: r.created_at, updatedAt: r.updated_at }))
  });
}
