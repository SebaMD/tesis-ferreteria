import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const uploadsRoot = await mkdtemp(path.join(tmpdir(), "fyf-product-static-"));
process.env.UPLOADS_ROOT = uploadsRoot;

const fixtures = [
  {
    name: "sample.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZfWQAAAAASUVORK5CYII=", "base64"),
  },
  {
    name: "sample.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABCf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=", "base64"),
  },
  {
    name: "sample.webp",
    mimeType: "image/webp",
    buffer: Buffer.from("UklGRkoAAABXRUJQVlA4ID4AAADwAQCdASoBAAEAAUAmJQBOgCHwAP7+tQZQAAAA", "base64"),
  },
];

let server;
try {
  const directory = path.join(uploadsRoot, "products", "unit");
  await mkdir(directory, { recursive: true });
  for (const fixture of fixtures) await writeFile(path.join(directory, fixture.name), fixture.buffer);

  const { default: app } = await import("../dist/app.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;

  for (const fixture of fixtures) {
    const response = await fetch(`${origin}/uploads/products/unit/${fixture.name}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), fixture.mimeType);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), fixture.buffer);
  }

  const wrongPrefix = await fetch(`${origin}/api/uploads/products/unit/sample.webp`);
  assert.equal(wrongPrefix.status, 404);
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(uploadsRoot, { recursive: true, force: true });
}

console.log("PASS product static middleware serves JPEG/PNG/WebP from /uploads without /api");
