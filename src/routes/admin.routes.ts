import { Elysia, t } from "elysia";
import { ApiError } from "../core/api-error";
import { authenticate, requireAdmin } from "../services/auth.service";
import * as admin from "../services/admin.service";
import { listMedia, uploadMedia, readMedia } from "../services/media.service";
import {
  isDocumentKey,
  pageQuery,
  projectInputSchema,
  userInputSchema,
  userUpdateSchema,
  versionSchema,
} from "../models/admin";

const idParams = t.Object({
  id: t.String({ minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" }),
});
const documentParams = t.Object({ key: t.String({ maxLength: 32 }) });

export const mediaRoutes = new Elysia().get(
  "/media/:key",
  ({ params }) => readMedia(params.key),
  {
    params: t.Object({ key: t.String({ maxLength: 80 }) }),
    detail: {
      tags: ["Media"],
      security: [],
      summary: "Consultar imagem pública",
    },
  }
);

export const adminRoutes = new Elysia({
  prefix: "/admin",
  detail: { tags: ["Admin"], security: [{ BearerAuth: [] }] },
})
  .derive(async ({ headers }) => ({
    authContext: await authenticate(headers.authorization),
  }))
  .get("/dashboard", () => admin.dashboard())
  .get(
    "/documents/:key",
    ({ params, authContext }) => {
      if (!isDocumentKey(params.key))
        throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Seção não encontrada.");
      if (params.key === "settings") requireAdmin(authContext.user);
      return admin.getDocument(params.key);
    },
    { params: documentParams }
  )
  .put(
    "/documents/:key",
    ({ params, body, authContext }) => {
      if (!isDocumentKey(params.key))
        throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Seção não encontrada.");
      return admin.saveDocument(
        authContext,
        params.key,
        body.data,
        body.version
      );
    },
    {
      params: documentParams,
      body: t.Object(
        { data: t.Unknown(), version: versionSchema },
        { additionalProperties: false }
      ),
    }
  )
  .get(
    "/projects",
    ({ query }) =>
      admin.listProjects(query.page ?? 1, query.q ?? "", query.status ?? ""),
    {
      query: t.Object({
        page: t.Optional(t.Numeric({ minimum: 1, maximum: 100000 })),
        q: t.Optional(t.String({ maxLength: 200 })),
        status: t.Optional(
          t.Union([t.Literal(""), t.Literal("published"), t.Literal("draft")])
        ),
      }),
    }
  )
  .post(
    "/projects",
    ({ body, authContext }) => admin.saveProject(authContext, body.data),
    {
      body: t.Object(
        { data: projectInputSchema },
        { additionalProperties: false }
      ),
    }
  )
  .get("/projects/:id", ({ params }) => admin.getProject(params.id), {
    params: idParams,
  })
  .patch(
    "/projects/:id",
    ({ params, body, authContext }) => {
      if (params.id !== body.data.id)
        throw new ApiError(
          422,
          "IMMUTABLE_PROJECT_ID",
          "O identificador do projeto não pode ser alterado."
        );
      return admin.saveProject(authContext, body.data, body.version);
    },
    {
      params: idParams,
      body: t.Object(
        { data: projectInputSchema, version: versionSchema },
        { additionalProperties: false }
      ),
    }
  )
  .delete(
    "/projects/:id",
    ({ params, body, authContext }) =>
      admin.deleteProject(authContext, params.id, body.version),
    {
      params: idParams,
      body: t.Object(
        { version: versionSchema },
        { additionalProperties: false }
      ),
    }
  )
  .get("/media", () => listMedia())
  .post(
    "/media",
    ({ body, authContext }) => uploadMedia(authContext, body.file, body.alt),
    {
      body: t.Object({
        file: t.File({ maxSize: "10m" }),
        alt: t.String({ minLength: 1, maxLength: 500 }),
      }),
    }
  )
  .get("/users", ({ authContext }) => admin.listUsers(authContext))
  .post(
    "/users",
    ({ body, authContext }) => admin.createUser(authContext, body),
    { body: userInputSchema }
  )
  .patch(
    "/users/:id",
    ({ params, body, authContext }) =>
      admin.updateUser(authContext, params.id, body),
    { params: idParams, body: userUpdateSchema }
  )
  .get(
    "/audit",
    ({ query, authContext }) => admin.listAudit(authContext, query.page ?? 1),
    { query: pageQuery }
  );
