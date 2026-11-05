export const MIGRATION_V3 = `
CREATE TABLE IF NOT EXISTS game_team_members (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES game_teams(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  name TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_game_member_name
  ON game_team_members(game_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_game_team_member_order
  ON game_team_members(team_id, sort_order);

DELETE FROM games;
`
