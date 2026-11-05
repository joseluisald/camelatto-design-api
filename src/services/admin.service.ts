import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { Value } from "@sinclair/typebox/value";
import { randomUUID } from "node:crypto";
import { transaction } from "../core/transaction";
import { ApiError } from "../core/api-error";
import { AdminRepository } from "../repositories/admin.repository";
import { audit, hashPassword, requireAdmin } from "./auth.service";
import {
  documentSchemas,
  type DocumentKey,
  type Documents,
  type ProjectInput,
} from "../models/admin";
import type { AdminUser, AuthContext } from "../models/auth";

export async function lockWrite(
  connection: PoolConnection,
  context: AuthContext
) {
  await connection.execute(
    "SELECT entity_key FROM admin_content_versions WHERE entity_key='__write_lock__' FOR UPDATE"
  );
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT u.id, u.name, u.email, u.role FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP() AND u.is_active=1 FOR UPDATE`,
    [context.tokenHash]
  );
  if (!rows[0])
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "Entre novamente para continuar."
    );
  return rows[0] as AdminUser;
}

async function checkVersion(
  repository: AdminRepository,
  key: string,
  expected: number
) {
  const current = await repository.version(key);
  if (current !== expected)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "Este conteúdo foi alterado por outra pessoa. Recarregue antes de salvar."
    );
  await repository.connection.execute(
    "INSERT INTO admin_content_versions (entity_key,version) VALUES (?,?) ON DUPLICATE KEY UPDATE version=VALUES(version)",
    [key, current + 1]
  );
}

export function assertSafeUrls(value: unknown, key = "") {
  if (
    typeof value === "string" &&
    [
      "url",
      "href",
      "image",
      "ogImage",
      "linkedin",
      "behance",
      "resume",
      "whatsapp",
    ].includes(key)
  ) {
    if (
      !value ||
      (key === "image" && ["mobile", "web", "research"].includes(value))
    )
      return;
    const invalid = () => {
      throw new ApiError(
        422,
        "INVALID_URL",
        "Informe uma URL http(s) sem credenciais ou um caminho iniciado por /."
      );
    };
    if (/[\u0000-\u0020\\]/.test(value) || value.startsWith("//")) invalid();
    if (value.startsWith("/")) return;
    try {
      const url = new URL(value);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        invalid();
    } catch {
      invalid();
    }
  } else if (Array.isArray(value)) {
    for (const item of value) assertSafeUrls(item, key);
  } else if (value && typeof value === "object") {
    for (const [name, item] of Object.entries(value))
      assertSafeUrls(item, name);
  }
}

export const getDocument = (key: DocumentKey) =>
  transaction((connection) => new AdminRepository(connection).document(key));

export async function saveDocument(
  context: AuthContext,
  key: DocumentKey,
  data: unknown,
  version: number
) {
  if (!Value.Check(documentSchemas[key], data))
    throw new ApiError(
      422,
      "INVALID_DOCUMENT",
      "Confira os campos da seção e seus limites."
    );
  assertSafeUrls(data);
  if (key === "faq") {
    const ids = (data as Documents["faq"]).map((item) => item.id);
    if (new Set(ids).size !== ids.length)
      throw new ApiError(
        422,
        "DUPLICATE_FAQ_ID",
        "As perguntas precisam de identificadores diferentes."
      );
  }
  return transaction(async (connection) => {
    const actor = await lockWrite(connection, context);
    if (key === "settings") requireAdmin(actor);
    const repository = new AdminRepository(connection);
    await repository.document(key);
    await checkVersion(repository, "document:" + key, version);
    await repository.saveDocument(key, data as Documents[typeof key]);
    await audit(connection, actor.id, "update", "document", key);
    return repository.document(key);
  });
}

export async function listProjects(page: number, search = "", status = "") {
  return transaction(async (connection) => {
    const repository = new AdminRepository(connection);
    const clauses = ["1=1"];
    const values: (string | number)[] = [];
    if (search) {
      clauses.push("(title LIKE ? OR description LIKE ?)");
      const escaped = search.replace(/[!%_]/g, "!$&");
      clauses[clauses.length - 1] =
        "(title LIKE ? ESCAPE '!' OR description LIKE ? ESCAPE '!')";
      values.push("%" + escaped + "%", "%" + escaped + "%");
    }
    if (status) {
      clauses.push("is_published=?");
      values.push(status === "published" ? 1 : 0);
    }
    const where = clauses.join(" AND ");
    const [count] = await repository.rows<{ total: number }>(
      `SELECT COUNT(*) AS total FROM projects WHERE ${where}`,
      values
    );
    const ids = await repository.rows<{ id: string }>(
      `SELECT id FROM projects WHERE ${where} ORDER BY sort_order,id LIMIT 20 OFFSET ?`,
      [...values, (page - 1) * 20]
    );
    const items = [];
    for (const row of ids) items.push(await repository.project(row.id));
    return { items, total: Number(count.total), page };
  });
}

export const getProject = (id: string) =>
  transaction((connection) => new AdminRepository(connection).project(id));

export async function saveProject(
  context: AuthContext,
  data: ProjectInput,
  version?: number
) {
  assertSafeUrls(data);
  if (
    data.isPublished &&
    [
      data.description,
      data.category,
      data.challenge,
      data.process,
      data.solution,
    ].some((value) => !value.trim())
  ) {
    throw new ApiError(
      422,
      "INCOMPLETE_PROJECT",
      "Preencha categoria, descrição, desafio, processo e solução antes de publicar."
    );
  }
  return transaction(async (connection) => {
    const actor = await lockWrite(connection, context);
    const repository = new AdminRepository(connection);
    if (version !== undefined) {
      await repository.project(data.id);
      await checkVersion(repository, "project:" + data.id, version);
    }
    await repository.saveProject(data, version === undefined);
    await audit(
      connection,
      actor.id,
      version === undefined ? "create" : "update",
      "project",
      data.id
    );
    return repository.project(data.id);
  });
}

export async function deleteProject(
  context: AuthContext,
  id: string,
  version: number
) {
  return transaction(async (connection) => {
    const actor = await lockWrite(connection, context);
    requireAdmin(actor);
    const repository = new AdminRepository(connection);
    await repository.project(id);
    await checkVersion(repository, "project:" + id, version);
    await connection.execute("DELETE FROM projects WHERE id=?", [id]);
    // Mantém a versão tombstone para impedir que uma aba antiga sobrescreva um ID recriado.
    await audit(connection, actor.id, "delete", "project", id);
    return { success: true };
  });
}

export async function dashboard() {
  return transaction(async (connection) => {
    const repository = new AdminRepository(connection);
    const [projects] = await repository.rows<{
      total: number;
      published: number;
    }>(
      "SELECT COUNT(*) AS total, COALESCE(SUM(is_published),0) AS published FROM projects"
    );
    const [faq] = await repository.rows<{ total: number }>(
      "SELECT COUNT(*) AS total FROM faqs"
    );
    const [media] = await repository.rows<{ total: number }>(
      "SELECT COUNT(*) AS total FROM media_assets"
    );
    const recent = await repository.rows(
      "SELECT id,title,slug,is_published AS isPublished,updated_at AS updatedAt FROM projects ORDER BY updated_at DESC,id LIMIT 5"
    );
    return {
      projects: Number(projects.total),
      published: Number(projects.published),
      drafts: Number(projects.total) - Number(projects.published),
      faqs: Number(faq.total),
      media: Number(media.total),
      recent,
    };
  });
}

export async function listUsers(context: AuthContext) {
  requireAdmin(context.user);
  return transaction(async (connection) =>
    new AdminRepository(connection).rows(
      "SELECT id,name,email,role,is_active AS isActive,created_at AS createdAt FROM admin_users ORDER BY name,id"
    )
  );
}

export async function createUser(
  context: AuthContext,
  input: {
    name: string;
    email: string;
    password: string;
    role: "admin" | "editor";
  }
) {
  requireAdmin(context.user);
  const hash = await hashPassword(input.password);
  return transaction(async (connection) => {
    const actor = await lockWrite(connection, context);
    requireAdmin(actor);
    const id = randomUUID();
    await connection.execute(
      "INSERT INTO admin_users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)",
      [
        id,
        input.name.trim(),
        input.email.toLowerCase().trim(),
        hash,
        input.role,
      ]
    );
    await audit(connection, actor.id, "create", "user", id);
    return {
      id,
      name: input.name,
      email: input.email.toLowerCase().trim(),
      role: input.role,
    };
  });
}

export async function updateUser(
  context: AuthContext,
  id: string,
  input: {
    name: string;
    role: "admin" | "editor";
    isActive: boolean;
    revoke?: boolean;
  }
) {
  requireAdmin(context.user);
  return transaction(async (connection) => {
    const actor = await lockWrite(connection, context);
    requireAdmin(actor);
    const repository = new AdminRepository(connection);
    const [target] = await repository.rows<{ role: string; isActive: number }>(
      "SELECT role,is_active AS isActive FROM admin_users WHERE id=? FOR UPDATE",
      [id]
    );
    if (!target)
      throw new ApiError(404, "USER_NOT_FOUND", "Usuário não encontrado.");
    if (id === actor.id && (!input.isActive || input.role !== "admin"))
      throw new ApiError(
        409,
        "SELF_ACCESS_CHANGE",
        "Você não pode remover seu próprio acesso administrativo."
      );
    if (
      target.role === "admin" &&
      target.isActive &&
      (!input.isActive || input.role !== "admin")
    ) {
      const [count] = await repository.rows<{ total: number }>(
        "SELECT COUNT(*) AS total FROM admin_users WHERE role='admin' AND is_active=1"
      );
      if (Number(count.total) <= 1)
        throw new ApiError(
          409,
          "LAST_ADMIN",
          "Mantenha pelo menos um administrador ativo."
        );
    }
    await connection.execute(
      "UPDATE admin_users SET name=?,role=?,is_active=? WHERE id=?",
      [input.name.trim(), input.role, Number(input.isActive), id]
    );
    if (target.role !== input.role || !input.isActive || input.revoke)
      await connection.execute("DELETE FROM admin_sessions WHERE user_id=?", [
        id,
      ]);
    await audit(
      connection,
      actor.id,
      input.revoke ? "revoke_sessions" : "update",
      "user",
      id
    );
    return { success: true };
  });
}

export async function listAudit(context: AuthContext, page: number) {
  requireAdmin(context.user);
  return transaction(async (connection) => {
    const repository = new AdminRepository(connection);
    const [count] = await repository.rows<{ total: number }>(
      "SELECT COUNT(*) AS total FROM admin_audit_logs"
    );
    const items = await repository.rows(
      `SELECT a.id,a.author_id AS authorId,COALESCE(u.name,'Sistema') AS authorName,a.action,a.entity,a.entity_id AS entityId,a.created_at AS createdAt
      FROM admin_audit_logs a LEFT JOIN admin_users u ON u.id=a.author_id ORDER BY a.created_at DESC,a.id DESC LIMIT 20 OFFSET ?`,
      [(page - 1) * 20]
    );
    return { items, total: Number(count.total), page };
  });
}
