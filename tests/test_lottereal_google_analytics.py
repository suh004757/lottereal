import ast
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "lottereal_google_analytics.py"


def load_metric_value():
    tree = ast.parse(SCRIPT_PATH.read_text(encoding="utf-8"))
    function = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "metric_value"
    )
    module = ast.Module(body=[function], type_ignores=[])
    namespace = {}
    exec(compile(ast.fix_missing_locations(module), str(SCRIPT_PATH), "exec"), namespace)
    return namespace["metric_value"]


class MetricValueTests(unittest.TestCase):
    def test_missing_rows_and_short_metric_arrays_zero_fill(self):
        metric_value = load_metric_value()

        self.assertEqual(metric_value({}, 0), "0")
        self.assertEqual(metric_value({"metricValues": []}, 2), "0")
        self.assertEqual(
            metric_value({"metricValues": [{"value": "3"}]}, 3),
            "0",
        )

    def test_available_metric_is_preserved(self):
        metric_value = load_metric_value()

        self.assertEqual(
            metric_value({"metricValues": [{"value": "3"}, {"value": "7"}]}, 1),
            "7",
        )


if __name__ == "__main__":
    unittest.main()