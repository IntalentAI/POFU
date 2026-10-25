import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// On Cloudflare the database is the request's D1 binding (`env.DB`). Bindings are
// stable for the life of an isolate, so one client is cached per binding.
// Outside a Worker (unit tests, scripts) a plain SQLite file is used via DATABASE_URL.
const clients = new WeakMap<D1Database, PrismaClient>();
let localClient: PrismaClient | undefined;

function currentClient(): PrismaClient {
  let binding: D1Database | undefined;
  try {
    binding = getCloudflareContext().env.DB;
  } catch {
    // Not running inside a Worker request.
  }
  if (binding) {
    let client = clients.get(binding);
    if (!client) {
      client = new PrismaClient({ adapter: new PrismaD1(binding) });
      clients.set(binding, client);
    }
    return client;
  }
  return (localClient ??= new PrismaClient());
}

/** Scripts (e.g. the seed) run outside a Worker: point `db` at a D1 binding from wrangler's getPlatformProxy. */
export function bindD1(binding: D1Database) {
  localClient = new PrismaClient({ adapter: new PrismaD1(binding) });
}

/** Prisma client for the current environment. Usage is unchanged: `db.candidate.findMany(...)`. */
export const db = new Proxy({} as PrismaClient, {
  get(_, prop) {
    const client = currentClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
