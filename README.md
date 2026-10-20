# URL Shortener

API de encurtamento de URLs, com codes curtos gerados por um contador atômico no Redis (`INCR`) e ofuscados em Base62 via Hashids. Os mapeamentos ficam no MongoDB. A API é servida com Fastify e a infraestrutura na AWS é definida com SST.

Ambiente de produção: [https://bitly.lira-code.online](https://bitly.lira-code.online)

Documentação interativa (Scalar): [https://bitly.lira-code.online/docs](https://bitly.lira-code.online/docs)

## Como funciona

1. `POST /api/shorten` recebe uma URL `http`/`https`.
2. O Redis incrementa a chave `url:counter` e devolve um ID numérico único.
3. Esse ID é convertido em um código curto Base62 (Hashids + salt).
4. O documento `{ _id, shortCode, longUrl, createdAt }` é gravado no MongoDB.
5. `GET /:shortCode` decodifica o código, busca o documento e responde com **301** para a URL original.

O contador começa em `238328` para que os primeiros codes já tenham comprimento mínimo razoável em Base62.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Runtime | Node.js 24, TypeScript (ESM) |
| HTTP | Fastify 5, Zod, `@fastify/cors` |
| Docs | OpenAPI (`@fastify/swagger`) + Scalar (`/docs`) |
| Persistência | MongoDB |
| Contador | Redis (cluster em produção via SST) |
| Codes | Hashids, alfabeto Base62 |
| Infra | SST 4, AWS VPC, ElastiCache Redis, ECS Fargate/Spot, ALB + HTTPS |
| Local | Docker Compose (Mongo + Redis), pnpm |

## Pré-requisitos

- [Node.js 24](https://nodejs.org/)
- [pnpm 12.6.0](https://pnpm.io/) (o projeto usa `packageManager` + Corepack)
- [Docker](https://www.docker.com/) e Docker Compose (Mongo e Redis locais)
- Conta AWS e [SST](https://sst.dev/) para deploy / `sst dev`

## Começando

```bash
git clone https://github.com/Grid2109/imersao_ba-arq-soft-ia-url-shortener.git
cd imersao_ba-arq-soft-ia-url-shortener
pnpm install
```

Suba Mongo e Redis:

```bash
docker compose up -d
```

Copie as variáveis de exemplo:

```bash
cp .env.example .env
```

Ajuste principalmente:

- `HASHIDS_SALT` — string longa e aleatória; **não mude depois de gerar codes em produção**
- `BASE_URL` — origem usada nas URLs curtas retornadas pela API
- `MONGO_URL` — conexão do MongoDB

O app lê secrets e o Redis pelo SST (`Resource.*` em `src/lib/env.ts` e `src/lib/redis.ts`). O fluxo local previsto é:

```bash
pnpm exec sst dev
```

Isso sobe o serviço com `pnpm run dev` (`tsx --watch src/index.ts`) e injeta os recursos linkados no `sst.config.ts`.

Scripts extras:

```bash
pnpm run typecheck   # tsc --noEmit
pnpm run build       # gera dist/
pnpm start           # node dist/index.js
```

A API sobe em `0.0.0.0` na porta configurada (padrão local no exemplo: `8080`). Logs em desenvolvimento usam `pino-pretty`.

## Variáveis de ambiente

Referência em [`.env.example`](.env.example). Em produção, os valores equivalentes são `sst.Secret` no [`sst.config.ts`](sst.config.ts).

| Variável | Descrição |
| --- | --- |
| `NODE_ENV` | `development`, `production` ou `test` |
| `HOST` | Host HTTP (padrão `0.0.0.0`) |
| `PORT` | Porta HTTP |
| `BASE_URL` | Prefixo público das URLs curtas (sem barra no final) |
| `MONGO_URL` | Connection string do MongoDB |
| `MONGO_DB_NAME` | Database (padrão `url_shortener`) |
| `MONGO_MAX_POOL_SIZE` | Pool do driver (padrão `100`) |
| `REDIS_URL` | Redis local (Compose); em AWS o cluster vem do recurso SST `MyRedis` |
| `HASHIDS_SALT` | Salt do Hashids |
| `HASHIDS_MIN_LENGTH` | Comprimento mínimo do code (secret SST; padrão no schema: `7`) |

## API

CORS liberado para `http://localhost:3000` e `https://bitly-app.lira-code.online`.

### Health

```http
GET /
```

```json
{ "message": "Hello World" }
```

### Encurtar

```http
POST /api/shorten
Content-Type: application/json
```

```json
{ "url": "https://exemplo.com/caminho-muito-longo" }
```

Resposta `201`:

```json
{
  "shortCode": "abc123X",
  "shortUrl": "http://localhost:8080/abc123X",
  "longUrl": "https://exemplo.com/caminho-muito-longo"
}
```

A URL precisa ser `http` ou `https`, no máximo 2048 caracteres. Erros de validação retornam `400` com `code: "VALIDATION_ERROR"`.

### Redirecionar

```http
GET /:shortCode
```

- `301` com header `Location` apontando para a URL original
- `404` se o code for inválido ou não existir (`code: "NOT_FOUND"`)

### Documentação

| Recurso | Caminho |
| --- | --- |
| Scalar UI | `/docs` |
| OpenAPI JSON | `/swagger.json` |

## Infraestrutura (SST / AWS)

[`sst.config.ts`](sst.config.ts) define o app `url-shortener` com `home: "aws"`:

- **VPC** (`MyVpc`)
- **Redis** em cluster (`MyRedis`, 1 node)
- **ECS Cluster** + **Service** (`MyService`) com capacidade Fargate (base 1) e Spot
- **Load balancer** no domínio `bitly.lira-code.online` (HTTP 80 e HTTPS 443 → container 8080)
- Secrets: `MongoUrl`, `HashIdsSalt`, `HashIdsMinLength`, `Port`, `BaseUrl`, `NodeEnv`, `MongoMaxPoolSize`

O stage `production` está com `protect` e `removal: retain`.

```bash
pnpm exec sst deploy --stage production
```

O [`Dockerfile`](Dockerfile) usa Node 24, Corepack/pnpm, `pnpm run build` e `node dist/index.js` na porta `8080`.

## Estrutura

```
src/
  index.ts           # Fastify, Swagger, CORS, health, shutdown
  routes/urls.ts     # POST /api/shorten e GET /:shortCode
  schemas/index.ts   # Zod (body, params, erros)
  lib/
    env.ts           # validação via SST Resource + Zod
    mongo.ts         # client e collection urls
    redis.ts         # cluster Redis + contador
    hashids.ts       # encode/decode Base62
sst.config.ts        # infra AWS
docker-compose.yml   # Mongo 4.4 + Redis 8 (AOF)
Dockerfile
```

## Licença

ISC.
