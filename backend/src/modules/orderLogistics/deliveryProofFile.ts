import { access } from "fs/promises";
import path from "path";
import {
  getStoredImageMimeType,
  ImageFileError,
  resolveStoredImagePath,
} from "../../utils/imageFiles.js";
import type { LogisticsOrigin } from "./orderLogistics.repository.js";

export async function resolveDeliveryProofFile(
  origin: LogisticsOrigin,
  taskId: number,
  storedPath: string | null,
) {
  const normalizedPath = String(storedPath || "").replaceAll("\\", "/");
  const expectedPrefix = `deliveries/${origin.toLowerCase()}/${taskId}/`;
  if (!normalizedPath.startsWith(expectedPrefix)) {
    throw new ImageFileError("La evidencia de entrega no esta disponible", 404);
  }

  const mimeType = getStoredImageMimeType(normalizedPath);
  if (!mimeType) {
    throw new ImageFileError("La evidencia de entrega no es una imagen valida", 404);
  }

  const absolutePath = resolveStoredImagePath(normalizedPath);
  const expectedDirectory = path.dirname(resolveStoredImagePath(`${expectedPrefix}evidence.png`));
  const relativeToOrderDirectory = path.relative(expectedDirectory, absolutePath);
  if (
    !relativeToOrderDirectory
    || relativeToOrderDirectory.startsWith("..")
    || path.isAbsolute(relativeToOrderDirectory)
    || path.dirname(relativeToOrderDirectory) !== "."
  ) {
    throw new ImageFileError("La evidencia de entrega no esta disponible", 404);
  }
  try {
    await access(absolutePath);
  } catch {
    throw new ImageFileError("La evidencia de entrega no esta disponible", 404);
  }

  return { absolutePath, mimeType };
}
