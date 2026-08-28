-- ============================================================
-- SPOTIFY GLOBAL CHARTS — Data Warehouse Schema
-- Star Schema (PostgreSQL)
-- ============================================================

-- Pulizia per riesecuzione idempotente (ordine dipendenze)
DROP TABLE IF EXISTS fact_chart_entry CASCADE;
DROP TABLE IF EXISTS bridge_artista    CASCADE;
DROP TABLE IF EXISTS dim_tempo        CASCADE;
DROP TABLE IF EXISTS dim_paese        CASCADE;
DROP TABLE IF EXISTS dim_traccia      CASCADE;
DROP TABLE IF EXISTS dim_artista      CASCADE;
DROP TABLE IF EXISTS dim_album        CASCADE;
DROP TABLE IF EXISTS dim_genere       CASCADE;

-- ------------------------------------------------------------
-- DIM_GENERE — Dimensione conformata (condivisa da traccia e artista)
-- Gerarchia: genre_name → macro_genre
-- ------------------------------------------------------------
CREATE TABLE dim_genere (
    genre_key    SERIAL       PRIMARY KEY,
    genre_name   VARCHAR(100) NOT NULL UNIQUE,
    macro_genre  VARCHAR(50)  NOT NULL DEFAULT 'Other'
);

COMMENT ON TABLE dim_genere IS
    'Dimensione conformata del genere musicale. '
    'Condivisa da dim_traccia e dim_artista tramite genre_key. '
    'Gerarchia: genre_name → macro_genre (es. pop → Pop/R&B).';

-- ------------------------------------------------------------
-- DIM_TEMPO
-- ------------------------------------------------------------
CREATE TABLE dim_tempo (
    date_key        INTEGER     PRIMARY KEY, -- Formato YYYYMMDD (es. 20231018)
    snapshot_date   DATE        NOT NULL UNIQUE,
    week            SMALLINT    NOT NULL,
    month           SMALLINT    NOT NULL CHECK (month BETWEEN 1 AND 12),
    quarter         SMALLINT    NOT NULL CHECK (quarter BETWEEN 1 AND 4),
    year            SMALLINT    NOT NULL,
    season          VARCHAR(10) NOT NULL CHECK (season IN ('Spring', 'Summer', 'Autumn', 'Winter'))
);

COMMENT ON TABLE dim_tempo IS 'Dimensione temporale con granularità giornaliera.';

-- ------------------------------------------------------------
-- DIM_PAESE
-- ------------------------------------------------------------
CREATE TABLE dim_paese (
    country_key      SERIAL        PRIMARY KEY,
    country_code     CHAR(2)       NOT NULL UNIQUE,
    country_name     VARCHAR(100)  NOT NULL,
    continent        VARCHAR(50)   NOT NULL,
    subregion        VARCHAR(100),
    language         VARCHAR(50),
    income_group     VARCHAR(30),
    population       BIGINT,
    gdp_per_capita   NUMERIC(12,2)
);

COMMENT ON TABLE dim_paese IS 'Dimensione geografica con indicatori socio-economici World Bank.';

-- ------------------------------------------------------------
-- DIM_TRACCIA
-- ------------------------------------------------------------
CREATE TABLE dim_traccia (
    track_key        SERIAL        PRIMARY KEY,
    spotify_id       VARCHAR(22)   NOT NULL UNIQUE,
    name             VARCHAR(500)  NOT NULL,
    genre_key        INTEGER       REFERENCES dim_genere(genre_key), -- FK conformata
    duration_ms      INTEGER       NOT NULL CHECK (duration_ms > 0),
    is_explicit      BOOLEAN       NOT NULL,
    danceability     NUMERIC(4,3),
    energy           NUMERIC(4,3),
    valence          NUMERIC(4,3),
    mood_band        VARCHAR(20)   CHECK (mood_band    IN ('Low', 'Medium', 'High')),
    energy_band      VARCHAR(20)   CHECK (energy_band  IN ('Low', 'Medium', 'High')),
    valence_band     VARCHAR(20)   CHECK (valence_band IN ('Low', 'Medium', 'High'))
);

COMMENT ON TABLE dim_traccia IS
    'Dimensione traccia con audio features discretizzate. '
    'genre_key è FK conformata verso dim_genere.';

-- ------------------------------------------------------------
-- DIM_ARTISTA
-- ------------------------------------------------------------
CREATE TABLE dim_artista (
    artist_key       SERIAL        PRIMARY KEY,
    artist_id        VARCHAR(22)   NOT NULL UNIQUE, -- business key (hash MD5 del nome)
    name             VARCHAR(255)  NOT NULL,
    genre_key        INTEGER       REFERENCES dim_genere(genre_key), -- FK conformata
    genre_raw        VARCHAR(500)  -- tag Last.fm originali (tracciabilità; nodo grafted nel DFM)
);

COMMENT ON TABLE dim_artista IS
    'Dimensione artista. genre_key è FK conformata verso dim_genere. '
    'genre_raw conserva i tag grezzi Last.fm (nodo eliminato con grafting nel DFM).';

-- ------------------------------------------------------------
-- DIM_ALBUM
-- ------------------------------------------------------------
CREATE TABLE dim_album (
    album_key        SERIAL        PRIMARY KEY,
    album_id         VARCHAR(22)   NOT NULL UNIQUE, -- business key
    name             VARCHAR(500)  NOT NULL,
    release_date     DATE,
    release_year     SMALLINT,
    release_decade   VARCHAR(10)
);

COMMENT ON TABLE dim_album IS 'Dimensione album — gerarchia temporale secondaria indipendente da dim_tempo.';

-- ------------------------------------------------------------
-- BRIDGE_ARTISTA — Risoluzione N:M track-artist (Kimball pattern)
-- Un gruppo artisti (artist_group_key) identifica il set unico di artisti
-- associati a un brano. weight_factor = 1/n_artisti.
-- L'integrità referenziale di artist_group_key verso fact_chart_entry
-- è garantita dall'ETL (impossibile dichiarare FK su PK composita).
-- ------------------------------------------------------------
CREATE TABLE bridge_artista (
    artist_group_key  INTEGER      NOT NULL,
    artist_key        INTEGER      NOT NULL REFERENCES dim_artista(artist_key),
    weight_factor     NUMERIC(5,4) NOT NULL CHECK (weight_factor > 0 AND weight_factor <= 1),
    PRIMARY KEY (artist_group_key, artist_key)
);

COMMENT ON TABLE bridge_artista IS
    'Tabella ponte dimensionale (Kimball) per la relazione N:M brano-artista. '
    'artist_group_key identifica univocamente il gruppo di artisti di un brano. '
    'weight_factor = 1/n_artisti: permette aggregazioni pesate senza doppio conteggio.';

CREATE INDEX idx_bridge_group  ON bridge_artista(artist_group_key);
CREATE INDEX idx_bridge_artist ON bridge_artista(artist_key);

-- ------------------------------------------------------------
-- FACT_CHART_ENTRY — partizionata RANGE su date_key
-- Grana evento: (brano, paese, data) — 2.110.286 righe.
-- PARTITION BY RANGE abilita Partition Pruning sulle query temporali:
-- una query su un singolo anno scannerizza solo la partizione di quell'anno.
-- ------------------------------------------------------------
CREATE TABLE fact_chart_entry (
    fact_key             BIGINT   GENERATED ALWAYS AS IDENTITY,
    date_key             INTEGER  NOT NULL,  -- YYYYMMDD; logical FK → dim_tempo
    country_key          INTEGER  NOT NULL REFERENCES dim_paese(country_key),
    track_key            INTEGER  NOT NULL REFERENCES dim_traccia(track_key),
    artist_group_key     INTEGER  NOT NULL,  -- FK logica → bridge_artista
    album_key            INTEGER  NOT NULL REFERENCES dim_album(album_key),

    -- Misure fisiche
    daily_rank           SMALLINT NOT NULL CHECK (daily_rank BETWEEN 1 AND 50),
    popularity           SMALLINT CHECK (popularity BETWEEN 0 AND 100),
    daily_movement       SMALLINT,
    weekly_movement      SMALLINT,

    -- Misure derivate (calcolate in ETL)
    chart_presence       INTEGER  NOT NULL DEFAULT 1,
    days_on_chart        INTEGER  NOT NULL,
    n_countries_charted  SMALLINT NOT NULL,
    peak_rank            SMALLINT NOT NULL,
    performance_score    SMALLINT NOT NULL CHECK (performance_score BETWEEN 1 AND 50),
    -- = 51 - daily_rank; COMPLETAMENTE ADDITIVA su tutte le dimensioni.

    PRIMARY KEY (fact_key, date_key),
    UNIQUE (date_key, country_key, track_key, album_key)  -- vincolo di grain
) PARTITION BY RANGE (date_key);

COMMENT ON TABLE fact_chart_entry IS
    'Fact table partizionata per range annuale su date_key. '
    'Grana evento (brano × paese × data): 2,1M righe. '
    'Analisi per artista: JOIN via bridge_artista usando artist_group_key.';

-- ------------------------------------------------------------
-- PARTIZIONI ANNUALI — una per anno del dataset
-- Il Partition Pruning di PostgreSQL seleziona automaticamente
-- le partizioni rilevanti in base al predicato su date_key.
-- ------------------------------------------------------------
CREATE TABLE fact_y2017 PARTITION OF fact_chart_entry
    FOR VALUES FROM (20170101) TO (20180101);
CREATE TABLE fact_y2018 PARTITION OF fact_chart_entry
    FOR VALUES FROM (20180101) TO (20190101);
CREATE TABLE fact_y2019 PARTITION OF fact_chart_entry
    FOR VALUES FROM (20190101) TO (20200101);
CREATE TABLE fact_y2020 PARTITION OF fact_chart_entry
    FOR VALUES FROM (20200101) TO (20210101);
CREATE TABLE fact_y2021 PARTITION OF fact_chart_entry
    FOR VALUES FROM (20210101) TO (20220101);
CREATE TABLE fact_y2022 PARTITION OF fact_chart_entry
    FOR VALUES FROM (20220101) TO (20230101);
CREATE TABLE fact_y2023 PARTITION OF fact_chart_entry
    FOR VALUES FROM (20230101) TO (20240101);
CREATE TABLE fact_y2024 PARTITION OF fact_chart_entry
    FOR VALUES FROM (20240101) TO (20250101);
CREATE TABLE fact_default PARTITION OF fact_chart_entry DEFAULT;

-- ------------------------------------------------------------
-- INDICI per ottimizzazione OLAP
-- Gli indici dichiarati sul parent vengono propagati automaticamente
-- a tutte le partizioni (PostgreSQL 11+).
-- ------------------------------------------------------------
CREATE INDEX idx_fact_date         ON fact_chart_entry(date_key);
CREATE INDEX idx_fact_country      ON fact_chart_entry(country_key);
CREATE INDEX idx_fact_track        ON fact_chart_entry(track_key);
CREATE INDEX idx_fact_artist_group ON fact_chart_entry(artist_group_key);
CREATE INDEX idx_fact_album        ON fact_chart_entry(album_key);
CREATE INDEX idx_fact_composite    ON fact_chart_entry(date_key, country_key, track_key);
