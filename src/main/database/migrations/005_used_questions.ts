export const MIGRATION_V5 = `
CREATE TABLE IF NOT EXISTS used_questions (
  normalized_text TEXT NOT NULL PRIMARY KEY
);

INSERT INTO used_questions (normalized_text)
SELECT DISTINCT normalized_text_snapshot
FROM game_question_queue
WHERE first_allocated_at IS NOT NULL OR state IN ('CURRENT', 'JUDGED', 'VOIDED')
ON CONFLICT(normalized_text) DO NOTHING;
`
