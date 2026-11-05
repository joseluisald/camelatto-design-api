const configuredPath = (process.env.PUBLIC_API_PATH || "").replace(/\/$/, "");
if (configuredPath && !/^\/[a-zA-Z0-9/_-]+$/.test(configuredPath)) {
  throw new Error(
    "PUBLIC_API_PATH deve ser um caminho local, sem domínio ou query string."
  );
}
export const publicApiPath = configuredPath;

export const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || "http://localhost:4321,http://localhost:3001")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol) || url.origin !== value) {
        throw new Error(
          "CORS_ORIGINS deve conter origens HTTP completas, sem caminho ou barra final."
        );
      }
      return value;
    })
);
