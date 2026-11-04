"""
------------------------------------------------------------------------
File : test_csv_ekg_import.py
Description: Tests for the csv_ekg importer on the ImportRouter (moved
             from soup-server/tests/test_import_service.py: ImportService
             and EventLogHandler are gone, the user picks the importer):
             the choice among the importers of a .csv, a full import
             with FakeDatabase producing an "ekg" object (files, LOAD
             CSV paths, legacy config shape, normalized names), the
             options checked by the importer (one column for two
             standard roles: 400, also through the API), the folder of
             the dataset,
             the compensating delete when the EKG build fails, and the
             "Converti in EKG" operation creating an "ekg" child of a
             csv_table table, whose graph (meta.graph_key) is already the
             active one when it is first opened.
Project : soup-packages/csv_ekg
------------------------------------------------------------------------
"""

from __future__ import annotations

import io
import json

import pytest

from soup.core.contracts import ConflictError, NotFoundError, Upload, ValidationError
from tests.api_client import client_for
from tests.fakes import FakeDatabase, ekg_engine, volume_files
from tests.packages import bundled_api

IMPORTER = "csv_ekg.csv"


def _fixture_options():
    return {
        "event_id": " EventID ",
        "timestamp": " Timestamp",
        "activity": "Activity",
        "entities": ["Items"],
        "values": ["Resource "],
        "trigger_target": [],
    }


@pytest.fixture
def upload(sample_event_log_csv):
    return Upload.from_bytes("sample_event_log.csv", sample_event_log_csv.read_bytes())


def _config(tmp_path, name="orders"):
    return json.loads((tmp_path / "volume" / name / f"{name}_config.json").read_text(encoding="utf-8"))


def _import(engine, upload, name="orders", options=None, description="desc"):
    return engine.import_router.import_(IMPORTER, upload, name, description, _fixture_options() if options is None else options)


# ---------------------------------------------------------------------- #
# Choosing the importer
# ---------------------------------------------------------------------- #

def test_an_unsupported_extension_has_no_importer_and_is_refused(tmp_path, monkeypatch):
    engine = ekg_engine(tmp_path, monkeypatch)

    assert engine.import_router.importers_for("data.txt") == []
    with pytest.raises(ValidationError) as exc_info:
        engine.import_router.inspect(IMPORTER, Upload.from_bytes("data.txt", b"a,b\n"))
    assert ".csv" in str(exc_info.value)


def test_the_same_file_gives_different_objects_with_different_importers(tmp_path, monkeypatch, upload):
    engine = ekg_engine(tmp_path, monkeypatch)

    as_ekg = _import(engine, upload)
    as_table = engine.import_router.import_("csv_table.csv", upload, "orders table")

    assert (as_ekg.kind, as_table.kind) == ("ekg", "table")


def test_an_unknown_importer_is_not_found(tmp_path, monkeypatch, upload):
    engine = ekg_engine(tmp_path, monkeypatch, packages=("tool_memgraph", "tool_storage", "ekg"))

    with pytest.raises(NotFoundError):
        _import(engine, upload)


# ---------------------------------------------------------------------- #
# End-to-end import
# ---------------------------------------------------------------------- #

def test_full_import_with_fake_database_produces_an_ekg_object(tmp_path, monkeypatch, upload):
    db = FakeDatabase()
    engine = ekg_engine(tmp_path, monkeypatch, db=db)

    obj = _import(engine, upload)

    assert (obj.kind, obj.name, obj.description) == ("ekg", "orders", "desc")
    assert (obj.created_by.contributor_id, obj.created_by.package) == (IMPORTER, "csv_ekg")
    assert engine.core_tools.catalog().get(obj.id) == obj
    # The legacy layout: /soup/<name>/<name>.csv, _entity.csv, _config.json.
    assert volume_files(tmp_path) == ["orders/orders.csv", "orders/orders_config.json", "orders/orders_entity.csv"]

    storage = engine.ctx.tool_registry.get("storage")
    load_queries = [q for q in db.received_queries if q.text.startswith("LOAD CSV FROM")]
    assert any(storage.path_for("orders", "orders.csv").replace("\\", "\\\\") in q.text for q in load_queries)
    assert any(storage.path_for("orders", "orders_entity.csv").replace("\\", "\\\\") in q.text for q in load_queries)

    config = _config(tmp_path)
    assert config["source_format"] == "csv"
    assert config["date_created"] is not None
    assert obj.meta["dataset"] == "orders"
    assert obj.meta["mapping"] == {
        "event_id": "EventID", "timestamp": "Timestamp", "activity": "Activity", "entities": ["Items"], "values": ["Resource"],
    }
    assert set(obj.meta["counts"]) == {"event_nodes", "entity_nodes", "corr_rel", "df_rel"}
    assert obj.meta["date_created"] == config["date_created"]
    assert obj.meta["process_info"]["init_time"] == config["process_info"]["init_time"]


def test_config_always_includes_process_info_with_the_legacy_shape(tmp_path, monkeypatch, upload):
    # Regression test: support.service.ts's parseItemToDataset() reads
    # item['process_info']['init_time'] unconditionally for every dataset
    # in the list, with no null check - a missing "process_info" key
    # crashes the whole datasets page (TypeError: Cannot read properties
    # of undefined (reading 'init_time')), not just this one dataset.
    engine = ekg_engine(tmp_path, monkeypatch)
    _import(engine, upload)

    config = _config(tmp_path)

    assert "process_info" in config
    process_info = config["process_info"]

    # Every key Models/dataset_process_info_model.py's
    # DatasetProcessInformation.to_dict() produces must be present.
    expected_keys = {
        "init_time",
        "finish_time",
        "init_class_time",
        "finish_class_time",
        "init_event_time",
        "finish_event_time",
        "init_entity_time",
        "finish_entity_time",
        "init_corr_time",
        "finish_corr_time",
        "init_df_time",
        "finish_df_time",
        "init_class_node_time",
        "finish_class_node_time",
        "init_obs_time",
        "finish_obs_time",
        "init_dfc_time",
        "finish_dfc_time",
    }
    assert expected_keys.issubset(process_info.keys())

    assert process_info["init_time"] is not None
    assert process_info["finish_time"] is not None
    assert process_info["init_time"] == config["date_created"]
    assert process_info["finish_time"] == config["date_modified"]
    # Without save_process_times the phases are not recorded.
    assert process_info["init_event_time"] is None


def test_save_process_times_records_every_phase(tmp_path, monkeypatch, upload):
    engine = ekg_engine(tmp_path, monkeypatch)
    obj = _import(engine, upload, options={**_fixture_options(), "save_process_times": True})

    process_info = _config(tmp_path)["process_info"]
    for phase in ("event", "entity", "corr", "df"):
        assert process_info[f"init_{phase}_time"] is not None
        assert process_info[f"finish_{phase}_time"] is not None
    assert obj.meta["process_info"] == process_info


def test_config_uses_normalized_column_names_not_the_raw_request_ones(tmp_path, monkeypatch, upload):
    # The file has " Order_Id" (leading space) - the graph is built with
    # the normalized "Order_Id", and the legacy code that still reads
    # this config (filters) looks columns up by that same normalized name.
    engine = ekg_engine(tmp_path, monkeypatch)
    _import(engine, upload)

    config = _config(tmp_path)

    assert "Order_Id" in config["all_columns"]
    assert " Order_Id" not in config["all_columns"]

    assert config["filtered_columns"] == ["Items"]
    assert config["values_columns"] == ["Resource"]


def test_config_standard_columns_matches_the_canonical_csv_header_not_the_mapping(tmp_path, monkeypatch, upload):
    # Regression test: the legacy /complete-graph/build used
    # config["standard_columns"] as literal Cypher property names against
    # the canonical events CSV, which always writes the fixed
    # "event_id"/"timestamp"/"activity_name" headers for the standard
    # roles (EventLog.events_csv), regardless of the original column
    # names ("EventID"/"Timestamp"/"Activity" here).
    engine = ekg_engine(tmp_path, monkeypatch)
    _import(engine, upload)

    assert _config(tmp_path)["standard_columns"] == ["event_id", "timestamp", "activity_name"]


def test_trigger_target_pairs_reach_the_causal_step(tmp_path, monkeypatch, upload):
    db = FakeDatabase()
    engine = ekg_engine(tmp_path, monkeypatch, db=db)
    options = {**_fixture_options(), "entities": ["Items", " Order_Id"], "trigger_target": [[" Order_Id", "Items"]]}

    _import(engine, upload, options=options)

    assert _config(tmp_path)["trigger_target_rows"] == [{"trigger": "Order_Id", "target": "Items"}]
    assert any(q.params == {"trigger": "Order_Id", "target": "Items"} for q in db.received_queries)


def test_failed_build_removes_the_staged_dataset(tmp_path, monkeypatch, upload):
    class _ExplodingDatabase(FakeDatabase):
        def run(self, query):
            if query.text.startswith("LOAD CSV"):
                raise RuntimeError("Memgraph is unreachable")
            return super().run(query)

    engine = ekg_engine(tmp_path, monkeypatch, db=_ExplodingDatabase())

    with pytest.raises(RuntimeError):
        _import(engine, upload)

    assert volume_files(tmp_path) == []
    assert [obj for obj in engine.core_tools.catalog().list() if obj.kind == "ekg"] == []
    assert engine.ctx.tool_registry.get("memgraph").current_state() is None


# ---------------------------------------------------------------------- #
# Options and folders
# ---------------------------------------------------------------------- #

@pytest.mark.parametrize("change", [
    {"event_id": None},
    {"timestamp": "missing"},
    {"entities": ["missing"]},
    {"values": "Items"},
    {"trigger_target": [["Items", "Activity"]]},
    {"trigger_target": [["Items"]]},
    {"save_process_times": "maybe"},
])
def test_invalid_options_are_refused_before_anything_is_stored(tmp_path, monkeypatch, upload, change):
    db = FakeDatabase()
    engine = ekg_engine(tmp_path, monkeypatch, db=db)

    with pytest.raises(ValidationError):
        _import(engine, upload, options={**_fixture_options(), **change})

    assert volume_files(tmp_path) == []
    assert db.received_queries == []


def test_one_column_for_two_standard_roles_is_refused_with_400(tmp_path, monkeypatch, sample_event_log_csv):
    db = FakeDatabase()
    engine = ekg_engine(tmp_path, monkeypatch, db=db)
    options = {**_fixture_options(), "timestamp": " EventID "}
    message = "event_id, timestamp and activity must be three different columns: ' EventID ' is used for event_id, timestamp"

    with pytest.raises(ValidationError) as error:
        _import(engine, Upload.from_bytes("log.csv", sample_event_log_csv.read_bytes()), options=options)
    assert str(error.value) == message

    response = client_for(engine).post(
        "/api/v3/imports",
        data={"file": (io.BytesIO(sample_event_log_csv.read_bytes()), "log.csv"), "importer_id": IMPORTER,
              "name": "orders", "options": json.dumps(options)},
        content_type="multipart/form-data",
    )
    assert response.status_code == 400
    assert response.get_json()["message"] == message
    assert volume_files(tmp_path) == []
    assert db.received_queries == []


def test_two_objects_with_the_same_name_get_two_folders(tmp_path, monkeypatch, upload):
    engine = ekg_engine(tmp_path, monkeypatch)

    first, second = _import(engine, upload), _import(engine, upload)

    assert (first.meta["dataset"], second.meta["dataset"]) == ("orders", "orders_2")


def test_an_explicit_dataset_folder_that_exists_is_a_conflict(tmp_path, monkeypatch, upload):
    engine = ekg_engine(tmp_path, monkeypatch)
    _import(engine, upload, options={**_fixture_options(), "dataset": "orders"})

    with pytest.raises(ConflictError):
        _import(engine, upload, name="again", options={**_fixture_options(), "dataset": "orders"})


# ---------------------------------------------------------------------- #
# Inspect and preview
# ---------------------------------------------------------------------- #

def test_inspect_offers_the_fields_of_the_old_form(tmp_path, monkeypatch, upload):
    engine = ekg_engine(tmp_path, monkeypatch)

    inspection = engine.import_router.inspect(IMPORTER, upload)

    fields = {field.name: field for field in inspection.fields}
    assert {name: field.type for name, field in fields.items()} == {
        "event_id": "column", "timestamp": "column", "activity": "column",
        "entities": "columns", "values": "columns", "trigger_target": "pairs", "save_process_times": "bool",
    }
    assert all(fields[name].required for name in ("event_id", "timestamp", "activity"))
    assert (fields["event_id"].default, fields["timestamp"].default, fields["activity"].default) == (
        " EventID ", " Timestamp", "Activity",
    )
    [block] = inspection.preview
    assert block["type"] == "table"
    assert block["data"]["columns"][0] == " EventID "


def test_preview_with_two_entity_columns_shows_their_multiplicities(tmp_path, monkeypatch):
    csv = b"id,act,ts,order,item,customer\n1,A,t,o1,i1,c1\n2,B,t,o1,i2,c1\n3,C,t,o2,i3,c1\n"
    upload = Upload.from_bytes("orders.csv", csv)
    engine = ekg_engine(tmp_path, monkeypatch)

    assert [block["type"] for block in engine.import_router.preview(IMPORTER, upload, {"entities": ["order"]})] == ["table"]

    blocks = engine.import_router.preview(IMPORTER, upload, {"entities": ["order", "item", "customer"]})

    assert [block["type"] for block in blocks] == ["table", "graph"]
    graph = blocks[1]["data"]
    assert [node["id"] for node in graph["nodes"]] == ["order", "item", "customer"]
    assert {(edge["source"], edge["target"]): edge["group"] for edge in graph["edges"]} == {
        ("order", "item"): "1 to N",
        ("order", "customer"): "N to 1",
        ("item", "customer"): "N to 1",
    }
    assert graph["directed"] is False


def test_preview_ignores_a_standard_column_ticked_as_entity(tmp_path, monkeypatch):
    upload = Upload.from_bytes("orders.csv", b"id,act,ts,order\n1,A,t,o1\n")
    engine = ekg_engine(tmp_path, monkeypatch)

    blocks = engine.import_router.preview(IMPORTER, upload, {"event_id": "id", "entities": ["id", "order"]})

    assert [block["type"] for block in blocks] == ["table"]


def test_inspect_and_preview_do_not_touch_memgraph(tmp_path, monkeypatch, upload):
    db = FakeDatabase()
    engine = ekg_engine(tmp_path, monkeypatch, db=db)

    engine.import_router.inspect(IMPORTER, upload)
    engine.import_router.preview(IMPORTER, upload, {"entities": ["Items", " Order_Id"]})

    assert db.received_queries == []
    assert volume_files(tmp_path) == []


# ---------------------------------------------------------------------- #
# Converti in EKG
# ---------------------------------------------------------------------- #

CSV_TABLE = b"case;activity;time;order\n1;Create;2021-01-01T10:00:00.000;o1\n2;Ship;2021-01-01T11:00:00.000;\n"


def test_converti_in_ekg_creates_an_ekg_child_of_the_table(tmp_path, monkeypatch):
    db = FakeDatabase()
    engine = ekg_engine(tmp_path, monkeypatch, db=db)
    table = engine.import_router.import_("csv_table.csv", Upload.from_bytes("orders.csv", CSV_TABLE), "orders")

    keys = {entry.key: entry for entry in engine.operation_router.operations_for([table.id])}
    assert "csv_ekg.to_ekg" in keys
    assert keys["csv_ekg.to_ekg"].item.label == "Converti in EKG"
    fields = {field.name: field for field in engine.operation_router.fields("csv_ekg.to_ekg", [table.id])}
    assert fields["event_id"].choice_values() == ("case", "activity", "time", "order")

    [child] = engine.operation_router.run(
        "csv_ekg.to_ekg", [table.id], {"event_id": "case", "timestamp": "time", "activity": "activity", "entities": ["order"]}
    )

    assert (child.kind, child.name, child.parents) == ("ekg", "orders (EKG)", (table.id,))
    assert (child.created_by.type, child.created_by.contributor_id) == ("operation", "csv_ekg.to_ekg")
    assert child.meta["dataset"] == "orders (EKG)"
    assert child.meta["source_format"] == "csv_table"
    rows = (tmp_path / "volume" / "orders (EKG)" / "orders (EKG)_entity.csv").read_text(encoding="utf-8").splitlines()
    assert rows == ["value,type", "o1,order"]  # the empty cell is no entity
    assert any(q.text.startswith("LOAD CSV") for q in db.received_queries)
    # The graph was built under the child's graph key: it is the active state.
    assert engine.ctx.tool_registry.get("memgraph").current_state() == child.meta["graph_key"]


def _tools(engine):
    return engine.core_tools.toolbox("test", ("memgraph", "storage"))


def test_after_converti_in_ekg_the_first_opening_does_not_rebuild(tmp_path, monkeypatch):
    ekg = bundled_api("ekg")
    db = FakeDatabase()
    engine = ekg_engine(tmp_path, monkeypatch, db=db)
    table = engine.import_router.import_("csv_table.csv", Upload.from_bytes("orders.csv", CSV_TABLE), "orders")
    [child] = engine.operation_router.run(
        "csv_ekg.to_ekg", [table.id], {"event_id": "case", "timestamp": "time", "activity": "activity"}
    )
    builds = len(db.received_queries)

    assert ekg.ensure_loaded(child, _tools(engine)) is False
    # Only the check that the graph is still in the database.
    assert [query.text for query in db.received_queries[builds:]] == [db.ANY_NODE]

    # Once another object is opened, the child is built again, under the same key.
    other = engine.import_router.import_(
        IMPORTER, Upload.from_bytes("o.csv", CSV_TABLE.replace(b";", b",")), "other",
        options={"event_id": "case", "timestamp": "time", "activity": "activity"},
    )
    assert other.meta["graph_key"] != child.meta["graph_key"]
    start = len(db.received_queries)
    assert ekg.ensure_loaded(child, _tools(engine)) is True
    assert any(q.text.startswith("LOAD CSV") for q in db.received_queries[start:])
    assert engine.ctx.tool_registry.get("memgraph").current_state() == child.meta["graph_key"]
    assert ekg.ensure_loaded(child, _tools(engine)) is False


def test_two_converted_objects_have_different_graph_keys(tmp_path, monkeypatch):
    engine = ekg_engine(tmp_path, monkeypatch)
    table = engine.import_router.import_("csv_table.csv", Upload.from_bytes("orders.csv", CSV_TABLE), "orders")
    params = {"event_id": "case", "timestamp": "time", "activity": "activity"}

    [first] = engine.operation_router.run("csv_ekg.to_ekg", [table.id], params)
    [second] = engine.operation_router.run("csv_ekg.to_ekg", [table.id], params)

    assert first.meta["graph_key"] and second.meta["graph_key"]
    assert first.meta["graph_key"] != second.meta["graph_key"]
    assert (first.meta["dataset"], second.meta["dataset"]) == ("orders (EKG)", "orders (EKG)_2")


def test_converti_in_ekg_checks_its_parameters(tmp_path, monkeypatch):
    engine = ekg_engine(tmp_path, monkeypatch)
    table = engine.import_router.import_("csv_table.csv", Upload.from_bytes("orders.csv", CSV_TABLE), "orders")

    with pytest.raises(ValidationError):
        engine.operation_router.run("csv_ekg.to_ekg", [table.id], {"event_id": "case", "timestamp": "nope", "activity": "activity"})


def test_deleting_the_table_with_cascade_removes_the_ekg_child(tmp_path, monkeypatch):
    engine = ekg_engine(tmp_path, monkeypatch)
    table = engine.import_router.import_("csv_table.csv", Upload.from_bytes("orders.csv", CSV_TABLE), "orders")
    [child] = engine.operation_router.run(
        "csv_ekg.to_ekg", [table.id], {"event_id": "case", "timestamp": "time", "activity": "activity"}
    )

    assert engine.workspace_service.delete(table.id, cascade=True) == [child.id, table.id]
    assert [path for path in volume_files(tmp_path) if path.startswith("orders (EKG)/")] == []
