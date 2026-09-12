import bcrypt from "bcrypt";
import { createHash, randomBytes } from "crypto";
import { db } from "../../db/index.js";
import { normalizeEmail } from "../../utils/email.js";
import { buildPasswordResetMail } from "../notifications/passwordResetMail.js";
import { sendMailRequired } from "../notifications/notifications.service.js";
import {
  consumeOtherPasswordResetTokens,
  consumeValidPasswordResetToken,
  countRecentPasswordResetRequests,
  createPasswordResetToken,
  findActiveUserForPasswordReset,
  findLatestPasswordResetRequest,
  lockPasswordResetUser,
  markPasswordResetSent,
  markPasswordResetUndeliverable,
  replaceActiveUserPassword,
} from "./passwordReset.repository.js";

export const PASSWORD_RESET_EXPIRES_MINUTES = 30;
export const PASSWORD_RESET_COOLDOWN_SECONDS = 60;
export const PASSWORD_RESET_MAX_REQUESTS_PER_HOUR = 3;
export const PASSWORD_RESET_GENERIC_MESSAGE = "Si existe una cuenta activa asociada a ese correo, recibirás instrucciones para restablecer tu contraseña.";

export class PasswordResetError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "PasswordResetError";
  }
}

function tokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createPasswordResetSecret() {
  return randomBytes(32).toString("base64url");
}

export function hashPasswordResetSecret(token: string) {
  return tokenHash(token);
}

export async function requestPasswordResetService(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findActiveUserForPasswordReset(normalizedEmail);
  if (!user) return;

  const now = new Date();
  const token = createPasswordResetSecret();
  const hash = tokenHash(token);
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_EXPIRES_MINUTES * 60_000);

  const created = await db.transaction(async (tx) => {
    await lockPasswordResetUser(tx, user.id);
    const latest = await findLatestPasswordResetRequest(tx, user.id);
    if (latest) {
      const elapsed = Math.floor((now.getTime() - latest.createdAt.getTime()) / 1000);
      if (elapsed < PASSWORD_RESET_COOLDOWN_SECONDS) return null;
    }
    const recent = await countRecentPasswordResetRequests(
      tx,
      user.id,
      new Date(now.getTime() - 60 * 60_000),
    );
    if (recent >= PASSWORD_RESET_MAX_REQUESTS_PER_HOUR) return null;
    return createPasswordResetToken(tx, { userId: user.id, tokenHash: hash, expiresAt, now });
  });

  if (!created) return;

  try {
    await sendMailRequired(user.correo, buildPasswordResetMail(token, PASSWORD_RESET_EXPIRES_MINUTES));
    await db.transaction((tx) => markPasswordResetSent(tx, {
      id: created.id,
      userId: user.id,
      sentAt: new Date(),
    }));
  } catch {
    await markPasswordResetUndeliverable(created.id, new Date());
    console.error("No se pudo entregar un correo de recuperación de contraseña.");
  }
}

export async function confirmPasswordResetService(token: string, password: string) {
  const hash = tokenHash(token);
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();

  const updated = await db.transaction(async (tx) => {
    const resetToken = await consumeValidPasswordResetToken(tx, hash, now);
    if (!resetToken) return null;
    const user = await replaceActiveUserPassword(tx, resetToken.userId, passwordHash, now);
    if (!user) throw new PasswordResetError("El enlace no es válido o ya expiró", 400);
    await consumeOtherPasswordResetTokens(tx, resetToken.userId, resetToken.id, now);
    return user;
  });

  if (!updated) throw new PasswordResetError("El enlace no es válido o ya expiró", 400);
}
