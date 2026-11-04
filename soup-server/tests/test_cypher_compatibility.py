"""
------------------------------------------------------------------------
File : test_cypher_compatibility.py
Description: The Cypher of the packages must run on the Memgraph of
             docker-compose.yaml. Memgraph 2.x (memgraph-platform 2.14.1)
             does not implement list comprehensions ([x IN list | expr],
             [x IN list WHERE cond]) nor pattern comprehensions
             ([(a)-->(b) | expr]): "Not yet implemented: atom expression".
             extract(x IN list | expr) and the other list functions are
             supported. Checked twice: on every string literal of the
             server code of every package (f-strings with their
             placeholders), and on the queries actually sent to
             FakeDatabase by an engine with every EKG package, while it
             imports (CSV and OCEL), opens the visualizers, runs every
             interrogation and the insights actions and exports.
             Also: docker-compose.yaml pins the Memgraph images (memgraph and
             lab, same version, never "latest") and the smoke tests of
             ekg_views and ekg_analysis are documented with that image.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest

from soup.core.contracts import Upload
from tests.fakes import ANALYSIS_PACKAGES, FakeDatabase, ekg_engine
from tests.packages import bundled_module

PACKAGES_ROOT = Path(__file__).resolve().parent.parent.parent / "soup-packages"

# "[x IN" opens a list comprehension (with "|" or only WHERE); "[(" followed
# by a node pattern and a relationship opens a pattern comprehension.
_LIST_COMPREHENSION = re.compile(r"\[\s*[A-Za-z_][A-Za-z0-9_]*\s+IN\s", re.IGNORECASE)
_PATTERN_COMPREHENSION = re.compile(r"\[\s*\([^()\[\]]*\)\s*(<-|-)")


def comprehensions(text: str) -> list[str]:
    return [match.group(0) for regex in (_LIST_COMPREHENSION, _PATTERN_COMPREHENSION) for match in regex.finditer(text)]


@pytest.mark.parametrize("text", [
    "WITH [x IN events | x.ActivityName] AS variant",
    "RETURN [x IN list WHERE x > 1]",
    "RETURN [ n in nodes(p) | n.Value ]",
    "RETURN [(a)-[:CORR]->(b) | b.Value]",
    "RETURN [(a)<--(b) | b]",
    "RETURN size([(n:Event)-->() | n])",
])
def test_the_detector_finds_comprehensions(text):
    assert comprehensions(text)


@pytest.mark.parametrize("text", [
    "WITH extract(x IN events | x.ActivityName) AS variant",
    "WHERE e.ActivityName IN $activities",
    "RETURN [1, 2, 3], labels(n)[0]",
    "WHERE all(x IN nodes(p) WHERE x.Type = $type)",
    "RETURN reduce(total = 0, x IN [1, 2] | total + x)",
    "MATCH (a)-[r:DF]->(b) RETURN [a.Event_Id, b.Event_Id]",
])
def test_the_detector_leaves_the_supported_forms(text):
    assert comprehensions(text) == []


def _literals(tree: ast.AST) -> list[tuple[int, str]]:
    """Every string literal of a module, f-strings with "X" for their placeholders."""

    found: list[tuple[int, str]] = []
    inside_fstrings: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.JoinedStr):
            text = "".join(
                part.value if isinstance(part, ast.Constant) and isinstance(part.value, str) else "X"
                for part in node.values
            )
            found.append((node.lineno, text))
            inside_fstrings.update(id(part) for part in node.values)
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in inside_fstrings:
            found.append((node.lineno, node.value))
    return found


def test_no_string_of_the_packages_server_code_has_a_comprehension():
    files = sorted(path for path in PACKAGES_ROOT.glob("*/server/**/*.py") if "__pycache__" not in path.parts)
    assert len(files) > 40
    violations = []
    for path in files:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for line, text in _literals(tree):
            for found in comprehensions(text):
                violations.append(f"{path.relative_to(PACKAGES_ROOT).as_posix()}:{line}: {found!r}")
    assert violations == []


CSV = b"case,activity,time,order,item\n1,Create,2021-01-01T10:00:00.000,o1,i1\n2,Ship,2021-01-01T11:00:00.000,o1,i2\n"
OPTIONS = {"event_id": "case", "timestamp": "time", "activity": "activity", "entities": ["order", "item"]}
OCEL = Path(__file__).resolve().parent.parent.parent / "soup-packages" / "ocel" / "tests" / "fixtures" / "orders.json"
QUERY_PARAMS = {
    "entities_of_type": {"type": "order"},
    "events_of_activity": {"activity": "Create"},
    "df_of_type": {"entity_type": "order"},
}


def test_no_query_sent_to_memgraph_by_the_packages_has_a_comprehension(tmp_path, monkeypatch):
    filters = bundled_module("ekg_analysis", "filters")
    db = FakeDatabase()
    db.set_response(filters.entity_types_query().text, [{"entity_type": "order"}, {"entity_type": "item"}])
    engine = ekg_engine(tmp_path, monkeypatch, packages=(*ANALYSIS_PACKAGES, "ocel"), db=db)
    assert engine.report.failed == [], engine.report.failed
    root = engine.import_router.import_("csv_ekg.csv", Upload.from_bytes("orders.csv", CSV), "orders", options=OPTIONS)
    engine.import_router.import_("ocel.ekg", Upload.from_bytes("orders.json", OCEL.read_bytes()), "ocel orders")

    visualizers = engine.visualizer_router
    for key in ("ekg_views.graph", "ekg_views.stats", "ekg_views.queries", "ekg_analysis.insights"):
        visualizers.data(key, root.id)
    visualizers.action("ekg_analysis.insights", root.id, "entity", {"entity": "item"})
    visualizers.action("ekg_analysis.insights", root.id, "frequency", {"min": 2})
    visualizers.action("ekg_views.graph", root.id, "search", {"view": "standard", "text": "o", "kind": "node"})
    queries = visualizers.data("ekg_views.queries", root.id)
    keys = [query["key"] for group in queries["groups"] for query in group["queries"]]
    for key in keys:
        visualizers.action("ekg_views.queries", root.id, "query", {"key": key, "params": QUERY_PARAMS.get(key, {})})
    [parts] = engine.export_router.fields("ekg_views.json", root.id)
    engine.export_router.export("ekg_views.json", root.id, {"parts": [choice.value for choice in parts.choices]})

    texts = [query.text for query in db.received_queries]
    assert len(keys) >= 20 and len(texts) > 60
    assert any("extract(x IN events | x.ActivityName)" in text for text in texts)
    assert [(text, comprehensions(text)) for text in texts if comprehensions(text)] == []


REPOSITORY = PACKAGES_ROOT.parent
SMOKE_FILES = (
    "soup-packages/ekg_views/README.md",
    "soup-packages/ekg_views/tests/memgraph_smoke.py",
    "soup-packages/ekg_analysis/README.md",
    "soup-packages/ekg_analysis/tests/memgraph_smoke.py",
)


def _compose_images() -> dict[str, str]:
    images, service = {}, None
    for line in (REPOSITORY / "docker-compose.yaml").read_text(encoding="utf-8").splitlines():
        if re.match(r"^  [a-z][a-z-]*:\s*$", line):
            service = line.strip().rstrip(":")
        match = re.match(r"^\s+image:\s*(\S+)", line)
        if match and service:
            images[service] = match.group(1)
    return images


def test_compose_pins_the_memgraph_images_and_the_smoke_tests_use_the_same():
    images = _compose_images()
    memgraph, lab = images["memgraph"], images["lab"]
    assert memgraph.startswith("memgraph/memgraph:") and lab.startswith("memgraph/lab:")
    for image in (memgraph, lab):
        tag = image.rpartition(":")[2]
        assert re.fullmatch(r"\d+\.\d+\.\d+", tag), image  # never the implicit "latest"
    assert memgraph.rpartition(":")[2] == lab.rpartition(":")[2]
    # Not the Memgraph image: its VOLUMEs would leave anonymous volumes at each run.
    assert re.fullmatch(r"alpine:\d+\.\d+\.\d+", images["volume-init"])
    for path in SMOKE_FILES:
        text = (REPOSITORY / path).read_text(encoding="utf-8")
        assert re.findall(r"docker run [^\n]*memgraph/\S+", text) and all(
            command.endswith(memgraph) for command in re.findall(r"docker run [^\n]*memgraph/\S+", text)
        ), path
    assert f"Memgraph {memgraph.rpartition(':')[2]}" in (REPOSITORY / "README.md").read_text(encoding="utf-8")
