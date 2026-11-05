import { Elysia } from "elysia";
import { allowedOrigins } from "../core/public-config";

export const securityPlugin = new Elysia({ name: "security" })
  .onRequest(({ request, set }) => {
    set.headers["x-content-type-options"] = "nosniff";
    set.headers["referrer-policy"] = "strict-origin-when-cross-origin";
    set.headers["cache-control"] = "no-store";
    set.headers.vary = "Origin";
    const origin = request.headers.get("origin");
    if (!origin) return;
    if (!allowedOrigins.has(origin)) {
      set.status = 403;
      return {
        error: { code: "ORIGIN_NOT_ALLOWED", message: "Origem não permitida." },
      };
    }
    set.headers["access-control-allow-origin"] = origin;
    set.headers["access-control-allow-methods"] =
      "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS";
    set.headers["access-control-allow-headers"] = "Content-Type, Authorization";
  })
  .options("/*", ({ set }) => {
    set.status = 204;
  })
  .as("global");
