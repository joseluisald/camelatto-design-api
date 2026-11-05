import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";

// Teste explícito de integração: cria e remove somente uma base aleatória local.
const host = process.env.DB_HOST || "";
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error("O teste de integração só pode executar em banco local.");
}
const databaseName = "camelatto_test_" + randomBytes(8).toString("hex");
const admin = await mysql.createConnection({
  host,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectTimeout: 5000,
});
let created = false;
let pool: mysql.Pool | undefined;
try {
  await admin.query(
    `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  created = true;
  process.env.DB_NAME = databaseName;
  const { db } = await import("../src/core/database");
  pool = db;
  const { migrate } = await import("./migrate");
  const { seed, initialContent } = await import("./seed");
  await migrate();
  await migrate();
  await Promise.all([seed(), seed()]);
  const { app } = await import("../src/index");
  const get = (path: string) =>
    app.handle(new Request(`http://localhost/v1${path}`));
  const response = await get("/content");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), initialContent);
  assert.equal((await get("/projects/projeto-01")).status, 200);
  assert.equal((await get("/seo?path=/projetos/projeto-01")).status, 200);
  assert.equal((await get("/projects/inexistente")).status, 404);
  await db.execute("UPDATE projects SET is_published = 0 WHERE slug = ?", [
    "projeto-01",
  ]);
  assert.equal((await get("/projects/projeto-01")).status, 404);
  assert.equal((await get("/seo?path=/projetos/projeto-01")).status, 404);
  const projects = await (await get("/projects")).json();
  assert.equal(projects.length, 2);
  const aggregate = await (await get("/content")).json();
  assert.equal(aggregate.portfolio.projects.length, 2);
  await db.execute("UPDATE faqs SET is_published = 0 WHERE id = 1");
  assert.equal((await (await get("/faqs")).json()).length, 3);
  await seed();
  assert.equal((await get("/projects/projeto-01")).status, 404);
  await db.execute("DELETE FROM projects WHERE id = ?", ["01"]);
  const [tags] = await db.execute<mysql.RowDataPacket[]>(
    "SELECT id FROM project_tags WHERE project_id = ?",
    ["01"]
  );
  assert.equal(tags.length, 0);
  await db.execute("UPDATE schema_migrations SET checksum = ? WHERE name = ?", [
    "0".repeat(64),
    "001_content.sql",
  ]);
  await assert.rejects(migrate, /ausente ou alterada/);
  console.log(
    "Integração OK: migration repetida, seed concorrente e preservação de edições, conteúdo equivalente à LP, filtros de publicação, FKs e checksum."
  );
} finally {
  await pool?.end();
  if (created && /^camelatto_test_[a-f0-9]{16}$/.test(databaseName)) {
    await admin.query(`DROP DATABASE \`${databaseName}\``);
    console.log("Base temporária de teste removida.");
  }
  await admin.end();
}
