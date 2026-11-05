import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

function key() {
  const secret =
    process.env.DATA_ENCRYPTION_KEY ||
    (process.env.NODE_ENV !== "production" ? process.env.JWT_SECRET : "");

  if (!secret || secret.length < 32)
    throw new Error(
      "Configure DATA_ENCRYPTION_KEY com pelo menos 32 caracteres."
    );

  return createHash("sha256").update(secret).digest();
}

export function seal(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);

  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);

  return (
    "enc:v1:" +
    Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64")
  );
}

export function unseal(value: string) {
  if (!value.startsWith("enc:v1:")) return value;

  const data = Buffer.from(value.slice(7), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));

  decipher.setAuthTag(data.subarray(12, 28));

  return Buffer.concat([
    decipher.update(data.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
