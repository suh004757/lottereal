import json
import struct
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "scripts" / "webp_manifest.json"


def webp_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise AssertionError(f"not WebP: {path}")
    kind = data[12:16]
    if kind == b"VP8X":
        return 1 + int.from_bytes(data[24:27], "little"), 1 + int.from_bytes(data[27:30], "little")
    if kind == b"VP8 ":
        marker = data.index(b"\x9d\x01\x2a", 20)
        width, height = struct.unpack_from("<HH", data, marker + 3)
        return width & 0x3FFF, height & 0x3FFF
    if kind == b"VP8L":
        b0, b1, b2, b3 = data[21:25]
        return 1 + (((b2 & 0x3F) << 8) | b1), 1 + ((b3 << 6) | (b2 >> 6))
    raise AssertionError(f"unsupported WebP encoding: {path}")


class WebpManifestTests(unittest.TestCase):
    def test_manifest_maps_every_optimized_webp_to_source_and_dimensions(self):
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(manifest["version"], 1)
        self.assertEqual(manifest["tool"], "cwebp")
        outputs = set()
        for item in manifest["images"]:
            source = ROOT / item["source"]
            output = ROOT / item["output"]
            self.assertTrue(source.is_file(), source)
            self.assertTrue(output.is_file(), output)
            self.assertEqual(webp_dimensions(output), (item["width"], item["height"]))
            self.assertNotIn(item["output"], outputs)
            outputs.add(item["output"])
        committed = {str(path.relative_to(ROOT)) for path in (ROOT / "public" / "img").rglob("*.webp")}
        self.assertEqual(outputs, committed)

    def test_generator_exposes_check_mode(self):
        script = (ROOT / "scripts" / "generate_webp.py").read_text(encoding="utf-8")
        self.assertIn("--check", script)
        self.assertIn("webp_manifest.json", script)


if __name__ == "__main__":
    unittest.main()
