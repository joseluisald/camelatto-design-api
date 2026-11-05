import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { ContentRepository } from "./content.repository";
import { ApiError } from "../core/api-error";
import type {
  DocumentKey,
  Documents,
  DocumentRecord,
  ProjectRecord,
  ProjectInput,
} from "../models/admin";

export class AdminRepository {
  constructor(public readonly connection: PoolConnection) {}

  async rows<T>(sql: string, values: (string | number)[] = []): Promise<T[]> {
    const [rows] = await this.connection.execute<RowDataPacket[]>(sql, values);
    return rows as T[];
  }

  async version(entity: string) {
    const [row] = await this.rows<{ version: number }>(
      "SELECT version FROM admin_content_versions WHERE entity_key = ?",
      [entity]
    );
    return Number(row?.version ?? 1);
  }

  async document(key: DocumentKey): Promise<DocumentRecord> {
    let data: Documents[DocumentKey];
    const content = new ContentRepository(this.connection);
    if (key === "settings") {
      const settings = await content.settings();
      const seo = await content.seo("/");
      data = {
        ...settings,
        robots:
          seo.robots === "noindex, nofollow"
            ? "noindex, nofollow"
            : "index, follow",
        ogImage: seo.ogImage,
      };
    } else if (key === "faq") {
      data = (
        await this.rows<{
          id: number;
          question: string;
          answer: string;
          isPublished: number;
        }>(
          "SELECT id, question, answer, is_published AS isPublished FROM faqs ORDER BY sort_order, id"
        )
      ).map((row) => ({ ...row, isPublished: Boolean(row.isPublished) }));
    } else if (key === "navigation") {
      data = (
        await this.rows<{ label: string; href: string; isActive: number }>(
          "SELECT label, href, is_active AS isActive FROM navigation_items ORDER BY sort_order, id"
        )
      ).map((row) => ({ ...row, isActive: Boolean(row.isActive) }));
    } else {
      const portfolio = await content.portfolio();
      data = portfolio[key] as Documents[DocumentKey];
      if (key === "gallery") {
        data = {
          ...portfolio.gallery,
          items: (
            await this.rows<{
              title: string;
              category: string;
              image: string;
              alt: string;
              isActive: number;
            }>(
              "SELECT title, category, image, alt, is_active AS isActive FROM gallery_items ORDER BY sort_order, id"
            )
          ).map((row) => ({ ...row, isActive: Boolean(row.isActive) })),
        };
      }
    }
    return { key, data, version: await this.version("document:" + key) };
  }

  async project(id: string): Promise<ProjectRecord> {
    const [row] = await this.rows<
      Omit<ProjectInput, "tags" | "seo" | "isPublished"> & {
        isPublished: number;
        updatedAt: Date;
      }
    >(
      `SELECT id, slug, title, category, year, image, image_alt AS imageAlt,
      description, contribution, challenge, process, solution, is_published AS isPublished, sort_order AS sortOrder, updated_at AS updatedAt FROM projects WHERE id = ?`,
      [id]
    );
    if (!row)
      throw new ApiError(404, "PROJECT_NOT_FOUND", "Projeto não encontrado.");
    const tags = await this.rows<{ label: string }>(
      "SELECT label FROM project_tags WHERE project_id = ? ORDER BY sort_order, id",
      [id]
    );
    const [seo] = await this.rows<ProjectInput["seo"]>(
      "SELECT title, description, keywords, robots, og_image AS ogImage FROM seo_pages WHERE project_id = ?",
      [id]
    );
    const { updatedAt, ...data } = row;
    return {
      id: row.id,
      version: await this.version("project:" + id),
      updatedAt: updatedAt.toISOString(),
      data: {
        ...data,
        isPublished: Boolean(row.isPublished),
        tags: tags.map((tag) => tag.label),
        seo: seo || {
          title: row.title,
          description: row.description,
          keywords: "",
          robots: "index, follow",
          ogImage: "",
        },
      },
    };
  }

  async saveDocument<K extends DocumentKey>(key: K, data: Documents[K]) {
    // Chaves, tabelas e colunas vêm exclusivamente de constantes internas.
    if (key === "settings") {
      const value = data as Documents["settings"];
      await this.connection.execute(
        `UPDATE site_settings SET name=?, role=?, location=?, developer_name=?, developer_url=?, email=?, linkedin=?, behance=?, resume=?, gtm=?, whatsapp=? WHERE id=1`,
        [
          value.name,
          value.role,
          value.location,
          value.developer.name,
          value.developer.url,
          value.email,
          value.linkedin,
          value.behance,
          value.resume,
          value.gtm,
          value.whatsapp,
        ]
      );
      await this.connection.execute(
        "UPDATE seo_pages SET title=?, description=?, keywords=?, robots=?, og_image=? WHERE path='/'",
        [
          value.title,
          value.description,
          value.keywords,
          value.robots,
          value.ogImage,
        ]
      );
      return;
    }
    if (key === "navigation") {
      await this.replaceList(
        "navigation_items",
        data as Documents["navigation"],
        (item) => ({
          label: item.label,
          href: item.href,
          is_active: Number(item.isActive),
        })
      );
      return;
    }
    if (key === "faq") {
      await this.replaceList("faqs", data as Documents["faq"], (item) => ({
        id: item.id,
        question: item.question,
        answer: item.answer,
        is_published: Number(item.isPublished),
      }));
      return;
    }
    const value = data as Exclude<
      Documents[DocumentKey],
      Documents["faq"] | Documents["navigation"] | Documents["settings"]
    >;
    const get = (field: string) =>
      field in value ? String(value[field as keyof typeof value]) : "";
    const [result] = await this.connection.execute<
      import("mysql2/promise").ResultSetHeader
    >(
      `UPDATE site_sections SET eyebrow=?, title=?, highlight=?, description=?, primary_cta=?, secondary_cta=?, image=?, image_alt=? WHERE section_key=?`,
      [
        get("eyebrow"),
        value.title,
        get("highlight"),
        get("description"),
        get("primaryCta"),
        get("secondaryCta"),
        get("image"),
        get("imageAlt"),
        key,
      ]
    );
    if (!result.affectedRows)
      throw new ApiError(
        503,
        "CONTENT_NOT_CONFIGURED",
        "Execute a carga inicial do conteúdo."
      );
    if (key === "approach")
      await this.replaceList(
        "approach_steps",
        (data as Documents["approach"]).steps,
        (item) => ({ title: item.title, description: item.description })
      );
    if (key === "gallery")
      await this.replaceList(
        "gallery_items",
        (data as Documents["gallery"]).items,
        (item) => ({
          title: item.title,
          category: item.category,
          image: item.image,
          alt: item.alt,
          is_active: Number(item.isActive),
        })
      );
    if (key === "about") {
      const about = data as Documents["about"];
      await this.replaceList(
        "about_paragraphs",
        about.paragraphs,
        (content) => ({ content })
      );
      await this.replaceList("skills", about.skills, (label) => ({ label }));
      await this.replaceList("profile_stats", about.stats, (item) => ({
        value: item.value,
        label: item.label,
      }));
    }
  }

  private async replaceList<T>(
    table:
      | "navigation_items"
      | "faqs"
      | "approach_steps"
      | "gallery_items"
      | "about_paragraphs"
      | "skills"
      | "profile_stats",
    items: T[],
    serialize: (item: T) => Record<string, string | number>
  ) {
    await this.connection.execute(`DELETE FROM ${table}`);
    for (const [sort_order, item] of items.entries()) {
      const row = { ...serialize(item), sort_order };
      const columns = Object.keys(row);
      await this.connection.execute(
        `INSERT INTO ${table} (${columns.map((column) => `\`${column}\``).join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
        Object.values(row)
      );
    }
  }

  async saveProject(data: ProjectInput, create: boolean) {
    const values = [
      data.slug,
      data.title,
      data.category,
      data.year,
      data.image,
      data.imageAlt,
      data.description,
      data.contribution,
      data.challenge,
      data.process,
      data.solution,
      Number(data.isPublished),
      data.sortOrder,
      data.id,
    ];
    if (create) {
      await this.connection.execute(
        "INSERT INTO projects (slug,title,category,year,image,image_alt,description,contribution,challenge,process,solution,is_published,sort_order,id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        values
      );
    } else {
      await this.connection.execute(
        "UPDATE projects SET slug=?,title=?,category=?,year=?,image=?,image_alt=?,description=?,contribution=?,challenge=?,process=?,solution=?,is_published=?,sort_order=? WHERE id=?",
        values
      );
      await this.connection.execute(
        "DELETE FROM project_tags WHERE project_id=?",
        [data.id]
      );
    }
    for (const [order, label] of data.tags.entries())
      await this.connection.execute(
        "INSERT INTO project_tags (project_id,label,sort_order) VALUES (?,?,?)",
        [data.id, label, order]
      );
    // Atualizar por project_id evita reatribuir um caminho SEO que pertence a outro projeto.
    const [seo] = await this.rows<{ id: number }>(
      "SELECT id FROM seo_pages WHERE project_id=?",
      [data.id]
    );
    if (seo)
      await this.connection.execute(
        "UPDATE seo_pages SET path=?,title=?,description=?,keywords=?,robots=?,og_image=? WHERE id=?",
        [
          "/projetos/" + data.slug,
          data.seo.title,
          data.seo.description,
          data.seo.keywords,
          data.seo.robots,
          data.seo.ogImage,
          seo.id,
        ]
      );
    else
      await this.connection.execute(
        "INSERT INTO seo_pages (path,project_id,title,description,keywords,robots,og_image) VALUES (?,?,?,?,?,?,?)",
        [
          "/projetos/" + data.slug,
          data.id,
          data.seo.title,
          data.seo.description,
          data.seo.keywords,
          data.seo.robots,
          data.seo.ogImage,
        ]
      );
  }
}
