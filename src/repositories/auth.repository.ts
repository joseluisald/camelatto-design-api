import type { RowDataPacket, PoolConnection } from "mysql2/promise";
import { db } from "../core/database";
import type { AdminUser, AuthContext } from "../models/auth";

export type UserRecord = AdminUser & { passwordHash: string; isActive: number };
export const userColumns =
  "id, name, email, role, password_hash AS passwordHash, is_active AS isActive";

export async function findUser(email: string) {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT ${userColumns} FROM admin_users WHERE email = ? LIMIT 1`,
    [email]
  );
  return rows[0] as UserRecord | undefined;
}

export async function findSession(
  tokenHash: string
): Promise<AuthContext | undefined> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT u.id, u.name, u.email, u.role, s.id AS sessionId, s.expires_at AS expiresAt
    FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP() AND u.is_active = 1 LIMIT 1`,
    [tokenHash]
  );
  const row = rows[0];
  if (!row) return;
  return {
    user: { id: row.id, name: row.name, email: row.email, role: row.role },
    sessionId: row.sessionId,
    tokenHash,
    expiresAt: row.expiresAt,
  };
}

export async function lockUser(connection: PoolConnection, id: string) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT ${userColumns} FROM admin_users WHERE id = ? FOR UPDATE`,
    [id]
  );
  return rows[0] as UserRecord | undefined;
}
