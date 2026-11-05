import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "../core/database";
import { transaction } from "../core/transaction";
import { ApiError } from "../core/api-error";
import type { AuthContext } from "../models/auth";
import { lockWrite } from "./admin.service";
import { audit } from "./auth.service";

const root = path.resolve(process.env.MEDIA_STORAGE_PATH || "storage/media");
function mediaUrl(key: string) {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(
    /\/+$/,
    ""
  );
  return `${base}/v1/media/${key}`;
}

export async function listMedia() {
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT id,name,storage_key AS storageKey,alt,mime,size,width,height,created_at AS createdAt FROM media_assets ORDER BY created_at DESC,id LIMIT 500"
  );
  return rows.map(({ storageKey, ...row }) => ({
    ...row,
    url: mediaUrl(storageKey),
  }));
}

export async function uploadMedia(
  context: AuthContext,
  file: File,
  alt: string
) {
  if (file.size > 10 * 1024 * 1024)
    throw new ApiError(
      413,
      "IMAGE_TOO_LARGE",
      "Envie uma imagem de até 10 MB."
    );
  if (
    !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)
  )
    throw new ApiError(422, "INVALID_IMAGE", "Envie JPG, PNG, WebP ou AVIF.");
  const source = Buffer.from(await file.arrayBuffer());
  const rasterSignature =
    source
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (source[0] === 255 && source[1] === 216 && source[2] === 255) ||
    (source.toString("ascii", 0, 4) === "RIFF" &&
      source.toString("ascii", 8, 12) === "WEBP") ||
    (source.toString("ascii", 4, 8) === "ftyp" &&
      /avif|avis/.test(source.toString("ascii", 8, 32)));
  if (!rasterSignature)
    throw new ApiError(
      422,
      "INVALID_IMAGE",
      "O arquivo não é uma imagem raster permitida."
    );
  let converted;
  try {
    converted = await sharp(source, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 86 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new ApiError(
      422,
      "INVALID_IMAGE",
      "Não foi possível ler a imagem enviada."
    );
  }
  const id = randomUUID();
  const key = id + ".webp";
  await mkdir(root, { recursive: true });
  const filename = path.join(root, key);
  await writeFile(filename, converted.data, { flag: "wx" });
  try {
    await transaction(async (connection) => {
      const actor = await lockWrite(connection, context);
      await connection.execute(
        "INSERT INTO media_assets (id,storage_key,name,alt,mime,size,width,height) VALUES (?,?,?,?,?,?,?,?)",
        [
          id,
          key,
          file.name.slice(0, 200),
          alt.trim(),
          "image/webp",
          converted.data.length,
          converted.info.width,
          converted.info.height,
        ]
      );
      await audit(connection, actor.id, "upload", "media", id);
    });
  } catch (error) {
    await unlink(filename).catch(() => undefined);
    throw error;
  }
  return {
    id,
    name: file.name.slice(0, 200),
    url: mediaUrl(key),
    alt: alt.trim(),
    width: converted.info.width,
    height: converted.info.height,
    size: converted.data.length,
  };
}

export async function readMedia(key: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/.test(
      key
    )
  )
    throw new ApiError(404, "MEDIA_NOT_FOUND", "Imagem não encontrada.");
  const [records] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM media_assets WHERE storage_key=?",
    [key]
  );
  if (!records.length)
    throw new ApiError(404, "MEDIA_NOT_FOUND", "Imagem não encontrada.");
  const file = Bun.file(path.join(root, key));
  if (!(await file.exists()))
    throw new ApiError(404, "MEDIA_NOT_FOUND", "Imagem não encontrada.");
  return new Response(file, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
