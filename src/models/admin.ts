import { t, type Static } from "elysia";
import { emailSchema, passwordSchema, roleSchema } from "./auth";

const str = (maxLength: number, minLength = 0) =>
  t.String({ maxLength, minLength });
const url = str(2048);
const title = str(255, 1);
const short = str(160);
const text = str(12000);
const order = t.Integer({ minimum: 0, maximum: 100000 });
const robots = t.Union([
  t.Literal("index, follow"),
  t.Literal("noindex, nofollow"),
]);
const seoFields = {
  title,
  description: str(5000),
  keywords: str(1000),
  robots,
  ogImage: url,
};
const options = { additionalProperties: false } as const;

export const projectInputSchema = t.Object(
  {
    id: t.String({ minLength: 1, maxLength: 32, pattern: "^[A-Za-z0-9_-]+$" }),
    slug: t.String({
      minLength: 1,
      maxLength: 160,
      pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
    }),
    title,
    category: short,
    year: str(32),
    image: url,
    imageAlt: str(500),
    description: str(5000),
    contribution: text,
    challenge: text,
    process: text,
    solution: text,
    tags: t.Array(str(160, 1), { maxItems: 30 }),
    isPublished: t.Boolean(),
    sortOrder: order,
    seo: t.Object(seoFields, options),
  },
  options
);
export type ProjectInput = Static<typeof projectInputSchema>;
export type ProjectRecord = {
  id: string;
  data: ProjectInput;
  version: number;
  updatedAt: string;
};

export const documentSchemas = {
  hero: t.Object(
    {
      title,
      highlight: str(255),
      description: text,
      primaryCta: short,
      secondaryCta: short,
    },
    options
  ),
  navigation: t.Array(
    t.Object({ label: str(160, 1), href: url, isActive: t.Boolean() }, options),
    { maxItems: 20 }
  ),
  approach: t.Object(
    {
      eyebrow: short,
      title,
      description: text,
      steps: t.Array(
        t.Object({ title: str(160, 1), description: text }, options),
        { maxItems: 30 }
      ),
    },
    options
  ),
  gallery: t.Object(
    {
      eyebrow: short,
      title,
      items: t.Array(
        t.Object(
          {
            title,
            category: short,
            image: url,
            alt: str(500),
            isActive: t.Boolean(),
          },
          options
        ),
        { maxItems: 100 }
      ),
    },
    options
  ),
  about: t.Object(
    {
      eyebrow: short,
      title,
      image: url,
      imageAlt: str(500),
      paragraphs: t.Array(text, { maxItems: 30 }),
      skills: t.Array(str(160, 1), { maxItems: 50 }),
      stats: t.Array(t.Object({ value: str(80), label: short }, options), {
        maxItems: 20,
      }),
    },
    options
  ),
  contact: t.Object(
    { eyebrow: short, title, highlight: str(255), description: text },
    options
  ),
  faq: t.Array(
    t.Object(
      {
        id: t.Integer({ minimum: 1, maximum: 2147483647 }),
        question: str(500, 1),
        answer: text,
        isPublished: t.Boolean(),
      },
      options
    ),
    { maxItems: 100 }
  ),
  settings: t.Object(
    {
      name: str(160, 1),
      role: short,
      location: short,
      developer: t.Object({ name: short, url }, options),
      email: t.Union([emailSchema, t.Literal("")]),
      linkedin: url,
      behance: url,
      resume: url,
      whatsapp: url,
      gtm: t.String({ maxLength: 32, pattern: "^(|GTM-[A-Z0-9]+)$" }),
      ...seoFields,
    },
    options
  ),
};
export type DocumentKey = keyof typeof documentSchemas;
export type Documents = {
  [K in DocumentKey]: Static<(typeof documentSchemas)[K]>;
};
export type DocumentRecord = {
  key: DocumentKey;
  data: Documents[DocumentKey];
  version: number;
};
export const versionSchema = t.Integer({ minimum: 1 });
export const pageQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, maximum: 100000, default: 1 })),
});
export const userInputSchema = t.Object(
  {
    name: str(160, 1),
    email: emailSchema,
    password: passwordSchema,
    role: roleSchema,
  },
  options
);
export const userUpdateSchema = t.Object(
  {
    name: str(160, 1),
    role: roleSchema,
    isActive: t.Boolean(),
    revoke: t.Optional(t.Boolean()),
  },
  options
);

export function isDocumentKey(value: string): value is DocumentKey {
  return Object.hasOwn(documentSchemas, value);
}
