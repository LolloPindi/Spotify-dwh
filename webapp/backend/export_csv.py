import os
from pathlib import Path
import pandas as pd
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("DB_RECONCILED_HOST", "localhost")
DB_PORT = os.getenv("DB_RECONCILED_PORT", "5432")
DB_DWH_NAME = os.getenv("DB_DWH_NAME", "spotify_dw")
DB_USER = os.getenv("DB_RECONCILED_USER", "postgres")
DB_PASS = os.getenv("DB_RECONCILED_PASSWORD", "")

EXPORT_DIR = Path(__file__).parent / "static" / "csv"

def export_to_csv():
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    conn = psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_DWH_NAME,
        user=DB_USER, password=DB_PASS
    )
    print(f"Connesso a {DB_DWH_NAME}")

    tables = [
        "dim_genere",
        "dim_tempo",
        "dim_paese",
        "dim_traccia",
        "dim_artista",
        "dim_album",
        "bridge_artista",
        "fact_chart_entry",
    ]

    for table in tables:
        print(f"Esportazione '{table}'...")
        df = pd.read_sql_query(f"SELECT * FROM {table}", conn)
        out = EXPORT_DIR / f"{table}.csv"
        df.to_csv(out, index=False, encoding="utf-8-sig")
        print(f"  {len(df):,} righe -> {out.name}")

    conn.close()
    print("Esportazione CSV completata.")

if __name__ == "__main__":
    export_to_csv()
