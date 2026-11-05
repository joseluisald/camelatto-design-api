import { t, type Static } from "elysia";

export const emailSchema = t.String({
  minLength: 3,
  maxLength: 254,
  pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
});
export const passwordSchema = t.String({ minLength: 12, maxLength: 128 });
export const roleSchema = t.Union([t.Literal("admin"), t.Literal("editor")]);
export const userSchema = t.Object({
  id: t.String(),
  name: t.String(),
  email: t.String(),
  role: roleSchema,
});
export const loginSchema = t.Object(
  { email: emailSchema, password: t.String({ minLength: 1, maxLength: 128 }) },
  { additionalProperties: false }
);
export type AdminUser = Static<typeof userSchema>;
export type AuthContext = {
  user: AdminUser;
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
};
