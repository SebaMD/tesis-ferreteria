import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { UPLOADS_ROOT } from "../../config/configEnv.js";
import { ImageFileError, validateImageBuffer } from "../../utils/imageFiles.js";
import { findProductById } from "../products/products.repository.js";
import {
  createProductImage,
  deleteProductImage,
  reorderProductImages,
  setPrimaryProductImage,
} from "./productImages.repository.js";
import { presentProductImage } from "./productImages.presenter.js";

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

  let extension: string;
  try {
    ({ extension } = await validateImageBuffer(data.buffer, data.mimeType));
  } catch (error) {
    if (error instanceof ImageFileError) {
      throw new ProductImageError(error.message, error.statusCode);
    }
    throw error;
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
