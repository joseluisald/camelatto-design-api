# Configuração por ambiente — LP, Admin e API

Este é o guia de valores para os três projetos. O passo a passo no Coolify está em [DEPLOY-COOLIFY-RAILPACK.md](DEPLOY-COOLIFY-RAILPACK.md).

Baseado no código local em 05/11/2026. Os exemplos não alteram o Coolify, o GitHub, o DNS ou o banco remoto.

## 1. URLs e processos

| Serviço | Desenvolvimento         | QA                                                    | Produção                              |
| ------- | ----------------------- | ----------------------------------------------------- | ------------------------------------- |
| LP      | `http://localhost:4321` | `https://demos.jlacode.com.br/camelatto-design`       | `https://ericacamelatto.com.br`       |
| Admin   | `http://localhost:3001` | `https://demos.jlacode.com.br/camelatto-design/admin` | `https://admin.ericacamelatto.com.br` |
| API     | `http://localhost:3000` | `https://demos.jlacode.com.br/camelatto-design/api`   | `https://api.ericacamelatto.com.br`   |

| Projeto local            | Tecnologia | Processo em hospedagem | Porta interna |
| ------------------------ | ---------- | ---------------------- | ------------- |
| `camellato-design`       | Astro SSR  | Node, `bun run start`  | `4321`        |
| `camelatto-design-admin` | Next.js    | Node, `npm start`      | `3001`        |
| `camelatto-design-api`   | Elysia/Bun | Bun, `bun run start`   | `3000`        |

A grafia da pasta local da LP é `camellato-design`; o caminho público é `camelatto-design`. Use o nome real de cada repositório no GitHub.

LP e admin acessam a API pelo servidor. Somente a API acessa o MySQL e grava uploads. As imagens usam URLs públicas da API, pois também são abertas diretamente pelo navegador.

No Coolify, criar três aplicações por ambiente: seis aplicações no total. QA e produção devem ter bancos, usuários e storage separados. Um mesmo servidor MySQL pode hospedar os dois bancos com permissões separadas.

## 2. Como cadastrar variáveis

Localmente, usar um `.env` privado em cada projeto. Na hospedagem, cadastrar as variáveis na aplicação correspondente do Coolify.

As marcações **Build** e **Runtime** são independentes: Build disponibiliza o valor na geração da imagem; Runtime disponibiliza no container. No Coolify, confira essas flags mesmo ao colar blocos no modo Developer. [Documentação de variáveis do Coolify](https://coolify.io/docs/applications/configuration/environment-variables).

As senhas e os endereços internos abaixo são exemplos a substituir. Não colocar credenciais reais nos documentos ou no GitHub.

## 3. Desenvolvimento local

### API

```dotenv
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=seu_usuario_local
DB_PASSWORD=sua_senha_local
DB_NAME=seu_banco_local
APP_URL=http://localhost:3000
PUBLIC_API_PATH=
CORS_ORIGINS=http://localhost:4321,http://localhost:3001
ADMIN_URL=http://localhost:3001
MEDIA_STORAGE_PATH=storage/media
```

Usar o banco local já configurado, ou provisionar outro antes de executar:

```sh
bun install --frozen-lockfile
bun run db:migrate
bun run db:seed
bun run admin:user
bun run dev
```

Migration, seed e criação do usuário não precisam ser repetidos a cada início. A criação do administrador recusa e-mail duplicado; o seed preserva conteúdo já importado.

### LP

```dotenv
SITE_ENV=development
API_URL=http://127.0.0.1:3000
API_TIMEOUT_MS=5000
HOST=127.0.0.1
PORT=4321
```

```sh
bun install --frozen-lockfile
bun run dev
```

### Admin

```dotenv
API_URL=http://127.0.0.1:3000
ADMIN_ORIGIN=http://localhost:3001
LP_URL=http://localhost:4321
NEXT_PUBLIC_ADMIN_BASE_PATH=
HOST=127.0.0.1
PORT=3001
```

```sh
npm ci
npm run dev
```

Abrir o admin pelo endereço de `ADMIN_ORIGIN`. `http://127.0.0.1:3001` e `http://localhost:3001` são origens diferentes; a verificação de origem nas escritas usa comparação exata.

## 4. QA

### API — aplicação de QA

Cadastrar **em Runtime**:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
DB_HOST=HOST_INTERNO_REAL_DO_MYSQL
DB_PORT=3306
DB_USER=camelatto_design_qa
DB_PASSWORD=SUBSTITUA_PELA_SENHA_DO_BANCO_QA
DB_NAME=camelatto_design_qa
APP_URL=https://demos.jlacode.com.br/camelatto-design/api
PUBLIC_API_PATH=/camelatto-design/api
CORS_ORIGINS=https://demos.jlacode.com.br
ADMIN_URL=https://demos.jlacode.com.br/camelatto-design/admin
MEDIA_STORAGE_PATH=/data/media
```

Os nomes de banco/usuário são uma sugestão; usar os valores que realmente foram provisionados. `DB_HOST` é o host interno informado pelo recurso MySQL na rede acessível pela API.

Em containers distintos, `localhost` aponta para o próprio container. A API não deve usar `localhost` para encontrar outro container MySQL.

### LP — aplicação de QA

| Variável         | Valor                                               | Build          | Runtime           |
| ---------------- | --------------------------------------------------- | -------------- | ----------------- |
| `SITE_ENV`       | `qa`                                                | Sim            | Sim, manter igual |
| `API_URL`        | `https://demos.jlacode.com.br/camelatto-design/api` | Não necessário | Sim               |
| `API_TIMEOUT_MS` | `5000`                                              | Não necessário | Sim               |
| `HOST`           | `0.0.0.0`                                           | Não necessário | Sim               |
| `PORT`           | `4321`                                              | Não necessário | Sim               |
| `NODE_ENV`       | `production`                                        | Sim            | Sim               |

```dotenv
NODE_ENV=production
SITE_ENV=qa
API_URL=https://demos.jlacode.com.br/camelatto-design/api
API_TIMEOUT_MS=5000
HOST=0.0.0.0
PORT=4321
```

Build: `bun run build:qa`. Start: `bun run start`.

O resultado usa o prefixo `/camelatto-design/`, canonical no domínio de demos e `noindex, nofollow`, inclusive em build otimizado.

### Admin — aplicação de QA

| Variável                      | Valor                                               | Build          | Runtime           |
| ----------------------------- | --------------------------------------------------- | -------------- | ----------------- |
| `NEXT_PUBLIC_ADMIN_BASE_PATH` | `/camelatto-design/admin`                           | Sim            | Sim, manter igual |
| `API_URL`                     | `https://demos.jlacode.com.br/camelatto-design/api` | Não necessário | Sim               |
| `ADMIN_ORIGIN`                | `https://demos.jlacode.com.br`                      | Não necessário | Sim               |
| `LP_URL`                      | `https://demos.jlacode.com.br/camelatto-design/`    | Não necessário | Sim               |
| `HOST`                        | `0.0.0.0`                                           | Não necessário | Sim               |
| `PORT`                        | `3001`                                              | Não necessário | Sim               |
| `NODE_ENV`                    | `production`                                        | Sim            | Sim               |

```dotenv
NODE_ENV=production
NEXT_PUBLIC_ADMIN_BASE_PATH=/camelatto-design/admin
API_URL=https://demos.jlacode.com.br/camelatto-design/api
ADMIN_ORIGIN=https://demos.jlacode.com.br
LP_URL=https://demos.jlacode.com.br/camelatto-design/
HOST=0.0.0.0
PORT=3001
```

Build: `npm run build:qa`. Start: `npm start`.

`ADMIN_ORIGIN` recebe somente protocolo e domínio, sem o caminho `/camelatto-design/admin` e sem barra final. O prefixo pertence a `NEXT_PUBLIC_ADMIN_BASE_PATH`. A configuração fica em `next.config.mjs`.

## 5. Produção

### API — aplicação de produção

Cadastrar **em Runtime**:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
DB_HOST=HOST_INTERNO_REAL_DO_MYSQL
DB_PORT=3306
DB_USER=camelatto_design_prod
DB_PASSWORD=SUBSTITUA_PELA_SENHA_DO_BANCO_PROD
DB_NAME=camelatto_design_prod
APP_URL=https://api.ericacamelatto.com.br
PUBLIC_API_PATH=
CORS_ORIGINS=https://ericacamelatto.com.br,https://admin.ericacamelatto.com.br
ADMIN_URL=https://admin.ericacamelatto.com.br
MEDIA_STORAGE_PATH=/data/media
```

`PUBLIC_API_PATH` deve ficar vazio. Se a aplicação foi clonada do QA, apagar explicitamente o valor anterior.

### LP — aplicação de produção

```dotenv
NODE_ENV=production
SITE_ENV=production
API_URL=https://api.ericacamelatto.com.br
API_TIMEOUT_MS=5000
HOST=0.0.0.0
PORT=4321
```

Marcar `SITE_ENV` e `NODE_ENV` em **Build e Runtime**. As demais variáveis são de **Runtime**.

Build: `bun run build:prod`. Start: `bun run start`.

O resultado usa a raiz do domínio e os metadados de indexação salvos no banco. Para indexar, conferir que o SEO está com `index, follow`.

### Admin — aplicação de produção

```dotenv
NODE_ENV=production
NEXT_PUBLIC_ADMIN_BASE_PATH=
API_URL=https://api.ericacamelatto.com.br
ADMIN_ORIGIN=https://admin.ericacamelatto.com.br
LP_URL=https://ericacamelatto.com.br/
HOST=0.0.0.0
PORT=3001
```

Marcar `NEXT_PUBLIC_ADMIN_BASE_PATH` e `NODE_ENV` em **Build e Runtime**. As demais variáveis são de **Runtime**.

Build: `npm run build:prod`. Start: `npm start`.

O prefixo deve ficar vazio no build e no runtime. O admin sempre usa `noindex`.

## 6. URL pública e conexão interna da API

Os exemplos anteriores usam URLs públicas, dispensando a descoberta de um alias interno. Eles exigem que o domínio/proxy da API já esteja funcionando e seja alcançável pelos containers.

Se LP, admin e API estiverem na mesma rede Docker, pode-se substituir **somente `API_URL` da LP e do admin** por:

```dotenv
API_URL=http://ALIAS_INTERNO_REAL_DA_API:3000
```

Descobrir o alias estável na configuração de rede do Coolify; o nome de exibição da aplicação não garante um nome DNS. Confirmar resolução e conectividade antes de usar.

A conexão interna acessa diretamente `/v1/...`, sem o prefixo do proxy QA. Mesmo com essa conexão interna:

- `APP_URL` da API continua sendo a URL pública para formar links de imagens.
- `PUBLIC_API_PATH` continua sendo `/camelatto-design/api` no QA para links da documentação.
- `ADMIN_URL` continua sendo a URL pública do admin para os links de recuperação.
- `ADMIN_ORIGIN` continua sendo a origem usada pelo navegador.
- `API_URL` termina antes de `/v1`, tanto no acesso público como no interno.

## 7. Roteamento obrigatório no QA

| URL recebida pelo proxy                  | Caminho que o processo deve receber             |
| ---------------------------------------- | ----------------------------------------------- |
| `/camelatto-design/`                     | LP: `/camelatto-design/`                        |
| `/camelatto-design/projetos/projeto-01/` | LP: `/camelatto-design/projetos/projeto-01/`    |
| `/camelatto-design/admin/login`          | Admin: `/camelatto-design/admin/login`          |
| `/camelatto-design/admin/api/auth/login` | Admin: `/camelatto-design/admin/api/auth/login` |
| `/camelatto-design/api/v1/content`       | API: `/v1/content`                              |
| `/camelatto-design/api/health/ready`     | API: `/health/ready`                            |

Preservar os prefixos da LP e do admin; remover apenas `/camelatto-design/api` ao encaminhar à API. Dar prioridade às rotas específicas da API e do admin sobre a rota da LP. Exemplos Traefik estão no documento de deploy.

Em produção, os três serviços usam a raiz de seus respectivos domínios, sem remoção de prefixos.

## 8. SMTP, autenticação e arquivos

### Recuperação de senha — somente na API

Adicionar **em Runtime**, conforme o provedor:

```dotenv
SMTP_HOST=smtp.seu-provedor.com
SMTP_PORT=587
SMTP_USER=SEU_USUARIO_SMTP
SMTP_PASSWORD=SUA_SENHA_SMTP
SMTP_FROM=Camelatto Design <contato@ericacamelatto.com.br>
```

Para TLS implícito, usar `SMTP_PORT=465`; usar `587` se for a porta fornecida para STARTTLS. O remetente deve ser aceito pelo provedor. Sem SMTP configurado, a recuperação fica indisponível na interface.

No Coolify, cadastrar senhas como segredo e conferir a opção literal quando contiverem `$`, para preservar o valor. Não colocar SMTP na LP ou no admin.

### Acesso ao painel

Criar o administrador no **terminal do container da API do ambiente correto**:

```sh
bun run admin:user
```

Não há senha padrão, cadastro público ou migração automática das contas do backend antigo. A senha é digitada sem eco. A sessão do painel é guardada em cookie HttpOnly, com `Secure` no HTTPS.

`JWT_SECRET` não é necessário para esse login: a autenticação atual usa sessões opacas revogáveis. `DATA_ENCRYPTION_KEY` e o fallback `JWT_SECRET` pertencem ao utilitário de criptografia, sem uso no fluxo atual de LP/admin. As variáveis legadas de Gemini, demo, retenção e `FRONTEND_URL` também não são exigidas pelos fluxos descritos aqui.

### Storage e banco

Na API, montar uma pasta persistente com destino `/data/media`; o valor deve coincidir com `MEDIA_STORAGE_PATH`. Usar volumes/pastas diferentes para QA e produção.

LP e admin não precisam de montagem de uploads ou acesso MySQL. No container, o host deve ser `0.0.0.0` para o proxy conseguir alcançar o processo.

## 9. O que exige rebuild

| Alteração                                                    | Ação                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| Conteúdo, FAQ, SEO ou publicação de projeto no admin         | Aparece na próxima requisição SSR; sem rebuild            |
| `SITE_ENV` da LP                                             | Rebuild e redeploy da LP                                  |
| `NEXT_PUBLIC_ADMIN_BASE_PATH` do admin                       | Rebuild e redeploy do admin                               |
| `API_URL`, `ADMIN_ORIGIN`, `APP_URL`, SMTP ou credenciais DB | Atualizar Runtime e recriar/reiniciar o container afetado |
| Código, dependências, componentes ou assets                  | Novo build/deploy do projeto alterado                     |
| Migrations novas                                             | Aplicar na API conforme o fluxo de deploy                 |

## 10. Checklist de configuração

- [ ] Cada aplicação tem as variáveis do próprio ambiente.
- [ ] QA e produção usam bancos, contas e storage separados.
- [ ] Host dos processos em container é `0.0.0.0`.
- [ ] LP/admin têm `API_URL` alcançável, sem `/v1` no final.
- [ ] API tem `APP_URL` pública, inclusive para links de imagens.
- [ ] `ADMIN_ORIGIN` e CORS contêm origens, sem caminhos.
- [ ] Prefixos de QA são preservados/removidos nos serviços corretos.
- [ ] Produção tem os prefixos vazios.
- [ ] Migration e carga inicial aplicadas no banco correto.
- [ ] Primeiro administrador criado na API.
- [ ] Volume da API montado em `/data/media`.
- [ ] QA não é indexado; admin não é indexado em nenhum ambiente.
