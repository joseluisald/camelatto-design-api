# Integração do admin — Camelatto Design

## Entrega

- [x] Admin reorganizado em `D:\Projetos\JLA Code\camelatto-design-admin`.
- [x] Interface Next.js separada da persistência e autenticação.
- [x] Removidos Prisma/Better Auth, backend local de conteúdo, snapshots, worker de publicação e integrações de deploy.
- [x] Removidas as telas de leads/tarefas do escopo ativo; dados legados, uploads e backups preservados.
- [x] Autenticação, permissões, edição, upload e auditoria centralizados nesta API.
- [x] Migration `002_admin.sql` aplicada no banco local.
- [x] Senhas Argon2id e tokens de sessão/recuperação armazenados somente como hashes.
- [x] Cookie HttpOnly no admin e proteção de origem em todas as escritas do BFF.
- [x] Edição com versão e resposta 409 para conflitos.
- [x] Testes reais em banco temporário e builds QA/produção.
- [ ] Cadastrar os usuários reais, configurar SMTP e publicar os serviços.

O admin não acessa MySQL diretamente. Seu BFF encaminha apenas rotas explicitamente permitidas para a API; o browser não recebe o token Bearer. A LP continua usando os endpoints públicos, com conteúdo atualizado a cada requisição SSR.

## Rotas da API

Todas usam prefixo `/v1`.

| Método     | Caminho                        | Acesso                                                        |
| ---------- | ------------------------------ | ------------------------------------------------------------- |
| GET        | `/auth/config`                 | Público; informa disponibilidade de recuperação               |
| POST       | `/auth/login`                  | Público, com rate limit; retorna token ao cliente de servidor |
| GET        | `/auth/me`                     | Sessão válida                                                 |
| POST       | `/auth/logout`                 | Revoga a sessão atual                                         |
| POST       | `/auth/change-password`        | Confere a senha atual e revoga todas as sessões               |
| POST       | `/auth/request-password-reset` | Resposta genérica; SMTP na API                                |
| POST       | `/auth/reset-password`         | Token de uso único, expiração de 30 minutos                   |
| GET        | `/admin/dashboard`             | Administrador/editor                                          |
| GET, PUT   | `/admin/documents/:key`        | Seções; configurações principais somente administrador        |
| GET, POST  | `/admin/projects`              | Listagem paginada/criação, incluindo rascunhos                |
| GET, PATCH | `/admin/projects/:id`          | Leitura/edição com versão                                     |
| DELETE     | `/admin/projects/:id`          | Somente administrador; exclui vínculos por FK                 |
| GET, POST  | `/admin/media`                 | Biblioteca e upload                                           |
| GET        | `/media/:key`                  | Imagem pública WebP                                           |
| GET, POST  | `/admin/users`                 | Somente administrador                                         |
| PATCH      | `/admin/users/:id`             | Nome, perfil, ativo e revogação; somente administrador        |
| GET        | `/admin/audit`                 | Histórico paginado, somente administrador                     |

Chaves de documentos: `hero`, `navigation`, `approach`, `gallery`, `about`, `contact`, `faq`, `settings`. Os dados são validados por chave e persistidos nas tabelas relacionais da migration inicial. As listas da seção são substituídas em uma transação, preservando ordem e publicação/ativação.

Projeto contém os campos já usados pela LP, mais `isPublished`, `sortOrder` e `seo`. Criação recebe `{ data }`; edição recebe `{ data, version }`. Seu identificador de exibição é imutável. O slug pode mudar, atualizando o caminho SEO vinculado; links antigos não ganham redirects automáticos.

## Tabelas novas

| Tabela                   | Uso                                                     |
| ------------------------ | ------------------------------------------------------- |
| `admin_users`            | Contas, hash de senha, perfil e ativação                |
| `admin_sessions`         | Hash do token, usuário e expiração absoluta de 12 horas |
| `admin_password_resets`  | Hash de token de uso único e expiração                  |
| `admin_rate_limits`      | Limites de tentativas persistentes                      |
| `admin_content_versions` | Versões de documentos/projetos e lock de escrita        |
| `admin_audit_logs`       | Ator, ação, entidade e data, sem senhas/tokens          |
| `media_assets`           | Metadados dos arquivos públicos armazenados pela API    |

Nenhuma tabela legada foi excluída. O seed não cria usuário ou senha padrão.

## Criar o primeiro acesso

```sh
bun run db:migrate
bun run admin:user
```

O comando solicita nome, e-mail e senha sem exibir a senha. Variáveis opcionais para automação: `ADMIN_SETUP_NAME`, `ADMIN_SETUP_EMAIL`, `ADMIN_SETUP_PASSWORD`. Não colocar a senha em argumentos, código ou documentação. E-mail existente é recusado, sem redefinir a senha.

Um administrador pode criar editores e outros administradores pelo painel. Desativar conta, alterar perfil ou usar a ação de revogação invalida sessões. O usuário não pode retirar o próprio acesso administrativo e o backend protege o último administrador ativo.

## Execução e ambientes

API:

```sh
bun install --frozen-lockfile
bun run dev
```

Admin:

```sh
npm ci
npm run dev
```

Desenvolvimento usa API `http://127.0.0.1:3000`, admin `http://localhost:3001` e LP `http://localhost:4321`. O `.env` antigo do admin foi preservado; o backend novo usa `API_URL`, `ADMIN_ORIGIN` e `LP_URL` em vez das credenciais MySQL antigas.

| Ambiente | Build do admin       | Origem do admin                       | Prefixo                   |
| -------- | -------------------- | ------------------------------------- | ------------------------- |
| QA       | `npm run build:qa`   | `https://demos.jlacode.com.br`        | `/camelatto-design/admin` |
| Produção | `npm run build:prod` | `https://admin.ericacamelatto.com.br` | vazio                     |

O proxy preserva o prefixo do admin. `API_URL` pode ser endereço interno ou a URL pública completa, terminando antes de `/v1`. `ADMIN_ORIGIN` recebe somente origem, sem caminho. Cookie `Secure` é definido para origem HTTPS. Não compartilhar o cookie entre subdomínios.

Documentação completa do painel: `../camelatto-design-admin/README.md`.

## E-mail, storage e manutenção

Na API, configurar `ADMIN_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. O link de recuperação usa somente `ADMIN_URL`, nunca um redirect enviado pelo cliente. Sem configuração, a interface não apresenta recuperação como disponível. O envio efetivo de e-mail não foi exercitado por testes.

Imagens ficam em `MEDIA_STORAGE_PATH` (padrão `storage/media`). Provisionar volume persistente e backups nesse serviço. `APP_URL` deve conter o endereço público da API, incluindo o prefixo de QA, para formar URLs que o browser da LP consiga abrir.

Uploads exigem sessão, aceitam até 10 MB, verificam assinatura raster/decodificação e convertem para WebP limitado a 2400 px e 40 milhões de pixels de entrada. SVG é recusado. Os nomes dos arquivos são UUIDs, sem usar caminho/nome enviado pelo usuário. A biblioteca retorna até 500 registros recentes. Exclusão de imagens não está exposta.

Agendar `bun run admin:cleanup` no servidor para remover sessões, tokens de recuperação e registros de rate limit já expirados. Esse comando não remove usuários, auditoria, conteúdo ou arquivos.

Rate limit por e-mail e endereço de conexão é armazenado no banco. Quando o Next e a API se comunicam diretamente, o limite por endereço é compartilhado pelos usuários do mesmo BFF. Não se confia automaticamente em X-Forwarded-For; configurar também limites no proxy para a borda pública.

## Testes executados

- [x] API: TypeScript, formatação e testes de contrato público.
- [x] Migration inicial e nova migration em banco local temporário.
- [x] Bootstrap de administrador pelo CLI, com hash Argon2id e senha ausente do log.
- [x] Login inválido/válido, `me`, hash de token, logout e revogação.
- [x] Bloqueio de usuário sem sessão e restrições de editor.
- [x] Leitura e gravação de todas as seções.
- [x] Projeto rascunho/publicado, SEO vinculado, duplicidade, exclusão e conflito de versão.
- [x] URLs executáveis recusadas.
- [x] Upload válido, leitura pública e rejeição de arquivo inválido.
- [x] Troca de senha, reset de uso único, revogação e rate limit.
- [x] Next compilado em QA e produção: CSRF, cookie HttpOnly/SameSite, redirect com base correta, SSR autenticado, edição através do BFF e ausência de token no HTML/JSON de login.
- [x] Testes de allowlist do BFF, lint e build do painel.
- [ ] Validar provedor SMTP, proxy/TLS, storage persistente e hospedagem real.
- [ ] Repetir os testes no MySQL da hospedagem; os testes locais usam MariaDB 12.3.3.

`bun run test:admin` usa banco local temporário e dados fictícios, sem afetar contas reais. Para incluir o admin compilado, definir `ADMIN_TEST_DIR` e `ADMIN_TEST_BASE_PATH` compatíveis com o build.

## Recuperabilidade da limpeza

Antes de substituir o admin, foi verificado que o repositório original estava sem alterações locais. Seus 99 arquivos rastreados foram copiados com verificação SHA-256 para `.work/admin-original-files`; o histórico completo foi preservado e validado em `.work/admin-original.bundle`.

A substituição removeu somente os arquivos legados rastreados do manifesto e aplicou a versão previamente compilada/testada. Foram preservados `.env`, arquivos não rastreados, `storage/`, `backups/` e o banco. A revisão automática inicialmente bloqueou a exclusão ampla; a substituição recuperável foi aprovada após as verificações e os backups.

Commit original do admin: `7de4c3a862530a990dd434fbb9210bd9d1306eee`. Manifesto e revisão: `.work/admin-replacement.json` e `.work/ADMIN-REVISAO.md`. Esses artefatos são locais e não entram no deploy.
