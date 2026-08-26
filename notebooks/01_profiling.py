"""
01_profiling.py
===============
Blocco 0 — Profiling esplorativo del dataset Spotify.

Esegui questo script PRIMA di qualsiasi altro step.
Produce un report testuale con:
  - Shape del dataset (righe, colonne)
  - Copertura temporale
  - Paesi presenti
  - Missingness per colonna (con classificazione MCAR/MAR/MNAR)
  - Distribuzione di daily_rank
  - Audio feature: copertura e statistiche descrittive
  - Identificazione duplicati sul grain (spotify_id, country_code, snapshot_date)

Usage:
    python notebooks/01_profiling.py --csv data/raw/universal_top_spotify_songs.csv
"""

import argparse
import sys
from pathlib import Path

import pandas as pd
import numpy as np

# ── Configurazione ──────────────────────────────────────────────────────────
AUDIO_FEATURES = [
    "danceability", "energy", "valence", "acousticness",
    "speechiness", "liveness", "instrumentalness", "tempo",
    "loudness", "key", "mode", "time_signature"
]

GRAIN_COLS = ["spotify_id", "country", "snapshot_date"]

# ── Helpers ──────────────────────────────────────────────────────────────────
def sep(title="", width=70):
    print("\n" + "─" * width)
    if title:
        print(f"  {title}")
        print("─" * width)

def pct(n, total):
    return f"{n:>8,}  ({100*n/total:.1f}%)"

# ── Main ──────────────────────────────────────────────────────────────────────
def profile(csv_path: Path):
    sep("CARICAMENTO")
    print(f"  File: {csv_path}")
    df = pd.read_csv(csv_path, parse_dates=["snapshot_date", "album_release_date"])
    print(f"  Shape: {df.shape[0]:,} righe × {df.shape[1]} colonne")

    # ── Colonne disponibili ──────────────────────────────────────────────────
    sep("COLONNE DISPONIBILI")
    for col in df.columns:
        print(f"  {col:<35} dtype={str(df[col].dtype):<15} null={df[col].isna().sum():,}")

    # ── Copertura temporale ──────────────────────────────────────────────────
    sep("COPERTURA TEMPORALE")
    print(f"  Data minima:  {df['snapshot_date'].min().date()}")
    print(f"  Data massima: {df['snapshot_date'].max().date()}")
    n_days = df['snapshot_date'].nunique()
    print(f"  Giorni unici: {n_days}")

    # ── Paesi ────────────────────────────────────────────────────────────────
    sep("PAESI")
    countries = sorted(df['country'].dropna().unique())
    print(f"  Paesi unici: {len(countries)}")
    print(f"  Lista: {', '.join(countries)}")

    # ── Grain — duplicati ────────────────────────────────────────────────────
    sep("VERIFICA GRAIN  (spotify_id, country, snapshot_date)")
    total = len(df)
    dupes = df.duplicated(subset=GRAIN_COLS).sum()
    print(f"  Righe totali:    {pct(total, total)}")
    print(f"  Duplicati grain: {pct(dupes, total)}")
    if dupes > 0:
        print("  ⚠️  ATTENZIONE: esistono duplicati — richiede deduplicazione in cleaning.")
    else:
        print("  ✓  Nessun duplicato sul grain.")

    # ── Missingness ──────────────────────────────────────────────────────────
    sep("MISSINGNESS PER COLONNA")
    print(f"  {'Colonna':<35} {'Null':>8}  {'%':>6}  Classificazione")
    print("  " + "─" * 65)
    for col in df.columns:
        n_null = df[col].isna().sum()
        if n_null == 0:
            continue
        p = 100 * n_null / total

        # Classificazione euristica MCAR/MAR/MNAR
        if col in AUDIO_FEATURES:
            # Le audio feature mancano per i brani più recenti (deprecazione API)
            # → missingness dipende dalla data → MAR
            classification = "MAR (dipende da snapshot_date)"
        elif col in ("daily_movement", "weekly_movement"):
            # Mancano per le new entries (brano nuovo in classifica)
            # → missingness dipende dal contesto (non random) → MNAR
            classification = "MNAR (new entry, rank precedente non esiste)"
        else:
            classification = "verificare"

        print(f"  {col:<35} {pct(n_null, total):>16}  {classification}")

    # ── Audio feature: copertura temporale ───────────────────────────────────
    sep("AUDIO FEATURE — COPERTURA PER ANNO")
    if "danceability" in df.columns:
        df["year"] = df["snapshot_date"].dt.year
        cov = df.groupby("year")["danceability"].apply(lambda x: x.notna().mean() * 100)
        for yr, pct_val in cov.items():
            bar = "█" * int(pct_val / 5)
            print(f"  {yr}  {bar:<20}  {pct_val:.1f}%")
        print()
        # Identifica il cutoff: primo anno con copertura < 50%
        cutoff_candidates = cov[cov < 50]
        if not cutoff_candidates.empty:
            cutoff = cutoff_candidates.index[0]
            print(f"  ⚠️  Copertura audio feature scende sotto 50% dal {cutoff}.")
            print(f"     Considerare di troncare il dataset a {cutoff - 1}.")
        else:
            print("  ✓  Audio feature coprono l'intero arco temporale.")

    # ── daily_rank ───────────────────────────────────────────────────────────
    sep("DISTRIBUZIONE daily_rank")
    print(df["daily_rank"].describe().to_string())
    out_of_range = ((df["daily_rank"] < 1) | (df["daily_rank"] > 50)).sum()
    if out_of_range > 0:
        print(f"  ⚠️  {out_of_range} righe con rank fuori range [1, 50]")

    # ── popularity ───────────────────────────────────────────────────────────
    sep("DISTRIBUZIONE popularity")
    print(df["popularity"].describe().to_string())
    out_of_range = ((df["popularity"] < 0) | (df["popularity"] > 100)).sum()
    if out_of_range > 0:
        print(f"  ⚠️  {out_of_range} righe con popularity fuori range [0, 100]")

    # ── Artists (campo testuale) ──────────────────────────────────────────────
    sep("CAMPO artists — analisi")
    if "artists" in df.columns:
        # Conta brani con più artisti (separati da virgola)
        multi = df["artists"].str.contains(",", na=False).sum()
        print(f"  Brani con artista singolo:    {pct(total - multi, total)}")
        print(f"  Brani con artisti multipli:   {pct(multi, total)}")
        print("  → Il campo dovrà essere splittat­o per popolare TRACK_ARTIST.")

    # ── Riepilogo decisioni ───────────────────────────────────────────────────
    sep("RIEPILOGO — DECISIONI DA PRENDERE PRIMA DEL CLEANING")
    print("""
  1. FINESTRA TEMPORALE
     Decidere se troncare il dataset all'anno prima del cutoff delle
     audio feature, o gestire la missingness per imputazione/esclusione.

  2. DEDUPLICAZIONE GRAIN
     Se esistono duplicati su (spotify_id, country, snapshot_date),
     decidere la strategia (primo, ultimo, media?).

  3. SPLIT ARTISTS
     Il campo 'artists' è testo libero — va splittat­o e normalizzato
     per popolare la tabella TRACK_ARTIST.

  4. ARRICCHIMENTO GEOGRAFICO
     Scaricare il file country metadata da World Bank e unirlo
     sulla colonna 'country' (codice ISO-2).
    """)

    sep()
    print("  Profiling completato. Output pronto per il notebook di cleaning.\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Profiling dataset Spotify")
    parser.add_argument(
        "--csv",
        type=Path,
        default=Path("data/raw/universal_top_spotify_songs.csv"),
        help="Percorso del CSV scaricato da Kaggle"
    )
    args = parser.parse_args()

    if not args.csv.exists():
        print(f"❌  File non trovato: {args.csv}")
        print("   Scarica il dataset da:")
        print("   https://www.kaggle.com/datasets/asaniczka/top-spotify-songs-in-73-countries-daily-updated")
        sys.exit(1)

    profile(args.csv)
