import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const envFilePath = path.resolve(dirname, "../../.env");

dotenv.config({ path: envFilePath, quiet: true });

export const PORT = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000;

export const DB_HOST = process.env.DB_HOST || process.env.HOST || "localhost";
export const DB_PORT = process.env.DB_PORT ? Number.parseInt(process.env.DB_PORT, 10) : 5432;
export const DB_USERNAME = process.env.DB_USERNAME;
export const DB_PASSWORD = process.env.DB_PASSWORD || process.env.PASSWORD;
export const DATABASE = process.env.DATABASE || process.env.DB_NAME;
export const DATABASE_URL = process.env.DATABASE_URL;

export const COOKIE_KEY = process.env.COOKIE_KEY;
export const SESSION_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET;
export const UPLOADS_ROOT = process.env.UPLOADS_ROOT || path.resolve(process.cwd(), "uploads");

export const EMAIL_USER = process.env.EMAIL_USER;
export const EMAIL_PASS = process.env.EMAIL_PASS;
