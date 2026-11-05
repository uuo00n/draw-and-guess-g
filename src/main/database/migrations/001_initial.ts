export const MIGRATION_V1 = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS question_banks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_filename TEXT,
  imported_at TEXT,
  file_sha256 TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  normalized_text TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  points INTEGER NOT NULL CHECK (points > 0),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bank_questions (
  bank_id TEXT NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  PRIMARY KEY (bank_id, question_id)
);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  end_reason TEXT,
  round_count INTEGER NOT NULL,
  turn_duration_ms INTEGER NOT NULL,
  score_mode TEXT NOT NULL,
  bank_id TEXT NOT NULL REFERENCES question_banks(id),
  current_turn_id TEXT,
  planned_turn_count INTEGER NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS game_teams (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  total_score INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS game_turns (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES game_teams(id) ON DELETE CASCADE,
  round_no INTEGER NOT NULL,
  sequence_no INTEGER NOT NULL,
  status TEXT NOT NULL,
  end_reason TEXT,
  current_queue_item_id TEXT,
  remaining_ms INTEGER NOT NULL DEFAULT 0,
  turn_score INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS game_question_queue (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  queue_position INTEGER NOT NULL,
  state TEXT NOT NULL,
  shown_turn_id TEXT,
  first_allocated_at TEXT,
  verdict TEXT,
  question_text_snapshot TEXT NOT NULL,
  normalized_text_snapshot TEXT NOT NULL,
  category_snapshot TEXT NOT NULL,
  difficulty_snapshot TEXT NOT NULL,
  points_snapshot INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS answer_events (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL REFERENCES game_turns(id) ON DELETE CASCADE,
  queue_item_id TEXT,
  command_id TEXT NOT NULL UNIQUE,
  action TEXT NOT NULL,
  score_delta INTEGER NOT NULL DEFAULT 0,
  remaining_ms INTEGER,
  occurred_at TEXT NOT NULL,
  reverts_event_id TEXT,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS score_adjustments (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES game_teams(id) ON DELETE CASCADE,
  turn_id TEXT,
  command_id TEXT NOT NULL UNIQUE,
  delta INTEGER NOT NULL,
  previous_team_score INTEGER NOT NULL,
  new_team_score INTEGER NOT NULL,
  previous_turn_score INTEGER,
  new_turn_score INTEGER,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_events (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  turn_id TEXT,
  command_id TEXT NOT NULL UNIQUE,
  action TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_game_queue_question
  ON game_question_queue(game_id, question_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_game_queue_order
  ON game_question_queue(game_id, queue_position);
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_current_question_per_game
  ON game_question_queue(game_id) WHERE state = 'CURRENT';
CREATE UNIQUE INDEX IF NOT EXISTS uq_turn_team_round
  ON game_turns(game_id, team_id, round_no);
CREATE UNIQUE INDEX IF NOT EXISTS uq_turn_sequence
  ON game_turns(game_id, sequence_no);
CREATE UNIQUE INDEX IF NOT EXISTS uq_game_team_sort
  ON game_teams(game_id, sort_order);
`
