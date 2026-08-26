"""
04_enrich_genres.py — Arricchimento Generi Musicali da Music Info (Last.fm)
=============================================================================
Questo script:
1. Legge data/raw/Music Info.csv (50.684 tracce con spotify_id e tags Last.fm)
2. Estrae il genere normalizzato per ogni traccia (da colonna 'genre' o dal primo tag)
3. Aggiorna la tabella 'track' del Reconciled DB con il campo lastfm_genre
4. Deriva il genere dell'artista (per majority vote sulle sue tracce)
5. Aggiorna la tabella 'artist' del Reconciled DB con il campo lastfm_genre
6. Stampa statistiche di copertura

PREREQUISITO: Eseguire PRIMA questo script, POI rieseguire etl/pipeline.py
"""

import os
import re
from pathlib import Path
from collections import Counter

import pandas as pd
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from tqdm import tqdm

# ── Config ────────────────────────────────────────────────────────────────────
load_dotenv()

DB_HOST = os.getenv("DB_RECONCILED_HOST", "localhost")
DB_PORT = os.getenv("DB_RECONCILED_PORT", "5432")
DB_NAME = os.getenv("DB_RECONCILED_NAME", "spotify_reconciled")
DB_USER = os.getenv("DB_RECONCILED_USER", "postgres")
DB_PASS = os.getenv("DB_RECONCILED_PASSWORD", "Lollo")

RAW_PATH = Path("data/raw/Music Info.csv")

def sep(title="", width=70):
    print()
    print("─" * width)
    if title:
        print(f"  {title}")
        print("─" * width)

def get_conn():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASS
    )

# ── Mappa di Normalizzazione dei Generi ──────────────────────────────────────
# Ogni chiave è una sottostringa da cercare nel tag (case-insensitive).
# L'ordine conta: i match più specifici devono stare PRIMA di quelli generici.
GENRE_MAP = [
    # Metal (prima di Rock perché contiene "rock" spesso)
    (["metal", "metalcore", "nu_metal", "heavy_metal", "death_metal",
      "black_metal", "hard_rock", "doom", "thrash"],                       "Metal"),
    # K-Pop (prima di Pop)
    (["k-pop", "kpop", "k_pop", "korean pop", "korean"],                   "K-Pop"),
    # Hip-Hop / Rap
    (["hip_hop", "hip-hop", "rap", "trap", "drill", "grime",
      "drill_and_bass", "dirty_south", "crunk"],                           "Hip-Hop"),
    # R&B / Soul
    (["r&b", "rnb", "r_b", "soul", "neo_soul", "neo-soul",
      "funk", "rhythm_and_blues"],                                          "R&B"),
    # Electronic / Dance
    (["electronic", "edm", "house", "techno", "dance",
      "trance", "dubstep", "drum_and_bass", "drum and bass",
      "trip_hop", "electronica", "ambient", "synthpop", "chillout"],       "Electronic"),
    # Latin
    (["latin", "reggaeton", "salsa", "cumbia", "bachata",
      "urbano", "latin_pop", "bossa_nova", "samba"],                       "Latin"),
    # Afrobeats
    (["afrobeats", "afropop", "afro", "afro-pop", "afro_pop",
      "afroswing", "highlife", "juju"],                                     "Afrobeats"),
    # Country / Folk
    (["country", "folk", "americana", "bluegrass", "country_pop",
      "singer-songwriter", "acoustic"],                                     "Country/Folk"),
    # Jazz / Blues
    (["jazz", "blues", "swing", "bebop", "soul_jazz"],                     "Jazz/Blues"),
    # Classical
    (["classical", "opera", "orchestra", "symphony", "baroque",
      "chamber"],                                                           "Classical"),
    # Reggae / Dancehall
    (["reggae", "dancehall", "ska", "dub"],                                 "Reggae"),
    # Rock (generico, dopo i sottogeneri specifici)
    (["rock", "alternative", "indie", "grunge", "punk", "emo",
      "post-rock", "prog", "progressive_rock", "britpop"],                 "Rock"),
    # Pop (generico, dopo tutti i sottogeneri)
    (["pop", "teen_pop", "electropop"],                                     "Pop"),
]

# Mappa diretta per la colonna 'genre' già pre-processata nel CSV
DIRECT_GENRE_MAP = {
    "rnb": "R&B",
    "r&b": "R&B",
    "rock": "Rock",
    "pop": "Pop",
    "metal": "Metal",
    "hip hop": "Hip-Hop",
    "hip-hop": "Hip-Hop",
    "hiphop": "Hip-Hop",
    "rap": "Hip-Hop",
    "electronic": "Electronic",
    "dance": "Electronic",
    "country": "Country/Folk",
    "folk": "Country/Folk",
    "jazz": "Jazz/Blues",
    "blues": "Jazz/Blues",
    "classical": "Classical",
    "latin": "Latin",
    "reggaeton": "Latin",
    "k-pop": "K-Pop",
    "kpop": "K-Pop",
    "reggae": "Reggae",
    "afrobeats": "Afrobeats",
    "soul": "R&B",
    "funk": "R&B",
    "indie": "Rock",
    "alternative": "Rock",
    "punk": "Rock",
    "grunge": "Rock",
}


def normalize_genre(genre_col: str, tags_col: str) -> str | None:
    """
    Determina il genere normalizzato usando la colonna 'genre' (se disponibile)
    oppure il primo tag della colonna 'tags' come fallback.
    
    Returns:
        Genere normalizzato (stringa) oppure None se non determinabile.
    """
    # 1. Prova prima con la colonna genre pre-processata
    if pd.notna(genre_col) and str(genre_col).strip():
        raw = str(genre_col).strip().lower()
        if raw in DIRECT_GENRE_MAP:
            return DIRECT_GENRE_MAP[raw]
    
    # 2. Usa i tag Last.fm
    if pd.isna(tags_col) or not str(tags_col).strip():
        return None
    
    # Normalizza: sostituisci punteggiatura, lowercase
    tags_str = str(tags_col).lower().replace(";", ",")
    tag_list = [t.strip().replace(" ", "_") for t in tags_str.split(",")]
    
    # Controlla ogni tag secondo la mappa di priorità
    for tag in tag_list:
        for (keywords, mapped_genre) in GENRE_MAP:
            for kw in keywords:
                kw_norm = kw.replace(" ", "_")
                if kw_norm in tag or kw in tag.replace("_", " "):
                    return mapped_genre
    
    return "Other"


# ── MAIN ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    sep("ARRICCHIMENTO GENERI DA MUSIC INFO (LAST.FM)")

    # 1. Leggi il CSV
    sep("1. CARICAMENTO Music Info.csv")
    df = pd.read_csv(RAW_PATH, encoding="utf-8-sig", low_memory=False)
    print(f"  Righe totali:    {len(df):,}")
    print(f"  Colonne:         {list(df.columns)}")
    print(f"  spotify_id validi:  {df['spotify_id'].notna().sum():,}")
    print(f"  genre pre-filled:   {df['genre'].notna().sum():,}")
    print(f"  tags presenti:      {df['tags'].notna().sum():,}")

    # 2. Calcola il genere normalizzato per ogni riga
    sep("2. NORMALIZZAZIONE GENERI")
    df["genre_norm"] = df.apply(
        lambda row: normalize_genre(row.get("genre"), row.get("tags")), axis=1
    )
    
    # Rimuovi duplicati per spotify_id (teniamo il primo)
    df_clean = df.dropna(subset=["spotify_id"]).drop_duplicates(subset=["spotify_id"])
    print(f"  Tracce unique con spotify_id: {len(df_clean):,}")
    
    genre_dist = df_clean["genre_norm"].value_counts()
    print("\n  Distribuzione generi (Music Info):")
    for genre, count in genre_dist.items():
        pct = 100 * count / len(df_clean)
        print(f"    {genre:<20} {count:>6,}  ({pct:.1f}%)")

    # 3. Crea mappa spotify_id → genre_norm
    id_to_genre = dict(zip(df_clean["spotify_id"], df_clean["genre_norm"]))
    # Crea anche mappa artist_name → genre_norm (majority vote)
    artist_genres = df_clean.groupby("artist")["genre_norm"].apply(
        lambda x: Counter(x.dropna()).most_common(1)[0][0] if Counter(x.dropna()) else None
    ).to_dict()

    # 4. Connetti al Reconciled DB e aggiungi colonne se mancanti
    sep("3. AGGIORNAMENTO RECONCILED DB — track.lastfm_genre")
    conn = get_conn()
    cur = conn.cursor()

    # Aggiungi colonna lastfm_genre alla tabella track se non esiste
    cur.execute("""
        ALTER TABLE track 
        ADD COLUMN IF NOT EXISTS lastfm_genre VARCHAR(100);
    """)
    conn.commit()
    print("  ✓  Colonna lastfm_genre aggiunta a 'track' (se non esisteva)")

    # Leggi tutti i spotify_id dal Reconciled DB
    cur.execute("SELECT spotify_id FROM track")
    db_ids = [row[0] for row in cur.fetchall()]
    print(f"  Tracce nel Reconciled DB: {len(db_ids):,}")

    # Aggiorna i generi per le tracce matchate via spotify_id
    updates_track = []
    for sid in db_ids:
        genre = id_to_genre.get(sid)
        if genre:
            updates_track.append((genre, sid))
    
    if updates_track:
        psycopg2.extras.execute_batch(
            cur,
            "UPDATE track SET lastfm_genre = %s WHERE spotify_id = %s",
            updates_track,
            page_size=1000
        )
        conn.commit()
    
    coverage_track = len(updates_track) / len(db_ids) * 100 if db_ids else 0
    print(f"  ✓  Tracce aggiornate via spotify_id: {len(updates_track):,} / {len(db_ids):,} ({coverage_track:.1f}%)")

    # 5. Aggiorna artisti via majority vote (per tracce non matchate via ID)
    sep("4. AGGIORNAMENTO RECONCILED DB — artist.lastfm_genre")
    cur.execute("""
        ALTER TABLE artist
        ADD COLUMN IF NOT EXISTS lastfm_genre VARCHAR(100);
    """)
    conn.commit()
    print("  ✓  Colonna lastfm_genre aggiunta a 'artist' (se non esisteva)")

    # Prima: deriva il genere dell'artista dal genere delle sue tracce (già nel DB)
    cur.execute("""
        SELECT a.artist_id, a.name
        FROM artist a
    """)
    db_artists = cur.fetchall()
    print(f"  Artisti nel Reconciled DB: {len(db_artists):,}")

    updates_artist = []
    for artist_id, artist_name in db_artists:
        # Cerca il genere dell'artista nella mappa da Music Info
        genre = artist_genres.get(artist_name)
        if genre:
            updates_artist.append((genre, artist_id))
    
    if updates_artist:
        psycopg2.extras.execute_batch(
            cur,
            "UPDATE artist SET lastfm_genre = %s WHERE artist_id = %s",
            updates_artist,
            page_size=1000
        )
        conn.commit()
    
    coverage_artist = len(updates_artist) / len(db_artists) * 100 if db_artists else 0
    print(f"  ✓  Artisti aggiornati: {len(updates_artist):,} / {len(db_artists):,} ({coverage_artist:.1f}%)")

    # 6. Per artisti senza match diretto, deriva il genere dalle tracce già presenti in DB
    sep("5. FALLBACK — Artista senza match: genere derivato dalle sue tracce")
    cur.execute("""
        UPDATE artist a
        SET lastfm_genre = sub.genre
        FROM (
            SELECT ta.artist_id,
                   MODE() WITHIN GROUP (ORDER BY t.lastfm_genre) AS genre
            FROM track_artist ta
            JOIN track t ON ta.spotify_id = t.spotify_id
            WHERE t.lastfm_genre IS NOT NULL
            GROUP BY ta.artist_id
        ) sub
        WHERE a.artist_id = sub.artist_id
          AND a.lastfm_genre IS NULL
    """)
    fallback_count = cur.rowcount
    conn.commit()
    print(f"  ✓  Artisti aggiornati via fallback tracce: {fallback_count:,}")

    # 7. Statistiche finali
    sep("6. STATISTICHE FINALI")
    cur.execute("SELECT COUNT(*), COUNT(lastfm_genre) FROM track")
    tot_t, cov_t = cur.fetchone()
    print(f"  Copertura track:  {cov_t:,} / {tot_t:,} ({100*cov_t/tot_t:.1f}%)")
    
    cur.execute("SELECT COUNT(*), COUNT(lastfm_genre) FROM artist")
    tot_a, cov_a = cur.fetchone()
    print(f"  Copertura artist: {cov_a:,} / {tot_a:,} ({100*cov_a/tot_a:.1f}%)")
    
    cur.execute("""
        SELECT lastfm_genre, COUNT(*) 
        FROM track 
        WHERE lastfm_genre IS NOT NULL
        GROUP BY lastfm_genre 
        ORDER BY COUNT(*) DESC
    """)
    print("\n  Distribuzione generi nel Reconciled DB (track):")
    for row in cur.fetchall():
        print(f"    {row[0]:<20} {row[1]:>6,}")
    
    cur.close()
    conn.close()
    
    sep("COMPLETATO")
    print("  ✓  Ora riesegui: python etl/pipeline.py per aggiornare il Data Warehouse.")
