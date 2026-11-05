import { Elysia } from "elysia";
import { apiRoutes } from "./routes";
import { db } from "./core/database";
import { errorsPlugin } from "./plugins/errors";
import { securityPlugin } from "./plugins/security";
import { publicApiPath } from "./core/public-config";

export const app = new Elysia({
  serve: { maxRequestBodySize: 12 * 1024 * 1024 },
})
  .use(errorsPlugin)
  .use(securityPlugin)
  .get("/health/live", () => ({ status: "ok" }), {
    detail: {
      tags: ["Health"],
      summary: "Consultar a saúde do servidor",
      security: [],
    },
  })

  .get(
    "/health/ready",
    async ({ set }) => {
      try {
        await db.execute("SELECT 1");
        return { status: "ready" };
      } catch {
        set.status = 503;
        return { status: "unavailable" };
      }
    },
    {
      detail: {
        tags: ["Health"],
        summary: "Verificar a conexão com o banco",
        security: [],
      },
    }
  )

  .get("/docs", ({ redirect }) => redirect(`${publicApiPath}/v1/docs`), {
    detail: { hide: true },
  })

  .get(
    "/docs/json",
    ({ redirect }) => redirect(`${publicApiPath}/v1/docs/json`),
    {
      detail: { hide: true },
    }
  )

  .use(apiRoutes);
export type App = typeof app;

if (import.meta.main) {
  const server = app.listen({
    hostname: process.env.HOST || "0.0.0.0",
    port: Number(process.env.PORT || 3000),
  });
  console.log("API pronta na porta " + server.server?.port);
}
