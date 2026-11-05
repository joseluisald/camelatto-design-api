import { Elysia } from "elysia";
import { ApiError } from "../core/api-error";

export const errorsPlugin = new Elysia({ name: "errors" }).onError(
  { as: "global" },
  ({ code, error, set }) => {
    if (error instanceof ApiError) {
      set.status = error.status;
      return { error: { code: error.code, message: error.message } };
    }
    if (code === "VALIDATION" && "type" in error && error.type === "response") {
      set.status = 500;
      return {
        error: {
          code: "INVALID_RESPONSE",
          message: "Erro interno do servidor.",
        },
      };
    }
    if (code === "VALIDATION" || code === "PARSE") {
      set.status = 422;
      return {
        error: { code: "INVALID_REQUEST", message: "Parâmetros inválidos." },
      };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: { code: "NOT_FOUND", message: "Rota não encontrada." } };
    }
    if ("code" in error && error.code === "ER_DUP_ENTRY") {
      set.status = 409;
      return {
        error: {
          code: "DUPLICATE_RECORD",
          message:
            "Já existe um registro com esse identificador, slug ou e-mail.",
        },
      };
    }
    const databaseCodes = new Set([
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ENOTFOUND",
      "ER_CON_COUNT_ERROR",
      "PROTOCOL_CONNECTION_LOST",
    ]);
    const unavailable =
      "code" in error && databaseCodes.has(String(error.code));
    set.status = unavailable ? 503 : 500;
    // Não retornar SQL, stack traces ou credenciais para o cliente.
    console.error(
      JSON.stringify({
        event: "request_error",
        code: unavailable ? "DATABASE_UNAVAILABLE" : "INTERNAL_ERROR",
      })
    );
    return {
      error: {
        code: unavailable ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR",
        message: unavailable
          ? "Serviço temporariamente indisponível."
          : "Erro interno do servidor.",
      },
    };
  }
);
