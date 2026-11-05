import type { ResultSetHeader } from "mysql2/promise";
import { db } from "../src/core/database";

try {
  const summary: Record<string, number> = {};
  for (const [table, field] of [
    ["admin_sessions", "expires_at"],
    ["admin_password_resets", "expires_at"],
    ["admin_rate_limits", "resets_at"],
  ] as const) {
    const [result] = await db.execute<ResultSetHeader>(
      `DELETE FROM ${table} WHERE ${field} < UTC_TIMESTAMP()`
    );
    summary[table] = result.affectedRows;
  }
  console.log(JSON.stringify(summary));
} finally {
  await db.end();
}
