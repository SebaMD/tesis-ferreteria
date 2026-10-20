"""Extract reviewed source objects, unchanged, to a NON-public review directory.

Usage: python scripts/prepare-demo-images.py --source-dir PATH_TO_SUPPLIER_PDFS
Requires pypdf. Does not write uploads, product_images, frontend/public or a database.
"""
import argparse
import hashlib
import json
import logging
from pathlib import Path

from pypdf import PdfReader

logging.getLogger("pypdf").setLevel(logging.ERROR)
DOCUMENT = "Cotizacion_COT-2026-0934.pdf"
SOURCE_SHA256 = "6e143651b03a5fa24b03f8f1138e677fa680f0737cac667ddec722bcfdbc8002"
# Explicit object names, NOT extraction order (which is not stable).
# Checked against the quotation rows and the extracted objects visually.
PLAN = [
    (1, "5003027", "98588e9352769b01ee84c66d575ba6d7"),
    (1, "5406378", "bdb2454520ec3b93a4d1889273e310b2"),
    (1, "5407513", "fbdc819484e42b64576eb82d238cc81b"),
    (2, "5401985", "4910facbb6bfa76b805648031b8dfc94"),
    (2, "5034028", "4a6afc57a03c3c70f0b356b1cc6346cd"),
    (2, "5074100", "7659bf563d1ce6e8c401238e0c49ede8"),
    (2, "5401984", "9a534df906ea43c707a2240d8cb01fb7"),
    (2, "5022017", "d4189d53c286863c79f56dc30ccaf571"),
    (3, "5401135", "8a4990eebbaf9b9313885e152dafc572"),
    (3, "5022013", "9376eef09c09f39ff71d49d728ef7b86"),
    (3, "5015026", "baba2fe967a0a28119e10e30cb8ed6df"),
    (3, "5017044", "c278b6ad4808cc8d98b00b0d1f780390"),
    (3, "5409322", "f64675a2e9e1a4701d63eaf77dc9b8df"),
]


def prepare(source_dir: Path):
    root = Path(__file__).resolve().parents[2] / "docs" / "seed-catalog-review"
    destination = root / "images"
    destination.mkdir(parents=True, exist_ok=True)
    source = source_dir / DOCUMENT
    reader = PdfReader(source)
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    if source_hash != SOURCE_SHA256:
        raise ValueError("The quotation changed; review its images before extracting again")
    manifest = []
    for page_number, code, object_hash in PLAN:
        object_name = f"FormXob.{object_hash}.png"
        image = next((item for item in reader.pages[page_number - 1].images if item.name == object_name), None)
        if image is None:
            raise ValueError(f"Source object changed: page {page_number}, {object_name}")
        filename = f"cot-{code}.png"
        target = destination / filename
        if target.exists() and target.read_bytes() != image.data:
            raise ValueError(f"Existing review image differs; refusing to overwrite {filename}")
        if not target.exists():
            target.write_bytes(image.data)
        manifest.append({
            "productKey": f"{DOCUMENT}:{code}", "sourceDocument": DOCUMENT,
            "sourcePage": page_number, "sourceSha256": source_hash, "sourceObject": object_name,
            "file": f"images/{filename}", "sha256": hashlib.sha256(image.data).hexdigest(),
            "width": image.image.width, "height": image.image.height,
            "association": "quotation-row-checked; confirm packaging with FYF before publication",
            "rightsStatus": "PENDING_AUTHORIZATION", "publish": False,
        })
    (root / "extracted-images.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(manifest)} original embedded images for PRIVATE review at {root}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    prepare(parser.parse_args().source_dir)
