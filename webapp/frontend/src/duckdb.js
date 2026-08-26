import * as duckdb from '@duckdb/duckdb-wasm';

let db = null;
let conn = null;

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

export async function initDuckDB(onProgress) {
    if (db && conn) {
        return { db, conn };
    }

    try {
        if (onProgress) onProgress("Inizializzazione motore DuckDB-WASM...");
        
        // 1. Get the bundles from jsDelivr
        const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

        // 2. Select the best bundle for the browser (e.g. eh if exceptions are supported)
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

        // 3. Create a Worker from the bundle URL
        const worker_url = URL.createObjectURL(
            new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
        );
        const worker = new Worker(worker_url);
        const logger = new duckdb.ConsoleLogger();
        
        db = new duckdb.AsyncDuckDB(logger, worker);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        URL.revokeObjectURL(worker_url);

        conn = await db.connect();
        
        // Load the DWH Parquet files
        await loadDWH(onProgress);

        return { db, conn };
    } catch (err) {
        console.error("Errore inizializzazione DuckDB-WASM:", err);
        throw err;
    }
}

async function loadDWH(onProgress) {
    const tables = [
        "dim_tempo",
        "dim_paese",
        "dim_traccia",
        "dim_artista",
        "dim_album",
        "fact_chart_entry"
    ];

    for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        if (onProgress) onProgress(`Scaricamento ed indicizzazione di ${table}...`);
        
        let parquetUrl;
        if (BACKEND_URL) {
            parquetUrl = `${BACKEND_URL}/static/parquet/${table}.parquet`;
        } else {
            // Fallback to locally hosted static Parquet files in public folder
            parquetUrl = `${window.location.origin}/parquet/${table}.parquet`;
        }
        const fileName = `${table}.parquet`;

        // Register the virtual file
        await db.registerFileURL(
            fileName,
            parquetUrl,
            duckdb.DuckDBDataProtocol.HTTP,
            false
        );

        // Create the table from the Parquet file
        await conn.query(`CREATE OR REPLACE TABLE ${table} AS SELECT * FROM read_parquet('${fileName}')`);
        console.log(`Table ${table} loaded successfully.`);
    }

    // Pre-calculate a materialized MOLAP view/cube for the performance comparison benchmark
    if (onProgress) onProgress("Materializzazione del Cubo MOLAP (pre-aggregato)...");
    await conn.query(`
        CREATE OR REPLACE TABLE molap_track_country_weekly AS
        SELECT 
            t.year,
            t.week,
            p.country_code,
            p.country_name,
            p.continent,
            tr.spotify_id,
            tr.name AS track_name,
            a.name AS artist_name,
            AVG(f.daily_rank) AS avg_rank,
            AVG(f.popularity) AS avg_popularity,
            SUM(f.chart_presence) AS total_presence,
            MIN(f.peak_rank) AS min_peak_rank,
            AVG(tr.danceability) AS avg_danceability,
            AVG(tr.energy) AS avg_energy,
            AVG(tr.valence) AS avg_valence
        FROM fact_chart_entry f
        JOIN dim_tempo t ON f.date_key = t.date_key
        JOIN dim_paese p ON f.country_key = p.country_key
        JOIN dim_traccia tr ON f.track_key = tr.track_key
        JOIN dim_artista a ON f.artist_key = a.artist_key
        GROUP BY t.year, t.week, p.country_code, p.country_name, p.continent, tr.spotify_id, tr.name, a.name
    `);
    
    if (onProgress) onProgress("DWH Pronto!");
}

export function getDuckDB() {
    return { db, conn };
}
