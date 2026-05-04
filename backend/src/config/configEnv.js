"use strict";

import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);
const envFilePath = path.resolve(_dirname, "../../.env");

dotenv.config({ path: envFilePath })

export const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
export const HOST = process.env.DB_HOST || process.env.HOST || 'localhost';
export const DB_PORT = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432;

export const DB_USERNAME = process.env.DB_USERNAME;
export const PASSWORD = process.env.DB_PASSWORD || process.env.PASSWORD;
export const DATABASE = process.env.DATABASE;

export const COOKIE_KEY = process.env.COOKIE_KEY;
export const SESSION_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET;

export const EMAIL_USER = process.env.EMAIL_USER;
export const EMAIL_PASS = process.env.EMAIL_PASS;
