import React, { useState, useEffect } from 'react';
import { initDuckDB } from './duckdb';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  ScatterChart, Scatter, ZAxis, Legend, LineChart, Line
} from 'recharts';
import { 
  Compass, Globe, Music, Cpu, Sparkles, Download, Search,
  ArrowLeftRight, AlertCircle, RefreshCw, BarChart2,
  Presentation, ArrowLeft, ArrowRight, Terminal, Sliders,
  Database, BookOpen, Award, Play, ChevronLeft, ChevronRight
} from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

const cleanRow = (row) => {
  if (!row) return {};
  const obj = row.toJSON ? row.toJSON() : { ...row };
  for (const key in obj) {
    if (typeof obj[key] === 'bigint') {
      obj[key] = Number(obj[key]);
    }
  }
  return obj;
};

const renderArtistCell = (artistNames) => {
  if (!artistNames) return "N/D";
  const list = artistNames.split(', ');
  const primary = list[0];
  const others = list.slice(1);
  if (others.length === 0) {
    return <span style={{ color: 'var(--text-secondary)' }}>{primary}</span>;
  }
  return (
    <span style={{ color: 'var(--text-secondary)' }}>
      {primary}{' '}
      <span 
        className="featured-artists-badge"
        title={artistNames}
        style={{
          fontSize: '0.7rem',
          background: 'rgba(29, 185, 84, 0.15)',
          color: 'var(--accent-green)',
          padding: '1px 5px',
          borderRadius: '3px',
          marginLeft: '4px',
          cursor: 'help'
        }}
      >
        +{others.length}
      </span>
    </span>
  );
};

function App() {
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [dbConn, setDbConn] = useState(null);

  // View modes
  const [viewMode, setViewMode] = useState("dashboard"); // "dashboard" or "pitch"
  const [currentSlide, setCurrentSlide] = useState(1);

  // Filter states
  const [countries, setCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState("IT");
  const [timeframes, setTimeframes] = useState([]); // Array of {year, week}
  const [selectedTimeframe, setSelectedTimeframe] = useState({ year: 2024, week: 1 });
  
  // Stats & KPIs
  const [countryStats, setCountryStats] = useState({});
  const [activeTracksCount, setActiveTracksCount] = useState(0);

  // Active Tab & Data
  const [activeTab, setActiveTab] = useState("top-songs");
  const [topSongs, setTopSongs] = useState([]);

  // Selected Track Detail States
  const [selectedDetailTrack, setSelectedDetailTrack] = useState(null);
  const [trackDetailData, setTrackDetailData] = useState(null);
  const [trackHistoryData, setTrackHistoryData] = useState([]);
  const [detailSourceMode, setDetailSourceMode] = useState("dashboard"); // "dashboard" or "pitch"
  
  // Search Tab States
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState("song"); // "song" or "artist"
  const [songSearchResults, setSongSearchResults] = useState([]);
  const [artistSearchResults, setArtistSearchResults] = useState([]);
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [artistTracksResults, setArtistTracksResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  
  // Selected Track Detail Chart States
  const [chartCountries, setChartCountries] = useState([]);
  const [selectedChartCountry, setSelectedChartCountry] = useState("GL");
  const [globalHistoryData, setGlobalHistoryData] = useState([]);
  const [scatterData, setScatterData] = useState([]);
  const [yearlyCountrySongs, setYearlyCountrySongs] = useState([]);
  const [yearlyGlobalSongs, setYearlyGlobalSongs] = useState([]);

  // Geopolitical characteristics data
  const [geoAudioData, setGeoAudioData] = useState([]);
  const [langAudioData, setLangAudioData] = useState([]);
  const [incomeAudioData, setIncomeAudioData] = useState([]);
  const [genreDistribution, setGenreDistribution] = useState([]);
  const [selectedGeoCategory, setSelectedGeoCategory] = useState("continent");

  // What-If Simulation
  const [localWeight, setLocalWeight] = useState(50);
  const [globalWeight, setGlobalWeight] = useState(50);
  const [simulatedSongs, setSimulatedSongs] = useState([]);

  // Benchmark States
  const [rolapTime, setRolapTime] = useState(0);
  const [molapTime, setMolapTime] = useState(0);
  const [benchmarkStatus, setBenchmarkStatus] = useState("idle");

  // AI Narrative
  const [aiNarrative, setAiNarrative] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiUsedApi, setAiUsedApi] = useState("");

  // OLAP Playground States
  const [selectedOlapOp, setSelectedOlapOp] = useState("slice");
  const [olapPlaygroundResult, setOlapPlaygroundResult] = useState([]);
  const [olapPlaygroundLoading, setOlapPlaygroundLoading] = useState(false);
  const [olapPlaygroundQuery, setOlapPlaygroundQuery] = useState("");
  
  // OLAP Dynamic Parameter States
  const [olapCountry, setOlapCountry] = useState("IT");
  const [olapYear, setOlapYear] = useState(2024);
  const [olapWeek, setOlapWeek] = useState(1);
  const [olapGenre, setOlapGenre] = useState("Hip-Hop");
  const [olapIncomeGroup, setOlapIncomeGroup] = useState("High income");

  const runOlapPlaygroundQuery = async (op) => {
    if (!dbConn) return;
    setOlapPlaygroundLoading(true);
    let queryText = "";
    
    switch (op) {
      case 'slice':
        // SLICE: Fissa una singola dimensione (Paese) senza vincoli di tempo (mostra i top brani di sempre di quel paese)
        queryText = `
          SELECT tr.name AS Track, string_agg(DISTINCT a.name, ', ') AS Artist, MIN(f.daily_rank) AS Rank, ROUND(AVG(tr.valence), 3) AS Info
          FROM fact_chart_entry f
          JOIN dim_paese p ON f.country_key = p.country_key
          JOIN dim_traccia tr ON f.track_key = tr.track_key
          JOIN dim_artista a ON f.artist_key = a.artist_key
          WHERE p.country_code = '${olapCountry}'
          GROUP BY tr.name, tr.valence
          ORDER BY Rank LIMIT 5
        `;
        break;
      case 'dice':
        // DICE: Filtra contemporaneamente su più dimensioni (Paese AND Genere AND Anno AND Settimana)
        queryText = `
          SELECT tr.name AS Track, string_agg(DISTINCT a.name, ', ') AS Artist, MIN(f.daily_rank) AS Rank, coalesce(tr.genre, a.genre) AS Info
          FROM fact_chart_entry f
          JOIN dim_paese p ON f.country_key = p.country_key
          JOIN dim_traccia tr ON f.track_key = tr.track_key
          JOIN dim_artista a ON f.artist_key = a.artist_key
          JOIN dim_tempo tmp ON f.date_key = tmp.date_key
          WHERE p.country_code = '${olapCountry}' 
            AND coalesce(tr.genre, a.genre) = '${olapGenre}' 
            AND tmp.year = ${olapYear} 
            AND tmp.week = ${olapWeek}
          GROUP BY tr.name, coalesce(tr.genre, a.genre)
          ORDER BY Rank LIMIT 5
        `;
        break;
      case 'drill':
        // DRILL-DOWN: Scende di dettaglio mostrando il record specifico della settimana all'interno dell'anno
        queryText = `
          SELECT tr.name AS Track, string_agg(DISTINCT a.name, ', ') AS Artist, MIN(f.daily_rank) AS Rank, 'Anno: ' || tmp.year || ', Settimana: ' || tmp.week AS Info
          FROM fact_chart_entry f
          JOIN dim_paese p ON f.country_key = p.country_key
          JOIN dim_traccia tr ON f.track_key = tr.track_key
          JOIN dim_artista a ON f.artist_key = a.artist_key
          JOIN dim_tempo tmp ON f.date_key = tmp.date_key
          WHERE p.country_code = '${olapCountry}' 
            AND tmp.year = ${olapYear} 
            AND tmp.week = ${olapWeek}
          GROUP BY tr.name, tmp.year, tmp.week
          ORDER BY Rank LIMIT 5
        `;
        break;
      case 'rollup':
        // ROLL-UP: Aggrega salendo dal Paese selezionato al livello globale (GL) per quella settimana
        queryText = `
          SELECT tr.name AS Track, string_agg(DISTINCT a.name, ', ') AS Artist, MIN(f.daily_rank) AS Rank, 'Classifica Globale (GL)' AS Info
          FROM fact_chart_entry f
          JOIN dim_paese p ON f.country_key = p.country_key
          JOIN dim_traccia tr ON f.track_key = tr.track_key
          JOIN dim_artista a ON f.artist_key = a.artist_key
          JOIN dim_tempo tmp ON f.date_key = tmp.date_key
          WHERE p.country_code = 'GL' 
            AND tmp.year = ${olapYear} 
            AND tmp.week = ${olapWeek}
          GROUP BY tr.name
          ORDER BY Rank LIMIT 5
        `;
        break;
      case 'pivot':
        // PIVOT: Ruota l'asse di analisi confrontando i dati per Fascia di Reddito invece che per territorio
        queryText = `
          SELECT tr.name AS Track, string_agg(DISTINCT a.name, ', ') AS Artist, MIN(f.daily_rank) AS Rank, p.income_group AS Info
          FROM fact_chart_entry f
          JOIN dim_paese p ON f.country_key = p.country_key
          JOIN dim_traccia tr ON f.track_key = tr.track_key
          JOIN dim_artista a ON f.artist_key = a.artist_key
          JOIN dim_tempo tmp ON f.date_key = tmp.date_key
          WHERE p.income_group = '${olapIncomeGroup}' 
            AND tmp.year = ${olapYear} 
            AND tmp.week = ${olapWeek}
          GROUP BY tr.name, p.income_group
          ORDER BY Rank LIMIT 5
        `;
        break;
      default:
        break;
    }
    
    setOlapPlaygroundQuery(queryText);
    try {
      const rows = await runQueryWithLogging(queryText);
      setOlapPlaygroundResult(rows || []);
    } catch (err) {
      console.error(err);
    } finally {
      setOlapPlaygroundLoading(false);
    }
  };
  const [customApiKey, setCustomApiKey] = useState(() => localStorage.getItem("user_gemini_api_key") || "");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [aiCompareMode, setAiCompareMode] = useState("single"); // "single" or "compare"
  const [aiCompareType, setAiCompareType] = useState("local-vs-global"); // "local-vs-global" or "two-countries"
  const [selectedCompareCountryB, setSelectedCompareCountryB] = useState("US");

  // SQL query logs for presentation console
  const [sqlLogs, setSqlLogs] = useState([
    { type: 'success', text: 'DuckDB-WASM inizializzato con successo.' },
    { type: 'success', text: 'Parquet files caricati in memoria.' }
  ]);

  const runQueryWithLogging = async (queryText) => {
    if (!dbConn) return null;
    const timeStart = performance.now();
    setSqlLogs(prev => [...prev, { type: 'query', text: queryText.trim() }]);
    try {
      const res = await dbConn.query(queryText);
      const timeEnd = performance.now();
      const rows = res.toArray().map(cleanRow);
      setSqlLogs(prev => [...prev, { type: 'success', text: `Returned ${rows.length} rows in ${(timeEnd - timeStart).toFixed(1)}ms` }]);
      return rows;
    } catch (err) {
      setSqlLogs(prev => [...prev, { type: 'error', text: `Error: ${err.message}` }]);
      throw err;
    }
  };

  // Keyboard navigation for slideshow
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (viewMode !== 'pitch') return;
      if (e.key === 'ArrowRight') {
        setCurrentSlide(prev => Math.min(prev + 1, 11));
      } else if (e.key === 'ArrowLeft') {
        setCurrentSlide(prev => Math.max(prev - 1, 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode]);

  // Auto-run OLAP playground query when slide or operation changes
  useEffect(() => {
    if (viewMode === 'pitch' && currentSlide === 8 && dbConn) {
      runOlapPlaygroundQuery(selectedOlapOp);
    }
  }, [currentSlide, selectedOlapOp, dbConn, viewMode, olapCountry, olapYear, olapWeek, olapGenre, olapIncomeGroup]);

  // Regola la settimana in base all'anno selezionato per evitare query vuote
  useEffect(() => {
    if (olapYear === 2023) {
      if (olapWeek < 42 || olapWeek > 52) {
        setOlapWeek(42);
      }
    } else if (olapYear === 2024) {
      if (olapWeek < 1 || olapWeek > 52) {
        setOlapWeek(1);
      }
    } else if (olapYear === 2025) {
      if (olapWeek < 1 || olapWeek > 24) {
        setOlapWeek(1);
      }
    }
  }, [olapYear, olapWeek]);

  // 1. Initialise DuckDB & Load Metadata
  useEffect(() => {
    async function setup() {
      try {
        const { conn } = await initDuckDB((msg) => setLoadingMsg(msg));
        setDbConn(conn);

        // Fetch countries
        const countryResult = await conn.query("SELECT country_code, country_name FROM dim_paese ORDER BY country_name");
        const countryList = countryResult.toArray().map(cleanRow);
        setCountries(countryList);

        // Fetch weeks
        const timeResult = await conn.query("SELECT DISTINCT year, week FROM dim_tempo ORDER BY year, week");
        const timeList = timeResult.toArray().map(cleanRow);
        setTimeframes(timeList);

        if (timeList.length > 0) {
          // Default selection
          const defTime = timeList.find(t => t.year === 2024 && t.week === 1) || timeList[0];
          setSelectedTimeframe(defTime);
        }

        // Fetch geo audio characteristics
        const geoRes = await conn.query(`
          SELECT p.continent, AVG(tr.valence) AS avg_valence, AVG(tr.energy) AS avg_energy, AVG(tr.danceability) AS avg_danceability
          FROM fact_chart_entry f
          JOIN dim_paese p ON f.country_key = p.country_key
          JOIN dim_traccia tr ON f.track_key = tr.track_key
          GROUP BY p.continent
          ORDER BY avg_valence DESC
        `);
        setGeoAudioData(geoRes.toArray().map(cleanRow));

        const langRes = await conn.query(`
          SELECT p.language, AVG(tr.valence) AS avg_valence, AVG(tr.energy) AS avg_energy, AVG(tr.danceability) AS avg_danceability
          FROM fact_chart_entry f
          JOIN dim_paese p ON f.country_key = p.country_key
          JOIN dim_traccia tr ON f.track_key = tr.track_key
          WHERE p.language IS NOT NULL AND p.language != 'N/A'
          GROUP BY p.language
          ORDER BY avg_valence DESC
          LIMIT 10
        `);
        setLangAudioData(langRes.toArray().map(cleanRow));

        const incomeRes = await conn.query(`
          SELECT p.income_group, AVG(tr.valence) AS avg_valence, AVG(tr.energy) AS avg_energy, AVG(tr.danceability) AS avg_danceability
          FROM fact_chart_entry f
          JOIN dim_paese p ON f.country_key = p.country_key
          JOIN dim_traccia tr ON f.track_key = tr.track_key
          WHERE p.income_group IS NOT NULL AND p.income_group != 'N/A'
          GROUP BY p.income_group
          ORDER BY avg_valence DESC
        `);
        setIncomeAudioData(incomeRes.toArray().map(cleanRow));

        const genreRes = await conn.query(`
          SELECT genre, COUNT(*) AS artist_count
          FROM dim_artista
          WHERE genre IS NOT NULL AND genre != 'Other' AND genre != 'N/A'
          GROUP BY genre
          ORDER BY artist_count DESC
          LIMIT 8
        `);
        setGenreDistribution(genreRes.toArray().map(cleanRow));

        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoadingMsg("Impossibile caricare il Data Warehouse. Verifica che il backend sia attivo.");
      }
    }
    setup();
  }, []);

  const getGenreSqlCondition = (genre) => {
    if (!genre || genre === 'All') return '';
    return ` AND (coalesce(tr.genre, a.genre) = '${genre}')`;
  };

  // 2. Fetch Dashboard Data on Filters Change
  useEffect(() => {
    if (!dbConn || loading) return;

    async function fetchDashboardData() {
      // Fetch Country Meta
      const metaRes = await dbConn.query(`
        SELECT country_name, continent, subregion, language, income_group, population, gdp_per_capita
        FROM dim_paese WHERE country_code = '${selectedCountry}'
      `);
      if (metaRes.numRows > 0) {
        const meta = metaRes.toArray()[0];
        setCountryStats(cleanRow(meta));
      }

      // Fetch Top Songs & Audio features
      const songsRes = await dbConn.query(`
        WITH weekly_stats AS (
            SELECT 
                tr.name AS track_name,
                string_agg(DISTINCT a.name, ', ') AS artist_names,
                AVG(f.popularity) AS popularity,
                COUNT(DISTINCT t.date_key) AS days_on_chart,
                MIN(f.daily_rank) AS weekly_peak_rank,
                MIN(f.peak_rank) AS peak_rank,
                AVG(tr.danceability) AS danceability,
                AVG(tr.energy) AS energy,
                AVG(tr.valence) AS valence,
                SUM(51 - f.daily_rank) AS weekly_score
            FROM fact_chart_entry f
            JOIN dim_tempo t ON f.date_key = t.date_key
            JOIN dim_paese p ON f.country_key = p.country_key
            JOIN dim_traccia tr ON f.track_key = tr.track_key
            JOIN dim_artista a ON f.artist_key = a.artist_key
            WHERE p.country_code = '${selectedCountry}'
              AND t.year = ${selectedTimeframe.year}
              AND t.week = ${selectedTimeframe.week}
              ${getGenreSqlCondition(selectedGenre)}
            GROUP BY tr.name
        )
        SELECT 
            ROW_NUMBER() OVER (ORDER BY weekly_score DESC, popularity DESC) AS daily_rank,
            track_name,
            artist_names,
            popularity,
            days_on_chart,
            peak_rank,
            danceability,
            energy,
            valence
        FROM weekly_stats
        ORDER BY daily_rank ASC
      `);
      
      const songList = songsRes.toArray().map(cleanRow);
      setTopSongs(songList);
      setActiveTracksCount(new Set(songList.map(s => s.track_name)).size);

      // Scatter data (energy vs valence)
      const scatter = songList.map(s => ({
        name: s.track_name,
        artist: s.artist_names,
        energy: parseFloat(s.energy || 0),
        valence: parseFloat(s.valence || 0),
        rank: parseInt(s.daily_rank),
        size: 51 - parseInt(s.daily_rank) // Bigger bubbles for better ranks
      }));
      setScatterData(scatter);
      
      // Fetch Yearly Country Top Songs (Chart Points sum)
      const yearlyCountryRes = await dbConn.query(`
        SELECT 
            tr.name AS track_name,
            string_agg(DISTINCT a.name, ', ') AS artist_names,
            MIN(f.daily_rank) AS peak_rank,
            COUNT(DISTINCT t.date_key) AS days_on_chart,
            SUM(51 - f.daily_rank) / COUNT(DISTINCT a.artist_key) AS chart_points,
            ROUND(AVG(f.popularity), 1) AS avg_popularity
        FROM fact_chart_entry f
        JOIN dim_tempo t ON f.date_key = t.date_key
        JOIN dim_paese p ON f.country_key = p.country_key
        JOIN dim_traccia tr ON f.track_key = tr.track_key
        JOIN dim_artista a ON f.artist_key = a.artist_key
        WHERE p.country_code = '${selectedCountry}'
          AND t.year = ${selectedTimeframe.year}
          ${getGenreSqlCondition(selectedGenre)}
        GROUP BY tr.name
        ORDER BY chart_points DESC
        LIMIT 10
      `);
      setYearlyCountrySongs(yearlyCountryRes.toArray().map(cleanRow));

      // Fetch Yearly Global Top Songs (Chart Points sum)
      const yearlyGlobalRes = await dbConn.query(`
        SELECT 
            tr.name AS track_name,
            string_agg(DISTINCT a.name, ', ') AS artist_names,
            MIN(f.daily_rank) AS peak_rank,
            COUNT(DISTINCT p.country_code) AS countries_charted,
            SUM(51 - f.daily_rank) / COUNT(DISTINCT a.artist_key) AS chart_points,
            ROUND(AVG(f.popularity), 1) AS avg_popularity
        FROM fact_chart_entry f
        JOIN dim_tempo t ON f.date_key = t.date_key
        JOIN dim_paese p ON f.country_key = p.country_key
        JOIN dim_traccia tr ON f.track_key = tr.track_key
        JOIN dim_artista a ON f.artist_key = a.artist_key
        WHERE t.year = ${selectedTimeframe.year}
          ${getGenreSqlCondition(selectedGenre)}
        GROUP BY tr.name
        ORDER BY chart_points DESC
        LIMIT 10
      `);
      setYearlyGlobalSongs(yearlyGlobalRes.toArray().map(cleanRow));

      // Auto run simulation and benchmark
      runWhatIfSimulation();
      runBenchmark();
    }

    fetchDashboardData();
  }, [dbConn, selectedCountry, selectedTimeframe, loading, selectedGenre]);

  // 3. What-If Simulation Query
  const runWhatIfSimulation = async () => {
    if (!dbConn) return;
    const simRes = await dbConn.query(`
      SELECT 
          tr.name AS track_name,
          string_agg(DISTINCT a.name, ', ') AS artist_names,
          ANY_VALUE(f.daily_rank) AS daily_rank,
          ANY_VALUE(f.popularity) AS popularity,
          ANY_VALUE((${localWeight} * (51 - f.daily_rank) + ${globalWeight} * f.popularity)) AS simulated_score
      FROM fact_chart_entry f
      JOIN dim_tempo t ON f.date_key = t.date_key
      JOIN dim_paese p ON f.country_key = p.country_key
      JOIN dim_traccia tr ON f.track_key = tr.track_key
      JOIN dim_artista a ON f.artist_key = a.artist_key
      WHERE p.country_code = '${selectedCountry}'
        AND t.year = ${selectedTimeframe.year}
        AND t.week = ${selectedTimeframe.week}
        ${getGenreSqlCondition(selectedGenre)}
      GROUP BY tr.name
      ORDER BY simulated_score DESC
      LIMIT 10
    `);
    const list = simRes.toArray().map(cleanRow);
    setSimulatedSongs(list);
  };

  // Ricarica la simulazione quando variano i pesi o i parametri di filtro
  useEffect(() => {
    runWhatIfSimulation();
  }, [localWeight, globalWeight, selectedGenre, selectedCountry, selectedTimeframe, dbConn]);

  // Regola la settimana di selectedTimeframe in base all'anno per evitare query vuote
  useEffect(() => {
    if (selectedTimeframe.year === 2023) {
      if (selectedTimeframe.week < 42 || selectedTimeframe.week > 52) {
        setSelectedTimeframe(prev => ({ ...prev, week: 42 }));
      }
    } else if (selectedTimeframe.year === 2024) {
      if (selectedTimeframe.week < 1 || selectedTimeframe.week > 52) {
        setSelectedTimeframe(prev => ({ ...prev, week: 1 }));
      }
    } else if (selectedTimeframe.year === 2025) {
      if (selectedTimeframe.week < 1 || selectedTimeframe.week > 24) {
        setSelectedTimeframe(prev => ({ ...prev, week: 1 }));
      }
    }
  }, [selectedTimeframe.year, selectedTimeframe.week]);

  // 4. ROLAP vs MOLAP Performance Benchmark
  const runBenchmark = async () => {
    if (!dbConn) return;
    setBenchmarkStatus("running");
    
    // ROLAP Query (Standard star schema join over 3.33M fact entries)
    const t0 = performance.now();
    await dbConn.query(`
      SELECT 
          p.country_name,
          AVG(f.daily_rank) AS avg_rank,
          AVG(tr.valence) AS avg_valence
      FROM fact_chart_entry f
      JOIN dim_tempo t ON f.date_key = t.date_key
      JOIN dim_paese p ON f.country_key = p.country_key
      JOIN dim_traccia tr ON f.track_key = tr.track_key
      WHERE t.year = ${selectedTimeframe.year} AND t.week = ${selectedTimeframe.week}
      GROUP BY p.country_name
    `);
    const t1 = performance.now();
    const rTime = t1 - t0;
    setRolapTime(rTime);

    // MOLAP Query (Pre-aggregated table)
    const t2 = performance.now();
    await dbConn.query(`
      SELECT 
          country_name,
          avg_rank,
          avg_valence
      FROM molap_track_country_weekly
      WHERE year = ${selectedTimeframe.year} AND week = ${selectedTimeframe.week}
    `);
    const t3 = performance.now();
    const mTime = t3 - t2;
    setMolapTime(mTime);
    setBenchmarkStatus("done");
  };

  // 4.5 Load Track Detail view
  const loadTrackDetail = async (trackName, sourceMode = "dashboard") => {
    if (!dbConn) return;
    setDetailSourceMode(sourceMode);
    
    const escapedName = trackName.replace(/'/g, "''");
    
    try {
      // 1. Fetch main track details, artists, and album
      const detailRes = await dbConn.query(`
        SELECT 
            tr.spotify_id,
            tr.name AS track_name,
            tr.duration_ms,
            tr.is_explicit,
            tr.danceability,
            tr.energy,
            tr.valence,
            tr.mood_band,
            tr.energy_band,
            tr.valence_band,
            string_agg(DISTINCT a.name, ', ') AS artist_names,
            ANY_VALUE(al.name) AS album_name,
            ANY_VALUE(al.release_date) AS release_date,
            ANY_VALUE(al.release_year) AS release_year,
            MIN(f.daily_rank) AS peak_rank_all_time,
            MAX(f.days_on_chart) AS max_days_on_chart,
            MAX(f.n_countries_charted) AS max_countries_charted
        FROM fact_chart_entry f
        JOIN dim_traccia tr ON f.track_key = tr.track_key
        JOIN dim_artista a ON f.artist_key = a.artist_key
        JOIN dim_album al ON f.album_key = al.album_key
        WHERE tr.name = '${escapedName}'
        GROUP BY tr.spotify_id, tr.name, tr.duration_ms, tr.is_explicit, tr.danceability, tr.energy, tr.valence, tr.mood_band, tr.energy_band, tr.valence_band
        LIMIT 1
      `);
      
      if (detailRes.numRows > 0) {
        const details = cleanRow(detailRes.toArray()[0]);
        setTrackDetailData(details);

        // 2. Fetch list of countries this song has charted in
        const countriesRes = await dbConn.query(`
          SELECT DISTINCT p.country_code, p.country_name
          FROM fact_chart_entry f
          JOIN dim_paese p ON f.country_key = p.country_key
          JOIN dim_traccia tr ON f.track_key = tr.track_key
          WHERE tr.name = '${escapedName}'
          ORDER BY p.country_name ASC
        `);
        const available = countriesRes.toArray().map(cleanRow);
        setChartCountries(available);
        
        // 3. Select default chart country
        const hasCurrentSelected = available.some(c => c.country_code === selectedCountry);
        
        if (hasCurrentSelected) {
          setSelectedChartCountry(selectedCountry);
        } else if (available.length > 0) {
          setSelectedChartCountry(available[0].country_code);
        }
        
        setSelectedDetailTrack(trackName);
      }
    } catch (err) {
      console.error("Errore nel recupero dei dettagli del brano:", err);
    }
  };

  // 4.6 Load Track Chart History dynamically based on selected country and global
  useEffect(() => {
    const loadChartHistories = async () => {
      if (!dbConn || !selectedDetailTrack) return;
      const escapedName = selectedDetailTrack.replace(/'/g, "''");
      
      try {
        // 1. Fetch Global history
        const globalRes = await dbConn.query(`
          SELECT 
              t.snapshot_date,
              MIN(f.daily_rank) AS daily_rank
          FROM fact_chart_entry f
          JOIN dim_tempo t ON f.date_key = t.date_key
          JOIN dim_paese p ON f.country_key = p.country_key
          JOIN dim_traccia tr ON f.track_key = tr.track_key
          WHERE tr.name = '${escapedName}' AND p.country_code = 'GL' AND t.year = ${selectedTimeframe.year}
          GROUP BY t.snapshot_date
          ORDER BY t.snapshot_date ASC
        `);
        
        const globalHistory = globalRes.toArray().map(r => {
          const row = cleanRow(r);
          let dateObj = null;
          if (row.snapshot_date instanceof Date) {
            dateObj = row.snapshot_date;
          } else if (typeof row.snapshot_date === 'number' || typeof row.snapshot_date === 'bigint') {
            dateObj = new Date(Number(row.snapshot_date));
          } else if (typeof row.snapshot_date === 'string') {
            if (/^\d+$/.test(row.snapshot_date)) {
              dateObj = new Date(Number(row.snapshot_date));
            } else {
              dateObj = new Date(row.snapshot_date);
            }
          }
          
          if (dateObj && !isNaN(dateObj.getTime())) {
            row.formatted_date = dateObj.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
          } else {
            row.formatted_date = String(row.snapshot_date);
          }
          return row;
        });
        setGlobalHistoryData(globalHistory);

        // 2. Fetch Local history (selectedChartCountry)
        if (selectedChartCountry) {
          const localRes = await dbConn.query(`
            SELECT 
                t.snapshot_date,
                MIN(f.daily_rank) AS daily_rank
            FROM fact_chart_entry f
            JOIN dim_tempo t ON f.date_key = t.date_key
            JOIN dim_paese p ON f.country_key = p.country_key
            JOIN dim_traccia tr ON f.track_key = tr.track_key
            WHERE tr.name = '${escapedName}' AND p.country_code = '${selectedChartCountry}' AND t.year = ${selectedTimeframe.year}
            GROUP BY t.snapshot_date
            ORDER BY t.snapshot_date ASC
          `);
          
          const localHistory = localRes.toArray().map(r => {
            const row = cleanRow(r);
            let dateObj = null;
            if (row.snapshot_date instanceof Date) {
              dateObj = row.snapshot_date;
            } else if (typeof row.snapshot_date === 'number' || typeof row.snapshot_date === 'bigint') {
              dateObj = new Date(Number(row.snapshot_date));
            } else if (typeof row.snapshot_date === 'string') {
              if (/^\d+$/.test(row.snapshot_date)) {
                dateObj = new Date(Number(row.snapshot_date));
              } else {
                dateObj = new Date(row.snapshot_date);
              }
            }
            
            if (dateObj && !isNaN(dateObj.getTime())) {
              row.formatted_date = dateObj.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
            } else {
              row.formatted_date = String(row.snapshot_date);
            }
            return row;
          });
          setTrackHistoryData(localHistory);
        }
      } catch (err) {
        console.error("Errore nel caricamento degli storici:", err);
      }
    };

    loadChartHistories();
  }, [selectedDetailTrack, selectedChartCountry, dbConn, selectedTimeframe.year]);

  // 4.7 Search handler
  useEffect(() => {
    const performSearch = async () => {
      if (!dbConn) return;
      if (searchQuery.trim().length < 2) {
        setSongSearchResults([]);
        setArtistSearchResults([]);
        return;
      }
      
      setSearchLoading(true);
      const escapedQuery = searchQuery.replace(/'/g, "''").toLowerCase();
      
      try {
        if (searchType === "song") {
          const res = await dbConn.query(`
            SELECT 
                tr.name AS track_name,
                string_agg(DISTINCT a.name, ', ') AS artist_names,
                MAX(f.popularity) AS popularity,
                MAX(f.days_on_chart) AS days_on_chart,
                MIN(f.daily_rank) AS peak_rank
            FROM fact_chart_entry f
            JOIN dim_traccia tr ON f.track_key = tr.track_key
            JOIN dim_artista a ON f.artist_key = a.artist_key
            WHERE LOWER(tr.name) LIKE '%${escapedQuery}%'
            GROUP BY tr.name
            ORDER BY days_on_chart DESC
            LIMIT 15
          `);
          setSongSearchResults(res.toArray().map(cleanRow));
        } else {
          const res = await dbConn.query(`
            SELECT DISTINCT a.name AS artist_name
            FROM dim_artista a
            WHERE LOWER(a.name) LIKE '%${escapedQuery}%'
            ORDER BY a.name ASC
            LIMIT 15
          `);
          setArtistSearchResults(res.toArray().map(cleanRow));
        }
      } catch (err) {
        console.error("Search query error:", err);
      } finally {
        setSearchLoading(false);
      }
    };

    const timer = setTimeout(performSearch, 300); // debounce search
    return () => clearTimeout(timer);
  }, [searchQuery, searchType, dbConn]);

  const loadArtistTracks = async (artistName) => {
    if (!dbConn) return;
    setSearchLoading(true);
    setSelectedArtist(artistName);
    
    const escapedArtist = artistName.replace(/'/g, "''").toLowerCase();
    try {
      const res = await dbConn.query(`
        SELECT 
            tr.name AS track_name,
            string_agg(DISTINCT a_all.name, ', ') AS artist_names,
            MIN(f.daily_rank) AS peak_rank,
            COUNT(DISTINCT f.date_key) AS days_on_chart,
            MAX(f.popularity) AS popularity
        FROM fact_chart_entry f
        JOIN dim_traccia tr ON f.track_key = tr.track_key
        JOIN dim_artista a_all ON f.artist_key = a_all.artist_key
        WHERE f.track_key IN (
            SELECT DISTINCT f2.track_key
            FROM fact_chart_entry f2
            JOIN dim_artista a2 ON f2.artist_key = a2.artist_key
            WHERE LOWER(a2.name) = '${escapedArtist}'
        )
        GROUP BY tr.name
        ORDER BY days_on_chart DESC
      `);
      setArtistTracksResults(res.toArray().map(cleanRow));
    } catch (err) {
      console.error("Error loading artist tracks:", err);
    } finally {
      setSearchLoading(false);
    }
  };

  // 5. AI narrative generation
  const generateAINarrative = async () => {
    if (topSongs.length === 0) return;
    setAiLoading(true);

    const avgValenceA = topSongs.reduce((acc, s) => acc + parseFloat(s.valence || 0), 0) / topSongs.length;
    const avgEnergyA = topSongs.reduce((acc, s) => acc + parseFloat(s.energy || 0), 0) / topSongs.length;
    
    let countryBData = [];
    let countryBName = "";
    if (aiCompareMode === 'compare') {
      const targetBCode = aiCompareType === 'local-vs-global' ? 'GL' : selectedCompareCountryB;
      const countryBObj = countries.find(c => c.country_code === targetBCode);
      countryBName = countryBObj ? countryBObj.country_name : targetBCode;

      try {
        const resB = await dbConn.query(`
          WITH weekly_stats_b AS (
              SELECT 
                  tr.name AS track_name,
                  string_agg(DISTINCT a.name, ', ') AS artist_names,
                  AVG(f.popularity) AS popularity,
                  AVG(tr.danceability) AS danceability,
                  AVG(tr.energy) AS energy,
                  AVG(tr.valence) AS valence,
                  SUM(51 - f.daily_rank) AS weekly_score
              FROM fact_chart_entry f
              JOIN dim_tempo t ON f.date_key = t.date_key
              JOIN dim_paese p ON f.country_key = p.country_key
              JOIN dim_traccia tr ON f.track_key = tr.track_key
              JOIN dim_artista a ON f.artist_key = a.artist_key
              WHERE p.country_code = '${targetBCode}'
                AND t.year = ${selectedTimeframe.year}
                AND t.week = ${selectedTimeframe.week}
                ${getGenreSqlCondition(selectedGenre)}
              GROUP BY tr.name
          )
          SELECT 
              ROW_NUMBER() OVER (ORDER BY weekly_score DESC, popularity DESC) AS daily_rank,
              track_name,
              artist_names,
              popularity,
              danceability,
              energy,
              valence
          FROM weekly_stats_b
          ORDER BY daily_rank ASC
        `);
        countryBData = resB.toArray().map(cleanRow);
      } catch (err) {
        console.error("Error querying country B for AI compare:", err);
      }
    }

    const context = {
      analysis_type: aiCompareMode,
      comparison_type: aiCompareType,
      year: selectedTimeframe.year,
      week: selectedTimeframe.week,
      country_a: {
        code: selectedCountry,
        name: countryStats.country_name || selectedCountry,
        avg_valence: avgValenceA.toFixed(2),
        avg_energy: avgEnergyA.toFixed(2),
        top_3_songs: topSongs.slice(0, 3).map(s => `${s.track_name} by ${s.artist_names}`)
      },
      country_b: aiCompareMode === 'compare' ? {
        code: aiCompareType === 'local-vs-global' ? 'GL' : selectedCompareCountryB,
        name: countryBName,
        avg_valence: (countryBData.reduce((acc, s) => acc + parseFloat(s.valence || 0), 0) / (countryBData.length || 1)).toFixed(2),
        avg_energy: (countryBData.reduce((acc, s) => acc + parseFloat(s.energy || 0), 0) / (countryBData.length || 1)).toFixed(2),
        top_3_songs: countryBData.slice(0, 3).map(s => `${s.track_name} by ${s.artist_names}`)
      } : null
    };

    if (customApiKey) {
      try {
        let promptText = "";
        if (context.analysis_type === "compare") {
          const country_a = context.country_a;
          const country_b = context.country_b;
          promptText = `
            Sei un esperto etnomusicologo e analista di dati musicali per Spotify.
            Analizza i dati OLAP estratti dal nostro Data Warehouse in merito alla divergenza culturale.
            
            Stai effettuando un'analisi comparativa tra due mercati per l'anno ${context.year}, settimana ${context.week}:
            
            Mercato A: ${country_a.name} (${country_a.code})
            - Top 3 Brani: ${JSON.stringify(country_a.top_3_songs)}
            - Valence Medio (Felicità musicale): ${country_a.avg_valence}
            - Energy Medio (Intensità musicale): ${country_a.avg_energy}
            
            Mercato B: ${country_b.name} (${country_b.code})
            - Top 3 Brani: ${JSON.stringify(country_b.top_3_songs)}
            - Valence Medio (Felicità musicale): ${country_b.avg_valence}
            - Energy Medio (Intensità musicale): ${country_b.avg_energy}
            
            Fornisci un'analisi narrativa ed elegante (di circa 3-4 paragrafi) in lingua italiana che:
            1. Metta a confronto i due mercati, spiegando se c'è convergenza o forte divergenza culturale (es. se condividono brani simili o se hanno preferenze musicali distinte).
            2. Spieghi come le audio feature medie (valence, energy) riflettono le differenze culturali, sociali o psicografiche delle due nazioni in questo periodo.
            3. Concluda con raccomandazioni strategiche localizzate per Spotify per ottimizzare la penetrazione di mercato e il cross-over culturale.
            
            Rispondi con un tono accademico, entusiasmante e coinvolgente. Non fare riferimenti al codice o al database relazionale nelle risposte.
          `;
        } else {
          promptText = `
            Sei un esperto etnomusicologo e analista di dati musicali per Spotify.
            Analizza i dati OLAP estratti dal nostro Data Warehouse in merito alla divergenza culturale.
            
            Contesto query selezionato dall'utente:
            ${JSON.stringify(context, null, 2)}
            
            Fornisci un'analisi narrativa ed elegante (di circa 3-4 paragrafi) in lingua italiana che spieghi:
            1. Il livello di "Cultural Divergence Index" (Divergenza Culturale) riscontrato nei dati selezionati (es. se i brani preferiti localmente corrispondono o si distaccano dalle classifiche globali).
            2. Come le audio feature (es. danceability, energy, valence) si collegano all'identità culturale dei paesi selezionati.
            3. Una conclusione prescrittiva/strategica per Spotify (es. raccomandazioni di playlist o campagne di marketing localizzate).
            
            Rispondi con un tono accademico, entusiasmante e coinvolgente. Non fare riferimenti al codice o al database relazionale nelle risposte, parla solo di cultura musicale e dati.
          `;
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key=${customApiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: promptText }]
            }]
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error?.message || "Errore nella chiamata Gemma API");
        }

        const data = await response.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        const textParts = parts.filter(p => !p.thought).map(p => p.text);
        const generatedText = textParts.length > 0 ? textParts.join("") : "Nessun testo generato.";
        setAiNarrative(generatedText);
        setAiUsedApi("Gemma 4 (Client-Side)");
      } catch (err) {
        console.error("Errore client-side Gemini:", err);
        setAiNarrative(`Errore nella generazione AI (Client-Side): ${err.message}. Controlla la validità della tua API Key.`);
      } finally {
        setAiLoading(false);
      }
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/ai-analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query_context: context })
      });
      const data = await res.json();
      setAiNarrative(data.analysis);
      setAiUsedApi(data.api_used);
    } catch (err) {
      console.error(err);
      setAiNarrative("Impossibile generare la narrazione AI. Assicurati che il server backend sia attivo.");
    } finally {
      setAiLoading(false);
    }
  };

  // Trigger AI generation when filters change
  useEffect(() => {
    setAiNarrative("");
  }, [selectedCountry, selectedTimeframe, aiCompareMode, aiCompareType, selectedCompareCountryB, selectedGenre]);

  const runGeoQuery = async (category) => {
    if (!dbConn) return;
    let queryText = "";
    if (category === 'continent') {
      queryText = `
        SELECT p.continent, AVG(tr.valence) AS avg_valence, AVG(tr.energy) AS avg_energy, AVG(tr.danceability) AS avg_danceability
        FROM fact_chart_entry f
        JOIN dim_paese p ON f.country_key = p.country_key
        JOIN dim_traccia tr ON f.track_key = tr.track_key
        GROUP BY p.continent
        ORDER BY avg_valence DESC
      `;
    } else if (category === 'language') {
      queryText = `
        SELECT p.language, AVG(tr.valence) AS avg_valence, AVG(tr.energy) AS avg_energy, AVG(tr.danceability) AS avg_danceability
        FROM fact_chart_entry f
        JOIN dim_paese p ON f.country_key = p.country_key
        JOIN dim_traccia tr ON f.track_key = tr.track_key
        WHERE p.language IS NOT NULL AND p.language != 'N/A'
        GROUP BY p.language
        ORDER BY avg_valence DESC
        LIMIT 10
      `;
    } else if (category === 'income_group') {
      queryText = `
        SELECT p.income_group, AVG(tr.valence) AS avg_valence, AVG(tr.energy) AS avg_energy, AVG(tr.danceability) AS avg_danceability
        FROM fact_chart_entry f
        JOIN dim_paese p ON f.country_key = p.country_key
        JOIN dim_traccia tr ON f.track_key = tr.track_key
        WHERE p.income_group IS NOT NULL AND p.income_group != 'N/A'
        GROUP BY p.income_group
        ORDER BY avg_valence DESC
      `;
    }
    await runQueryWithLogging(queryText);
  };

  const getCurrentGeoData = () => {
    if (selectedGeoCategory === 'continent') return geoAudioData;
    if (selectedGeoCategory === 'language') return langAudioData;
    return incomeAudioData;
  };

  // Loading Screen
  if (loading) {
    return (
      <div className="loader-container">
        <div className="loader-spinner"></div>
        <div className="loader-text">Configurazione Data Warehouse locale...</div>
        <div className="loader-progress">{loadingMsg}</div>
      </div>
    );
  }

  const formatNumber = (num) => {
    if (!num) return "N/D";
    return new Intl.NumberFormat('it-IT').format(num);
  };

  const formatCurrency = (num) => {
    if (!num) return "N/D";
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
  };

  const renderSlide = () => {
    switch (currentSlide) {
      case 1:
        return (
          <div className="slide-content">
            <div className="slide-eyebrow">Data Warehouse & Business Intelligence · UNICAL</div>
            <h2 className="slide-title" style={{ fontSize: '3rem' }}>
              Classifiche Globali vs Gusti Locali:<br/>
              Il Gusto Musicale è Standardizzato?
            </h2>
            <p className="slide-subtitle" style={{ fontSize: '1.25rem' }}>
              Un'analisi dimensionale e ROLAP di <strong>2.1 milioni di chart entries</strong> in 72 paesi per quantificare la divergenza culturale locale rispetto alla popolarità globale di Spotify.
            </p>
            <div className="slide-bullets" style={{ marginTop: '20px' }}>
              <div className="slide-bullet">
                <div className="slide-bullet-icon"><Award size={14} /></div>
                <div className="slide-bullet-text">
                  <h4>Presentato da</h4>
                  <p style={{ fontSize: '1.05rem', color: '#fff', fontWeight: 'bold' }}>Lorenzo Pindi — Corso di Data Warehouse</p>
                </div>
              </div>
              <div className="slide-bullet">
                <div className="slide-bullet-icon"><Database size={14} /></div>
                <div className="slide-bullet-text">
                  <h4>Docente di Riferimento</h4>
                  <p>Prof. Giorgio Terracina — A.A. 2025/2026</p>
                </div>
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="slide-content">
            <div className="slide-eyebrow">01 · Il Paradosso di Partenza</div>
            <h2 className="slide-title">Il Paradosso di Popolarità (Hook)</h2>
            <p className="slide-subtitle">
              Spotify assegna uno score di popolarità globale (`popularity`) a ciascun brano. Tuttavia, quando scendiamo nelle classifiche locali (`daily_rank`), scopriamo una discrepanza sistematica:
            </p>
            <div className="slide-card-grid">
              <div className="slide-card">
                <h4>1. Divergenza Sistematica</h4>
                <p>I brani con una popolarità globale di 90+ spesso non riescono ad entrare nella Top 10 delle chart di molte nazioni, bloccati da preferenze culturali autoctone.</p>
              </div>
              <div className="slide-card">
                <h4>2. Barriere Culturali</h4>
                <p>Generi locali come l'Afrobeats in Nigeria, la musica Latina in Sud America o il K-Pop in Corea del Sud creano dei veri e propri ecosistemi musicali resistenti alle hit anglofone.</p>
              </div>
              <div className="slide-card" style={{ borderLeft: '3px solid var(--accent-purple)' }}>
                <h4>3. L'Obiettivo del DWH</h4>
                <p>Costruire una struttura multidimensionale per quantificare la divergenza culturale locale ed esplorare le feature acustiche che la guidano.</p>
              </div>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="slide-content">
            <div className="slide-eyebrow">02 · Reengineering e Data Quality</div>
            <h2 className="slide-title">Fase 2: Data Quality & Cleaning</h2>
            <p className="slide-subtitle">
              Il dataset originale presentava anomalie strutturali che abbiamo classificato e risolto prima del caricamento nel database riconciliato PostgreSQL:
            </p>
            <div className="slide-card-grid">
              <div className="slide-card">
                <span className="badge mnar">MNAR (Missing Not At Random)</span>
                <h4>Righe senza Country</h4>
                <p>1.37% (28,908 righe) rimosse. Rappresentavano aggregati globali senza corrispondenza geografica, incompatibili con le analisi multidimensionali territoriali.</p>
              </div>
              <div className="slide-card">
                <span className="badge mcar">MCAR (Missing Completely At Random)</span>
                <h4>Record Corrotti</h4>
                <p>30 righe prive di titolo o artista eliminate in sicurezza per mancanza di rilevanza statistica.</p>
              </div>
              <div className="slide-card">
                <span className="badge mar">MAR (Missing At Random)</span>
                <h4>Album Mancanti</h4>
                <p>785 tracce (singoli) prive di metadati dell'album. Risolto con l'uso del valore sentinella `[Unknown Album]` per preservare la cronologia delle chart.</p>
              </div>
            </div>
            <div className="sql-log-console" style={{ height: '110px', marginTop: '20px' }}>
              <div className="sql-log-title"><span>Qualità dei Dati</span><span>Orphan Keys = 0</span></div>
              <div className="sql-log-line success">✓ 2,081,378 chart entries filtrate con successo.</div>
              <div className="sql-log-line success">✓ Chiavi sintetiche generate deterministicamente via hash MD5 (Idempotenza garantita).</div>
              <div className="sql-log-line success">✓ Coerenza referenziale e vincoli di dominio verificati al 100% (daily_rank ∈ [1, 50], popularity ∈ [0, 100]).</div>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="slide-content">
            <div className="slide-eyebrow">03 · Integrazione Multidataset e Arricchimento dei Generi</div>
            <h2 className="slide-title">Fase 3: Integrazione e Arricchimento dei Generi Musicali</h2>
            <p className="slide-subtitle">
              Per valorizzare le analisi OLAP basate sui generi musicali, abbiamo sviluppato una pipeline di integrazione dati unendo sorgenti esterne ed estrazioni programmatiche da API ufficiali.
            </p>
            
            <div className="slide-live-panel" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
              <div>
                <div className="slide-bullets">
                  <div className="slide-bullet">
                    <div className="slide-bullet-icon"><Database size={14} /></div>
                    <div className="slide-bullet-text">
                      <h4>Join con Last.fm (Music Info)</h4>
                      <p>Primo tentativo di integrazione deterministica tramite `spotify_id` con il dataset di supporto **Music Info**, risolvendo i tag di genere per <strong>512 artisti</strong>.</p>
                    </div>
                  </div>
                  <div className="slide-bullet">
                    <div className="slide-bullet-icon"><Award size={14} /></div>
                    <div className="slide-bullet-text">
                      <h4>Programmatic Ingestion da Spotify API</h4>
                      <p>Per i restanti <strong>11.000+ artisti</strong> non mappati, abbiamo implementato uno script Python di estrazione programmata via Spotify Web API, con gestione automatica del token di autenticazione e meccanismi di tolleranza all'errore (429 Retry-After).</p>
                    </div>
                  </div>
                  <div className="slide-bullet">
                    <div className="slide-bullet-icon"><RefreshCw size={14} /></div>
                    <div className="slide-bullet-text">
                      <h4>Normalizzazione dei Generi (100% Copertura)</h4>
                      <p>I generi raw restituiti (oltre 200 varianti) sono stati normalizzati in <strong>13 macro-generi coerenti</strong> nel DWH, garantendo integrità referenziale totale per tutti gli artisti e le tracce.</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="glass-panel" style={{ padding: '16px', marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h4 style={{ fontSize: '1rem', color: 'var(--accent-purple)', marginBottom: '12px', textAlign: 'center' }}>Top Generi nel Data Warehouse</h4>
                <div style={{ width: '100%', height: '180px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={genreDistribution} layout="vertical" margin={{ top: 5, right: 15, left: 10, bottom: 5 }}>
                      <XAxis type="number" tick={{ fill: '#9ea2b5', fontSize: 10 }} />
                      <YAxis dataKey="genre" type="category" tick={{ fill: '#9ea2b5', fontSize: 10 }} width={70} />
                      <Tooltip 
                        contentStyle={{ background: '#181c26', border: '1px solid var(--border-light)' }} 
                        labelStyle={{ fontWeight: 'bold', color: '#fff' }}
                      />
                      <Bar dataKey="artist_count" name="Artisti" fill="var(--accent-purple)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="slide-content">
            <div className="slide-eyebrow">04 · Design Concettuale e Logico</div>
            <h2 className="slide-title">Conceptual Design (DFM) & Star Schema</h2>
            <div className="slide-live-panel">
              <div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '12px' }}>
                  Abbiamo progettato un modello dimensionale a stella basato su <strong>1 fatto</strong> (ChartEntry) e <strong>5 dimensioni con gerarchie profonde</strong>.
                </p>
                <div className="slide-bullets">
                  <div className="slide-bullet">
                    <div className="slide-bullet-icon">1</div>
                    <div className="slide-bullet-text">
                      <h4>Pruning Motivato</h4>
                      <p>Rimosse `key`, `mode` e `time_signature` dal DFM in quanto non-aggregabili o costanti (4/4 nel 95% dei casi).</p>
                    </div>
                  </div>
                  <div className="slide-bullet">
                    <div className="slide-bullet-icon">2</div>
                    <div className="slide-bullet-text">
                      <h4>Grafting di Indicatori Geopolitici</h4>
                      <p>Innestati dati socio-economici della Banca Mondiale (PIL pro capite, popolazione, lingua, fascia di reddito) per esplorare le correlazioni con le feature acustiche.</p>
                    </div>
                  </div>
                  <div className="slide-bullet">
                    <div className="slide-bullet-icon">3</div>
                    <div className="slide-bullet-text">
                      <h4>Discretizzazione in Bande</h4>
                      <p>Mappato le feature audio in bande categoriali (`High`, `Medium`, `Low`) per abilitare efficaci group-by e heatmap OLAP.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <div className="dfm-tree-view">
                  <div className="dfm-node">[FactChartEntry]</div>
                  <div className="dfm-link"> ├── DimTempo <span className="dfm-attr">(date_key → week → month → quarter → year)</span></div>
                  <div className="dfm-link"> ├── DimPaese <span className="dfm-attr">(country_key → subregion → continent)</span></div>
                  <div className="dfm-link"> │    └── <span className="dfm-grafted">gdp_per_capita, language, income_group</span> <span className="dfm-attr">(World Bank)</span></div>
                  <div className="dfm-link"> ├── DimTraccia <span className="dfm-attr">(track_key → name, duration, explicit)</span></div>
                  <div className="dfm-link"> │    └── <span className="dfm-grafted">mood_band, energy_band, valence_band</span> <span className="dfm-attr">(Discretizzate)</span></div>
                  <div className="dfm-link"> ├── DimArtista <span className="dfm-attr">(artist_key → name)</span> <span className="dfm-grafted">[N:M Bridge Table]</span></div>
                  <div className="dfm-link"> └── DimAlbum <span className="dfm-attr">(album_key → release_decade)</span></div>
                </div>
                <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  * Densità del cubo stimata inferiore allo 0.00001% → Scelta architettura ROLAP per evitare la sparsità fisica dei cubi MOLAP.
                </div>
              </div>
            </div>
          </div>
        );
      case 6:
        return (
          <div className="slide-content">
            <div className="slide-eyebrow">05 · Analisi Geopolitica & Audio Features</div>
            <h2 className="slide-title">Divergenza Acustica per Fattori Socio-Economici</h2>
            <p className="slide-subtitle">
              Aggregando le audio feature (Valence: positività, Energy: intensità, Acousticness: acusticità) per indicatori macro-geografici, notiamo differenze culturali nette:
            </p>
            
            <div className="slide-live-panel" style={{ gridTemplateColumns: '300px 1fr' }}>
              <div className="glass-panel" style={{ padding: '16px', marginBottom: 0 }}>
                <h4 style={{ fontSize: '1rem', color: 'var(--accent-green)', marginBottom: '12px' }}>Dimensione Geopolitica</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button 
                    className={`btn-secondary ${selectedGeoCategory === 'continent' ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedGeoCategory('continent');
                      runGeoQuery('continent');
                    }}
                    style={{ padding: '8px 12px', fontSize: '0.8rem', background: selectedGeoCategory === 'continent' ? 'rgba(29,185,84,0.15)' : '', borderColor: selectedGeoCategory === 'continent' ? 'var(--accent-green)' : '' }}
                  >
                    Raggruppa per Continente
                  </button>
                  <button 
                    className={`btn-secondary ${selectedGeoCategory === 'language' ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedGeoCategory('language');
                      runGeoQuery('language');
                    }}
                    style={{ padding: '8px 12px', fontSize: '0.8rem', background: selectedGeoCategory === 'language' ? 'rgba(29,185,84,0.15)' : '', borderColor: selectedGeoCategory === 'language' ? 'var(--accent-green)' : '' }}
                  >
                    Top 10 Lingue Primarie
                  </button>
                  <button 
                    className={`btn-secondary ${selectedGeoCategory === 'income_group' ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedGeoCategory('income_group');
                      runGeoQuery('income_group');
                    }}
                    style={{ padding: '8px 12px', fontSize: '0.8rem', background: selectedGeoCategory === 'income_group' ? 'rgba(29,185,84,0.15)' : '', borderColor: selectedGeoCategory === 'income_group' ? 'var(--accent-green)' : '' }}
                  >
                    Fascia di Reddito (Income Group)
                  </button>
                </div>
                <div style={{ marginTop: '16px', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  <strong>Nota Etnomusicologica:</strong> I paesi a lingua romanza (es. Spagnolo, Portoghese) e dell'America Latina mostrano una <strong>Valence (felicità del suono)</strong> nettamente superiore alle nazioni del Nord Europa.
                </div>
              </div>
              
              <div className="glass-panel" style={{ padding: '16px', marginBottom: 0, minHeight: '260px' }}>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={getCurrentGeoData()} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey={selectedGeoCategory} tick={{ fill: '#9ea2b5', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#9ea2b5', fontSize: 10 }} domain={[0, 1]} />
                    <Tooltip 
                      contentStyle={{ background: '#181c26', border: '1px solid var(--border-light)' }} 
                      labelStyle={{ fontWeight: 'bold', color: '#fff' }}
                    />
                    <Bar dataKey="avg_valence" name="Valence (Allegria)" fill="var(--accent-green)" />
                    <Bar dataKey="avg_energy" name="Energy (Intensità)" fill="var(--accent-purple)" />
                    <Bar dataKey="avg_danceability" name="Danceability" fill="var(--accent-blue)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className="sql-log-console" style={{ height: '80px', marginTop: '12px' }}>
              <div className="sql-log-title"><span>DuckDB-WASM Live SQL Logger</span><span>Stato: Pronto</span></div>
              {sqlLogs.slice(-2).map((log, idx) => (
                <div key={idx} className={`sql-log-line ${log.type}`}>
                  {log.type === 'query' ? 'SQL>' : 'RES>'} {log.text}
                </div>
              ))}
            </div>
          </div>
        );
      case 7:
        return (
          <div className="slide-content">
            <div className="slide-eyebrow">06 · Confronto Architetturale Live</div>
            <h2 className="slide-title">Benchmark Live: ROLAP vs MOLAP</h2>
            <p className="slide-subtitle">
              Dimostrazione empirica a schermo: la stessa query analitica complessa viene eseguita sulla tabella dei fatti relazionale (Star Schema con join) rispetto ad una tabella pre-aggregata (MOLAP).
            </p>
            
            <div className="slide-live-panel">
              <div className="glass-panel" style={{ padding: '20px', marginBottom: 0 }}>
                <h4 style={{ fontSize: '1.1rem', color: 'var(--accent-purple)', marginBottom: '12px' }}>ROLAP (Star Schema Join)</h4>
                <pre style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px', height: '140px', overflowY: 'auto' }}>
{`SELECT 
    p.country_name,
    AVG(f.daily_rank) AS avg_rank,
    AVG(tr.valence) AS avg_valence
FROM fact_chart_entry f
JOIN dim_tempo t ON f.date_key = t.date_key
JOIN dim_paese p ON f.country_key = p.country_key
JOIN dim_traccia tr ON f.track_key = tr.track_key
WHERE t.year = ${selectedTimeframe.year} AND t.week = ${selectedTimeframe.week}
GROUP BY p.country_name`}
                </pre>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                  <span>Tempo ROLAP:</span>
                  <strong style={{ color: 'var(--accent-purple)', fontFamily: 'monospace', fontSize: '1.2rem' }}>
                    {benchmarkStatus === 'running' ? 'Calcolo...' : `${rolapTime.toFixed(1)} ms`}
                  </strong>
                </div>
              </div>
              
              <div className="glass-panel" style={{ padding: '20px', marginBottom: 0 }}>
                <h4 style={{ fontSize: '1.1rem', color: 'var(--accent-blue)', marginBottom: '12px' }}>MOLAP (Pre-aggregazione)</h4>
                <pre style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px', height: '140px', overflowY: 'auto' }}>
{`SELECT 
    country_name,
    avg_rank,
    avg_valence
FROM molap_track_country_weekly
WHERE year = ${selectedTimeframe.year} AND week = ${selectedTimeframe.week}`}
                </pre>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                  <span>Tempo MOLAP:</span>
                  <strong style={{ color: 'var(--accent-blue)', fontFamily: 'monospace', fontSize: '1.2rem' }}>
                    {benchmarkStatus === 'running' ? 'Calcolo...' : `${molapTime.toFixed(1)} ms`}
                  </strong>
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', background: 'rgba(255,255,255,0.03)', padding: '14px 20px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              <div>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>MOLAP Speedup Riscontrato: </span>
                {rolapTime > 0 && molapTime > 0 ? (
                  <strong style={{ color: 'var(--accent-green)', fontSize: '1.1rem' }}>{(rolapTime / molapTime).toFixed(1)}x più veloce</strong>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>Avvia il benchmark</span>
                )}
              </div>
              <button className="btn-primary" onClick={runBenchmark} disabled={benchmarkStatus === 'running'}>
                <RefreshCw size={16} /> Esegui Benchmark Live
              </button>
            </div>
          </div>
        );
      case 8:
        const olapHeaders = {
          slice: "Valence",
          dice: "Genere",
          drill: "Dettaglio Temporale",
          rollup: "Livello Geografico",
          pivot: "Fascia Reddito"
        };
        return (
          <div className="slide-content">
            <div className="slide-eyebrow">07 · Operazioni OLAP nel Data Warehouse</div>
            <h2 className="slide-title">Dimostrazione Operazioni OLAP Live</h2>
            <p className="slide-subtitle">
              Sperimenta live come le operazioni teoriche del corso si traducono in query SQL eseguite all'istante sulla nostra architettura ROLAP.
            </p>

            {/* Pannello Selettori Interattivi */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-light)', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--accent-purple)' }}>Parametri OLAP:</span>
              
              {/* Paese */}
              {selectedOlapOp !== 'rollup' && selectedOlapOp !== 'pivot' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Paese:</label>
                  <select 
                    value={olapCountry} 
                    onChange={(e) => setOlapCountry(e.target.value)}
                    style={{ background: '#1c202a', color: '#fff', border: '1px solid var(--border-light)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', outline: 'none' }}
                  >
                    {countries.map(c => (
                      <option key={c.country_code} value={c.country_code}>
                        {c.country_name} ({c.country_code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Anno */}
              {selectedOlapOp !== 'slice' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Anno:</label>
                  <select 
                    value={olapYear} 
                    onChange={(e) => setOlapYear(Number(e.target.value))}
                    style={{ background: '#1c202a', color: '#fff', border: '1px solid var(--border-light)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', outline: 'none' }}
                  >
                    <option value={2023}>2023</option>
                    <option value={2024}>2024</option>
                    <option value={2025}>2025</option>
                  </select>
                </div>
              )}

              {/* Settimana */}
              {selectedOlapOp !== 'slice' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Settimana:</label>
                  <select 
                    value={olapWeek} 
                    onChange={(e) => setOlapWeek(Number(e.target.value))}
                    style={{ background: '#1c202a', color: '#fff', border: '1px solid var(--border-light)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', outline: 'none' }}
                  >
                    {(() => {
                      let weeks = [];
                      if (olapYear === 2023) {
                        for (let w = 42; w <= 52; w++) weeks.push(w);
                      } else if (olapYear === 2025) {
                        for (let w = 1; w <= 24; w++) weeks.push(w);
                      } else {
                        for (let w = 1; w <= 52; w++) weeks.push(w);
                      }
                      return weeks.map(w => (
                        <option key={w} value={w}>Settimana {w}</option>
                      ));
                    })()}
                  </select>
                </div>
              )}

              {/* Genere (Solo Dice) */}
              {selectedOlapOp === 'dice' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Genere:</label>
                  <select 
                    value={olapGenre} 
                    onChange={(e) => setOlapGenre(e.target.value)}
                    style={{ background: '#1c202a', color: '#fff', border: '1px solid var(--border-light)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', outline: 'none' }}
                  >
                    <option value="Hip-Hop">Hip-Hop</option>
                    <option value="Pop">Pop</option>
                    <option value="Rock">Rock</option>
                    <option value="Indie">Indie</option>
                    <option value="Trap">Trap</option>
                    <option value="Dance/Electronic">Dance/Electronic</option>
                  </select>
                </div>
              )}

              {/* Fascia Reddito (Solo Pivot) */}
              {selectedOlapOp === 'pivot' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Reddito:</label>
                  <select 
                    value={olapIncomeGroup} 
                    onChange={(e) => setOlapIncomeGroup(e.target.value)}
                    style={{ background: '#1c202a', color: '#fff', border: '1px solid var(--border-light)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', outline: 'none' }}
                  >
                    <option value="High income">High</option>
                    <option value="Upper-middle income">Middle</option>
                    <option value="Lower-middle income">Low</option>
                  </select>
                </div>
              )}
            </div>

            <div className="slide-live-panel" style={{ gridTemplateColumns: '1fr 1.2fr', gap: '20px' }}>
              {/* Colonna Sinistra: Selezione Operazione */}
              <div className="glass-panel" style={{ padding: '16px', marginBottom: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h4 style={{ fontSize: '1rem', color: 'var(--accent-green)', marginBottom: '8px' }}>Seleziona Operazione OLAP</h4>
                
                <button 
                  className={`btn-secondary ${selectedOlapOp === 'slice' ? 'active' : ''}`}
                  onClick={() => setSelectedOlapOp('slice')}
                  style={{ padding: '10px 14px', fontSize: '0.85rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '2px', background: selectedOlapOp === 'slice' ? 'rgba(29,185,84,0.15)' : '', borderColor: selectedOlapOp === 'slice' ? 'var(--accent-green)' : '' }}
                >
                  <strong style={{ color: selectedOlapOp === 'slice' ? 'var(--accent-green)' : '#fff' }}>1. SLICE (Affettamento)</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Isola un singolo Paese (es. IT) sull'intero arco temporale.</span>
                </button>

                <button 
                  className={`btn-secondary ${selectedOlapOp === 'dice' ? 'active' : ''}`}
                  onClick={() => setSelectedOlapOp('dice')}
                  style={{ padding: '10px 14px', fontSize: '0.85rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '2px', background: selectedOlapOp === 'dice' ? 'rgba(29,185,84,0.15)' : '', borderColor: selectedOlapOp === 'dice' ? 'var(--accent-green)' : '' }}
                >
                  <strong style={{ color: selectedOlapOp === 'dice' ? 'var(--accent-green)' : '#fff' }}>2. DICE (Dadolatura)</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Filtra contemporaneamente su più dimensioni (Paese, Genere, Anno, Settimana).</span>
                </button>

                <button 
                  className={`btn-secondary ${selectedOlapOp === 'drill' ? 'active' : ''}`}
                  onClick={() => setSelectedOlapOp('drill')}
                  style={{ padding: '10px 14px', fontSize: '0.85rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '2px', background: selectedOlapOp === 'drill' ? 'rgba(29,185,84,0.15)' : '', borderColor: selectedOlapOp === 'drill' ? 'var(--accent-green)' : '' }}
                >
                  <strong style={{ color: selectedOlapOp === 'drill' ? 'var(--accent-green)' : '#fff' }}>3. DRILL-DOWN (Dettaglio)</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Scende dal livello di aggregazione Anno a quello di dettaglio Settimana.</span>
                </button>

                <button 
                  className={`btn-secondary ${selectedOlapOp === 'rollup' ? 'active' : ''}`}
                  onClick={() => setSelectedOlapOp('rollup')}
                  style={{ padding: '10px 14px', fontSize: '0.85rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '2px', background: selectedOlapOp === 'rollup' ? 'rgba(29,185,84,0.15)' : '', borderColor: selectedOlapOp === 'rollup' ? 'var(--accent-green)' : '' }}
                >
                  <strong style={{ color: selectedOlapOp === 'rollup' ? 'var(--accent-green)' : '#fff' }}>4. ROLL-UP (Aggregazione)</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Sale di aggregazione passando da Paese (IT) a Globale (GL).</span>
                </button>

                <button 
                  className={`btn-secondary ${selectedOlapOp === 'pivot' ? 'active' : ''}`}
                  onClick={() => setSelectedOlapOp('pivot')}
                  style={{ padding: '10px 14px', fontSize: '0.85rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '2px', background: selectedOlapOp === 'pivot' ? 'rgba(29,185,84,0.15)' : '', borderColor: selectedOlapOp === 'pivot' ? 'var(--accent-green)' : '' }}
                >
                  <strong style={{ color: selectedOlapOp === 'pivot' ? 'var(--accent-green)' : '#fff' }}>5. PIVOT / ROTATE (Rotazione)</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Ruota l'asse per confrontare i dati per Fascia di Reddito.</span>
                </button>
              </div>

              {/* Colonna Destra: Query e Risultati */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Pannello Query */}
                <div className="glass-panel" style={{ padding: '14px', marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 style={{ fontSize: '0.9rem', color: 'var(--accent-purple)', margin: 0 }}>Query SQL Generata</h4>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Eseguita su DuckDB-WASM</span>
                  </div>
                  <pre style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#a5b4fc', background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '6px', overflowX: 'auto', margin: 0, maxHeight: '110px', overflowY: 'auto' }}>
                    {olapPlaygroundQuery.trim()}
                  </pre>
                </div>

                {/* Pannello Risultati */}
                <div className="glass-panel" style={{ padding: '14px', marginBottom: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '10px', marginTop: 0 }}>
                    Risultato (Top 5 Tracce)
                  </h4>
                  {olapPlaygroundLoading ? (
                    <div style={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: '120px' }}>
                      <div className="loader-spinner" style={{ width: '24px', height: '24px' }}></div>
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto', flex: 1 }}>
                      <table className="song-table" style={{ fontSize: '0.8rem', width: '100%' }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '8px', width: '50px' }}>Rank</th>
                            <th style={{ padding: '8px' }}>Titolo</th>
                            <th style={{ padding: '8px' }}>Artista</th>
                            <th style={{ padding: '8px', textAlign: 'right' }}>{olapHeaders[selectedOlapOp] || 'Misura'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {olapPlaygroundResult.map((row, i) => (
                            <tr key={i}>
                              <td style={{ padding: '8px', color: 'var(--accent-green)', fontWeight: 'bold' }}>#{row.Rank || row.rank || (i + 1)}</td>
                              <td style={{ padding: '8px', fontWeight: '500' }}>{row.Track || row.track}</td>
                              <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{row.Artist || row.artist}</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: 'var(--accent-purple)', fontWeight: '500' }}>
                                {String(row.Info || row.info || '')}
                              </td>
                            </tr>
                          ))}
                          {olapPlaygroundResult.length === 0 && (
                            <tr>
                              <td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>Nessun dato restituito</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      case 9:
        return (
          <div className="slide-content">
            <div className="slide-eyebrow">08 · OLAP Dinamico & Simulatore What-If</div>
            <h2 className="slide-title">Dimostrazione OLAP What-If</h2>
            <p className="slide-subtitle">
              Sperimenta live sulla chart di <strong>{countryStats.country_name || selectedCountry}</strong> per l'anno {selectedTimeframe.year} (Settimana {selectedTimeframe.week}). Modificando i pesi, DuckDB-WASM ricalcola all'istante la classifica pesando la popolarità globale vs locale.
            </p>

            {/* Pannello Selettori Interattivi */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-light)', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--accent-purple)' }}>Parametri Simulazione:</span>
              
              {/* Paese */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Paese:</label>
                <select 
                  value={selectedCountry} 
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  style={{ background: '#1c202a', color: '#fff', border: '1px solid var(--border-light)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', outline: 'none' }}
                >
                  {countries.map(c => (
                    <option key={c.country_code} value={c.country_code}>
                      {c.country_name} ({c.country_code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Anno */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Anno:</label>
                <select 
                  value={selectedTimeframe.year} 
                  onChange={(e) => setSelectedTimeframe(prev => ({ ...prev, year: Number(e.target.value) }))}
                  style={{ background: '#1c202a', color: '#fff', border: '1px solid var(--border-light)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', outline: 'none' }}
                >
                  <option value={2023}>2023</option>
                  <option value={2024}>2024</option>
                  <option value={2025}>2025</option>
                </select>
              </div>

              {/* Settimana */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Settimana:</label>
                <select 
                  value={selectedTimeframe.week} 
                  onChange={(e) => setSelectedTimeframe(prev => ({ ...prev, week: Number(e.target.value) }))}
                  style={{ background: '#1c202a', color: '#fff', border: '1px solid var(--border-light)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', outline: 'none' }}
                >
                  {(() => {
                    let weeks = [];
                    if (selectedTimeframe.year === 2023) {
                      for (let w = 42; w <= 52; w++) weeks.push(w);
                    } else if (selectedTimeframe.year === 2025) {
                      for (let w = 1; w <= 24; w++) weeks.push(w);
                    } else {
                      for (let w = 1; w <= 52; w++) weeks.push(w);
                    }
                    return weeks.map(w => (
                      <option key={w} value={w}>Settimana {w}</option>
                    ));
                  })()}
                </select>
              </div>
            </div>

            <div className="slide-live-panel" style={{ gridTemplateColumns: '320px 1fr' }}>
              <div className="glass-panel" style={{ padding: '20px', marginBottom: 0 }}>
                <h4 style={{ fontSize: '1rem', color: 'var(--accent-purple)', marginBottom: '12px' }}>Pesi Modello What-If</h4>
                
                <div className="slider-group">
                  <div className="slider-item">
                    <div className="slider-label">
                      <span>Identità Locale</span>
                      <strong style={{ color: 'var(--accent-green)' }}>{localWeight}%</strong>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      className="slider-input" 
                      value={localWeight} 
                      onChange={(e) => {
                        setLocalWeight(e.target.value);
                        setGlobalWeight(100 - e.target.value);
                      }}
                    />
                  </div>
                  
                  <div className="slider-item" style={{ marginTop: '10px' }}>
                    <div className="slider-label">
                      <span>Popolarità Globale</span>
                      <strong style={{ color: 'var(--accent-purple)' }}>{globalWeight}%</strong>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      className="slider-input" 
                      value={globalWeight} 
                      onChange={(e) => {
                        setGlobalWeight(e.target.value);
                        setLocalWeight(100 - e.target.value);
                      }}
                    />
                  </div>
                </div>
                
                <div style={{ marginTop: '20px', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  <p><strong>Operazioni OLAP simulate:</strong></p>
                  <p style={{ marginTop: '6px' }}><span style={{ color: 'var(--accent-green)', fontWeight: 'bold' }}>Slice</span>: Nazione = {selectedCountry}</p>
                  <p><span style={{ color: 'var(--accent-green)', fontWeight: 'bold' }}>Drill-down</span>: Tempo = Anno {selectedTimeframe.year}, Settimana {selectedTimeframe.week}</p>
                </div>
              </div>
              
              <div className="glass-panel" style={{ padding: '16px', marginBottom: 0 }}>
                <h4 style={{ fontSize: '0.95rem', marginBottom: '10px' }}>Top 5 Tracce Ricalcolate in Tempo Reale</h4>
                <table className="song-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '8px' }}>Rank</th>
                      <th style={{ padding: '8px' }}>Titolo</th>
                      <th style={{ padding: '8px' }}>Artista</th>
                      <th style={{ padding: '8px' }}>Original Rank</th>
                      <th style={{ padding: '8px' }}>Popularity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulatedSongs.slice(0, 5).map((s, idx) => (
                      <tr key={idx} onClick={() => loadTrackDetail(s.track_name, 'pitch')} style={{ cursor: 'pointer' }}>
                        <td style={{ padding: '8px', color: 'var(--accent-purple)', fontWeight: 'bold' }}>#{idx + 1}</td>
                        <td style={{ padding: '8px', fontWeight: '500' }}>{s.track_name}</td>
                        <td style={{ padding: '8px' }}>{renderArtistCell(s.artist_names)}</td>
                        <td style={{ padding: '8px' }}>#{s.daily_rank}</td>
                        <td style={{ padding: '8px' }}>{s.popularity != null ? Math.round(s.popularity) : 'N/D'}/100</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      case 10:
        const targetBCode = aiCompareType === 'local-vs-global' ? 'GL' : selectedCompareCountryB;
        const countryBObj = countries.find(c => c.country_code === targetBCode);
        const countryBName = countryBObj ? countryBObj.country_name : targetBCode;
        const countryAName = countries.find(c => c.country_code === selectedCountry)?.country_name || selectedCountry;

        return (
          <div className="slide-content">
            <div className="slide-eyebrow">09 · Narrazione Culturale con Gemma 4</div>
            <h2 className="slide-title">Narrazione Generata e Caching</h2>
            <p className="slide-subtitle">
              Per comprendere il "perché" dietro i dati musicali, abbiamo integrato il modello <strong>Gemma 4 (gemma-4-31b-it)</strong>. Le analyses sono salvate in cache con la firma MD5 del cubo.
            </p>
            
            <div className="glass-panel" style={{ marginBottom: 0, padding: '24px' }}>
              {/* Selettori Interattivi per l'Analisi */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border-light)' }}>
                {/* Paese A */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 150px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Paese Principale (A)</label>
                  <select 
                    value={selectedCountry} 
                    onChange={(e) => setSelectedCountry(e.target.value)}
                    style={{ background: '#1c202a', color: '#fff', border: '1px solid var(--border-light)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.85rem', outline: 'none' }}
                  >
                    {countries.map(c => (
                      <option key={c.country_code} value={c.country_code}>
                        {c.country_name} ({c.country_code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Modalità Analisi */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 180px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Modalità Analisi</label>
                  <select 
                    value={aiCompareMode} 
                    onChange={(e) => setAiCompareMode(e.target.value)}
                    style={{ background: '#1c202a', color: '#fff', border: '1px solid var(--border-light)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.85rem', outline: 'none' }}
                  >
                    <option value="single">Analisi Singola</option>
                    <option value="compare">Analisi Comparativa (OLAP Join)</option>
                  </select>
                </div>

                {/* Tipo Confronto */}
                {aiCompareMode === 'compare' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 180px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Tipo Confronto</label>
                    <select 
                      value={aiCompareType} 
                      onChange={(e) => setAiCompareType(e.target.value)}
                      style={{ background: '#1c202a', color: '#fff', border: '1px solid var(--border-light)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.85rem', outline: 'none' }}
                    >
                      <option value="local-vs-global">Paese A vs Globale</option>
                      <option value="two-countries">Paese A vs Altro Paese</option>
                    </select>
                  </div>
                )}

                {/* Paese B */}
                {aiCompareMode === 'compare' && aiCompareType === 'two-countries' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 150px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Confronta con (B)</label>
                    <select 
                      value={selectedCompareCountryB} 
                      onChange={(e) => setSelectedCompareCountryB(e.target.value)}
                      style={{ background: '#1c202a', color: '#fff', border: '1px solid var(--border-light)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.85rem', outline: 'none' }}
                    >
                      {countries.map(c => (
                        <option key={c.country_code} value={c.country_code}>
                          {c.country_name} ({c.country_code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Riga Generazione / API Key */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--accent-purple)', margin: 0 }}>
                  {aiCompareMode === 'compare' ? (
                    <>Report Comparativo: {countryAName} vs {aiCompareType === 'local-vs-global' ? 'Globale' : countryBName}</>
                  ) : (
                    <>Report Culturale per {countryAName}</>
                  )}
                </h4>
                
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <input 
                    type="password"
                    placeholder="Gemini API Key..."
                    value={customApiKey}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomApiKey(val);
                      if (val) {
                        localStorage.setItem("user_gemini_api_key", val);
                      } else {
                        localStorage.removeItem("user_gemini_api_key");
                      }
                    }}
                    style={{ background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid var(--border-light)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', width: '180px' }}
                  />
                  <button 
                    className="btn-primary" 
                    style={{ background: 'var(--accent-purple)', color: '#fff', padding: '8px 16px', fontSize: '0.85rem' }}
                    onClick={generateAINarrative}
                    disabled={aiLoading}
                  >
                    {aiLoading ? 'Generazione...' : 'Genera con Gemma 4'}
                  </button>
                </div>
              </div>
              
              {/* Area Testo Analisi */}
              <div style={{ height: '160px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                {aiNarrative ? (
                  <div dangerouslySetInnerHTML={{ __html: aiNarrative.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\n/g, '<br/>') }}></div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    Clicca sul bottone per avviare l'analisi etnomusicologica del mercato di {countryAName}
                    {aiCompareMode === 'compare' && <> rispetto a {aiCompareType === 'local-vs-global' ? 'Globale' : countryBName}</>}.
                  </div>
                )}
              </div>
              
              {aiNarrative && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span>Used Engine: {aiUsedApi}</span>
                  <span>Cache Key: md5-{selectedCountry.toLowerCase()}-{aiCompareMode === 'compare' ? (aiCompareType === 'local-vs-global' ? 'gl' : selectedCompareCountryB.toLowerCase()) : 'single'}-{selectedTimeframe.year}</span>
                </div>
              )}
            </div>
          </div>
        );
      case 11:
        return (
          <div className="slide-content">
            <div className="slide-eyebrow">Conclusioni & Link</div>
            <h2 className="slide-title">Conclusioni del Progetto</h2>
            <div className="slide-card-grid">
              <div className="slide-card">
                <h4>1. Resistenza Culturale</h4>
                <p>La globalizzazione dei consumi non ha spazzato via i gusti locali. Le barriere linguistiche e i generi autoctoni resistono e creano mercati stabili.</p>
              </div>
              <div className="slide-card">
                <h4>2. L'efficacia di ROLAP</h4>
                <p>DuckDB-WASM consente di operare in-browser in modo efficiente su milioni di righe, eseguendo aggregazioni comvesse senza tempi di attesa server.</p>
              </div>
              <div className="slide-card">
                <h4>3. Viste Materializzate per l'AI</h4>
                <p>L'uso di una firma di hash MD5 consente di materializzare i report AI, invalidandoli solo al mutare dei dati nel DWH.</p>
              </div>
            </div>
            
            <div style={{ marginTop: '30px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <a href="https://github.com/LolloPindi/Spotify-dwh" target="_blank" className="btn-secondary" style={{ textDecoration: 'none' }}>
                Codice Progetto (GitHub)
              </a>
              <a href="https://public.tableau.com/" target="_blank" className="btn-secondary" style={{ textDecoration: 'none' }}>
                Tableau Public Dashboard
              </a>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="app-container">
      {/* HEADER */}
      <header className="app-header">
        <div className="app-title-group">
          <h1><Compass size={32} className="text-green" /> Spotify DWH</h1>
          <p>Esplora la Divergenza Culturale tra Classifiche Locali e Hit Globali (OLAP in-browser via DuckDB-WASM)</p>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div className="mode-toggle-container">
            <button 
              className={`mode-toggle-btn ${viewMode === 'dashboard' ? 'active' : ''}`}
              onClick={() => setViewMode('dashboard')}
            >
              <BarChart2 size={16} /> Dashboard
            </button>
            <button 
              className={`mode-toggle-btn ${viewMode === 'pitch' ? 'active pitch' : ''}`}
              onClick={() => {
                setViewMode('pitch');
                setCurrentSlide(1);
              }}
            >
              <Presentation size={16} /> Pitch Presentazione
            </button>
          </div>
          <span className="status-badge"><Globe size={16} /> DuckDB-WASM Attivo</span>
          <span className="signature-badge">MD5 DWH Cache Checked</span>
        </div>
      </header>

      {/* RENDER MODE */}
      {selectedDetailTrack ? (
        /* CARD DETTAGLIO BRANO */
        <div className="track-detail-container animate-fade-in" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
          {/* Back button */}
          <button 
            className="btn-secondary" 
            onClick={() => {
              setSelectedDetailTrack(null);
              setTrackDetailData(null);
              setTrackHistoryData([]);
            }}
            style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-light)', color: 'var(--text-main)', padding: '10px 16px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: '600' }}
          >
            <ArrowLeft size={18} /> Torna alla {detailSourceMode === 'pitch' ? 'Presentazione' : 'Dashboard'}
          </button>

          {trackDetailData && (
            <div className="track-detail-content" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Header card */}
              <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <h1 style={{ fontFamily: 'var(--font-title)', fontSize: '2rem', margin: 0, color: 'var(--text-main)' }}>
                      {trackDetailData.track_name}
                    </h1>
                    {trackDetailData.is_explicit === 1 && (
                      <span style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: 'bold', 
                        background: 'rgba(255, 0, 0, 0.2)', 
                        color: '#ff4d4d', 
                        padding: '2px 6px', 
                        borderRadius: '4px' 
                      }}>
                        EXPLICIT
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', margin: 0, display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                    {trackDetailData.artist_names ? (
                      trackDetailData.artist_names.split(', ').map((artist, idx) => (
                        <React.Fragment key={idx}>
                          {idx > 0 && <span style={{ color: 'var(--text-secondary)', marginRight: '4px' }}>,</span>}
                          <span 
                            onClick={() => {
                              setSelectedDetailTrack(null);
                              setTrackDetailData(null);
                              setTrackHistoryData([]);
                              
                              setActiveTab('search');
                              setSearchType('artist');
                              setSearchQuery(artist);
                              loadArtistTracks(artist);
                            }}
                            style={{ 
                              color: 'var(--accent-green)', 
                              textDecoration: 'underline', 
                              cursor: 'pointer',
                              fontWeight: '600'
                            }}
                          >
                            {artist}
                          </span>
                        </React.Fragment>
                      ))
                    ) : 'N/D'}
                  </p>
                </div>
                
                {trackDetailData.spotify_id && (
                  <a 
                    href={`https://open.spotify.com/track/${trackDetailData.spotify_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary"
                    style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px', background: 'var(--accent-green)', color: '#000', fontWeight: 'bold' }}
                  >
                    Apri su Spotify
                  </a>
                )}
              </div>

              {/* Three column grid of details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                {/* Album Info */}
                <div className="glass-panel">
                  <h3 style={{ color: 'var(--accent-green)', marginBottom: '16px', fontSize: '1.1rem' }}>Dati dell'Album</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Nome Album</div>
                      <div style={{ fontWeight: '500' }}>{trackDetailData.album_name || 'N/D'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Data di Rilascio</div>
                      <div>{trackDetailData.release_date ? new Date(trackDetailData.release_date).toLocaleDateString('it-IT') : 'N/D'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Anno di Rilascio</div>
                      <div>{trackDetailData.release_year || 'N/D'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Durata Traccia</div>
                      <div>{trackDetailData.duration_ms ? `${Math.floor(trackDetailData.duration_ms / 60000)}m ${Math.floor((trackDetailData.duration_ms % 60000) / 1000)}s` : 'N/D'}</div>
                    </div>
                  </div>
                </div>

                {/* Warehouse Stats */}
                <div className="glass-panel">
                  <h3 style={{ color: 'var(--accent-purple)', marginBottom: '16px', fontSize: '1.1rem' }}>Statistiche DWH ({selectedTimeframe.year})</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Miglior Posizione Raggiunta (Peak Rank)</div>
                      <div style={{ fontWeight: 'bold', fontSize: '1.4rem', color: 'var(--accent-purple)' }}>#{trackDetailData.peak_rank_all_time}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Giorni in Classifica (Max)</div>
                      <div style={{ fontWeight: 'bold' }}>{trackDetailData.max_days_on_chart} giorni</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Paesi Conquistati</div>
                      <div style={{ fontWeight: 'bold', color: 'var(--accent-blue)' }}>{trackDetailData.max_countries_charted} nazioni</div>
                    </div>
                  </div>
                </div>

                {/* Audio Features */}
                <div className="glass-panel">
                  <h3 style={{ color: 'var(--accent-blue)', marginBottom: '16px', fontSize: '1.1rem' }}>Caratteristiche Audio</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Danceability */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                        <span>Danceability ({trackDetailData.energy_band || 'N/D'})</span>
                        <strong>{(trackDetailData.danceability * 100).toFixed(0)}%</strong>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.05)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ background: 'var(--accent-green)', width: `${trackDetailData.danceability * 100}%`, height: '100%' }}></div>
                      </div>
                    </div>
                    {/* Energy */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                        <span>Energy ({trackDetailData.valence_band || 'N/D'})</span>
                        <strong>{(trackDetailData.energy * 100).toFixed(0)}%</strong>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.05)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ background: 'var(--accent-purple)', width: `${trackDetailData.energy * 100}%`, height: '100%' }}></div>
                      </div>
                    </div>
                    {/* Valence */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                        <span>Valence / Felicità ({trackDetailData.mood_band || 'N/D'})</span>
                        <strong>{(trackDetailData.valence * 100).toFixed(0)}%</strong>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.05)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ background: 'var(--accent-blue)', width: `${trackDetailData.valence * 100}%`, height: '100%' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* History / Trend Charts */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '24px', marginTop: '24px' }}>
                
                {/* 1. Global Chart */}
                <div className="glass-panel" style={{ minHeight: '350px' }}>
                  <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', color: 'var(--accent-purple)' }}>Andamento Globale (Global)</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Andamento della posizione giornaliera nella classifica globale di Spotify. L'asse Y è invertito.
                  </p>
                  <div style={{ height: '300px', width: '100%' }}>
                    {globalHistoryData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={globalHistoryData}>
                          <XAxis dataKey="formatted_date" tick={{ fill: '#9ea2b5', fontSize: 10 }} />
                          <YAxis tick={{ fill: '#9ea2b5', fontSize: 10 }} reversed domain={[1, 50]} />
                          <Tooltip contentStyle={{ background: '#181c26', border: '1px solid var(--border-light)', color: '#fff' }} />
                          <Line type="monotone" dataKey="daily_rank" name="Posizione Globale" stroke="var(--accent-purple)" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', textAlign: 'center', padding: '24px' }}>
                        Nessun dato storico globale disponibile per questo brano nel {selectedTimeframe.year}.
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Country Chart */}
                <div className="glass-panel" style={{ minHeight: '350px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--accent-green)' }}>Andamento Nazionale</h3>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Paese:</span>
                      <select 
                        value={selectedChartCountry} 
                        onChange={(e) => setSelectedChartCountry(e.target.value)}
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid var(--border-light)',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          color: 'var(--text-main)',
                          fontSize: '0.85rem',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        {chartCountries.map(c => (
                          <option 
                            key={c.country_code} 
                            value={c.country_code}
                            style={{ background: '#181c26', color: '#fff' }}
                          >
                            {c.country_name} ({c.country_code})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Andamento della posizione giornaliera in classifica per <strong>{chartCountries.find(c => c.country_code === selectedChartCountry)?.country_name || selectedChartCountry}</strong>. L'asse Y è invertito.
                  </p>
                  <div style={{ height: '300px', width: '100%' }}>
                    {trackHistoryData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trackHistoryData}>
                          <XAxis dataKey="formatted_date" tick={{ fill: '#9ea2b5', fontSize: 10 }} />
                          <YAxis tick={{ fill: '#9ea2b5', fontSize: 10 }} reversed domain={[1, 50]} />
                          <Tooltip contentStyle={{ background: '#181c26', border: '1px solid var(--border-light)', color: '#fff' }} />
                          <Line type="monotone" dataKey="daily_rank" name="Posizione Locale" stroke="var(--accent-green)" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', textAlign: 'center', padding: '24px' }}>
                        Nessun dato storico locale disponibile per questo brano in {chartCountries.find(c => c.country_code === selectedChartCountry)?.country_name || selectedChartCountry} nel {selectedTimeframe.year}.
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          )}
        </div>
      ) : viewMode === 'pitch' ? (
        /* PITCH SLIDESHOW */
        <div className="pitch-container">
          {renderSlide()}
          
          <div className="slide-navigation">
            <div className="slide-dots">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((s) => (
                <button 
                  key={s} 
                  className={`slide-dot ${currentSlide === s ? 'active' : ''}`}
                  onClick={() => setCurrentSlide(s)}
                  title={`Slide ${s}`}
                />
              ))}
            </div>
            
            <div className="slide-nav-buttons">
              <button 
                className="slide-nav-btn" 
                onClick={() => setCurrentSlide(prev => Math.max(prev - 1, 1))}
                disabled={currentSlide === 1}
              >
                <ChevronLeft size={20} />
              </button>
              <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                Slide {currentSlide} di 11
              </span>
              <button 
                className="slide-nav-btn" 
                onClick={() => setCurrentSlide(prev => Math.min(prev + 1, 11))}
                disabled={currentSlide === 11}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* DASHBOARD GRID */
        <div className="dashboard-grid">
          
          {/* SIDEBAR - CONTROLS */}
          <aside className="control-section">
            <div className="glass-panel">
              <h3 style={{ fontFamily: 'var(--font-title)', marginBottom: '16px', fontSize: '1.1rem', color: 'var(--accent-green)' }}>
                Filtri Dimensionali
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Nazione */}
                <div className="control-group">
                  <label>Nazione (DimPaese)</label>
                  <select 
                    className="control-select" 
                    value={selectedCountry}
                    onChange={(e) => setSelectedCountry(e.target.value)}
                  >
                    {countries.map(c => (
                      <option key={c.country_code} value={c.country_code}>
                        {c.country_name} ({c.country_code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Data Snapshot */}
                <div className="control-group">
                  <label>Periodo (DimTempo)</label>
                  <select 
                    className="control-select"
                    value={JSON.stringify(selectedTimeframe)}
                    onChange={(e) => setSelectedTimeframe(JSON.parse(e.target.value))}
                  >
                    {timeframes.map((t, idx) => (
                      <option key={idx} value={JSON.stringify(t)}>
                        Anno {t.year} — Settimana {t.week}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Genere (Inferred Genre) */}
                <div className="control-group">
                  <label>Genere Musicale (OLAP Classif.)</label>
                  <select 
                    className="control-select"
                    value={selectedGenre}
                    onChange={(e) => setSelectedGenre(e.target.value)}
                  >
                    <option value="All">Tutti i Generi</option>
                    <option value="Pop">Pop</option>
                    <option value="Rock">Rock</option>
                    <option value="Hip-Hop">Hip-Hop / Rap</option>
                    <option value="Metal">Metal</option>
                    <option value="Electronic">Electronic / Dance</option>
                    <option value="Latin">Latin / Reggaeton</option>
                    <option value="K-Pop">K-Pop</option>
                    <option value="Afrobeats">Afrobeats</option>
                    <option value="Country/Folk">Country / Folk</option>
                    <option value="Jazz/Blues">Jazz / Blues</option>
                    <option value="Classical">Classica</option>
                    <option value="Reggae">Reggae</option>
                    <option value="Other">Altro</option>
                  </select>
                </div>

                {/* Tableau Export */}
                <a 
                  href={`${BACKEND_URL}/api/download-tableau`}
                  className="btn-secondary"
                  style={{ textDecoration: 'none', width: '100%', marginTop: '10px' }}
                >
                  <Download size={18} /> Esporta CSV per Tableau
                </a>
              </div>
            </div>

            {/* SIMULATION PANEL */}
            <div className="glass-panel">
              <h3 style={{ fontFamily: 'var(--font-title)', marginBottom: '12px', fontSize: '1.1rem', color: 'var(--accent-purple)' }}>
                Simulatore What-If
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Regola i pesi per ricalcolare istantaneamente le classifiche locali pesando l'identità locale (posizione in chart) rispetto alla globalità (popolarità assoluta Spotify).
              </p>
              
              <div className="slider-group">
                <div className="slider-item">
                  <div className="slider-label">
                    <span>Peso Identità Locale</span>
                    <span style={{ fontWeight: 'bold', color: 'var(--accent-green)' }}>{localWeight}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    className="slider-input" 
                    value={localWeight} 
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setLocalWeight(val);
                      setGlobalWeight(100 - val);
                      setActiveTab('what-if');
                    }}
                  />
                </div>

                <div className="slider-item">
                  <div className="slider-label">
                    <span>Peso Popolarità Globale</span>
                    <span style={{ fontWeight: 'bold', color: 'var(--accent-purple)' }}>{globalWeight}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    className="slider-input" 
                    value={globalWeight} 
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setGlobalWeight(val);
                      setLocalWeight(100 - val);
                      setActiveTab('what-if');
                    }}
                  />
                </div>
              </div>
            </div>

            {/* BENCHMARK PANEL */}
            <div className="glass-panel">
              <h3 style={{ fontFamily: 'var(--font-title)', marginBottom: '12px', fontSize: '1.1rem', color: 'var(--accent-blue)' }}>
                Benchmark ROLAP vs MOLAP
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Misura i tempi di esecuzione in-browser confrontando una query relazionale complessa con lo Star Schema (ROLAP) rispetto alla tabella pre-aggregata (MOLAP).
              </p>

              <div className="benchmark-metrics">
                <div className="benchmark-card rolap">
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>ROLAP</div>
                  <div className="benchmark-time" style={{ color: 'var(--accent-purple)' }}>
                    {benchmarkStatus === "running" ? "..." : `${rolapTime.toFixed(1)} ms`}
                  </div>
                </div>

                <div className="benchmark-card molap">
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>MOLAP</div>
                  <div className="benchmark-time" style={{ color: 'var(--accent-blue)' }}>
                    {benchmarkStatus === "running" ? "..." : `${molapTime.toFixed(1)} ms`}
                  </div>
                </div>
              </div>

              {rolapTime > 0 && molapTime > 0 && (
                <div className="benchmark-speedup">
                  ⚡ Speedup MOLAP: {(rolapTime / molapTime).toFixed(1)}x più veloce
                </div>
              )}
              
              <button 
                className="btn-secondary" 
                style={{ width: '100%', padding: '8px 16px', fontSize: '0.8rem', marginTop: '12px' }}
                onClick={runBenchmark}
              >
                <RefreshCw size={14} /> Esegui di Nuovo
              </button>
            </div>
          </aside>

          {/* MAIN CONTENTS */}
          <main className="dashboard-content">
            
            {/* GEOPOLITICAL SUMMARY CARD */}
            <div className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Profilo Geopolitico (World Bank)</span>
                  <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '1.8rem', fontWeight: '800' }}>
                    {countryStats.country_name || selectedCountry}
                  </h2>
                </div>
                
                <div style={{ display: 'flex', gap: '32px' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Continente</span>
                    <div style={{ fontSize: '1.05rem', fontWeight: '600' }}>{countryStats.continent || "Europa"}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Lingua Principale</span>
                    <div style={{ fontSize: '1.05rem', fontWeight: '600' }}>{countryStats.language || "N/A"}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Fascia di Reddito</span>
                    <div style={{ fontSize: '1.05rem', fontWeight: '600' }}>{countryStats.income_group || "High Income"}</div>
                  </div>
                </div>
              </div>
              
              <div className="metrics-row" style={{ marginTop: '20px', marginBottom: '0' }}>
                <div className="glass-card metric-card">
                  <h3>PIL Pro Capite</h3>
                  <div className="value">{formatCurrency(countryStats.gdp_per_capita)}</div>
                  <div className="sub">USD costanti (Banca Mondiale)</div>
                </div>

                <div className="glass-card metric-card">
                  <h3>Popolazione Totale</h3>
                  <div className="value">{formatNumber(countryStats.population)}</div>
                  <div className="sub">Persone (censimento locale)</div>
                </div>

                <div className="glass-card metric-card">
                  <h3>Brani Unici in Classifica</h3>
                  <div className="value">{activeTracksCount}</div>
                  <div className="sub">In questa settimana</div>
                </div>
              </div>
            </div>

            {/* TABS HEADER */}
            <div className="glass-panel" style={{ minHeight: '400px' }}>
              <div className="panel-header">
                <h2>Analisi ed Esplorazione OLAP</h2>
                
                <div className="tab-group">
                  <button 
                    className={`tab-btn ${activeTab === 'top-songs' ? 'active' : ''}`}
                    onClick={() => setActiveTab('top-songs')}
                  >
                    <Music size={14} style={{ marginRight: '4px', display: 'inline' }} /> Top Settimanale
                  </button>

                  <button 
                    className={`tab-btn ${activeTab === 'yearly-country' ? 'active' : ''}`}
                    onClick={() => setActiveTab('yearly-country')}
                  >
                    <Award size={14} style={{ marginRight: '4px', display: 'inline' }} /> Top Annuale Paese
                  </button>

                  <button 
                    className={`tab-btn ${activeTab === 'yearly-global' ? 'active' : ''}`}
                    onClick={() => setActiveTab('yearly-global')}
                  >
                    <Globe size={14} style={{ marginRight: '4px', display: 'inline' }} /> Top Annuale Globale
                  </button>
                  
                  <button 
                    className={`tab-btn ${activeTab === 'mood-scatter' ? 'active' : ''}`}
                    onClick={() => setActiveTab('mood-scatter')}
                  >
                    <Sparkles size={14} style={{ marginRight: '4px', display: 'inline' }} /> Mood Scatter
                  </button>

                  <button 
                    className={`tab-btn ${activeTab === 'what-if' ? 'active' : ''}`}
                    onClick={() => setActiveTab('what-if')}
                  >
                    <ArrowLeftRight size={14} style={{ marginRight: '4px', display: 'inline' }} /> Classifica Simulata
                  </button>

                  <button 
                    className={`tab-btn ${activeTab === 'search' ? 'active' : ''}`}
                    onClick={() => setActiveTab('search')}
                  >
                    <Search size={14} style={{ marginRight: '4px', display: 'inline' }} /> Cerca
                  </button>
                </div>
              </div>

              {/* TAB CONTENTS */}
              {activeTab === 'top-songs' && (
                <div className="song-table-container">
                  <table className="song-table">
                    <thead>
                      <tr>
                        <th className="song-rank-col">Rank</th>
                        <th>Titolo Brano</th>
                        <th>Artista</th>
                        <th>Days on Chart</th>
                        <th>Peak Rank</th>
                        <th>Popularity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topSongs.map((s, idx) => (
                        <tr key={idx} onClick={() => loadTrackDetail(s.track_name, 'dashboard')} style={{ cursor: 'pointer' }}>
                          <td className="song-rank-col">#{s.daily_rank}</td>
                          <td style={{ fontWeight: '500' }}>{s.track_name}</td>
                          <td>{renderArtistCell(s.artist_names)}</td>
                          <td>{s.days_on_chart} giorni</td>
                          <td>#{s.peak_rank}</td>
                          <td>{s.popularity != null ? Math.round(s.popularity) : 'N/D'}/100</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'yearly-country' && (
                <div className="song-table-container">
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    Classifica annuale basata sui <strong>Chart Points</strong> totalizzati nel corso del {selectedTimeframe.year} in {countryStats.country_name || selectedCountry}. I punti sono calcolati invertendo il rank giornaliero (1° posto = 50pt, 50° posto = 1pt).
                  </p>
                  <table className="song-table">
                    <thead>
                      <tr>
                        <th className="song-rank-col">Rank</th>
                        <th>Titolo Brano</th>
                        <th>Artista</th>
                        <th>Peak Rank</th>
                        <th>Giorni in Chart</th>
                        <th>Avg Popularity</th>
                        <th>Chart Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearlyCountrySongs.map((s, idx) => (
                        <tr key={idx} onClick={() => loadTrackDetail(s.track_name, 'dashboard')} style={{ cursor: 'pointer' }}>
                          <td className="song-rank-col">#{idx + 1}</td>
                          <td style={{ fontWeight: '500' }}>{s.track_name}</td>
                          <td>{renderArtistCell(s.artist_names)}</td>
                          <td>#{s.peak_rank}</td>
                          <td>{s.days_on_chart} giorni</td>
                          <td>{s.avg_popularity != null ? Math.round(s.avg_popularity) : 'N/D'}/100</td>
                          <td style={{ fontWeight: 'bold', color: 'var(--accent-green)' }}>{formatNumber(s.chart_points)} pt</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'yearly-global' && (
                <div className="song-table-container">
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    Classifica annuale globale basata sulla somma di tutti i <strong>Chart Points</strong> ottenuti in tutte le nazioni tracciate nel {selectedTimeframe.year}. Mostra i brani che hanno dominato il mercato globale.
                  </p>
                  <table className="song-table">
                    <thead>
                      <tr>
                        <th className="song-rank-col">Rank</th>
                        <th>Titolo Brano</th>
                        <th>Artista</th>
                        <th>Peak Rank</th>
                        <th>Paesi in Classifica</th>
                        <th>Avg Popularity</th>
                        <th>Chart Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearlyGlobalSongs.map((s, idx) => (
                        <tr key={idx} onClick={() => loadTrackDetail(s.track_name, 'dashboard')} style={{ cursor: 'pointer' }}>
                          <td className="song-rank-col">#{idx + 1}</td>
                          <td style={{ fontWeight: '500' }}>{s.track_name}</td>
                          <td>{renderArtistCell(s.artist_names)}</td>
                          <td>#{s.peak_rank}</td>
                          <td>{s.countries_charted} paesi</td>
                          <td>{s.avg_popularity != null ? Math.round(s.avg_popularity) : 'N/D'}/100</td>
                          <td style={{ fontWeight: 'bold', color: 'var(--accent-purple)' }}>{formatNumber(s.chart_points)} pt</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'mood-scatter' && (
                <div style={{ height: '350px', width: '100%', marginTop: '16px' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    Questo grafico distribuisce le hit locali in base a <strong>Valence</strong> (positività/allegria del suono) sull'asse X ed <strong>Energy</strong> (intensità/ritmo) sull'asse Y. La dimensione della bolla indica la posizione in classifica (bolla più grande = posizione migliore).
                  </p>
                  
                  <ResponsiveContainer width="100%" height="90%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <XAxis type="number" dataKey="valence" name="Valence" range={[0, 1]} domain={[0, 1]} label={{ value: 'Valence (Positività)', position: 'insideBottom', offset: -5, fill: '#9ea2b5' }} tick={{ fill: '#9ea2b5' }} />
                      <YAxis type="number" dataKey="energy" name="Energy" range={[0, 1]} domain={[0, 1]} label={{ value: 'Energy (Energia)', angle: -90, position: 'insideLeft', fill: '#9ea2b5' }} tick={{ fill: '#9ea2b5' }} />
                      <ZAxis type="number" dataKey="size" range={[60, 500]} />
                      <Tooltip 
                        cursor={{ strokeDasharray: '3 3' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div style={{ background: '#181c26', border: '1px solid var(--border-light)', padding: '12px', borderRadius: '8px', boxShadow: 'var(--shadow-main)' }}>
                                <p style={{ fontWeight: 'bold', margin: 0 }}>{data.name}</p>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>{data.artist}</p>
                                <p style={{ color: 'var(--accent-green)', fontSize: '0.85rem', margin: '4px 0 0 0', fontWeight: 'bold' }}>Rank: #{data.rank}</p>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>Valence: {data.valence.toFixed(2)} | Energy: {data.energy.toFixed(2)}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Scatter name="Brani" data={scatterData} fill="var(--accent-green)" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              )}

              {activeTab === 'what-if' && (
                <div className="song-table-container">
                  <table className="song-table">
                    <thead>
                      <tr>
                        <th className="song-rank-col">Rank</th>
                        <th>Titolo Brano</th>
                        <th>Artista</th>
                        <th>Original Rank</th>
                        <th>Global Popularity</th>
                        <th>Score Simulato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simulatedSongs.map((s, idx) => (
                        <tr key={idx} onClick={() => loadTrackDetail(s.track_name, 'dashboard')} style={{ cursor: 'pointer' }}>
                          <td className="song-rank-col">#{idx + 1}</td>
                          <td style={{ fontWeight: '500' }}>{s.track_name}</td>
                          <td>{renderArtistCell(s.artist_names)}</td>
                          <td>#{s.daily_rank}</td>
                          <td>{s.popularity != null ? Math.round(s.popularity) : 'N/D'}/100</td>
                          <td style={{ fontWeight: 'bold', color: 'var(--accent-purple)' }}>{s.simulated_score.toFixed(0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'search' && (
                <div className="song-table-container">
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Ricerca in tempo reale all'interno del database locale. Clicca su un brano per aprire la scheda tecnica completa.
                  </p>
                  
                  {/* Search controls */}
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border-light)' }}>
                      <button 
                        className={`tab-btn ${searchType === 'song' ? 'active' : ''}`}
                        onClick={() => {
                          setSearchType('song');
                          setSelectedArtist(null);
                          setSearchQuery('');
                        }}
                        style={{ padding: '6px 12px', fontSize: '0.85rem', background: searchType === 'song' ? 'rgba(29, 185, 84, 0.2)' : 'transparent', color: searchType === 'song' ? 'var(--accent-green)' : 'var(--text-secondary)', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        Cerca Canzone
                      </button>
                      <button 
                        className={`tab-btn ${searchType === 'artist' ? 'active' : ''}`}
                        onClick={() => {
                          setSearchType('artist');
                          setSelectedArtist(null);
                          setSearchQuery('');
                        }}
                        style={{ padding: '6px 12px', fontSize: '0.85rem', background: searchType === 'artist' ? 'rgba(29, 185, 84, 0.2)' : 'transparent', color: searchType === 'artist' ? 'var(--accent-green)' : 'var(--text-secondary)', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        Cerca Artista
                      </button>
                    </div>

                    <input 
                      type="text"
                      placeholder={searchType === 'song' ? "Scrivi il titolo del brano..." : "Scrivi il nome dell'artista..."}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        flex: '1',
                        minWidth: '200px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--border-light)',
                        borderRadius: '8px',
                        padding: '8px 16px',
                        color: 'var(--text-main)',
                        fontSize: '0.9rem',
                        outline: 'none'
                      }}
                    />
                  </div>

                  {searchLoading && <div style={{ color: 'var(--accent-green)', marginBottom: '12px', fontSize: '0.85rem' }}>Ricerca in corso...</div>}

                  {/* RESULTS FOR SONG SEARCH */}
                  {searchType === 'song' && songSearchResults.length > 0 && (
                    <table className="song-table">
                      <thead>
                        <tr>
                          <th>Titolo Brano</th>
                          <th>Artista</th>
                          <th>Peak Rank</th>
                          <th>Giorni in Chart</th>
                          <th>Popularity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {songSearchResults.map((s, idx) => (
                          <tr key={idx} onClick={() => loadTrackDetail(s.track_name, 'dashboard')} style={{ cursor: 'pointer' }}>
                            <td style={{ fontWeight: '500' }}>{s.track_name}</td>
                            <td>{renderArtistCell(s.artist_names)}</td>
                            <td>#{s.peak_rank}</td>
                            <td>{s.days_on_chart} giorni</td>
                            <td>{s.popularity != null ? Math.round(s.popularity) : 'N/D'}/100</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* RESULTS FOR ARTIST SEARCH */}
                  {searchType === 'artist' && !selectedArtist && artistSearchResults.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                      {artistSearchResults.map((a, idx) => (
                        <div 
                          key={idx}
                          onClick={() => loadArtistTracks(a.artist_name)}
                          style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid var(--border-light)',
                            borderRadius: '8px',
                            padding: '16px',
                            cursor: 'pointer',
                            textAlign: 'center',
                            fontWeight: '500',
                            transition: 'all 0.2s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(29, 185, 84, 0.1)';
                            e.currentTarget.style.borderColor = 'var(--accent-green)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                            e.currentTarget.style.borderColor = 'var(--border-light)';
                          }}
                        >
                          {a.artist_name}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* SONGS BY SELECTED ARTIST */}
                  {searchType === 'artist' && selectedArtist && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0, color: 'var(--accent-green)' }}>Brani di: {selectedArtist}</h3>
                        <button 
                          onClick={() => setSelectedArtist(null)}
                          className="btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '6px' }}
                        >
                          Torna alla lista artisti
                        </button>
                      </div>

                      {artistTracksResults.length > 0 ? (
                        <table className="song-table">
                          <thead>
                            <tr>
                              <th>Titolo Brano</th>
                              <th>Artisti Correlati</th>
                              <th>Peak Rank</th>
                              <th>Giorni in Chart</th>
                              <th>Popularity</th>
                            </tr>
                          </thead>
                          <tbody>
                            {artistTracksResults.map((s, idx) => (
                              <tr key={idx} onClick={() => loadTrackDetail(s.track_name, 'dashboard')} style={{ cursor: 'pointer' }}>
                                <td style={{ fontWeight: '500' }}>{s.track_name}</td>
                                <td>{renderArtistCell(s.artist_names)}</td>
                                <td>#{s.peak_rank}</td>
                                <td>{s.days_on_chart} giorni</td>
                                <td>{s.popularity != null ? Math.round(s.popularity) : 'N/D'}/100</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px' }}>Nessuna canzone trovata.</div>
                      )}
                    </div>
                  )}

                  {searchQuery.trim().length >= 2 && !searchLoading && 
                    ((searchType === 'song' && songSearchResults.length === 0) || 
                     (searchType === 'artist' && !selectedArtist && artistSearchResults.length === 0)) && (
                    <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px' }}>Nessun risultato trovato per "{searchQuery}".</div>
                  )}
                </div>
              )}
            </div>

            {/* AI NARRATIVE SECTION */}
            <div className="glass-panel">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-light)', paddingBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={20} className="text-purple" style={{ color: 'var(--accent-purple)' }} />
                  <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '1.4rem', fontWeight: '700' }}>
                    Analisi Culturale AI con Gemma 4
                  </h2>
                </div>
                
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Select Mode */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Modalità Analisi</label>
                    <select 
                      value={aiCompareMode} 
                      onChange={(e) => setAiCompareMode(e.target.value)}
                      style={{ background: '#1c202a', color: '#fff', border: '1px solid var(--border-light)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem' }}
                    >
                      <option value="single">Analisi Singola</option>
                      <option value="compare">Analisi Comparativa (OLAP Join)</option>
                    </select>
                  </div>

                  {aiCompareMode === 'compare' && (
                    <>
                      {/* Comparison Type */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Tipo Confronto</label>
                        <select 
                          value={aiCompareType} 
                          onChange={(e) => setAiCompareType(e.target.value)}
                          style={{ background: '#1c202a', color: '#fff', border: '1px solid var(--border-light)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem' }}
                        >
                          <option value="local-vs-global">Paese Corrente vs Globale</option>
                          <option value="two-countries">Paese Corrente vs Altro Paese</option>
                        </select>
                      </div>

                      {aiCompareType === 'two-countries' && (
                        /* Country B Select */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Confronta con</label>
                          <select 
                            value={selectedCompareCountryB} 
                            onChange={(e) => setSelectedCompareCountryB(e.target.value)}
                            style={{ background: '#1c202a', color: '#fff', border: '1px solid var(--border-light)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem' }}
                          >
                            {countries.map(c => (
                              <option key={c.country_code} value={c.country_code}>
                                {c.country_name} ({c.country_code})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </>
                  )}

                  {/* Gemini API Key input */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Gemini API Key (Bypassa Server)</label>
                    <input 
                      type="password"
                      placeholder="AI Key (locale)..."
                      value={customApiKey}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomApiKey(val);
                        if (val) {
                          localStorage.setItem("user_gemini_api_key", val);
                        } else {
                          localStorage.removeItem("user_gemini_api_key");
                        }
                      }}
                      style={{ background: '#1c202a', color: '#fff', border: '1px solid var(--border-light)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem', width: '180px' }}
                    />
                  </div>

                  <button 
                    className="btn-primary" 
                    style={{ background: 'var(--accent-purple)', color: '#fff', alignSelf: 'flex-end', marginTop: '18px' }}
                    onClick={generateAINarrative}
                    disabled={aiLoading}
                  >
                    {aiLoading ? (
                      <> Generazione... </>
                    ) : (
                      <> <Sparkles size={16} /> Genera Report </>
                    )}
                  </button>
                </div>
              </div>

              {aiNarrative ? (
                <div className="ai-text">
                  <div dangerouslySetInnerHTML={{ __html: aiNarrative.replace(/\n/g, '<br/>') }}></div>
                  <div className="ai-meta">
                    <span>Engine: {aiUsedApi}</span>
                    <span>Cache Validation Key: md5-{selectedCountry.toLowerCase()}-{aiCompareMode === 'compare' ? (aiCompareType === 'local-vs-global' ? 'gl' : selectedCompareCountryB.toLowerCase()) : 'single'}-{selectedTimeframe.year}</span>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
                  <AlertCircle size={24} style={{ margin: '0 auto 12px auto', display: 'block', color: 'var(--text-muted)' }} />
                  {aiCompareMode === 'compare' ? (
                    <>
                      Pronto per l'analisi comparativa tra {countryStats.country_name || selectedCountry} e {aiCompareType === 'local-vs-global' ? 'Top Globale' : (countries.find(c => c.country_code === selectedCompareCountryB)?.country_name || selectedCompareCountryB)}.
                    </>
                  ) : (
                    <>
                      Clicca su "Genera Report" per ottenere l'analisi etnomusicologica del mercato di {countryStats.country_name || selectedCountry}.
                    </>
                  )}
                </div>
              )}
            </div>

          </main>
        </div>
      )}
    </div>
  );
}

export default App;
