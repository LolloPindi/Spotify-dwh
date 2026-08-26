-- ============================================================
-- SPOTIFY GLOBAL CHARTS — Data Warehouse Schema
-- Star Schema (PostgreSQL)
-- ============================================================

-- Pulizia tabelle esistenti per riesecuzione idempotente
DROP TABLE IF EXISTS fact_chart_entry CASCADE;
DROP TABLE IF EXISTS dim_tempo        CASCADE;
DROP TABLE IF EXISTS dim_paese        CASCADE;
DROP TABLE IF EXISTS dim_traccia      CASCADE;
DROP TABLE IF EXISTS dim_artista      CASCADE;
DROP TABLE IF EXISTS dim_album        CASCADE;

-- ------------------------------------------------------------
-- DIM_TEMPO
-- ------------------------------------------------------------
CREATE TABLE dim_tempo (
    date_key        INTEGER     PRIMARY KEY, -- Formato: YYYYMMDD (es. 20231018)
    snapshot_date   DATE        NOT NULL UNIQUE,
    week            SMALLINT    NOT NULL,    -- Settimana dell'anno (1-53)
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
    country_key      SERIAL          PRIMARY KEY,
    country_code     CHAR(2)         NOT NULL UNIQUE, -- ISO 3166-1 alpha-2
    country_name     VARCHAR(100)    NOT NULL,
    continent        VARCHAR(50)     NOT NULL,
    subregion        VARCHAR(100),
    language         VARCHAR(50),                     -- Lingua primaria parlata
    income_group     VARCHAR(30),                     -- World Bank Income Group (es. High income)
    population       BIGINT,                          -- Popolazione totale
    gdp_per_capita   NUMERIC(12,2)                    -- GDP Pro capite in USD
);

COMMENT ON TABLE dim_paese IS 'Dimensione geografica arricchita con indicatori socio-economici World Bank.';

-- ------------------------------------------------------------
-- DIM_TRACCIA
-- ------------------------------------------------------------
CREATE TABLE dim_traccia (
    track_key        SERIAL          PRIMARY KEY,
    spotify_id       VARCHAR(22)     NOT NULL UNIQUE, -- Spotify Track ID
    name             VARCHAR(500)    NOT NULL,
    duration_ms      INTEGER         NOT NULL CHECK (duration_ms > 0),
    is_explicit      BOOLEAN         NOT NULL,
    danceability     NUMERIC(4,3),
    energy           NUMERIC(4,3),
    valence          NUMERIC(4,3),
    mood_band        VARCHAR(20)     CHECK (mood_band IN ('Low', 'Medium', 'High')),    -- Discretizzato da Valence
    energy_band      VARCHAR(20)     CHECK (energy_band IN ('Low', 'Medium', 'High')),  -- Discretizzato da Energy
    valence_band     VARCHAR(20)     CHECK (valence_band IN ('Low', 'Medium', 'High')), -- Alias/Band aggiuntiva per consistenza DFM
    genre            VARCHAR(100)                                                         -- Genere musicale inferito da Last.fm (Grafting)
);

COMMENT ON TABLE dim_traccia IS 'Dimensione traccia con audio features discretizzate e genere musicale arricchito da Last.fm.';

-- ------------------------------------------------------------
-- DIM_ARTISTA
-- ------------------------------------------------------------
CREATE TABLE dim_artista (
    artist_key       SERIAL          PRIMARY KEY,
    artist_id        VARCHAR(22)     NOT NULL UNIQUE, -- Spotify Artist ID
    name             VARCHAR(255)    NOT NULL,
    genre            VARCHAR(100),                    -- Genere musicale dominante (Last.fm majority vote)
    genre_raw        VARCHAR(500)                     -- Tag Last.fm originali (tracciabilità)
);

COMMENT ON TABLE dim_artista IS 'Dimensione artista arricchita con genere musicale da Last.fm (Grafting da fonte esterna).';

-- ------------------------------------------------------------
-- DIM_ALBUM
-- ------------------------------------------------------------
CREATE TABLE dim_album (
    album_key        SERIAL          PRIMARY KEY,
    album_id         VARCHAR(22)     NOT NULL UNIQUE, -- Spotify Album ID
    name             VARCHAR(500)    NOT NULL,
    release_date     DATE,
    release_year     SMALLINT,
    release_decade   VARCHAR(10)                      -- Es. '2020s', '2010s'
);

COMMENT ON TABLE dim_album IS 'Dimensione album (seconda gerarchia temporale indipendente).';

-- ------------------------------------------------------------
-- FACT_CHART_ENTRY (Fatto centrale)
-- ------------------------------------------------------------
CREATE TABLE fact_chart_entry (
    fact_key            SERIAL      PRIMARY KEY,
    date_key            INTEGER     NOT NULL REFERENCES dim_tempo(date_key),
    country_key         INTEGER     NOT NULL REFERENCES dim_paese(country_key),
    track_key           INTEGER     NOT NULL REFERENCES dim_traccia(track_key),
    artist_key          INTEGER     NOT NULL REFERENCES dim_artista(artist_key),
    album_key           INTEGER     NOT NULL REFERENCES dim_album(album_key),
    
    -- Misure originali
    daily_rank          SMALLINT    NOT NULL CHECK (daily_rank BETWEEN 1 AND 50),
    popularity          SMALLINT    CHECK (popularity BETWEEN 0 AND 100),
    daily_movement      SMALLINT,
    weekly_movement     SMALLINT,
    
    -- Misure derivate
    chart_presence      INTEGER     NOT NULL DEFAULT 1,          -- Costante = 1, per contare i giorni in classifica
    days_on_chart       INTEGER     NOT NULL,                    -- Running total dei giorni in classifica per track in country fino a questa data
    n_countries_charted SMALLINT    NOT NULL,                    -- Numero totale di paesi in cui questo brano è entrato in classifica fino a questa data
    peak_rank           SMALLINT    NOT NULL,                    -- Miglior rank ottenuto fino a questa data per track in country
    performance_score   SMALLINT    NOT NULL CHECK (performance_score BETWEEN 1 AND 50),
                                                                 -- = 51 - daily_rank; COMPLETAMENTE ADDITIVA lungo tutte le dimensioni.
                                                                 -- Converte il rank ordinale in un punteggio continuo (50=vetta, 1=ultima posizione).
                                                                 -- Consente SUM su genere/paese/tempo senza distorsioni ordinali.

    -- Grain unico della tabella dei fatti per gestire la relazione N:M track-artist
    UNIQUE (date_key, country_key, track_key, artist_key, album_key)
);

COMMENT ON TABLE fact_chart_entry IS 'Tabella dei fatti centrale dello Star Schema. Contiene misure fisiche e derivate.';

-- ------------------------------------------------------------
-- INDICI per ottimizzazione query OLAP
-- ------------------------------------------------------------
CREATE INDEX idx_fact_date      ON fact_chart_entry(date_key);
CREATE INDEX idx_fact_country   ON fact_chart_entry(country_key);
CREATE INDEX idx_fact_track     ON fact_chart_entry(track_key);
CREATE INDEX idx_fact_artist    ON fact_chart_entry(artist_key);
CREATE INDEX idx_fact_album     ON fact_chart_entry(album_key);
CREATE INDEX idx_fact_composite ON fact_chart_entry(date_key, country_key, track_key);

-- ------------------------------------------------------------
-- VISTA v_chart_event — grana evento (senza dimensione artista)
-- Usare per aggregazioni che NON passano per l'asse artista,
-- dove il fanning-out genererebbe doppio conteggio.
-- ------------------------------------------------------------
CREATE VIEW v_chart_event AS
SELECT DISTINCT
    date_key,
    country_key,
    track_key,
    album_key,
    daily_rank,
    popularity,
    daily_movement,
    weekly_movement,
    chart_presence,
    days_on_chart,
    n_countries_charted,
    peak_rank,
    performance_score
FROM fact_chart_entry;
