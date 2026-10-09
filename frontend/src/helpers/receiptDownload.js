function pdfFilename(response, fallbackFilename) {
  const disposition = String(response?.headers?.["content-disposition"] || "");
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const serverFilename = match?.[1]?.trim();
  if (serverFilename && /^[a-zA-Z0-9._-]+\.pdf$/i.test(serverFilename)) return serverFilename;
  return fallbackFilename;
}

async function normalizeBlobError(error) {
  const data = error?.response?.data;
  if (!(data instanceof Blob)) return;
  const contentType = String(error.response?.headers?.["content-type"] || data.type || "");
  if (!contentType.includes("application/json")) return;
  try {
    error.response.data = JSON.parse(await data.text());
  } catch {
    // Conserva el error original si la respuesta no contiene JSON válido.
  }
}

export async function downloadPdf(request, fallbackFilename) {
  let response;
  try {
    response = await request();
  } catch (error) {
    await normalizeBlobError(error);
    throw error;
  }

  const blob = response.data instanceof Blob
    ? response.data
    : new Blob([response.data], { type: "application/pdf" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = pdfFilename(response, fallbackFilename);
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.requestAnimationFrame(() => URL.revokeObjectURL(objectUrl));
}

export function downloadReceipt(request, folio) {
  return downloadPdf(request, `comprobante-${folio}.pdf`);
}
