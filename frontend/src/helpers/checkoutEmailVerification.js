// Delivery quotes change independently of the guest's single-use email challenge.
export function guestCheckoutEmailIsVerified(verification, { email, checkoutKey, sessionId }, now = Date.now()) {
  return Boolean(verification?.verified
    && Number.isSafeInteger(verification.challengeId) && verification.challengeId > 0
    && verification.purpose === "GUEST_CHECKOUT"
    && verification.email === email
    && verification.checkoutKey === checkoutKey
    && verification.sessionId === sessionId
    && new Date(verification.expiresAt).getTime() > now);
}
