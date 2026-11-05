import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { Value } from "@sinclair/typebox/value";
import { db } from "../src/core/database";
import { contentSchema, type Content } from "../src/models/content";
import settingsData from "../database/seeds/settings.json";
import portfolio from "../database/seeds/portfolio.json";
import faq from "../database/seeds/faq.json";

export const initialContent: Content = {
  settings: { ...settingsData.site, robots: "index, follow" },
  portfolio,
  faq,
  seo: {
    path: "/",
    title: settingsData.site.title,
    description: settingsData.site.description,
    keywords: settingsData.site.keywords,
    robots: "index, follow",
    ogImage: "",
  },
};

// Os identificadores SQL são constantes do código; valores sempre são parametrizados.
async function insert(
  connection: PoolConnection,
  table: string,
  row: Record<string, string | number>
) {
  const columns = Object.keys(row);
  await connection.execute(
    `INSERT INTO ${table} (${columns.map((column) => `\`${column}\``).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    Object.values(row)
  );
}

export async function seed() {
  if (!Value.Check(contentSchema, initialContent))
    throw new Error("Snapshot inicial incompatível com o contrato da API.");
  if (process.argv.includes("--dry-run")) {
    console.log(
      `Seed válido: ${portfolio.projects.length} projetos, ${faq.length} FAQs, ${portfolio.gallery.items.length} itens de galeria. Nenhuma escrita executada.`
    );
    return;
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    // Serializa importações e exige que a migration já esteja aplicada.
    const [migration] = await connection.execute<RowDataPacket[]>(
      "SELECT name FROM schema_migrations WHERE name = '001_content.sql' FOR UPDATE"
    );
    if (!migration.length)
      throw new Error("Execute bun run db:migrate antes do seed.");
    const [history] = await connection.execute<RowDataPacket[]>(
      "SELECT name FROM seed_history WHERE name = 'lp-initial-v1'"
    );
    if (history.length) {
      await connection.commit();
      console.log("Seed já aplicado; conteúdo existente preservado.");
      return;
    }
    for (const table of [
      "site_settings",
      "projects",
      "project_tags",
      "seo_pages",
      "navigation_items",
      "site_sections",
      "approach_steps",
      "gallery_items",
      "about_paragraphs",
      "skills",
      "profile_stats",
      "faqs",
    ]) {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT 1 FROM ${table} LIMIT 1`
      );
      if (rows.length)
        throw new Error(
          `Seed inicial exige tabelas vazias: ${table}. Nenhum dado foi sobrescrito.`
        );
    }
    const site = settingsData.site;
    await insert(connection, "site_settings", {
      id: 1,
      name: site.name,
      role: site.role,
      location: site.location,
      developer_name: site.developer.name,
      developer_url: site.developer.url,
      email: site.email,
      linkedin: site.linkedin,
      behance: site.behance,
      resume: site.resume,
      gtm: site.gtm,
      whatsapp: site.whatsapp,
    });
    const seoRow = (path: string, title: string, description: string) => ({
      path,
      title,
      description,
      keywords: site.keywords,
      robots: "index, follow",
      og_image: "",
    });
    await insert(
      connection,
      "seo_pages",
      seoRow("/", site.title, site.description)
    );
    for (const [order, project] of portfolio.projects.entries()) {
      await insert(connection, "projects", {
        id: project.id,
        slug: project.slug,
        category: project.category,
        year: project.year,
        title: project.title,
        image: project.image,
        image_alt: project.imageAlt,
        description: project.description,
        contribution: project.contribution,
        challenge: project.challenge,
        process: project.process,
        solution: project.solution,
        sort_order: order,
        is_published: 1,
      });
      for (const [sort_order, label] of project.tags.entries())
        await insert(connection, "project_tags", {
          project_id: project.id,
          label,
          sort_order,
        });
      await insert(connection, "seo_pages", {
        ...seoRow(
          `/projetos/${project.slug}`,
          `${project.title} — ${site.title}`,
          project.description
        ),
        project_id: project.id,
      });
    }
    for (const [sort_order, item] of portfolio.navigation.entries())
      await insert(connection, "navigation_items", { ...item, sort_order });
    for (const key of [
      "hero",
      "approach",
      "gallery",
      "about",
      "contact",
    ] as const) {
      const section = portfolio[key];
      const get = (field: string) =>
        field in section ? String(section[field as keyof typeof section]) : "";
      await insert(connection, "site_sections", {
        section_key: key,
        eyebrow: get("eyebrow"),
        title: section.title,
        highlight: get("highlight"),
        description: get("description"),
        primary_cta: get("primaryCta"),
        secondary_cta: get("secondaryCta"),
        image: get("image"),
        image_alt: get("imageAlt"),
      });
    }
    for (const [sort_order, item] of portfolio.approach.steps.entries())
      await insert(connection, "approach_steps", { ...item, sort_order });
    for (const [sort_order, item] of portfolio.gallery.items.entries())
      await insert(connection, "gallery_items", { ...item, sort_order });
    for (const [sort_order, content] of portfolio.about.paragraphs.entries())
      await insert(connection, "about_paragraphs", { content, sort_order });
    for (const [sort_order, label] of portfolio.about.skills.entries())
      await insert(connection, "skills", { label, sort_order });
    for (const [sort_order, item] of portfolio.about.stats.entries())
      await insert(connection, "profile_stats", { ...item, sort_order });
    for (const [sort_order, item] of faq.entries())
      await insert(connection, "faqs", {
        ...item,
        sort_order,
        is_published: 1,
      });
    await insert(connection, "seed_history", { name: "lp-initial-v1" });
    await connection.commit();
    console.log("Conteúdo inicial importado com sucesso.");
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

if (import.meta.main) {
  try {
    await seed();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Falha no seed.");
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
