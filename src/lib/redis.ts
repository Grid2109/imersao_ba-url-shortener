import { Redis, Cluster } from "ioredis";
import { Resource } from "sst";

const isLocal = ["localhost", "127.0.0.1"].includes(Resource.MyRedis.host);

export const redis: Redis | Cluster = isLocal
  ? new Redis({ host: Resource.MyRedis.host, port: Resource.MyRedis.port })
  : new Cluster(
      [
        {
          host: Resource.MyRedis.host,
          port: Resource.MyRedis.port,
        },
      ],
      {
        redisOptions: {
          tls: { checkServerIdentity: () => undefined },
          username: Resource.MyRedis.username,
          password: Resource.MyRedis.password,
        },
      },
    );

export const COUNTER_KEY = "url:counter";

export const COUNTER_START = 238_328;

export const connectRedis = async () => {
  await redis.set(COUNTER_KEY, COUNTER_START - 1, "NX");
};
