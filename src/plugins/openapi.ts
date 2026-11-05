import { openapi } from "@elysiajs/openapi";
import { publicApiPath } from "../core/public-config";

export const OpenAPIPlugin = openapi({
  path: "/docs",
  provider: "scalar",
  scalar: {
    url: `${publicApiPath}/v1/docs/json`,
    layout: "modern",
    theme: "default",
    showSidebar: true,
    persistAuth: false,
  },
  documentation: {
    info: {
      title: "Camelatto Design - API",
      version: "1.0.0",
      description:
        "Conteúdo da LP, autenticação, administração e imagens do Camelatto Design.",
      contact: {
        name: "Suporte Camelatto Design",
        email: "support@ericacamelatto.com.br",
        url: "https://ericacamelatto.com.br",
      },
      license: {
        name: "Proprietária",
      },
    },
    servers: [{ url: publicApiPath || "/", description: "Servidor atual" }],
    tags: [
      {
        name: "Content",
        description: "Conteúdo público da LP, armazenado no MySQL.",
      },
      {
        name: "Auth",
        description:
          "Login, sessões revogáveis e recuperação de acesso. Sem cadastro público.",
      },
      {
        name: "Admin",
        description: "Conteúdo e gestão de acessos autenticados.",
      },
      { name: "Media", description: "Imagens públicas armazenadas pela API." },
      {
        name: "Health",
        description: "Saúde do servidor e prontidão do banco.",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "Opaque session token",
        },
      },
    },
  },
});
