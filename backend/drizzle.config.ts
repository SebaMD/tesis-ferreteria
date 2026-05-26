import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no esta definida en el archivo .env");
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
