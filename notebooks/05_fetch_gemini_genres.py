"""
05_fetch_gemini_genres.py — Classificazione Generi Artisti tramite Gemini API (Optimized 250-Batch)
=============================================================================================
Questo script utilizza models/gemini-flash-latest (gemini-3.6-flash) con un batch size di 250 artisti.
Un batch da 250 evita qualsiasi timeout HTTP dell'API gateway, garantendo risposte veloci (<15 secondi).
Un ritardo di 12.0 secondi tra le chiamate assicura il rispetto assoluto della quota del Free Tier.
Il database viene aggiornato incrementalmente dopo ogni batch e all'avvio sincronizza il database
con lo stato del checkpoint esistente per garantire resilienza assoluta.
"""

import os
import json
import time
import re
from pathlib import Path
import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

DB_HOST = os.getenv("DB_RECONCILED_HOST", "localhost")
DB_PORT = os.getenv("DB_RECONCILED_PORT", "5432")
DB_NAME = os.getenv("DB_RECONCILED_NAME", "spotify_reconciled")
DB_USER = os.getenv("DB_RECONCILED_USER", "postgres")
DB_PASS = os.getenv("DB_RECONCILED_PASSWORD", "Lollo")

CHECKPOINT_PATH = Path("data/raw/gemini_genres_checkpoint.json")
BATCH_SIZE = 250
REQUEST_DELAY = 12.0

MODEL_NAME = "models/gemini-flash-lite-latest"

VALID_GENRES = [
    "Pop", "Rock", "Hip-Hop", "Metal", "Electronic", "Latin", "K-Pop",
    "Afrobeats", "Country/Folk", "Jazz/Blues", "Classical", "Reggae", "Other"
]

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

def extract_retry_seconds(error_msg: str) -> float:
    match = re.search(r"Please retry in ([\d\.]+)s", error_msg)
    if match:
        return float(match.group(1))
    return 60.0

def classify_artists_batch(artists: list[str]) -> dict:
    url = f"https://generativelanguage.googleapis.com/v1beta/{MODEL_NAME}:generateContent?key={GEMINI_API_KEY}"
    headers = {"Content-Type": "application/json"}
    
    prompt = f"""
For each of the following artists, identify their primary music genre from this exact list:
{", ".join(VALID_GENRES)}

List of artists:
{json.dumps(artists)}

Respond ONLY with a JSON object mapping the artist name to the selected genre.
Example:
{{"Artist Name": "Genre"}}
"""
    
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.0
        }
    }
    
    while True:
        try:
            res = requests.post(url, headers=headers, json=payload, timeout=50)
            if res.status_code == 200:
                result_text = ""
                for candidate in res.json().get("candidates", []):
                    for part in candidate.get("content", {}).get("parts", []):
                        if "text" in part:
                            result_text += part["text"]
                
                # Robust parsing of response format
                raw_data = json.loads(result_text)
                parsed = {}
                if isinstance(raw_data, dict):
                    for k, v in raw_data.items():
                        if isinstance(v, str):
                            parsed[k] = v
                elif isinstance(raw_data, list):
                    for item in raw_data:
                        if isinstance(item, dict):
                            keys = list(item.keys())
                            if len(keys) >= 2:
                                art_k = None
                                gen_k = None
                                for k in keys:
                                    if 'artist' in k.lower() or 'name' in k.lower():
                                        art_k = k
                                    elif 'genre' in k.lower():
                                        gen_k = k
                                if art_k and gen_k:
                                    parsed[str(item[art_k])] = str(item[gen_k])
                                else:
                                    parsed[str(item[keys[0]])] = str(item[keys[1]])
                return parsed
            elif res.status_code == 429:
                err_text = res.text
                wait_sec = extract_retry_seconds(err_text)
                print(f"\n  ⚠️  Quota limit (429)! Attesa di {wait_sec:.1f} secondi prima del retry...", flush=True)
                time.sleep(wait_sec + 2.0)
            else:
                print(f"\n  ⚠️  Errore API (status {res.status_code}): {res.text}. Riprovo tra 5 secondi...")
                time.sleep(5.0)
        except Exception as e:
            print(f"\n  ⚠️  Errore di connessione o parsing: {e}. Riprovo tra 5 secondi...")
            time.sleep(5.0)

# ── MAIN ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    sep("CLASSIFICAZIONE GENERI ARTISTI TRAMITE GEMINI API (HIGH-THROUGHPUT)")
    
    if not GEMINI_API_KEY:
        print("  ✗  ERRORE: GEMINI_API_KEY non configurata nel .env!")
        exit(1)

    # 1. Carica checkpoint se esiste
    checkpoint_data = {}
    if CHECKPOINT_PATH.exists():
        try:
            with open(CHECKPOINT_PATH, "r", encoding="utf-8") as f:
                checkpoint_data = json.load(f)
            print(f"  📂 Checkpoint caricato: {len(checkpoint_data):,} artisti già classificati.")
        except Exception as e:
            print(f"  ⚠️  Errore nel checkpoint: {e}. Riparto da zero.")

    # 2. Carica gli artisti dal DB
    conn = get_conn()
    cur = conn.cursor()
    
    # Assicura che la colonna lastfm_genre esista
    cur.execute("ALTER TABLE artist ADD COLUMN IF NOT EXISTS lastfm_genre VARCHAR(100);")
    conn.commit()
    
    cur.execute("SELECT artist_id, name FROM artist")
    all_artists = cur.fetchall()
    print(f"  Artisti totali nel database: {len(all_artists):,}")
    
    # Sincronizza il database con i dati del checkpoint esistente prima di iniziare
    cur.execute("SELECT artist_id FROM artist WHERE lastfm_genre IS NOT NULL")
    already_in_db = {row[0] for row in cur.fetchall()}
    print(f"  Artisti già provvisti di genere nel DB: {len(already_in_db):,}")
    
    # Identifica quali generi nel checkpoint non sono ancora scritti nel DB
    missing_db_updates = []
    for aid, name in all_artists:
        if name in checkpoint_data and aid not in already_in_db:
            missing_db_updates.append((checkpoint_data[name], aid))
            
    if missing_db_updates:
        print(f"  Sincronizzazione DB: scrittura di {len(missing_db_updates):,} generi dal checkpoint nel DB...")
        psycopg2.extras.execute_batch(
            cur,
            "UPDATE artist SET lastfm_genre = %s WHERE artist_id = %s",
            missing_db_updates,
            page_size=1000
        )
        conn.commit()
        # Rinfresca il set di già presenti nel DB
        cur.execute("SELECT artist_id FROM artist WHERE lastfm_genre IS NOT NULL")
        already_in_db = {row[0] for row in cur.fetchall()}
        print(f"  ✓  Sincronizzazione DB completata. Artisti provvisti di genere ora: {len(already_in_db):,}")

    to_process = [
        (aid, name) for aid, name in all_artists
        if name not in checkpoint_data and aid not in already_in_db
    ]
    print(f"  Artisti rimasti da classificare ora: {len(to_process):,}")

    if not to_process:
        print("\n  ✓  Nessun artista da processare. Procedo con le statistiche finali.")
    else:
        # 3. Processamento sequenziale in batch da 250 con salvataggio incrementale
        batches = [to_process[i:i + BATCH_SIZE] for i in range(0, len(to_process), BATCH_SIZE)]
        total_batches = len(batches)
        print(f"  Totale batch da elaborare: {total_batches}")
        
        start_time = time.time()
        for idx, batch in enumerate(batches):
            batch_names = [name for _, name in batch]
            print(f"  Elaborazione batch {idx+1}/{total_batches} ({len(batch_names)} artisti)... ", end="", flush=True)
            
            t0 = time.time()
            classified = classify_artists_batch(batch_names)
            
            added = 0
            db_updates = []
            for aid, name in batch:
                genre = classified.get(name)
                if genre in VALID_GENRES:
                    checkpoint_data[name] = genre
                    added += 1
                    db_updates.append((genre, aid))
                else:
                    found = False
                    for k, v in classified.items():
                        if k.lower() == name.lower() and v in VALID_GENRES:
                            checkpoint_data[name] = v
                            added += 1
                            db_updates.append((v, aid))
                            found = True
                            break
                    if not found:
                        checkpoint_data[name] = "Other"
                        db_updates.append(("Other", aid))
                        
            # Salva su checkpoint file
            with open(CHECKPOINT_PATH, "w", encoding="utf-8") as f:
                json.dump(checkpoint_data, f, ensure_ascii=False, indent=2)
                
            # Scrivi incrementalmente nel database
            if db_updates:
                psycopg2.extras.execute_batch(
                    cur,
                    "UPDATE artist SET lastfm_genre = %s WHERE artist_id = %s",
                    db_updates,
                    page_size=100
                )
                conn.commit()
                
            elapsed = time.time() - t0
            print(f"Completato in {elapsed:.1f}s. Salvati nel DB e matchati: {added}/{len(batch)}")
            
            # Attendi per rispettare il limite RPM (tranne all'ultimo giro)
            if idx < total_batches - 1:
                time.sleep(REQUEST_DELAY)

        total_elapsed = time.time() - start_time
        print(f"\n  ✓  Classificazione completata in {total_elapsed/60:.2f} minuti.")

    # Statistiche finali
    cur.execute("SELECT COUNT(*), COUNT(lastfm_genre) FROM artist")
    tot, cov = cur.fetchone()
    print(f"\n  Copertura finale artisti nel DB: {cov:,} / {tot:,} ({100*cov/tot:.1f}%)")
    
    cur.execute("""
        SELECT lastfm_genre, COUNT(*) FROM artist
        WHERE lastfm_genre IS NOT NULL
        GROUP BY lastfm_genre ORDER BY COUNT(*) DESC
    """)
    print("\n  Distribuzione generi finale:")
    for row in cur.fetchall():
        print(f"    {row[0]:<20} {row[1]:>6,}")
        
    cur.close()
    conn.close()
    
    sep("COMPLETATO")
    print("  ✓  Ora puoi eseguire: python notebooks/06_propagate_and_run_pipeline.py per allineare tutto!")
