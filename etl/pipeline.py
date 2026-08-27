import os
import sys
import hashlib
import bisect
from datetime import datetime
from pathlib import Path
import pandas as pd
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from tqdm import tqdm

# ── Config ────────────────────────────────────────────────────────────────────
load_dotenv()

DB_HOST     = os.getenv("DB_RECONCILED_HOST",     "localhost")
DB_PORT     = os.getenv("DB_RECONCILED_PORT",     "5432")
DB_REC_NAME = os.getenv("DB_RECONCILED_NAME",     "spotify_reconciled")
DB_DWH_NAME = os.getenv("DB_DWH_NAME",            "spotify_dw")
DB_USER     = os.getenv("DB_RECONCILED_USER",     "postgres")
DB_PASS     = os.getenv("DB_RECONCILED_PASSWORD", "")

CHUNK_SIZE = 20_000

# ── Macro-genere (gerarchia dim_genere) ──────────────────────────────────────
# Ordine rilevante: il primo match vince.
MACRO_GENRE_RULES = [
    ('hip hop',     'Hip-Hop/Rap'),
    ('hip-hop',     'Hip-Hop/Rap'),
    ('rap',         'Hip-Hop/Rap'),
    ('trap',        'Hip-Hop/Rap'),
    ('drill',       'Hip-Hop/Rap'),
    ('r&b',         'Pop/R&B'),
    ('soul',        'Pop/R&B'),
    ('funk',        'Pop/R&B'),
    ('disco',       'Pop/R&B'),
    ('pop',         'Pop/R&B'),
    ('rock',        'Rock/Metal'),
    ('metal',       'Rock/Metal'),
    ('punk',        'Rock/Metal'),
    ('indie',       'Rock/Metal'),
    ('alternative', 'Rock/Metal'),
    ('grunge',      'Rock/Metal'),
    ('house',       'Electronic/Dance'),
    ('techno',      'Electronic/Dance'),
    ('trance',      'Electronic/Dance'),
    ('edm',         'Electronic/Dance'),
    ('electronic',  'Electronic/Dance'),
    ('dance',       'Electronic/Dance'),
    ('jazz',        'Jazz/Blues'),
    ('blues',       'Jazz/Blues'),
    ('classical',   'Classical'),
    ('orchestral',  'Classical'),
    ('country',     'Country/Folk'),
    ('folk',        'Country/Folk'),
    ('latin',       'Latin/World'),
    ('reggae',      'Latin/World'),
    ('afro',        'Latin/World'),
    ('k-pop',       'Latin/World'),
    ('j-pop',       'Latin/World'),
    ('world',       'Latin/World'),
]

def get_macro_genre(genre_name: str | None) -> str:
    if not genre_name:
        return 'Other'
    g = genre_name.lower()
    for keyword, macro in MACRO_GENRE_RULES:
        if keyword in g:
            return macro
    return 'Other'

# ── Geopolitical Dictionary ──────────────────────────────────────────────────
COUNTRY_METADATA = {
    "GL": ["Global",        "Global",                           "English",                          "High income",          8000000000, 15000.0],
    "AE": ["Asia",          "Western Asia",                     "Arabic",                           "High income",            9516000, 52977.0],
    "AR": ["South America", "South America",                    "Spanish",                          "Upper-middle income",   46230000, 13730.0],
    "AT": ["Europe",        "Western Europe",                   "German",                           "High income",            9104000, 56506.0],
    "AU": ["Oceania",       "Australia and New Zealand",        "English",                          "High income",           26630000, 64433.0],
    "BE": ["Europe",        "Western Europe",                   "Dutch/French",                     "High income",           11750000, 53290.0],
    "BG": ["Europe",        "Eastern Europe",                   "Bulgarian",                        "High income",            6447000, 15789.0],
    "BO": ["South America", "South America",                    "Spanish",                          "Lower-middle income",   12220000,  3600.0],
    "BR": ["South America", "South America",                    "Portuguese",                       "Upper-middle income",  215300000, 10078.0],
    "BY": ["Europe",        "Eastern Europe",                   "Belarusian/Russian",               "Upper-middle income",    9208000,  7829.0],
    "CA": ["North America", "Northern America",                 "English/French",                   "High income",           38920000, 53371.0],
    "CH": ["Europe",        "Western Europe",                   "German/French/Italian",            "High income",            8815000, 99971.0],
    "CL": ["South America", "South America",                    "Spanish",                          "High income",           19600000, 15893.0],
    "CO": ["South America", "South America",                    "Spanish",                          "Upper-middle income",   51870000,  6630.0],
    "CR": ["North America", "Central America",                  "Spanish",                          "Upper-middle income",    5212000, 16531.0],
    "CZ": ["Europe",        "Eastern Europe",                   "Czech",                            "High income",           10820000, 30422.0],
    "DE": ["Europe",        "Western Europe",                   "German",                           "High income",           84350000, 52728.0],
    "DK": ["Europe",        "Northern Europe",                  "Danish",                           "High income",            5933000, 70397.0],
    "DO": ["North America", "Caribbean",                        "Spanish",                          "Upper-middle income",   11220000, 10716.0],
    "EC": ["South America", "South America",                    "Spanish",                          "Upper-middle income",   18000000,  6391.0],
    "EE": ["Europe",        "Northern Europe",                  "Estonian",                         "High income",            1365000, 29824.0],
    "EG": ["Africa",        "Northern Africa",                  "Arabic",                           "Lower-middle income",  112700000,  3770.0],
    "ES": ["Europe",        "Southern Europe",                  "Spanish",                          "High income",           48050000, 33265.0],
    "FI": ["Europe",        "Northern Europe",                  "Finnish",                          "High income",            5556000, 54351.0],
    "FR": ["Europe",        "Western Europe",                   "French",                           "High income",           68070000, 44460.0],
    "GB": ["Europe",        "Northern Europe",                  "English",                          "High income",           66970000, 48866.0],
    "GR": ["Europe",        "Southern Europe",                  "Greek",                            "High income",           10420000, 22990.0],
    "GT": ["North America", "Central America",                  "Spanish",                          "Upper-middle income",   17840000,  5473.0],
    "HK": ["Asia",          "Eastern Asia",                     "Chinese/English",                  "High income",            7346000, 50697.0],
    "HN": ["North America", "Central America",                  "Spanish",                          "Lower-middle income",   10430000,  3242.0],
    "HU": ["Europe",        "Eastern Europe",                   "Hungarian",                        "High income",            9597000, 22146.0],
    "ID": ["Asia",          "South-Eastern Asia",               "Indonesian",                       "Upper-middle income",  277500000,  4919.0],
    "IE": ["Europe",        "Northern Europe",                  "English/Irish",                    "High income",            5149000,103723.0],
    "IL": ["Asia",          "Western Asia",                     "Hebrew/Arabic",                    "High income",            9757000, 52261.0],
    "IN": ["Asia",          "Southern Asia",                    "Hindi/English",                    "Lower-middle income", 1428000000,  2484.0],
    "IS": ["Europe",        "Northern Europe",                  "Icelandic",                        "High income",             382000, 78837.0],
    "IT": ["Europe",        "Southern Europe",                  "Italian",                          "High income",           58870000, 38373.0],
    "JP": ["Asia",          "Eastern Asia",                     "Japanese",                         "High income",          125100000, 33831.0],
    "KR": ["Asia",          "Eastern Asia",                     "Korean",                           "High income",           51740000, 33039.0],
    "KZ": ["Asia",          "Central Asia",                     "Kazakh/Russian",                   "Upper-middle income",   19890000, 13136.0],
    "LT": ["Europe",        "Northern Europe",                  "Lithuanian",                       "High income",            2833000, 27102.0],
    "LU": ["Europe",        "Western Europe",                   "Luxembourgish/French/German",      "High income",             653000,128259.0],
    "LV": ["Europe",        "Northern Europe",                  "Latvian",                          "High income",            1879000, 23073.0],
    "MA": ["Africa",        "Northern Africa",                  "Arabic/Berber",                    "Lower-middle income",   37450000,  3672.0],
    "MX": ["North America", "Central America",                  "Spanish",                          "Upper-middle income",  127500000, 13926.0],
    "MY": ["Asia",          "South-Eastern Asia",               "Malay",                            "Upper-middle income",   33930000, 11684.0],
    "NG": ["Africa",        "Western Africa",                   "English",                          "Lower-middle income",  223800000,  1109.0],
    "NI": ["North America", "Central America",                  "Spanish",                          "Lower-middle income",    6908000,  2275.0],
    "NL": ["Europe",        "Western Europe",                   "Dutch",                            "High income",           17700000, 62530.0],
    "NO": ["Europe",        "Northern Europe",                  "Norwegian",                        "High income",            5457000, 87694.0],
    "NZ": ["Oceania",       "Australia and New Zealand",        "English",                          "High income",            5122000, 48527.0],
    "PA": ["North America", "Central America",                  "Spanish",                          "High income",            4408000, 18653.0],
    "PE": ["South America", "South America",                    "Spanish",                          "Upper-middle income",   34040000,  7724.0],
    "PH": ["Asia",          "South-Eastern Asia",               "Tagalog/English",                  "Lower-middle income",  115500000,  3859.0],
    "PK": ["Asia",          "Southern Asia",                    "Urdu/English",                     "Lower-middle income",  240500000,  1407.0],
    "PL": ["Europe",        "Eastern Europe",                   "Polish",                           "High income",           36820000, 22001.0],
    "PT": ["Europe",        "Southern Europe",                  "Portuguese",                       "High income",           10410000, 26270.0],
    "PY": ["South America", "South America",                    "Spanish/Guarani",                  "Upper-middle income",    6780000,  6260.0],
    "RO": ["Europe",        "Eastern Europe",                   "Romanian",                         "High income",           19050000, 18419.0],
    "SA": ["Asia",          "Western Asia",                     "Arabic",                           "High income",           36940000, 32586.0],
    "SE": ["Europe",        "Northern Europe",                  "Swedish",                          "High income",           10540000, 56305.0],
    "SG": ["Asia",          "South-Eastern Asia",               "English/Malay/Mandarin/Tamil",     "High income",            5917000, 84735.0],
    "SK": ["Europe",        "Eastern Europe",                   "Slovak",                           "High income",            5431000, 24470.0],
    "SV": ["North America", "Central America",                  "Spanish",                          "Lower-middle income",    6336000,  5344.0],
    "TH": ["Asia",          "South-Eastern Asia",               "Thai",                             "Upper-middle income",   71800000,  7171.0],
    "TR": ["Asia",          "Western Asia",                     "Turkish",                          "Upper-middle income",   85370000, 12985.0],
    "TW": ["Asia",          "Eastern Asia",                     "Mandarin",                         "High income",           23920000, 32756.0],
    "UA": ["Europe",        "Eastern Europe",                   "Ukrainian",                        "Lower-middle income",   38000000,  5183.0],
    "US": ["North America", "Northern America",                 "English",                          "High income",          333280000, 81695.0],
    "UY": ["South America", "South America",                    "Spanish",                          "High income",           34220000, 21677.0],
    "VE": ["South America", "South America",                    "Spanish",                          "Upper-middle income",   28300000,  3685.0],
    "VN": ["Asia",          "South-Eastern Asia",               "Vietnamese",                       "Lower-middle income",   98180000,  4347.0],
    "ZA": ["Africa",        "Southern Africa",                  "Zulu/Xhosa/Afrikaans/English",     "Upper-middle income",   60410000,  6253.0],
}

def get_conn(dbname):
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=dbname,
        user=DB_USER, password=DB_PASS
    )

def execute_query(conn, query, params=None):
    with conn.cursor() as cur:
        cur.execute(query, params)
        if cur.description:
            return cur.fetchall()

def sep(title="", w=75):
    print()
    print("═" * w)
    if title:
        print(f"  {title}")
        print("═" * w)

def discretize_feature(val):
    if val is None:
        return None
    val = float(val)
    if val > 0.7:
        return 'High'
    elif val < 0.3:
        return 'Low'
    else:
        return 'Medium'

# ── Main ETL ─────────────────────────────────────────────────────────────────
def run_etl():
    conn_rec = get_conn(DB_REC_NAME)
    conn_dwh = get_conn(DB_DWH_NAME)

    try:
        # 1. SVUOTAMENTO DWH
        sep("1. PULIZIA E PREPARAZIONE DWH")
        with conn_dwh.cursor() as cur:
            for t in ["fact_chart_entry", "bridge_artista",
                      "dim_tempo", "dim_paese",
                      "dim_traccia", "dim_artista", "dim_album",
                      "dim_genere"]:
                cur.execute(f"TRUNCATE TABLE {t} CASCADE")
                print(f"  ✓  DWH: {t} svuotata")
        conn_dwh.commit()

        # 2. DIM_TEMPO
        sep("2. POPOLAMENTO DIM_TEMPO")
        rec_dates = execute_query(
            conn_rec,
            "SELECT snapshot_date, year, month, quarter, week_of_year, day_of_week, season FROM snapshot_date"
        )
        tempo_rows = []
        for row in rec_dates:
            dt = row[0]
            date_key = int(dt.strftime("%Y%m%d"))
            tempo_rows.append((date_key, dt, row[4], row[2], row[3], row[1], row[6]))
        with conn_dwh.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                "INSERT INTO dim_tempo (date_key, snapshot_date, week, month, quarter, year, season) VALUES %s",
                tempo_rows
            )
        conn_dwh.commit()
        print(f"  ✓  {len(tempo_rows):,} righe in dim_tempo")

        # 3. DIM_PAESE
        sep("3. POPOLAMENTO DIM_PAESE")
        rec_countries = execute_query(conn_rec, "SELECT country_code, country_name FROM country")
        paese_rows = []
        import pycountry
        for code, name in rec_countries:
            if code == "GL":
                c_name = "Global"
            else:
                try:
                    c_name = pycountry.countries.get(alpha_2=code).name
                except Exception:
                    c_name = name
            meta = COUNTRY_METADATA.get(code, ["Unknown", None, None, None, None, None])
            paese_rows.append((code, c_name, meta[0], meta[1], meta[2], meta[3], meta[4], meta[5]))
        with conn_dwh.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                "INSERT INTO dim_paese (country_code, country_name, continent, subregion, language, income_group, population, gdp_per_capita) VALUES %s",
                paese_rows
            )
        conn_dwh.commit()
        print(f"  ✓  {len(paese_rows):,} righe in dim_paese")

        # 4. DIM_GENERE (dimensione conformata — popolata PRIMA di traccia e artista)
        sep("4. POPOLAMENTO DIM_GENERE (dimensione conformata)")
        genres_track  = execute_query(conn_rec, "SELECT DISTINCT lastfm_genre FROM track  WHERE lastfm_genre IS NOT NULL")
        genres_artist = execute_query(conn_rec, "SELECT DISTINCT lastfm_genre FROM artist WHERE lastfm_genre IS NOT NULL")
        unique_genres = set()
        for (g,) in genres_track:
            unique_genres.add(g)
        for (g,) in genres_artist:
            unique_genres.add(g)

        genre_rows = [(g, get_macro_genre(g)) for g in sorted(unique_genres)]
        with conn_dwh.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                "INSERT INTO dim_genere (genre_name, macro_genre) VALUES %s",
                genre_rows,
                page_size=500
            )
        conn_dwh.commit()
        print(f"  ✓  {len(genre_rows):,} generi in dim_genere")

        # Lookup genere (nome → genre_key) — usato subito sotto
        dwh_genres = {name: key for key, name in execute_query(
            conn_dwh, "SELECT genre_key, genre_name FROM dim_genere"
        )}

        # 5. DIM_TRACCIA
        sep("5. POPOLAMENTO DIM_TRACCIA")
        rec_tracks = execute_query(
            conn_rec,
            "SELECT spotify_id, name, duration_ms, is_explicit, danceability, energy, valence, lastfm_genre FROM track"
        )
        traccia_rows = []
        for r in rec_tracks:
            spotify_id, name, duration_ms, is_explicit = r[0], r[1], r[2], r[3]
            danceability, energy, valence, genre = r[4], r[5], r[6], r[7]
            mood_band    = discretize_feature(valence)
            energy_band  = discretize_feature(energy)
            valence_band = mood_band
            genre_key    = dwh_genres.get(genre)  # FK conformata → dim_genere
            traccia_rows.append((
                spotify_id, name, duration_ms, is_explicit,
                danceability, energy, valence,
                mood_band, energy_band, valence_band,
                genre_key
            ))
        with conn_dwh.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                """INSERT INTO dim_traccia
                   (spotify_id, name, duration_ms, is_explicit,
                    danceability, energy, valence,
                    mood_band, energy_band, valence_band, genre_key)
                   VALUES %s""",
                traccia_rows
            )
        conn_dwh.commit()
        genre_filled_t = sum(1 for r in traccia_rows if r[10] is not None)
        print(f"  ✓  {len(traccia_rows):,} righe in dim_traccia")
        print(f"       Genere disponibile: {genre_filled_t:,}/{len(traccia_rows):,} ({100*genre_filled_t/max(len(traccia_rows),1):.1f}%)")

        # 6. DIM_ARTISTA
        sep("6. POPOLAMENTO DIM_ARTISTA")
        rec_artists = execute_query(conn_rec, "SELECT artist_id, name, lastfm_genre FROM artist")
        artista_rows = []
        for r in rec_artists:
            artist_id, name, lastfm_genre = r[0], r[1], r[2]
            genre_key = dwh_genres.get(lastfm_genre)  # FK conformata → dim_genere
            artista_rows.append((artist_id, name, genre_key, lastfm_genre))  # genre_raw = lastfm_genre (tracciabilità)
        with conn_dwh.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                "INSERT INTO dim_artista (artist_id, name, genre_key, genre_raw) VALUES %s",
                artista_rows
            )
        conn_dwh.commit()
        genre_filled_a = sum(1 for r in artista_rows if r[2] is not None)
        print(f"  ✓  {len(artista_rows):,} righe in dim_artista")
        print(f"       Genere disponibile: {genre_filled_a:,}/{len(artista_rows):,} ({100*genre_filled_a/max(len(artista_rows),1):.1f}%)")

        # 7. DIM_ALBUM
        sep("7. POPOLAMENTO DIM_ALBUM")
        rec_albums = execute_query(conn_rec, "SELECT album_id, name, release_date FROM album")
        album_rows = []
        for r in rec_albums:
            album_id, name, release_date = r
            release_year   = release_date.year if release_date else None
            release_decade = f"{(release_year // 10) * 10}s" if release_year else None
            album_rows.append((album_id, name, release_date, release_year, release_decade))
        with conn_dwh.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                "INSERT INTO dim_album (album_id, name, release_date, release_year, release_decade) VALUES %s",
                album_rows
            )
        conn_dwh.commit()
        print(f"  ✓  {len(album_rows):,} righe in dim_album")

        # ── Lookup surrogate keys ────────────────────────────────────────────
        sep("CARICAMENTO MAPPE SURROGATE KEYS")
        dwh_countries = {code: key for key, code in execute_query(conn_dwh, "SELECT country_key, country_code FROM dim_paese")}
        dwh_tracks    = {sid:  key for key, sid  in execute_query(conn_dwh, "SELECT track_key,   spotify_id  FROM dim_traccia")}
        dwh_artists   = {aid:  key for key, aid  in execute_query(conn_dwh, "SELECT artist_key,  artist_id   FROM dim_artista")}
        dwh_albums    = {aid:  key for key, aid  in execute_query(conn_dwh, "SELECT album_key,   album_id    FROM dim_album")}
        print("  ✓  Mappe surrogate caricate.")

        # ── Pre-calcolo n_countries_charted con bisect ───────────────────────
        # Nota: COUNT(DISTINCT country_code) OVER (...) non è supportato in
        # PostgreSQL come window function. Si usa ricerca binaria su array
        # ordinato delle prime entry per paese, con complessità O(n log k).
        sep("PRE-CALCOLO CUMULATIVE COUNTRY ENTRIES")
        country_min_entries = execute_query(
            conn_rec,
            "SELECT spotify_id, MIN(snapshot_date) FROM chart_entry GROUP BY spotify_id, country_code"
        )
        track_min_dates: dict[str, list] = {}
        for sid, min_dt in country_min_entries:
            if sid not in track_min_dates:
                track_min_dates[sid] = []
            track_min_dates[sid].append(min_dt)
        for sid in track_min_dates:
            track_min_dates[sid].sort()
        print("  ✓  Mappa cumulativa country pre-calcolata.")

        # ── Pre-caricamento relazioni track→artist ───────────────────────────
        print("  Carico relazioni track_artist in memoria...")
        rec_track_artist = execute_query(conn_rec, "SELECT spotify_id, artist_id FROM track_artist")
        track_artists: dict[str, list] = {}
        for sid, aid in rec_track_artist:
            if sid not in track_artists:
                track_artists[sid] = []
            track_artists[sid].append(aid)
        print(f"  ✓  {len(track_artists):,} brani con relazioni artista caricate.")

        # 8. BRIDGE_ARTISTA (pattern Kimball per N:M)
        sep("8. COSTRUZIONE BRIDGE_ARTISTA (N:M Kimball pattern)")
        # Per ogni insieme unico di artisti → assegna un artist_group_key
        # weight_factor = 1/n_artisti: consente aggregazioni pesate senza doppio conteggio
        group_key_map: dict[frozenset, int] = {}
        next_group_key = 1
        bridge_rows = []
        track_group_key: dict[str, int] = {}

        for sid, artists in track_artists.items():
            key = frozenset(artists)
            if key not in group_key_map:
                gk = next_group_key
                group_key_map[key] = gk
                next_group_key += 1
                n = len(artists)
                wf = round(1.0 / n, 4)
                for aid in sorted(artists):
                    ak = dwh_artists.get(aid)
                    if ak:
                        bridge_rows.append((gk, ak, wf))
            track_group_key[sid] = group_key_map[key]

        with conn_dwh.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                "INSERT INTO bridge_artista (artist_group_key, artist_key, weight_factor) VALUES %s",
                bridge_rows,
                page_size=2000
            )
        conn_dwh.commit()
        n_groups = next_group_key - 1
        print(f"  ✓  Bridge: {len(bridge_rows):,} coppie (group × artista), {n_groups:,} gruppi distinti")

        # 9. FACT_CHART_ENTRY (grana evento: brano × paese × data)
        sep("9. POPOLAMENTO FACT_CHART_ENTRY (grana evento, ~2,1M righe)")
        rec_fact_query = """
            SELECT
                ce.spotify_id,
                ce.country_code,
                ce.snapshot_date,
                ce.daily_rank,
                ce.popularity,
                ce.daily_movement,
                ce.weekly_movement,
                ROW_NUMBER() OVER (PARTITION BY ce.spotify_id, ce.country_code
                                   ORDER BY ce.snapshot_date)     AS days_on_chart,
                MIN(ce.daily_rank) OVER (PARTITION BY ce.spotify_id, ce.country_code
                                         ORDER BY ce.snapshot_date) AS peak_rank,
                t.album_id
            FROM chart_entry ce
            JOIN track t ON ce.spotify_id = t.spotify_id
        """
        conn_rec_stream = get_conn(DB_REC_NAME)
        cur_rec = conn_rec_stream.cursor(name="stream_fact")  # server-side cursor
        cur_rec.execute(rec_fact_query)
        cur_dwh = conn_dwh.cursor()

        batch = []
        total_inserted = 0
        total_skipped  = 0
        total_read     = 0

        print("  Streaming fatti dal Reconciled DB...")
        while True:
            rows = cur_rec.fetchmany(CHUNK_SIZE)
            if not rows:
                break
            total_read += len(rows)

            for r in rows:
                sid, ccode, sdt, daily_rank, popularity, daily_mov, weekly_mov, \
                    days_on_chart, peak_rank, album_id = r

                date_key         = int(sdt.strftime("%Y%m%d"))
                country_key      = dwh_countries.get(ccode)
                track_key        = dwh_tracks.get(sid)
                album_key        = dwh_albums.get(album_id)
                artist_group_key = track_group_key.get(sid)

                if not all([country_key, track_key, album_key, artist_group_key]):
                    total_skipped += 1
                    continue

                # n_countries_charted: bisect su array ordinato delle prime entry per paese
                n_countries_charted = bisect.bisect_right(track_min_dates.get(sid, []), sdt)

                # Una sola riga di fatto per evento (nessuna espansione N:M)
                batch.append((
                    date_key, country_key, track_key, artist_group_key, album_key,
                    daily_rank, popularity, daily_mov, weekly_mov,
                    1, days_on_chart, n_countries_charted, peak_rank,
                    51 - daily_rank  # performance_score: completamente additivo
                ))

            if len(batch) >= CHUNK_SIZE:
                psycopg2.extras.execute_values(
                    cur_dwh,
                    """INSERT INTO fact_chart_entry (
                         date_key, country_key, track_key, artist_group_key, album_key,
                         daily_rank, popularity, daily_movement, weekly_movement,
                         chart_presence, days_on_chart, n_countries_charted, peak_rank,
                         performance_score
                       ) VALUES %s""",
                    batch
                )
                total_inserted += len(batch)
                batch = []
                print(f"    → Fatti caricati: {total_inserted:,}...")

        if batch:
            psycopg2.extras.execute_values(
                cur_dwh,
                """INSERT INTO fact_chart_entry (
                     date_key, country_key, track_key, artist_group_key, album_key,
                     daily_rank, popularity, daily_movement, weekly_movement,
                     chart_presence, days_on_chart, n_countries_charted, peak_rank,
                     performance_score
                   ) VALUES %s""",
                batch
            )
            total_inserted += len(batch)

        conn_dwh.commit()
        cur_rec.close()
        conn_rec_stream.close()
        print(f"  ✓  Fatto: {total_inserted:,} righe (lette: {total_read:,}, saltate: {total_skipped:,})")

        # 10. VERIFICA INTEGRITÀ
        sep("10. VERIFICA INTEGRITÀ DWH")
        for t in ["dim_genere", "bridge_artista", "dim_tempo", "dim_paese",
                  "dim_traccia", "dim_artista", "dim_album", "fact_chart_entry"]:
            n = execute_query(conn_dwh, f"SELECT COUNT(*) FROM {t}")[0][0]
            print(f"  DWH: {t:<22} {n:>10,} righe")

        fact_sum = execute_query(conn_dwh, "SELECT SUM(daily_rank), SUM(performance_score) FROM fact_chart_entry")[0]
        sig_str  = f"{total_inserted}|{fact_sum[0]}|{fact_sum[1]}"
        cube_sig = hashlib.md5(sig_str.encode()).hexdigest()
        print(f"\n  Firma DWH: {cube_sig}")
        sep("ETL COMPLETATO CON SUCCESSO!")

    except Exception as e:
        conn_dwh.rollback()
        print(f"\n  ✗ Errore fatale: {e}", file=sys.stderr)
        raise
    finally:
        conn_rec.close()
        conn_dwh.close()

if __name__ == "__main__":
    run_etl()
