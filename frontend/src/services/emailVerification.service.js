import api from "../api/httpClient.js";
import { getOrCreateGuestSessionId } from "../helpers/guestCheckout.js";

function guestHeaders() {
  return { "X-Guest-Session": getOrCreateGuestSessionId() };
}

export async function requestClientEmailVerification() {
  const response = await api.post("/email-verification/client/request", {});
  return response.data.data;
}

export async function verifyClientEmail(data) {
  const response = await api.post("/email-verification/client/verify", data);
  return response.data.data;
}

export async function requestClientEmailChange(email) {
  const response = await api.post("/email-verification/client/email-change/request", { email });
  return response.data.data;
}

export async function verifyClientEmailChange(data) {
  const response = await api.post("/email-verification/client/email-change/verify", data);
  return response.data.data;
}

export async function requestGuestEmailVerification(email) {
  const response = await api.post("/email-verification/guest/request", { email }, {
    headers: guestHeaders(),
  });
  return response.data.data;
}

export async function verifyGuestEmail(data) {
  const response = await api.post("/email-verification/guest/verify", data, {
    headers: guestHeaders(),
  });
  return response.data.data;
}

export async function requestInternalEmailVerification() {
  const response = await api.post("/email-verification/internal/request", {});
  return response.data.data;
}

export async function verifyInternalEmail(data) {
  const response = await api.post("/email-verification/internal/verify", data);
  return response.data.data;
}
