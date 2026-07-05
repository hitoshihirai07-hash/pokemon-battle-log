CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pokemon_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  battle_date TEXT NOT NULL,
  result TEXT NOT NULL,
  team_id TEXT,
  self_pokemon_json TEXT NOT NULL,
  opponent_pokemon_json TEXT NOT NULL,
  speed_json TEXT NOT NULL DEFAULT '[]',
  damage_json TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  other_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_records_battle_date ON records (battle_date DESC);
CREATE INDEX IF NOT EXISTS idx_records_team_id ON records (team_id);
