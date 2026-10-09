export function resolveApiAssetUrl(value, apiBaseUrl = import.meta.env?.VITE_API_URL || "/api") {
  const assetUrl = String(value || "").trim();
  if (!assetUrl || /^(?:https?:|data:|blob:)/i.test(assetUrl)) return assetUrl || null;

  const normalizedAssetUrl = assetUrl.startsWith("/") ? assetUrl : `/${assetUrl}`;
  if (!/^https?:\/\//i.test(String(apiBaseUrl || ""))) return normalizedAssetUrl;

  try {
    return new URL(normalizedAssetUrl, apiBaseUrl).toString();
  } catch {
    return normalizedAssetUrl;
  }
}
