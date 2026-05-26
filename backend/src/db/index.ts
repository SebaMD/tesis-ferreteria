import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";

config({ quiet: true });

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const host = process.env.DB_HOST || process.env.HOST;
  const port = process.env.DB_PORT || "5432";
  const username = process.env.DB_USERNAME;
  const password = process.env.DB_PASSWORD || process.env.PASSWORD;
  const database = process.env.DATABASE || process.env.DB_NAME;

  if (!host || !username || !password || !database) {
    throw new Error("Faltan variables de entorno para conectar a PostgreSQL");
  }

  return `postgresql://${username}:${password}@${host}:${port}/${database}`;
}

export const db = drizzle(getDatabaseUrl());
