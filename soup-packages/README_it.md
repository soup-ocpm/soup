# SOUP packages

Ogni funzionalità di SOUP arriva in un **package**: una cartella che contiene insieme backend
(importer, operazioni, visualizzatori, exporter, tool) e frontend (bundle dei visualizzatori).
I package di questa cartella sono **forniti** con SOUP; altri si installano a runtime da uno zip.

> **Sicurezza.** Un package esegue codice con i privilegi del server (la parte `server/`, nel
> processo Flask) e del browser (la parte `app/`, caricata nella pagina). Installa solo package di
> cui ti fidi. Per questo l'installazione da zip è disattivata di default e va abilitata con
> `SOUP_ALLOW_PACKAGE_INSTALL=true` (il `docker-compose.yaml` di sviluppo la abilita).

## Scrivere un package

Questa guida costruisce un package completo, `records`: importa file `.jsonl` (un record JSON per
riga), li filtra con un'operazione, li mostra con un visualizzatore, li esporta in CSV e aggiunge un
filtro alle analisi EKG. Ogni esempio usa solo i contratti del core (`soup.core.contracts`), i tool
dichiarati nel manifest e, per il filtro, l'`api.py` dei package elencati in `requires`.

### 1. Partire da `_template`

```sh
cd soup-packages
cp -r _template records                 # il nome della cartella è il nome del package
```

`records/soup-package.json`:

```json
{
  "name": "records",
  "version": "1.0.0",
  "api_version": "4.0",
  "label": "Record JSON Lines",
  "description": "Imports .jsonl files, filters, shows and exports their records.",
  "author": "Io",
  "requires": ["tool_storage", "ekg", "ekg_analysis"],
  "requires_tools": ["storage"],
  "provides_tools": [],
  "extension_points": [],
  "python_dependencies": [],
  "server": {"module": "server", "plugin": "plugin:Plugin"},
  "app": {"entry": "dist/index.js"}
}
```

In `records/app/package.json` cambia `name` in `soup-pkg-records-app`, poi dalla radice di
`soup-packages` esegui `npm install` (collega il nuovo workspace). Cancella `server/text.py` e
scrivi i file seguenti. `ekg` ed `ekg_analysis` servono solo al filtro del passo 6: senza filtro
toglili da `requires`.

### 2. Importer (`server/records.py`)

Un importer crea un oggetto: `inspect` propone anteprima e campi, `preview` ricalcola l'anteprima con
le opzioni scelte, `import_` restituisce la `meta` dell'oggetto (che a quel punto ha già un id),
`dispose` rimuove i dati quando l'oggetto viene cancellato. Il file resta nello spazio `records`
dello storage; gli errori sono eccezioni di dominio (`ValidationError` → `400`).

```python
from __future__ import annotations

import csv
import io
import json
import uuid
from typing import Any, Mapping

from soup.core.contracts import (
    Exporter,
    Field,
    Importer,
    Inspection,
    NotFoundError,
    ObjectDraft,
    ObjectRef,
    Operation,
    OperationInput,
    Upload,
    ValidationError,
    Visualizer,
    report,
)

KIND = "records.jsonl"
STORAGE = "storage"
NAMESPACE = "records"


def parse(data: bytes) -> list[dict[str, Any]]:
    rows = []
    for number, line in enumerate(data.decode("utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as error:
            raise ValidationError(f"Line {number}: {error.msg}") from error
        if not isinstance(value, dict):
            raise ValidationError(f"Line {number}: a record must be a JSON object")
        rows.append(value)
    return rows


def columns_of(rows: list[dict[str, Any]]) -> list[str]:
    return sorted({key for row in rows for key in row})


def space(tools):
    return tools.get(STORAGE).space(NAMESPACE)


def load(obj: ObjectRef, tools) -> list[dict[str, Any]]:
    name = obj.meta.get("file")
    if not name:
        raise NotFoundError(f"Object '{obj.id}' has no stored file")
    return parse(space(tools).read(str(name)))


def dispose_file(obj: ObjectRef, tools) -> None:
    if obj.meta.get("file"):
        space(tools).delete(str(obj.meta["file"]))


class JsonLinesImporter(Importer):
    id = "jsonl"
    label = "Record JSON Lines"
    description = "Un record JSON per riga."
    extensions = (".jsonl",)
    produces = KIND
    requires_tools = (STORAGE,)

    def inspect(self, upload: Upload, tools) -> Inspection:
        rows = parse(upload.read())
        columns = columns_of(rows)
        first = report.table(columns, [[row.get(column) for column in columns] for row in rows[:10]], title="Primi record")
        key = Field("key", "Campo chiave", type="select", choices=tuple(columns), default=columns[0] if columns else None)
        return Inspection(preview=(first,), fields=(key,) if columns else ())

    def preview(self, upload: Upload, options: Mapping[str, Any], tools) -> list[dict[str, Any]]:
        return [report.keyvalue({"record": len(parse(upload.read())), "campo chiave": options.get("key")})]

    def import_(self, upload: Upload, obj: ObjectRef, options: Mapping[str, Any], tools) -> dict[str, Any]:
        data = upload.read()
        rows = parse(data)
        name = f"{obj.id}.jsonl"
        space(tools).write(name, data)
        return {"file": name, "count": len(rows), "columns": columns_of(rows), "key": options.get("key")}

    def dispose(self, obj: ObjectRef, tools) -> None:
        dispose_file(obj, tools)
```

### 3. Operazione

Un'operazione dichiara gli oggetti che riceve (`inputs`, per kind) e i kind che produce; `fields`
costruisce il form (qui le scelte vengono dall'oggetto), `run` restituisce uno o più `ObjectDraft`.
Il core crea gli oggetti con `created_by` = l'operazione e `parents` = gli oggetti in ingresso, e
chiama `dispose` quando uno di essi viene cancellato.

```python
class FilterRecords(Operation):
    id = "filter"
    label = "Filtra i record"
    description = "Tiene i record il cui campo ha il valore scelto."
    group = "Record"
    inputs = (OperationInput("records", (KIND,)),)
    produces = (KIND,)
    requires_tools = (STORAGE,)

    def fields(self, inputs: Mapping[str, ObjectRef], tools) -> list[Field]:
        source = inputs["records"]
        return [
            Field("name", "Nome", required=True, default=f"{source.name} filtrato"),
            Field("column", "Campo", type="select", required=True, choices=tuple(source.meta.get("columns") or ())),
            Field("value", "Valore", required=True),
        ]

    def run(self, inputs: Mapping[str, ObjectRef], params: Mapping[str, Any], tools) -> list[ObjectDraft]:
        source = inputs["records"]
        kept = [row for row in load(source, tools) if str(row.get(params["column"])) == params["value"]]
        # Il draft non ha ancora un id: il file prende un nome nuovo.
        name = f"{uuid.uuid4().hex}.jsonl"
        space(tools).write(name, "\n".join(json.dumps(row) for row in kept).encode("utf-8"))
        meta = {"file": name, "count": len(kept), "columns": columns_of(kept), "key": source.meta.get("key")}
        return [ObjectDraft(params["name"], KIND, meta)]

    def dispose(self, obj: ObjectRef, tools) -> None:
        dispose_file(obj, tools)
```

### 4. Visualizzatore: server e Web Component

Lato server il visualizzatore dà il tag dell'elemento, i `data` iniziali e le azioni che l'elemento
chiama con `context.action(name, params)`:

```python
PAGE = 50


class RecordsVisualizer(Visualizer):
    id = "table"
    label = "Record"
    accepts = (KIND,)
    element = "soup-pkg-records-table"
    requires_tools = (STORAGE,)

    def data(self, obj: ObjectRef, params: Mapping[str, Any], tools) -> Any:
        rows = load(obj, tools)
        return {"columns": obj.meta.get("columns") or [], "rows": rows[:PAGE], "total": len(rows)}

    def action(self, obj: ObjectRef, name: str, params: Mapping[str, Any], tools) -> Any:
        if name != "page":
            raise NotFoundError(f"Visualizer '{self.id}' has no action '{name}'")
        offset = params.get("offset", 0)
        if isinstance(offset, bool) or not isinstance(offset, int) or offset < 0:
            raise ValidationError("'offset' must be a non-negative integer")
        return {"rows": load(obj, tools)[offset:offset + PAGE]}
```

Lato browser (`app/src/index.ts`) è un custom element che importa solo `@soup/sdk`, mai codice
dell'host: l'host imposta `data` e `context` prima di inserirlo nella pagina, e l'elemento parla con
l'host solo tramite il `context` (o gli eventi DOM equivalenti, `soup-notify`, `soup-thumbnail`...).
Il testo dei dati va sempre in `textContent`, mai come markup.

```ts
import { defineSoupElement, SoupVisualizerElement, VisualizerContext } from '@soup/sdk';

interface RecordsData {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
}

export class SoupPkgRecordsTable extends HTMLElement implements SoupVisualizerElement<RecordsData> {
  public data!: RecordsData;
  public context!: VisualizerContext;

  private readonly root = this.attachShadow({ mode: 'open' });
  private rows: Record<string, unknown>[] = [];

  public connectedCallback(): void {
    this.rows = [...this.data.rows];
    this.render();
    // L'anteprima del workspace: un SVG costruito solo da numeri.
    this.context.setThumbnail(
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><text x="10" y="35">${Number(this.data.total)}</text></svg>`
    );
  }

  private render(): void {
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    for (const column of this.data.columns) head.insertCell().textContent = column;
    const body = table.createTBody();
    for (const row of this.rows) {
      const line = body.insertRow();
      for (const column of this.data.columns) line.insertCell().textContent = String(row[column] ?? '');
    }
    const more = document.createElement('button');
    more.type = 'button';
    more.textContent = `Altri record (${this.rows.length} di ${this.data.total})`;
    more.disabled = this.rows.length >= this.data.total;
    more.addEventListener('click', () => void this.next());
    this.root.replaceChildren(table, more);
  }

  private async next(): Promise<void> {
    try {
      const page = await this.context.action<{ rows: Record<string, unknown>[] }>('page', { offset: this.rows.length });
      this.rows.push(...page.rows);
      this.render();
    } catch (error) {
      this.context.notify(error instanceof Error ? error.message : String(error), 'error');
    }
  }
}

defineSoupElement('soup-pkg-records-table', SoupPkgRecordsTable);
```

### 5. Exporter

```python
class RecordsCsv(Exporter):
    id = "csv"
    label = "Record in CSV"
    accepts = (KIND,)
    extension = ".csv"
    mime = "text/csv"
    requires_tools = (STORAGE,)

    def fields(self, obj: ObjectRef, tools) -> list[Field]:
        return [Field("header", "Intestazione", type="bool", default=True)]

    def export(self, obj: ObjectRef, params: Mapping[str, Any], tools) -> bytes:
        out = io.StringIO()
        writer = csv.DictWriter(out, fieldnames=list(obj.meta.get("columns") or []), extrasaction="ignore")
        if params.get("header", True):
            writer.writeheader()
        writer.writerows(load(obj, tools))
        return out.getvalue().encode("utf-8")
```

`extension` e `mime` descrivono il file di default. Se estensione o tipo MIME dipendono dall'oggetto
(un file importato che si riscarica così com'era), l'exporter ridefinisce il metodo facoltativo
`file_type(obj, params) -> (extension, mime)` (dai contratti `"4.1"`; il default restituisce
`(self.extension, self.mime)`). `params` sono le opzioni già validate con `fields()`. Il core chiama il
file `<nome dell'oggetto><extension>` e controlla il risultato: l'estensione inizia con `.` ed è fatta
di 2-16 caratteri tra lettere, cifre, `.`, `-` e `_`; il MIME è `tipo/sottotipo` (senza parametri come
`; charset=`). Un valore non valido non diventa mai un nome di file: l'export risponde `500` con un
messaggio che nomina exporter e package (e finisce nel log). Anche l'elenco degli exporter di un
oggetto (`GET /api/v3/objects/<id>/exporters`, il menu **Esporta**) mostra `extension` e `mime` di
`file_type(obj, defaults)`, con i valori di default dei `fields`; se `file_type` solleva o dà un
valore non valido, l'elenco mostra quelli fissi dell'exporter e scrive un avviso nel log (mai un
`500`). Esempio: il JSON Lines riscaricato con l'estensione del file importato,
che l'importer avrebbe salvato in `meta["extension"]`:

```python
class OriginalJsonLines(Exporter):
    id = "original"
    label = "File originale"
    accepts = (KIND,)
    extension = ".jsonl"
    mime = "application/jsonl"
    requires_tools = (STORAGE,)

    def file_type(self, obj: ObjectRef, params: Mapping[str, Any]) -> tuple[str, str]:
        return obj.meta.get("extension", self.extension), self.mime

    def export(self, obj: ObjectRef, params: Mapping[str, Any], tools) -> bytes:
        return space(tools).read(str(obj.meta["file"]))
```

Un package che ridefinisce `file_type` dichiara `"api_version": "4.1"`; gli altri restano a `"4.0"`.

### 6. Filtro di analisi (`server/min_events.py`)

Un filtro contribuito a `ekg.analysis_filters` (il punto di estensione di `ekg_analysis`) diventa
una variante di **Nuova analisi** e una chiave dei file di configurazione. Il Cypher è testo fisso:
etichette e tipi con `ident()`, ogni valore come parametro (`$entity`, `$minimum`), mai una
f-string con l'input dell'utente.

```python
from __future__ import annotations

from typing import Any, Mapping

from soup.core.contracts import Field, ObjectRef, ValidationError
from soup_pkg_ekg.api import Query, ident
from soup_pkg_ekg_analysis.api import AnalysisFilter, FilterContext


class MinEventsFilter(AnalysisFilter):
    key = "minEvents"
    label = "Entità con pochi eventi"
    description = "Toglie le entità del tipo scelto collegate a meno eventi del minimo."
    order = 700                       # dopo i sei filtri di ekg_analysis (100-600)

    def fields(self, obj: ObjectRef, tools) -> list[Field]:
        return [
            Field("entity", "Tipo di entità", required=True),
            Field("minimum", "Eventi minimi", type="number", required=True, default=2),
        ]

    def validate(self, spec: Any) -> dict[str, Any]:
        if not isinstance(spec, Mapping) or not str(spec.get("entity") or "").strip():
            raise ValidationError("minEvents: 'entity' is required")
        minimum = spec.get("minimum")
        if isinstance(minimum, bool) or not isinstance(minimum, int) or minimum < 1:
            raise ValidationError("minEvents: 'minimum' must be a positive integer")
        return {"entity": str(spec["entity"]).strip(), "minimum": minimum}

    def to_queries(self, spec: Mapping[str, Any], ctx: FilterContext) -> list[Query]:
        text = f"""
            MATCH (n:{ident("Entity")} {{Type: $entity}})
            OPTIONAL MATCH (e:{ident("Event")})-[:{ident("CORR")}]->(n)
            WITH n, count(e) AS events
            WHERE events < $minimum
            DETACH DELETE n"""
        return [Query(text, {"entity": spec["entity"], "minimum": spec["minimum"]})]
```

### 7. Registrazione (`server/plugin.py`)

Nome, versione e dipendenze vengono dal manifest; il plugin registra soltanto i contributi:

```python
from __future__ import annotations

from soup.core.contracts import PluginContext, SoupPlugin
from soup_pkg_ekg_analysis.api import ANALYSIS_FILTERS_POINT

from .min_events import MinEventsFilter
from .records import FilterRecords, JsonLinesImporter, RecordsCsv, RecordsVisualizer


class Plugin(SoupPlugin):
    def register(self, ctx: PluginContext) -> None:
        ctx.add_importer(JsonLinesImporter())
        ctx.add_operation(FilterRecords())
        ctx.add_visualizer(RecordsVisualizer())
        ctx.add_exporter(RecordsCsv())
        item = MinEventsFilter()
        ctx.contribute(ANALYSIS_FILTERS_POINT, item, key=item.key, order=item.order)
```

Il core registra i contributi come `records.jsonl`, `records.filter`, `records.table` e
`records.csv`. Un contributo che chiede in `requires_tools` un tool assente dal manifest, o un
`tools.get(...)` di un tool non dichiarato, fallisce con `ToolNotDeclaredError`; i test di confine
(`soup-server/tests/test_architecture_boundaries.py`) controllano anche staticamente tool, `requires`
e `python_dependencies` di ogni package fornito.

### 8. Test, build, zip e installazione

```sh
# test Python in records/tests/ (il pytest.ini di soup-server li raccoglie), con
# tests.fakes (FakeDatabase, storage in memoria): niente Docker né Memgraph
cd soup-server && python -m pytest ../soup-packages/records/tests

cd ../soup-packages
npm run lint && npm test                 # eslint e vitest (jsdom) di */app/test/
npm run build:packages -- records        # type check + esbuild -> records/app/dist/index.js
npm run pack -- records                  # dist/records-1.0.0.zip: manifest, server/, app/dist/
```

Lo zip si installa dalla pagina **/packages** dell'interfaccia (caricamento dello zip) oppure con
`curl -F file=@dist/records-1.0.0.zip http://localhost:8080/api/v3/packages`; serve
`SOUP_ALLOW_PACKAGE_INSTALL=true` sul server. Il package viene caricato subito: l'importer compare in
**/import** per i file `.jsonl`, l'operazione nel pannello Azioni degli oggetti `records.jsonl`, il
visualizzatore e l'exporter nella loro pagina `/o/:id`, il filtro tra le varianti di Nuova analisi.

## Struttura

```
soup-packages/<nome>/
  soup-package.json      manifest (obbligatorio)
  server/                modulo Python del package
    __init__.py          obbligatorio
    plugin.py            la classe SoupPlugin indicata nel manifest
    api.py               API pubblica per gli altri package
  app/                   frontend (facoltativo)
    package.json         workspace npm con le dipendenze (almeno @soup/sdk)
    tsconfig.json
    src/index.ts         definisce i Web Component dei visualizzatori
    dist/index.js        bundle generato da `npm run build:packages`
```

La cartella deve avere lo stesso nome del package.

## Manifest: `soup-package.json`

```json
{
  "name": "csv_ekg",
  "version": "1.0.0",
  "api_version": "4.0",
  "label": "CSV come event log (EKG)",
  "description": "Imports CSV files as event logs and builds their EKG on Memgraph.",
  "author": "SOUP",
  "requires": ["ekg", "soup_base", "csv_table"],
  "requires_tools": ["memgraph", "storage"],
  "provides_tools": [],
  "extension_points": [],
  "python_dependencies": ["pandas>=2.2", "numpy>=2"],
  "server": {"module": "server", "plugin": "plugin:Plugin"},
  "app": {"entry": "dist/index.js"}
}
```

| Campo | Significato |
|---|---|
| `name` | Lettere minuscole, cifre e `_`, inizia con una lettera (né `""`, né `..`, né separatori, né `_` iniziale). Diventa anche il nome del modulo Python `soup_pkg_<name>`. |
| `version` | Versione PEP 440 (`1.0.0`). Serve per gli aggiornamenti. |
| `api_version` | Versione dei contratti del core per cui il package è scritto, `"MAGGIORE.MINORE"`. È compatibile se ha lo stesso numero maggiore di `CONTRACTS_API_VERSION` dell'host e un minore uguale o inferiore: l'host attuale, `"4.1"`, accetta `"4.0"` e `"4.1"` e rifiuta `"4.2"`, `"3.x"` e `"5.0"` (vedi "Versioni dei contratti" sotto). |
| `label`, `description`, `author` | Testi mostrati all'utente; `label` vale `name` se assente. |
| `requires` | Package che devono essere attivi prima di questo. |
| `requires_tools` | Tool usati (catalogo, Memgraph, storage, preferenze...). Un package non può usare un tool che non dichiara qui. |
| `provides_tools` | Tool che il package aggiunge con `ctx.add_tool`. Registrare un tool non dichiarato qui è un errore. |
| `extension_points` | Punti di estensione che il package apre con `ctx.add_extension_point` (es. `"ekg.build_steps"`). Aprirne uno non dichiarato è un errore. |
| `python_dependencies` | Requisiti PEP 508 (`"pandas>=2"`). Vengono **verificati**, mai installati: se una libreria manca o ha la versione sbagliata il package viene escluso con un messaggio che lo dice. Le librerie vanno aggiunte all'immagine del server (`soup-server/requirements.txt`). |
| `server.module` | Cartella del modulo Python, relativa al package (di solito `server`). |
| `server.plugin` | `"modulo:Attributo"` dentro `server.module`: una sottoclasse (o un'istanza) di `SoupPlugin`. |
| `app.entry` | Facoltativo: bundle del frontend, relativo a `app/` e dentro `app/dist/` (es. `dist/index.js`): al browser si serve solo `app/dist`. |

### Versioni dei contratti

| Versione | Commit | Cambiamento |
|---|---|---|
| `"3.0"` | 8 | Tolti da `PluginContext` `add_input_reader`, `add_input_handler` e `add_build_step`: l'event log e l'EKG sono nel package `ekg` e gli step si contribuiscono a `ekg.build_steps`. Un package `"2.x"` va aggiornato. |
| `"3.1"` | 10 | Aggiunto `Exporter.applies(obj, tools) -> bool` (facoltativo, default `True`): un exporter si offre solo per alcuni oggetti dei kind che accetta. Un exporter che non si applica non compare nell'elenco e il suo export risponde `404` come uno sconosciuto; un `applies` che solleva esclude l'exporter e finisce nel log con il nome del package. I package `"3.0"` si caricano senza modifiche; serve `"3.1"` solo a chi usa `applies` (es. `ekg_analysis`). |
| `"4.0"` | 11 | Tolti da `soup.core.contracts` `Query`, `ident` e `GraphDatabase`: il core non conosce Cypher. Stanno in `soup_pkg_tool_memgraph.api` (riesportati da `soup_pkg_ekg.api`), da importare dichiarando il package in `requires`. Un package `"3.x"` va aggiornato (cambiano solo quell'import e `api_version`). |
| `"4.1"` | 12 | Aggiunto `Exporter.file_type(obj, params) -> (extension, mime)` (facoltativo, default `(extension, mime)` dell'exporter): estensione e MIME del file esportato possono dipendere dall'oggetto; l'`ExportRouter` li valida (`500` attribuito al package se non validi). I package `"4.0"` si caricano senza modifiche; dichiarano `"4.1"` solo quelli che usano `file_type` (`text`, `csv_table`, `ocel`). |

Visualizzatori e operazioni restano filtrati solo per kind.

Il manifest è la **fonte di verità**: nome, versione, `api_version`, `requires`, `requires_tools`,
`provides_tools` ed `extension_points` vengono impostati sull'istanza del plugin, che quindi non li
ripete:

```python
from soup.core.contracts import PluginContext, SoupPlugin

from .contributions import CsvEkgImporter, TableToEkg


class Plugin(SoupPlugin):
    def register(self, ctx: PluginContext) -> None:
        ctx.add_importer(CsvEkgImporter())
        ctx.add_operation(TableToEkg())
```

## Nomi dei contributi

- Importer, operazioni, visualizzatori ed exporter hanno un `id` unico **solo dentro il package**:
  il core li registra con la chiave `"<package>.<id>"` (es. `csv_ekg.csv`), ed è questa chiave
  completa che usano i router, le API e `created_by.contributor_id` degli oggetti. Due package
  possono quindi offrire entrambi un importer `csv`: per un file `.csv` compaiono tutti e due e
  sceglie l'utente.
- Tool e punti di estensione hanno invece un **nome globale**, perché servono a più package
  (`memgraph`, `storage`, `ekg.build_steps`): vanno dichiarati nel manifest, e due package attivi
  non possono dichiarare lo stesso nome. Il conflitto viene rilevato prima di importare codice e
  nomina entrambi i package; il primo caricato (o quello già attivo) mantiene il nome.

## Package forniti

| Package | Contenuto |
|---|---|
| `tool_memgraph`, `tool_storage` | I tool (vedi sotto). |
| `soup_base` | Visualizzatore **Report** (kind `report`), exporter **Report in JSON**, la `ParsedCache` lato server (`soup_pkg_soup_base.api`: la cache LRU dei contenuti già letti, usata da `text`, `csv_table` e `ocel`) e gli elementi riusabili `soup-text`, `soup-markdown`, `soup-image`, `soup-table`, `soup-chart`, `soup-keyvalue`, `soup-file-link`, `soup-error`, `soup-report-view`, `soup-graph-view`. Disegna anche l'anteprima dell'import. Un package che usa questi elementi dichiara `requires: ["soup_base"]`. API in [soup_base/README.md](soup_base/README.md). |
| `text` | Importer **Testo** (`.txt`, `.md`, `.log`, kind `text`): il file resta com'è nello spazio `text` dello storage, la `meta` ha dimensione, righe e codifica (UTF-8, altrimenti Latin-1). Visualizzatore **Testo** (`<soup-pkg-text-viewer>`): `<soup-text>` o, per i `.md`, `<soup-markdown>`; blocchi di righe con l'azione `lines` `{from, count}` e ricerca in tutto il file con `search` `{query}`. La `meta` ha anche l'estensione originale (`extension`: `.txt`, `.md` o `.log`). Exporter **File originale**: con `Exporter.file_type` scarica `<nome>.md`, `<nome>.log` o `<nome>.txt` con il MIME del file (`text/markdown` per i `.md`, `text/plain` altrimenti); per gli oggetti importati prima, senza `meta.extension`, l'estensione viene da `meta.filename` (o da `format: "markdown"`), altrimenti `.txt`. `api_version: "4.1"`. |
| `csv_table` | Importer **CSV come tabella** (`.csv`, `.tsv`, kind `table`, modulo `csv`): separatore (`comma`, `semicolon`, `tab`) e intestazione proposti da `csv.Sniffer`; la tabella è salvata come CSV canonico nello spazio `csv_table`. Visualizzatori **Tabella CSV** (`<soup-pkg-csv-table-viewer>`, paginazione remota con l'azione `page` `{offset, limit, sort: {column, direction}, filter: [{column, value}], search}`, colonne per indice, ordinamento e un filtro per colonna) e **Profilo colonne** (`<soup-pkg-csv-profile>`, valori distinti, celle vuote, esempi e il grafico di `distribution` `{column, top}`). Operazione **Distribuzione di una colonna** (`table` → `report` con un grafico a barre e una tabella). Exporter **CSV** con separatore e intestazione a scelta: con la tabulazione il file è `<nome>.tsv` (`text/tab-separated-values`), altrimenti `<nome>.csv` (`text/csv`); senza un separatore scelto vale quello dell'import (`file_type`, `api_version: "4.1"`). |
| `ekg` | Solo server. L'event log (`Table` e conversioni pandas, `EventLogData` piatto o separato, `ColumnMapping`, `EventLog` con normalizzazione, millisecondi, entità e CSV canonici), i dataset sul volume (`/soup/<nome>/<nome>.csv`, `_entity.csv`, `_config.json`, `Analyses/`) e l'EKG su Memgraph: step di costruzione 100-500, il punto di estensione `ekg.build_steps`, lo stato del grafo degli oggetti `ekg` (`ensure_loaded`, `ekg.state_providers`), gli eventi `ekg.before_reset` ed `ekg.built`, l'operazione **Carica in Memgraph**. All'avvio aggiunge al catalogo i dataset già presenti sul volume. Vedi sotto. |
| `csv_ekg` | Importer **CSV come event log (EKG su Memgraph)** (`.csv`, kind `ekg`): anteprima, campi `event_id`, `timestamp`, `activity`, `entities`, `values`, `trigger_target`, `save_process_times` e, con almeno due colonne entità, il grafo delle molteplicità (1 a 1, 1 a N, N a 1, N a N). Operazione **Converti in EKG** (`table` di `csv_table` → `ekg` figlio). |
| `causal_df` | Lo step del `:DF` causale per le coppie trigger/target, contribuito a `ekg.build_steps` con order 450. |
| `ekg_views` | Visualizzatori **Grafo** (`<soup-pkg-ekg-graph>`), **Statistiche** (`<soup-pkg-ekg-stats>`) e **Interrogazioni** (`<soup-pkg-ekg-queries>`) ed exporter **JSON del grafo** per il kind `ekg` (Interrogazioni e JSON anche per `ekg_class`, finché `ekg_class_graph` vi contribuisce), con i punti di estensione `ekg.graph_views`, `ekg.queries`, `ekg.json_parts` ed `ekg.stats_notices`. Vedi sotto. |
| `ekg_analysis` | Le analisi come operazioni sugli oggetti `ekg`: **Nuova analisi**, **Importa configurazione di analisi**, **Esempio di configurazione**, il punto di estensione `ekg.analysis_filters` con i sei filtri del vecchio codice, il rollback compensativo, l'evento `analysis.before_apply`, il visualizzatore **Indicatori di processo** (`<soup-pkg-ekg-insights>`) e l'exporter **Configurazione dell'analisi**. All'avvio aggiunge al catalogo le analisi già sul volume. Vedi sotto. |
| `ocel` | File **OCEL 2.0** in JSON (`.json`, `.jsonocel`), con due importer tra cui sceglie l'utente: **OCEL 2.0 come tabelle** (kind `ocel_tables`, solo libreria standard e tool `storage`) e **OCEL 2.0 come EKG su Memgraph** (kind `ekg`, con `ekg.build_ekg`). Visualizzatori **Tabelle OCEL** e **Riepilogo OCEL**, operazione **Scomponi in EKG**, exporter **OCEL 2.0 JSON**; nell'EKG i qualifier sulle `:CORR` e le relazioni oggetto-oggetto come `:REL`, con il suo step in `ekg.build_steps` (order 420). Vedi sotto. |
| `ekg_class_graph` | Il grafo aggregato: operazione **Costruisci grafo aggregato** (`ekg` → `ekg_class`), visualizzatori **Grafo aggregato** (`<soup-pkg-ekg-class-graph>`) e **Statistiche del grafo aggregato** (`<soup-pkg-ekg-class-stats>`), la vista `class`, le interrogazioni e le parti JSON delle classi; cancella i propri nodi prima di un reset o di un'analisi (Observer). Vedi sotto. |

`text` e `csv_table` usano solo la libreria standard di Python e il tool `storage` (`requires:
["soup_base", "tool_storage"]`, `requires_tools: ["storage"]`, niente pandas né Memgraph): sono
l'esempio di un package che tiene i propri dati in uno spazio dello storage, li rilegge nelle azioni
dei visualizzatori e li rimuove in `dispose`.

Per non rileggere il file a ogni pagina, ordinamento, filtro o blocco di righe (con
`DockerVolumeStorage` ogni lettura copia il file fuori dal container), ognuno dei due tiene una cache
in memoria del contenuto già analizzato (righe decodificate per `text`, colonne e righe per `csv_table`):
una `ParsedCache` di `soup_base` (`soup_base/server/cache.py`, esportata da `soup_pkg_soup_base.api`), con chiave l'id dell'oggetto. È una LRU limitata per numero di oggetti e per
dimensione stimata, thread-safe, creata dal `Plugin` in `register()` e condivisa dai suoi contributi:
non c'è stato globale di modulo, e un disable/enable riparte da una cache vuota (`on_shutdown` la
svuota). `dispose` e ogni scrittura del file invalidano l'oggetto; un file la cui stima supera il
limite di dimensione non entra in cache e si legge ogni volta. Limiti: `SOUP_TEXT_CACHE_OBJECTS`,
`SOUP_TEXT_CACHE_MB`, `SOUP_CSV_TABLE_CACHE_OBJECTS`, `SOUP_CSV_TABLE_CACHE_MB` (default 8 oggetti e
200 MB per package; un valore non intero positivo fa fallire il caricamento del package con un
messaggio che lo dice). L'`api.py` dei due package espone i contributi e la cache. Nota per chi scrive campi `select`: un valore fatto solo
di spazi (come `"\t"`) è considerato vuoto dalla validazione del core, per questo il separatore di
`csv_table` usa i nomi `comma`, `semicolon`, `tab`.

## Tool forniti

Memgraph, i file, il catalogo degli oggetti e le preferenze non sono nel core: li forniscono due
package di soli tool (nessuna parte `app/`), attivi di default come tutti i package trovati. Un
package li usa dichiarandoli in `requires_tools` e prendendoli da `ctx.tools` (o dal `tools` passato
a importer, operazioni, visualizzatori ed exporter); chiedere un tool non dichiarato solleva
`ToolNotDeclaredError`. Per usare i tipi (`MemgraphTool`, `Query`, `StorageTool`...) si importa
l'`api.py` del package, che va allora elencato anche in `requires`. Senza uno di questi package il
server parte lo stesso: il report dei package dice quale tool manca e i servizi che ne hanno bisogno
rispondono `503`.

| Package | Tool | Cosa offre | Variabili d'ambiente |
|---|---|---|---|
| `tool_memgraph` | `memgraph` | `run(query) -> list[dict]`, `health()`; grafo attivo: `ensure_loaded(state_key, loader, force=False)`, `advance(from_state, to_state, mutate)`, `current_state()`, `clear()`, `invalidate()`. Un solo driver per processo, creato al primo uso e chiuso quando il package si ferma. | `MEMGRAPH_HOST` (`memgraph`), `MEMGRAPH_PORT` (`7687`) |
| `tool_storage` | `storage` | `space(namespace)` → `read`, `write`, `exists`, `delete`, `list` relativi a `<root>/<namespace>/`, e `subspace(nome)` per una cartella al suo interno; `path_for(namespace, name)`; `delete_space(namespace)`; `namespaces()`, le voci della radice con un nome valido. | `SOUP_STORAGE_KIND` (`docker` o `local`; `local` nel `docker-compose.yaml`, sul volume che monta anche Memgraph), `SOUP_CONTAINER_NAME` (`soup-database`), `SOUP_LOCAL_STORAGE_ROOT` (`/soup`) |
| `tool_storage` | `catalog` | Gli oggetti del workspace in `<root>/_catalog/objects/<id>.json`, anteprime SVG in `<root>/_catalog/thumbnails/<id>.svg`, `children(id)` per la provenienza. | come sopra |
| `tool_storage` | `preferences` | Chiavi/valori JSON in `<root>/_catalog/preferences.json`. | come sopra |

- **Grafo attivo.** Memgraph contiene un solo dataset alla volta. Chi deve interrogare un oggetto
  chiama `ensure_loaded(state_key, loader)`: se lo stato caricato è diverso da `state_key` (una
  stringa opaca scelta da chi chiama, es. l'id dell'oggetto) o se `force=True`, il tool svuota il
  database e chiama `loader(run)`; altrimenti non fa nulla. Se `loader` fallisce non resta attivo
  nessuno stato e la richiesta successiva ricarica.
- **Modifiche sul posto.** `advance(from_state, to_state, mutate)` modifica il grafo caricato senza
  ricostruirlo (un'analisi sul padre già caricato): sotto lo stesso lock dei caricamenti, se lo stato
  attivo non è `from_state` solleva `ConflictError` senza eseguire nulla; altrimenti esegue
  `mutate(run)` e lo stato diventa `to_state`; se `mutate` fallisce lo stato resta sconosciuto
  (`None`) e la richiesta successiva ricarica.
- **Spazi dei nomi.** Ogni package usa il proprio spazio (`storage.space("<nome>")`); spazi e nomi di
  file sono validati come i nomi degli oggetti (vietati `""`, `..`, separatori, `_` iniziale), quindi
  `_catalog` è irraggiungibile. `path_for` dà il percorso assoluto per chi lo passa a Memgraph: `LOAD
  CSV` legge dallo stesso volume `/soup`. La cartella di un dataset EKG resta `/soup/<nome>/`.
- **Cypher.** `Query`, `ident` e la porta `GraphDatabase` stanno in `soup_pkg_tool_memgraph.api`
  (riesportati da `soup_pkg_ekg.api`); i valori viaggiano sempre come parametri, gli identificatori
  passano da `ident()`, gli operatori da liste chiuse, `LIMIT` come `$limit`.

## EKG: il package `ekg`

Un oggetto di kind `ekg` è un grafo su Memgraph. La `meta` di un oggetto **radice** (un import, una
conversione) ha `dataset` (la cartella sul volume), `graph_key` (lo stato del tool `memgraph` quando
il suo grafo è quello caricato: un uuid generato da `build_ekg` o dall'adozione), `columns`, `mapping` (`event_id`, `timestamp`,
`activity`, `entities`, `values`), `trigger_target`, `counts`, `process_info` (stessa forma della
vecchia config), `date_created` e `source_format`. Un oggetto **derivato** (per esempio un'analisi)
ha kind `ekg`, tra i `parents` il suo oggetto `ekg` di partenza, e in `meta.state`
`{provider, spec}`: `provider` è la chiave di un `StateProvider` contribuito a `ekg.state_providers`,
che sa applicare `spec` al grafo del genitore. Un derivato può avere anche un altro kind (il grafo
aggregato, `ekg_class`): conta solo `meta.state`. Il genitore è il primo dei `parents` che è un `ekg` o
a sua volta un derivato; la catena finisce sempre in un `ekg` radice con il suo dataset. Un derivato
creato da un'operazione con `derive_state` ha anche `meta.graph_key`.

L'API (`soup_pkg_ekg.api`, per chi elenca `ekg` in `requires`; chi chiama passa i propri `tools`:
`build_ekg` vuole `memgraph` e `storage`, `ensure_loaded`, `derive_state` e `dispose` solo `memgraph`,
perché i file dei dataset si leggono con lo storage del package `ekg`):

| Nome | |
|---|---|
| `build_ekg(obj, data, mapping, tools, *, dataset, description, all_columns, trigger_target, source_format, save_process_times, extra_files)` | Normalizza `data` (`EventLogData`), salva il dataset (cartella `dataset` o, se assente, il nome dell'oggetto reso unico con `_2`, `_3`...), costruisce l'EKG e restituisce la `meta`. `extra_files` (`{nome: contenuto}`) sono file del chiamante salvati nel dataset (`<dataset>_<nome>`) ed elencati nella config (`extra_files`), per i suoi step; senza, il dataset è quello di sempre. Lo stato del tool `memgraph` diventa una chiave nuova, restituita in `meta.graph_key`, anche con un `ObjectDraft` (da un'operazione, che non ha ancora un id): la prima apertura dell'oggetto non ricostruisce. Se la costruzione fallisce i file vengono rimossi. |
| `ensure_loaded(obj, tools, force=False)` | Lo stato di `obj` è `meta.graph_key`, o il suo id per un oggetto senza chiave (vecchio o adottato; `graph_key_of(obj)`). Se non è lo stato attivo (o con `force`): pubblica `ekg.before_reset`, ricostruisce il dataset della radice (risalendo i `parents`), applica in ordine gli stati dei derivati fino a `obj`, salva conteggi e tempi nella config e imposta di nuovo la stessa chiave. Restituisce `True` se ha ricostruito. |
| `derive_state(parent, mutate, tools)` | Azione compensativa (C26) per un oggetto derivato nuovo: `ensure_loaded(parent)`, una chiave nuova, `memgraph.advance(chiave del padre, chiave nuova, mutate)`; restituisce la chiave, da mettere in `meta.graph_key` del draft (la prima apertura non ricostruisce). Se `mutate` fallisce il grafo del padre viene ricostruito (lo stato torna la sua chiave) e l'errore rilanciato; un `ConflictError` di `advance` (un altro grafo caricato nel frattempo) arriva senza ricostruzioni. |
| `dispose(obj, tools)` | Se `obj` è attivo pubblica `ekg.before_reset` e svuota il grafo; per una radice rimuove la cartella del dataset. |
| `root_of(obj)`, `new_graph_key()`, `DatasetRepository`, `StorageSpaceTool` | L'oggetto `ekg` radice di `obj`; una chiave nuova; i file di un dataset, `Analyses/<nome>.json` compresi (`analyses`, `save_analysis`, `load_analysis`, `delete_analysis`) e i file aggiuntivi (`has_extra_file`, `extra_file_load_path`), sul tool `storage` (`StorageSpaceTool`, il `Protocol` di ciò che ne usa). |
| `BUILD_STEPS_POINT` (`"ekg.build_steps"`) | Step `EkgBuildStep` (`key`, `order`, `phase`, `applies(ctx)`, `execute(ctx, db)`) contribuiti con `ctx.contribute(BUILD_STEPS_POINT, step, key=step.key, order=step.order)`. Gli step del package: 100 eventi, 200 entità, 300 indici, 400 `:CORR`, 500 `:DF` (salta i tipi in `ctx.df_handled_types`); quelli contribuiti: 420 `ocel`, 450 `causal_df` (ogni `order` è diverso: `soup-server/tests/test_build_step_orders.py`). `phase` (`event`, `entity`, `corr`, `df`) decide in quali tempi della `process_info` finisce lo step. `ctx.extra_files` dà i file aggiuntivi del dataset presenti, per nome, con il percorso per `LOAD CSV` (`load_csv_clause(path)`), alla prima costruzione e a ogni ricostruzione; `normalize_text` è la normalizzazione di nomi e valori nel grafo. |
| `STATE_PROVIDERS_POINT` (`"ekg.state_providers"`) | `StateProvider` (`key`, `apply(spec, db)`). |
| `EKG_BEFORE_RESET`, `EKG_BUILT` | `"ekg.before_reset"` `{object, active, reason: build\|load\|dispose}` prima di svuotare o ricostruire; `"ekg.built"` `{object, dataset, counts}` dopo una costruzione. |
| `EKG_KIND`, `EventLogData`, `Table`, `ColumnMapping`, `EventLog`, `from_dataframe`, `to_dataframe`, `GraphDatabase`, `Query`, `ident` | |

All'avvio il package aggiunge al catalogo, come oggetti `ekg` creati dall'importer `csv_ekg.csv`, le
cartelle `/soup/<nome>/` con un `<nome>_config.json` non ancora presenti nel catalogo (stesso
`meta.dataset`), leggendo la `meta` dalla config; un errore (per esempio storage irraggiungibile)
finisce nel log e non ferma il package.

## Viste dell'EKG: il package `ekg_views`

`requires: ["ekg", "soup_base"]`, `requires_tools: ["memgraph", "storage"]`. Ogni visualizzatore e
l'exporter chiamano prima `ensure_loaded(obj, tools)` del package `ekg`, poi leggono il grafo solo
con oggetti `Query`. Etichette e tipi di relazione stanno nel pattern (`MATCH (n:`Event`)`,
`[r:`DF`|`CORR`]`), quotati con `ident()` e presi solo dalle liste chiuse di viste, interrogazioni e
parti; le scelte dell'utente vengono prima confrontate con quelle liste (`400` se mancano). Testi,
id, offset e `LIMIT` restano parametri (`$limit`, mai nel testo). Dettagli e verifica manuale con
Memgraph in [ekg_views/README.md](ekg_views/README.md).

| Contributo | |
|---|---|
| **Grafo** (`ekg_views.graph`) | Barra con la vista (tra quelle di `ekg.graph_views` di qualunque package), il limite (200 all'inizio, massimo `SOUP_EKG_VIEWS_MAX_LIMIT`, default 2000; un valore non intero positivo fa fallire il caricamento del package), i tipi di relazione della vista e la forma dei nodi; il disegno è `<soup-graph-view>` di soup_base. Le viste di ekg_views: **Grafo standard** (`standard`) e **Grafo degli oggetti** (`object`: le `:REL` tra le entità, colore e casella per qualifier, e le `:CORR` con il loro qualifier; vuota per un grafo senza `:REL`). Azioni: `graph` `{view, limit, relations}` → `{view, limit, relations, max_data, graph}`; `search` `{view, text, kind: node\|edge, offset, relations, label?}` → `{items, total}` (pagine da 50, la ricerca incrementale di `<soup-graph-view>`); `node` `{view, id}` → le proprietà del nodo. Il primo disegno invia `soup-thumbnail` (l'anteprima nel workspace); "Esporta SVG" salva `<nome>.svg` con `context.download`. |
| **Statistiche** (`ekg_views.stats`) | Conteggi, primo e ultimo timestamp, attività distinte, tipi di entità con il numero di eventi con valore nullo, `"nan"` o vuoto (avviso `"N nodi hanno valore NaN."`), le colonne del CSV con il ruolo dato dall'import (id evento, timestamp, attività, entità, valore o non usata), le torte della composizione (Event, Entity, CORR, DF) e dei tempi delle fasi di costruzione (secondi, da `meta.process_info`; assente se l'import non ha salvato i tempi). Sopra i dati, `meta.notice` e gli avvisi contribuiti a `ekg.stats_notices`. |
| **Interrogazioni** (`ekg_views.queries`) | Le `GraphQuery` di `ekg.queries` di qualunque package, raggruppate per `group`, ognuna con il form dei suoi campi; azione `query` `{key, params}` → `{key, label, blocks}`, mostrati con `<soup-report-view>`. Le 21 di ekg_views coprono tutte le letture della vecchia interfaccia: nodi evento ed entità, un'entità per tipo, entità di un tipo, eventi di un'attività, relazioni CORR, DF e DF di un tipo, il numero di `:REL` e `:CORR` per qualifier, conteggi (eventi, entità, CORR, DF, tutti i nodi), attività distinte e loro frequenza, chiavi delle entità ed entità per tipo, valori nulli, primo e ultimo timestamp, massimo numero di elementi mostrabili. |
| **JSON del grafo** (`ekg_views.json`) | Campo `parts` (multiselect): le parti di `ekg.json_parts`. Un file `{<etichetta della parte>: dati}` nel formato del vecchio export JSON: `Event nodes` e `Entity nodes` (proprietà dei nodi), `CORR relationships` `{corr_data: [{event, relation_type, related_event, relation_id}], corr_count}`, `DF relationships` `{df_data, df_count}`, `REL relationships` `{rel_data: [{source, relation_type, qualifier, target, relation_id}], rel_count}`. |

I punti di estensione (`soup_pkg_ekg_views.api`, per chi elenca `ekg_views` in `requires`; si
contribuisce con `ctx.contribute(POINT, item, key=item.key)`):

| Punto | Contratto | Basi |
|---|---|---|
| `GRAPH_VIEWS_POINT` (`"ekg.graph_views"`) | `GraphView`: `key`, `label`, `relationship_types`, `default_relations`, `node_labels`, `edges_query(limit, relations) -> Query`, `to_graph(records) -> {nodes, edges, directed}`; facoltativi `search_query`, `search_count_query`, `search_items`, `node_query`, `to_node`, `max_data_query`. | `EdgeListGraphView` (Template Method): `relationships` `{tipo: (etichetta sorgente, etichetta destinazione)}`, la lista chiusa da cui vengono `relationship_types` e `node_labels`; gli hook `node_label`, `node_group`, `edge_type`, `edge_label`; scrive da sé tutte le query. `StandardGraphView` (`standard`): Event ed Entity, CORR e DF (solo DF di default), gruppo = `Event` o il tipo dell'entità. `ObjectGraphView` (`object`): REL tra Entity e CORR (solo REL di default). |
| `QUERIES_POINT` (`"ekg.queries"`) | `GraphQuery`: `key`, `label`, `group`, `fields`, `build(params) -> Query`, `transform(records, params) -> [blocco]`. `values(raw)` controlla i params con i `fields` e limita `limit` a `max_limit` (1000). | `CountQuery` (blocco `keyvalue`, legge sempre la colonna `count`), `NodeListQuery` (tabella paginata con `total`), `RelationshipListQuery`; `where` e `filter_params` per restringerle. |
| `JSON_PARTS_POINT` (`"ekg.json_parts"`) | `JsonPart`: `key`, `label` (la chiave nel JSON), `query() -> Query`, `transform(records)`. | `NodesPart`, `RelationshipsPart`, `RelPart`. |
| `STATS_NOTICES_POINT` (`"ekg.stats_notices"`) | `StatsNotice`: `key`, `notice(obj, tools) -> str \| None`, un avviso di **Statistiche** per `obj` (o nessuno). | |

Ogni contributo dichiara i kind degli oggetti a cui si applica, `kinds` (default `("ekg",)`); quelli di
ekg_views dichiarano `STANDARD_KINDS` = `("ekg", "ekg_class")`, perché il grafo di un `ekg_class`
contiene anche l'EKG del padre. **Grafo** e **Statistiche** accettano solo `ekg`, e Grafo mostra le
viste il cui `kinds` contiene `ekg`. **Interrogazioni** e **JSON del grafo** accettano `ekg` più ogni
altro kind che ha almeno un contributo *dedicato* (con `kinds` senza `ekg`): con `ekg_class_graph`
attivo anche `ekg_class`, disattivato no. Per ogni oggetto mostrano solo i contributi il cui `kinds`
contiene il suo kind. `data()` di Grafo, Statistiche e Interrogazioni porta `notice`, il
`meta.notice` dell'oggetto (es. "L'analisi non ha modificato il grafo"), mostrato in un riquadro.
`GraphVisualizer` è esportato dall'api per i visualizzatori di altri kind con un proprio elemento
(es. **Grafo aggregato**).

I contributi si rileggono a ogni richiesta: un package abilitato o disabilitato a runtime aggiunge o
toglie subito le sue viste, interrogazioni e parti.

## Analisi: il package `ekg_analysis`

`requires: ["ekg", "ekg_views", "soup_base"]`, `requires_tools: ["memgraph", "storage", "catalog"]`
(il catalogo serve per adottare le analisi già sul volume), `api_version: "4.0"` (usa `Exporter.applies`, dalla `"3.1"`).

Un'analisi è un oggetto `ekg` **derivato**: `parents` = l'oggetto `ekg` di partenza, `meta.state` =
`{provider: "analysis", spec: {name, description, filters: {chiave del filtro: [condizione, ...]}}}`
(il modello generico, C29), `meta.graph_key`, `meta.analysis` = `{dataset, name}` (il file),
`meta.counts` = `{before, after}` (nodi e relazioni) e `meta.result` = `"changed"` o `"unchanged"`.
La configurazione è salvata anche in `/soup/<dataset>/Analyses/<nome>.json` nel vecchio formato (le
chiavi `timestamp`, `performance`, `includeActivities`, `excludeActivities`, `frequence`, `variant`
sempre presenti, più `dataset_name`, `analysis_name`, `analysis_description`), così le analisi
salvate dalla vecchia interfaccia e quelle nuove hanno lo stesso file.

| Contributo | |
|---|---|
| **Nuova analisi** (`ekg_analysis.new`, `ekg` → `ekg`) | Campi `name`, `description` e `filters` (tipo `items`, una variante per ogni `AnalysisFilter` di `ekg.analysis_filters` di qualunque package, con i campi e le scelte presi dal grafo dell'oggetto: tipi di entità, attività, primo e ultimo timestamp). I filtri si applicano nell'ordine dei filtri (`order`), non in quello della lista: l'ordine cambia il risultato. |
| **Importa configurazione di analisi** (`ekg_analysis.import`) | Campi `name` e `file` (JSON nel vecchio formato), validato filtro per filtro (`performance[1]: seconds ...`); una chiave sconosciuta è un `400`. Poi come Nuova analisi. |
| **Esempio di configurazione** (`ekg_analysis.example`, `ekg` → `report`) | Un blocco markdown che spiega ogni chiave e un blocco file `analysis_example.json` costruito sull'oggetto (sostituisce `getExampleJSON` e `help/file_configuration_example.json`); si importa così com'è. |
| **Indicatori di processo** (`<soup-pkg-ekg-insights>`, kind `ekg`) | Tipi di entità, frequenza delle attività e, per tipo di entità, durata media delle tracce, occorrenze delle attività e varianti con la loro durata media. Azioni `entity` `{entity}` (un tipo del grafo, altrimenti `400`) e `frequency` `{min}`. |
| **Configurazione dell'analisi** (exporter, `.json`) | Solo per gli oggetti di un'analisi (`applies`): il file nel vecchio formato. |

`AnalysisService` (Azione compensativa, C26): controlla che il nome non sia già usato (`409`), salva
il file, poi con `ekg.derive_state` sul grafo caricato del padre conta nodi e relazioni, pubblica
`analysis.before_apply` (`{object, analysis, spec}`, dichiarato in `soup_pkg_ekg_analysis.api`: chi si
iscrive lo fa come critical), applica i filtri e conta di nuovo. Se qualcosa fallisce nessun oggetto
viene creato, il file viene rimosso e il grafo del padre ricostruito. Se nulla cambia l'oggetto viene
creato con `meta.result: "unchanged"` e `meta.notice`, e il file resta (come il vecchio "Nothing
changed"). Dopo aver aperto altro, lo `StateProvider` `analysis` riapplica i filtri al padre
ricostruito con la stessa `meta.graph_key`. Cancellare un'analisi ne rimuove anche il file.

I filtri (Command, C25) sono `AnalysisFilter`: `key`, `label`, `description`, `order`,
`fields(obj, tools)`, `validate(spec)` e `to_queries(spec, ctx) -> list[Query]` (`ctx`:
`FilterContext`, con `run` e `activities()`); `EntityConditionFilter` è la base "tipo di entità,
operatore, valore". Ne vengono contribuiti sei, nell'ordine del vecchio `process_analysis`:
`timestamp` (100), `performance` (200), `includeActivities` (300), `excludeActivities` (400),
`frequence` (500), `variant` (600). Il testo Cypher è fisso: etichette e tipi con `ident()`,
l'operatore dalla lista chiusa `OPERATORS` (`<`, `<=`, `=`, `!=` che diventa `<>`, `>`, `>=`), ogni
valore come parametro. Un altro package aggiunge un filtro con
`ctx.contribute(ANALYSIS_FILTERS_POINT, item, key=item.key, order=item.order)`: diventa una variante di
Nuova analisi e una chiave dei file di configurazione.

All'avvio, ogni `Analyses/<nome>.json` di un dataset nel catalogo senza un oggetto diventa un oggetto
`ekg` derivato della sua radice (creato da `ekg_analysis.new`, senza chiave: la prima apertura lo
ricostruisce); un file illeggibile o con un nome non valido finisce nel log.

Un'analisi fatta su un'altra analisi ne è figlia e il suo file ha in più `"based_on": "<padre>"`;
l'adozione segue quest'ordine (prima i padri) e, se il padre manca o c'è un ciclo, adotta l'analisi
sotto la radice con `meta.warning` e un avviso nel log. Dettagli, prova su Memgraph
(`tests/memgraph_smoke.py`) e verifica manuale in [ekg_analysis/README.md](ekg_analysis/README.md).

## Grafo aggregato: il package `ekg_class_graph`

`requires: ["ekg", "ekg_views", "soup_base"]`, `requires_tools: ["memgraph"]`.

**Costruisci grafo aggregato** (`ekg_class_graph.build`, `ekg` → `ekg_class`): campi `name` ed
`entity_types` (multiselect dei tipi di entità del grafo, i vecchi `filtered_columns`; un tipo con
eventi a valore nullo porta l'avviso `"N nodi hanno valore NaN."`, da `NullEntities` di ekg_views). Con
`ekg.derive_state` costruisce sul grafo caricato i nodi `:Class` (uno per combinazione distinta dei
valori dei tipi scelti, con il peso `Count`), le relazioni `:OBSERVED` dagli eventi e `:DF_C` tra classi.
L'oggetto `ekg_class` è un derivato: `meta.state` = `{provider: "ekg_class_graph.classes", spec:
{entity_types}}`, il suo `ekg` tra i `parents`, `meta.graph_key`, `meta.counts` (`class_nodes`,
`obs_rel`, `dfc_rel`) e i tempi delle fasi in `meta.process_info`; `ekg.ensure_loaded` ricostruisce il
padre e applica le classi con lo `StateProvider` del package.

| Contributo | |
|---|---|
| **Grafo aggregato** (`<soup-pkg-ekg-class-graph>`) | `GraphVisualizer` di ekg_views sulle viste per `ekg_class`: prima la vista `class` (`DF_C` di default, `OBSERVED`), poi quella standard. Azioni `graph`, `search`, `node`. |
| **Statistiche del grafo aggregato** (`<soup-pkg-ekg-class-stats>`) | Conteggi, tipi di entità e le due torte della vecchia pagina (Class Nodes/OBS/DF_C e i secondi delle fasi). |
| `ekg.graph_views`, `ekg.queries`, `ekg.json_parts` | La vista `class`; le interrogazioni dei nodi Class, delle relazioni OBSERVED e DF_C e dei loro conteggi (gruppo "Grafo aggregato"); le parti `Class nodes`, `OBS relationships` (`obs_data`, `obs_count`) e `DF_C relationships` (`dfc_data`, `dfc_count`). Tutte con `kinds ("ekg_class",)`. |

Observer (C6): si iscrive a `ekg.before_reset` e, come critical, ad `analysis.before_apply` (basta il
nome dell'evento, non richiede `ekg_analysis`) e cancella i propri nodi `:Class`, verificando che non
ne restino. Nessun altro package chiama il suo codice. Con il package disattivato le analisi
funzionano, le interrogazioni e le parti delle classi spariscono e gli oggetti `ekg_class` restano
senza operazioni, visualizzatori ed exporter.

## OCEL 2.0: il package `ocel`

`requires: ["soup_base", "ekg", "ekg_views", "tool_storage"]`, `requires_tools: ["memgraph", "storage"]`,
`api_version: "4.1"`. Legge il formato JSON di OCEL 2.0 (`eventTypes`, `objectTypes`, `objects`,
`events`) con la libreria standard. Un file non conforme risponde `400` con il punto del file e il
motivo (`Not a valid OCEL 2.0 JSON file: events[2].time: 'ieri' is not an ISO 8601 date and time`).
Vengono rifiutati: JSON non valido, id duplicati, tempi non ISO 8601, relazioni verso oggetti assenti,
tipi non dichiarati (quando il file li dichiara) e valori che non sono scalari. Senza `eventTypes` e
`objectTypes` i tipi si ricavano da eventi e oggetti. I due importer hanno lo stesso `inspect`: un
blocco `keyvalue` (eventi, oggetti, tipi di evento, tipi di oggetto) e una `table` con i primi 20
eventi.

| Contributo | |
|---|---|
| **OCEL 2.0 come tabelle** (`ocel.tables`, → `ocel_tables`) | Salva le tabelle in `ocel/<id dell'oggetto>/` dello storage, un JSON per tabella (così i valori tengono il loro tipo): `events` (`event_id`, `event_type`, `time`, una colonna per attributo), `objects` (`object_id`, `object_type`, il primo valore di ogni attributo), `event_objects` (con `qualifier`), `object_objects` (`source_id`, `source_type`, `target_id`, `target_type`, `qualifier`), `object_attributes` (ogni valore degli attributi degli oggetti con il suo `time`) e `types.json`. Un attributo che il file dà con valore `null` resta `null` (le celle vuote della tabella sono gli attributi assenti, quelle `null` sono elencate in `nulls` del JSON degli eventi). Nessuna query a Memgraph. `dispose` toglie la cartella. |
| **OCEL 2.0 come EKG su Memgraph** (`ocel.ekg`, → `ekg`) | `EventLogData` in forma separata con mapping fisso: id, time (in UTC, senza offset) e type dell'evento come id evento, timestamp e attività; i tipi di oggetto come tipi di entità; gli attributi degli eventi come proprietà (un nome riservato o uguale a un tipo di oggetto prende il suffisso `_attribute`). I qualifier e le relazioni oggetto-oggetto **entrano nel grafo** con lo step di ocel (`ocel_relationships`, order 420, [ocel/README.md](ocel/README.md)): il qualifier di una relazione evento-oggetto è la proprietà `qualifier` della sua `:CORR`, una relazione oggetto-oggetto è `(:Entity)-[:REL {qualifier}]->(:Entity)`. I due file che lo step legge (`ocel_qualifiers.csv`, `ocel_o2o.csv`) sono salvati nel dataset; `meta.ocel.in_graph` conta le `:CORR` con qualifier e le `:REL`. Tutti i visualizzatori e le operazioni del kind `ekg` funzionano senza modifiche. |
| **Tabelle OCEL** (`<soup-pkg-ocel-tables>`) | Schede Eventi, Oggetti, Relazioni evento-oggetto e Relazioni oggetto-oggetto, ognuna con `<soup-table>` a paginazione remota: azione `page` `{table, offset, limit, sort, search, type}` → `{rows, total}`. `type` filtra per tipo di evento (Eventi) o di oggetto (Oggetti e Relazioni evento-oggetto; nelle relazioni oggetto-oggetto basta una delle due estremità). |
| **Riepilogo OCEL** (`<soup-pkg-ocel-summary>`) | I conteggi (`<soup-keyvalue>`) e il grafico a barre degli eventi per tipo (`<soup-chart>`), presi dalla `meta`; l'anteprima del workspace mostra le stesse barre. |
| **Scomponi in EKG** (`ocel.to_ekg`, `ocel_tables` → `ekg`) | La stessa scomposizione dell'importer EKG, rileggendo le tabelle già importate: l'EKG (`<nome> (EKG)`) è figlio delle tabelle e il suo dataset coincide con quello dell'importer. |
| **OCEL 2.0 JSON** (exporter) | Il log riscritto dalle tabelle; con `file_type` prende l'estensione del file importato (`.json` o `.jsonocel`) e il MIME `application/json`. Gli attributi `null` del file importato restano `null`. Reimportato, dà lo stesso file. |

Tutti i tempi passano da `parse_time` (`model.py`), che legge anche il suffisso `Z` (UTC): `datetime.fromisoformat` lo accetta solo da Python 3.11.

Le tabelle si leggono dallo storage una volta per oggetto: Tabelle OCEL, l'exporter e Scomponi in EKG usano una
`ParsedCache` per istanza del plugin, come `csv_table` (quella di `soup_base`, `soup_pkg_soup_base.api`), con i limiti `SOUP_OCEL_CACHE_OBJECTS` e `SOUP_OCEL_CACHE_MB` (default 8
oggetti e 200 MB; un valore non intero positivo fa fallire il caricamento del package). Un nuovo import e `dispose`
invalidano l'oggetto; `read_table`, `read_log` e `load_tables` dell'api leggono sempre dallo storage.

Per provare l'installazione a runtime (lo fa anche `soup-app/e2e/ocel.spec.ts`): `npm run build:packages --
ocel && npm run pack -- ocel`, poi, con l'applicazione avviata e `soup_base`, `tool_storage`,
`tool_memgraph`, `ekg` ed `ekg_views` attivi, caricare `dist/ocel-1.0.0.zip` da **/packages**. Gli importer
compaiono subito in **/import** per i `.json`, insieme a visualizzatori, operazione ed exporter, senza
riavvio né rebuild dell'host.

## Regole per il codice del package

- Dell'host si importa solo `soup.core.contracts`; i file interni del package si importano con
  import relativi (`from .reader import ...`).
- Il modulo `server/` viene importato con un nome isolato, `soup_pkg_<nome>`, quindi due package
  possono avere file con lo stesso nome.
- Un altro package si usa solo tramite la sua API pubblica, `soup_pkg_<altro>.api`, e solo se
  `<altro>` è elencato in `requires` (così viene caricato prima). Altrimenti si comunica tramite
  tool, punti di estensione (`add_extension_point` / `contribute`) ed eventi (`EventBus`).
- La parte `app/` non importa codice dell'host: ogni visualizzatore è un custom element che riceve
  `data` e `context` e comunica con l'host tramite `context` ed eventi DOM.

## Dove vengono cercati

- `SOUP_PACKAGES_PATH`: elenco di cartelle separate da `os.pathsep` (`:` su Linux e in Docker, `;`
  su Windows). Default: questa cartella e la cartella dei package installati.
- `SOUP_INSTALLED_PACKAGES_DIR`: dove `install` estrae gli zip e dove si salva lo stato
  (`_state.json`); viene sempre aggiunta al path. Default `soup-server/instance/packages`, in Docker
  `/data/soup-packages` (volume `soup-installed-packages`).
- Se lo stesso nome compare in due cartelle vince la versione più alta.
- `SOUP_PACKAGES`: elenco esplicito dei package da attivare all'avvio (vuoto = nessuno). Se
  assente, sono attivi tutti quelli trovati tranne quelli disabilitati dall'utente.
  Il vecchio nome `SOUP_PLUGINS` non è più letto.

## Ciclo di vita

All'avvio, prima di importare qualsiasi codice, il `PackageManager` verifica manifest,
`api_version`, `python_dependencies` e `requires` (con ordinamento topologico e rilevamento dei
cicli). Un package che fallisce finisce nel report con il motivo e non blocca gli altri (salvo
`SOUP_STRICT=true`).

Install, enable, disable e uninstall avvengono mentre il server risponde ad altre richieste: i
registri del core sono copy-on-write, quindi chi legge vede sempre uno stato coerente.

A runtime, via `/api/v3/packages`:

| Operazione | HTTP | Note |
|---|---|---|
| Elenco | `GET /api/v3/packages` | stato `active`, `disabled` o `failed`, con errore, dipendenti e contributi registrati (`contributions`) |
| Installa | `POST /api/v3/packages` (multipart `file`) | Zip con il manifest alla radice o in un'unica cartella di primo livello. Rifiutati: zip oltre 50 MB (200 MB estratti), percorsi che escono dalla cartella, link simbolici, manifest non validi, librerie Python mancanti, `requires` non attivi. Un nome già usato da un package fornito richiede una versione superiore e `allow_override=true`; un package installato si aggiorna solo a una versione superiore. Il package viene caricato subito; se il caricamento fallisce si torna alla versione precedente. |
| Disabilita | `POST /api/v3/packages/<nome>/disable` | Toglie i contributi senza riavvio. `409` con `dependents` se altri package attivi ne hanno bisogno; `cascade=true` disabilita anche quelli. |
| Abilita | `POST /api/v3/packages/<nome>/enable` | `409` se un package richiesto non è attivo. |
| File del frontend | `GET /api/v3/packages/<nome>/app/<percorso>` | Solo file di `app/dist` di un package attivo; ogni percorso che esce da `app/dist` (anche tramite link simbolici) risponde `404`. ETag basato sulla versione del package. |
| Manifest frontend | `GET /api/v3/frontend/manifest` | `[{name, version, module_url, requires}]` dei package attivi con parte `app`, ognuno dopo i package che richiede: l'host li importa in quest'ordine. |
| Disinstalla | `DELETE /api/v3/packages/<nome>` | Solo package installati (quelli forniti si disabilitano). Gli oggetti creati dal package restano nel workspace, segnalati come `package_status: "missing"`. |

Un oggetto il cui package non è attivo (disabilitato o disinstallato) non si cancella normalmente,
perché nessuno può eliminarne i dati: la cancellazione risponde `409` con l'elenco dei package
coinvolti. Si può riattivare il package, oppure usare `force=true`, che toglie l'oggetto solo dal
catalogo e lo annota in `<cartella dei package installati>/orphaned-data.json` (oggetto con la sua
`meta`, package, contributore e data), così i dati rimasti si possono ripulire in seguito.

Installazione e disinstallazione rispondono `403` se `SOUP_ALLOW_PACKAGE_INSTALL` non è `true`.
Lo stato abilitato/disabilitato si conserva tra i riavvii.

## Frontend: `@soup/sdk`

L'host Angular non contiene visualizzatori. Ogni visualizzatore è un **Web Component** (custom
element) definito nel bundle `app/dist/index.js` del suo package; l'host lo importa a runtime con
`import()` dall'URL `/api/v3/packages/<nome>/app/...`, nell'ordine del manifest frontend (ogni
package dopo quelli che richiede). Un bundle che fallisce non blocca gli altri: l'errore compare
nella pagina `/packages`. La parte `app/` dipende solo da `@soup/sdk` (`sdk/`, solo TypeScript,
nessun framework), mai dal codice dell'host.

- **Tipi condivisi**: `ObjectRef`, `Field` (i 13 tipi di campo), `Block` (i 9 tipi di blocco di
  `report.py`), `FileValue`, `ItemValue`.
- **DOM**: `h(tag, {className, text, attrs, on}, ...children)` crea un elemento (il testo sempre
  come `textContent`; `null` e `undefined` tra i figli si saltano) ed `errorMessage(error)` dà il
  testo di un errore. Prima ogni package ne aveva una copia in `app/src/dom.ts`.
- **Visualizzatori**: l'host crea l'elemento con il tag dichiarato in `Visualizer.element`, imposta
  `data` (la risposta di `data()`) e `context`, poi lo inserisce nella pagina. `VisualizerContext`:
  `object`, `theme`, `action(name, params)` (chiama `Visualizer.action` del proprio visualizzatore),
  `openObject(id)`, `notify(message, level)`, `setThumbnail(svg)` (anteprima mostrata nel workspace
  come immagine), `download(filename, mime, data)`. È l'unione di interfacce piccole, una per
  capacità (`ObjectContext`, `ActionContext`, `NavigationContext`, `NotifyContext`,
  `ThumbnailContext`, `DownloadContext`): un elemento o una funzione che usa solo una parte dichiara
  quella (`<soup-graph-view>` riceve un `NotifyContext`), e un `VisualizerContext` va bene ovunque.
- **Configurazione degli importer**: un importer con `config_element` sostituisce il form generico
  con un proprio elemento, che riceve un `ConfigContext`: `fields`, `columns` (colonne
  dell'anteprima), `value`, `preview(options)` e `emit(options)` per le opzioni dell'import.
- **Eventi DOM** verso l'host (bubbling, `composed`): `soup-thumbnail` `{svg}`, `soup-open-object`
  `{id}`, `soup-notify` `{message, level}`, `soup-config-change` `{value}`. I metodi del contesto
  li emettono: un elemento può usare indifferentemente gli uni o gli altri.
- **`defineSoupElement(tag, klass)`** registra l'elemento solo se il tag non esiste già, così un
  bundle ricaricato (dopo disable/enable) non fallisce. Un custom element non si può ridefinire: la
  nuova versione di un package già caricato nella pagina si usa dopo aver ricaricato la pagina
  (`/packages` lo segnala).
- Il testo che viene dai dati va inserito con `textContent`, mai come markup.

```ts
import { defineSoupElement, SoupVisualizerElement, VisualizerContext } from '@soup/sdk';

class MyViewer extends HTMLElement implements SoupVisualizerElement<MyData> {
  data!: MyData;
  context!: VisualizerContext;
  connectedCallback() { /* render this.data */ }
}

defineSoupElement('my-package-viewer', MyViewer);
```

## Build e zip

Dalla radice di `soup-packages` (workspace npm: `sdk` e l'`app/` di ogni package):

```sh
npm install                          # una volta, e dopo aver aggiunto un package con app/
npm run lint                         # eslint (con complexity e max-lines-per-function), knip, tsc dell'SDK
npm test                             # unit test vitest (jsdom) di */app/test/ e sdk/test/
npm run build:packages               # SDK, poi type check + esbuild di ogni app/ -> app/dist/index.js (ES module unico, minificato, con sourcemap)
npm run build:packages -- my_package # solo alcuni package
npm run pack -- my_package           # dist/my_package-<versione>.zip: manifest, server/, app/dist/
curl -F file=@dist/my_package-1.0.0.zip http://localhost:8080/api/v3/packages
```

L'immagine Docker del server esegue `npm ci && npm run build:packages`, quindi i bundle dei package
forniti sono sempre aggiornati. Per partire da un esempio segui "Scrivere un package" in cima a
questa pagina, o copia [`_template`](_template/README.md) (un importer di file `.txt` e il suo
visualizzatore).
