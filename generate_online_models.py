import argparse
import hashlib
import json
from pathlib import Path


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def pretty_name(stem: str) -> str:
    name = stem.replace("_", " ").strip()
    tokens = name.split()
    if not tokens:
        return stem
    first = tokens[0].lower()
    if first == "zerodce":
        tokens[0] = "ZeroDCE"
    elif first == "cpca1":
        tokens[0] = "CPCA1"
    return " ".join(tokens)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate src/onlineModels.js from public/models/*.onnx")
    parser.add_argument("--models-dir", default="public/models", help="Directory containing .onnx files")
    parser.add_argument("--output", default="src/onlineModels.js", help="Output JS file")
    parser.add_argument("--cache-name", default="zerodce-model-cache-v1", help="MODEL_CACHE_NAME value")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[0]
    models_dir = (root / args.models_dir).resolve()
    output_path = (root / args.output).resolve()

    if not models_dir.exists():
        raise FileNotFoundError(f"Models directory not found: {models_dir}")

    model_files = sorted(models_dir.glob("*.onnx"))
    if not model_files:
        raise RuntimeError(f"No .onnx files found in: {models_dir}")

    items = []
    for p in model_files:
        stem = p.stem
        item = {
            "id": stem,
            "name": pretty_name(stem),
            "url": f"/models/{p.name}",
            "sha256": sha256_file(p),
        }
        items.append(item)

    lines = []
    lines.append("export const MODEL_CACHE_NAME = " + json.dumps(args.cache_name, ensure_ascii=True))
    lines.append("")
    lines.append("export const ONLINE_MODELS = [")
    for i, item in enumerate(items):
        comma = "," if i < len(items) - 1 else ""
        lines.append("  {")
        lines.append(f"    id: {json.dumps(item['id'], ensure_ascii=True)},")
        lines.append(f"    name: {json.dumps(item['name'], ensure_ascii=True)},")
        lines.append(f"    url: {json.dumps(item['url'], ensure_ascii=True)},")
        lines.append(f"    sha256: {json.dumps(item['sha256'], ensure_ascii=True)}")
        lines.append(f"  }}{comma}")
    lines.append("]")
    lines.append("")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Generated: {output_path}")
    print(f"Models: {len(items)}")


if __name__ == "__main__":
    main()
