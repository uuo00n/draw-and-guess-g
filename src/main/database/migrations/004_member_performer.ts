export const MIGRATION_V4 = `
ALTER TABLE game_team_members ADD COLUMN is_performer INTEGER NOT NULL DEFAULT 0;
`
