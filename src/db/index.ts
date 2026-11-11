import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://regan@localhost:5432/lifestream";

const globalForDb = globalThis as unknown as { __lifestreamSql?: postgres.Sql };

const sql =
  globalForDb.__lifestreamSql ??
  postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__lifestreamSql = sql;

export const db = drizzle(sql, { schema });
