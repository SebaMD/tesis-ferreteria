import { defineConfig } from "drizzle-kit";
// Schema generation only: no dotenv and no database connection credentials.
export default defineConfig({out:"./drizzle",schema:"./src/db/schema/index.ts",dialect:"postgresql"});
