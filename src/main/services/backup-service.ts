import { statSync } from 'node:fs'
import Database from 'better-sqlite3'
import type { AppDatabase } from '../database/connection'
import { recoverDatabase } from '../domain/game-engine'
import type { TimerEngine } from '../domain/timer-engine'

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
  const foreignKeys = live.pragma('foreign_key_check') as unknown[]
  if (foreignKeys.length > 0) {
    replaceWith(live, safetyPath)
    throw new Error('恢复后的外键检查未通过，已退回覆盖前的数据库')
  }
  for (const gameId of timer.activeGameIds()) {
    timer.disarm(gameId)
  }
  recoverDatabase(live, timer)
}

function replaceWith(live: AppDatabase, sourcePath: string): void {
  const tables = live
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`
    )
    .all() as Array<{ name: string }>
  const attached = sourcePath.replaceAll('\\', '/').replaceAll("'", "''")
  live.pragma('foreign_keys = OFF')
  live.exec(`ATTACH DATABASE '${attached}' AS restore_src`)
  try {
    const copy = live.transaction(() => {
      for (const table of tables) {
        live.exec(`DELETE FROM main."${quoteIdent(table.name)}"`)
      }
      for (const table of tables) {
        const present = live
          .prepare(`SELECT 1 AS ok FROM restore_src.sqlite_master WHERE type = 'table' AND name = ?`)
          .get(table.name)
        if (!present) continue
        const name = quoteIdent(table.name)
        live.exec(`INSERT INTO main."${name}" SELECT * FROM restore_src."${name}"`)
      }
    })
    copy()
  } finally {
    live.exec('DETACH DATABASE restore_src')
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
