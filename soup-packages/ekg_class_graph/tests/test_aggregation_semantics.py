"""Dependency-light contract tests for the SOUP class aggregation query builder.

Run with `python -m unittest discover -s tests` from the package root.
The installed SOUP app is not required to inspect query construction.
"""
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]


class Query:
    def __init__(self, text, params=None):
        self.text = text
        self.params = params or {}


def load_classes():
    ekg_api = types.ModuleType("soup_pkg_ekg.api")
    ekg_api.Query = Query
    ekg_api.ident = lambda name: "`" + name.replace("`", "``") + "`"
    ekg_package = types.ModuleType("soup_pkg_ekg")
    ekg_package.api = ekg_api
    views_api = types.ModuleType("soup_pkg_ekg_views.api")
    views_api.count_of = lambda rows: rows[0]["count"] if rows else 0
    views_package = types.ModuleType("soup_pkg_ekg_views")
    views_package.api = views_api
    contracts = types.ModuleType("soup.core.contracts")
    contracts.DomainError = type("DomainError", (Exception,), {})
    contracts.ValidationError = type("ValidationError", (Exception,), {})
    soup = types.ModuleType("soup")
    core = types.ModuleType("soup.core")
    with mock.patch.dict(sys.modules, {
        "soup_pkg_ekg": ekg_package, "soup_pkg_ekg.api": ekg_api,
        "soup_pkg_ekg_views": views_package, "soup_pkg_ekg_views.api": views_api,
        "soup": soup, "soup.core": core, "soup.core.contracts": contracts,
    }):
        spec = importlib.util.spec_from_file_location("isolated_classes", ROOT / "server/classes.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    return module


class AggregationContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.classes = load_classes()

    def test_zero_entities_aggregates_by_activity(self):
        query = self.classes.class_query([])
        self.assertIn('e.`ActivityName` AS v0', query.text)
        self.assertIn('MATCH (e:`Event` {`ActivityName`: v0})', query.text)
        self.assertIn('MERGE (e)-[:`OBSERVED`]->(c)', query.text)
        self.assertEqual(query.params, {"class_type": "Class"})

    def test_selected_entities_are_additional_and_dimensions(self):
        query = self.classes.class_query(["Order", "Item"])
        self.assertIn('e.`ActivityName` AS v0, e.`Order` AS v1, e.`Item` AS v2', query.text)
        self.assertIn('MATCH (e:`Event` {`ActivityName`: v0, `Order`: v1, `Item`: v2})', query.text)
        self.assertIn('toString(v0) + "_" + toString(v1) + "_" + toString(v2)', query.text)

    def test_duplicate_activity_does_not_add_dimension(self):
        query = self.classes.class_query(["ActivityName", "Order", "Order"])
        self.assertIn('e.`ActivityName` AS v0, e.`Order` AS v1', query.text)
        self.assertNotIn(' AS v2', query.text)

    def test_weights_and_df_type_preserved(self):
        weight = self.classes.class_weight_query().text
        df = self.classes.class_df_query().text
        self.assertIn('count(obs) AS weight', weight)
        self.assertIn('SET c.Count = weight', weight)
        self.assertIn('count(r) AS df_freq', df)
        self.assertIn('r.Type AS c_type', df)
        self.assertIn('edge_weight: df_freq', df)
        self.assertIn('[r:`DF`]', df)

    def test_replay_accepts_missing_or_empty_entity_selection(self):
        # Provider validation is part of the persisted derived-state contract.
        source = (ROOT / 'server/provider.py').read_text()
        self.assertIn('spec.get("entity_types", [])', source)
        self.assertNotIn('not types or', source)

    def test_form_is_optional(self):
        source = (ROOT / 'server/operations.py').read_text()
        self.assertIn('required=False, choices=', source)
        self.assertIn('params.get("entity_types") or []', source)


if __name__ == '__main__':
    unittest.main()
