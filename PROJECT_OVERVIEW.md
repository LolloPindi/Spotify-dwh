# Spotify Global Charts — Data Warehouse Project

> Corso di Data Warehouse — Prof. Giorgio Terracina — Università della Calabria

---

## Traccia del Professore

### PHASE 1: DESIGN

1. Choose the data source you want to analyse. This must allow you produce, in the end, the number of dimensions, measures and hierarchies required by the project specifications and a set of interesting analyses.

2. If the data source is on csv or excel files, carry out a re-engineering step to compose a database schema (E/R or Relational model) fitting the data. This is important to both well understand the data and give it a structure. Let's call it the **"schema of the reconciled database"**.

3. Build the schema for the reconciled database on a DBMS of your choice. Let's call it the **"reconciled database"**.

4. Conceptual design of your Fact schema:
   - Choose the fact from the reconciled database
   - Build the attribute tree and follow all the steps to obtain a DFM Schema using the **data-driven approach** studied during the class

5. Logical design:
   - Translate the DFM Schema in a Star schema
   - Build the schema of the star schema on the DBMS of your choice. Let's call it the **"data warehouse"** for simplicity

### PHASE 2: DATA MANAGEMENT

1. Populate the reconciled database from the csv file or excel (if any).

2. Design and implement your **data quality and cleaning** tasks. You can use any tool of your choice for this step (e.g. python, colab, etc.). You can carry out this step either on the reconciled database or on the original csv/excel before populating the database (note that different considerations must be carried out in the two cases), but the **optimal choice would be on the reconciled database**.

3. If you use python, colab or similar tools, please share the repository containing the code (e.g., using a public github).

4. Design the **ETL process** from the reconciled database to the data warehouse. You can use any tool of your choice for this step (e.g. python, tableau prep, pentaho, etc.).

### PHASE 3: DATA VISUALIZATION

1. Think about the **story** you want to tell about your data.

2. Build your analysis charts with **Tableau** (Sheets and Dashboards; Stories are optional), or any other tool of your choice. Remember that if you use Tableau, you should use Tableau public which does not accept database connections, so you should export your datawarehouse back to csv or excel.

3. Remember that you must allow a **dynamic analysis (OLAP)**, so avoid having only static charts (you should allow applying roll-up, drill-down, slice and dice, etc. when this makes sense).

4. Remember that you should not only tell the **"what"** is in the data but also the **"why"**.

5. Remember to apply the **data visualization principles** studied during the course.

### Cosa Consegnare

1. **Una settimana prima dell'esame** — un report (Fasi 1 e 2) contenente:
   - Breve descrizione della data source e analisi dei requisiti preliminare
   - Schema del reconciled database
   - Descrizione del data quality assessment e data cleaning
   - Tutti i passi del conceptual design (scelta del fatto, attribute tree, DFM schema). Tutti i passi devono essere motivati.
   - Lo star schema logico con il glossario delle misure
   - Non è necessario includere i fogli di analisi o le dashboard nel report

2. **Il giorno prima dell'esame** — un pitch di 5 minuti (ppt, video, o altro) che presenta la storia. Verrà proiettato durante l'esame.

3. **All'esame** — portare il laptop con tutti i file del progetto (report, codice, pentaho, tableau, ecc.). Se necessario il professore chiederà di mostrare qualcosa in dettaglio.

---

## Il Progetto — Spiegazione Completa

### Idea di Fondo

Analizzare le classifiche Spotify in 73 paesi per rispondere a una domanda controintuitiva:

> **Le hit globali riflettono davvero i gusti locali? O esiste un gap nascosto tra ciò che scala globalmente e ciò che ogni paese ascolta davvero?**

Questo è il paradosso centrale: Spotify calcola un `popularity` score globale per ogni brano, ma le classifiche locali (`daily_rank`) raccontano una storia diversa. I due numeri divergono sistematicamente — e spiegare *perché* è il cuore del progetto.

---

### Dataset

**Fonte:** ["Top Spotify Songs in 73 Countries"](https://www.kaggle.com/datasets/asaniczka/top-spotify-songs-in-73-countries-daily-updated) — asaniczka, Kaggle (aggiornato quotidianamente)

**Colonne originali (25):**

| Colonna | Tipo | Descrizione |
|---|---|---|
| `spotify_id` | string | ID univoco Spotify del brano |
| `name` | string | Titolo del brano |
| `artists` | string | Artisti (testo libero, separati da ", ") |
| `daily_rank` | int | Posizione in classifica [1-50] |
| `daily_movement` | int | Variazione giornaliera di posizione |
| `weekly_movement` | int | Variazione settimanale di posizione |
| `country` | string | Codice ISO-2 del paese |
| `snapshot_date` | date | Data dello snapshot |
| `popularity` | int | Score globale Spotify [0-100] |
| `is_explicit` | bool | Contenuto esplicito |
| `duration_ms` | int | Durata in millisecondi |
| `album_name` | string | Nome dell'album |
| `album_release_date` | date | Data di uscita dell'album |
| `danceability` | float | Adatto al ballo [0-1] |
| `energy` | float | Intensità energetica [0-1] |
| `key` | int | Tonalità [0-11, Pitch Class] |
| `loudness` | float | Volume medio (dB) |
| `mode` | int | Maggiore (1) o minore (0) |
| `speechiness` | float | Presenza di parlato [0-1] |
| `acousticness` | float | Acusticità [0-1] |
| `instrumentalness` | float | Strumentalità [0-1] |
| `liveness` | float | Presenza di pubblico [0-1] |
| `valence` | float | Positività percepita [0-1] |
| `tempo` | float | BPM |
| `time_signature` | int | Divisione ritmica [3-7] |

**Dimensioni del dataset:**
- **2.110.316** righe originali
- **72** paesi
- **583** giorni (18 ottobre 2023 → 11 giugno 2025)
- Audio feature con copertura 100% sull'intero arco temporale

---

## PHASE 1 — Design

### Schema E/R del Reconciled Database

Il reconciled database è in **PostgreSQL**. Lo schema è stato costruito con approccio data-driven partendo dalle colonne del CSV.

```
┌─────────────────┐       ┌──────────────────┐
│  snapshot_date  │       │     country      │
│─────────────────│       │──────────────────│
│ snapshot_date PK│       │ country_code  PK │
│ year            │       │ country_name     │
│ month           │       │ continent        │
│ quarter         │       │ subregion        │
│ week_of_year    │       │ language_primary │
│ day_of_week     │       │ income_group     │
│ season          │       │ population       │
└────────┬────────┘       │ gdp_per_capita   │
         │                └────────┬─────────┘
         │                         │
         └──────────┐   ┌──────────┘
                    ↓   ↓
              ┌─────────────────────────────────┐
              │         chart_entry             │  ← FATTO CENTRALE
              │─────────────────────────────────│
              │ entry_id          PK            │
              │ spotify_id        FK → track    │
              │ country_code      FK → country  │
              │ snapshot_date     FK → date     │
              │ daily_rank        [1-50]        │
              │ daily_movement                  │
              │ weekly_movement                 │
              │ popularity        [0-100]       │
              └──────────────┬──────────────────┘
                             │
                    ┌────────┘
                    ↓
              ┌─────────────────────────────────┐
              │            track                │
              │─────────────────────────────────│
              │ spotify_id        PK            │
              │ name                            │
              │ album_id          FK → album    │
              │ duration_ms                     │
              │ is_explicit                     │
              │ key, mode                       │
              │ danceability, energy, valence   │
              │ acousticness, speechiness       │
              │ liveness, instrumentalness      │
              │ tempo, loudness, time_signature │
              └──────────┬──────────────────────┘
                         │
           ┌─────────────┼──────────────┐
           ↓             ↓              ↓
    ┌──────────┐  ┌──────────────┐  ┌─────────┐
    │  album   │  │ track_artist │  │ artist  │
    │──────────│  │──────────────│  │─────────│
    │album_id  │  │ spotify_id FK│  │artist_id│
    │name      │  │ artist_id FK │  │name     │
    │release_dt│  └──────────────┘  └─────────┘
    │album_type│
    └──────────┘
```

**Motivazioni delle scelte principali:**

- **`chart_entry` come fatto centrale** — ogni riga è un evento atomico (brano × paese × data). Il grain `(spotify_id, country_code, snapshot_date)` è unico: verificato con zero duplicati sul dataset reale.

- **`snapshot_date` come tabella separata** — permette di aggiungere attributi temporali calcolati (trimestre, stagione) senza replicarli su ogni riga di `chart_entry`.

- **`album` separato da `track`** — l'`album_release_date` è una seconda gerarchia temporale indipendente dalla `snapshot_date` della chart. Senza questa separazione si perderebbe una gerarchia analitica.

- **`track_artist` come tabella ponte N:M** — il campo `artists` nel CSV è testo libero. Un brano può avere più artisti (feat., collaborazioni). Senza la tabella ponte non è possibile fare `GROUP BY artista` correttamente.

- **Audio feature su `track`, non sul fatto** — danceability, energy, valence ecc. sono proprietà intrinseche del brano, non cambiano per ogni chart entry. Tenerle su `track` evita join inutili e riduce la dimensione del fatto.

- **`country` arricchita con dati World Bank** — continent, subregion, language_primary, income_group, gdp_per_capita non vengono dal dataset Spotify ma vengono aggiunti per costruire gerarchie geografiche profonde.

---

### Fatto e Attribute Tree (Design Concettuale)

**Fatto scelto:** `ChartEntry`

**Grain:** `(spotify_id, country_code, snapshot_date)` — una riga = un brano in classifica in un paese in una data specifica.

**Cinque dimensioni con gerarchie:**

```
DimTempo
  └── snapshot_date → week → month → quarter → year

DimPaese
  └── country_code → subregion → continent
      [arricchito: language, income_group, gdp_per_capita]

DimTraccia
  └── spotify_id → name, duration_ms, is_explicit
      [audio feature discretizzate: mood_band, energy_band, valence_band]

DimArtista
  └── artist_id → name

DimAlbum
  └── album_id → name → release_year → release_decade
      [seconda gerarchia temporale, indipendente da DimTempo]
```

**Pruning motivato:**
- `key` e `mode` — potate dal DFM: troppo granulari per analisi aggregate, valore analitico basso rispetto alla complessità aggiunta
- `time_signature` — potato: quasi costante (4/4 in oltre il 95% dei brani)
- `week_of_year` — potato da DimTempo: ridondante con la gerarchia month → quarter

**Grafting:**
- Aggiunta `continent` e `income_group` da World Bank su DimPaese — non presenti nel CSV, necessari per la domanda-amo geografica

---

### Star Schema (Design Logico)

```
                    ┌─────────────────┐
                    │   DimTempo      │
                    │─────────────────│
                    │ date_key    PK  │
                    │ snapshot_date   │
                    │ week            │
                    │ month           │
                    │ quarter         │
                    │ year            │
                    │ season          │
                    └────────┬────────┘
                             │
┌─────────────────┐          │          ┌─────────────────┐
│   DimPaese      │          │          │   DimTraccia    │
│─────────────────│          │          │─────────────────│
│ country_key  PK │          │          │ track_key    PK │
│ country_code    │          │          │ spotify_id      │
│ country_name    │          │          │ name            │
│ continent       ├──────────┤──────────┤ duration_ms     │
│ subregion       │          │          │ is_explicit     │
│ language        │     ┌────┴────┐     │ danceability    │
│ income_group    │     │  FATTO  │     │ energy          │
│ gdp_per_capita  │     │─────────│     │ valence         │
└─────────────────┘     │FactChart│     │ mood_band       │
                        │Entry    │     │ energy_band     │
┌─────────────────┐     │─────────│     └─────────────────┘
│   DimArtista    │     │date_key │
│─────────────────│     │country_k│     ┌─────────────────┐
│ artist_key   PK ├─────┤track_key│     │   DimAlbum      │
│ artist_id       │     │artist_k │     │─────────────────│
│ name            │     │album_key├─────┤ album_key    PK │
└─────────────────┘     │─────────│     │ album_id        │
                        │MISURE:  │     │ name            │
                        │daily_rnk│     │ release_date    │
                        │popularit│     │ release_year    │
                        │chart_pre│     │ release_decade  │
                        │days_on_c│     └─────────────────┘
                        │n_countri│
                        │peak_rank│
                        └─────────┘
```

#### Glossario delle Misure

| Misura | Tipo | Additività | Descrizione |
|---|---|---|---|
| `daily_rank` | Originale | **Non additiva** | Posizione in classifica. Usare MIN (peak) o AVG (trend). Non si somma. |
| `popularity` | Originale | **Semi-additiva** | Score globale Spotify 0-100. Media su tempo, non sommabile su paesi. |
| `daily_movement` | Originale | **Semi-additiva** | Variazione giornaliera rank. AVG su periodi. |
| `weekly_movement` | Originale | **Semi-additiva** | Variazione settimanale rank. AVG su periodi. |
| `chart_presence` | **Derivata** | **Additiva** | Conteggio apparizioni (1 per riga). Sommabile su qualsiasi dimensione. |
| `days_on_chart` | **Derivata** | **Additiva** | Giorni totali in classifica per brano×paese. |
| `n_countries_charted` | **Derivata** | **Additiva** | Quanti paesi ha raggiunto un brano. Misura di "globalità". |
| `peak_rank` | **Derivata** | **Non additiva** | Miglior posizione raggiunta (MIN di daily_rank). |

**Nota sulla scelta ROLAP vs MOLAP:** con 2.081.378 fact rows × 5 dimensioni, la densità del cubo è stimata inferiore all'1% → scelta ROLAP su PostgreSQL. Un cubo MOLAP sarebbe sparso e inefficiente. Questa scelta viene dimostrata empiricamente con un benchmark live nella webapp.

---

## PHASE 2 — Data Management

### Data Quality Assessment & Cleaning

**Strategia:** cleaning sul CSV *prima* di popolare il reconciled DB. Motivazione: più efficiente correggere i problemi a monte, evitando UPDATE/DELETE successivi su PostgreSQL. Tutti i conteggi before/after sono documentati.

#### Decisioni motivate

**1. Eliminazione righe senza `country` — classificazione MNAR**

```
Righe eliminate: 28.908 (1.37%)
```

Classificate **MNAR (Missing Not At Random)**: la mancanza del paese non è casuale, dipende strutturalmente dal tipo di riga — sono aggregati globali non attribuibili a un paese specifico. Nel DWH la dimensione geografica è obbligatoria per ogni fatto.

**2. Eliminazione righe senza `name` o `artists` — classificazione MCAR**

```
Righe eliminate: 30 (0.001%)
```

Classificate **MCAR (Missing Completely At Random)**: volume trascurabile, nessun pattern sistematico. Eliminazione sicura.

**3. Gestione NULL su `album_name` — classificazione MAR, strategia sentinella**

```
Tracce senza album_name: 785 → sostituito con '[Unknown Album]'
```

Classificate **MAR (Missing At Random)**: dipende dal tipo di release (singoli non pubblicati come album formale). Strategia: mantenere le tracce (hanno rank valido) con valore sentinella `[Unknown Album]`. Documentato nel glossario.

**4. Generazione ID sintetici per album e artisti**

Il CSV non contiene `album_id` né `artist_id`. Generati come hash MD5 deterministico troncato a 22 caratteri:

```python
album_id = MD5(album_name + "|" + release_date)[:22]
artist_id = MD5(artist_name)[:22]
```

Garantisce idempotenza: stesso input → stesso ID. La pipeline può essere rieseguita su dataset aggiornati producendo sempre ID coerenti.

**5. Split del campo `artists`**

Il campo è testo libero con artisti separati da `", "` (virgola + spazio). Split su questo separatore — gestisce correttamente nomi con virgola interna come "Tyler, The Creator" che non hanno spazio dopo la virgola.

#### Risultato before/after

| | Prima | Dopo | Delta |
|---|---|---|---|
| Righe totali | 2.110.316 | 2.081.378 | -28.938 (-1.37%) |
| Tracce uniche | — | 24.971 | |
| Artisti unici | — | 12.060 | |
| Album unici | — | 17.289 | |
| Paesi | 73 (con NULL) | 72 | |
| Orphan keys | — | **0** | ✓ |

#### Validazione range misure

Tutti i range verificati e validi:

| Colonna | Range atteso | Esito |
|---|---|---|
| `daily_rank` | [1, 50] | ✓ |
| `popularity` | [0, 100] | ✓ |
| `danceability` | [0.0, 1.0] | ✓ |
| `energy` | [0.0, 1.0] | ✓ |
| `valence` | [0.0, 1.0] | ✓ |
| `key` | [0, 11] | ✓ |
| `mode` | [0, 1] | ✓ |

**Outlier duration_ms:** 1 brano < 30s, 130 brani > 15min — marcati ma non eliminati (potrebbero essere intro/spoken word legittimi).

### ETL

**Pipeline Python idempotente con schema-contratto.** Un file di configurazione mappa le colonne del CSV ai campi canonici del reconciled DB. Aggiungere un nuovo dataset = modificare solo il config, non riscrivere la pipeline.

**Firma del cubo:** ad ogni rigenerazione del DWH viene calcolato un hash degli aggregati principali. La narrazione AI è cachata con questa firma: si rigenera solo quando il cubo cambia, non ad ogni apertura. È la stessa logica delle viste materializzate.

**Arricchimento geografico:** la tabella `country` viene arricchita nell'ETL con dati World Bank (continent, subregion, language_primary, income_group, gdp_per_capita, population).

---

## PHASE 3 — Visualizzazione & Innovazioni

### Stack tecnologico

```
CSV (Kaggle, aggiornato quotidianamente)
        ↓
Python cleaning (02_cleaning.py)
        ↓
PostgreSQL — Reconciled DB (spotify_reconciled)
        ↓
Python ETL idempotente (pipeline.py)
        ↓
PostgreSQL — Data Warehouse (spotify_dw)
        ↓
        ├── Tableau Public (requisito formale della traccia)
        │       export CSV dal DWH → sheets + dashboard
        │
        └── FastAPI + React (webapp OLAP innovativa)
                ↓
                ├── DuckDB-WASM (OLAP reale nel browser)
                ├── Layer AI con cache firma cubo
                └── Analisi prescrittiva what-if
```

### Innovazioni rispetto ai progetti precedenti

**1. OLAP reale nel browser (DuckDB-WASM)**

Nei progetti precedenti (es. MyAnimeList di Elisa) l'OLAP era simulato in JavaScript — funzioni scritte a mano che riaggregavano CSV pre-calcolati. Qui DuckDB compilato in WebAssembly esegue query SQL `GROUP BY` live sul cubo nel browser, senza server. Roll-up, drill-down, slice, dice sono riaggregazioni SQL reali. Questo dimostra di aver capito che un'operazione OLAP è una riaggregazione SQL, non un'animazione.

**2. Narrazione AI materializzata con cache invalidata**

Il "Why" non è scritto a mano (invecchierebbe col dataset) né rigenerato ad ogni apertura (spreco). Claude API genera la spiegazione in linguaggio naturale dei risultati OLAP. La spiegazione è salvata insieme alla firma (hash) del cubo corrente. Se il cubo non cambia → spiegazione istantanea dalla cache. Se il dataset si aggiorna → la firma cambia → la spiegazione viene rigenerata. È il principio delle viste materializzate applicato alla narrazione.

**3. Pipeline ETL idempotente e parametrica**

I progetti precedenti usavano ETL one-shot: gira una volta, popola il DWH, fine. Questa pipeline è ripetibile su qualsiasi aggiornamento del dataset, con uno schema-contratto che separa la logica di trasformazione dalla struttura specifica del CSV.

**4. Dashboard data quality visibile**

Il cleaning è di solito invisibile nella pitch. Qui viene mostrata una dashboard before/after con record scartati, missingness classificata MCAR/MAR/MNAR, e la conferma orphan keys = 0 — trasformando la Fase 2 in qualcosa di presentabile.

**5. Analisi prescrittiva what-if**

Slider interattivi che simulano scenari: "se rimuovi i paesi anglofoni, come cambia la distribuzione di generi?" o "se la lingua locale pesa di più, chi guadagna?". Si passa da analisi descrittiva ("cosa è successo") a prescrittiva ("cosa succederebbe se").

**6. ROLAP vs MOLAP benchmark live**

La scelta ROLAP è dimostrata empiricamente a schermo: stessa query eseguita su tabella relazionale e su cubo pre-aggregato, con i tempi visualizzati. Costantino la dichiarava; questo progetto la misura.

### Le 4 Operazioni OLAP — Esempi Concreti

| Operazione | Esempio nel progetto |
|---|---|
| **Roll-up** | Da paese → continente: aggregare la chart_presence per area geografica |
| **Drill-down** | Da continente → paese → singolo brano: esplorare cosa guida il trend |
| **Slice** | Filtrare per `is_explicit = true`: analisi del profilo dei brani espliciti |
| **Dice** | Heatmap paese × mood_band: dove dominano i brani energetici vs acustici |

---

## Storia da Raccontare (Struttura Pitch — 5 minuti)

```
[0:00] HOOK
"73 paesi. 2 milioni di chart entries. Una sola domanda:
 Spotify sa davvero cosa ascolta il mondo?"

[0:30] IL PARADOSSO
"Abbiamo due numeri per ogni brano: popularity (score globale)
 e daily_rank (posizione locale). Dovrebbero raccontare la stessa storia.
 Non lo fanno."

[1:00] LA SCOPERTA
Mostra la divergenza popularity vs rank per paese.
I brani top globalmente non sono top localmente — e viceversa.

[1:30] PERCHÉ? — Catena causale
Anello 1: la lingua. I brani in lingua locale dominano le chart nazionali.
Anello 2: il genere. Afrobeats in Nigeria, K-pop in Corea, Fado in Portogallo.
Anello 3: l'algoritmo. Spotify ottimizza popularity globalmente,
          ma non cattura la frammentazione culturale.

[3:00] ROOT CAUSE
Il locality index: brani con alta presence locale ma bassa popularity globale.
Questi sono i brani "autentici" che l'algoritmo globale penalizza.

[4:00] RACCOMANDAZIONI
Per gli artisti: non inseguire la popularity globale se il tuo mercato è locale.
Per Spotify: la metrica popularity nasconde i mercati emergenti.
Per le label: il prossimo hit globale sta probabilmente in classifica locale
              in un mercato che nessuno sta guardando.

[4:45] KEY TAKEAWAY
"Il gusto musicale è più frammentato di quanto sembri.
 Il mondo non ascolta una sola musica — ascolta la sua."
```

---

## Stato Avanzamento

| Blocco | Descrizione | Stato |
|---|---|---|
| 0 | Setup repo GitHub + ambiente | ✅ Completato |
| 1a | Schema E/R + DDL PostgreSQL reconciled | ✅ Completato |
| 1b | Script profiling (01_profiling.py) | ✅ Completato |
| 2a | Script cleaning (02_cleaning.py) | ✅ Completato |
| 2b | Caricamento reconciled DB (03_load_reconciled.py) | 🔄 In corso (fix NaT su date NULL) |
| 3 | DDL star schema DWH | ⏳ Da fare |
| 4 | ETL reconciled → DWH con arricchimento geografico | ⏳ Da fare |
| 5 | Report Fase 1-2 (PDF) | ⏳ Da fare |
| 6 | Webapp FastAPI + React + DuckDB-WASM | ⏳ Da fare |
| 7 | Layer AI con cache firma cubo | ⏳ Da fare |
| 8 | Tableau Public (export + dashboard) | ⏳ Da fare |
| 9 | Pitch 5 minuti | ⏳ Da fare |

---

## File del Progetto

```
spotify-dwh/
├── data/
│   ├── raw/
│   │   └── universal_top_spotify_songs.csv    ← dataset originale (Kaggle)
│   └── cleaned/
│       ├── tracks.csv
│       ├── artists.csv
│       ├── track_artist.csv
│       ├── albums.csv
│       ├── chart_entries.csv
│       └── cleaning_report.txt
├── db/
│   ├── reconciled/
│   │   └── schema.sql                         ← DDL reconciled DB
│   └── warehouse/
│       └── schema.sql                         ← DDL star schema (da fare)
├── etl/
│   └── pipeline.py                            ← ETL reconciled → DWH (da fare)
├── notebooks/
│   ├── 01_profiling.py                        ← analisi esplorativa
│   ├── 02_cleaning.py                         ← data quality & cleaning
│   └── 03_load_reconciled.py                  ← caricamento PostgreSQL
├── webapp/
│   ├── backend/                               ← FastAPI (da fare)
│   └── frontend/                              ← React + DuckDB-WASM (da fare)
├── report/                                    ← report PDF Fasi 1-2 (da fare)
├── requirements.txt
├── .env.example
├── .gitignore
└── PROJECT_OVERVIEW.md                        ← questo file
```

---

## Stack Tecnologico

| Componente | Tool |
|---|---|
| Reconciled DB | PostgreSQL 14 |
| Data Quality | Python 3.11, Pandas, psycopg2 |
| ETL | Python (SQLAlchemy + psycopg2) |
| Data Warehouse | PostgreSQL (star schema separato) |
| OLAP Engine | DuckDB-WASM (nel browser) |
| Backend webapp | FastAPI |
| Frontend webapp | React + D3.js |
| Narrazione AI | Claude API (cache invalidata da firma cubo) |
| Visualizzazione formale | Tableau Public |
| Versionamento | GitHub (repo pubblico) |

---

*Documento aggiornato al 7 agosto 2026*
