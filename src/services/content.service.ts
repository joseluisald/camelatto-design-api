import { db } from "../core/database";
import { ApiError } from "../core/api-error";
import { ContentRepository } from "../repositories/content.repository";
import type {
  Content,
  Faq,
  Portfolio,
  Project,
  Seo,
  SiteSettings,
} from "../models/content";

export interface ContentReader {
  content(): Promise<Content>;
  settings(): Promise<SiteSettings>;
  portfolio(): Promise<Portfolio>;
  projects(): Promise<Project[]>;
  project(slug: string): Promise<Project>;
  faqs(): Promise<Faq[]>;
  seo(path: string): Promise<Seo>;
}

async function read<T>(
  callback: (repository: ContentRepository) => Promise<T>
) {
  const connection = await db.getConnection();
  try {
    await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await connection.query("START TRANSACTION READ ONLY");
    const result = await callback(new ContentRepository(connection));
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export const contentService: ContentReader = {
  content: () =>
    read(async (repository) => ({
      settings: await repository.settings(),
      faq: await repository.faqs(),
      portfolio: await repository.portfolio(),
      seo: await repository.seo("/"),
    })),
  settings: () => read((repository) => repository.settings()),
  portfolio: () => read((repository) => repository.portfolio()),
  projects: () => read((repository) => repository.projects()),
  project: (slug) =>
    read(async (repository) => {
      const [project] = await repository.projects(slug);
      if (!project)
        throw new ApiError(404, "PROJECT_NOT_FOUND", "Projeto não encontrado.");
      return project;
    }),
  faqs: () => read((repository) => repository.faqs()),
  seo: (path) => read((repository) => repository.seo(path)),
};
