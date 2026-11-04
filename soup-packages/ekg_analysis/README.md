# ekg_analysis

Package fornito e attivo di default: le analisi degli oggetti `ekg` come operazioni (**Nuova
analisi**, **Importa configurazione di analisi**, **Esempio di configurazione**), il punto di
estensione `ekg.analysis_filters` con i sei filtri del vecchio codice, il visualizzatore
**Indicatori di processo** e l'exporter **Configurazione dell'analisi**. Contratti, formato dei file e
rollback sono descritti nella sezione "Analisi" di [../README.md](../README.md).

`requires: ["ekg", "ekg_views", "soup_base"]`, `requires_tools: ["memgraph", "storage", "catalog"]`,
`api_version: "4.0"` (usa `Exporter.applies`, dalla `"3.1"`).

## Analisi annidate

Una "Nuova analisi" fatta su un'altra analisi è figlia di quella (`parents`) e il suo file
`Analyses/<nome>.json` ha la chiave in più `"based_on": "<nome dell'analisi padre>"`, che il vecchio
formato ignora. All'avvio le analisi sul volume senza oggetto vengono adottate in ordine topologico:
prima quelle senza `based_on`, sotto la radice del dataset, poi le figlie sotto il padre giusto, così
una catena persa dal catalogo torna con i filtri di tutti i suoi anelli. Un `based_on` che non esiste,
o un ciclo, adotta l'analisi sotto la radice con `meta.warning` (mostrato anche come avviso dai
visualizzatori) e un avviso nel log. Cancellare un'analisi che ha figlie risponde `409` come per ogni
oggetto del workspace; con `cascade` si cancellano anche le figlie e i loro file.

## Test

- `pytest` da `soup-server/` raccoglie `tests/test_*.py` (FakeDatabase e storage locale su
  `tmp_path`, niente Docker).
- `npm test` dalla radice di `soup-packages`: l'elemento `<soup-pkg-ekg-insights>` con un context
  finto.
- `tests/memgraph_smoke.py` (non raccolto da pytest) esegue contro un Memgraph vero, ognuna su una
  copia fresca di un piccolo EKG, le query che **modificano** il grafo: i sei filtri con ogni
  operatore, un'analisi con filtri combinati (con la cancellazione delle classi di
  `analysis.before_apply`), il rollback (`advance` che fallisce a metà e ricostruzione del padre, con
  i conteggi di partenza), "Costruisci grafo aggregato" con uno e con due tipi di entità, le
  interrogazioni Class/OBS/DF_C, le parti JSON e la vista `class` di `ekg_class_graph`, e le letture
  degli Indicatori di processo. Per ogni controllo stampa se riesce e nodi/relazioni prima e dopo;
  esce con 1 se qualcosa fallisce.

  ```sh
  docker run -d --rm --name ekg-analysis-smoke -p 17688:7687 memgraph/memgraph:3.13.2
  cd soup-server
  python ../soup-packages/ekg_analysis/tests/memgraph_smoke.py            # default bolt://localhost:17688
  docker stop ekg-analysis-smoke
  ```

  Lo script **svuota il database**: non va mai puntato su un Memgraph con dati da conservare.
  L'immagine è la stessa di `docker-compose.yaml` (`memgraph/memgraph:3.13.2`, Memgraph 3.13.2): se si
  aggiorna il tag lì, va aggiornato anche qui e lo script rieseguito (lo controlla
  `soup-server/tests/test_cypher_compatibility.py`). Ultima esecuzione: `51/51 checks ok` su `memgraph/memgraph:3.13.2` (anche su
  `memgraph/memgraph-platform` 2.14.1).

## Verifica con Memgraph

Passi manuali con l'intero stack (`docker compose` dalla radice del repository):

1. `docker compose up --build`, poi apri `http://localhost:4200`. In `/packages`, `ekg_analysis` ed
   `ekg_class_graph` sono `active` e i loro bundle sono caricati senza errori.
2. **Import.** In `/import` importa un CSV di event log (per esempio
   `soup-server/tests/fixtures/sample_event_log.csv`) con **CSV come event log (EKG su Memgraph)** e
   almeno una colonna in `entities`. Apri l'oggetto `ekg`: tra i visualizzatori compare **Indicatori
   di processo**; scegli un tipo di entità e controlla durata media, occorrenze delle attività e
   varianti; cambia la soglia della frequenza.
3. **Esempio.** Dalle operazioni dell'oggetto esegui **Esempio di configurazione**: nasce un report
   con la spiegazione delle chiavi e il file `analysis_example.json`, con i tipi di entità e le
   attività del tuo EKG. Scaricalo.
4. **Nuova analisi.** Esegui **Nuova analisi** con un nome e alcuni filtri, aggiunti in ordine
   diverso da quello dei filtri (per esempio prima "Varianti", poi "Senza queste attività", poi
   "Intervallo temporale"). Nasce un oggetto `ekg` figlio: Grafo e Statistiche si aprono subito senza
   ricostruzione e mostrano il grafo filtrato. In Memgraph Lab (`http://localhost:3300`)
   `MATCH (e:Event) RETURN count(e)` è diminuito; nel volume (`docker exec soup-database ls
   /soup/<dataset>/Analyses`) c'è `<nome>.json`.
5. **Ogni filtro.** Ripeti con un filtro alla volta, provando gli operatori `<`, `<=`, `=`, `!=`, `>`,
   `>=` di Durata, Frequenza e Varianti: nessuna risponde con un errore. Un filtro che non cambia
   nulla crea l'analisi con l'avviso "L'analisi non ha modificato il grafo". Un nome già usato
   risponde 409.
6. **Rieseguire.** Apri l'oggetto di partenza, poi di nuovo l'analisi: il grafo viene ricostruito e i
   filtri riapplicati (stessi conteggi del punto 4). Fai una **Nuova analisi** sull'analisi: il suo
   file ha `"based_on"`; prova a cancellare l'analisi padre (409) e poi con cascade.
7. **Import della configurazione.** Esegui **Importa configurazione di analisi** con il file del
   punto 3 (o con un vecchio file di `Analyses/`): nasce un'analisi con gli stessi filtri. Un file con
   un operatore sbagliato risponde 400 indicando filtro e posizione (`performance[0]: operator`).
8. **Grafo aggregato.** Sull'oggetto `ekg` esegui **Costruisci grafo aggregato** con un tipo di
   entità, poi con due: nascono oggetti `ekg_class` con **Grafo aggregato** (vista `class`, DF_C e
   OBSERVED), **Statistiche del grafo aggregato** (conteggi e due torte), **Interrogazioni** con il
   gruppo "Grafo aggregato" e l'export **JSON del grafo** con `Class nodes`, `OBS relationships` e
   `DF_C relationships`. Una Nuova analisi fatta dopo non lascia nodi `:Class` nel grafo
   (`MATCH (c:Class) RETURN count(c)` = 0).
9. **Export della configurazione.** Dal menu di export di un'analisi scegli **Configurazione
   dell'analisi**: il file ha le sei chiavi del vecchio formato (più `based_on` se annidata) ed è
   uguale a quello in `Analyses/`. Sull'oggetto di partenza l'exporter non compare.
