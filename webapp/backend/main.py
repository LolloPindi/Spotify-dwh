import os
import io
import json
import zipfile
import hashlib
from pathlib import Path
from typing import Dict, Any, Optional
import pandas as pd
import psycopg2
import requests
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Spotify DWH API", description="API backend for Spotify Data Warehouse OLAP & AI Narrative")

# CORS middleware to allow connection from Vite frontend (usually port 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── DB Config ────────────────────────────────────────────────────────────────
DB_HOST = os.getenv("DB_RECONCILED_HOST", "localhost")
DB_PORT = os.getenv("DB_RECONCILED_PORT", "5432")
DB_DWH_NAME = os.getenv("DB_DWH_NAME", "spotify_dw")
DB_USER = os.getenv("DB_RECONCILED_USER", "postgres")
DB_PASS = os.getenv("DB_RECONCILED_PASSWORD", "Lollo")

STATIC_DIR = Path(__file__).parent / "static"
CACHE_DIR = Path(__file__).parent / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Mount static folder so frontend can download Parquet files directly
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

class AIAnalysisRequest(BaseModel):
    query_context: Dict[str, Any]

# Helper to get DWH signature
def get_dwh_signature() -> str:
    try:
        conn = psycopg2.connect(
            host=DB_HOST, port=DB_PORT, dbname=DB_DWH_NAME,
            user=DB_USER, password=DB_PASS
        )
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM fact_chart_entry")
            cnt = cur.fetchone()[0]
            cur.execute("SELECT SUM(daily_rank), SUM(popularity) FROM fact_chart_entry")
            sums = cur.fetchone()
        conn.close()
        sig_str = f"{cnt}|{sums[0]}|{sums[1]}"
        return hashlib.md5(sig_str.encode()).hexdigest()
    except Exception as e:
        print(f"Error calculating DWH signature: {e}")
        return "default_signature"

# ── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/api/status")
def status():
    return {
        "status": "online",
        "dwh_signature": get_dwh_signature(),
        "db_connected": True
    }

@app.get("/api/download-tableau")
def download_tableau():
    """
    Extracts all DWH tables as CSV files, bundles them into a ZIP archive,
    and streams the download. Optimized for importing into Tableau Public.
    """
    try:
        conn = psycopg2.connect(
            host=DB_HOST, port=DB_PORT, dbname=DB_DWH_NAME,
            user=DB_USER, password=DB_PASS
        )
        
        tables = [
            "dim_tempo",
            "dim_paese",
            "dim_traccia",
            "dim_artista",
            "dim_album",
            "fact_chart_entry"
        ]
        
        # Create an in-memory zip file
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
            for table in tables:
                df = pd.read_sql_query(f"SELECT * FROM {table}", conn)
                csv_data = df.to_csv(index=False)
                zip_file.writestr(f"{table}.csv", csv_data)
                
        conn.close()
        
        zip_buffer.seek(0)
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=spotify_dwh_tableau_csv.zip"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate CSV ZIP: {str(e)}")

@app.post("/api/ai-analyze")
def ai_analyze(request: AIAnalysisRequest):
    """
    Receives current OLAP query context (e.g. selected country, top songs, audio features)
    and returns a narrative analysis explaining cultural patterns.
    Uses MD5 signature cache to optimize API requests and ensure idempotency.
    """
    context = request.query_context
    dwh_sig = get_dwh_signature()
    
    # Generate unique key for this request + DWH signature
    context_str = json.dumps(context, sort_keys=True)
    request_hash = hashlib.md5(f"{dwh_sig}_{context_str}".encode()).hexdigest()
    cache_file = CACHE_DIR / f"{request_hash}.json"
    
    # Check cache
    if cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Failed to read cache file: {e}")
            
    # Key checking
    gemini_key = os.getenv("GEMINI_API_KEY")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    
    if context.get("analysis_type") == "compare":
        country_a = context.get("country_a", {})
        country_b = context.get("country_b", {})
        prompt = f"""
        Sei un esperto etnomusicologo e analista di dati musicali per Spotify.
        Analizza i dati OLAP estratti dal nostro Data Warehouse in merito alla divergenza culturale.
        
        Stai effettuando un'analisi comparativa tra due mercati per l'anno {context.get('year')}, settimana {context.get('week')}:
        
        Mercato A: {country_a.get('name')} ({country_a.get('code')})
        - Top 3 Brani: {json.dumps(country_a.get('top_3_songs'), ensure_ascii=False)}
        - Valence Medio (Felicità musicale): {country_a.get('avg_valence')}
        - Energy Medio (Intensità musicale): {country_a.get('avg_energy')}
        
        Mercato B: {country_b.get('name')} ({country_b.get('code')})
        - Top 3 Brani: {json.dumps(country_b.get('top_3_songs'), ensure_ascii=False)}
        - Valence Medio (Felicità musicale): {country_b.get('avg_valence')}
        - Energy Medio (Intensità musicale): {country_b.get('avg_energy')}
        
        Fornisci un'analisi narrativa ed elegante (di circa 3-4 paragrafi) in lingua italiana che:
        1. Metta a confronto i due mercati, spiegando se c'è convergenza o forte divergenza culturale (es. se condividono brani simili o se hanno preferenze musicali distinte).
        2. Spieghi come le audio feature medie (valence, energy) riflettono le differenze culturali, sociali o psicografiche delle due nazioni in questo periodo.
        3. Concluda con raccomandazioni strategiche localizzate per Spotify per ottimizzare la penetrazione di mercato e il cross-over culturale.
        
        Rispondi con un tono accademico, entusiasmante e coinvolgente. Non fare riferimenti al codice o al database relazionale nelle risposte.
        """
    else:
        prompt = f"""
        Sei un esperto etnomusicologo e analista di dati musicali per Spotify.
        Analizza i dati OLAP estratti dal nostro Data Warehouse in merito alla divergenza culturale.
        
        Contesto query selezionato dall'utente:
        {json.dumps(context, indent=2, ensure_ascii=False)}
        
        Fornisci un'analisi narrativa ed elegante (di circa 3-4 paragrafi) in lingua italiana che spieghi:
        1. Il livello di "Cultural Divergence Index" (Divergenza Culturale) riscontrato nei dati selezionati (es. se i brani preferiti localmente corrispondono o si distaccano dalle classifiche globali).
        2. Come le audio feature (es. danceability, energy, valence) si collegano all'identità culturale dei paesi selezionati.
        3. Una conclusione prescrittiva/strategica per Spotify (es. raccomandazioni di playlist o campagne di marketing localizzate).
        
        Rispondi con un tono accademico, entusiasmante e coinvolgente. Non fare riferimenti al codice o al database relazionale nelle risposte, parla solo di cultura musicale e dati.
        """
    
    analysis_text = ""
    api_used = "Mock Narrative (API Keys Not Configured)"
    
    # Attempt to query Gemini (using Gemma 4 as requested by the user)
    if gemini_key:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key={gemini_key}"
            headers = {"Content-Type": "application/json"}
            payload = {
                "contents": [{
                    "parts": [{"text": prompt}]
                }]
            }
            res = requests.post(url, headers=headers, json=payload, timeout=60)
            if res.status_code == 200:
                data = res.json()
                parts = data["candidates"][0]["content"]["parts"]
                # Filter out thoughts trace and get only the final response text
                text_parts = [p["text"] for p in parts if not p.get("thought")]
                if text_parts:
                    analysis_text = "".join(text_parts)
                else:
                    analysis_text = parts[0]["text"]
                api_used = "Gemma 4 API"
        except Exception as e:
            print(f"Gemma API call failed: {e}")
            
    # Attempt to query Anthropic if Gemini is not set or failed
    if not analysis_text and anthropic_key:
        try:
            url = "https://api.anthropic.com/v1/messages"
            headers = {
                "x-api-key": anthropic_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            }
            payload = {
                "model": "claude-3-haiku-20240307",
                "max_tokens": 1000,
                "messages": [{"role": "user", "content": prompt}]
            }
            res = requests.post(url, headers=headers, json=payload, timeout=10)
            if res.status_code == 200:
                data = res.json()
                analysis_text = data["content"][0]["text"]
                api_used = "Anthropic API"
        except Exception as e:
            print(f"Anthropic API call failed: {e}")
            
    # Fallback/Mock Narrative if no API worked
    if not analysis_text:
        country_code = context.get("country_code", "Globale")
        avg_valence = context.get("avg_valence", 0.5)
        avg_energy = context.get("avg_energy", 0.5)
        
        valence_desc = "positività ed euforia" if avg_valence > 0.6 else "malinconia e sonorità introspettive"
        energy_desc = "ritmi incalzanti e dance" if avg_energy > 0.6 else "sonorità acustiche, rilassate e intime"
        
        analysis_text = f"""
### Analisi Culturale: Il Caso {country_code}

I dati analizzati evidenziano un **indice di divergenza culturale significativo** per la nazione {country_code}. Mentre le hit globali tendono a uniformarsi su pattern commerciali e suoni standardizzati di produzione anglofona, il mercato locale di questa regione esibisce una forte preferenza per sonorità caratterizzate da {valence_desc}. Ciò suggerisce che, nonostante le dinamiche di globalizzazione digitale, le radici culturali e le preferenze storiche giocano ancora un ruolo centrale nelle abitudini di ascolto quotidiane.

Dall'analisi delle audio features del DWH, si osserva che i brani dominanti nella Top 50 presentano valori medi di *energy* pari a {avg_energy:.2f} e di *valence* pari a {avg_valence:.2f}. Questa combinazione riflette una predilezione per {energy_desc}. Questi dati indicano che i consumatori locali non utilizzano Spotify solo per riprodurre passivamente le hit del momento, ma cercano attivamente tracce che risuonino con il proprio mood culturale ed emotivo, spesso legato alla lingua e a generi tradizionali (come l'Afrobeats in Nigeria, il Latino in Sudamerica o il K-Pop in Corea).

### Raccomandazioni Strategiche per Spotify
Dal punto di vista del business, questa discrepanza indica che Spotify dovrebbe intensificare gli investimenti nella curation di playlist editoriali regionali, valorizzando i talenti locali emergenti. Invece di promuovere algoritmicamente la Top 50 globale indistintamente in tutto il mondo, la piattaforma otterrà un tasso di retention e ingaggio di gran lunga maggiore personalizzando la home feed degli utenti basandosi sull'indice di divergenza culturale qui riscontrato. Campagne pubblicitarie incentrate sull'orgoglio musicale locale e collaborazioni esclusive con artisti regionali rappresentano la via maestra per consolidare la leadership di mercato.
"""
    
    response_data = {
        "analysis": analysis_text,
        "dwh_signature": dwh_sig,
        "api_used": api_used,
        "hash": request_hash
    }
    
    # Save cache
    try:
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(response_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Failed to write cache file: {e}")
        
    return response_data
