"""
05_fetch_spotify_genres.py — Recupero Generi Artisti da Spotify Web API
========================================================================
Strategia:
  1. Carica tutti gli artisti (nome) dal Reconciled DB
  2. Per ogni artista senza genere, chiama Spotify Search API:
       GET /v1/search?q=artist:"<nome>"&type=artist&limit=1
  3. Se il match è abbastanza buono (similarità nome), salva i genres[]
  4. Normalizza il primo genere Spotify verso le nostre categorie standard
  5. Aggiorna artist.lastfm_genre nel Reconciled DB

Features:
  - Checkpoint su file CSV (riprende dove si era fermato)
  - Retry automatico su 429 (Too Many Requests) con Retry-After
  - Token refresh automatico quando scade (ogni 3600s)
  - Stima del tempo rimanente

PREREQUISITO: aggiungere nel .env:
    SPOTIFY_CLIENT_ID=...
    SPOTIFY_CLIENT_SECRET=...

ESECUZIONE:
    .venv/bin/python notebooks/05_fetch_spotify_genres.py
"""

import os
import re
import time
import csv
import json
from pathlib import Path
from datetime import datetime, timedelta

import requests
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
SPOTIFY_CLIENT_ID     = os.getenv("SPOTIFY_CLIENT_ID", "")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET", "")

DB_HOST = os.getenv("DB_RECONCILED_HOST", "localhost")
DB_PORT = os.getenv("DB_RECONCILED_PORT", "5432")
DB_NAME = os.getenv("DB_RECONCILED_NAME", "spotify_reconciled")
DB_USER = os.getenv("DB_RECONCILED_USER", "postgres")
DB_PASS = os.getenv("DB_RECONCILED_PASSWORD", "Lollo")

CHECKPOINT_FILE = Path("data/raw/spotify_genres_checkpoint.csv")
REQUEST_DELAY   = 0.12   # ~8 req/sec (Spotify consente ~10/sec con CC)

def sep(title="", width=70):
    print(f"\n{'─'*width}")
    if title:
        print(f"  {title}")
        print(f"{'─'*width}")

def get_conn():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASS
    )

# ── Spotify Auth ──────────────────────────────────────────────────────────────
class SpotifyClient:
    TOKEN_URL = "https://accounts.spotify.com/api/token"
    API_BASE  = "https://api.spotify.com/v1"
    
    def __init__(self, client_id: str, client_secret: str):
        self.client_id     = client_id
        self.client_secret = client_secret
        self._token        = None
        self._token_expiry = 0

    def _refresh_token(self):
        resp = requests.post(
            self.TOKEN_URL,
            data={"grant_type": "client_credentials"},
            auth=(self.client_id, self.client_secret),
            timeout=10
        )
        resp.raise_for_status()
        data = resp.json()
        self._token        = data["access_token"]
        self._token_expiry = time.time() + data["expires_in"] - 30  # 30s di margine
        print(f"  🔑 Token aggiornato (scade alle {datetime.fromtimestamp(self._token_expiry).strftime('%H:%M:%S')})")

    def _headers(self):
        if time.time() >= self._token_expiry:
            self._refresh_token()
        return {"Authorization": f"Bearer {self._token}"}

    def search_artist(self, name: str) -> dict | None:
        """
        Cerca un artista per nome su Spotify. Restituisce il primo risultato
        o None se non trovato. Gestisce automaticamente il rate limiting.
        """
        for attempt in range(5):
            try:
                resp = requests.get(
                    f"{self.API_BASE}/search",
                    params={"q": f'artist:"{name}"', "type": "artist", "limit": 1},
                    headers=self._headers(),
                    timeout=10
                )
                if resp.status_code == 429:
                    wait = int(resp.headers.get("Retry-After", 5))
                    print(f"\n  ⚠️  Rate limit! Attesa {wait}s...")
                    time.sleep(wait)
                    continue
                if resp.status_code == 401:
                    self._refresh_token()
                    continue
                if resp.status_code != 200:
                    return None
                
                items = resp.json().get("artists", {}).get("items", [])
                return items[0] if items else None
            
            except requests.RequestException as e:
                print(f"\n  Errore rete ({attempt+1}/5): {e}")
                time.sleep(2 ** attempt)
        return None


# ── Genre Normalizzazione ─────────────────────────────────────────────────────
# Mappa Spotify raw genres → nostre categorie standard
GENRE_NORMALIZATION = [
    # K-Pop (prima di Pop)
    (["k-pop", "kpop", "korean", "k pop", "j-pop", "j pop",
      "anime", "j-rock"],                                                   "K-Pop"),
    # Metal
    (["metal", "metalcore", "nu-metal", "heavy metal", "death metal",
      "black metal", "hard rock", "doom metal", "thrash", "djent",
      "post-hardcore", "screamo"],                                          "Metal"),
    # Hip-Hop
    (["hip hop", "hip-hop", "rap", "trap", "drill", "grime",
      "uk rap", "cloud rap", "gangster rap", "crunk", "boom bap",
      "dirty south", "afro trap"],                                          "Hip-Hop"),
    # R&B / Soul
    (["r&b", "soul", "neo soul", "funk", "contemporary r&b",
      "rhythm and blues", "urban contemporary", "quiet storm"],             "R&B"),
    # Electronic / Dance
    (["edm", "electronic", "house", "techno", "trance", "dance pop",
      "dance", "dubstep", "drum and bass", "dnb", "electronica",
      "ambient", "synthpop", "electro", "chillwave", "downtempo",
      "trip hop", "future bass", "lo-fi"],                                  "Electronic"),
    # Latin
    (["latin", "reggaeton", "latin pop", "salsa", "bachata",
      "cumbia", "urbano latino", "latin hip hop", "tropical",
      "musica mexicana", "regional mexicano", "corrido", "norteño",
      "sertanejo", "pagode", "mpb", "bossa nova", "latin arena pop"],       "Latin"),
    # Afrobeats
    (["afrobeats", "afropop", "afro pop", "afro", "afro-soul",
      "highlife", "afroswing", "coupe decale", "gengjur"],                  "Afrobeats"),
    # Country / Folk
    (["country", "folk", "americana", "bluegrass", "country pop",
      "country road", "singer-songwriter", "acoustic"],                     "Country/Folk"),
    # Jazz / Blues
    (["jazz", "blues", "swing", "bebop", "gospel", "soul blues",
      "chicago blues", "smooth jazz"],                                       "Jazz/Blues"),
    # Classical
    (["classical", "opera", "orchestra", "symphony", "baroque",
      "chamber music", "contemporary classical"],                           "Classical"),
    # Reggae
    (["reggae", "dancehall", "ska", "dub", "rocksteady"],                   "Reggae"),
    # Rock (dopo metalcore, punk, ecc.)
    (["rock", "alternative", "indie", "grunge", "punk", "emo",
      "post-rock", "progressive rock", "garage rock", "britpop",
      "shoegaze", "new wave", "gothic rock"],                                "Rock"),
    # Pop (generico, dopo tutti i sottogeneri)
    (["pop", "teen pop", "electropop", "art pop", "adult standards",
      "europop", "soft rock"],                                               "Pop"),
]

def normalize_spotify_genre(genres: list[str]) -> str | None:
    """Normalizza i generi Spotify in una delle nostre categorie."""
    if not genres:
        return None
    genres_lower = [g.lower() for g in genres]
    for (keywords, category) in GENRE_NORMALIZATION:
        for kw in keywords:
            for g in genres_lower:
                if kw in g:
                    return category
    return "Other"


def name_similarity(a: str, b: str) -> float:
    """Similarità semplice tra due nomi (lowercase, strippati)."""
    a, b = a.strip().lower(), b.strip().lower()
    if a == b:
        return 1.0
    # Controlla se uno contiene l'altro
    if a in b or b in a:
        return 0.8
    return 0.0


# ── MAIN ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    sep("RECUPERO GENERI ARTISTI DA SPOTIFY WEB API")
    
    if not SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_ID == "YOUR_CLIENT_ID_HERE":
        print("  ✗  ERRORE: SPOTIFY_CLIENT_ID non configurato nel .env!")
        print("     Aggiungi SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET al file .env")
        exit(1)
    
    # 1. Carica checkpoint esistente
    already_processed = {}
    if CHECKPOINT_FILE.exists():
        with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                already_processed[row["artist_id"]] = row["genre"]
        print(f"  📂 Checkpoint caricato: {len(already_processed):,} artisti già processati")
    else:
        # Crea il file con header
        with open(CHECKPOINT_FILE, "w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["artist_id", "name", "spotify_genres_raw", "genre"])

    # 2. Carica artisti da DB (solo quelli senza genere e non già nel checkpoint)
    sep("1. CARICAMENTO ARTISTI")
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT artist_id, name FROM artist ORDER BY name")
    all_artists = cur.fetchall()
    
    to_process = [
        (aid, name) for aid, name in all_artists
        if aid not in already_processed
    ]
    
    print(f"  Totale artisti nel DB:        {len(all_artists):,}")
    print(f"  Già processati (checkpoint):  {len(already_processed):,}")
    print(f"  Da processare ora:            {len(to_process):,}")
    
    if not to_process:
        print("\n  ✓  Tutti gli artisti già processati! Procedo con l'aggiornamento DB.")
    else:
        stima_secondi = len(to_process) * (REQUEST_DELAY + 0.15)
        stima_minuti  = stima_secondi / 60
        print(f"  ⏱️  Stima durata: {stima_minuti:.0f} minuti ({stima_secondi:.0f}s)")
        print(f"     Velocità: ~{1/REQUEST_DELAY:.0f} req/s")

    # 3. Chiedi conferma prima di partire
    if to_process:
        input(f"\n  Premi INVIO per avviare (o CTRL+C per annullare)... ")

    # 4. Fetching da Spotify API
    if to_process:
        sep("2. FETCHING DA SPOTIFY API")
        client = SpotifyClient(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET)
        client._refresh_token()
        
        checkpoint_handle = open(CHECKPOINT_FILE, "a", encoding="utf-8", newline="")
        writer = csv.writer(checkpoint_handle)
        
        matched    = 0
        not_found  = 0
        start_time = time.time()
        
        for i, (artist_id, artist_name) in enumerate(to_process):
            # Stima tempo rimanente
            if i > 0 and i % 50 == 0:
                elapsed   = time.time() - start_time
                rate      = i / elapsed
                remaining = (len(to_process) - i) / rate
                pct       = 100 * i / len(to_process)
                eta       = datetime.now() + timedelta(seconds=remaining)
                print(f"  [{pct:5.1f}%] {i:,}/{len(to_process):,} | "
                      f"Matched: {matched:,} | "
                      f"ETA: {eta.strftime('%H:%M:%S')} "
                      f"(tra {remaining/60:.0f}min)")
            
            # Chiama Spotify Search
            result = client.search_artist(artist_name)
            
            if result and name_similarity(artist_name, result.get("name", "")) >= 0.8:
                raw_genres = result.get("genres", [])
                genre      = normalize_spotify_genre(raw_genres)
                writer.writerow([artist_id, artist_name, "|".join(raw_genres), genre or ""])
                if genre:
                    matched += 1
            else:
                writer.writerow([artist_id, artist_name, "", ""])
                not_found += 1
            
            time.sleep(REQUEST_DELAY)
        
        checkpoint_handle.close()
        elapsed_total = time.time() - start_time
        
        print(f"\n  ✓  Completato in {elapsed_total/60:.1f} minuti")
        print(f"     Artisti con genere trovato: {matched:,}")
        print(f"     Non trovati/senza match:    {not_found:,}")

    # 5. Ricarica checkpoint completo e aggiorna DB
    sep("3. AGGIORNAMENTO RECONCILED DB")
    
    updates = []
    with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            genre = row.get("genre", "").strip()
            if genre:
                updates.append((genre, row["artist_id"]))
    
    print(f"  Artisti con genere da aggiornare: {len(updates):,}")
    
    if updates:
        # Assicura che la colonna esista
        cur.execute("ALTER TABLE artist ADD COLUMN IF NOT EXISTS lastfm_genre VARCHAR(100);")
        conn.commit()
        
        psycopg2.extras.execute_batch(
            cur,
            "UPDATE artist SET lastfm_genre = %s WHERE artist_id = %s",
            updates,
            page_size=1000
        )
        conn.commit()
        print(f"  ✓  {len(updates):,} artisti aggiornati nel DB")
    
    # Statistiche finali
    cur.execute("SELECT COUNT(*), COUNT(lastfm_genre) FROM artist")
    tot, cov = cur.fetchone()
    print(f"\n  Copertura finale: {cov:,} / {tot:,} ({100*cov/tot:.1f}%)")
    
    cur.execute("""
        SELECT lastfm_genre, COUNT(*) FROM artist
        WHERE lastfm_genre IS NOT NULL
        GROUP BY lastfm_genre ORDER BY COUNT(*) DESC
    """)
    print("\n  Distribuzione generi:")
    for row in cur.fetchall():
        print(f"    {row[0]:<20} {row[1]:>6,}")
    
    # 6. Applica fallback: artisti senza match da Spotify → genere da tracce
    sep("4. FALLBACK — Artista senza genere Spotify: deriva dalle sue tracce")
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
    print(f"  ✓  {fallback_count:,} artisti aggiornati via fallback tracce")
    
    cur.execute("SELECT COUNT(*), COUNT(lastfm_genre) FROM artist")
    tot, cov = cur.fetchone()
    print(f"\n  Copertura TOTALE (Spotify + fallback): {cov:,} / {tot:,} ({100*cov/tot:.1f}%)")
    
    cur.close()
    conn.close()
    
    sep("COMPLETATO")
    print("  ✓  Ora riesegui: python etl/pipeline.py per aggiornare il Data Warehouse.")
