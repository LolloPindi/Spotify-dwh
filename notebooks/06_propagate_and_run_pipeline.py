"""
06_propagate_and_run_pipeline.py — Allineamento Database e Rigenerazione Parquet
=================================================================================
Questo script esegue le seguenti operazioni una volta terminata la classificazione dei generi:
1. Propaga i generi dagli artisti alle tracce (dove track.lastfm_genre è ancora NULL) nel Reconciled DB.
2. Esegue la pipeline ETL (etl/pipeline.py) per ricaricare il Data Warehouse (spotify_dw)
   con i generi reali compilati.
3. Esegue lo script di esportazione Parquet (webapp/backend/export_parquet.py) per servire
   i dati aggiornati alla dashboard nel frontend.
"""

import os
import subprocess
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("DB_RECONCILED_HOST", "localhost")
DB_PORT = os.getenv("DB_RECONCILED_PORT", "5432")
DB_NAME = os.getenv("DB_RECONCILED_NAME", "spotify_reconciled")
DB_USER = os.getenv("DB_RECONCILED_USER", "postgres")
DB_PASS = os.getenv("DB_RECONCILED_PASSWORD", "Lollo")

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

def main():
    sep("1. PROPAGAZIONE GENERI DA ARTISTI A TRACCE NEL RECONCILED DB")
    conn = get_conn()
    cur = conn.cursor()
    
    # Query per aggiornare le tracce con il genere dell'artista primario se mancante
    query_propagate = """
        UPDATE track t
        SET lastfm_genre = a.lastfm_genre
        FROM track_artist ta
        JOIN artist a ON ta.artist_id = a.artist_id
        WHERE t.spotify_id = ta.spotify_id
          AND t.lastfm_genre IS NULL
          AND a.lastfm_genre IS NOT NULL;
    """
    
    cur.execute(query_propagate)
    updated_rows = cur.rowcount
    conn.commit()
    print(f"  ✓  Aggiornate {updated_rows:,} tracce con il genere del rispettivo artista.")
    
    # Conteggi finali nel Reconciled DB
    cur.execute("SELECT COUNT(*), COUNT(lastfm_genre) FROM artist")
    tot_a, cov_a = cur.fetchone()
    print(f"  Artisti con genere: {cov_a:,} / {tot_a:,} ({100*cov_a/tot_a:.1f}%)")
    
    cur.execute("SELECT COUNT(*), COUNT(lastfm_genre) FROM track")
    tot_t, cov_t = cur.fetchone()
    print(f"  Tracce con genere:   {cov_t:,} / {tot_t:,} ({100*cov_t/tot_t:.1f}%)")
    
    cur.close()
    conn.close()
    
    sep("2. ESECUZIONE PIPELINE ETL (etl/pipeline.py)")
    res = subprocess.run([".venv/bin/python", "etl/pipeline.py"], capture_output=True, text=True)
    if res.returncode == 0:
        print("  ✓  Pipeline ETL completata con successo.")
        # Mostra le righe di riepilogo
        for line in res.stdout.split("\n"):
            if "Caricate" in line or "Genere Last.fm disponibile" in line or "righe in" in line:
                print(f"     {line.strip()}")
    else:
        print("  ✗  Errore nell'esecuzione della pipeline ETL:")
        print(res.stderr)
        return
        
    sep("3. ESPORTAZIONE TABELLE DWH IN FORMATO PARQUET")
    res_pq = subprocess.run([".venv/bin/python", "webapp/backend/export_parquet.py"], capture_output=True, text=True)
    if res_pq.returncode == 0:
        print("  ✓  Esportazione Parquet completata con successo.")
        for line in res_pq.stdout.split("\n"):
            if "Saved" in line or "All tables successfully" in line:
                print(f"     {line.strip()}")
    else:
        print("  ✗  Errore nell'esportazione Parquet:")
        print(res_pq.stderr)
        return
        
    sep("ALLINEAMENTO COMPLETATO CON SUCCESSO!")
    print("  ✓  Tutti i dati sono pronti per essere utilizzati nella dashboard.")

if __name__ == "__main__":
    main()
