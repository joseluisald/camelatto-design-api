import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { ApiError } from "../core/api-error";
import type {
  Faq,
  Portfolio,
  Project,
  Seo,
  SiteSettings,
} from "../models/content";

type Section = {
  section_key: string;
  eyebrow: string;
  title: string;
  highlight: string;
  description: string;
  primary_cta: string;
  secondary_cta: string;
  image: string;
  image_alt: string;
};

export class ContentRepository {
  constructor(private readonly connection: PoolConnection) {}

  private async rows<T>(sql: string, values: string[] = []): Promise<T[]> {
    const [rows] = await this.connection.execute<RowDataPacket[]>(sql, values);
    return rows as T[];
  }

  async seo(path: string): Promise<Seo> {
    const [seo] = await this.rows<Seo>(
      `SELECT s.path, s.title, s.description, s.keywords, s.robots, s.og_image AS ogImage
      FROM seo_pages s LEFT JOIN projects p ON p.id = s.project_id
      WHERE s.path = ? AND (s.project_id IS NULL OR p.is_published = 1) LIMIT 1`,
      [path]
    );
    if (!seo) throw new ApiError(404, "SEO_NOT_FOUND", "SEO não encontrado.");
    return seo;
  }

  async settings(): Promise<SiteSettings> {
    const [row] = await this.rows<
      Omit<
        SiteSettings,
        "title" | "description" | "keywords" | "robots" | "developer"
      > & { developerName: string; developerUrl: string }
    >(`SELECT name, role, location,
      developer_name AS developerName, developer_url AS developerUrl, email, linkedin, behance, resume, gtm, whatsapp
      FROM site_settings WHERE id = 1`);
    if (!row)
      throw new ApiError(
        503,
        "CONTENT_NOT_CONFIGURED",
        "Conteúdo ainda não configurado."
      );
    const seo = await this.seo("/");
    const { developerName, developerUrl, ...settings } = row;
    return {
      ...settings,
      title: seo.title,
      description: seo.description,
      keywords: seo.keywords,
      robots: seo.robots,
      developer: { name: developerName, url: developerUrl },
    };
  }

  async projects(slug?: string): Promise<Project[]> {
    const projects = await this.rows<Omit<Project, "tags">>(
      `SELECT id, slug, category, year, title, image,
      image_alt AS imageAlt, description, contribution, challenge, process, solution
      FROM projects WHERE is_published = 1 ${slug ? "AND slug = ?" : ""} ORDER BY sort_order, id`,
      slug ? [slug] : []
    );
    const tags = await this.rows<{ projectId: string; label: string }>(
      `SELECT t.project_id AS projectId, t.label
      FROM project_tags t JOIN projects p ON p.id = t.project_id
      WHERE p.is_published = 1 ${slug ? "AND p.slug = ?" : ""} ORDER BY t.sort_order, t.id`,
      slug ? [slug] : []
    );
    return projects.map((project) => ({
      ...project,
      tags: tags
        .filter((tag) => tag.projectId === project.id)
        .map((tag) => tag.label),
    }));
  }

  faqs() {
    return this.rows<Faq>(
      "SELECT id, question, answer FROM faqs WHERE is_published = 1 ORDER BY sort_order, id"
    );
  }

  async portfolio(): Promise<Portfolio> {
    const sections = await this.rows<Section>(
      "SELECT section_key, eyebrow, title, highlight, description, primary_cta, secondary_cta, image, image_alt FROM site_sections"
    );
    const section = (key: string) => {
      const row = sections.find((item) => item.section_key === key);
      if (!row)
        throw new ApiError(
          503,
          "CONTENT_NOT_CONFIGURED",
          "Conteúdo ainda não configurado."
        );
      return row;
    };
    const hero = section("hero"),
      approach = section("approach"),
      gallery = section("gallery"),
      about = section("about"),
      contact = section("contact");
    const navigation = await this.rows<Portfolio["navigation"][number]>(
      "SELECT label, href FROM navigation_items WHERE is_active = 1 ORDER BY sort_order, id"
    );
    const projects = await this.projects();
    const steps = await this.rows<Portfolio["approach"]["steps"][number]>(
      "SELECT title, description FROM approach_steps ORDER BY sort_order, id"
    );
    const items = await this.rows<Portfolio["gallery"]["items"][number]>(
      "SELECT title, category, image, alt FROM gallery_items WHERE is_active = 1 ORDER BY sort_order, id"
    );
    const paragraphs = await this.rows<{ content: string }>(
      "SELECT content FROM about_paragraphs ORDER BY sort_order, id"
    );
    const skills = await this.rows<{ label: string }>(
      "SELECT label FROM skills ORDER BY sort_order, id"
    );
    const stats = await this.rows<Portfolio["about"]["stats"][number]>(
      "SELECT value, label FROM profile_stats ORDER BY sort_order, id"
    );
    return {
      navigation,
      projects,
      hero: {
        title: hero.title,
        highlight: hero.highlight,
        description: hero.description,
        primaryCta: hero.primary_cta,
        secondaryCta: hero.secondary_cta,
      },
      approach: {
        eyebrow: approach.eyebrow,
        title: approach.title,
        description: approach.description,
        steps,
      },
      gallery: { eyebrow: gallery.eyebrow, title: gallery.title, items },
      about: {
        eyebrow: about.eyebrow,
        title: about.title,
        image: about.image,
        imageAlt: about.image_alt,
        paragraphs: paragraphs.map((item) => item.content),
        skills: skills.map((item) => item.label),
        stats,
      },
      contact: {
        eyebrow: contact.eyebrow,
        title: contact.title,
        highlight: contact.highlight,
        description: contact.description,
      },
    };
  }
}
