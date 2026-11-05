import Database from 'better-sqlite3'
import { MIGRATION_V1 } from './migrations/001_initial'

const CURRENT_VERSION = 1

export type AppDatabase = Database.Database

export function openDatabase(dbPath: string): AppDatabase {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  migrate(db)
  return db
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
  if (current >= CURRENT_VERSION) {
    return
  }

  db.transaction(() => {
    db.exec(MIGRATION_V1)
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      CURRENT_VERSION,
      new Date().toISOString()
    )
  })()
}

export function openMemoryDatabase(): AppDatabase {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}
