import { Elysia, t } from "elysia";
import {
  emailSchema,
  loginSchema,
  passwordSchema,
  userSchema,
} from "../models/auth";
import * as auth from "../services/auth.service";

const sessionResponse = t.Object({
  token: t.String(),
  expiresAt: t.String(),
  user: userSchema,
});
const tokenSchema = t.String({ pattern: "^[A-Za-z0-9_-]{43}$" });

export const authRoutes = new Elysia({
  prefix: "/auth",
  detail: { tags: ["Auth"], security: [] },
})
  .get("/config", () => ({ recoveryEnabled: auth.recoveryEnabled() }))
  .post(
    "/login",
    ({ body, request, server }) =>
      auth.login(
        body.email,
        body.password,
        server?.requestIP(request)?.address || "local"
      ),
    { body: loginSchema, response: { 200: sessionResponse } }
  )
  .get(
    "/me",
    async ({ headers }) => {
      const context = await auth.authenticate(headers.authorization);
      return { user: context.user, expiresAt: context.expiresAt.toISOString() };
    },
    { detail: { security: [{ BearerAuth: [] }] } }
  )
  .post(
    "/logout",
    async ({ headers }) =>
      auth.logout(await auth.authenticate(headers.authorization)),
    { detail: { security: [{ BearerAuth: [] }] } }
  )
  .post(
    "/change-password",
    async ({ headers, body }) =>
      auth.changePassword(
        await auth.authenticate(headers.authorization),
        body.currentPassword,
        body.newPassword
      ),
    {
      detail: { security: [{ BearerAuth: [] }] },
      body: t.Object(
        {
          currentPassword: t.String({ minLength: 1, maxLength: 128 }),
          newPassword: passwordSchema,
        },
        { additionalProperties: false }
      ),
    }
  )
  .post(
    "/request-password-reset",
    ({ body, request, server }) =>
      auth.requestPasswordReset(
        body.email,
        server?.requestIP(request)?.address || "local"
      ),
    { body: t.Object({ email: emailSchema }, { additionalProperties: false }) }
  )
  .post(
    "/reset-password",
    ({ body, request, server }) =>
      auth.resetPassword(
        body.token,
        body.newPassword,
        server?.requestIP(request)?.address || "local"
      ),
    {
      body: t.Object(
        { token: tokenSchema, newPassword: passwordSchema },
        { additionalProperties: false }
      ),
    }
  );
