import hashlib
import importlib.util
import json
import struct
import tempfile
import unittest
from unittest import mock
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "scripts" / "webp_manifest.json"
spec = importlib.util.spec_from_file_location("generate_webp", ROOT / "scripts" / "generate_webp.py")
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


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
        self.assertRegex(manifest["required_version"], r"^\d+\.\d+\.\d+$")
        outputs = set()
        for item in manifest["images"]:
            source = ROOT / item["source"]
            output = ROOT / item["output"]
            self.assertTrue(source.is_file(), source)
            self.assertTrue(output.is_file(), output)
            self.assertEqual(webp_dimensions(output), (item["width"], item["height"]))
            self.assertEqual(hashlib.sha256(output.read_bytes()).hexdigest(), item["sha256"])
            self.assertNotIn(item["output"], outputs)
            outputs.add(item["output"])
        committed = {str(path.relative_to(ROOT)) for path in (ROOT / "public" / "img").rglob("*.webp")}
        self.assertEqual(outputs, committed)

    def test_generator_exposes_check_mode(self):
        script = (ROOT / "scripts" / "generate_webp.py").read_text(encoding="utf-8")
        self.assertIn("--check", script)
        self.assertIn("webp_manifest.json", script)

    def test_output_validation_rejects_byte_mutation_with_unchanged_dimensions(self):
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        item = manifest["images"][0]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "source.png").write_bytes(b"source exists")
            mutated = root / "mutated.webp"
            data = bytearray((ROOT / item["output"]).read_bytes())
            data[-1] ^= 1
            mutated.write_bytes(data)
            self.assertEqual(generator.webp_dimensions(mutated), (item["width"], item["height"]))
            local_item = {
                "source": "source.png", "output": "mutated.webp",
                "width": item["width"], "height": item["height"], "sha256": item["sha256"],
            }
            local_manifest = root / "manifest.json"
            local_manifest.write_text(json.dumps({
                "version": 1, "tool": "cwebp", "required_version": "1.3.2",
                "defaults": [], "images": [local_item],
            }), encoding="utf-8")
            with mock.patch.object(generator, "ROOT", root), \
                 mock.patch.object(generator, "MANIFEST", local_manifest), \
                 mock.patch.object(generator.shutil, "which", return_value=None):
                with self.assertRaisesRegex(RuntimeError, "sha256 mismatch"):
                    generator.main(["--check"])

    def test_declared_cwebp_version_is_enforced(self):
        completed = mock.Mock(returncode=0, stdout="1.2.4\n", stderr="")
        with mock.patch.object(generator.subprocess, "run", return_value=completed):
            generator.require_cwebp_version("/usr/bin/cwebp", "1.2.4")
            with self.assertRaisesRegex(RuntimeError, "cwebp version mismatch"):
                generator.require_cwebp_version("/usr/bin/cwebp", "1.3.2")


if __name__ == "__main__":
    unittest.main()
