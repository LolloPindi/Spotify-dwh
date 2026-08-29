import os
from pathlib import Path
import pandas as pd
import psycopg2
from dotenv import load_dotenv

# Config
load_dotenv()

DB_HOST = os.getenv("DB_RECONCILED_HOST", "localhost")
DB_PORT = os.getenv("DB_RECONCILED_PORT", "5432")
DB_DWH_NAME = os.getenv("DB_DWH_NAME", "spotify_dw")
DB_USER = os.getenv("DB_RECONCILED_USER", "postgres")
DB_PASS = os.getenv("DB_RECONCILED_PASSWORD", "Lollo")

EXPORT_DIR = Path(__file__).parent / "static" / "parquet"

def export_to_parquet():
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    
    conn_str = f"host={DB_HOST} port={DB_PORT} dbname={DB_DWH_NAME} user={DB_USER} password={DB_PASS}"
    print(f"Connecting to database {DB_DWH_NAME}...")
    conn = psycopg2.connect(conn_str)
    
    tables = [
        "dim_genere",
        "dim_tempo",
        "dim_paese",
        "dim_traccia",
        "dim_artista",
        "dim_album",
        "bridge_artista",
        "fact_chart_entry"
    ]
    
    for table in tables:
        print(f"Exporting table '{table}'...")
        file_path = EXPORT_DIR / f"{table}.parquet"
        
        # Stream or read all
        query = f"SELECT * FROM {table}"
        
        # Read using pandas
        df = pd.read_sql_query(query, conn)
        
        # Save to parquet
        df.to_parquet(file_path, index=False, engine="pyarrow", compression="snappy")
        print(f"  ✓ Saved {len(df):,} rows to {file_path.relative_to(Path(__file__).parent.parent.parent)}")
        
    conn.close()
    print("All tables successfully exported to Parquet!")

if __name__ == "__main__":
    export_to_parquet()
