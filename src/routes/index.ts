import { Elysia } from "elysia";
import { authRoutes } from "./auth.routes";
import { OpenAPIPlugin } from "../plugins/openapi";
import { createContentRoutes } from "./content.routes";
import { adminRoutes, mediaRoutes } from "./admin.routes";

export const apiRoutes = new Elysia({ prefix: "/v1" })
  .use(OpenAPIPlugin)
  .use(authRoutes)
  .use(createContentRoutes())
  .use(mediaRoutes)
  .use(adminRoutes);
