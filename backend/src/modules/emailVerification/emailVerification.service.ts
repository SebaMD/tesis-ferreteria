import { db } from "../../db/index.js";
import type { DbTransaction } from "../../db/index.js";
import type { EmailVerificationPurpose } from "../../db/schema/index.js";
import { normalizeEmail } from "../../utils/email.js";
import { hashGuestSessionId } from "../onlineOrders/guestOrderAccess.js";
import { buildEmailVerificationMail } from "../notifications/emailVerificationMail.js";
import { MailDeliveryError, sendMailRequired } from "../notifications/notifications.service.js";
import {
  changeClientEmail,
  countRecentVerificationSends,
  createVerificationChallenge,
  findActiveVerificationChallenge,
  findChallengeForUpdate,
  findLatestVerificationSend,
  findOtherUserByEmail,
  findVerificationUserForUpdate,
  invalidateActiveChallenges,
  lockVerificationContext,
  markChallengeVerified,
  markClientEmailVerified,
  markUserEmailVerified,
  registerFailedAttempt,
  updateVerificationPinHash,
  type VerificationOwner,
} from "./emailVerification.repository.js";
import {
  createVerificationPin,
  hashVerificationPin,
  verificationPinMatches,
} from "./emailVerification.security.js";

export const EMAIL_VERIFICATION_EXPIRES_MINUTES = 10;
export const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;
export const EMAIL_VERIFICATION_RESEND_SECONDS = 60;
export const EMAIL_VERIFICATION_MAX_SENDS_PER_HOUR = 5;

export class EmailVerificationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "EmailVerificationError";
  }
}

function assertActiveClient(user: Awaited<ReturnType<typeof findVerificationUserForUpdate>>) {
  if (!user || user.role !== "CLIENT" || user.status !== "ACTIVE") {
    throw new EmailVerificationError("La cuenta de cliente no esta activa", 403);
  }
  return user;
}

const INTERNAL_VERIFICATION_ROLES = new Set(["MANAGER", "CASHIER", "WAREHOUSE"]);

function assertActiveInternalUser(user: Awaited<ReturnType<typeof findVerificationUserForUpdate>>) {
  if (!user || !INTERNAL_VERIFICATION_ROLES.has(user.role) || user.status !== "ACTIVE") {
    throw new EmailVerificationError("La cuenta de trabajador no esta activa", 403);
  }
  return user;
}

function ownerMatches(
  challenge: NonNullable<Awaited<ReturnType<typeof findChallengeForUpdate>>>,
  owner: VerificationOwner,
) {
  return owner.type !== "GUEST"
    ? challenge.userId === owner.userId && challenge.guestSessionHash === null
    : challenge.userId === null && challenge.guestSessionHash === owner.guestSessionHash;
}

function databaseCode(error: unknown) {
  let current = error;
  while (current && typeof current === "object") {
    const record = current as Record<string, unknown>;
    if (typeof record.code === "string") return record.code;
    current = record.cause;
  }
  return null;
}

async function issueChallenge(
  owner: VerificationOwner,
  purpose: EmailVerificationPurpose,
  email: string,
) {
  const normalizedEmail = normalizeEmail(email);
  try {
    return await db.transaction(async (tx) => {
      await lockVerificationContext(tx, owner, purpose);
      const now = new Date();
      const sentInWindow = await countRecentVerificationSends(
        tx,
        owner,
        normalizedEmail,
        new Date(now.getTime() - 60 * 60_000),
      );
      if (sentInWindow >= EMAIL_VERIFICATION_MAX_SENDS_PER_HOUR) {
        throw new EmailVerificationError(
          "Se alcanzo el limite de envios. Intenta nuevamente mas tarde.",
          429,
          60 * 60,
        );
      }

      const latest = await findLatestVerificationSend(tx, owner, purpose);
      if (latest && latest.email === normalizedEmail) {
        const elapsedSeconds = Math.floor((now.getTime() - latest.lastSentAt.getTime()) / 1000);
        if (elapsedSeconds < EMAIL_VERIFICATION_RESEND_SECONDS) {
          const retryAfterSeconds = EMAIL_VERIFICATION_RESEND_SECONDS - elapsedSeconds;
          throw new EmailVerificationError(
            `Espera ${retryAfterSeconds} segundos antes de solicitar otro codigo.`,
            429,
            retryAfterSeconds,
          );
        }
      }

      await invalidateActiveChallenges(tx, owner, purpose, now);
      const pin = createVerificationPin();
      const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_EXPIRES_MINUTES * 60_000);
      const challenge = await createVerificationChallenge(tx, {
        email: normalizedEmail,
        purpose,
        owner,
        pinHash: "0".repeat(64),
        expiresAt,
        now,
      });
      const pinHash = hashVerificationPin({
        challengeId: challenge.id,
        email: normalizedEmail,
        purpose,
        pin,
      });
      await updateVerificationPinHash(tx, challenge.id, pinHash, now);

      // Este correo es parte del control de acceso: si SMTP falla, la
      // transaccion se revierte y nunca se afirma que exista un codigo utilizable.
      await sendMailRequired(
        normalizedEmail,
        buildEmailVerificationMail(pin, EMAIL_VERIFICATION_EXPIRES_MINUTES),
      );

      return {
        challengeId: challenge.id,
        expiresAt: expiresAt.toISOString(),
        resendAvailableAt: new Date(now.getTime() + EMAIL_VERIFICATION_RESEND_SECONDS * 1000).toISOString(),
      };
    });
  } catch (error) {
    if (error instanceof EmailVerificationError) throw error;
    if (error instanceof MailDeliveryError) {
      throw new EmailVerificationError(
        "No se pudo enviar el codigo de verificacion. Revisa la configuracion de correo e intenta nuevamente.",
        503,
      );
    }
    if (
      error instanceof Error
      && error.message.startsWith("EMAIL_VERIFICATION_SECRET")
    ) {
      throw new EmailVerificationError(
        "La verificacion de correo no esta configurada en el servidor.",
        503,
      );
    }
    throw error;
  }
}

async function verifyChallenge(
  tx: DbTransaction,
  input: {
    challengeId: number;
    pin: string;
    purpose: EmailVerificationPurpose;
    owner: VerificationOwner;
  },
) {
  await lockVerificationContext(tx, input.owner, input.purpose);
  const challenge = await findChallengeForUpdate(tx, input.challengeId);
  if (!challenge || challenge.purpose !== input.purpose || !ownerMatches(challenge, input.owner)) {
    throw new EmailVerificationError("El codigo no es valido", 400);
  }
  if (challenge.failedAttempts >= EMAIL_VERIFICATION_MAX_ATTEMPTS) {
    throw new EmailVerificationError("El codigo fue bloqueado por demasiados intentos", 429);
  }
  if (challenge.consumedAt) {
    throw new EmailVerificationError("El codigo ya fue utilizado o fue reemplazado", 409);
  }
  if (challenge.expiresAt.getTime() <= Date.now()) {
    throw new EmailVerificationError("El codigo de verificacion expiro", 410);
  }
  if (challenge.verifiedAt) {
    throw new EmailVerificationError("El correo ya fue verificado con este codigo", 409);
  }

  const attemptedHash = hashVerificationPin({
    challengeId: challenge.id,
    email: challenge.email,
    purpose: challenge.purpose,
    pin: input.pin,
  });
  if (!verificationPinMatches(challenge.pinHash, attemptedHash)) {
    const attempts = challenge.failedAttempts + 1;
    await registerFailedAttempt(tx, challenge.id, attempts, new Date());
    if (attempts >= EMAIL_VERIFICATION_MAX_ATTEMPTS) {
      return new EmailVerificationError("El codigo fue bloqueado por demasiados intentos", 429);
    }
    return new EmailVerificationError(
      `El codigo no es valido. Quedan ${EMAIL_VERIFICATION_MAX_ATTEMPTS - attempts} intentos.`,
      400,
    );
  }
  return challenge;
}

export async function requestClientEmailVerificationService(userId: number) {
  const user = await db.transaction(async (tx) => assertActiveClient(
    await findVerificationUserForUpdate(tx, userId),
  ));
  if (user.emailVerifiedAt) {
    throw new EmailVerificationError("El correo de esta cuenta ya esta verificado", 409);
  }
  return issueChallenge({ type: "CLIENT", userId }, "CLIENT_REGISTRATION", user.correo);
}

export async function requestClientEmailChangeService(userId: number, email: string) {
  const user = await db.transaction(async (tx) => assertActiveClient(
    await findVerificationUserForUpdate(tx, userId),
  ));
  const normalized = normalizeEmail(email);
  if (normalized === user.correo) {
    throw new EmailVerificationError(
      user.emailVerifiedAt
        ? "Ese correo ya esta verificado en tu cuenta"
        : "Ese es tu correo actual. Utiliza la opcion para verificarlo.",
      409,
    );
  }
  if (await findOtherUserByEmail(userId, normalized)) {
    throw new EmailVerificationError("El correo electronico ya esta registrado", 409);
  }
  return issueChallenge({ type: "CLIENT", userId }, "CLIENT_EMAIL_CHANGE", normalized);
}

export async function requestGuestEmailVerificationService(guestSessionId: string, email: string) {
  let guestSessionHash: string;
  try {
    guestSessionHash = hashGuestSessionId(guestSessionId);
  } catch {
    throw new EmailVerificationError("La sesion de invitado no es valida", 400);
  }
  return issueChallenge({ type: "GUEST", guestSessionHash }, "GUEST_CHECKOUT", email);
}

export async function requestInternalEmailVerificationService(
  userId: number,
  options: { reuseActive?: boolean } = {},
) {
  const user = await db.transaction(async (tx) => assertActiveInternalUser(
    await findVerificationUserForUpdate(tx, userId),
  ));
  if (user.emailVerifiedAt) {
    throw new EmailVerificationError("El correo de esta cuenta ya esta verificado", 409);
  }

  const owner: VerificationOwner = { type: "USER", userId };
  const active = await findActiveVerificationChallenge(owner, "INTERNAL_USER_REGISTRATION");
  const now = Date.now();
  if (active && active.email === user.correo && active.expiresAt.getTime() > now) {
    const resendAt = new Date(active.lastSentAt.getTime() + EMAIL_VERIFICATION_RESEND_SECONDS * 1000);
    if (options.reuseActive || resendAt.getTime() > now) {
      return {
        sent: true,
        challengeId: active.challengeId,
        expiresAt: active.expiresAt.toISOString(),
        resendAvailableAt: resendAt.toISOString(),
      };
    }
  }
  return issueChallenge(owner, "INTERNAL_USER_REGISTRATION", user.correo);
}

export async function verifyClientEmailService(userId: number, challengeId: number, pin: string) {
  const result = await db.transaction(async (tx) => {
    const user = assertActiveClient(await findVerificationUserForUpdate(tx, userId));
    const challenge = await verifyChallenge(tx, {
      challengeId,
      pin,
      purpose: "CLIENT_REGISTRATION",
      owner: { type: "CLIENT", userId },
    });
    if (challenge instanceof EmailVerificationError) return challenge;
    if (challenge.email !== user.correo) {
      throw new EmailVerificationError("El codigo no corresponde al correo actual", 409);
    }
    const now = new Date();
    await markClientEmailVerified(tx, userId, now);
    await markChallengeVerified(tx, challenge.id, now, true);
    return { email: user.correo, emailVerifiedAt: now.toISOString() };
  });
  if (result instanceof EmailVerificationError) throw result;
  return result;
}

export async function verifyClientEmailChangeService(userId: number, challengeId: number, pin: string) {
  try {
    const result = await db.transaction(async (tx) => {
      assertActiveClient(await findVerificationUserForUpdate(tx, userId));
      const challenge = await verifyChallenge(tx, {
        challengeId,
        pin,
        purpose: "CLIENT_EMAIL_CHANGE",
        owner: { type: "CLIENT", userId },
      });
      if (challenge instanceof EmailVerificationError) return challenge;
      const now = new Date();
      const updated = await changeClientEmail(tx, userId, challenge.email, now);
      if (!updated) throw new EmailVerificationError("La cuenta no fue encontrada", 404);
      await markChallengeVerified(tx, challenge.id, now, true);
      return { email: challenge.email, emailVerifiedAt: now.toISOString() };
    });
    if (result instanceof EmailVerificationError) throw result;
    return result;
  } catch (error) {
    if (databaseCode(error) === "23505") {
      throw new EmailVerificationError("El correo electronico ya esta registrado", 409);
    }
    throw error;
  }
}

export async function verifyGuestEmailService(
  guestSessionId: string,
  challengeId: number,
  pin: string,
) {
  let guestSessionHash: string;
  try {
    guestSessionHash = hashGuestSessionId(guestSessionId);
  } catch {
    throw new EmailVerificationError("La sesion de invitado no es valida", 400);
  }
  const result = await db.transaction(async (tx) => {
    const challenge = await verifyChallenge(tx, {
      challengeId,
      pin,
      purpose: "GUEST_CHECKOUT",
      owner: { type: "GUEST", guestSessionHash },
    });
    if (challenge instanceof EmailVerificationError) return challenge;
    const now = new Date();
    await markChallengeVerified(tx, challenge.id, now, false);
    return { challengeId: challenge.id, email: challenge.email, verifiedAt: now.toISOString() };
  });
  if (result instanceof EmailVerificationError) throw result;
  return result;
}

export async function verifyInternalEmailService(userId: number, challengeId: number, pin: string) {
  const result = await db.transaction(async (tx) => {
    const user = assertActiveInternalUser(await findVerificationUserForUpdate(tx, userId));
    const challenge = await verifyChallenge(tx, {
      challengeId,
      pin,
      purpose: "INTERNAL_USER_REGISTRATION",
      owner: { type: "USER", userId },
    });
    if (challenge instanceof EmailVerificationError) return challenge;
    if (challenge.email !== user.correo) {
      throw new EmailVerificationError("El codigo no corresponde al correo actual", 409);
    }
    const now = new Date();
    await markUserEmailVerified(tx, userId, now);
    await markChallengeVerified(tx, challenge.id, now, true);
    return { email: user.correo, emailVerifiedAt: now.toISOString() };
  });
  if (result instanceof EmailVerificationError) throw result;
  return result;
}
