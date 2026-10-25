# URL Shortener - API de encurtamento de URLs

Projeto desenvolvido durante a imersão de Arquitetura De Software com codes curtos gerados por um contador atômico no Redis (`INCR`) e ofuscados em Base62 via Hashids. Os mapeamentos ficam no MongoDB. A API é servida com Fastify e a infraestrutura na AWS é definida com SST.

Ambiente de produção: [https://bitly.lira-code.online](https://bitly.lira-code.online)

## Visualização da API
<img width="1893" height="893" alt="image" src="https://github.com/user-attachments/assets/85d97157-0649-470c-8e99-0d49d50bc820" />
<img width="1888" height="977" alt="image" src="https://github.com/user-attachments/assets/97bc9121-c7cf-4981-a46f-2b42ab7bc26d" />


## Demonstração
<img width="1877" height="811" alt="Captura de tela 2026-10-20 170000" src="https://github.com/user-attachments/assets/ffd74ed7-eaa0-417c-b00c-557dc6909e82" />
<img width="1655" height="739" alt="image" src="https://github.com/user-attachments/assets/9d4f5d4b-5742-4cc1-bf28-c8ea7e873584" />


<img width="1618" height="842" alt="Captura de tela 2026-10-20 170400" src="https://github.com/user-attachments/assets/6bd08b2f-6f66-47fb-91c8-e863b5170dc4" />

<img width="1521" height="423" alt="image" src="https://github.com/user-attachments/assets/e9f0676e-27e5-4331-81f9-454f91b68c5a" />
<img width="1557" height="772" alt="image" src="https://github.com/user-attachments/assets/4cf8ce15-997d-49a6-863e-b6dae541d8ed" />



Documentação interativa (Scalar): [https://bitly.lira-code.online/docs](https://bitly.lira-code.online/docs)

## Como funciona

1. `POST /api/shorten` recebe uma URL `http`/`https`.
2. O Redis incrementa a chave `url:counter` e devolve um ID numérico único.
3. Esse ID é convertido em um código curto Base62 (Hashids + salt).
4. O documento `{ _id, shortCode, longUrl, createdAt }` é gravado no MongoDB.
5. `GET /:shortCode` decodifica o código, busca o documento no MongoDB e responde com **301** para a URL original.

O Redis guarda apenas o contador. Os links ficam no MongoDB, e a leitura (`GET`) não passa pelo Redis.

O contador começa em `238328` (62³) para que os primeiros codes já tenham comprimento mínimo razoável. Na prática, com o Hashids, os codes começam com 5 caracteres.

## Decisões de projeto

- **Um código novo a cada pedido.** A mesma URL longa gera códigos curtos diferentes, como o bit.ly faz. Isso evita uma consulta extra ao banco a cada escrita.
- **Redirecionamento 301 (permanente).** O navegador guarda o redirecionamento em cache e, nos próximos acessos, nem chega ao servidor.
- **Sem cache na leitura.** O `GET` busca direto no MongoDB.
- **Ofuscação, não criptografia.** O Hashids embaralha os codes para que não saiam em sequência, mas não é um recurso de segurança.

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
| Local | Docker Compose (MongoDB + Redis), pnpm |

## Pré-requisitos

- [Node.js 24](https://nodejs.org/)
- [pnpm 12.6.0](https://pnpm.io/) (o projeto usa `packageManager` + Corepack)
- [Docker](https://www.docker.com/) e Docker Compose (MongoDB e Redis locais)
- Conta AWS, AWS CLI configurada (`aws configure`) e [SST](https://sst.dev/) para deploy / `sst dev`

## Como a configuração funciona

O app tem dois níveis de configuração:

1. **Secrets do SST:** é onde os valores ficam guardados. O [`sst.config.ts`](sst.config.ts) declara cada secret e o comando `sst secret set` preenche o valor.
2. **`src/lib/env.ts`:** lê os secrets (`Resource.*`), valida cada valor com Zod, aplica os padrões e entrega o objeto `env` com as variáveis (`BASE_URL`, `MONGO_URL` etc.) que o resto do código usa. Se algum valor for inválido, o app não sobe e mostra `Invalid environment variables`.

O arquivo `.env` **não é lido pelo app**: não existe `dotenv` nem `process.env` no código. Ele vem de uma fase anterior do projeto, antes do SST, e está no `.gitignore`. O [`.env.example`](.env.example) serve só como referência dos valores que você coloca nos secrets.

### Do secret até o código

| Secret (SST) | Variável em `env.ts` | Validação e padrão no schema | Onde é usada |
| --- | --- | --- | --- |
| `MongoUrl` | `MONGO_URL` | texto não vazio | `mongo.ts` (conexão) |
| `HashIdsSalt` | `HASHIDS_SALT` | texto não vazio | `hashids.ts` (embaralha os codes) |
| `BaseUrl` | `BASE_URL` | URL válida; a barra final é removida | `routes/urls.ts` (monta o `shortUrl`) |
| `Port` | `PORT` | inteiro positivo (padrão do schema: `3333`) | `index.ts` (porta e documentação) |
| `NodeEnv` | `NODE_ENV` | `development`, `production` ou `test` | `index.ts` (formato dos logs) |
| `MongoMaxPoolSize` | `MONGO_MAX_POOL_SIZE` | inteiro positivo (padrão: `100`) | `mongo.ts` (pool de conexões) |
| `HashIdsMinLength` | `HASHIDS_MIN_LENGTH` | inteiro maior ou igual a 0 (padrão: `7`) | **não é usada**: `hashids.ts` usa comprimento mínimo `0` |

Duas variáveis do schema não recebem valor de nenhum secret e ficam sempre no padrão:

- `MONGO_DB_NAME`: `url_shortener` (usada em `mongo.ts`).
- `HOST`: `0.0.0.0` (não é usada: o `index.ts` fixa `0.0.0.0` ao subir o servidor).

### Valor de cada secret por ambiente

| Secret | Local (`sst dev`) | Produção |
| --- | --- | --- |
| `MongoUrl` | `mongodb://localhost:27017` (MongoDB do Docker Compose) ou a connection string do Atlas | connection string do MongoDB Atlas |
| `HashIdsSalt` | string longa e aleatória | string longa e aleatória (**não mude depois**) |
| `BaseUrl` | `http://localhost:8080` (já é o padrão do `sst.config.ts`) | `https://bitly.lira-code.online` |
| `NodeEnv` | `development` (padrão) | `production` |
| `Port` | `8080` (padrão) | `8080` (o load balancer encaminha para essa porta) |
| `MongoMaxPoolSize` | `100` (padrão) | `100` (padrão) |
| `HashIdsMinLength` | `0` (padrão, não é aplicada) | `0` (padrão, não é aplicada) |

Os valores padrão dos secrets estão no `sst.config.ts`. `MongoUrl` e `HashIdsSalt` têm só um placeholder e **precisam ser definidos**.

## Começando

### 1. Clonar e instalar

```bash
git clone https://github.com/Grid2109/imersao_ba-url-shortener.git
cd imersao_ba-url-shortener
pnpm install
```

### 2. Subir o MongoDB e o Redis locais

```bash
docker compose up -d
```

O `docker-compose.yml` também sobe um Redis, mas o app não o usa: o contador vem sempre do recurso `MyRedis` do SST (veja a seção de infraestrutura).

### 3. Configurar a AWS CLI

O SST usa as credenciais da AWS CLI para criar e acessar os recursos.

```bash
aws configure
aws sts get-caller-identity   # confirma a conta e o usuário
```

### 4. Definir os secrets

Gere um salt para o Hashids (por exemplo, 64 caracteres hexadecimais) e defina os dois secrets obrigatórios:

```bash
openssl rand -hex 32
pnpm exec sst secret set MongoUrl "mongodb://localhost:27017"
pnpm exec sst secret set HashIdsSalt "<o salt gerado acima>"
```

Os demais secrets já têm um padrão que serve para o ambiente local (veja a tabela acima).

**Sobre o `--stage`:** sem a flag, o comando vale para o seu **stage pessoal**, que por padrão é o nome de usuário da máquina (fica guardado em `.sst/stage`) e é o stage usado pelo `sst dev`. Se você rodar o `sst dev` com outro stage (`pnpm exec sst dev --stage dev`), defina os secrets com o mesmo (`--stage dev`). Os secrets valem só para o stage em que foram definidos. Para repetir um valor em todos os stages da mesma conta, use `--fallback`. Para listar: `pnpm exec sst secret list`.

> **Atenção:** nunca coloque connection strings, senhas ou o salt real no repositório. O `HashIdsSalt` não pode mudar depois que existem codes em produção, senão os links antigos deixam de funcionar.

### 5. Rodar em desenvolvimento

```bash
pnpm exec sst dev
```

Em `sst dev`, o serviço não é publicado: o SST executa o `pnpm run dev` (`tsx --watch src/index.ts`) na sua máquina (aba `MyService`) e injeta os secrets. A API fica em `http://localhost:8080`, com a documentação em `/docs`. O `MyRedis` é criado na AWS (ElastiCache), então há custo e um tempo de espera na primeira vez. Para apagar os recursos do seu stage pessoal: `pnpm exec sst remove`.

> **Problema conhecido:** hoje o app local não consegue conectar ao `MyRedis` e mostra `ClusterAllFailedError: Failed to refresh slots cache`. A causa provável é que o ElastiCache fica dentro de uma VPC e o `MyVpc` não tem `bastion` (o SST só abre o túnel até a VPC quando o `bastion` está ativado). Enquanto isso não for resolvido, o app local não consegue usar o contador.

Scripts extras:

```bash
pnpm run typecheck   # tsc --noEmit
pnpm run build       # gera dist/
pnpm start           # node dist/index.js
```

Logs em desenvolvimento usam `pino-pretty`.

### 6. Produção

Defina os secrets do stage `production` e faça o deploy:

```bash
pnpm exec sst secret set MongoUrl "<connection string do Atlas>" --stage production
pnpm exec sst secret set HashIdsSalt "<string longa e aleatória>" --stage production
pnpm exec sst secret set BaseUrl "https://bitly.lira-code.online" --stage production
pnpm exec sst secret set NodeEnv "production" --stage production
pnpm exec sst deploy --stage production
```

Se você alterar um secret fora do `sst dev`, é preciso rodar o `sst deploy` de novo para aplicar o novo valor.

Como pegar a connection string do Atlas: no cluster, clique em **Connect**, escolha **Drivers** e copie a string, trocando `<username>` e `<password>` pelos seus dados. Libere o acesso em **Network Access**.

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
  "shortCode": "WLEKJ",
  "shortUrl": "http://localhost:8080/WLEKJ",
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
- **Redis** em modo cluster (`MyRedis`): ElastiCache Redis OSS 7.1, `cache.t4g.micro`, 1 fragmento e 1 nó, com criptografia em trânsito e em repouso
- **ECS Cluster** + **Service** (`MyService`) com capacidade Fargate (base 1) e Spot
- **Load balancer** no domínio `bitly.lira-code.online` (HTTP 80 e HTTPS 443 → container 8080)
- Secrets: `MongoUrl`, `HashIdsSalt`, `HashIdsMinLength`, `Port`, `BaseUrl`, `NodeEnv`, `MongoMaxPoolSize`

O stage `production` está com `protect` e `removal: retain`.

```bash
pnpm exec sst deploy --stage production
```

O [`Dockerfile`](Dockerfile) usa Node 24, Corepack/pnpm, `pnpm run build` e `node dist/index.js` na porta `8080`.

### Limitações conhecidas

- O contador do Redis é o ponto frágil: se ele for perdido ou voltar atrás, o mesmo ID pode ser entregue de novo. O `_id` único do MongoDB impede que um link sobrescreva outro, mas a gravação duplicada falha.
- Em produção o Redis roda com 1 nó e sem réplica (Multi-AZ desabilitado). Para um ambiente mais robusto, o caminho é usar mais nós com réplica e backups automáticos.
- O `redis.ts` usa o cliente em modo cluster com TLS, pensado para o ElastiCache. Para usar um Redis local em `sst dev` (opção `dev` do `sst.aws.Redis`), seria preciso ajustar esse arquivo.

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
docker-compose.yml   # Mongo 4.4 + Redis 8 (o app só usa o Mongo)
Dockerfile
```

## Licença

ISC.
