import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "../src/core/database";

const directory = new URL("../database/migrations/", import.meta.url);

export async function loadMigrations() {
  const names = (await readdir(directory))
    .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = await Bun.file(new URL(name, directory)).text();
      return {
        name,
        checksum: createHash("sha256").update(sql).digest("hex"),
        statements: sql
          .split(/^-- statement\s*$/m)
          .map((part) => part.trim())
          .filter((part) => /CREATE|ALTER|INSERT|UPDATE|DELETE/i.test(part)),
      };
    })
  );
}

export async function migrate() {
  const migrations = await loadMigrations();
  if (process.argv.includes("--dry-run")) {
    for (const migration of migrations)
      console.log(
        `${migration.name}: ${migration.statements.length} statements; SHA256 ${migration.checksum}`
      );
    return;
  }

  const connection = await db.getConnection();
  const lock =
    "camelatto:" +
    createHash("sha256")
      .update(process.env.DB_NAME || "")
      .digest("hex")
      .slice(0, 40);
  let locked = false;
  try {
    const [locks] = await connection.execute<RowDataPacket[]>(
      "SELECT GET_LOCK(?, 10) AS acquired",
      [lock]
    );
    if (locks[0]?.acquired !== 1)
      throw new Error("Outra migration está em execução.");
    locked = true;
    await connection.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    const [applied] = await connection.execute<RowDataPacket[]>(
      "SELECT name, checksum FROM schema_migrations"
    );
    const known = new Map(applied.map((row) => [row.name, row.checksum]));
    for (const row of applied) {
      if (
        !migrations.some(
          (item) => item.name === row.name && item.checksum === row.checksum
        )
      ) {
        throw new Error(`Migration aplicada ausente ou alterada: ${row.name}`);
      }
    }
    for (const migration of migrations) {
      if (known.has(migration.name)) continue;
      // DDL no MySQL faz commit implícito. Registrar somente após todas as instruções.
      for (const statement of migration.statements)
        await connection.query(statement);
      await connection.execute(
        "INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)",
        [migration.name, migration.checksum]
      );
      console.log(`Aplicada: ${migration.name}`);
    }
  } finally {
    if (locked) await connection.execute("SELECT RELEASE_LOCK(?)", [lock]);
    connection.release();
  }
}

if (import.meta.main) {
  try {
    await migrate();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Falha na migration."
    );
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
