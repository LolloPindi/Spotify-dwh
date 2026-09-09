import hashlib
from pathlib import Path

import pandas as pd

RAW_PATH    = Path("data/raw/universal_top_spotify_songs.csv")
CLEANED_DIR = Path("data/cleaned")
CLEANED_DIR.mkdir(exist_ok=True)

report_lines = []

def log(msg=""):
    print(msg)
    report_lines.append(msg)

def sep(title="", width=70):
    log()
    log("-" * width)
    if title:
        log(f"  {title}")
        log("-" * width)

sep("1. CARICAMENTO")
df = pd.read_csv(RAW_PATH, parse_dates=["snapshot_date", "album_release_date"])
total_original = len(df)
log(f"  Righe originali: {total_original:,}")
log(f"  Colonne:         {df.shape[1]}")

sep("2. PRESERVAZIONE RIGHE GLOBALI  [country=NULL -> 'GL']")
log("  Le righe con country=NULL rappresentano la classifica Top Global di Spotify.")
log("  Le mappiamo al codice sintetico 'GL' per mantenerle nel DWH.")

n_before = len(df)
df["country"] = df["country"].fillna("GL")
n_dropped = 0
log(f"  Righe eliminate: {n_dropped:,}")
log(f"  Righe rimanenti: {len(df):,}")

sep("3. RIMOZIONE RIGHE SENZA NAME O ARTISTS  [MCAR]")
log("  name e artists sono attributi essenziali della traccia.")
log("  Il volume e' trascurabile (<0.01%) - classificazione MCAR.")

n_before = len(df)
df = df[df["name"].notna() & df["artists"].notna()].copy()
n_dropped = n_before - len(df)
log(f"  Righe eliminate: {n_dropped:,}  ({100*n_dropped/n_before:.4f}%)")
log(f"  Righe rimanenti: {len(df):,}")

sep("4. VERIFICA GRAIN  (spotify_id, country, snapshot_date)")
dupes = df.duplicated(subset=["spotify_id", "country", "snapshot_date"]).sum()
log(f"  Duplicati sul grain: {dupes:,}")
if dupes == 0:
    log("  Grain integro - nessuna deduplicazione necessaria.")
else:
    log("  Deduplicazione necessaria - tengo l'ultima occorrenza.")
    df = df.drop_duplicates(subset=["spotify_id", "country", "snapshot_date"], keep="last")

sep("5. VALIDAZIONE RANGE MISURE")

checks = {
    "daily_rank":       (1, 50),
    "popularity":       (0, 100),
    "danceability":     (0.0, 1.0),
    "energy":           (0.0, 1.0),
    "valence":          (0.0, 1.0),
    "acousticness":     (0.0, 1.0),
    "speechiness":      (0.0, 1.0),
    "liveness":         (0.0, 1.0),
    "instrumentalness": (0.0, 1.0),
}

all_ok = True
for col, (lo, hi) in checks.items():
    out = ((df[col] < lo) | (df[col] > hi)).sum()
    status = "OK" if out == 0 else f"{out:,} valori fuori range"
    log(f"  {col:<25} [{lo}, {hi}]  ->  {status}")
    if out > 0:
        all_ok = False

if all_ok:
    log("\n  Tutti i range sono validi.")

sep("6. VALIDAZIONE key E mode")
bad_key  = (~df["key"].between(0, 11)).sum()
bad_mode = (~df["mode"].isin([0, 1])).sum()
log(f"  key  fuori [0,11]: {bad_key:,}   {'OK' if bad_key==0 else 'WARN'}")
log(f"  mode fuori [0,1]:  {bad_mode:,}   {'OK' if bad_mode==0 else 'WARN'}")

sep("7. OUTLIER duration_ms")
log("  Soglie: < 30s (30_000 ms) o > 15min (900_000 ms) sono anomalie.")
short = (df["duration_ms"] < 30_000).sum()
long_ = (df["duration_ms"] > 900_000).sum()
log(f"  Brani < 30s:   {short:,}")
log(f"  Brani > 15min: {long_:,}")
if short == 0 and long_ == 0:
    log("  Nessun outlier su duration_ms.")
else:
    log("  Righe con duration anomala marcate ma NON eliminate:")
    log("  potrebbero essere intro/outro legittimi o brani di spoken word.")
    df["duration_flag"] = (df["duration_ms"] < 30_000) | (df["duration_ms"] > 900_000)

sep("8. GESTIONE NULL SU ALBUM  [MAR]")
log("  album_name e album_release_date sono NULL per ~800 righe.")
log("  Classificazione MAR: dipende dal tipo di release")
log("  (singoli non pubblicati come album formale su alcune piattaforme).")
log("  Strategia: NON eliminiamo le righe - la traccia esiste e ha rank.")
log("  Popoliamo album con valori sentinella: name='[Unknown Album]'.")
n_no_album = df["album_name"].isna().sum()
log(f"  Tracce senza album_name: {n_no_album:,} -> sostituito con '[Unknown Album]'")
df["album_name"] = df["album_name"].fillna("[Unknown Album]")

sep("9. GENERAZIONE ID SINTETICI")
log("  Il CSV non ha album_id ne' artist_id - li generiamo come hash")
log("  deterministici (MD5 troncato a 22 char) per garantire:")
log("  - Idempotenza: lo stesso nome produce sempre lo stesso ID")
log("  - Unicita' pratica: collisioni MD5 troncato sono trascurabili su questo volume")

def make_id(s: str) -> str:
    return hashlib.md5(s.encode()).hexdigest()[:22]

df["album_id"] = (
    df["album_name"].fillna("") + "|" +
    df["album_release_date"].astype(str).fillna("")
).apply(make_id)

log("  album_id generato come MD5(album_name|release_date)[:22]")

sep("10. ESTRAZIONE TABELLE NORMALIZZATE")

albums = (
    df[["album_id", "album_name", "album_release_date"]]
    .drop_duplicates("album_id")
    .rename(columns={"album_name": "name", "album_release_date": "release_date"})
    .copy()
)
albums["album_type"] = "unknown"
log(f"  Album unici:  {len(albums):,}")

tracks = (
    df[["spotify_id", "name", "album_id", "duration_ms", "is_explicit",
        "key", "mode", "danceability", "energy", "valence", "acousticness",
        "speechiness", "liveness", "instrumentalness", "tempo",
        "loudness", "time_signature"]]
    .drop_duplicates("spotify_id")
    .copy()
)
log(f"  Tracce uniche: {len(tracks):,}")

log("  Splitting campo 'artists'...")

artist_records = []
track_artist_records = []

for _, row in df[["spotify_id", "artists"]].drop_duplicates("spotify_id").iterrows():
    raw = str(row["artists"])
    names = [a.strip() for a in raw.split(", ") if a.strip()]
    for name in names:
        artist_id = make_id(name)
        artist_records.append({"artist_id": artist_id, "name": name})
        track_artist_records.append({
            "spotify_id": row["spotify_id"],
            "artist_id": artist_id
        })

artists = (
    pd.DataFrame(artist_records)
    .drop_duplicates("artist_id")
    .reset_index(drop=True)
)

track_artist = (
    pd.DataFrame(track_artist_records)
    .drop_duplicates(["spotify_id", "artist_id"])
    .reset_index(drop=True)
)

log(f"  Artisti unici:       {len(artists):,}")
log(f"  Relazioni track->artist: {len(track_artist):,}")

chart_entries = df[[
    "spotify_id", "country", "snapshot_date",
    "daily_rank", "daily_movement", "weekly_movement", "popularity"
]].copy()
log(f"  Chart entries: {len(chart_entries):,}")

sep("11. RIEPILOGO BEFORE / AFTER")
total_final = len(chart_entries)
eliminated  = total_original - total_final
log(f"  Righe originali:  {total_original:,}")
log(f"  Righe eliminate:  {eliminated:,}  ({100*eliminated/total_original:.2f}%)")
log(f"  Righe finali:     {total_final:,}  ({100*total_final/total_original:.2f}%)")
log()
log(f"  Tracce uniche:    {len(tracks):,}")
log(f"  Artisti unici:    {len(artists):,}")
log(f"  Album unici:      {len(albums):,}")
log(f"  Paesi:            {chart_entries['country'].nunique()}")
log(f"  Giorni:           {chart_entries['snapshot_date'].nunique()}")

sep("12. EXPORT CSV CLEANED")
tracks.to_csv(CLEANED_DIR / "tracks.csv", index=False)
artists.to_csv(CLEANED_DIR / "artists.csv", index=False)
track_artist.to_csv(CLEANED_DIR / "track_artist.csv", index=False)
albums.to_csv(CLEANED_DIR / "albums.csv", index=False)
chart_entries.to_csv(CLEANED_DIR / "chart_entries.csv", index=False)
log(f"  File salvati in {CLEANED_DIR}/")
log("  tracks.csv, artists.csv, track_artist.csv, albums.csv, chart_entries.csv")

report_path = CLEANED_DIR / "cleaning_report.txt"
report_path.write_text("\n".join(report_lines), encoding="utf-8")
log()
log(f"  Report salvato in {report_path}")
sep()
log("  Cleaning completato. Prossimo step: 03_load_reconciled.py")
log()
