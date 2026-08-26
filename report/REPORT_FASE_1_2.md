# Spotify Global Charts — Progetto di Data Warehouse
> **Corso di Data Warehouse — Prof. Giorgio Terracina — Università della Calabria**
> 
> *Studente: Lorenzo Pindi (LolloPindi)*  
> *Data: Agosto 2026*

---

## 1. Introduzione e Requisiti

### 1.1 Idea di Fondo e Obiettivi
L'obiettivo di questo progetto è analizzare le classifiche giornaliere di Spotify in 73 paesi (Top 50 quotidiana) per verificare una tesi controintuitiva: **le hit globali riflettono fedelmente i gusti locali o esiste un divario culturale tra ciò che scala la popolarità globale e ciò che le singole nazioni ascoltano realmente?**

Spotify calcola uno score globale di popolarità (`popularity`), ma le classifiche nazionali (`daily_rank`) raccontano storie diverse per via di barriere linguistiche, generi autoctoni (K-Pop, Afrobeats, Latino) e dinamiche locali. Il Data Warehouse è progettato per quantificare questa divergenza culturale ed effettuare analisi aggregate e multidimensionali.

### 1.2 Data Source
Il dataset utilizzato è **"Top Spotify Songs in 73 Countries"** (disponibile su Kaggle), aggiornato quotidianamente.
- **Dimensione iniziale**: 2.110.316 righe
- **Copertura temporale**: 583 giorni (dal 18 ottobre 2023 all'11 giugno 2025)
- **Campi principali**: Identificativi del brano, artisti, posizioni in classifica (`daily_rank`), movimenti giornalieri e settimanali, codici paese ISO-2, popolarità e un set completo di 11 feature audio fornite da Spotify API (danceability, energy, valence, tempo, ecc.).

---

## 2. Reengineering e Reconciled Database (Fase 1)

Il primo passo ha riguardato il design del **Reconciled Database**, volto a normalizzare la struttura piatta del CSV originario per eliminare le ridondanze e strutturare i dati in modo relazionale. Il DBMS scelto è **PostgreSQL**.

### 2.1 Schema Relazionale del Reconciled DB
Lo schema E/R comprende le seguenti entità logiche:

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
│                 │       │ gdp_per_capita   │
└────────┬────────┘       └────────┬─────────┘
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

#### Scelte di Normalizzazione e Motivazioni:
1. **`chart_entry` come tabella transazionale centralizzata**: gestisce la combinazione unica `(spotify_id, country_code, snapshot_date)`. Questo grain atomico rappresenta l'evento elementare.
2. **Tabella Ponte `track_artist` (N:M)**: Nel CSV gli artisti sono indicati come testo libero separati da virgole. Per poter aggregare correttamente la presenza in classifica per singolo artista, la relazione è stata normalizzata creando una tabella ponte N:M.
3. **Isolamento della dimensione `album`**: Consente di isolare la data di rilascio dell'album (`release_date`), utile a rappresentare una seconda gerarchia temporale del tutto indipendente da quella di classifica.
4. **Separazione delle Audio Feature in `track`**: Variabili come `danceability` o `tempo` sono caratteristiche intrinseche della traccia e non cambiano nel tempo o a seconda del paese; memorizzarle su `track` evita join ripetitivi e riduce la dimensione del fatto centrale.
5. **Estensione Geografica in `country`**: Sebbene il dataset contenga solo i codici ISO-2, la tabella `country` è predisposta per accogliere attributi di livello superiore (continente, sub-regione, lingua primaria e indicatori della Banca Mondiale come PIL pro capite e popolazione) che verranno arricchiti durante l'ETL verso il Data Warehouse.

---

## 3. Data Quality e Cleaning (Fase 2)

Prima del caricamento nel database riconciliato, il dataset grezzo è stato analizzato e pulito in Python usando la libreria Pandas per garantire la coerenza referenziale.

### 3.1 Classificazione e Gestione della Missingness

1. **Righe senza `country` (MNAR - Missing Not At Random)**:
   - *Volume*: 28.908 righe (1,37% del dataset).
   - *Analisi*: La mancanza del paese è strutturale (rappresentano le righe della classifica Top Global di Spotify).
   - *Azione*: Mappate al codice paese sintetico speciale **`GL`** (Global). Questo ci consente di conservare integralmente i dati delle classifiche globali e abilitare confronti diretti local-vs-global.
   
2. **Righe senza `name` o `artists` (MCAR - Missing Completely At Random)**:
   - *Volume*: 30 righe (0,001%).
   - *Azione*: Eliminate in sicurezza data l'irrilevanza statistica.

3. **Valori NULL in `album_name` e `album_release_date` (MAR - Missing At Random)**:
   - *Volume*: 785 tracce.
   - *Analisi*: Mancano a causa del tipo di rilascio (es. singoli caricati rapidamente senza metadati completi).
   - *Azione*: Mantenute per non perdere i dati storici delle classifiche. È stato usato il valore sentinella `[Unknown Album]` per il nome, mentre la data è lasciata a NULL.

### 3.2 Normalizzazione e Generazione Chiavi Sintetiche
Il dataset originale non dispone di ID univoci per artisti e album (solo nomi testuali). Per risolvere il problema:
- Gli artisti sono stati estratti dividendo la colonna `artists` con il separatore `", "` (virgola + spazio), preservando i nomi d'arte che contengono la virgola singola (es. *"Tyler, The Creator"*).
- Sono stati generati ID sintetici deterministici tramite hash MD5 troncato a 22 caratteri dei nomi (per gli album, combinando nome e data di rilascio):
  $$\text{album\_id} = \text{MD5}(\text{album\_name} \mathbin{\Vert} \text{release\_date})[0..21]$$
  $$\text{artist\_id} = \text{MD5}(\text{artist\_name})[0..21]$$
- Questa scelta garantisce l'**idempotenza**: riesecuzioni successive dello script sugli stessi dati generano sempre gli stessi ID coerenti.

### 3.3 Metriche Before / After
Il processo di cleaning ha ridotto il dataset originale come segue:

| Dimensione | Dataset Originale | Dataset Pulito | Delta (%) |
|---|---|---|---|
| **Righe totali (Fatti)** | 2.110.316 | 2.110.286 | -30 (~0.00%) |
| **Tracce Uniche** | — | 24.971 | — |
| **Artisti Unici** | — | 12.061 | — |
| **Album Unici** | — | 17.289 | — |
| **Paesi Unici** | 73 (incluso NULL) | 73 (incluso GL) | 0 (0.00%) |
| **Chiavi Orfane (Orphan Keys)** | — | **0** | Verificato al 100% |

Tutte le misure numeriche (come `daily_rank` $\in [1, 50]$, `popularity` $\in [0, 100]$, audio features $\in [0.0, 1.0]$) sono state validate e sono risultate prive di anomalie esterne ai limiti previsti. L'unica eccezione riguarda `time_signature`, per la quale alcuni brani riportano valore `1` o `0` (dovuto a problemi dell'analizzatore automatico di Spotify), motivo per cui il vincolo SQL è stato allentato a `BETWEEN 0 AND 7`.

---

## 4. Conceptual Design — DFM (Fase 1)

Il design concettuale del Data Warehouse è stato condotto secondo la metodologia del **Dimensional Fact Model (DFM)** a partire dallo schema del database riconciliato.

### 4.1 Scelta del Fatto e Grain
- **Fatto**: `ChartEntry` (Presenza in classifica)
- **Granularità**: `(date_key, country_key, track_key, artist_key, album_key)`.
*Nota: a causa della relazione N:M tra brano e artista, se un brano in classifica ha $N$ artisti, l'evento viene duplicato $N$ volte nella tabella dei fatti dello Star Schema (una riga per ogni artista), garantendo la possibilità di aggregare le misure su qualsiasi dimensione.*

### 4.2 Progettazione dell'Attribute Tree (DFM Schema)

```
                       [ChartEntry]
                            │
       ┌───────────┬────────┴─────┬─────────────┬───────────┐
       ▼           ▼              ▼             ▼           ▼
   (DimTempo)  (DimPaese)   (DimTraccia)   (DimArtista) (DimAlbum)
       │           │              │             │           │
  snapshot_date country_code  spotify_id    artist_id    album_id
       │           │              │             │           │
     week      country_name      name         name         name
       │           │              │                         │
     month     continent     duration_ms               release_date
       │           │              │                         │
    quarter    subregion     is_explicit               release_year
       │           │              │                         │
     year      language      danceability             release_decade
       │           │              │
    season     income_group     energy
                   │              │
               population      valence
                   │              │
             gdp_per_capita   mood_band
                              energy_band
                              valence_band
```

### 4.3 Pruning e Grafting Motivato
1. **Pruning (Potatura)**:
   - `key` e `mode`: Rimossi. Troppo granulari per analisi aggregate ed economicamente irrilevanti ai fini del business delle chart.
   - `time_signature`: Rimosso (in quanto quasi costante, oltre il 95% dei brani è in 4/4).
   - `week_of_year` in `DimTempo`: Sostituito dalla gerarchia month $\rightarrow$ quarter $\rightarrow$ year per evitare ridondanze.

2. **Grafting (Innesto)**:
   - Innestati gli attributi socio-economici `continent`, `subregion`, `language`, `income_group`, `population` e `gdp_per_capita` nella dimensione `DimPaese`, importando e normalizzando i dati dal portale della Banca Mondiale (World Bank) e standard ISO-3166.
   - Innestati gli attributi discretizzati `mood_band`, `energy_band` e `valence_band` in `DimTraccia`. Essendo le audio feature continue (es. energy = 0.742), non sono adatte al raggruppamento OLAP. Sono state quindi suddivise in bande categoriali (`High` $> 0.7$, `Low` $< 0.3$, `Medium` altrimenti).
   - **Classificazione dei Generi Musicali (Inferred Genre)**: Poiché il dataset di origine non includeva i generi delle tracce, abbiamo definito una classificazione dei generi on-the-fly basata su vincoli logici delle audio features (es. *Metal*: energy $> 0.82$, danceability $< 0.50$, valence $< 0.45$; *HipHop*: danceability $> 0.75$, energy $[0.40, 0.75]$; ecc.). Questo abilita filtri granulari di genere in tutta la dashboard OLAP.

---

## 5. Logical Design — Star Schema (Fase 1)

Lo schema DFM è stato tradotto direttamente in uno **Star Schema ROLAP** su PostgreSQL.

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
│ population      │     │FactChart│     │ mood_band       │
│                 │     │Entry    │     │ energy_band     │
│                 │     │─────────│     │ valence_band    │
└─────────────────┘     │date_key │     └─────────────────┘
                        │country_k│
┌─────────────────┐     │track_key│     ┌─────────────────┐
│   DimArtista    │     │artist_k │     │   DimAlbum      │
│─────────────────│     │album_key│     │─────────────────│
│ artist_key   PK ├─────┤─────────├─────┤ album_key    PK │
│ artist_id       │     │MISURE:  │     │ album_id        │
│ name            │     │daily_rnk│     │ name            │
└─────────────────┘     │popularit│     │ release_date    │
                        │chart_pre│     │ release_year    │
                        │days_on_c│     │ release_decade  │
                        │n_countri│     └─────────────────┘
                        │peak_rank│
                        └─────────┘
```

### 5.1 Scelta ROLAP vs MOLAP
Con circa 2.08 milioni di righe transazionali e 5 dimensioni, lo spazio teorico del cubo OLAP è estremamente vasto (superiore a $10^{15}$ celle potenziali). Tuttavia, il dataset reale occupa solo 3.33 milioni di righe reali nello Star Schema, indicando una densità del cubo inferiore allo **0.0000001%** (cubo estremamente sparso).

Un approccio **MOLAP** (multidimensionale fisico) risulterebbe estremamente inefficiente e sprecherebbe spazio fisico. È stata quindi scelta un'architettura **ROLAP** (Relational OLAP) basata su tabelle relazionali indicizzate. Per velocizzare le query analitiche interattive, la webapp integra un motore OLAP locale (**DuckDB-WASM**) che esegue query ROLAP vettorializzate in-memory nel browser.

Per validare empiricamente la scelta, abbiamo implementato un benchmark live all'interno dell'applicazione:
- **Query ROLAP (con 3 JOIN)**: Esecuzione standard con JOIN dinamici tra `fact_chart_entry`, `dim_tempo`, `dim_paese` e `dim_traccia` per calcolare la Valence media settimanale per nazione. Tempo medio registrato: **~120ms - 150ms**.
- **Query MOLAP (tabella pre-aggregata)**: Accesso diretto alla vista materializzata `molap_track_country_weekly`. Tempo medio registrato: **~15ms - 25ms**.
- **Speedup Riscontrato**: La pre-aggregazione (MOLAP) si dimostra **tra 6x e 10x più veloce** rispetto alla query ROLAP dinamica, validando l'utilizzo di viste aggregate per dashboarding interattivo ad alta frequenza.


### 5.2 Glossario delle Misure del Data Warehouse

| Misura | Tipologia | Additività | Descrizione |
|---|---|---|---|
| `daily_rank` | Fisica | Non additiva | Posizione giornaliera in classifica [1-50]. Non sommabile. Si aggrega con `MIN` (posizione di picco) o `AVG` (andamento medio). |
| `popularity` | Fisica | Semi-additiva | Score globale Spotify [0-100]. Non ha senso sommarlo tra paesi diversi (porterebbe a valori $>100$). Si usa `AVG`. |
| `daily_movement` | Fisica | Semi-additiva | Variazione giornaliera delle posizioni. Si usa `AVG` per trend. |
| `weekly_movement` | Fisica | Semi-additiva | Variazione settimanale delle posizioni. Si usa `AVG` per trend. |
| `chart_presence` | Derivata | Additiva | Vale sempre `1` per riga. Consente di calcolare con una semplice `SUM` il numero di giorni totali di permanenza in classifica. |
| `days_on_chart` | Derivata | Additiva | Running total dei giorni in classifica per un brano in una determinata nazione fino alla data corrente. |
| `n_countries_charted`| Derivata | Additiva | Numero totale di nazioni in cui il brano è entrato in classifica fino alla data dello snapshot corrente. Misura la "globalità" del brano. |
| `peak_rank` | Derivata | Non additiva | Il miglior rank (valore minimo di `daily_rank`) raggiunto da quel brano in quella nazione fino a quel giorno. |

### 5.3 Simulatore What-If Dinamico
Per studiare l'interazione tra identità locale e popolarità globale, il sistema implementa un modello di simulazione parametrico "What-If" a livello logico:
$$\text{Simulated Score} = w_{\text{local}} \cdot (51 - \text{daily\_rank}) + w_{\text{global}} \cdot \text{popularity}$$
dove $w_{\text{local}} + w_{\text{global}} = 100\%$. Regolando interattivamente i due pesi nella dashboard, il motore DuckDB-WASM esegue una query OLAP in-memory ricalcolando in tempo reale il punteggio e riordinando le tracce per identificare l'influenza relativa dei fattori locali vs globali sul mercato.

---

## 6. Processo di ETL (Fase 2)

La pipeline di ETL (Extract, Transform, Load) è stata scritta in Python (`etl/pipeline.py`) per trasferire i dati dal Reconciled DB al DWH.

### 6.1 Dettagli dell'Implementazione e Ottimizzazioni:
1. **Idempotenza**: Lo script esegue una pulizia iniziale con `TRUNCATE ... CASCADE` prima di ogni esecuzione, permettendo di rigenerare il DWH da zero in modo sicuro e ripetibile.
2. **Streaming efficiente dei fatti**: Per evitare di saturare la RAM del server con 2 milioni di righe, è stato utilizzato un **cursore server-side** di PostgreSQL (`fetchmany`), processando i dati in blocchi (chunk) da 20.000 righe.
3. **Pre-calcolo dei Running Totals**: 
   - `days_on_chart` e `peak_rank` sono pre-calcolati a livello di database tramite **Window Functions** SQL (`ROW_NUMBER()` e `MIN() OVER`), sfruttando l'ottimizzazione del query planner di PostgreSQL:
     ```sql
     ROW_NUMBER() OVER (PARTITION BY spotify_id, country_code ORDER BY snapshot_date)
     ```
   - `n_countries_charted` viene calcolato in Python memorizzando le prime date di ingresso di ciascun brano in ogni nazione. Durante lo streaming, la funzione calcola il numero cumulativo di nazioni usando una ricerca binaria veloce (`bisect_right`) in tempo $O(\log(\text{paesi}))$, ottimizzando i tempi di esecuzione a pochissimi secondi per l'intero dataset.
4. **Firma del Cubo (Cube Signature)**: Ad ogni rigenerazione del DWH, viene calcolato un hash MD5 a partire dal numero totale dei fatti e dalla somma delle misure (`daily_rank`, `popularity`). Questa firma permette al layer di intelligenza artificiale della webapp di invalidare la cache dei report narrativi solo quando il DWH viene effettivamente modificato.

### 6.2 Estensione Analitica AI con Gemma 4
Per interpretare il significato etnomusicologico e sociologico dietro ai trend numerici, il Data Warehouse si interfaccia con un modulo di intelligenza artificiale basato sul modello **Gemma 4** (`gemma-4-31b-it`). La piattaforma supporta due tipi di indagini:
- **Analisi Culturale Singola**: Identifica l'identità artistica e le caratteristiche medie delle tracce (valence, energy) per una specifica nazione in una determinata settimana.
- **Analisi Comparativa (OLAP Join)**: Consente di confrontare simultaneamente due mercati diversi (es. Italia vs Globale oppure Italia vs Spagna). Il frontend calcola in modo vettorializzato le medie delle metriche su DuckDB-WASM e il backend formula un prompt specifico che richiede a Gemma di evidenziare i fenomeni di divergenza culturale, sovrapposizione di preferenze, e barriere geografico-linguistiche del consumo musicale.
