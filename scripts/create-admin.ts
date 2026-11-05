import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";
import { Value } from "@sinclair/typebox/value";
import { db } from "../src/core/database";
import { transaction } from "../src/core/transaction";
import { hashPassword, audit } from "../src/services/auth.service";
import { userInputSchema } from "../src/models/admin";

async function hiddenPassword() {
  if (!process.stdin.isTTY || !process.stdin.setRawMode)
    throw new Error(
      "Defina ADMIN_SETUP_PASSWORD no ambiente ou use um terminal interativo."
    );
  process.stdout.write("Senha (mínimo 12 caracteres): ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  try {
    return await new Promise<string>((resolve, reject) => {
      let value = "";
      const listener = (data: Buffer) => {
        for (const character of data.toString()) {
          if (character === "\u0003") {
            process.stdin.off("data", listener);
            reject(new Error("Operação cancelada."));
            return;
          }
          if (character === "\r" || character === "\n") {
            process.stdin.off("data", listener);
            resolve(value);
            return;
          }
          if (character === "\u007f" || character === "\b")
            value = value.slice(0, -1);
          else if (character >= " ") value += character;
        }
      };
      process.stdin.on("data", listener);
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write("\n");
  }
}

try {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const name =
    process.env.ADMIN_SETUP_NAME || (await prompt.question("Nome: ")).trim();
  const email = (
    process.env.ADMIN_SETUP_EMAIL || (await prompt.question("E-mail: "))
  )
    .trim()
    .toLowerCase();
  prompt.close();
  const password = process.env.ADMIN_SETUP_PASSWORD || (await hiddenPassword());
  const input = { name, email, password, role: "admin" as const };
  if (!Value.Check(userInputSchema, input))
    throw new Error(
      "Nome/e-mail inválidos ou senha fora do limite de 12 a 128 caracteres."
    );
  const hash = await hashPassword(password);
  await transaction(async (connection) => {
    const id = randomUUID();
    await connection.execute(
      "INSERT INTO admin_users (id,name,email,password_hash,role) VALUES (?,?,?,?,'admin')",
      [id, name, email, hash]
    );
    await audit(connection, null, "bootstrap_user", "user", id);
  });
  console.log(
    "Administrador criado. Entre pelo painel com o e-mail informado."
  );
} catch (error) {
  console.error(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ER_DUP_ENTRY"
      ? "Já existe uma conta com esse e-mail. Nenhuma senha foi alterada."
      : error instanceof Error
        ? error.message
        : "Falha ao criar administrador."
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
