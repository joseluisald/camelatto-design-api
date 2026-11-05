# Deploy no Coolify com GitHub e Railpack

Guia para publicar a LP Astro SSR, o admin Next.js e a API Bun. Os valores de cada aplicação estão em [CONFIGURACAO-AMBIENTES.md](CONFIGURACAO-AMBIENTES.md).

Os comandos foram conferidos nos projetos locais em 05/11/2026. Este documento descreve a implantação; nenhuma configuração foi aplicada ao Coolify, ao GitHub ou ao DNS.

## 1. Organização dos recursos

Criar dois ambientes no projeto do Coolify:

| Ambiente | Aplicações Railpack sugeridas                                     | Dados                                       |
| -------- | ----------------------------------------------------------------- | ------------------------------------------- |
| QA       | `camelatto-lp-qa`, `camelatto-admin-qa`, `camelatto-api-qa`       | Banco QA e volume de imagens QA             |
| Produção | `camelatto-lp-prod`, `camelatto-admin-prod`, `camelatto-api-prod` | Banco produção e volume de imagens produção |

Esses nomes são sugestões para identificar os recursos. Usar os repositórios reais das três aplicações. O MySQL é um recurso de banco separado, com persistência própria.

Cada aplicação tem seu próprio container; as portas internas podem se repetir entre ambientes. Neste guia, LP usa `4321`, admin `3001` e API `3000`. O proxy publica HTTPS em `443`; não é necessário expor essas portas diretamente no host.

## 2. Conectar os repositórios do GitHub

1. Em Sources do Coolify, conectar uma GitHub App com acesso aos três repositórios.
2. No ambiente QA, criar uma aplicação por repositório, escolhendo a branch de QA.
3. No ambiente de produção, criar os mesmos três recursos com a branch de produção.
4. Se usar `qa` e `main`, escolher `qa` para QA e `main` para produção. Adaptar aos nomes reais das branches.
5. Usar Base Directory `/` quando cada repositório contiver uma aplicação na raiz. Se for monorepo, selecionar o diretório que contém o `package.json` daquela aplicação.
6. Selecionar **Railpack** como Build pack/Build strategy e **Web application / Dynamic** como tipo de saída.
7. Configurar variáveis, portas e domínios antes de publicar.

O Coolify aceita Railpack para aplicações Git, permite selecionar diretório e revisar os comandos detectados. As três aplicações deste projeto possuem processo de servidor. [Railpack no Coolify](https://coolify.io/docs/applications/builds/railpack).

No GitHub, incluir código, lockfile, scripts, migrations e configurações necessários. `.env`, uploads, backups, `node_modules`, `.next`, `dist` e `.work` ficam fora do repositório.

## 3. Comandos de instalação, build e início

Configurar os campos **Install Command**, **Build Command** e **Start Command** na aplicação correspondente.

| Aplicação      | Install Command                                      | Build Command        | Start Command                                      |
| -------------- | ---------------------------------------------------- | -------------------- | -------------------------------------------------- |
| API QA/prod    | `NODE_ENV=development bun install --frozen-lockfile` | `bun run typecheck`  | `sh -c 'bun run db:migrate && exec bun run start'` |
| LP QA          | `NODE_ENV=development bun install --frozen-lockfile` | `bun run build:qa`   | `bun run start`                                    |
| LP produção    | `NODE_ENV=development bun install --frozen-lockfile` | `bun run build:prod` | `bun run start`                                    |
| Admin QA       | `npm ci --include=dev`                               | `npm run build:qa`   | `npm start`                                        |
| Admin produção | `npm ci --include=dev`                               | `npm run build:prod` | `npm start`                                        |

Esses comandos de instalação são para o shell Linux do build no Coolify. Eles disponibilizam TypeScript e ferramentas de build; o processo em execução usa `NODE_ENV=production`.

No caso da API, `start` executa `src/index.ts` pelo Bun. O Build Command acima valida os tipos, e o início aplica migrations antes de abrir a porta. O script `bun run build` do repositório gera um executável Linux; esse artefato não é necessário para o fluxo por código-fonte definido aqui.

A imagem final da API precisa conter Bun, `src/`, `scripts/`, `database/`, `package.json` e dependências de produção. Confira esses caminhos no terminal do primeiro deploy.

Para separar as permissões de migration das de runtime, executar migrations em uma etapa de release com credenciais próprias e usar `bun run start` como Start Command. O fluxo simples da tabela exige que o usuário MySQL da API tenha também as permissões necessárias às migrations.

Não colocar seed ou criação de administrador no Start Command: são etapas de preparação inicial.

### Versões das ferramentas

Adicionar em **Build**:

| Aplicação | Variáveis Railpack                                       |
| --------- | -------------------------------------------------------- |
| API e LP  | `RAILPACK_NODE_VERSION=24`, `RAILPACK_BUN_VERSION=1.4.2` |
| Admin     | `RAILPACK_NODE_VERSION=24`                               |

Node 24 e Bun 1.4.2 correspondem às ferramentas usadas na integração local. O admin já possui `railpack.json` fixando Node 24 e `npm start`. Os campos do Coolify devem continuar consistentes com esse arquivo.

O Railpack documenta esses controles de versão e a detecção por lockfile/start command. [Node.js](https://railpack.com/languages/node/), [Bun](https://railpack.com/languages/bun/).

LP e API não possuem `railpack.json` na revisão local consultada. Os comandos podem ficar no Coolify. Para versionar também as versões desses dois recursos, um exemplo opcional na raiz de **cada repositório** é:

```json
{
  "$schema": "https://schema.railpack.com",
  "packages": {
    "node": "24",
    "bun": "1.4.2"
  }
}
```

Esse é um exemplo para criar posteriormente; não foi adicionado aos projetos. O Railpack lê seu arquivo na raiz selecionada para build. [Configuração por arquivo](https://railpack.com/config/file/).

## 4. Variáveis no Coolify

Abrir Environment Variables de **cada aplicação** e colar os blocos do [guia de ambientes](CONFIGURACAO-AMBIENTES.md).

- LP: `SITE_ENV` disponível no build e no runtime.
- Admin: `NEXT_PUBLIC_ADMIN_BASE_PATH` disponível no build e no runtime, com o mesmo valor.
- Todos: `NODE_ENV=production` no ambiente de hospedagem.
- API: banco, SMTP e URLs disponíveis em runtime; o build de tipos não exige conexão MySQL.
- LP/admin: `API_URL` disponível no runtime.
- Todos: `HOST=0.0.0.0` e `PORT` correspondentes à tabela.
- Senhas: cadastrar como segredo e preservar valor literal quando houver caracteres como `$`.

Os scripts `build:qa` e `build:prod` definem as opções do build; manter os valores de runtime compatíveis com o artefato escolhido.

Se duplicar uma aplicação QA para criar produção, atualizar todos os URLs, banco, usuário, senha, volume e branch. Limpar explicitamente `PUBLIC_API_PATH` da API e `NEXT_PUBLIC_ADMIN_BASE_PATH` do admin em produção.

## 5. Portas e domínios

### QA

| Aplicação | Porta exposta interna | Domínio/caminho                                       |
| --------- | --------------------- | ----------------------------------------------------- |
| LP        | `4321`                | `https://demos.jlacode.com.br/camelatto-design`       |
| Admin     | `3001`                | `https://demos.jlacode.com.br/camelatto-design/admin` |
| API       | `3000`                | `https://demos.jlacode.com.br/camelatto-design/api`   |

### Produção

| Aplicação | Porta exposta interna | Domínio                               |
| --------- | --------------------- | ------------------------------------- |
| LP        | `4321`                | `https://ericacamelatto.com.br`       |
| Admin     | `3001`                | `https://admin.ericacamelatto.com.br` |
| API       | `3000`                | `https://api.ericacamelatto.com.br`   |

Apontar os registros DNS de `demos.jlacode.com.br`, do domínio raiz, de `admin` e de `api` para o servidor/proxy que atenderá cada ambiente. O Coolify não configura o DNS do provedor por este procedimento. Habilitar e validar HTTPS.

No campo Domains, informar os URLs sem adicionar a porta interna ao endereço público; a porta de destino fica na configuração do recurso. Escolher a porta correta no editor de domínio quando esse campo aparecer.

## 6. Proxy do QA: caminhos e prioridades

Esta seção assume o proxy **Traefik** do Coolify. Caso sua instância use Caddy ou outro proxy, aplicar as mesmas regras de caminho no proxy correspondente.

| Serviço | Regra de caminho                         | Transformação            | Prioridade de exemplo |
| ------- | ---------------------------------------- | ------------------------ | --------------------- |
| API     | `/camelatto-design/api` e descendentes   | Remover esse prefixo     | `3000`                |
| Admin   | `/camelatto-design/admin` e descendentes | Preservar todo o caminho | `2000`                |
| LP      | `/camelatto-design` e descendentes       | Preservar todo o caminho | `1000`                |

O requisito é API/admin vencerem a regra da LP. Os números são exemplos; conferir se não existem outros routers com prioridade maior para esses mesmos caminhos.

### Ajustar os routers gerados

1. Configurar primeiro os domínios e portas no Coolify.
2. Conferir os labels gerados em General → Container labels.
3. Identificar o router HTTPS real de cada aplicação e sua lista de middlewares.
4. Preservar labels de serviço, porta, rede, TLS, certificados e middlewares necessários.
5. Se for preciso editar labels manualmente, salvar uma cópia dos valores atuais antes e usar as linhas abaixo com os nomes reais.
6. Remover `StripPrefix` dos routers da LP e do admin, se tiver sido gerado.
7. Aplicar `StripPrefix` somente à API QA e conferir as prioridades também nos routers HTTP de redirecionamento.

Ao selecionar gerenciamento manual, o Coolify deixa de regenerar esses labels; a configuração passa a ser responsabilidade da aplicação. A documentação mostra como editar mantendo os valores existentes e como voltar aos padrões. [Middlewares e routers no Coolify](https://coolify.io/docs/core/networking/proxy/traefik/custom-middlewares).

**Modelo de linhas para editar**, substituindo `ROUTER_HTTPS_...` pelos nomes já existentes. Esses identificadores não são nomes reais da sua instalação.

LP QA:

```text
traefik.http.routers.ROUTER_HTTPS_LP_QA.rule=Host(`demos.jlacode.com.br`) && (Path(`/camelatto-design`) || PathPrefix(`/camelatto-design/`))
traefik.http.routers.ROUTER_HTTPS_LP_QA.priority=1000
```

Admin QA:

```text
traefik.http.routers.ROUTER_HTTPS_ADMIN_QA.rule=Host(`demos.jlacode.com.br`) && (Path(`/camelatto-design/admin`) || PathPrefix(`/camelatto-design/admin/`))
traefik.http.routers.ROUTER_HTTPS_ADMIN_QA.priority=2000
```

API QA:

```text
traefik.http.routers.ROUTER_HTTPS_API_QA.rule=Host(`demos.jlacode.com.br`) && (Path(`/camelatto-design/api`) || PathPrefix(`/camelatto-design/api/`))
traefik.http.routers.ROUTER_HTTPS_API_QA.priority=3000
traefik.http.middlewares.camelatto-qa-api-strip.stripprefix.prefixes=/camelatto-design/api
```

Na lista `.middlewares` do router HTTPS da API, acrescentar `camelatto-qa-api-strip`, mantendo os demais middlewares necessários e evitando aplicar dois strips ao mesmo caminho. Se a lista estiver vazia, ela pode ser:

```text
traefik.http.routers.ROUTER_HTTPS_API_QA.middlewares=camelatto-qa-api-strip
```

Nos routers da LP e do admin, manter compressão/headers/autenticação que você já configurou, mas retirar qualquer middleware que remova seus prefixos. Não aplicar o strip antes do redirecionamento HTTP→HTTPS, para que o redirect preserve o URL público.

Confirmar os destinos:

```text
/camelatto-design/projetos/projeto-01/
  → LP:4321/camelatto-design/projetos/projeto-01/

/camelatto-design/admin/api/auth/login
  → Admin:3001/camelatto-design/admin/api/auth/login

/camelatto-design/api/v1/content
  → API:3000/v1/content
```

Não cadastrar o domínio inteiro `demos.jlacode.com.br` em cada aplicação como se todas atendessem `/`. Ele pode conter outros projetos; limitar as regras aos caminhos acima.

Em produção, manter o roteamento normal por subdomínio, sem strip de prefixo.

## 7. MySQL e ordem do primeiro deploy

### Preparar o banco

1. Criar ou selecionar o recurso MySQL no Coolify.
2. Provisionar o banco e um usuário próprio de QA.
3. Provisionar o banco e um usuário próprio de produção.
4. Conectar a API à rede do banco e configurar os respectivos `DB_*`.
5. Usar as credenciais do ambiente correto e conferir o nome antes de executar seed/migration.
6. Garantir backup antes de aplicar em um banco que já tenha dados.

As migrations atuais têm como referência MySQL 8.0.16+/8.4 e foram testadas localmente em MariaDB 12.3.3. Validar o MySQL real antes de promover a produção.

### Publicar primeiro a API

1. Configurar variáveis, storage, comandos, porta e domínio.
2. Fazer Deploy da API.
3. O Start Command da tabela executa `db:migrate` e só inicia o servidor se a migration concluir.
4. Conferir Runtime Logs e `/health/ready`.
5. No Terminal **do container da API**, entrar no diretório do projeto se necessário (normalmente `/app`) e executar:

```sh
bun run db:seed
bun run admin:user
```

O seed exige tabelas editoriais vazias na primeira carga, grava um marcador e preserva edições nas reaplicações. Em banco legado com conteúdo nas mesmas tabelas, reconciliar os dados antes; não limpar tabelas para forçar o seed.

`admin:user` solicita os dados do administrador sem exibir a senha. Não há senha padrão. As contas do admin antigo não são convertidas automaticamente.

A migration registra checksum e usa lock por banco. Não editar arquivos SQL já aplicados e não executar migration/seed na etapa de build da imagem.

### Publicar LP e admin

6. Verificar que `GET /v1/content` da API retorna 200 com conteúdo.
7. Publicar a LP com o build do ambiente.
8. Publicar o admin com o build do ambiente.
9. Validar os caminhos públicos e fazer login com a conta criada na API.
10. Editar um conteúdo de teste no QA, abrir a LP e confirmar atualização sem rebuild.

## 8. Storage persistente das imagens

Na aplicação **API** de cada ambiente, abrir Persistent Storage e montar um volume ou diretório com:

| Ambiente | Origem sugerida para Directory Mount no servidor | Destino no container |
| -------- | ------------------------------------------------ | -------------------- |
| QA       | `/srv/camelatto-design/qa/media`                 | `/data/media`        |
| Produção | `/srv/camelatto-design/prod/media`               | `/data/media`        |

Se usar volume gerenciado, escolher nomes distintos; o destino continua `/data/media`. Configurar `MEDIA_STORAGE_PATH=/data/media` na API.

O destino deve corresponder ao caminho usado pelo código; arquivos que ficam apenas no filesystem do container podem desaparecer em redeploys. [Storage no Coolify](https://coolify.io/docs/applications/configuration/persistent-storage), [Directory/bind mounts](https://coolify.io/docs/core/persistent-storage/storage-mounts/bind-mounts).

Conferir permissões com o usuário real do container (`id` no Terminal) e validar escrita no destino. Não assumir UID fixo.

Depois:

- Enviar uma imagem pelo admin.
- Abrir sua URL pública.
- Refazer o deploy da API.
- Confirmar que a mesma imagem continua acessível.
- Incluir banco e imagens no plano de backup.

Os arquivos antigos em `storage/` e `backups/` do admin não são transferidos automaticamente. Migrar os necessários antes de retirar uma instalação antiga.

## 9. Health checks

Configurar o check contra o processo **dentro do container**, sem depender do domínio público.

| Aplicação | Porta  | Caminho interno QA                   | Caminho interno produção |
| --------- | ------ | ------------------------------------ | ------------------------ |
| API       | `3000` | `/health/ready`                      | `/health/ready`          |
| Admin     | `3001` | `/camelatto-design/admin/api/health` | `/api/health`            |
| LP        | `4321` | `/camelatto-design/`                 | `/`                      |

Sugestão inicial: GET, HTTP, host `127.0.0.1`, intervalo 30 s, timeout 10 s, retries 3 e start period 90 s; ajustar ao tempo real de inicialização.

- API readiness verifica conexão MySQL, sem garantir que seed esteja aplicado.
- Admin health verifica o processo, sem consultar a API.
- LP home retorna 200 quando conseguiu carregar o conteúdo da API. Por isso, publicar a API e fazer seed antes de usar esse check na LP.
- A LP não possui um endpoint `/health` dedicado na implementação atual.

Os checks HTTP do Coolify precisam de curl ou wget na imagem. Se necessário, adicionar `RAILPACK_DEPLOY_APT_PACKAGES=curl` em Build e reconstruir. [Health checks do Coolify](https://coolify.io/docs/applications/configuration/health-checks).

O healthcheck usa os caminhos internos da tabela, enquanto os testes do próximo item usam URLs públicos.

## 10. Checklist de validação por ambiente

### QA

```sh
curl -fsS https://demos.jlacode.com.br/camelatto-design/api/health/ready
curl -fsS https://demos.jlacode.com.br/camelatto-design/api/v1/content
curl -fsS https://demos.jlacode.com.br/camelatto-design/admin/api/health
curl -fsS https://demos.jlacode.com.br/camelatto-design/ -o /dev/null
```

Abrir também:

- LP: `https://demos.jlacode.com.br/camelatto-design/`
- Admin: `https://demos.jlacode.com.br/camelatto-design/admin/login`
- Docs da API: `https://demos.jlacode.com.br/camelatto-design/api/v1/docs`

### Produção

```sh
curl -fsS https://api.ericacamelatto.com.br/health/ready
curl -fsS https://api.ericacamelatto.com.br/v1/content
curl -fsS https://admin.ericacamelatto.com.br/api/health
curl -fsS https://ericacamelatto.com.br/ -o /dev/null
```

### Fluxo funcional

- [ ] CSS, fontes e imagens carregam no QA e em produção.
- [ ] Home e uma página de projeto retornam conteúdo e SEO no HTML.
- [ ] QA e admin enviam `noindex`.
- [ ] Produção usa canonical em `ericacamelatto.com.br`, sem prefixo QA.
- [ ] Login e logout funcionam; token não aparece em localStorage.
- [ ] Usuário editor não acessa gestão de usuários, configurações principais ou auditoria.
- [ ] Salvar seção atualiza a LP na próxima visita.
- [ ] Rascunhos ficam ocultos.
- [ ] Upload e persistência após redeploy foram confirmados.
- [ ] SMTP real foi testado se a recuperação for habilitada.
- [ ] Não há acesso cruzado entre bancos/volumes de QA e produção.

## 11. Deploy automático, atualizações e rollback

Depois da primeira validação, habilitar deploy on push na aplicação/branch correspondente. Com a integração GitHub App, o Coolify recebe os eventos da integração; não é necessário um workflow GitHub Actions apenas para disparar esse fluxo. [Deploy automático](https://coolify.io/docs/applications/deployments/automatic-deployments).

Para mudanças que alterem o contrato entre projetos, publicar primeiro uma API compatível com a versão atual, depois os consumidores. Alterações feitas pelo admin no banco não exigem push ou deploy da LP.

Antes de migrations em produção, manter backup verificável. Rollback da imagem no Coolify não reverte o banco ou os uploads; usar migration corretiva/restore planejado quando houver mudança de dados incompatível.

Agendar na API, por exemplo diariamente:

```sh
bun run admin:cleanup
```

Esse comando remove registros expirados de sessão, recuperação e rate limit. Não executar `test:db` ou `test:admin` contra o banco de hospedagem como parte do deploy.

## 12. Problemas comuns

| Sintoma                                               | O que conferir                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| 502 / serviço sem resposta                            | `HOST=0.0.0.0`, porta interna, Runtime Logs e processo start       |
| Coolify indica unhealthy                              | Caminho interno, curl/wget, start period e dependências do check   |
| API não inicia                                        | Host/credenciais/permissões MySQL e erro da migration no log       |
| `/api/v1/content` cai na LP                           | Prioridades/regras dos routers QA                                  |
| LP/admin recebem 404 em CSS ou login                  | Prefixo removido pelo proxy ou build do ambiente incorreto         |
| API responde 404 somente no QA                        | Proxy não removeu `/camelatto-design/api`                          |
| LP retorna 503                                        | API acessível, seed aplicado e resposta `/v1/content` válida       |
| Login retorna 403                                     | `ADMIN_ORIGIN` exatamente igual à origem do navegador              |
| Cookie não funciona em produção                       | HTTPS e origem do admin; revisar prefixo/caminho do cookie         |
| Imagem aparece no admin mas não abre na LP            | `APP_URL` pública e router `/v1/media` acessível                   |
| Imagem some após redeploy                             | Volume da API e `MEDIA_STORAGE_PATH` apontando ao mesmo destino    |
| Build não encontra TypeScript ou ferramenta           | Dependências de desenvolvimento instaladas na fase de build        |
| Runtime não encontra Bun/Node ou `scripts/migrate.ts` | Ferramentas e arquivos presentes na imagem final                   |
| Mudança no URL não aparece após restart               | `SITE_ENV` e `NEXT_PUBLIC_ADMIN_BASE_PATH` exigem rebuild          |
| Build tenta publicar como site estático               | Output type Web application / Dynamic e Start Command configurados |

Os exemplos de labels, permissões de volume, DNS e rede devem ser validados na sua instância. O guia não pressupõe nomes de containers, UUIDs de recursos ou aliases internos que não foram informados.
