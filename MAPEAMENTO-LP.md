# Camelatto Design — conteúdo da LP no MySQL

Análise e implementação em 05/11/2026. LP em `D:\Projetos\JLA Code\camellato-design`. Na etapa seguinte, a LP foi convertida para SSR com Node e conectada à API: home, projetos, FAQ e SEO agora são consultados no servidor por requisição. Os JSONs antigos foram retirados de runtime e preservados como fixtures de teste. Operação da LP: `../camellato-design/SSR-API.md`.

## Checklist desta entrega

- [x] Mapear `settings.json`, `portfolio.json`, `faq.json` e seus consumidores.
- [x] Criar migration SQL com tabelas relacionais, índices, chaves estrangeiras e datas de auditoria.
- [x] Criar executor de migrations com histórico, checksum SHA-256 e trava contra execução concorrente.
- [x] Criar seed inicial transacional com o conteúdo atual da LP.
- [x] Preservar IDs como `01`, textos, acentos e ordenação das listas.
- [x] Criar sete endpoints públicos de leitura com contrato OpenAPI.
- [x] Separar rotas, modelos, serviços, repositórios e plugins.
- [x] Parametrizar valores SQL, validar entradas e padronizar erros.
- [x] Filtrar projetos/FAQs não publicados e itens de navegação/galeria inativos.
- [x] Configurar CORS por origem exata e caminho público da documentação no QA.
- [x] Adicionar `.gitignore` para segredos, dependências e artefatos.
- [x] Validar tipos, testes HTTP e importação sem escrita com `--dry-run`.
- [x] Testar migration, seed e consultas reais em base local temporária isolada.
- [ ] Validar também no MySQL da hospedagem: o servidor local encontrado é **MariaDB 12.3.3**.
- [ ] Executar migration e seed nos bancos definitivos de QA e produção.
- [x] Substituir o carregamento de JSON da LP por chamadas à API no servidor SSR.
- [x] Aplicar migration e seed no banco local configurado, preservando tabelas preexistentes.
- [x] Implementar autenticação, autorização e operações administrativas; detalhes atuais em ADMIN-INTEGRACAO.md.

As caixas marcadas indicam implementação ou verificação efetivamente concluída. Os endpoints administrativos abaixo são uma especificação para a próxima etapa e não estão expostos.

## Diagnóstico e soluções

| Situação encontrada                                                               | Solução definida                                                                                               |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/utils/data.ts` importa os três JSONs e retorna dados sincronamente           | Middleware SSR consulta `GET /v1/content` e fornece dados em `Astro.locals`                                    |
| `portfolio.json` reúne muito mais que projetos                                    | Migrar navegação, hero, abordagem, galeria, sobre, indicadores e contato também                                |
| `Projects.astro` importa `portfolio.json` diretamente para os títulos das etapas  | Receber as etapas via propriedades, removendo esse segundo caminho de acesso aos arquivos                      |
| Componentes inferem tipos dos arquivos JSON                                       | Usar contratos TypeScript independentes dos snapshots, compatíveis com `src/models/content.ts`                 |
| FAQ é carregado por `getSettings()`, mas não é renderizado em `index.astro`       | Endpoint e tabela estão preparados; incluir a seção na LP quando integrar                                      |
| Projetos usam `image: mobile/web/research`                                        | Manter essas chaves no seed e o resolvedor `project-images.ts`; URLs reais exigirão adaptação desse resolvedor |
| Existem textos e imagens de exemplo                                               | Seed preserva a página atual; revisar os placeholders antes da publicação                                      |
| `year` contém `[Ano]`                                                             | Usar `VARCHAR(32)` para preservar o conteúdo; o futuro admin deve orientar o preenchimento de um ano real      |
| Astro gera páginas estáticas, inclusive `/projetos/[slug]` via `getStaticPaths()` | SSR com adapter Node: consultar a API no servidor a cada requisição                                            |
| `import.meta.env.PROD` também é verdadeiro no build de QA                         | Adotar variável explícita de ambiente da LP para aplicar `noindex, nofollow` no QA                             |
| Canonical depende de `Astro.site`, atualmente fixo no domínio de demos            | Configurar `site` e `base` por ambiente; nunca incluir o prefixo do QA na URL de produção                      |
| Head define Schema.org como `Product` para o portfólio pessoal                    | Rever para `Person`/`WebSite` conforme o conteúdo e serializar JSON-LD com escape de `<`                       |
| Auth está apenas esboçada                                                         | Manter escrita indisponível até existirem autenticação, autorização e auditoria                                |

Os snapshots em `database/seeds/*.json` servem exclusivamente à importação inicial. As rotas públicas consultam o banco e não importam esses arquivos. A conversão para MySQL muda a origem do conteúdo; a resposta HTTP continua sendo JSON.

## Padrão da API

```text
src/
  core/           conexão, erros de domínio e configuração pública
  models/         schemas de entrada/saída e tipos TypeScript
  routes/         contrato HTTP e validação de parâmetros
  services/       regras de aplicação e transações de leitura
  repositories/   SQL e conversão dos registros para o contrato da LP
  plugins/        documentação, CORS/cabeçalhos e tratamento de erros
database/
  migrations/     SQL versionado, aplicado em ordem
  seeds/          snapshots de importação inicial
scripts/          migration, seed e verificação isolada do banco
tests/            testes HTTP com serviço injetado
```

Indentação de dois espaços, aspas duplas, ponto e vírgula e formatação Prettier. Tabelas/colunas usam `snake_case`; respostas usam `camelCase`, preservando o formato da LP. Rotas não executam SQL. A leitura de cada endpoint usa uma transação `READ ONLY` com isolamento `REPEATABLE READ`, mantendo consistência entre as consultas do agregado.

## Tabelas e mapeamento dos campos

DDL completo e limites dos campos: `database/migrations/001_content.sql`. Requisito de referência: MySQL 8.0.16+ ou 8.4; SQL também testado no MariaDB local. Banco e usuário devem existir antes da migration. Charset `utf8mb4`, collation `utf8mb4_unicode_ci`, engine InnoDB.

| Origem                                                      | Tabela              | Campos principais e regras                                                                                                                                                                |
| ----------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settings.site` (identidade e contato)                      | `site_settings`     | Registro único `id = 1`; `name`, `role`, `location`, `developer_name`, `developer_url`, `email`, `linkedin`, `behance`, `resume`, `gtm`, `whatsapp`                                       |
| `settings.site.title/description/keywords` e SEO por página | `seo_pages`         | `id`, `path` único, `project_id` opcional e único, `title`, `description`, `keywords`, `robots`, `og_image`; FK para projetos com exclusão em cascata                                     |
| `portfolio.navigation[]`                                    | `navigation_items`  | `id`, `label`, `href`, `sort_order`, `is_active`                                                                                                                                          |
| `portfolio.hero/approach/gallery/about/contact`             | `site_sections`     | Chave `section_key` restrita às cinco seções; `eyebrow`, `title`, `highlight`, `description`, `primary_cta`, `secondary_cta`, `image`, `image_alt`; campos não aplicáveis ficam vazios    |
| `portfolio.projects[]`                                      | `projects`          | `id` textual preservado, `slug` único, `category`, `year`, `title`, `image`, `image_alt`, `description`, `contribution`, `challenge`, `process`, `solution`, `sort_order`, `is_published` |
| `portfolio.projects[].tags[]`                               | `project_tags`      | `id`, `project_id`, `label`, `sort_order`; FK com cascata; ordem única dentro do projeto                                                                                                  |
| `portfolio.approach.steps[]`                                | `approach_steps`    | `id`, `title`, `description`, `sort_order`                                                                                                                                                |
| `portfolio.gallery.items[]`                                 | `gallery_items`     | `id`, `title`, `category`, `image`, `alt`, `sort_order`, `is_active`                                                                                                                      |
| `portfolio.about.paragraphs[]`                              | `about_paragraphs`  | `id`, `content`, `sort_order`                                                                                                                                                             |
| `portfolio.about.skills[]`                                  | `skills`            | `id`, `label`, `sort_order`                                                                                                                                                               |
| `portfolio.about.stats[]`                                   | `profile_stats`     | `id`, `value`, `label`, `sort_order`; `value` é texto para preservar valores formatados como `64.758`                                                                                     |
| `faq[]`                                                     | `faqs`              | `id` inteiro preservado, `question`, `answer`, `sort_order`, `is_published`                                                                                                               |
| Controle de carga inicial                                   | `seed_history`      | `name`, `applied_at`; impede reaplicação destrutiva do seed                                                                                                                               |
| Controle do executor                                        | `schema_migrations` | `name`, `checksum`, `applied_at`; criada pelo executor                                                                                                                                    |

Todas as tabelas editoriais possuem `created_at` e `updated_at`. As coleções são ordenadas por `sort_order`, com `id` como desempate. Datas usam UTC. Projetos e FAQ novos ficam não publicados por padrão; o seed publica os registros atuais para reproduzir a LP existente.

As listas possuem tabelas próprias: não há documento JSON usado como armazenamento genérico do conteúdo. Caminhos SEO são lógicos, como `/` e `/projetos/projeto-01`; domínio e prefixo de QA pertencem à configuração de deploy. Não cadastrar segredos em `site_settings`: todos os seus campos são públicos.

## Rotas públicas implementadas

Adicionar `/v1` aos caminhos abaixo. São leituras públicas, sem token. Respostas não incluem colunas internas, flags de publicação ou credenciais.

| Método | Caminho           | Resposta / uso                                                                                                                    |
| ------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/content`        | `{ settings, faq, portfolio, seo }`; leitura agregada recomendada para o build da LP                                              |
| GET    | `/settings`       | Identidade, contato, desenvolvedor e SEO principal incorporado; compatível com `settings` atual                                   |
| GET    | `/portfolio`      | `{ navigation, hero, projects, approach, gallery, about, contact }`                                                               |
| GET    | `/projects`       | Array de projetos publicados, com tags ordenadas                                                                                  |
| GET    | `/projects/:slug` | Um projeto publicado; 404 para inexistente ou não publicado                                                                       |
| GET    | `/faqs`           | Array de `{ id, question, answer }` publicados                                                                                    |
| GET    | `/seo?path=/`     | `{ path, title, description, keywords, robots, ogImage }`; `path` padrão `/`; 404 se ausente ou vinculado a projeto não publicado |

Slug: letras minúsculas ASCII, números e hífen entre segmentos; máximo 160 caracteres. SEO aceita caminhos sem barra final (exceto `/`), sem domínio, fragmento ou query embutida; máximo 255 caracteres. O consumidor deve normalizar a URL antes de consultar.

`ogImage` pode ficar vazio; o seed mantém o uso dos assets atuais da LP até a integração. Configurações ou seções obrigatórias ausentes produzem 503; SEO ausente produz 404. Banco inacessível produz 503 para falhas de conexão conhecidas; demais falhas internas produzem 500. Entrada inválida produz 422; origem bloqueada, 403.

```json
{
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Projeto não encontrado."
  }
}
```

Outras rotas existentes: `GET /health/live`, `GET /health/ready`, `GET /v1/docs`, `GET /v1/docs/json`. Readiness verifica conexão com o banco, sem garantir que migrations e seed estejam aplicados. `/docs` e `/docs/json` redirecionam para a documentação versionada.

## Rotas administrativas implementadas

A integração do admin foi concluída na etapa seguinte. A especificação e o checklist atuais estão em [ADMIN-INTEGRACAO.md](ADMIN-INTEGRACAO.md). Auth usa sessões opacas revogáveis; os endpoints privados exigem Bearer. O admin Next mantém o token em cookie HttpOnly e acessa a API pelo servidor.

As edições de seções usam GET/PUT /v1/admin/documents/:key; projetos usam GET/POST /v1/admin/projects e GET/PATCH/DELETE /v1/admin/projects/:id. Usuários, auditoria e uploads também estão na API. A migration 002_admin.sql adiciona as tabelas de autenticação e administração sem remover dados legados.

## Segurança: implementado e pendente

- [x] Valores externos enviados a `execute()` por parâmetros; tabelas e colunas são constantes internas.
- [x] Schemas de parâmetros e respostas; erros de validação não expõem detalhes internos.
- [x] Nenhuma rota de escrita pública.
- [x] CORS usa origens exatas, sem `*` ou credenciais; requisições sem `Origin` continuam permitidas para o build do Astro.
- [x] Headers `X-Content-Type-Options`, `Referrer-Policy`, `Vary: Origin` e `Cache-Control: no-store`.
- [x] Corpo do servidor limitado a 12 MiB (uploads de até 10 MiB); schemas limitam os campos JSON; pool com dez conexões e fila limitada a cem requisições.
- [x] Seed recusa tabelas com dados se não existir o marcador da carga inicial; reaplicação preserva edições.
- [ ] Usar usuário de runtime com somente SELECT para estas rotas; separar credenciais de migration/seed e, futuramente, de escrita administrativa.
- [ ] Configurar TLS quando o banco estiver fora do host/rede privada; não desativar validação de certificados.
- [ ] Configurar rate limit e timeout no proxy; o limite de corpo e a fila do pool não substituem essas proteções.
- [x] Implementar autenticação, autorização, auditoria e proteção de login na API; CSRF no BFF do admin.
- [x] Validar protocolos de URLs no backend do admin (`https`, caminhos locais e âncoras conforme cada campo); impedir `javascript:` e HTML arbitrário.
- [x] Na LP, escapar JSON-LD e manter texto editorial sem `set:html`.
- [x] Reavaliar CORS, preflight e headers autorizados para métodos administrativos com Bearer.
- [ ] Restringir documentação em produção se a política de publicação exigir.

CORS é uma política do navegador; ele não impede chamadas diretas à API nem substitui autenticação. Senhas, JWT secret, chaves de integração e credenciais MySQL ficam exclusivamente no servidor.

## Ambientes e publicação

| Serviço | QA                                                    | Produção                              |
| ------- | ----------------------------------------------------- | ------------------------------------- |
| LP      | `https://demos.jlacode.com.br/camelatto-design`       | `https://ericacamelatto.com.br`       |
| Admin   | `https://demos.jlacode.com.br/camelatto-design/admin` | `https://admin.ericacamelatto.com.br` |
| API     | `https://demos.jlacode.com.br/camelatto-design/api`   | `https://api.ericacamelatto.com.br`   |

Exemplo de variáveis **da API** no QA, além das credenciais de banco:

```dotenv
NODE_ENV=production
FRONTEND_URL=https://demos.jlacode.com.br/camelatto-design
APP_URL=https://demos.jlacode.com.br/camelatto-design/api
PUBLIC_API_PATH=/camelatto-design/api
CORS_ORIGINS=https://demos.jlacode.com.br
```

Produção:

```dotenv
NODE_ENV=production
FRONTEND_URL=https://ericacamelatto.com.br
APP_URL=https://api.ericacamelatto.com.br
PUBLIC_API_PATH=
CORS_ORIGINS=https://ericacamelatto.com.br,https://admin.ericacamelatto.com.br
```

`PUBLIC_API_PATH` ajusta links externos da documentação e redirecionamentos; não altera as rotas internas. `FRONTEND_URL` e `APP_URL` são informativas nesta etapa, sem fluxos de e-mail/autenticação implementados. CORS compara origem (protocolo + domínio + porta), nunca caminhos; LP e admin de QA compartilham a mesma origem.

No proxy de QA, remover `/camelatto-design/api` antes de encaminhar à API. Exemplo de trecho Nginx a integrar na configuração existente:

```nginx
location = /camelatto-design/api {
    return 308 /camelatto-design/api/;
}

location ^~ /camelatto-design/api/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Assim, `/camelatto-design/api/v1/content` chega ao processo como `/v1/content`. Em produção, encaminhar o subdomínio da API preservando o caminho `/v1/...`. Reservar a rota do admin separadamente para não cair no fallback da LP. O proxy não foi alterado nesta entrega.

Na LP, `API_URL` configura a base interna ou externa da API, sem `/v1` no final, exclusivamente no servidor. As consultas possuem timeout, limite de resposta e validação de contrato. Em falhas, a LP retorna uma página 503 sem detalhes internos e sem fallback aos snapshots. O build não depende da disponibilidade da API. Nenhum dado privado deve ser enviado nesses endpoints públicos.

A LP já utiliza renderização por requisição com adapter Node standalone. O middleware consulta a API antes de renderizar a página e o SEO permanece no HTML inicial. Alterações de conteúdo não exigem rebuild; mudanças de código, assets e ambiente de domínio/base exigem.

## Operação das migrations e seed

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
bun run db:migrate:check
bun run db:seed:check
```

Os dois comandos `:check` validam arquivos/snapshot localmente e não conectam ao banco. Não verificam a sintaxe no servidor nem a existência das tabelas.

Após provisionar e conferir o banco correto no `.env`, com backup quando já houver dados:

```sh
bun run db:migrate
bun run db:seed
bun run start
```

1. Executor obtém trava por banco, verifica checksums e aplica arquivos SQL pendentes.
2. Cada instrução SQL é separada pelo marcador `-- statement`; múltiplos comandos SQL não são habilitados na conexão.
3. A migration inicial cria tabelas com `IF NOT EXISTS` e só registra o histórico ao concluir. Isso não valida estruturas preexistentes com os mesmos nomes: revisar conflitos antes de aplicar em banco legado.
4. MySQL faz commit implícito em DDL; não existe promessa de rollback transacional do schema. Em falha parcial, conferir tabelas, corrigir a causa e reaplicar; mudanças estruturais posteriores devem ser novas migrations.
5. Nunca editar uma migration já aplicada. O checksum bloqueia divergências. Reversão em produção deve ser feita por migration corretiva ou restauração de backup; nenhum comando de exclusão automática do banco da aplicação foi criado.
6. Seed exige tabelas editoriais vazias na primeira execução; importa tudo em uma transação, com trava para concorrência, e grava `lp-initial-v1` no histórico. Execuções seguintes não substituem conteúdo editado.
7. Os comandos rodam separadamente do servidor e do build. O binário compilado não executa migration/seed; incluir `scripts/`, `database/`, `src/`, dependências e Bun na etapa de preparação do deploy.

## Verificações executadas e critérios de aceite

- [x] `bun run typecheck`: sem erros.
- [x] `bun test`: contrato das sete rotas, validação, 404/500/503, sigilo de erros e CORS.
- [x] `bun run db:migrate:check`: treze instruções de criação de tabelas, além do histórico mantido pelo executor.
- [x] `bun run db:seed:check`: três projetos, quatro FAQs e seis itens de galeria, mais as demais seções.
- [x] `bun run test:db`: cria base local aleatória `camelatto_test_*`, aplica migration duas vezes, executa seeds concorrentes, compara o agregado com os JSONs originais, verifica ocultação de rascunhos no conteúdo/SEO, preservação de edições, cascata de tags e rejeição de checksum alterado. Remove somente a base que o próprio teste criou.
- [x] O teste de banco foi executado no MariaDB local, preservando o banco configurado da aplicação. Docker não estava em execução; não houve teste em container MySQL.
- [x] Smoke test com `PUBLIC_API_PATH=/camelatto-design/api`: redirecionamentos, URL do Scalar, servidor OpenAPI e sete rotas documentadas respeitam o prefixo externo.
- [ ] Repetir integração no MySQL de referência e validar configuração do proxy real.
- [x] Na LP, remover imports de JSON de runtime e de tipos, incluindo `Projects.astro`.
- [x] Validar home e projeto com a API real; testar 404 e 503 sem depender da API.
- [x] Validar assets, links de âncora e rotas de projetos sob `/camelatto-design` no QA.
- [x] Confirmar título, descrição, canonical e robots nos builds SSR de QA e produção.
- [x] Adotar SSR para atualização imediata e testar alteração de conteúdo sem rebuild.

`test:db` é opt-in: exige host local e permissão de criar/remover uma base temporária. Nunca apontá-lo para produção. O teste não inicia containers e não cria usuários. Usar `bun.lock` como lockfile do fluxo Bun; o `yarn.lock` preexistente não é atualizado por esse fluxo.

## Referências técnicas

- [MySQL — comandos com commit implícito](https://dev.mysql.com/doc/refman/8.4/en/implicit-commit.html)
- [mysql2 — prepared statements](https://sidorares.github.io/node-mysql2/docs/documentation/prepared-statements)
- [Astro — renderização por requisição](https://docs.astro.build/en/guides/on-demand-rendering/)
