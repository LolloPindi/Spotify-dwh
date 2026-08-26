# Guida al Deploy dell'Applicazione Spotify-DWH

L'applicazione è stata progettata con un'architettura **ROLAP in-browser** estremamente efficiente grazie a **DuckDB-WASM** e **Parquet**. Per far funzionare l'intera suite analitica online (incluso il generatore di report culturali con **Gemma 4** e l'esportazione per Tableau), faremo un deploy **Full-Stack**.

---

## 1. Copia dei file Parquet nel Frontend (Completato)
I file Parquet (31MB totali contri i 2.1M di record originali) sono stati inseriti in:
`webapp/frontend/public/parquet/`
Questo permette a Vercel di servirli direttamente tramite CDN globale. DuckDB-WASM li interrogherà via HTTP Range Requests (caricando solo i byte necessari alla singola query, senza scaricare tutti i 31MB all'avvio).

---

## 2. Deploy del Backend (FastAPI + PostgreSQL)

Il backend FastAPI gestisce:
* L'integrazione sicura con **Gemma 4** (Google Gemini API).
* La compilazione al volo dell'archivio ZIP con le tabelle CSV per Tableau.

Puoi ospitare il backend su piattaforme gratuite/low-cost come **Render**, **Railway**, o **Hugging Face Spaces**.

### A. Migrazione del Database PostgreSQL sul Cloud
Il tuo DWH locale `spotify_dw` deve essere caricato su un database cloud (es. **Neon.tech** (gratuito) o il servizio Postgres integrato di Render/Railway).

1. **Esporta il tuo database locale** in un file `.sql`:
   ```bash
   pg_dump -U postgres -d spotify_dw > dwh_dump.sql
   ```
2. **Importa il dump** nel database cloud ottenuto (sostituisci i dati con la tua stringa di connessione cloud):
   ```bash
   psql -h <CLOUD_HOST> -U <CLOUD_USER> -d <CLOUD_DB_NAME> -f dwh_dump.sql
   ```

### B. Deploy del Codice Backend (via Dockerfile)
Ho creato un file `Dockerfile` nella root del progetto. Piattaforme come Render o Railway rileveranno il Dockerfile ed eseguiranno il build in automatico.

1. **Variabili d'ambiente da configurare** nel pannello di controllo del tuo Host Backend (Render/Railway):
   * `DB_RECONCILED_HOST` = `<CLOUD_HOST_POSTGRES>`
   * `DB_RECONCILED_PORT` = `5432`
   * `DB_DWH_NAME` = `<CLOUD_DB_NAME>`
   * `DB_RECONCILED_USER` = `<CLOUD_USER>`
   * `DB_RECONCILED_PASSWORD` = `<CLOUD_PASSWORD>`
   * `GEMINI_API_KEY` = `<LA_TUA_GEMINI_API_KEY>` (necessaria per Gemma 4)

2. Una volta completato il deploy del backend, otterrai un URL pubblico sicuro, ad esempio:
   `https://spotify-dwh-backend.onrender.com`

---

## 3. Deploy del Frontend (Vercel)

1. Accedi a [Vercel Dashboard](https://vercel.com/dashboard).
2. Clicca su **"Add New"** -> **"Project"** e seleziona la tua repository GitHub del progetto.
3. Configura i parametri di Build:
   * **Root Directory**: `webapp/frontend`
   * **Framework Preset**: `Vite` (rilevato in automatico)
   * **Build Command**: `npm run build`
   * **Output Directory**: `dist`
4. Aggiungi la seguente **Environment Variable** per collegare il frontend al tuo backend cloud:
   * **Key**: `VITE_BACKEND_URL`
   * **Value**: L'URL del tuo backend appena deployato (es. `https://spotify-dwh-backend.onrender.com`)
5. Clicca su **"Deploy"**.

---

### ⚡ Perché questa architettura è fantastica?
* **Prestazioni incredibili**: il 99% del carico analitico (query SQL, grafici, filtri dimensionali, What-If) viene eseguito interamente sul browser dell'utente grazie a DuckDB-WASM. Il database Postgres cloud verrà interrogato solo quando si clicca su "Genera con Gemma 4" o per scaricare lo ZIP di Tableau.
* **Costi zero/minimi**: Neon (Postgres), Vercel (Frontend) e Render/Railway (Backend) offrono piani gratuiti eccezionali per questo tipo di progetti universitari e portfolio personali.
