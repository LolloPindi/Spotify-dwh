-- ============================================================
-- SPOTIFY GLOBAL CHARTS — Reconciled Database
-- Schema PostgreSQL
-- ============================================================
-- Grain di CHART_ENTRY: una riga = un brano in classifica
-- in un paese in una data specifica.
-- Tripla univoca: (spotify_id, country_code, snapshot_date)
-- ============================================================

-- Pulizia (utile per riesecuzioni idempotenti)
DROP TABLE IF EXISTS chart_entry   CASCADE;
DROP TABLE IF EXISTS track_artist  CASCADE;
DROP TABLE IF EXISTS track         CASCADE;
DROP TABLE IF EXISTS album         CASCADE;
DROP TABLE IF EXISTS artist        CASCADE;
DROP TABLE IF EXISTS country       CASCADE;
DROP TABLE IF EXISTS snapshot_date CASCADE;

-- ------------------------------------------------------------
-- SNAPSHOT_DATE
-- Tabella separata per consentire attributi temporali calcolati
-- senza replicarli su ogni riga di chart_entry.
-- ------------------------------------------------------------
CREATE TABLE snapshot_date (
    snapshot_date   DATE        PRIMARY KEY,
    year            SMALLINT    NOT NULL,
    month           SMALLINT    NOT NULL CHECK (month BETWEEN 1 AND 12),
    quarter         SMALLINT    NOT NULL CHECK (quarter BETWEEN 1 AND 4),
    week_of_year    SMALLINT    NOT NULL CHECK (week_of_year BETWEEN 1 AND 53),
    day_of_week     SMALLINT    NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    season          VARCHAR(10) NOT NULL CHECK (season IN ('Spring','Summer','Autumn','Winter'))
);

COMMENT ON TABLE snapshot_date IS
    'Dimensione temporale del reconciled DB. '
    'Generata programmaticamente dalla finestra temporale del dataset.';

-- ------------------------------------------------------------
-- COUNTRY
-- Contiene sia i codici ISO dal dataset Spotify sia i metadati
-- geografici aggiunti da fonti esterne (World Bank / ISO 3166).
-- Colonne income_group, gdp_per_capita, population derivano
-- dall''arricchimento — non presenti nel CSV originale.
-- ------------------------------------------------------------
CREATE TABLE country (
    country_code        CHAR(2)         PRIMARY KEY,  -- ISO 3166-1 alpha-2
    country_name        VARCHAR(100)    NOT NULL,
    continent           VARCHAR(50)     NOT NULL,
    subregion           VARCHAR(100),
    language_primary    VARCHAR(50),
    income_group        VARCHAR(30),                  -- World Bank: Low / Lower-middle / Upper-middle / High
    population          BIGINT,
    gdp_per_capita      NUMERIC(12,2)                 -- USD correnti, anno più recente disponibile
);

COMMENT ON TABLE country IS
    'Paesi presenti nel dataset. Arricchiti con metadati geografici '
    'e socioeconomici da World Bank e ISO 3166.';

-- ------------------------------------------------------------
-- ARTIST
-- ------------------------------------------------------------
CREATE TABLE artist (
    artist_id   VARCHAR(22)     PRIMARY KEY,          -- Spotify artist ID (base62, 22 char)
    name        VARCHAR(255)    NOT NULL
);

-- ------------------------------------------------------------
-- ALBUM
-- release_date separato da snapshot_date: sono due gerarchie
-- temporali indipendenti nel DWH (uscita dell'album vs
-- apparizione in classifica).
-- ------------------------------------------------------------
CREATE TABLE album (
    album_id    VARCHAR(22)     PRIMARY KEY,          -- Spotify album ID
    name        VARCHAR(500)    NOT NULL,
    release_date DATE,
    album_type  VARCHAR(20)     CHECK (album_type IN ('album','single','compilation'))
);

-- ------------------------------------------------------------
-- TRACK
-- Le audio feature (danceability..liveness) sono proprietà
-- intrinseche del brano. Possono essere NULL per i brani più
-- recenti a causa della deprecazione dell'endpoint
-- audio-features di Spotify API (fine 2024).
-- La gestione della missingness è documentata nel notebook
-- di data quality.
-- ------------------------------------------------------------
CREATE TABLE track (
    spotify_id      VARCHAR(22)     PRIMARY KEY,      -- Spotify track ID
    name            VARCHAR(500)    NOT NULL,
    album_id        VARCHAR(22)     REFERENCES album(album_id),
    duration_ms     INTEGER         CHECK (duration_ms > 0),
    is_explicit     BOOLEAN,
    -- Tonalità e modo (Circle of Fifths)
    key             SMALLINT        CHECK (key BETWEEN 0 AND 11),   -- 0=C, 1=C#, ..., 11=B
    mode            SMALLINT        CHECK (mode IN (0, 1)),          -- 0=minor, 1=major
    -- Audio features (0.0–1.0 salvo tempo e loudness)
    danceability    NUMERIC(4,3)    CHECK (danceability BETWEEN 0 AND 1),
    energy          NUMERIC(4,3)    CHECK (energy BETWEEN 0 AND 1),
    valence         NUMERIC(4,3)    CHECK (valence BETWEEN 0 AND 1),
    acousticness    NUMERIC(4,3)    CHECK (acousticness BETWEEN 0 AND 1),
    speechiness     NUMERIC(4,3)    CHECK (speechiness BETWEEN 0 AND 1),
    liveness        NUMERIC(4,3)    CHECK (liveness BETWEEN 0 AND 1),
    instrumentalness NUMERIC(4,3)  CHECK (instrumentalness BETWEEN 0 AND 1),
    tempo           NUMERIC(6,3),                                    -- BPM
    loudness        NUMERIC(6,3),                                    -- dB (valori negativi normali)
    time_signature  SMALLINT        CHECK (time_signature BETWEEN 0 AND 7)
);

COMMENT ON COLUMN track.key IS
    'Tonalità in notazione Pitch Class: 0=C, 1=C#/Db, 2=D, ..., 11=B. '
    'NULL se audio feature non disponibile.';
COMMENT ON COLUMN track.danceability IS
    'Quanto il brano è adatto al ballo (0=poco, 1=molto). '
    'NULL per brani post-2024 per deprecazione API Spotify.';

-- ------------------------------------------------------------
-- TRACK_ARTIST (tabella ponte N:M)
-- Un brano può avere più artisti (feat., collaborazioni).
-- Senza questa tabella non è possibile fare GROUP BY artista.
-- ------------------------------------------------------------
CREATE TABLE track_artist (
    spotify_id  VARCHAR(22)  REFERENCES track(spotify_id)  ON DELETE CASCADE,
    artist_id   VARCHAR(22)  REFERENCES artist(artist_id)  ON DELETE CASCADE,
    PRIMARY KEY (spotify_id, artist_id)
);

-- ------------------------------------------------------------
-- CHART_ENTRY (fatto del reconciled DB)
-- Grain: (spotify_id, country_code, snapshot_date) — unico.
-- daily_rank: non additivo (si usa MIN per peak, AVG per trend).
-- popularity: semi-additivo (medio su tempo, non su paese).
-- ------------------------------------------------------------
CREATE TABLE chart_entry (
    entry_id        SERIAL          PRIMARY KEY,
    spotify_id      VARCHAR(22)     NOT NULL REFERENCES track(spotify_id),
    country_code    CHAR(2)         NOT NULL REFERENCES country(country_code),
    snapshot_date   DATE            NOT NULL REFERENCES snapshot_date(snapshot_date),
    daily_rank      SMALLINT        NOT NULL CHECK (daily_rank BETWEEN 1 AND 50),
    daily_movement  SMALLINT,                -- positivo = salita, negativo = discesa, NULL = nuovo
    weekly_movement SMALLINT,
    popularity      SMALLINT        CHECK (popularity BETWEEN 0 AND 100),
    UNIQUE (spotify_id, country_code, snapshot_date)   -- vincolo di grain
);

COMMENT ON TABLE chart_entry IS
    'Fatto centrale del reconciled DB. '
    'Ogni riga è un brano in classifica in un paese in una data. '
    'Il vincolo UNIQUE garantisce il grain dichiarato.';
COMMENT ON COLUMN chart_entry.daily_rank IS
    'Posizione in classifica (1=primo). NON ADDITIVA: usare MIN (peak) o AVG (trend).';
COMMENT ON COLUMN chart_entry.popularity IS
    'Score Spotify 0-100, calcolato globalmente. SEMI-ADDITIVA: '
    'ha senso in media su tempo, non in somma su paesi.';

-- ------------------------------------------------------------
-- INDICI per performance delle query ETL e OLAP
-- ------------------------------------------------------------
CREATE INDEX idx_ce_spotify_id    ON chart_entry(spotify_id);
CREATE INDEX idx_ce_country       ON chart_entry(country_code);
CREATE INDEX idx_ce_date          ON chart_entry(snapshot_date);
CREATE INDEX idx_ce_date_country  ON chart_entry(snapshot_date, country_code);
CREATE INDEX idx_track_album      ON track(album_id);
CREATE INDEX idx_ta_artist        ON track_artist(artist_id);
