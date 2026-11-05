export const MIGRATION_V2 = `
CREATE TABLE IF NOT EXISTS command_receipts (
  command_id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  event_id TEXT,
  applied INTEGER NOT NULL,
  reject_reason TEXT,
  created_at TEXT NOT NULL
);
`
