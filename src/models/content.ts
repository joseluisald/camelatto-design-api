import { t, type Static } from "elysia";

const text = t.String();
export const seoSchema = t.Object({
  path: text,
  title: text,
  description: text,
  keywords: text,
  robots: text,
  ogImage: text,
});

export const settingsSchema = t.Object({
  name: text,
  title: text,
  description: text,
  keywords: text,
  robots: text,
  role: text,
  location: text,
  developer: t.Object({ name: text, url: text }),
  email: text,
  linkedin: text,
  behance: text,
  resume: text,
  gtm: text,
  whatsapp: text,
});

export const projectSchema = t.Object({
  id: text,
  slug: text,
  category: text,
  year: text,
  title: text,
  image: text,
  imageAlt: text,
  description: text,
  contribution: text,
  tags: t.Array(text),
  challenge: text,
  process: text,
  solution: text,
});

export const faqSchema = t.Object({
  id: t.Integer(),
  question: text,
  answer: text,
});
export const portfolioSchema = t.Object({
  navigation: t.Array(t.Object({ label: text, href: text })),
  hero: t.Object({
    title: text,
    highlight: text,
    description: text,
    primaryCta: text,
    secondaryCta: text,
  }),
  projects: t.Array(projectSchema),
  approach: t.Object({
    eyebrow: text,
    title: text,
    description: text,
    steps: t.Array(t.Object({ title: text, description: text })),
  }),
  gallery: t.Object({
    eyebrow: text,
    title: text,
    items: t.Array(
      t.Object({ title: text, category: text, image: text, alt: text })
    ),
  }),
  about: t.Object({
    eyebrow: text,
    title: text,
    image: text,
    imageAlt: text,
    paragraphs: t.Array(text),
    skills: t.Array(text),
    stats: t.Array(t.Object({ value: text, label: text })),
  }),
  contact: t.Object({
    eyebrow: text,
    title: text,
    highlight: text,
    description: text,
  }),
});

export const contentSchema = t.Object({
  settings: settingsSchema,
  faq: t.Array(faqSchema),
  portfolio: portfolioSchema,
  seo: seoSchema,
});
export const errorSchema = t.Object({
  error: t.Object({ code: text, message: text }),
});
export type Project = Static<typeof projectSchema>;
export type Portfolio = Static<typeof portfolioSchema>;
export type SiteSettings = Static<typeof settingsSchema>;
export type Seo = Static<typeof seoSchema>;
export type Faq = Static<typeof faqSchema>;
export type Content = Static<typeof contentSchema>;
