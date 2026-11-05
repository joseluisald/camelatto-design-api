import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { readdir, unlink, rmdir } from "node:fs/promises";
import mysql from "mysql2/promise";

const host = process.env.DB_HOST || "";
if (!["localhost", "127.0.0.1", "::1"].includes(host))
  throw new Error("Teste permitido somente no banco local.");
const suffix = randomBytes(8).toString("hex");
const databaseName = "camelatto_test_" + suffix;
const mediaRoot = path.resolve("storage", ".admin-test-" + suffix);
process.env.MEDIA_STORAGE_PATH = mediaRoot;
const connection = await mysql.createConnection({
  host,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});
let created = false;
let pool: mysql.Pool | undefined;
try {
  await connection.query(
    `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  created = true;
  process.env.DB_NAME = databaseName;
  const { db } = await import("../src/core/database");
  pool = db;
  const { migrate } = await import("./migrate");
  const { seed } = await import("./seed");
  await migrate();
  await migrate();
  await seed();
  const { hashPassword, hashToken } =
    await import("../src/services/auth.service");
  const password = "Integration-only-password-123!";
  const setup = Bun.spawn(["bun", "scripts/create-admin.ts"], {
    env: {
      ...process.env,
      ADMIN_SETUP_NAME: "CLI Admin",
      ADMIN_SETUP_EMAIL: "cli@example.test",
      ADMIN_SETUP_PASSWORD: password,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const setupLog = await new Response(setup.stdout).text();
  assert.equal(await setup.exited, 0, await new Response(setup.stderr).text());
  assert.ok(!setupLog.includes(password));
  const [provisioned] = await db.execute<mysql.RowDataPacket[]>(
    "SELECT password_hash FROM admin_users WHERE email='cli@example.test'"
  );
  assert.match(provisioned[0].password_hash, /^\$argon2id\$/);
  const hash = await hashPassword(password);
  await db.execute(
    "INSERT INTO admin_users (id,name,email,password_hash,role) VALUES (?,?,?,?,?),(?,?,?,?,?)",
    [
      "owner",
      "Owner",
      "owner@example.test",
      hash,
      "admin",
      "editor",
      "Editor",
      "editor@example.test",
      hash,
      "editor",
    ]
  );
  const { app } = await import("../src/index");
  const call = (
    method: string,
    endpoint: string,
    body?: unknown,
    token?: string
  ) =>
    app.handle(
      new Request("http://localhost/v1" + endpoint, {
        method,
        headers: {
          ...(body === undefined || body instanceof FormData
            ? {}
            : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body:
          body === undefined
            ? undefined
            : body instanceof FormData
              ? body
              : JSON.stringify(body),
      })
    );
  const expect = async (
    status: number,
    method: string,
    endpoint: string,
    body?: unknown,
    token?: string
  ) => {
    const response = await call(method, endpoint, body, token);
    const value = await response.json();
    assert.equal(
      response.status,
      status,
      `${method} ${endpoint}: ${JSON.stringify(value)}`
    );
    return value;
  };
  await expect(401, "GET", "/admin/dashboard");
  await expect(401, "POST", "/auth/login", {
    email: "owner@example.test",
    password: "wrong",
  });
  const owner = await expect(200, "POST", "/auth/login", {
    email: "owner@example.test",
    password,
  });
  const editor = await expect(200, "POST", "/auth/login", {
    email: "editor@example.test",
    password,
  });
  assert.match(owner.token, /^[A-Za-z0-9_-]{43}$/);
  const [sessions] = await db.execute<mysql.RowDataPacket[]>(
    "SELECT token_hash FROM admin_sessions WHERE user_id='owner'"
  );
  assert.equal(sessions[0].token_hash, hashToken(owner.token));
  assert.notEqual(sessions[0].token_hash, owner.token);
  const me = await expect(200, "GET", "/auth/me", undefined, owner.token);
  assert.equal(me.user.role, "admin");
  assert.ok(!("passwordHash" in me.user));
  await expect(200, "GET", "/admin/dashboard", undefined, editor.token);
  await expect(403, "GET", "/admin/users", undefined, editor.token);
  await expect(403, "GET", "/admin/audit", undefined, editor.token);
  await expect(
    403,
    "GET",
    "/admin/documents/settings",
    undefined,
    editor.token
  );
  for (const key of [
    "hero",
    "navigation",
    "approach",
    "gallery",
    "about",
    "contact",
    "faq",
    "settings",
  ]) {
    const document = await expect(
      200,
      "GET",
      "/admin/documents/" + key,
      undefined,
      owner.token
    );
    await expect(
      200,
      "PUT",
      "/admin/documents/" + key,
      { data: document.data, version: document.version },
      owner.token
    );
  }
  const hero = await expect(
    200,
    "GET",
    "/admin/documents/hero",
    undefined,
    owner.token
  );
  const changed = { ...hero.data, title: "Updated through admin API" };
  const saved = await expect(
    200,
    "PUT",
    "/admin/documents/hero",
    { data: changed, version: hero.version },
    editor.token
  );
  assert.equal(saved.version, hero.version + 1);
  await expect(
    409,
    "PUT",
    "/admin/documents/hero",
    { data: hero.data, version: hero.version },
    editor.token
  );
  assert.equal(
    (await expect(200, "GET", "/content")).portfolio.hero.title,
    changed.title
  );
  const settings = await expect(
    200,
    "GET",
    "/admin/documents/settings",
    undefined,
    owner.token
  );
  await expect(
    422,
    "PUT",
    "/admin/documents/settings",
    {
      data: { ...settings.data, linkedin: "javascript:alert(1)" },
      version: settings.version,
    },
    owner.token
  );
  const source = await expect(
    200,
    "GET",
    "/admin/projects/01",
    undefined,
    owner.token
  );
  const project = {
    ...source.data,
    id: "integration",
    slug: "integration",
    isPublished: false,
  };
  const draft = await expect(
    200,
    "POST",
    "/admin/projects",
    { data: project },
    editor.token
  );
  await expect(404, "GET", "/projects/integration");
  await expect(409, "POST", "/admin/projects", { data: project }, editor.token);
  const published = await expect(
    200,
    "PATCH",
    "/admin/projects/integration",
    { data: { ...project, isPublished: true }, version: draft.version },
    editor.token
  );
  await expect(200, "GET", "/projects/integration");
  const seo = await expect(200, "GET", "/seo?path=/projetos/integration");
  assert.equal(seo.title, project.seo.title);
  await expect(
    409,
    "PATCH",
    "/admin/projects/integration",
    { data: project, version: draft.version },
    editor.token
  );
  const list = await expect(
    200,
    "GET",
    "/admin/projects?page=1&q=integration&status=published",
    undefined,
    owner.token
  );
  assert.equal(list.items.length, 0); // busca por título/descrição, não slug
  await expect(
    403,
    "DELETE",
    "/admin/projects/integration",
    { version: published.version },
    editor.token
  );
  await expect(
    200,
    "DELETE",
    "/admin/projects/integration",
    { version: published.version },
    owner.token
  );
  await expect(404, "GET", "/projects/integration");
  await expect(
    409,
    "PATCH",
    "/admin/users/owner",
    { name: "Owner", role: "editor", isActive: true },
    owner.token
  );
  await expect(
    200,
    "PATCH",
    "/admin/users/editor",
    { name: "Editor", role: "editor", isActive: true, revoke: true },
    owner.token
  );
  await expect(401, "GET", "/auth/me", undefined, editor.token);
  const sharp = (await import("sharp")).default;
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#8f1b41" },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.set("file", new File([png], "test.png", { type: "image/png" }));
  form.set("alt", "Imagem de teste");
  const image = await expect(200, "POST", "/admin/media", form, owner.token);
  assert.match(image.url, /\/v1\/media\/[0-9a-f-]+\.webp$/);
  const fileResponse = await app.handle(new Request(image.url));
  assert.equal(fileResponse.status, 200);
  assert.equal(fileResponse.headers.get("content-type"), "image/webp");
  const badImage = new FormData();
  badImage.set(
    "file",
    new File(["<svg></svg>"], "bad.png", { type: "image/png" })
  );
  badImage.set("alt", "Inválida");
  await expect(422, "POST", "/admin/media", badImage, owner.token);
  await expect(
    401,
    "POST",
    "/auth/change-password",
    { currentPassword: "wrong", newPassword: "New-integration-password-123!" },
    owner.token
  );
  await expect(
    200,
    "POST",
    "/auth/change-password",
    { currentPassword: password, newPassword: "New-integration-password-123!" },
    owner.token
  );
  await expect(401, "GET", "/auth/me", undefined, owner.token);
  const again = await expect(200, "POST", "/auth/login", {
    email: "owner@example.test",
    password: "New-integration-password-123!",
  });
  const resetToken = randomBytes(32).toString("base64url");
  await db.execute(
    "INSERT INTO admin_password_resets (token_hash,user_id,expires_at) VALUES (?, 'owner', DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE))",
    [hashToken(resetToken)]
  );
  await expect(200, "POST", "/auth/reset-password", {
    token: resetToken,
    newPassword: password,
  });
  await expect(400, "POST", "/auth/reset-password", {
    token: resetToken,
    newPassword: password,
  });
  await expect(401, "GET", "/auth/me", undefined, again.token);
  const final = await expect(200, "POST", "/auth/login", {
    email: "owner@example.test",
    password,
  });
  await expect(200, "POST", "/auth/logout", undefined, final.token);
  await expect(401, "GET", "/auth/me", undefined, final.token);
  for (let attempt = 0; attempt < 10; attempt++)
    await expect(401, "POST", "/auth/login", {
      email: "unknown@example.test",
      password: "wrong",
    });
  await expect(429, "POST", "/auth/login", {
    email: "unknown@example.test",
    password: "wrong",
  });
  if (process.env.ADMIN_TEST_DIR) {
    const { verifyAdminBff } = await import("./check-admin-bff");
    await verifyAdminBff(app.handle, process.env.ADMIN_TEST_DIR);
  }
  console.log(
    "Admin API OK: auth, hashes, permissões, seções, projetos, conflitos, uploads, revogação, senha, recuperação e rate limit."
  );
} finally {
  await pool?.end();
  if (created && /^camelatto_test_[a-f0-9]{16}$/.test(databaseName))
    await connection.query(`DROP DATABASE \`${databaseName}\``);
  await connection.end();
  // Só arquivos UUID gerados pelo próprio teste, em sua pasta isolada.
  if (
    mediaRoot.startsWith(path.resolve("storage") + path.sep) &&
    path.basename(mediaRoot) === ".admin-test-" + suffix
  ) {
    for (const name of await readdir(mediaRoot).catch(() => [] as string[])) {
      if (/^[0-9a-f-]{36}\.webp$/.test(name))
        await unlink(path.join(mediaRoot, name));
    }
    await rmdir(mediaRoot).catch(() => undefined);
  }
}
