import { Elysia, t } from "elysia";
import {
  contentService,
  type ContentReader,
} from "../services/content.service";
import {
  contentSchema,
  settingsSchema,
  portfolioSchema,
  projectSchema,
  faqSchema,
  seoSchema,
  errorSchema,
} from "../models/content";

export function createContentRoutes(service: ContentReader = contentService) {
  const detail = { tags: ["Content"], security: [] };
  const errors = {
    404: errorSchema,
    422: errorSchema,
    500: errorSchema,
    503: errorSchema,
  };
  return new Elysia()
    .get("/content", () => service.content(), {
      detail: { ...detail, summary: "Obter todo o conteúdo da LP" },
      response: { 200: contentSchema, ...errors },
    })
    .get("/settings", () => service.settings(), {
      detail: {
        ...detail,
        summary: "Obter configurações públicas e SEO principal",
      },
      response: { 200: settingsSchema, ...errors },
    })
    .get("/portfolio", () => service.portfolio(), {
      detail: { ...detail, summary: "Obter portfólio e seções da LP" },
      response: { 200: portfolioSchema, ...errors },
    })
    .get("/projects", () => service.projects(), {
      detail: { ...detail, summary: "Listar projetos publicados" },
      response: { 200: t.Array(projectSchema), ...errors },
    })
    .get("/projects/:slug", ({ params }) => service.project(params.slug), {
      params: t.Object({
        slug: t.String({
          minLength: 1,
          maxLength: 160,
          pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
        }),
      }),
      detail: { ...detail, summary: "Consultar projeto publicado" },
      response: { 200: projectSchema, ...errors },
    })
    .get("/faqs", () => service.faqs(), {
      detail: { ...detail, summary: "Listar perguntas publicadas" },
      response: { 200: t.Array(faqSchema), ...errors },
    })
    .get("/seo", ({ query }) => service.seo(query.path ?? "/"), {
      query: t.Object({
        path: t.Optional(
          t.String({
            maxLength: 255,
            pattern:
              "^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$",
          })
        ),
      }),
      detail: {
        ...detail,
        summary: "Consultar SEO por caminho lógico, sem prefixo de QA",
      },
      response: { 200: seoSchema, ...errors },
    });
}
