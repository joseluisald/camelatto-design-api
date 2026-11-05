import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { RowDataPacket, PoolConnection } from "mysql2/promise";
import nodemailer from "nodemailer";
import { db } from "../core/database";
import { transaction } from "../core/transaction";
import { ApiError } from "../core/api-error";
import {
  findUser,
  findSession,
  lockUser,
} from "../repositories/auth.repository";
import type { AdminUser, AuthContext } from "../models/auth";

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const hashPassword = (password: string) =>
  Bun.password.hash(password, {
    algorithm: "argon2id",
    memoryCost: 19456,
    timeCost: 2,
  });
const dummyHash = hashPassword(randomBytes(32).toString("hex"));
const invalidCredentials = () =>
  new ApiError(401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos.");
let passwordOperations = 0;

export async function audit(
  connection: PoolConnection,
  authorId: string | null,
  action: string,
  entity: string,
  entityId: string
) {
  await connection.execute(
    "INSERT INTO admin_audit_logs (id, author_id, action, entity, entity_id) VALUES (?, ?, ?, ?, ?)",
    [randomUUID(), authorId, action, entity, entityId]
  );
}

export async function rateLimit(key: string, max: number, seconds = 900) {
  const limitKey = hashToken(key);
  const allowed = await transaction(async (connection) => {
    await connection.execute(
      `INSERT INTO admin_rate_limits (limit_key, attempts, resets_at) VALUES (?, 1, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))
      ON DUPLICATE KEY UPDATE attempts = IF(resets_at <= UTC_TIMESTAMP(), 1, attempts + 1),
      resets_at = IF(resets_at <= UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND), resets_at)`,
      [limitKey, seconds, seconds]
    );
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT attempts FROM admin_rate_limits WHERE limit_key = ? FOR UPDATE",
      [limitKey]
    );
    return Number(rows[0].attempts) <= max;
  });
  if (!allowed)
    throw new ApiError(
      429,
      "TOO_MANY_ATTEMPTS",
      "Muitas tentativas. Aguarde alguns minutos."
    );
}

export async function authenticate(
  authorization?: string | null
): Promise<AuthContext> {
  const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  const session = token ? await findSession(hashToken(token)) : undefined;
  if (!session)
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "Entre novamente para continuar."
    );
  return session;
}

export function requireAdmin(user: AdminUser) {
  if (user.role !== "admin")
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Você não tem permissão para esta operação."
    );
}

export async function login(email: string, password: string, peer: string) {
  email = email.trim().toLowerCase();
  await rateLimit("login-peer:" + peer, 100);
  await rateLimit("login-email:" + email, 10);
  if (passwordOperations >= 6)
    throw new ApiError(
      429,
      "TOO_MANY_ATTEMPTS",
      "Muitas tentativas. Aguarde alguns minutos."
    );
  passwordOperations++;
  try {
    const user = await findUser(email);
    const valid = await Bun.password
      .verify(password, user?.passwordHash || (await dummyHash))
      .catch(() => false);
    if (!valid || !user?.isActive) throw invalidCredentials();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    return await transaction(async (connection) => {
      const current = await lockUser(connection, user.id);
      if (!current?.isActive || current.passwordHash !== user.passwordHash)
        throw invalidCredentials();
      await connection.execute(
        "DELETE FROM admin_sessions WHERE user_id = ? AND expires_at <= UTC_TIMESTAMP()",
        [user.id]
      );
      await connection.execute(
        "INSERT INTO admin_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
        [randomUUID(), user.id, hashToken(token), expiresAt]
      );
      await connection.execute(
        "DELETE FROM admin_rate_limits WHERE limit_key = ?",
        [hashToken("login-email:" + email)]
      );
      await audit(connection, user.id, "login", "session", user.id);
      return {
        token,
        expiresAt: expiresAt.toISOString(),
        user: {
          id: current.id,
          name: current.name,
          email: current.email,
          role: current.role,
        },
      };
    });
  } finally {
    passwordOperations--;
  }
}

export async function logout(context: AuthContext) {
  await transaction(async (connection) => {
    await connection.execute(
      "DELETE FROM admin_sessions WHERE token_hash = ?",
      [context.tokenHash]
    );
    await audit(
      connection,
      context.user.id,
      "logout",
      "session",
      context.user.id
    );
  });
  return { success: true };
}

export async function changePassword(
  context: AuthContext,
  currentPassword: string,
  newPassword: string
) {
  await rateLimit("change-password:" + context.user.id, 10);
  const record = await findUser(context.user.email);
  if (
    !record ||
    !(await Bun.password.verify(currentPassword, record.passwordHash))
  )
    throw invalidCredentials();
  const hash = await hashPassword(newPassword);
  await transaction(async (connection) => {
    const current = await lockUser(connection, context.user.id);
    if (!current || current.passwordHash !== record.passwordHash)
      throw invalidCredentials();
    await connection.execute(
      "UPDATE admin_users SET password_hash = ? WHERE id = ?",
      [hash, context.user.id]
    );
    await connection.execute("DELETE FROM admin_sessions WHERE user_id = ?", [
      context.user.id,
    ]);
    await connection.execute(
      "DELETE FROM admin_password_resets WHERE user_id = ?",
      [context.user.id]
    );
    await audit(
      connection,
      context.user.id,
      "change_password",
      "user",
      context.user.id
    );
  });
  return { success: true };
}

export const recoveryEnabled = () =>
  Boolean(
    process.env.SMTP_HOST && process.env.SMTP_FROM && process.env.ADMIN_URL
  );

export async function requestPasswordReset(email: string, peer: string) {
  if (!recoveryEnabled())
    throw new ApiError(
      503,
      "RECOVERY_UNAVAILABLE",
      "Recuperação por e-mail não configurada."
    );
  email = email.toLowerCase().trim();
  await rateLimit("recovery-peer:" + peer, 60);
  await rateLimit("recovery-email:" + email, 5);
  const record = await findUser(email);
  if (record?.isActive) {
    const token = randomBytes(32).toString("base64url");
    const url = new URL(
      process.env.ADMIN_URL!.replace(/\/+$/, "") + "/redefinir-senha"
    );
    if (!["https:", "http:"].includes(url.protocol))
      throw new Error("ADMIN_URL inválida.");
    url.searchParams.set("token", token);
    await transaction(async (connection) => {
      await lockUser(connection, record.id);
      await connection.execute(
        "DELETE FROM admin_password_resets WHERE user_id = ?",
        [record.id]
      );
      await connection.execute(
        "INSERT INTO admin_password_resets (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))",
        [hashToken(token), record.id]
      );
    });
    try {
      const mailer = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_PORT === "465",
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
          : undefined,
        connectionTimeout: 5000,
        socketTimeout: 10000,
      });
      await mailer.sendMail({
        from: process.env.SMTP_FROM,
        to: record.email,
        subject: "Redefinir acesso — Camelatto Design",
        text: `Para redefinir sua senha, acesse: ${url.href}\nO link expira em 30 minutos. Se não solicitou, ignore esta mensagem.`,
      });
    } catch {
      console.error(
        JSON.stringify({ event: "password_recovery_delivery_failed" })
      );
    }
  }
  return {
    success: true,
    message:
      "Se houver uma conta ativa, enviaremos as instruções de recuperação.",
  };
}

export async function resetPassword(
  token: string,
  password: string,
  peer: string
) {
  await rateLimit("reset-peer:" + peer, 30);
  const tokenHash = hashToken(token);
  const [records] = await db.execute<RowDataPacket[]>(
    "SELECT user_id FROM admin_password_resets WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()",
    [tokenHash]
  );
  if (!records[0])
    throw new ApiError(
      400,
      "INVALID_RESET_TOKEN",
      "Link inválido ou expirado."
    );
  const hash = await hashPassword(password);
  await transaction(async (connection) => {
    const user = await lockUser(connection, records[0].user_id);
    const [tokens] = await connection.execute<RowDataPacket[]>(
      "SELECT user_id FROM admin_password_resets WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP() FOR UPDATE",
      [tokenHash]
    );
    if (!tokens[0] || !user?.isActive)
      throw new ApiError(
        400,
        "INVALID_RESET_TOKEN",
        "Link inválido ou expirado."
      );
    await connection.execute(
      "UPDATE admin_users SET password_hash = ? WHERE id = ?",
      [hash, user.id]
    );
    await connection.execute("DELETE FROM admin_sessions WHERE user_id = ?", [
      user.id,
    ]);
    await connection.execute(
      "DELETE FROM admin_password_resets WHERE user_id = ?",
      [user.id]
    );
    await audit(connection, user.id, "reset_password", "user", user.id);
  });
  return { success: true };
}
