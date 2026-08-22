import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { UPLOADS_ROOT } from "../../config/configEnv.js";
import { findProductById } from "../products/products.repository.js";
import {
  createProductImage,
  deleteProductImage,
  reorderProductImages,
  setPrimaryProductImage,
} from "./productImages.repository.js";
import { presentProductImage } from "./productImages.presenter.js";

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export class ProductImageError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ProductImageError";
  }
}

function getAbsoluteImagePath(imagePath: string) {
  const uploadsRoot = path.resolve(UPLOADS_ROOT);
  const absolutePath = path.resolve(uploadsRoot, imagePath);

  if (!absolutePath.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new ProductImageError("Ruta de imagen invalida", 500);
  }

  return absolutePath;
}

export async function uploadProductImageService(
  productId: number,
  data: { buffer: Buffer; mimeType: string },
) {
  const product = await findProductById(productId, true);
  if (!product) throw new ProductImageError("Producto no encontrado", 404);

  const extension = IMAGE_EXTENSIONS[data.mimeType];
  if (!extension) {
    throw new ProductImageError("La imagen debe ser JPG, PNG o WebP", 400);
  }

  if (data.buffer.length === 0) {
    throw new ProductImageError("Debe seleccionar una imagen", 400);
  }

  if (data.buffer.length > 5 * 1024 * 1024) {
    throw new ProductImageError("La imagen no puede superar 5 MB", 413);
  }

  const relativeDirectory = path.join("products", String(productId));
  const imagePath = path.join(relativeDirectory, `${randomUUID()}${extension}`);
  const absolutePath = getAbsoluteImagePath(imagePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, data.buffer, { flag: "wx" });

  try {
    return presentProductImage(await createProductImage({ productId, imagePath }));
  } catch (error) {
    await unlink(absolutePath).catch(() => undefined);
    throw error;
  }
}

export async function setPrimaryProductImageService(productId: number, imageId: number) {
  const image = await setPrimaryProductImage(productId, imageId);
  if (!image) throw new ProductImageError("Imagen no encontrada", 404);
  return presentProductImage(image);
}

export async function deleteProductImageService(productId: number, imageId: number) {
  const image = await deleteProductImage(productId, imageId);
  if (!image) throw new ProductImageError("Imagen no encontrada", 404);

  await unlink(getAbsoluteImagePath(image.imagePath)).catch(() => undefined);
  return presentProductImage(image);
}

export async function reorderProductImagesService(productId: number, imageIds: number[]) {
  const images = await reorderProductImages(productId, imageIds);
  if (!images) {
    throw new ProductImageError("La lista debe contener todas las imagenes actuales del producto", 400);
  }
  return images.map(presentProductImage);
}
