
import os
from pathlib import Path
 
import pandas as pd
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from tqdm import tqdm
 
# ── Config ────────────────────────────────────────────────────────────────────
load_dotenv()
 
DB_HOST = os.getenv("DB_RECONCILED_HOST", "localhost")
DB_PORT = os.getenv("DB_RECONCILED_PORT", "5432")
DB_NAME = os.getenv("DB_RECONCILED_NAME", "spotify_reconciled")
DB_USER = os.getenv("DB_RECONCILED_USER", "postgres")
DB_PASS = os.getenv("DB_RECONCILED_PASSWORD", "")
 
CLEANED = Path("data/cleaned")
CHUNK   = 10_000   # righe per batch
CUSTOM_NA = ['', 'NaN', 'NULL', 'None', 'nan', 'null']
 
# ── Connessione SQLAlchemy (per query di verifica) ────────────────────────────
conn_str = f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
engine   = create_engine(conn_str, pool_pre_ping=True)
 
def get_pg_conn():
    """Connessione psycopg2 diretta — più efficiente per bulk insert."""
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASS
    )
 
def sep(title="", w=70):
    print()
    print("─" * w)
    if title:
        print(f"  {title}")
        print("─" * w)
 
def load_table(df: pd.DataFrame, table: str, chunksize: int = CHUNK):
    """
    Carica un DataFrame in PostgreSQL usando execute_values di psycopg2.
    Molto più efficiente di to_sql(method='multi') — nessun limite di parametri.
    """
    cols = list(df.columns)
    col_str = ", ".join(cols)
    total = len(df)
    n_chunks = (total // chunksize) + 1
    print(f"  → {table}: {total:,} righe in {n_chunks} batch da {chunksize:,}")
 
    conn = get_pg_conn()
    cur  = conn.cursor()
    try:
        for i in tqdm(range(0, total, chunksize), desc=f"    {table}", unit="chunk"):
            chunk = df.iloc[i : i + chunksize]
            # Converti None/NaN/NaT in None Python
            rows = [
                tuple(None if (v is None or pd.isna(v)) else v
                      for v in row)
                for row in chunk.itertuples(index=False, name=None)
            ]
            psycopg2.extras.execute_values(
                cur,
                f"INSERT INTO {table} ({col_str}) VALUES %s",
                rows,
                page_size=chunksize
            )
        conn.commit()
        print(f"  ✓  {table} caricata.")
    except Exception as e:
        conn.rollback()
        print(f"  ✗  Errore su {table}: {e}")
        raise
    finally:
        cur.close()
        conn.close()
 
# ── Verifica connessione ──────────────────────────────────────────────────────
sep("VERIFICA CONNESSIONE")
try:
    with engine.connect() as conn:
        result = conn.execute(text("SELECT version()"))
        print(f"  {result.fetchone()[0][:60]}")
    print("  ✓  Connessione OK")
except Exception as e:
    print(f"  ✗  Errore di connessione: {e}")
    print("     Verifica che PostgreSQL sia attivo e che .env sia configurato.")
    raise SystemExit(1)
 
# ── Pulizia tabelle (per riesecuzione idempotente) ────────────────────────────
sep("PULIZIA TABELLE (idempotenza)")
print("  Svuoto le tabelle nell'ordine corretto (rispetto FK)...")
with engine.begin() as conn:
    for t in ["chart_entry", "track_artist", "track", "album", "artist",
              "country", "snapshot_date"]:
        conn.execute(text(f"TRUNCATE TABLE {t} CASCADE"))
        print(f"  ✓  {t} svuotata")
 
# ── 1. SNAPSHOT_DATE ──────────────────────────────────────────────────────────
sep("1. SNAPSHOT_DATE")
chart_raw = pd.read_csv(CLEANED / "chart_entries.csv", parse_dates=["snapshot_date"], keep_default_na=False, na_values=CUSTOM_NA)
dates = chart_raw["snapshot_date"].dropna().unique()
 
date_df = pd.DataFrame({"snapshot_date": pd.to_datetime(dates)})
date_df["year"]         = date_df["snapshot_date"].dt.year
date_df["month"]        = date_df["snapshot_date"].dt.month
date_df["quarter"]      = date_df["snapshot_date"].dt.quarter
date_df["week_of_year"] = date_df["snapshot_date"].dt.isocalendar().week.astype(int)
date_df["day_of_week"]  = date_df["snapshot_date"].dt.dayofweek + 1  # 1=Lun
 
def get_season(month):
    if month in (12, 1, 2):  return "Winter"
    if month in (3, 4, 5):   return "Spring"
    if month in (6, 7, 8):   return "Summer"
    return "Autumn"
 
date_df["season"] = date_df["month"].apply(get_season)
date_df["snapshot_date"] = date_df["snapshot_date"].dt.date
 
load_table(date_df, "snapshot_date", chunksize=1000)
 
# ── 2. COUNTRY (codici dal dataset — senza arricchimento per ora) ─────────────
sep("2. COUNTRY")
print("  Nota: arricchimento geografico (continent, income_group, GDP)")
print("  sarà aggiunto nella fase di ETL verso il DWH.")
print("  Qui carichiamo solo i codici ISO-2 presenti nel dataset.")
 
countries = sorted(chart_raw["country"].dropna().unique())
country_df = pd.DataFrame({
    "country_code": countries,
    "country_name": countries,   # placeholder — verrà arricchito nell'ETL
    "continent":    "Unknown",
    "subregion":    None,
    "language_primary": None,
    "income_group": None,
    "population":   None,
    "gdp_per_capita": None,
})
load_table(country_df, "country", chunksize=200)
 
# ── 3. ARTIST ─────────────────────────────────────────────────────────────────
sep("3. ARTIST")
artists = pd.read_csv(CLEANED / "artists.csv", keep_default_na=False, na_values=CUSTOM_NA)
n_before = len(artists)
artists = artists[artists["name"].notna() & (artists["name"].str.strip() != "")]
print(f"  Artisti con nome NULL rimossi: {n_before - len(artists)}")
load_table(artists, "artist")
 
# ── 4. ALBUM ──────────────────────────────────────────────────────────────────
sep("4. ALBUM")
albums = pd.read_csv(CLEANED / "albums.csv", parse_dates=["release_date"], keep_default_na=False, na_values=CUSTOM_NA)
# album_type: lo schema prevede un CHECK — impostiamo NULL per ora
albums["album_type"] = None
albums["release_date"] = albums["release_date"].where(albums["release_date"].notna(), None)
load_table(albums, "album")
 
# ── 5. TRACK ─────────────────────────────────────────────────────────────────
sep("5. TRACK")
tracks = pd.read_csv(CLEANED / "tracks.csv", keep_default_na=False, na_values=CUSTOM_NA)
# Rinomina colonne per matchare lo schema SQL
tracks = tracks.rename(columns={"name": "name"})
# Converti is_explicit in bool
tracks["is_explicit"] = tracks["is_explicit"].astype(bool)
load_table(tracks, "track")
 
# ── 6. TRACK_ARTIST ──────────────────────────────────────────────────────────
sep("6. TRACK_ARTIST")
track_artist = pd.read_csv(CLEANED / "track_artist.csv", keep_default_na=False, na_values=CUSTOM_NA)
load_table(track_artist, "track_artist")
 
# ── 7. CHART_ENTRY ────────────────────────────────────────────────────────────
sep("7. CHART_ENTRY  (2M+ righe — il più lento)")
chart = pd.read_csv(CLEANED / "chart_entries.csv", parse_dates=["snapshot_date"], keep_default_na=False, na_values=CUSTOM_NA)
chart["snapshot_date"] = chart["snapshot_date"].dt.date
chart = chart.rename(columns={"country": "country_code"})
load_table(chart, "chart_entry", chunksize=CHUNK)
 
# ── Verifica integrità finale ──────────────────────────────────────────────────
sep("VERIFICA INTEGRITÀ FINALE")
with engine.connect() as conn:
    queries = {
        "snapshot_date":  "SELECT COUNT(*) FROM snapshot_date",
        "country":        "SELECT COUNT(*) FROM country",
        "artist":         "SELECT COUNT(*) FROM artist",
        "album":          "SELECT COUNT(*) FROM album",
        "track":          "SELECT COUNT(*) FROM track",
        "track_artist":   "SELECT COUNT(*) FROM track_artist",
        "chart_entry":    "SELECT COUNT(*) FROM chart_entry",
    }
    for table, q in queries.items():
        n = conn.execute(text(q)).scalar()
        print(f"  {table:<20} {n:>10,} righe")
 
    # Verifica zero orphan keys
    print()
    print("  Verifica orphan keys...")
    orphan_track = conn.execute(text(
        "SELECT COUNT(*) FROM chart_entry ce "
        "LEFT JOIN track t ON ce.spotify_id = t.spotify_id "
        "WHERE t.spotify_id IS NULL"
    )).scalar()
    orphan_country = conn.execute(text(
        "SELECT COUNT(*) FROM chart_entry ce "
        "LEFT JOIN country c ON ce.country_code = c.country_code "
        "WHERE c.country_code IS NULL"
    )).scalar()
    orphan_date = conn.execute(text(
        "SELECT COUNT(*) FROM chart_entry ce "
        "LEFT JOIN snapshot_date sd ON ce.snapshot_date = sd.snapshot_date "
        "WHERE sd.snapshot_date IS NULL"
    )).scalar()
 
    print(f"  Orphan track FK:   {orphan_track}   {'✓' if orphan_track==0 else '⚠️'}")
    print(f"  Orphan country FK: {orphan_country}   {'✓' if orphan_country==0 else '⚠️'}")
    print(f"  Orphan date FK:    {orphan_date}   {'✓' if orphan_date==0 else '⚠️'}")
 
sep()
print("  Reconciled DB popolato. Prossimo step: design star schema.")
print()
