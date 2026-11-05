import Database from 'better-sqlite3'
import { MIGRATION_V1 } from './migrations/001_initial'
import { MIGRATION_V2 } from './migrations/002_command_receipts'
import { MIGRATION_V3 } from './migrations/003_team_roster'
import { MIGRATION_V4 } from './migrations/004_member_performer'
import { MIGRATION_V5 } from './migrations/005_used_questions'

export type AppDatabase = Database.Database

export function openDatabase(dbPath: string): AppDatabase {
  const db = new Database(dbPath)
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.pragma('busy_timeout = 5000')
    migrate(db)
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

export function migrate(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as
    | { version: number | null }
    | undefined
  const current = row?.version ?? 0
  const now = new Date().toISOString()
  if (current < 1) {
    db.transaction(() => {
      db.exec(MIGRATION_V1)
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)').run(now)
    })()
  }
  if (current < 2) {
    db.transaction(() => {
      db.exec(MIGRATION_V2)
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)').run(now)
    })()
  }
  const rowAfterV2 = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as
    | { version: number | null }
    | undefined
  const versionNow = rowAfterV2?.version ?? 0
  if (versionNow < 3) {
    db.transaction(() => {
      db.exec(MIGRATION_V3)
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?)').run(now)
    })()
  }
  const rowAfterV3 = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as
    | { version: number | null }
    | undefined
  const versionAfterV3 = rowAfterV3?.version ?? 0
  if (versionAfterV3 < 4) {
    db.transaction(() => {
      db.exec(MIGRATION_V4)
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (4, ?)').run(now)
    })()
  }
  db.transaction(() => {
    const latest = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number }
    if (latest.version >= 5) return
    db.exec(MIGRATION_V5)
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (5, ?)').run(now)
  }).immediate()
}

export function openMemoryDatabase(): AppDatabase {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}
