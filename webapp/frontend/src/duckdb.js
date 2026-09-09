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

        // 3. Create a Worker using the native helper (safe on HTTPS / Vercel)
        const logger = new duckdb.ConsoleLogger();
        const worker = await duckdb.createWorker(bundle.mainWorker);

        db = new duckdb.AsyncDuckDB(logger, worker);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

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
        "dim_genere",
        "dim_tempo",
        "dim_paese",
        "dim_traccia",
        "dim_artista",
        "dim_album",
        "bridge_artista",
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

    if (onProgress) onProgress("DWH Pronto!");
}

export function getDuckDB() {
    return { db, conn };
}
