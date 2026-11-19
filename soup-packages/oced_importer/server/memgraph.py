"""OCED tables staged for the existing Memgraph EKG lifecycle and rebuilds."""
from __future__ import annotations

import importlib
import re
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from uuid import UUID

from soup.core.contracts import ServiceUnavailableError, ValidationError
from soup.core.contracts.errors import log_error

from .csv_data import Table, identifier, read_table


def ekg_api():
    try:
        return importlib.import_module('soup_pkg_ekg.api')
    except ImportError as exc:
        raise ServiceUnavailableError('Enable the ekg package to import OCED tables into Memgraph') from exc


def local_time(value: str) -> str:
    if not value:
        return ''
    fractions = re.findall(r'[.,](\d+)', value)
    if any(len(fraction) > 6 for fraction in fractions):
        raise ValidationError('Memgraph supports at most six fractional timestamp digits; precision will not be silently discarded')
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as exc:
        raise ValidationError('OCED datetime values must use valid ISO 8601 text') from exc
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed.isoformat(timespec='microseconds')


def stage(prepared, obj, storage):
    ekg = ekg_api()
    ekg.graph_tools()  # Fail before staging if the optional EKG runtime is disabled.
    repository = ekg.DatasetRepository(storage)
    # UUID names isolate simultaneous imports even when their display names match.
    name = "oced-" + str(UUID(obj.id))
    if repository.exists(name):
        raise ValidationError("This OCED dataset already has staged files; use a new import")
    log = prepared.log
    events = read_table(prepared.files[log.events.path])
    if any(log.events.attr_types.get(column, 'String') != 'String' for column in (log.event_id, log.event_activity)):
        raise ValidationError('Memgraph event identifiers and activities must use String types')
    indexes = [events.columns.index(c) for c in (log.event_id, log.event_timestamp, log.event_activity)]
    extras = [c for c in events.columns if c not in (log.event_id, log.event_timestamp, log.event_activity)]
    if set(extras).intersection({'event_id','timestamp','activity_name'}):
        raise ValidationError('Memgraph canonical column names event_id, timestamp and activity_name cannot also be extra attributes')
    for alias, source in [('Event_Id',log.event_id),('ActivityName',log.event_activity),('Timestamp',log.event_timestamp)]:
        if alias in events.columns and alias != source:
            raise ValidationError(f'{alias} is reserved by the Memgraph EKG schema; rename that attribute')
    canonical = Table(['event_id','timestamp','activity_name',*extras], [
        [row[indexes[0]],local_time(row[indexes[1]]),row[indexes[2]],*[row[events.columns.index(c)] for c in extras]]
        for row in events.rows])
    # Neo4j orders equal instants by timezone offset before its ID tie-break.
    # Memgraph stores UTC local times, so encode that secondary ordering in
    # creation order, moving only rows at the same instant. Other rows retain
    # source order. The normal EKG DF query can then remain unchanged.
    offsets = [datetime.fromisoformat(row[indexes[1]].replace('Z', '+00:00')).utcoffset() or timedelta(0)
               for row in events.rows]
    if len(set(offsets)) > 1:
        positions = {}
        for index, row in enumerate(canonical.rows):
            positions.setdefault(row[1], []).append(index)
        for group in positions.values():
            ordered = [canonical.rows[index] for index in sorted(group, key=lambda index: offsets[index])]
            for index, row in zip(group, ordered):
                canonical.rows[index] = row
    entities = Table(['value','type'], [])
    files = {'oced_events.csv': prepared.files[log.events.path]}
    configs = {'oced_events.csv': asdict(log.events)}
    for kind, node in log.entities.items():
        table = read_table(prepared.files[node.path])
        if 'Value' in table.columns and log.entity_id != 'Value':
            raise ValidationError('Value is reserved for the Memgraph entity identifier; rename that attribute')
        entities.rows.extend([[value,kind] for value in table.values(log.entity_id)])
        key = 'oced_entity_' + kind + '.csv'
        files[key] = prepared.files[node.path]
        configs[key] = asdict(node)
    # Validate and normalize all datetime values before graph replacement.
    for key, data in list(files.items()):
        table = read_table(data)
        if key == 'oced_events.csv':
            if '_oced_timestamp_iso' in table.columns:
                raise ValidationError('_oced_timestamp_iso is reserved for the source timestamp')
            table.columns.append('_oced_timestamp_iso')
            for row in table.rows:
                row.append(row[indexes[1]])
        for column, kind in configs[key]['attr_types'].items():
            if kind == 'Datetime':
                index = table.columns.index(column)
                for row in table.rows:
                    row[index] = local_time(row[index])
        files[key] = table.csv_bytes()
    config = {
        'dataset_name':name, 'dataset_description':obj.description,
        'all_columns':['event_id','timestamp','activity_name',*extras],
        'standard_columns':['event_id','timestamp','activity_name'],
        'filtered_columns':list(log.entities), 'values_columns':extras,
        'source_format':'oced', 'extra_files':list(files),
        'process_info':{}, 'oced':{'owner':obj.id,'log':asdict(log),'tables':configs},
    }
    try:
        repository.save_event_log(name, canonical.csv_bytes(), entities.csv_bytes())
        repository.save_extra_files(name, files)
        repository.save_config(name, config)
    except BaseException:
        try:
            repository.delete(name)
        except Exception as cleanup:
            log_error(cleanup, {'phase':'Memgraph OCED staging cleanup','dataset':name})
        raise
    return {'backend':'memgraph','dataset':name,'graph_key':ekg.new_graph_key(),
            'columns':config['all_columns'], 'mapping':{
                'event_id':'event_id','activity':'activity_name','timestamp':'timestamp',
                'entities':list(log.entities),'values':extras}, 'timestamp_timezone':'UTC'}


class OcedPropertiesStep:
    key = 'oced_properties'
    order = 300
    phase = 'entity'

    def __init__(self, storage):
        self.storage = storage

    def applies(self, ctx):
        return 'oced_events.csv' in ctx.extra_files

    def execute(self, ctx, db):
        ekg = ekg_api()
        config = ekg.DatasetRepository(self.storage).load_config(ctx.dataset_name)['oced']
        for file, node in config['tables'].items():
            event = file == 'oced_events.csv'
            id_column = config['log']['event_id' if event else 'entity_id']
            pattern = 'Event {Event_Id: row.' + identifier(id_column) + '}' if event else 'Entity {Value: row.' + identifier(id_column) + ', Type: $kind}'
            props = []
            for column in node['attr']:
                key = identifier(column)
                value = f'CASE WHEN row.{key} = "" THEN null ELSE row.{key} END'
                convert = {'Integer':'toInteger','Float':'toFloat','Boolean':'toBoolean','Datetime':'localDateTime'}.get(node['attr_types'].get(column))
                if convert:
                    value = f'{convert}({value})'
                props.append(f'{key}: {value}')
            if event:
                props.append('_oced_timestamp_iso: row._oced_timestamp_iso')
            db.run(ekg.Query(ekg.load_csv_clause(ctx.extra_files[file]) + f' MATCH (n:{pattern}) SET n += {{{", ".join(props)}}}, n.Log = $owner',
                             {'kind':node.get('type'),'owner':config['owner']}))
