import copy
import importlib.util
import json
import tempfile
import unittest
from unittest import mock
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "reb_weekly_apt_rows.json"
spec = importlib.util.spec_from_file_location("update_weekly_market_chart", ROOT / "scripts" / "update_weekly_market_chart.py")
chart = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chart)


class WeeklyMarketChartTests(unittest.TestCase):
    def setUp(self):
        self.rows = json.loads(FIXTURE.read_text(encoding="utf-8"))

    def test_changes_match_published_reb_weekly_rates(self):
        data = chart.build_series(self.rows)
        values = {r["label"]: (r["change_pct"], r["previous_change_pct"]) for r in data["regions"]}
        self.assertEqual(data["survey_date"], "2026-10-12")
        self.assertEqual(values["서울"], (0.16, 0.12))
        self.assertEqual(values["강남구"], (-0.35, -0.34))
        self.assertEqual(values["송파구"], (-0.21, -0.19))
        self.assertEqual(values["경기"], (0.26, 0.18))
        self.assertEqual(values["전국"][0], 0.10)

    def test_copy_is_derived_from_data(self):
        data = chart.build_series(self.rows)
        self.assertEqual(chart.headline(data), "서울은 오르고, 강남 3구는 내렸습니다")
        self.assertIn("2026년 10월 둘째 주(10월 12일 기준)", chart.lead(data))
        self.assertIn("하락 폭이 커졌습니다", chart.lead(data))
        flipped = copy.deepcopy(data)
        for region in flipped["regions"]:
            region["change_pct"] = abs(region["change_pct"]) or 0.01
        self.assertEqual(chart.headline(flipped), "서울과 강남 3구가 함께 올랐습니다")
        self.assertEqual(chart.trend_phrase(0.1, -0.1), "상승으로 전환했습니다")

    def test_rejects_incomplete_mismatched_or_implausible_data(self):
        missing = [r for r in self.rows if not r["CLS_FULLNM"].endswith("서초구")]
        with self.assertRaises(chart.ChartDataError):
            chart.build_series(missing)
        shifted = copy.deepcopy(self.rows)
        for row in shifted:
            if row["CLS_FULLNM"] == "경기" and row["WRTTIME_DESC"] == "2026-10-12":
                row["WRTTIME_DESC"] = "2026-10-19"
        with self.assertRaises(chart.ChartDataError):
            chart.build_series(shifted)
        spiked = copy.deepcopy(self.rows)
        for row in spiked:
            if row["CLS_FULLNM"] == "서울" and row["WRTTIME_DESC"] == "2026-10-12":
                row["DTA_VAL"] = row["DTA_VAL"] * 1.2
        with self.assertRaises(chart.ChartDataError):
            chart.build_series(spiked)

    def test_rejects_impossible_and_nonconsecutive_weekly_dates(self):
        impossible = copy.deepcopy(self.rows)
        for row in impossible:
            if row["WRTTIME_DESC"] == "2026-10-12":
                row["WRTTIME_DESC"] = "2026-02-30"
        with self.assertRaisesRegex(chart.ChartDataError, "invalid weekly date"):
            chart.build_series(impossible)
        gapped = copy.deepcopy(self.rows)
        for row in gapped:
            if row["WRTTIME_DESC"] == "2026-10-05":
                row["WRTTIME_DESC"] = "2026-10-04"
        with self.assertRaisesRegex(chart.ChartDataError, "7 days apart"):
            chart.build_series(gapped)

    def test_published_home_matches_published_evidence(self):
        home = (ROOT / "public" / "index.html").read_text(encoding="utf-8")
        published = json.loads((ROOT / "public" / "Data" / "weekly-apt-change.json").read_text(encoding="utf-8"))
        block = chart.render_block(published)
        self.assertIn(block, home)
        self.assertNotIn("<script", block)
        self.assertEqual(published["statbl_id"], "T244183132827305")

    def test_rerun_with_same_rows_is_noop(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_home = Path(tmp) / "index.html"
            tmp_evidence = Path(tmp) / "weekly.json"
            tmp_home.write_text((ROOT / "public" / "index.html").read_text(encoding="utf-8"), encoding="utf-8")
            args = ["--input", str(FIXTURE), "--home", str(tmp_home), "--evidence", str(tmp_evidence)]
            self.assertEqual(chart.main(args), 0)
            first = tmp_home.read_text(encoding="utf-8")
            self.assertIn(chart.render_block(chart.build_series(self.rows)), first)
            self.assertEqual(chart.main(args), 0)
            self.assertEqual(tmp_home.read_text(encoding="utf-8"), first)

    def test_refuses_to_move_backwards(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_home = Path(tmp) / "index.html"
            tmp_home.write_text((ROOT / "public" / "index.html").read_text(encoding="utf-8"), encoding="utf-8")
            tmp_evidence = Path(tmp) / "weekly.json"
            tmp_evidence.write_text(json.dumps({"survey_date": "2026-12-31"}), encoding="utf-8")
            with self.assertRaises(chart.ChartDataError):
                chart.main(["--input", str(FIXTURE), "--home", str(tmp_home), "--evidence", str(tmp_evidence)])

    def test_pair_publication_recovers_after_second_replace_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp) / "index.html"
            evidence = Path(tmp) / "weekly.json"
            home.write_text((ROOT / "public" / "index.html").read_text(encoding="utf-8"), encoding="utf-8")
            evidence.write_text('{"survey_date":"2026-01-01"}\n', encoding="utf-8")
            before = (home.read_bytes(), evidence.read_bytes())
            original_replace = chart.os.replace
            failed = False

            def fail_second(source, target):
                nonlocal failed
                if Path(target) == evidence and not failed:
                    failed = True
                    raise OSError("injected evidence replace failure")
                return original_replace(source, target)

            with mock.patch.object(chart.os, "replace", side_effect=fail_second):
                with self.assertRaisesRegex(OSError, "injected evidence replace failure"):
                    chart.main(["--input", str(FIXTURE), "--home", str(home), "--evidence", str(evidence)])
            self.assertEqual((home.read_bytes(), evidence.read_bytes()), before)
            self.assertEqual(chart.main(["--input", str(FIXTURE), "--home", str(home), "--evidence", str(evidence)]), 0)
            self.assertFalse((Path(tmp) / ".weekly-market-chart.publish").exists())


if __name__ == "__main__":
    unittest.main()
