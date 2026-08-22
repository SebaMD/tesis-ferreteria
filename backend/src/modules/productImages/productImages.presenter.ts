export function presentProductImage<T extends { imagePath: string }>(image: T) {
  return {
    ...image,
    imageUrl: `/uploads/${image.imagePath.replaceAll("\\", "/")}`,
  };
}
