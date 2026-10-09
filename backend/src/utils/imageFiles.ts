import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { fileTypeFromBuffer } from "file-type";
import { UPLOADS_ROOT } from "../config/configEnv.js";

export const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024;

const SUPPORTED_IMAGES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
} as const;

export type SupportedImageMimeType = keyof typeof SUPPORTED_IMAGES;

export class ImageFileError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ImageFileError";
  }
}

function isSupportedImageMimeType(value: string): value is SupportedImageMimeType {
  return Object.hasOwn(SUPPORTED_IMAGES, value);
}

function validateDirectorySegment(value: string | number) {
  const segment = String(value);
  if (!/^[a-zA-Z0-9_-]+$/.test(segment)) {
    throw new ImageFileError("La ubicacion de la imagen no es valida", 500);
  }
  return segment;
}

export function resolveStoredImagePath(relativePath: string) {
  const uploadsRoot = path.resolve(UPLOADS_ROOT);
  const absolutePath = path.resolve(uploadsRoot, relativePath);
  const pathFromRoot = path.relative(uploadsRoot, absolutePath);

  if (!pathFromRoot || pathFromRoot.startsWith("..") || path.isAbsolute(pathFromRoot)) {
    throw new ImageFileError("La ruta de la imagen no es valida", 500);
  }

  return absolutePath;
}

export function getStoredImageMimeType(relativePath: string): SupportedImageMimeType | null {
  const extension = path.extname(relativePath).toLowerCase();
  const entry = Object.entries(SUPPORTED_IMAGES).find(([, value]) => value === extension);
  return entry ? entry[0] as SupportedImageMimeType : null;
}

export async function validateImageBuffer(buffer: Buffer, declaredMimeType?: string) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ImageFileError("Debe seleccionar una imagen", 400);
  }
  if (buffer.length > MAX_IMAGE_FILE_SIZE) {
    throw new ImageFileError("La imagen no puede superar 5 MB", 413);
  }

  const normalizedDeclaredMimeType = declaredMimeType?.split(";")[0]?.trim().toLowerCase();
  if (normalizedDeclaredMimeType && !isSupportedImageMimeType(normalizedDeclaredMimeType)) {
    throw new ImageFileError("La imagen debe ser JPG, PNG o WebP", 400);
  }

  const detectedType = await fileTypeFromBuffer(buffer);
  if (!detectedType || !isSupportedImageMimeType(detectedType.mime)) {
    throw new ImageFileError("El archivo no contiene una imagen JPG, PNG o WebP valida", 400);
  }
  if (normalizedDeclaredMimeType && normalizedDeclaredMimeType !== detectedType.mime) {
    throw new ImageFileError("El contenido de la imagen no coincide con su tipo declarado", 400);
  }

  return {
    mimeType: detectedType.mime,
    extension: SUPPORTED_IMAGES[detectedType.mime],
  };
}

export async function saveImageFile(input: {
  buffer: Buffer;
  declaredMimeType?: string;
  directorySegments: Array<string | number>;
}) {
  const imageType = await validateImageBuffer(input.buffer, input.declaredMimeType);
  const directory = input.directorySegments.map(validateDirectorySegment);
  if (directory.length === 0) {
    throw new ImageFileError("Debe indicar una ubicacion para la imagen", 500);
  }

  const relativePath = path.join(...directory, `${randomUUID()}${imageType.extension}`);
  const absolutePath = resolveStoredImagePath(relativePath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.buffer, { flag: "wx" });

  return {
    relativePath: relativePath.replaceAll("\\", "/"),
    absolutePath,
    mimeType: imageType.mimeType,
  };
}

export async function removeStoredImageFile(relativePath: string) {
  await unlink(resolveStoredImagePath(relativePath)).catch((error: unknown) => {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && error.code === "ENOENT"
    ) {
      return;
    }
    throw error;
  });
}
