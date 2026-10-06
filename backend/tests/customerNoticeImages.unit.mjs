import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const uploadsRoot = await mkdtemp(path.join(tmpdir(), "fyf-notice-image-unit-"));
process.env.UPLOADS_ROOT = uploadsRoot;

const {
  ImageFileError,
  MAX_IMAGE_FILE_SIZE,
  removeStoredImageFile,
  saveImageFile,
  validateImageBuffer,
} = await import("../dist/utils/imageFiles.js");

const fixtures = [
  {
    mimeType: "image/png",
    extension: ".png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZfWQAAAAASUVORK5CYII=", "base64"),
  },
  {
    mimeType: "image/jpeg",
    extension: ".jpg",
    buffer: Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABCf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=", "base64"),
  },
  {
    mimeType: "image/webp",
    extension: ".webp",
    buffer: Buffer.from("UklGRkoAAABXRUJQVlA4ID4AAADwAQCdASoBAAEAAUAmJQBOgCHwAP7+tQZQAAAA", "base64"),
  },
];

test("customer notice images validate and persist JPEG, PNG and WebP without changing bytes", async () => {
  try {
    for (const fixture of fixtures) {
      const detected = await validateImageBuffer(fixture.buffer, fixture.mimeType);
      assert.equal(detected.mimeType, fixture.mimeType);
      assert.equal(detected.extension, fixture.extension);

      const saved = await saveImageFile({
        buffer: fixture.buffer,
        declaredMimeType: fixture.mimeType,
        directorySegments: ["customer-notices", "unit"],
      });
      assert.ok(saved.relativePath.endsWith(fixture.extension));
      assert.deepEqual(await readFile(saved.absolutePath), fixture.buffer);
      await removeStoredImageFile(saved.relativePath);
    }
  } finally {
    await rm(uploadsRoot, { recursive: true, force: true });
  }
});

test("shared image validation rejects fake, empty, oversized and mismatched uploads", async () => {
  const expectImageError = async (promise, statusCode) => {
    await assert.rejects(promise, (error) => {
      assert.ok(error instanceof ImageFileError);
      assert.equal(error.statusCode, statusCode);
      return true;
    });
  };

  await expectImageError(
    validateImageBuffer(Buffer.from("esto no es una imagen"), "image/png"),
    400,
  );
  await expectImageError(
    validateImageBuffer(Buffer.from("esto tampoco es JPEG"), "image/jpeg"),
    400,
  );
  await expectImageError(validateImageBuffer(Buffer.alloc(0), "image/png"), 400);
  await expectImageError(
    validateImageBuffer(Buffer.alloc(MAX_IMAGE_FILE_SIZE + 1), "image/png"),
    413,
  );
  await expectImageError(validateImageBuffer(fixtures[0].buffer, "image/jpeg"), 400);
  await expectImageError(validateImageBuffer(fixtures[0].buffer, "image/gif"), 400);
});
