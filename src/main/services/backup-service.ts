import { statSync } from 'node:fs'
import Database from 'better-sqlite3'
import type { AppDatabase } from '../database/connection'
import { recoverDatabase } from '../domain/game-engine'
import { TimerEngine } from '../domain/timer-engine'

type BackupDatabase = AppDatabase & {
  backup: (destination: string | AppDatabase) => Promise<unknown>
}

function asBackup(db: AppDatabase): BackupDatabase {
  return db as BackupDatabase
}

export async function backupDatabaseFile(db: AppDatabase, destination: string): Promise<void> {
  db.pragma('wal_checkpoint(TRUNCATE)')
  await asBackup(db).backup(destination)
}

export async function restoreDatabaseFile(
  live: AppDatabase,
  sourcePath: string,
  safetyPath: string,
  timer: TimerEngine
): Promise<void> {
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true })
  try {
    const integrity = source.pragma('integrity_check', { simple: true })
    if (integrity !== 'ok') {
      throw new Error('备份未通过完整性检查')
    }
    const games = source
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'games'`)
      .get()
    if (!games) {
      throw new Error('该文件不是本程序的数据库备份')
    }
  } finally {
    source.close()
  }

  await backupDatabaseFile(live, safetyPath)
  replaceWith(live, sourcePath)
  for (const gameId of timer.activeGameIds()) {
    timer.disarm(gameId)
  }
}

function replaceWith(live: AppDatabase, sourcePath: string): void {
  const tables = live
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         AND name NOT IN ('schema_migrations', 'used_questions')
       ORDER BY name`
    )
    .all() as Array<{ name: string }>
  const attached = sourcePath.replaceAll('\\', '/').replaceAll("'", "''")
  live.pragma('foreign_keys = OFF')
  try {
    live.exec(`ATTACH DATABASE '${attached}' AS restore_src`)
    try {
      const copy = live.transaction(() => {
        const sourceHasTable = live.prepare(
          `SELECT 1 FROM restore_src.sqlite_master WHERE type = 'table' AND name = ?`
        )
        const hasUsageRecords = Boolean(sourceHasTable.get('used_questions'))
        if (hasUsageRecords) {
          live.exec(`INSERT INTO main.used_questions (normalized_text)
            SELECT normalized_text FROM restore_src.used_questions WHERE 1
            ON CONFLICT(normalized_text) DO NOTHING`)
        }
        for (const table of tables) {
          live.exec(`DELETE FROM main."${quoteIdent(table.name)}"`)
        }
        for (const table of tables) {
          if (!sourceHasTable.get(table.name)) continue
          const name = quoteIdent(table.name)
          const columns = live.prepare(`PRAGMA restore_src.table_info("${name}")`)
            .all() as Array<{ name: string }>
          const columnList = columns.map(({ name }) => `"${quoteIdent(name)}"`).join(', ')
          live.exec(`INSERT INTO main."${name}" (${columnList})
            SELECT ${columnList} FROM restore_src."${name}"`)
        }
        if (!hasUsageRecords) {
          live.exec(`INSERT INTO main.used_questions (normalized_text)
            SELECT DISTINCT normalized_text_snapshot FROM main.game_question_queue
            WHERE first_allocated_at IS NOT NULL OR state IN ('CURRENT', 'JUDGED', 'VOIDED')
            ON CONFLICT(normalized_text) DO NOTHING`)
        }
        if ((live.pragma('foreign_key_check') as unknown[]).length > 0) {
          throw new Error('恢复后的外键检查未通过，已保留恢复前的数据库')
        }
        recoverDatabase(live, new TimerEngine())
      })
      copy.immediate()
    } finally {
      live.exec('DETACH DATABASE restore_src')
    }
  } finally {
    live.pragma('foreign_keys = ON')
  }
}

function quoteIdent(name: string): string {
  return name.replaceAll('"', '""')
}

export function databaseFileBytes(dbPath: string): number {
  try {
    return statSync(dbPath).size
  } catch {
    return 0
  }
}
