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

export const WEBPAY_ENVIRONMENT = (process.env.WEBPAY_ENVIRONMENT || "integration").toLowerCase();
export const WEBPAY_COMMERCE_CODE = process.env.WEBPAY_COMMERCE_CODE;
export const WEBPAY_API_KEY = process.env.WEBPAY_API_KEY;
export const WEBPAY_RETURN_URL = process.env.WEBPAY_RETURN_URL
  || `http://localhost:${PORT}/api/online-orders/payments/webpay/return`;
export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const configuredWebpayTimeout = Number.parseInt(process.env.WEBPAY_TIMEOUT_MS || "30000", 10);
export const WEBPAY_TIMEOUT_MS = Number.isInteger(configuredWebpayTimeout)
  && configuredWebpayTimeout >= 5_000
  && configuredWebpayTimeout <= 120_000
  ? configuredWebpayTimeout
  : 30_000;

const configuredReservationMinutes = Number.parseInt(
  process.env.ONLINE_ORDER_RESERVATION_MINUTES || "20",
  10,
);

export const ONLINE_ORDER_RESERVATION_MINUTES = Number.isInteger(configuredReservationMinutes)
  && configuredReservationMinutes >= 15
  ? configuredReservationMinutes
  : 20;

function booleanEnvironmentValue(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === "true";
}

const configuredSmtpPort = Number.parseInt(process.env.SMTP_PORT || "587", 10);

export const MAIL_ENABLED = booleanEnvironmentValue(process.env.MAIL_ENABLED);
export const SMTP_HOST = process.env.SMTP_HOST?.trim() || undefined;
export const SMTP_PORT = Number.isInteger(configuredSmtpPort)
  && configuredSmtpPort >= 1
  && configuredSmtpPort <= 65_535
  ? configuredSmtpPort
  : 587;
export const SMTP_SECURE = booleanEnvironmentValue(process.env.SMTP_SECURE);
export const SMTP_USER = process.env.SMTP_USER?.trim() || undefined;
export const SMTP_PASS = process.env.SMTP_PASS || undefined;
export const MAIL_FROM = process.env.MAIL_FROM?.trim() || undefined;
