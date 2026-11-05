import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { createContentRoutes } from "../src/routes/content.routes";
import { errorsPlugin } from "../src/plugins/errors";
import { securityPlugin } from "../src/plugins/security";
import { allowedOrigins } from "../src/core/public-config";
import { ApiError } from "../src/core/api-error";
import { initialContent } from "../scripts/seed";
import type { ContentReader } from "../src/services/content.service";

const reader: ContentReader = {
  content: async () => structuredClone(initialContent),
  settings: async () => initialContent.settings,
  portfolio: async () => initialContent.portfolio,
  projects: async () => initialContent.portfolio.projects,
  project: async (slug) => {
    const project = initialContent.portfolio.projects.find(
      (item) => item.slug === slug
    );
    if (!project)
      throw new ApiError(404, "PROJECT_NOT_FOUND", "Projeto não encontrado.");
    return project;
  },
  faqs: async () => initialContent.faq,
  seo: async (path) => ({ ...initialContent.seo, path }),
};

function createApp(overrides: Partial<ContentReader> = {}) {
  return new Elysia()
    .use(errorsPlugin)
    .use(securityPlugin)
    .group("/v1", (app) =>
      app.use(createContentRoutes({ ...reader, ...overrides }))
    );
}

const request = (path: string, init?: RequestInit) =>
  new Request(`http://localhost/v1${path}`, init);

describe("contrato público da LP", () => {
  test("preserva os dados atuais e o formato esperado pela LP", async () => {
    const response = await createApp().handle(request("/content"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(initialContent);
  });

  test("expõe as sete rotas de leitura", async () => {
    const app = createApp();
    for (const path of [
      "/content",
      "/settings",
      "/portfolio",
      "/projects",
      "/projects/projeto-01",
      "/faqs",
      "/seo?path=/",
    ]) {
      const response = await app.handle(request(path));
      expect(response.status).toBe(200);
    }
  });

  test("projeto inexistente retorna 404 padronizado", async () => {
    const response = await createApp().handle(request("/projects/inexistente"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "PROJECT_NOT_FOUND", message: "Projeto não encontrado." },
    });
  });

  test("rejeita slug inválido antes de consultar o serviço", async () => {
    let called = false;
    const app = createApp({
      project: async () => {
        called = true;
        return initialContent.portfolio.projects[0];
      },
    });
    const response = await app.handle(request("/projects/%27%20OR%201%3D1"));
    expect(response.status).toBe(422);
    expect(called).toBe(false);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_REQUEST", message: "Parâmetros inválidos." },
    });
  });

  test("SEO rejeita domínio externo, query embutida e caminho excessivo", async () => {
    const app = createApp();
    for (const path of [
      "https://example.com",
      "/?redirect=x",
      "/" + "a".repeat(255),
    ]) {
      const response = await app.handle(
        request(`/seo?path=${encodeURIComponent(path)}`)
      );
      expect(response.status).toBe(422);
    }
  });

  test("erros internos não expõem SQL nem credenciais", async () => {
    const app = createApp({
      projects: async () => {
        throw new Error(
          "SELECT password FROM secret; mysql://admin:secret@database"
        );
      },
    });
    const response = await app.handle(request("/projects"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor." },
    });
  });

  test("indisponibilidade do MySQL retorna 503", async () => {
    const app = createApp({
      projects: async () => {
        throw Object.assign(new Error("private host"), {
          code: "ECONNREFUSED",
        });
      },
    });
    const response = await app.handle(request("/projects"));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("SERVICE_UNAVAILABLE");
  });

  test("nenhuma rota de escrita ou admin fica exposta", async () => {
    const app = createApp();
    expect(
      (await app.handle(request("/projects", { method: "POST" }))).status
    ).toBe(404);
    expect((await app.handle(request("/admin/projects"))).status).toBe(404);
  });
});

describe("CORS e cabeçalhos", () => {
  test("permite leitura sem Origin para build do Astro", async () => {
    const response = await createApp().handle(request("/settings"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("retorna somente a origem autorizada", async () => {
    const origin = [...allowedOrigins][0];
    const response = await createApp().handle(
      request("/settings", { headers: { Origin: origin } })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("vary")).toBe("Origin");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  test("bloqueia origem desconhecida", async () => {
    const response = await createApp().handle(
      request("/settings", { headers: { Origin: "https://untrusted.invalid" } })
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("responde ao preflight sem acesso ao banco", async () => {
    const origin = [...allowedOrigins][0];
    const response = await createApp().handle(
      request("/content", {
        method: "OPTIONS",
        headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
      })
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS"
    );
  });
});
