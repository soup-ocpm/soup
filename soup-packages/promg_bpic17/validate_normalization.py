"""Opt-in integration checks; creates and drops only its own temporary database.

Run with SOUP's NEO4J_URI/NEO4J_USERNAME/NEO4J_PASSWORD available:
    SOUP_PROMG_TEST_CREATE_DATABASE=1 python soup-packages/promg_bpic17/validate_normalization.py
"""

from __future__ import annotations

import os
import subprocess
import sys
import unittest
from collections import Counter
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from neo4j import GraphDatabase
from neo4j.exceptions import Neo4jError
from server.normalize import df_types, entity_types, normalize_graph


@unittest.skipUnless(
    os.environ.get("NEO4J_URI")
    and os.environ.get("SOUP_PROMG_TEST_CREATE_DATABASE") == "1",
    "Opt-in temporary database tests not enabled",
)
class NormalizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.name = "soup-promg-test-" + uuid4().hex
        cls.driver = GraphDatabase.driver(
            os.environ["NEO4J_URI"],
            auth=(
                os.environ.get("NEO4J_USERNAME", "neo4j"),
                os.environ["NEO4J_PASSWORD"],
            ),
        )
        try:
            with cls.driver.session(database="system") as session:
                session.run(f"CREATE DATABASE `{cls.name}` WAIT").consume()
        except BaseException:
            cls.driver.close()
            raise

    @classmethod
    def tearDownClass(cls):
        try:
            with cls.driver.session(database="system") as session:
                session.run(f"DROP DATABASE `{cls.name}` IF EXISTS WAIT").consume()
        finally:
            cls.driver.close()

    def execute(self, query, parameters=None):
        with self.driver.session(database=self.name) as session:
            return session.run(query, parameters or {}).data()

    backend = "neo4j"

    def setUp(self):
        self.execute(
            "MATCH (n) DETACH DELETE n"
        )  # This test's uniquely created DB only.
        self.execute(
            "UNWIND range(0, 20) AS i CREATE (:Event {sysId: toString(i), "
            'activity: "a", timestamp: datetime("2017-08-20T16:00:02.530Z"), test_id: i})'
        )
        self.execute('CREATE (:Activity {activity: "a"})')
        for kind in entity_types():
            self.execute(
                f'CREATE (:Entity:`{kind}` {{sysId: $kind, type: "native"}})',
                {"kind": kind},
            )
        self.execute(
            "MATCH (e:Event), (n:Entity) CREATE (e)-[:CORR {native: true}]->(n)"
        )
        for native, _ in df_types():
            self.execute(
                f"MATCH (a:Event), (b:Event) WHERE b.test_id = a.test_id + 1 "
                f"CREATE (a)-[:`{native}` {{native: true, test_id: a.test_id}}]->(b)"
            )
        # Parallel native edges must produce parallel projections, not be merged.
        native = df_types()[0][0]
        self.execute(
            f"MATCH (a:Event {{test_id: 0}}), (b:Event {{test_id: 1}}) "
            f"CREATE (a)-[:`{native}` {{native: true, test_id: 999}}]->(b)"
        )

    def snapshot(self):
        nodes = self.execute(
            "MATCH (n) RETURN labels(n) AS labels, properties(n) AS props"
        )
        edges = self.execute(
            "MATCH (a)-[r]->(b) RETURN elementId(r) AS id, "
            "a.sysId AS a, b.sysId AS b, type(r) AS type, properties(r) AS props"
        )
        sources = {
            row["id"]: (row["a"], row["b"], row["type"], row["props"].get("test_id"))
            for row in edges
        }
        for edge in edges:
            edge.pop("id")
            if "_soup_promg_source" in edge["props"]:
                edge["props"]["_soup_promg_source"] = sources[
                    edge["props"]["_soup_promg_source"]
                ]
        return (
            Counter(
                repr((sorted(row["labels"]), sorted(row["props"].items())))
                for row in nodes
            ),
            Counter(
                repr((row["a"], row["b"], row["type"], sorted(row["props"].items())))
                for row in edges
            ),
        )

    def test_fresh_and_idempotent(self):
        info = {}
        summary = normalize_graph(self, "test-owner", batch_size=5, process_info=info)
        self.assertEqual(summary["events"], 21)
        self.assertTrue(
            {"normalization_nodes", "normalization_corr", "normalization_df"}
            <= info["duration_seconds"].keys()
        )
        self.assertEqual(
            self.execute(
                'MATCH (n) WHERE n.Log <> "test-owner" OR n.Log IS NULL RETURN count(n) AS count'
            )[0]["count"],
            0,
        )
        self.assertEqual(
            self.execute(
                'MATCH (n:Entity) WHERE n.type <> "native" OR n.Type IS NULL RETURN count(n) AS count'
            )[0]["count"],
            0,
        )
        for native, kind in df_types():
            expected = 21 if native == df_types()[0][0] else 20
            self.assertEqual(summary["df_by_type"][kind], expected)
        self.assertEqual(
            self.execute(
                "MATCH (:Event)-[r:CORR]->(n:Entity) WHERE r.Type <> n.Type OR r.Type IS NULL "
                "RETURN count(r) AS count"
            )[0]["count"],
            0,
        )
        self.assertEqual(
            self.execute(
                "MATCH (a:Event)-[df:DF]->(b:Event) "
                "MATCH (x)-[native]->(y) WHERE elementId(native) = df._soup_promg_source "
                "AND (a <> x OR b <> y OR native.test_id <> df.test_id) "
                "RETURN count(df) AS count"
            )[0]["count"],
            0,
        )
        self.assertEqual(
            self.execute(
                "MATCH ()-[df:DF]->() WITH df._soup_promg_source AS source, count(df) AS copies "
                "WHERE copies <> 1 RETURN count(*) AS count"
            )[0]["count"],
            0,
        )
        before = self.snapshot()
        self.assertEqual(normalize_graph(self, "test-owner", batch_size=5), summary)
        self.assertEqual(self.snapshot(), before)

    def test_resume_after_committed_projection_batch(self):
        # Force a native subtransaction failure after the first five DF rows.
        native = df_types()[0][0]
        self.execute(
            f"MATCH ()-[r:`{native}`]->() WHERE r.test_id = 6 SET r.fail_batch = true"
        )
        original_execute = self.execute

        def interrupted(query, parameters=None):
            if "original._soup_projected IS NULL" in query:
                query = query.replace(
                    "CREATE (a)-[df:DF]->(b)",
                    "CREATE (a)-[df:DF]->(b) SET df.failure = CASE WHEN original.fail_batch THEN point({x: original.test_id}) ELSE null END",
                )
            return original_execute(query, parameters)

        self.execute = interrupted
        try:
            with self.assertRaises(Neo4jError):
                normalize_graph(self, "test-owner", batch_size=5)
        finally:
            del self.execute
        count = self.execute("MATCH ()-[r:DF]->() RETURN count(r) AS count")[0]["count"]
        self.assertGreater(count, 0)
        self.assertLess(count, 21)
        self.execute(f"MATCH ()-[r:`{native}`]->() REMOVE r.fail_batch")
        summary = normalize_graph(self, "test-owner", batch_size=5)
        self.assertEqual(summary["df_by_type"][df_types()[0][1]], 21)
        before = self.snapshot()
        normalize_graph(self, "test-owner", batch_size=5)
        self.assertEqual(self.snapshot(), before)


class QueryStructureTests(unittest.TestCase):
    def test_worker_timing_import_without_soup(self):
        package = Path(__file__).resolve().parent / "server"
        code = "\n".join(
            [
                "import sys",
                'sys.modules["soup"] = None',
                f"sys.path.insert(0, {str(package)!r})",
                "from normalize import timed_phase",
                "info = {}",
                'with timed_phase(info, "worker"):',
                "    pass",
                'assert info["duration_seconds"]["worker"] >= 0',
            ]
        )
        with TemporaryDirectory() as directory:
            result = subprocess.run(
                [sys.executable, "-I", "-c", code],
                cwd=directory,
                capture_output=True,
                text=True,
                check=False,
            )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_single_scan_and_atomic_projection(self):
        queries = []

        class Capture:
            backend = "neo4j"

            def execute(self, query, parameters=None):
                queries.append((query, parameters))
                return [] if "RETURN r.Type AS kind" in query else [{"count": 0}]

        info = {}
        normalize_graph(Capture(), "test-owner", batch_size=7, process_info=info)
        writes = [query for query, _ in queries if "IN TRANSACTIONS" in query]
        self.assertEqual(len(writes), len(entity_types()) + 3 + len(df_types()))
        for query in writes:
            self.assertNotIn("LIMIT", query)
            self.assertLess(query.index("CALL"), query.index(" WHERE "))
        for query in writes:
            if "CREATE (a)-[df:DF]->(b)" in query:
                self.assertIn("original._soup_projected = true", query)
                self.assertIn("df._soup_promg_source = elementId(original)", query)
                self.assertIn("SET df += properties(original)", query)
        self.assertEqual(
            sum("RETURN r.Type AS kind" in query for query, _ in queries), 1
        )
        self.assertTrue(
            {"normalization_nodes", "normalization_corr", "normalization_df"}
            <= info["duration_seconds"].keys()
        )


if __name__ == "__main__":
    unittest.main()
