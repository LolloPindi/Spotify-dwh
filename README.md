# Spotify Global Charts — Data Warehouse & OLAP Web App

> Progetto di Data Warehouse per il corso di [Nome Corso] — Università della Calabria

## Descrizione

Analisi del dataset **Spotify Top Songs in 73 Countries** (asaniczka, Kaggle) attraverso un pipeline completo di data warehousing, dalla modellazione concettuale alla visualizzazione OLAP interattiva.

### Domanda-amo
> *Le hit globali riflettono davvero i gusti locali? O esiste un gap nascosto tra ciò che scala globalmente e ciò che ogni paese ascolta davvero?*

---

## Struttura del progetto

```
spotify-dwh/
├── data/
│   ├── raw/              # Dataset originali (CSV da Kaggle + enrichment geografico)
│   └── cleaned/          # Dataset post-cleaning
├── db/
│   ├── reconciled/       # DDL schema reconciled database (PostgreSQL)
│   └── warehouse/        # DDL star schema data warehouse (PostgreSQL)
├── etl/                  # Pipeline ETL Python (reconciled DB → DWH)
├── notebooks/            # Data profiling, quality assessment, cleaning
├── webapp/
│   ├── backend/          # FastAPI — serve il cubo, gestisce cache AI
│   └── frontend/         # React + DuckDB-WASM — OLAP nel browser
└── report/               # Report Fase 1-2 (PDF)
```

---

## Stack tecnologico

| Componente | Tool |
|---|---|
| Reconciled DB | PostgreSQL |
| Data Quality | Python, Pandas, Jupyter |
| ETL | Python (SQLAlchemy + psycopg2) |
| Data Warehouse | PostgreSQL (star schema) |
| OLAP Engine | DuckDB-WASM (nel browser) |
| Backend | FastAPI |
| Frontend | React + D3.js |
| Narrazione AI | Claude API (cache invalidata da firma cubo) |
| Visualizzazione formale | Tableau Public |

---

## Dataset

- **Fonte principale**: [Top Spotify Songs in 73 Countries](https://www.kaggle.com/datasets/asaniczka/top-spotify-songs-in-73-countries-daily-updated) — asaniczka, Kaggle
- **Arricchimento geografico**: World Bank — country metadata (continente, reddito, PIL pro capite, popolazione)
- **Finestra temporale**: da verificare in fase di profiling (target: periodo con audio feature complete)

---

## Innovazioni rispetto ai progetti standard

1. **OLAP reale nel browser** — DuckDB-WASM esegue query SQL live sul cubo, non JS simulato
2. **Narrazione AI materializzata** — il "Why" viene generato da Claude API e cachato con la firma del cubo; si rigenera solo quando i dati cambiano
3. **Pipeline ETL idempotente** — schema-contratto parametrico, rieseguibile su qualsiasi aggiornamento del dataset
4. **Dashboard data quality** — before/after visibile, missingness classificata MCAR/MAR/MNAR
5. **Analisi prescrittiva** — what-if interattivo sulle dimensioni chiave

---

## Come eseguire

```bash
# 1. Clona il repo
git clone https://github.com/TUO_USERNAME/spotify-dwh.git
cd spotify-dwh

# 2. Installa dipendenze Python
pip install -r requirements.txt

# 3. Configura PostgreSQL (vedi db/README.md)

# 4. Scarica il dataset (vedi data/README.md)

# 5. Esegui il notebook di profiling
jupyter notebook notebooks/01_profiling.ipynb

# 6. Esegui la pipeline ETL
python etl/pipeline.py
```

---

## Autore

[Il tuo nome] — Matricola [XXXXXX]  
Corso di Data Warehouse — Prof. Giorgio Terracina  
Università della Calabria
