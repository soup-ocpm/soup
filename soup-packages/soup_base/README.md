# soup_base

Package fornito e attivo di default. Contiene:

- il visualizzatore **Report** (`soup_base.report`, kind `report`, elemento `<soup-report-view>`);
- l'exporter **Report in JSON** (`soup_base.json`): `{name, description, created_at, blocks}`;
- una libreria di **custom element riusabili**, definiti dal bundle `app/dist/index.js`.

Non richiede tool. Il server non usa nessuna libreria Python oltre al core.

## Usare gli elementi da un altro package

I custom element sono globali nella pagina: un package li usa per tag, senza importare codice di
soup_base. Basta dichiarare la dipendenza nel manifest, così l'host carica soup_base prima di lui:

```json
{ "name": "my_package", "requires": ["soup_base"] }
```

```ts
const table = document.createElement('soup-table');
table.data = { columns: ['case', 'activity'], rows: [['o1', 'Create']] };
this.shadowRoot.append(table);
```

Per i tipi TypeScript, copia nel tuo `app/` le interfacce che ti servono da questa pagina: il codice
di soup_base non si importa.

Ogni elemento riceve i dati nella proprietà `data` (lo stesso formato del `data` del blocco
corrispondente, vedi `soup/core/contracts/report.py`); assegnarla di nuovo ridisegna. Nessun
elemento inserisce dati come markup: il testo passa da `textContent`, le immagini (SVG compresi)
da `<img>` con URL `data:`. L'unica eccezione è `<soup-markdown>`, che inserisce l'HTML prodotto
da `marked` dopo averlo sanificato con DOMPurify (solo HTML: niente SVG, MathML o script).

## Elementi

| Tag | `data` | Altro |
|---|---|---|
| `<soup-text>` | `{text}` | Proprietà `text`. Attributo `line-numbers`. Metodo `search(query)` e proprietà `matchCount`; la casella di ricerca evidenzia i risultati. |
| `<soup-markdown>` | `{markdown}` | `renderMarkdown(md)` (marked + DOMPurify). |
| `<soup-image>` | `{mime, base64}` oppure `{svg}`, `alt?` | Solo tipi `image/*`; l'SVG è mostrato con `<img src="data:image/svg+xml;base64,...">`. |
| `<soup-table>` | `{columns, rows, total?}` | Vedi sotto. |
| `<soup-chart>` | `{chart: 'pie'\|'bar'\|'line', labels, datasets: [{label, data}]}` | Chart.js; il grafico viene distrutto quando l'elemento esce dalla pagina. |
| `<soup-keyvalue>` | `{items: [{key, value}]}` | Attributo `variant="tiles"`: ogni coppia come "stat tile" (valore grande, chiave sotto, in griglia), per i numeri principali di una pagina. |
| `<soup-file-link>` | `{filename, mime, base64}` | Bottone che salva il file. |
| `<soup-error>` | `{message}` | |
| `<soup-report-view>` | `{blocks, name?, description?}` | Disegna i blocchi uno sotto l'altro con gli elementi di questa tabella (il titolo del blocco sopra). Un tipo sconosciuto mostra un avviso con i dati in JSON. Riceve anche `context` (`VisualizerContext`), passato agli elementi che lo accettano. L'host lo usa anche per l'anteprima dell'import. Altri tipi di blocco si aggiungono senza toccare il suo codice: `customElements.get('soup-report-view').registerBlock(tipo, tag)` (vedi sotto). |
| `<soup-graph-view>` | blocco `graph` o righe EKG | Vedi sotto. |

### `<soup-table>`

Paginazione, ordinamento per colonna (clic sull'intestazione, o Invio/Spazio da tastiera: crescente, decrescente, nessuno;
numeri per valore, celle vuote in fondo), ricerca e scelta delle colonne visibili. Intestazione fissa,
righe alternate, numeri allineati a destra.

| Proprietà | Significato |
|---|---|
| `data` | `{columns, rows, total?}`; `total` maggiore delle righe mostra "Mostrate N righe su total". |
| `columns`, `rows` | In alternativa a `data`; poi chiama `refresh()`. |
| `pageSize` | Righe per pagina (25). |
| `loadPage` | Paginazione **remota**: `(query) => Promise<{rows, total}>` con `query = {offset, limit, sort: {column, direction} \| null, search}`. Di solito chiama un'azione del visualizzatore (`context.action('page', query)`). Senza, le righe si paginano in memoria. |

Metodi: `refresh()`, `goTo(page)`, `sortBy(column)`, `setSearch(text)`,
`setColumnVisible(column, visible)`. Evento `soup-table-page` `{page, total}` dopo ogni pagina.


### Tipi di blocco di altri package

Un package (che richiede `soup_base`) disegna un tipo di blocco nuovo con un proprio elemento,
registrato nella vista dei report senza importarne il codice (i package condividono solo l'SDK):

```ts
defineSoupElement('my-pkg-sparkline', MySparkline);   // riceve data (e context, se ha la proprietà)
const view = customElements.get('soup-report-view') as unknown as {
  registerBlock(type: string, tag: string): void;
};
view.registerBlock('sparkline', 'my-pkg-sparkline');
```

I tipi di `report.py` (`text`, `markdown`, `image`, `table`, `graph`, `chart`, `keyvalue`, `file`,
`error`) restano di soup_base e non si sostituiscono; un tag non valido o un tipo vuoto sollevano un
errore. `blockElement(tipo)` dice quale tag disegna un tipo.
## `<soup-graph-view>`

Il grafo dei package EKG, estratto dal vecchio `pages/graph-dataset` (che resta finché ci sono le
pagine v2). Zoom e pan con la rotella e il trascinamento, forma dei nodi, visibilità per tipo di
relazione, ricerca di nodi e archi con scorrimento incrementale, evidenziazione dei nodi di un arco
al passaggio del mouse, pannello delle proprietà del nodo selezionato ed esportazione SVG.

### Dati

`data` accetta:

- il blocco `graph` dei report: `{nodes: [{id, label, group, props}], edges: [{id, source, target,
  label, group, props}], directed}`. Il tipo di relazione di un arco è `group` (altrimenti `label`),
  il peso è `props.weight` (default 1);
- le righe degli endpoint EKG attuali: `[{node_source, edge, node_target}]`, con l'etichetta dei
  nodi in `ActivityName`, il tipo dell'arco in `relation` (altrimenti `Type`) e il peso in
  `edge_weight`. Il `Timestamp` dei nodi viene formattato come nella vecchia pagina.

I nodi sono deduplicati per `id` (vince il primo); gli archi verso nodi sconosciuti sono ignorati;
i dati ricevuti non vengono modificati. Lo stesso lavoro lo fa la funzione pura `toGraphModel(data)`,
che restituisce `GraphModel {nodes: GraphNodeModel[], edges: GraphEdgeModel[], directed}`.

### Proprietà

| Proprietà | Significato |
|---|---|
| `data` | Vedi sopra. Nuovi dati azzerano la selezione; colori e tipi nascosti restano. |
| `context` | Il `VisualizerContext`, se l'elemento è dentro un visualizzatore (usato per le notifiche di errore della ricerca remota). |
| `search` | Ricerca **remota**: `(query, target: 'nodes' \| 'edges', offset, limit) => Promise<{items, total}>`. Le pagine sono di 50 elementi e la successiva si chiede scorrendo la lista. Senza, si cerca nel modello in memoria (etichette, id, tipi, proprietà). |
| `nodeDetails` | Proprietà complete del nodo selezionato: `(id) => Promise<GraphNodeModel \| null>` (di solito un'azione del visualizzatore). Le proprietà mostrate sono quelle restituite (`null`: restano quelle del modello); una risposta che arriva quando è selezionato un altro nodo è ignorata. Senza, si mostrano le proprietà del modello. |
| `renderer` | Un'istanza di `GraphRenderer` (ha la precedenza sull'attributo `engine`). |
| `thumbnail` | `true` (default): dopo aver disegnato nuovi dati emette `soup-thumbnail` con l'SVG (se sotto 512 KB). |
| `toolbar` | I comandi della barra: `'full'` (default: forma dei nodi, relazioni, cerca, esporta SVG, conteggi), `'none'` (nessuna barra: il visualizzatore disegna la propria e usa `openSearch()`, `exportSvg()`, `setNodeShape()`) oppure l'elenco dei comandi da mostrare tra `'shape'`, `'relationships'`, `'search'`, `'export'`, `'counts'` (sempre nell'ordine della barra, raggruppati: forma e relazioni \| cerca \| esporta, conteggi a destra). Ha la precedenza sull'attributo `toolbar`. |
| `searchVisible` | `true` se il pannello di ricerca è aperto (sola lettura). |
| `palette` | La `RelationshipPalette` (sola lettura). |
| `model`, `selected`, `shape` | Il modello disegnato, il nodo selezionato, la forma corrente (sola lettura). |

Attributo `engine`: il nome di un motore registrato (default `dagre`). Attributo `toolbar`:
`full`, `none` o i nomi dei comandi separati da spazi o virgole (`toolbar="search export"`; i nomi
sconosciuti sono ignorati). Variabile CSS `--soup-graph-height` (default
`clamp(420px, calc(100dvh - 300px), 900px)`: segue l'altezza della finestra, mai sotto 420 px; 420 px
sotto 768 px); sotto 768 px il pannello laterale (ricerca, proprietà) va sotto il disegno.

Il disegno è adattato e centrato nell'area (anche in verticale) a ogni nuovo dato e a ogni cambio di
dimensione dell'area, finché l'utente non usa zoom o pan. Le etichette degli archi hanno uno sfondo
chiaro con bordo arrotondato (`rect.label-bg`, con attributi di presentazione: identico
nell'esportazione SVG e nell'anteprima) che copre la linea sotto il testo.

### Metodi

| Metodo | |
|---|---|
| `setNodeShape('rect' \| 'circle')` | Forma dei nodi. |
| `setRelationshipVisible(type, visible)` | Mostra o nasconde un tipo di relazione. |
| `highlight(ids, on)` | Evidenzia o spegne dei nodi. |
| `selectNode(id \| null)` | Seleziona un nodo del modello o dei risultati della ricerca, anche se non è disegnato (di nuovo lo stesso, o `null`: deseleziona), e ne mostra le proprietà (chieste a `nodeDetails`, se impostato). |
| `openSearch(open?)` | Apre (`true`) o chiude (`false`) il pannello di ricerca; senza argomento lo alterna. Per una barra propria (`toolbar = 'none'`). |
| `toolbarCommands()` | I comandi che la barra mostra, in ordine. |
| `runSearch(query, target?)`, `loadMore()` | Ricerca e pagina successiva dei risultati. |
| `exportSvg(): string` | Il disegno come documento SVG autonomo. |
| `downloadSvg(filename = 'graph.svg')` | Salva l'SVG. |

### Eventi

| Evento | `detail` |
|---|---|
| `soup-node-select` | `{id, node}` (`null` quando si deseleziona). |
| `soup-thumbnail` | `{svg}`: l'host lo salva come anteprima dell'oggetto. |

### Colori e motori

`RelationshipPalette` tiene colori (la tavolozza del vecchio grafo, nell'ordine in cui i tipi
compaiono) e visibilità per tipo di relazione e per `group` di nodo, separati dal motore. Sopravvive
ai ridisegni e a nuovi dati.

Il disegno lo fa un `GraphRenderer`:

```ts
interface GraphRenderer {
  mount(container: HTMLElement): void;
  render(model: GraphModel, options: { palette: RelationshipPalette; shape: 'rect' | 'circle'; direction?: 'LR' | 'TB' }): void;
  setNodeShape(shape: 'rect' | 'circle'): void;
  setRelationshipVisible(type: string, visible: boolean): void;
  setHighlighted(ids: readonly string[], on: boolean): void;
  clear(): void;
  exportSvg(): string;
  onNodeClick: ((id: string) => void) | null;
  destroy(): void;
}
```

Il motore predefinito, `DagreGraphRenderer` (layout di `@dagrejs/dagre`, disegno, zoom e pan d3 con lo
stesso SVG del vecchio dagre-d3: `g.node`, `g.edgePath`, `g.edgeLabel`), crea una sola volta il suo
`<svg>` e il gruppo che zoom e pan trasformano, e ridisegna sempre lì. `@dagrejs/dagre` è alla 3.1.1
(versione esatta in `app/package.json`; l'ultima 3.x rilasciata da almeno due settimane al momento della scelta). Rispetto
alla 1.1.8, che disponeva i nodi come il dagre 0.8.5 di dagre-d3, la 3.x li ordina diversamente in
ogni colonna: sui grafi di prova (ordini, la sua vista degli oggetti, order_process e il suo grafo
aggregato, try4) ha avuto meno incroci tra archi sui grafi più fitti (24 → 17 e 19 → 17), lo stesso
numero sugli altri (±1) e nessuna etichetta sovrapposta, come la 1.1.8; è anche la serie mantenuta,
con i tipi inclusi. Il disegno (forme, stili, colori, frecce, struttura SVG) non dipende dalla versione.
Un package può fornire un altro motore senza importare codice di soup_base:

```ts
const GraphView = customElements.get('soup-graph-view') as unknown as {
  registerRenderer(name: string, factory: () => GraphRenderer): void;
};
GraphView.registerRenderer('my-engine', () => new MyRenderer());
// <soup-graph-view engine="my-engine">, oppure view.renderer = new MyRenderer()
```

## Difetti corretti rispetto al vecchio GraphComponent

- I nodi erano deduplicati confrontando ogni coppia con `JSON.stringify` (O(n²)) dopo averne
  formattato il `Timestamp` sull'oggetto ricevuto: lo stesso nodo letto due volte restava doppio e
  i dati venivano modificati. Ora la deduplicazione usa una `Map` per id e una copia dei dati.
- Hover, selezione, forma dei nodi e visibilità delle relazioni ridisegnavano nell'`<svg>` invece
  che nel gruppo con lo zoom: veniva disegnata una seconda copia fuori dallo zoom. Ora si ridisegna
  sempre nello stesso gruppo.
- La centratura iniziale era un attributo `transform` che lo zoom non conosceva, e il primo
  trascinamento faceva saltare il grafo. Ora è una trasformazione dello zoom.
- A ogni caricamento i colori venivano azzerati e i tipi di relazione aggiunti di nuovo alla lista,
  che li mostrava doppi.
- Un tipo di relazione nascosto e poi rimostrato perdeva il peso: arco più sottile, etichetta senza
  peso. Ora gli archi si ricostruiscono sempre dal modello.
- Con un solo peso la scala degli spessori aveva un dominio vuoto.
- `hoverEdge` conteneva un `setTimeout` vuoto.

## Test

`npm test` dalla radice di soup-packages (vitest + jsdom): `toGraphModel`, `RelationshipPalette`,
`<soup-table>` (pagine locali e remote, ordinamento, ricerca), `<soup-report-view>` e la selezione di
`<soup-graph-view>` con `nodeDetails` (con un motore finto). Il disegno del
grafo si prova in un browser vero con `soup-app/e2e/soup-graph-view.spec.ts` (Playwright).
