import React, { useState, useEffect } from 'react';
import { initDuckDB } from './duckdb';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend, LineChart, Line, ScatterChart, Scatter, Cell,
  PieChart, Pie, ReferenceLine
} from 'recharts';
import { 
  Compass, Globe, Music, Cpu, Sparkles, Download, Search,
  ArrowLeftRight, AlertCircle, RefreshCw, BarChart2,
  Presentation, ArrowLeft, ArrowRight, Terminal, Sliders,
  Database, BookOpen, Award, Play, ChevronLeft, ChevronRight,
  TrendingUp
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
  const [viewMode, setViewMode] = useState("pitch"); // "dashboard" or "pitch"
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
  const [anomalyData, setAnomalyData] = useState([]);
  const [musicUniverseScatter, setMusicUniverseScatter] = useState([]);
  const [hitVsNormalData, setHitVsNormalData] = useState([]);
  const [durationComparisonData, setDurationComparisonData] = useState([]);

  // States for the cultural divergence pitch
  const [universalHitsData, setUniversalHitsData] = useState([]);
  const [divergenceCountries, setDivergenceCountries] = useState([]);
  const [genreByRegionData, setGenreByRegionData] = useState([]);
  const [overlapTrendData, setOverlapTrendData] = useState([]);

  // Slide 3: SLICE & DICE
  const [slide3Country, setSlide3Country] = useState('IT');
  const [slide3Stats, setSlide3Stats] = useState({ overlap_pct: 0, total_tracks: 0, global_tracks: 0 });
  const [slide3LocalHits, setSlide3LocalHits] = useState([]);
  const [slide3Compare, setSlide3Compare] = useState('');
  const [slide3CompareStats, setSlide3CompareStats] = useState(null);
  const [slide3CompareHits, setSlide3CompareHits] = useState([]);

  // Slide 4: DRILL-DOWN
  const [slide4Level, setSlide4Level] = useState('continent');
  const [slide4SelectedContinent, setSlide4SelectedContinent] = useState(null);
  const [slide4CountryData, setSlide4CountryData] = useState([]);
  const [slide4SelectedCountry, setSlide4SelectedCountry] = useState(null);
  const [slide4TrackData, setSlide4TrackData] = useState([]);

  // Slide 5: ROLL-UP / SLICE
  const [slide5Country, setSlide5Country] = useState('ALL');
  const [slide5TrendData, setSlide5TrendData] = useState([]);


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
          SELECT tr.name AS Track,
                 string_agg(DISTINCT a.name, ', ') AS Artist,
                 MIN(f.daily_rank) AS Rank,
                 ROUND(AVG(tr.valence), 3) AS Info
          FROM fact_chart_entry f
          JOIN dim_paese p ON f.country_key = p.country_key
          JOIN dim_traccia tr ON f.track_key = tr.track_key
          JOIN bridge_artista ba ON f.artist_group_key = ba.artist_group_key
          JOIN dim_artista a ON ba.artist_key = a.artist_key
          WHERE p.country_code = '${olapCountry}'
          GROUP BY tr.name, tr.valence
          ORDER BY Rank LIMIT 5
        `;
        break;
      case 'dice':
        // DICE: Filtra contemporaneamente su più dimensioni (Paese AND Genere AND Anno AND Settimana)
        queryText = `
          SELECT tr.name AS Track,
                 string_agg(DISTINCT a.name, ', ') AS Artist,
                 MIN(f.daily_rank) AS Rank,
                 COALESCE(gtr.macro_genre, 'Other') AS Info
          FROM fact_chart_entry f
          JOIN dim_paese p ON f.country_key = p.country_key
          JOIN dim_traccia tr ON f.track_key = tr.track_key
          LEFT JOIN dim_genere gtr ON tr.genre_key = gtr.genre_key
          JOIN bridge_artista ba ON f.artist_group_key = ba.artist_group_key
          JOIN dim_artista a ON ba.artist_key = a.artist_key
          JOIN dim_tempo tmp ON f.date_key = tmp.date_key
          WHERE p.country_code = '${olapCountry}'
            AND gtr.macro_genre LIKE '%${olapGenre}%'
            AND tmp.year = ${olapYear}
            AND tmp.week = ${olapWeek}
          GROUP BY tr.name, gtr.macro_genre
          ORDER BY Rank LIMIT 5
        `;
        break;
      case 'drill':
        // DRILL-DOWN: Scende di dettaglio mostrando il record specifico della settimana all'interno dell'anno
        queryText = `
          SELECT tr.name AS Track,
                 string_agg(DISTINCT a.name, ', ') AS Artist,
                 MIN(f.daily_rank) AS Rank,
                 'Anno: ' || tmp.year || ', Settimana: ' || tmp.week AS Info
          FROM fact_chart_entry f
          JOIN dim_paese p ON f.country_key = p.country_key
          JOIN dim_traccia tr ON f.track_key = tr.track_key
          JOIN bridge_artista ba ON f.artist_group_key = ba.artist_group_key
          JOIN dim_artista a ON ba.artist_key = a.artist_key
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
          SELECT tr.name AS Track,
                 string_agg(DISTINCT a.name, ', ') AS Artist,
                 MIN(f.daily_rank) AS Rank,
                 'Classifica Globale (GL)' AS Info
          FROM fact_chart_entry f
          JOIN dim_paese p ON f.country_key = p.country_key
          JOIN dim_traccia tr ON f.track_key = tr.track_key
          JOIN bridge_artista ba ON f.artist_group_key = ba.artist_group_key
          JOIN dim_artista a ON ba.artist_key = a.artist_key
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
          SELECT tr.name AS Track,
                 string_agg(DISTINCT a.name, ', ') AS Artist,
                 MIN(f.daily_rank) AS Rank,
                 p.income_group AS Info
          FROM fact_chart_entry f
          JOIN dim_paese p ON f.country_key = p.country_key
          JOIN dim_traccia tr ON f.track_key = tr.track_key
          JOIN bridge_artista ba ON f.artist_group_key = ba.artist_group_key
          JOIN dim_artista a ON ba.artist_key = a.artist_key
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

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (viewMode !== 'pitch') return;
      if (e.key === 'ArrowRight') {
        setCurrentSlide(prev => Math.min(prev + 1, 6));
      } else if (e.key === 'ArrowLeft') {
        setCurrentSlide(prev => Math.max(prev - 1, 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode]);


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
          SELECT g.genre_name AS genre, COUNT(*) AS artist_count
          FROM dim_artista a
          JOIN dim_genere g ON a.genre_key = g.genre_key
          WHERE g.macro_genre != 'Other'
          GROUP BY g.genre_name
          ORDER BY artist_count DESC
          LIMIT 8
        `);
        setGenreDistribution(genreRes.toArray().map(cleanRow));

        const anomalyRes = await conn.query(`
          SELECT 
            p.country_code,
            AVG(tr.valence) AS avg_valence,
            AVG(tr.energy) AS avg_energy,
            AVG(tr.danceability) AS avg_danceability,
            AVG(CAST(tr.is_explicit AS INTEGER)) AS avg_explicit
          FROM fact_chart_entry f
          JOIN dim_paese p ON f.country_key = p.country_key
          JOIN dim_traccia tr ON f.track_key = tr.track_key
          WHERE p.country_code IN ('GL', 'IT')
          GROUP BY p.country_code
        `);
        const anomalyRows = anomalyRes.toArray().map(cleanRow);
        const glRow = anomalyRows.find(r => r.country_code === 'GL') || { avg_valence: 0.5, avg_energy: 0.6, avg_danceability: 0.6, avg_explicit: 0.2 };
        const itRow = anomalyRows.find(r => r.country_code === 'IT') || { avg_valence: 0.5, avg_energy: 0.6, avg_danceability: 0.6, avg_explicit: 0.2 };
        setAnomalyData([
          { name: 'Valence', Globale: parseFloat(glRow.avg_valence || 0), Italia: parseFloat(itRow.avg_valence || 0) },
          { name: 'Energy', Globale: parseFloat(glRow.avg_energy || 0), Italia: parseFloat(itRow.avg_energy || 0) },
          { name: 'Danceability', Globale: parseFloat(glRow.avg_danceability || 0), Italia: parseFloat(itRow.avg_danceability || 0) },
          { name: 'Explicit %', Globale: parseFloat(glRow.avg_explicit || 0), Italia: parseFloat(itRow.avg_explicit || 0) }
        ]);

        // ── Pitch: Cultural Divergence Story ────────────────────────────────────

        // Slide 2: top tracks by n_countries_charted (brani universali)
        const univRes = await conn.query(`
          WITH tm AS (
            SELECT tr.name AS track_name,
                   ANY_VALUE(f.artist_group_key) AS artist_group_key,
                   MAX(f.n_countries_charted) AS n_countries
            FROM fact_chart_entry f
            JOIN dim_traccia tr ON f.track_key = tr.track_key
            JOIN dim_paese p ON f.country_key = p.country_key
            WHERE p.country_code = 'GL'
            GROUP BY tr.name
            ORDER BY n_countries DESC
            LIMIT 10
          ),
          an AS (
            SELECT ba.artist_group_key, string_agg(a.name, ', ' ORDER BY a.name) AS artist_names
            FROM bridge_artista ba JOIN dim_artista a ON ba.artist_key = a.artist_key
            GROUP BY ba.artist_group_key
          )
          SELECT tm.track_name, an.artist_names, tm.n_countries
          FROM tm LEFT JOIN an ON tm.artist_group_key = an.artist_group_key
          ORDER BY tm.n_countries DESC
        `);
        setUniversalHitsData(univRes.toArray().map(cleanRow));

        // Slide 3: country divergence (overlap % with GL chart)
        const divRes = await conn.query(`
          WITH gl_tracks AS (
            SELECT DISTINCT f.track_key
            FROM fact_chart_entry f
            JOIN dim_paese p ON f.country_key = p.country_key
            WHERE p.country_code = 'GL'
          ),
          cs AS (
            SELECT p.country_name, p.country_code, p.continent,
                   COUNT(DISTINCT f.track_key) AS total_tracks,
                   COUNT(DISTINCT CASE WHEN gl.track_key IS NOT NULL THEN f.track_key END) AS global_tracks
            FROM fact_chart_entry f
            JOIN dim_paese p ON f.country_key = p.country_key
            LEFT JOIN gl_tracks gl ON f.track_key = gl.track_key
            WHERE p.country_code != 'GL'
            GROUP BY p.country_name, p.country_code, p.continent
          )
          SELECT country_name, country_code, continent,
                 ROUND(100.0 * global_tracks / NULLIF(total_tracks, 0), 1) AS overlap_pct
          FROM cs
          ORDER BY overlap_pct ASC
        `);
        setDivergenceCountries(divRes.toArray().map(cleanRow));

        // Slide 4: genre distribution by continent (%)
        const genreRegRes = await conn.query(`
          WITH cg AS (
            SELECT p.continent,
                   COALESCE(g.macro_genre, 'Other') AS macro_genre,
                   COUNT(*) AS entries
            FROM fact_chart_entry f
            JOIN dim_paese p ON f.country_key = p.country_key
            JOIN dim_traccia tr ON f.track_key = tr.track_key
            LEFT JOIN dim_genere g ON tr.genre_key = g.genre_key
            WHERE p.country_code != 'GL' AND p.continent IS NOT NULL
              AND COALESCE(g.macro_genre, 'Other') != 'Other'
            GROUP BY p.continent, COALESCE(g.macro_genre, 'Other')
          ),
          totals AS (
            SELECT continent, SUM(entries) AS total FROM cg GROUP BY continent
          )
          SELECT cg.continent, cg.macro_genre,
                 ROUND(100.0 * cg.entries / totals.total, 1) AS pct
          FROM cg JOIN totals ON cg.continent = totals.continent
          ORDER BY cg.continent, pct DESC
        `);
        setGenreByRegionData(genreRegRes.toArray().map(cleanRow));

        // Slide 5: yearly overlap trend (avg % of national charts in GL)
        const trendRes = await conn.query(`
          WITH gl_tracks AS (
            SELECT DISTINCT f.track_key, t.year
            FROM fact_chart_entry f
            JOIN dim_tempo t ON f.date_key = t.date_key
            JOIN dim_paese p ON f.country_key = p.country_key
            WHERE p.country_code = 'GL'
          )
          SELECT t.year,
                 ROUND(100.0 * COUNT(DISTINCT gl.track_key) / NULLIF(COUNT(DISTINCT f.track_key), 0), 1) AS overlap_pct
          FROM fact_chart_entry f
          JOIN dim_tempo t ON f.date_key = t.date_key
          JOIN dim_paese p ON f.country_key = p.country_key
          LEFT JOIN gl_tracks gl ON f.track_key = gl.track_key AND t.year = gl.year
          WHERE p.country_code != 'GL'
          GROUP BY t.year
          ORDER BY t.year
        `);
        setOverlapTrendData(trendRes.toArray().map(cleanRow));

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
    return ` AND gtr.macro_genre LIKE '%${genre}%'`;
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
                ANY_VALUE(f.artist_group_key) AS artist_group_key,
                AVG(f.popularity) AS popularity,
                COUNT(DISTINCT t.date_key) AS days_on_chart,
                MIN(f.peak_rank) AS peak_rank,
                AVG(tr.danceability) AS danceability,
                AVG(tr.energy) AS energy,
                AVG(tr.valence) AS valence,
                SUM(f.performance_score) AS weekly_score
            FROM fact_chart_entry f
            JOIN dim_tempo t ON f.date_key = t.date_key
            JOIN dim_paese p ON f.country_key = p.country_key
            JOIN dim_traccia tr ON f.track_key = tr.track_key
            LEFT JOIN dim_genere gtr ON tr.genre_key = gtr.genre_key
            WHERE p.country_code = '${selectedCountry}'
              AND t.year = ${selectedTimeframe.year}
              AND t.week = ${selectedTimeframe.week}
              ${getGenreSqlCondition(selectedGenre)}
            GROUP BY tr.name
        ),
        an AS (
            SELECT ba.artist_group_key, string_agg(a.name, ', ' ORDER BY a.name) AS artist_names
            FROM bridge_artista ba
            JOIN dim_artista a ON ba.artist_key = a.artist_key
            GROUP BY ba.artist_group_key
        )
        SELECT
            ROW_NUMBER() OVER (ORDER BY ws.weekly_score DESC, ws.popularity DESC) AS daily_rank,
            ws.track_name,
            an.artist_names,
            ws.popularity,
            ws.days_on_chart,
            ws.peak_rank,
            ws.danceability,
            ws.energy,
            ws.valence
        FROM weekly_stats ws
        LEFT JOIN an ON ws.artist_group_key = an.artist_group_key
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
        WITH tm AS (
            SELECT
                tr.name AS track_name,
                ANY_VALUE(f.artist_group_key) AS artist_group_key,
                MIN(f.daily_rank) AS peak_rank,
                COUNT(DISTINCT t.date_key) AS days_on_chart,
                SUM(f.performance_score) AS chart_points,
                ROUND(AVG(f.popularity), 1) AS avg_popularity
            FROM fact_chart_entry f
            JOIN dim_tempo t ON f.date_key = t.date_key
            JOIN dim_paese p ON f.country_key = p.country_key
            JOIN dim_traccia tr ON f.track_key = tr.track_key
            LEFT JOIN dim_genere gtr ON tr.genre_key = gtr.genre_key
            WHERE p.country_code = '${selectedCountry}'
              AND t.year = ${selectedTimeframe.year}
              ${getGenreSqlCondition(selectedGenre)}
            GROUP BY tr.name
            ORDER BY chart_points DESC
            LIMIT 10
        ),
        an AS (
            SELECT ba.artist_group_key, string_agg(a.name, ', ' ORDER BY a.name) AS artist_names
            FROM bridge_artista ba JOIN dim_artista a ON ba.artist_key = a.artist_key
            GROUP BY ba.artist_group_key
        )
        SELECT tm.track_name, an.artist_names, tm.peak_rank, tm.days_on_chart,
               tm.chart_points, tm.avg_popularity
        FROM tm LEFT JOIN an ON tm.artist_group_key = an.artist_group_key
        ORDER BY tm.chart_points DESC
      `);
      setYearlyCountrySongs(yearlyCountryRes.toArray().map(cleanRow));

      // Fetch Yearly Global Top Songs (Chart Points sum)
      const yearlyGlobalRes = await dbConn.query(`
        WITH tm AS (
            SELECT
                tr.name AS track_name,
                ANY_VALUE(f.artist_group_key) AS artist_group_key,
                MIN(f.daily_rank) AS peak_rank,
                COUNT(DISTINCT p.country_code) AS countries_charted,
                SUM(f.performance_score) AS chart_points,
                ROUND(AVG(f.popularity), 1) AS avg_popularity
            FROM fact_chart_entry f
            JOIN dim_tempo t ON f.date_key = t.date_key
            JOIN dim_paese p ON f.country_key = p.country_key
            JOIN dim_traccia tr ON f.track_key = tr.track_key
            LEFT JOIN dim_genere gtr ON tr.genre_key = gtr.genre_key
            WHERE t.year = ${selectedTimeframe.year}
              ${getGenreSqlCondition(selectedGenre)}
            GROUP BY tr.name
            ORDER BY chart_points DESC
            LIMIT 10
        ),
        an AS (
            SELECT ba.artist_group_key, string_agg(a.name, ', ' ORDER BY a.name) AS artist_names
            FROM bridge_artista ba JOIN dim_artista a ON ba.artist_key = a.artist_key
            GROUP BY ba.artist_group_key
        )
        SELECT tm.track_name, an.artist_names, tm.peak_rank, tm.countries_charted,
               tm.chart_points, tm.avg_popularity
        FROM tm LEFT JOIN an ON tm.artist_group_key = an.artist_group_key
        ORDER BY tm.chart_points DESC
      `);
      setYearlyGlobalSongs(yearlyGlobalRes.toArray().map(cleanRow));

      // Query 1: Scatter Plot (Energy vs Danceability, color by Popularity >= 75)
      const scatterRes = await dbConn.query(`
        SELECT DISTINCT 
          tr.name AS track_name,
          CAST(tr.energy AS DOUBLE) AS energy,
          CAST(tr.danceability AS DOUBLE) AS danceability,
          CAST(f.popularity AS INTEGER) AS popularity
        FROM fact_chart_entry f
        JOIN dim_traccia tr ON f.track_key = tr.track_key
        WHERE f.popularity IS NOT NULL
        ORDER BY f.popularity DESC
        LIMIT 400
      `);
      const scatterRows = scatterRes.toArray().map(cleanRow);
      setMusicUniverseScatter(scatterRows.map(r => ({
        name: r.track_name.substring(0, 15) + (r.track_name.length > 15 ? '..' : ''),
        energy: parseFloat(r.energy || 0),
        danceability: parseFloat(r.danceability || 0),
        popularity: parseInt(r.popularity || 0),
        isHit: r.popularity >= 75
      })));

      // Query 2: Hit vs Normali (Averages of core characteristics)
      const hitVsNormalRes = await dbConn.query(`
        SELECT 
          'Tutti i Brani' AS group_name,
          AVG(tr.danceability) AS avg_danceability,
          AVG(tr.energy) AS avg_energy,
          AVG(tr.valence) AS avg_valence,
          AVG(CAST(tr.is_explicit AS INTEGER)) AS avg_explicit
        FROM dim_traccia tr
        UNION ALL
        SELECT 
          'Top 10 Hits' AS group_name,
          AVG(tr.danceability) AS avg_danceability,
          AVG(tr.energy) AS avg_energy,
          AVG(tr.valence) AS avg_valence,
          AVG(CAST(tr.is_explicit AS INTEGER)) AS avg_explicit
        FROM fact_chart_entry f
        JOIN dim_traccia tr ON f.track_key = tr.track_key
        WHERE f.daily_rank <= 10
      `);
      const hitVsNormalRows = hitVsNormalRes.toArray().map(cleanRow);
      const normalProfile = hitVsNormalRows.find(r => r.group_name === 'Tutti i Brani') || { avg_danceability: 0.6, avg_energy: 0.6, avg_valence: 0.5, avg_explicit: 0.2 };
      const hitProfile = hitVsNormalRows.find(r => r.group_name === 'Top 10 Hits') || { avg_danceability: 0.7, avg_energy: 0.7, avg_valence: 0.6, avg_explicit: 0.4 };
      setHitVsNormalData([
        { name: 'Danceability (Ritmica)', 'Tutti i Brani': parseFloat(normalProfile.avg_danceability || 0), 'Top 10 Hits': parseFloat(hitProfile.avg_danceability || 0) },
        { name: 'Energy (Energia)', 'Tutti i Brani': parseFloat(normalProfile.avg_energy || 0), 'Top 10 Hits': parseFloat(hitProfile.avg_energy || 0) },
        { name: 'Valence (Umore)', 'Tutti i Brani': parseFloat(normalProfile.avg_valence || 0), 'Top 10 Hits': parseFloat(hitProfile.avg_valence || 0) },
        { name: 'Explicit % (Liriche)', 'Tutti i Brani': parseFloat(normalProfile.avg_explicit || 0), 'Top 10 Hits': parseFloat(hitProfile.avg_explicit || 0) }
      ]);

      // Query 3: Durata Media (Top 10 vs Top 30 vs Database)
      const durationRes = await dbConn.query(`
        SELECT 
          'Database (Tutti)' AS group_name,
          AVG(tr.duration_ms)/1000 AS avg_duration
        FROM dim_traccia tr
        UNION ALL
        SELECT 
          'Top 30 Hits' AS group_name,
          AVG(tr.duration_ms)/1000 AS avg_duration
        FROM fact_chart_entry f
        JOIN dim_traccia tr ON f.track_key = tr.track_key
        WHERE f.daily_rank > 10 AND f.daily_rank <= 30
        UNION ALL
        SELECT 
          'Top 10 Hits' AS group_name,
          AVG(tr.duration_ms)/1000 AS avg_duration
        FROM fact_chart_entry f
        JOIN dim_traccia tr ON f.track_key = tr.track_key
        WHERE f.daily_rank <= 10
      `);
      const durationRows = durationRes.toArray().map(cleanRow);
      setDurationComparisonData(durationRows.map(r => ({
        name: r.group_name,
        'Durata Media (Secondi)': parseFloat(r.avg_duration || 0)
      })));

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
      WITH sm AS (
          SELECT
              tr.name AS track_name,
              ANY_VALUE(f.artist_group_key) AS artist_group_key,
              MIN(f.daily_rank) AS daily_rank,
              AVG(f.popularity) AS popularity,
              MAX(${localWeight} * (51 - f.daily_rank) + ${globalWeight} * f.popularity) AS simulated_score
          FROM fact_chart_entry f
          JOIN dim_tempo t ON f.date_key = t.date_key
          JOIN dim_paese p ON f.country_key = p.country_key
          JOIN dim_traccia tr ON f.track_key = tr.track_key
          LEFT JOIN dim_genere gtr ON tr.genre_key = gtr.genre_key
          WHERE p.country_code = '${selectedCountry}'
            AND t.year = ${selectedTimeframe.year}
            AND t.week = ${selectedTimeframe.week}
            ${getGenreSqlCondition(selectedGenre)}
          GROUP BY tr.name
          ORDER BY simulated_score DESC
          LIMIT 10
      ),
      an AS (
          SELECT ba.artist_group_key, string_agg(a.name, ', ' ORDER BY a.name) AS artist_names
          FROM bridge_artista ba JOIN dim_artista a ON ba.artist_key = a.artist_key
          GROUP BY ba.artist_group_key
      )
      SELECT sm.track_name, an.artist_names, sm.daily_rank, sm.popularity, sm.simulated_score
      FROM sm LEFT JOIN an ON sm.artist_group_key = an.artist_group_key
      ORDER BY sm.simulated_score DESC
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
        WITH ti AS (
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
                ANY_VALUE(f.artist_group_key) AS artist_group_key,
                ANY_VALUE(al.name) AS album_name,
                ANY_VALUE(al.release_date) AS release_date,
                ANY_VALUE(al.release_year) AS release_year,
                MIN(f.daily_rank) AS peak_rank_all_time,
                MAX(f.days_on_chart) AS max_days_on_chart,
                MAX(f.n_countries_charted) AS max_countries_charted
            FROM fact_chart_entry f
            JOIN dim_traccia tr ON f.track_key = tr.track_key
            JOIN dim_album al ON f.album_key = al.album_key
            WHERE tr.name = '${escapedName}'
            GROUP BY tr.spotify_id, tr.name, tr.duration_ms, tr.is_explicit,
                     tr.danceability, tr.energy, tr.valence,
                     tr.mood_band, tr.energy_band, tr.valence_band
            LIMIT 1
        )
        SELECT
            ti.*,
            (SELECT string_agg(a.name, ', ' ORDER BY a.name)
             FROM bridge_artista ba
             JOIN dim_artista a ON ba.artist_key = a.artist_key
             WHERE ba.artist_group_key = ti.artist_group_key) AS artist_names
        FROM ti
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
            WITH tm AS (
                SELECT
                    tr.name AS track_name,
                    ANY_VALUE(f.artist_group_key) AS artist_group_key,
                    MAX(f.popularity) AS popularity,
                    MAX(f.days_on_chart) AS days_on_chart,
                    MIN(f.daily_rank) AS peak_rank
                FROM fact_chart_entry f
                JOIN dim_traccia tr ON f.track_key = tr.track_key
                WHERE LOWER(tr.name) LIKE '%${escapedQuery}%'
                GROUP BY tr.name
                ORDER BY days_on_chart DESC
                LIMIT 15
            ),
            an AS (
                SELECT ba.artist_group_key, string_agg(a.name, ', ' ORDER BY a.name) AS artist_names
                FROM bridge_artista ba JOIN dim_artista a ON ba.artist_key = a.artist_key
                GROUP BY ba.artist_group_key
            )
            SELECT tm.track_name, an.artist_names, tm.popularity, tm.days_on_chart, tm.peak_rank
            FROM tm LEFT JOIN an ON tm.artist_group_key = an.artist_group_key
            ORDER BY tm.days_on_chart DESC
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
        WITH artist_track_keys AS (
            SELECT DISTINCT f.track_key
            FROM fact_chart_entry f
            JOIN bridge_artista ba ON f.artist_group_key = ba.artist_group_key
            JOIN dim_artista a ON ba.artist_key = a.artist_key
            WHERE LOWER(a.name) = '${escapedArtist}'
        ),
        tm AS (
            SELECT
                tr.name AS track_name,
                ANY_VALUE(f.artist_group_key) AS artist_group_key,
                MIN(f.daily_rank) AS peak_rank,
                COUNT(DISTINCT f.date_key) AS days_on_chart,
                MAX(f.popularity) AS popularity
            FROM fact_chart_entry f
            JOIN dim_traccia tr ON f.track_key = tr.track_key
            WHERE f.track_key IN (SELECT track_key FROM artist_track_keys)
            GROUP BY tr.name
        ),
        an AS (
            SELECT ba.artist_group_key, string_agg(a.name, ', ' ORDER BY a.name) AS artist_names
            FROM bridge_artista ba JOIN dim_artista a ON ba.artist_key = a.artist_key
            GROUP BY ba.artist_group_key
        )
        SELECT tm.track_name, an.artist_names, tm.peak_rank, tm.days_on_chart, tm.popularity
        FROM tm LEFT JOIN an ON tm.artist_group_key = an.artist_group_key
        ORDER BY tm.days_on_chart DESC
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
          WITH fb AS (
              SELECT
                  tr.name AS track_name,
                  ANY_VALUE(f.artist_group_key) AS artist_group_key,
                  AVG(f.popularity) AS popularity,
                  AVG(tr.danceability) AS danceability,
                  AVG(tr.energy) AS energy,
                  AVG(tr.valence) AS valence,
                  SUM(f.performance_score) AS weekly_score
              FROM fact_chart_entry f
              JOIN dim_tempo t ON f.date_key = t.date_key
              JOIN dim_paese p ON f.country_key = p.country_key
              JOIN dim_traccia tr ON f.track_key = tr.track_key
              LEFT JOIN dim_genere gtr ON tr.genre_key = gtr.genre_key
              WHERE p.country_code = '${targetBCode}'
                AND t.year = ${selectedTimeframe.year}
                AND t.week = ${selectedTimeframe.week}
                ${getGenreSqlCondition(selectedGenre)}
              GROUP BY tr.name
          ),
          an AS (
              SELECT ba.artist_group_key, string_agg(a.name, ', ' ORDER BY a.name) AS artist_names
              FROM bridge_artista ba JOIN dim_artista a ON ba.artist_key = a.artist_key
              GROUP BY ba.artist_group_key
          )
          SELECT
              ROW_NUMBER() OVER (ORDER BY fb.weekly_score DESC, fb.popularity DESC) AS daily_rank,
              fb.track_name,
              an.artist_names,
              fb.popularity,
              fb.danceability,
              fb.energy,
              fb.valence
          FROM fb LEFT JOIN an ON fb.artist_group_key = an.artist_group_key
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

  // ── Slide 3/4/5 OLAP hooks — must be before early return ────────────────────
  useEffect(() => {
    if (!dbConn || loading) return;
    loadSlide3Data(slide3Country, setSlide3Stats, setSlide3LocalHits);
  }, [dbConn, loading, slide3Country]);

  useEffect(() => {
    if (!dbConn || loading || !slide3Compare) return;
    loadSlide3Data(slide3Compare, setSlide3CompareStats, setSlide3CompareHits);
  }, [dbConn, loading, slide3Compare]);

  useEffect(() => {
    if (!dbConn || loading || slide5Country === 'ALL') return;
    (async () => {
      try {
        const res = await dbConn.query(`
          WITH gl_tracks AS (
            SELECT DISTINCT f.track_key, t.year FROM fact_chart_entry f
            JOIN dim_tempo t ON f.date_key = t.date_key
            JOIN dim_paese p ON f.country_key = p.country_key WHERE p.country_code = 'GL'
          )
          SELECT t.year,
                 ROUND(100.0 * COUNT(DISTINCT gl.track_key) / NULLIF(COUNT(DISTINCT f.track_key), 0), 1) AS overlap_pct
          FROM fact_chart_entry f
          JOIN dim_tempo t ON f.date_key = t.date_key
          JOIN dim_paese p ON f.country_key = p.country_key
          LEFT JOIN gl_tracks gl ON f.track_key = gl.track_key AND t.year = gl.year
          WHERE p.country_code = '${slide5Country}'
          GROUP BY t.year ORDER BY t.year
        `);
        setSlide5TrendData(res.toArray().map(cleanRow));
      } catch (e) { console.error('Slide 5 slice error:', e); }
    })();
  }, [dbConn, loading, slide5Country]);

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
    return num.toLocaleString();
  };

  const formatCurrency = (num) => {
    if (!num) return "N/D";
    return "$" + Math.round(num).toLocaleString();
  };

  // ── Slide 3: SLICE & DICE ─────────────────────────────────────────────────
  const loadSlide3Data = async (code, setStats, setHits) => {
    if (!dbConn || !code) return;
    try {
      const [sRes, hRes] = await Promise.all([
        dbConn.query(`
          WITH gl AS (
            SELECT DISTINCT f.track_key FROM fact_chart_entry f
            JOIN dim_paese p ON f.country_key = p.country_key WHERE p.country_code = 'GL'
          )
          SELECT COUNT(DISTINCT f.track_key) AS total_tracks,
                 COUNT(DISTINCT CASE WHEN gl.track_key IS NOT NULL THEN f.track_key END) AS global_tracks,
                 ROUND(100.0 * COUNT(DISTINCT CASE WHEN gl.track_key IS NOT NULL THEN f.track_key END)
                   / NULLIF(COUNT(DISTINCT f.track_key), 0), 1) AS overlap_pct
          FROM fact_chart_entry f
          JOIN dim_paese p ON f.country_key = p.country_key
          LEFT JOIN gl ON f.track_key = gl.track_key
          WHERE p.country_code = '${code}'
        `),
        dbConn.query(`
          WITH gl AS (
            SELECT DISTINCT f.track_key FROM fact_chart_entry f
            JOIN dim_paese p ON f.country_key = p.country_key WHERE p.country_code = 'GL'
          ),
          lh AS (
            SELECT tr.name AS track_name, ANY_VALUE(f.artist_group_key) AS artist_group_key,
                   COUNT(*) AS presence
            FROM fact_chart_entry f
            JOIN dim_traccia tr ON f.track_key = tr.track_key
            JOIN dim_paese p ON f.country_key = p.country_key
            LEFT JOIN gl ON f.track_key = gl.track_key
            WHERE p.country_code = '${code}' AND gl.track_key IS NULL
            GROUP BY tr.name ORDER BY presence DESC LIMIT 5
          ),
          an AS (
            SELECT ba.artist_group_key, string_agg(a.name, ', ' ORDER BY a.name) AS artist_names
            FROM bridge_artista ba JOIN dim_artista a ON ba.artist_key = a.artist_key
            GROUP BY ba.artist_group_key
          )
          SELECT lh.track_name, an.artist_names
          FROM lh LEFT JOIN an ON lh.artist_group_key = an.artist_group_key
        `)
      ]);
      setStats(sRes.toArray().map(cleanRow)[0] || { overlap_pct: 0, total_tracks: 0, global_tracks: 0 });
      setHits(hRes.toArray().map(cleanRow));
    } catch (e) { console.error('Slide 3 error:', e); }
  };

  // ── Slide 4: DRILL-DOWN ───────────────────────────────────────────────────
  const drillToContinent = async (continent) => {
    if (!dbConn) return;
    setSlide4SelectedContinent(continent);
    try {
      const res = await dbConn.query(`
        WITH gl AS (
          SELECT DISTINCT f.track_key FROM fact_chart_entry f
          JOIN dim_paese p ON f.country_key = p.country_key WHERE p.country_code = 'GL'
        )
        SELECT p.country_name, p.country_code,
               ROUND(100.0 * COUNT(DISTINCT CASE WHEN gl.track_key IS NOT NULL THEN f.track_key END)
                 / NULLIF(COUNT(DISTINCT f.track_key), 0), 1) AS overlap_pct
        FROM fact_chart_entry f
        JOIN dim_paese p ON f.country_key = p.country_key
        LEFT JOIN gl ON f.track_key = gl.track_key
        WHERE p.country_code != 'GL' AND p.continent = '${continent}'
        GROUP BY p.country_name, p.country_code
        ORDER BY overlap_pct ASC
      `);
      setSlide4CountryData(res.toArray().map(cleanRow));
      setSlide4Level('country');
    } catch (e) { console.error('Drill-down continent error:', e); }
  };

  const drillToCountry = async (code, name) => {
    if (!dbConn) return;
    setSlide4SelectedCountry({ code, name });
    try {
      const res = await dbConn.query(`
        WITH gl AS (
          SELECT DISTINCT f.track_key FROM fact_chart_entry f
          JOIN dim_paese p ON f.country_key = p.country_key WHERE p.country_code = 'GL'
        ),
        lh AS (
          SELECT tr.name AS track_name, ANY_VALUE(f.artist_group_key) AS artist_group_key,
                 COALESCE(g.macro_genre, 'Other') AS macro_genre, COUNT(*) AS presence
          FROM fact_chart_entry f
          JOIN dim_traccia tr ON f.track_key = tr.track_key
          JOIN dim_paese p ON f.country_key = p.country_key
          LEFT JOIN dim_genere g ON tr.genre_key = g.genre_key
          LEFT JOIN gl ON f.track_key = gl.track_key
          WHERE p.country_code = '${code}' AND gl.track_key IS NULL
          GROUP BY tr.name, COALESCE(g.macro_genre, 'Other')
          ORDER BY presence DESC LIMIT 6
        ),
        an AS (
          SELECT ba.artist_group_key, string_agg(a.name, ', ' ORDER BY a.name) AS artist_names
          FROM bridge_artista ba JOIN dim_artista a ON ba.artist_key = a.artist_key
          GROUP BY ba.artist_group_key
        )
        SELECT lh.track_name, lh.macro_genre, an.artist_names
        FROM lh LEFT JOIN an ON lh.artist_group_key = an.artist_group_key
      `);
      setSlide4TrackData(res.toArray().map(cleanRow));
      setSlide4Level('tracks');
    } catch (e) { console.error('Drill-down country error:', e); }
  };

  const renderSlide = () => {
    const GENRE_COLORS = {
      'Hip-Hop/Rap': '#1DB954',
      'Pop/R&B': '#9B59B6',
      'Latin/World': '#E67E22',
      'Rock/Metal': '#E74C3C',
      'Electronic/Dance': '#3498DB',
      'Jazz/Blues': '#F39C12',
      'Classical': '#1ABC9C',
    };

    const mostLocal = divergenceCountries.slice(0, 7);
    const mostGlobal = [...divergenceCountries].slice(-7).reverse();
    const avgOverlap = divergenceCountries.length > 0
      ? Math.round(divergenceCountries.reduce((s, d) => s + parseFloat(d.overlap_pct || 0), 0) / divergenceCountries.length)
      : 0;

    const genreChartData = (() => {
      const continents = [...new Set(genreByRegionData.map(d => d.continent))].sort();
      return continents.map(cont => {
        const row = { continent: cont };
        genreByRegionData.filter(d => d.continent === cont).forEach(d => {
          row[d.macro_genre] = parseFloat(d.pct);
        });
        return row;
      });
    })();

    const topGenresGlobal = [...new Set(genreByRegionData.map(d => d.macro_genre))].slice(0, 6);

    const trendFirst = overlapTrendData[0];
    const trendLast = overlapTrendData[overlapTrendData.length - 1];
    const trendDelta = trendFirst && trendLast
      ? (parseFloat(trendLast.overlap_pct) - parseFloat(trendFirst.overlap_pct)).toFixed(1)
      : null;

    switch (currentSlide) {
      case 1:
        return (
          <div className="slide-content" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
            <div className="slide-eyebrow" style={{ color: '#1DB954', letterSpacing: '2px', fontWeight: 'bold' }}>
              SPOTIFY GLOBAL CHARTS · CULTURAL DIVERGENCE ANALYSIS
            </div>
            <h2 className="slide-title" style={{ fontSize: '3.2rem', fontWeight: '800', lineHeight: '1.1', margin: '20px 0' }}>
              Spotify ha reso il mondo<br/>musicalmente uguale?
            </h2>
            <p className="slide-subtitle" style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', maxWidth: '750px', marginBottom: '36px' }}>
              2,1 milioni di eventi. 72 nazioni. 8 anni di classifiche. La risposta nei dati è sorprendente.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', maxWidth: '820px' }}>
              <div className="glass-card" style={{ padding: '22px', textAlign: 'center', borderTop: '4px solid #E67E22' }}>
                <div style={{ fontSize: '2.8rem', fontWeight: '800', color: '#E67E22' }}>
                  {divergenceCountries.length > 0 ? `${Math.round(parseFloat(divergenceCountries[0]?.overlap_pct || 0))}%` : '…'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                  overlap col Global<br/><strong style={{ color: '#fff' }}>{divergenceCountries[0]?.country_name || '…'}</strong>
                  <br/><em style={{ fontSize: '0.7rem' }}>(più indipendente)</em>
                </div>
              </div>
              <div className="glass-card" style={{ padding: '22px', textAlign: 'center', borderTop: '4px solid #9B59B6' }}>
                <div style={{ fontSize: '2.8rem', fontWeight: '800', color: '#9B59B6' }}>
                  {avgOverlap ? `${avgOverlap}%` : '…'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                  media globale<br/><strong style={{ color: '#fff' }}>overlap con GL</strong>
                  <br/><em style={{ fontSize: '0.7rem' }}>(su 72 nazioni)</em>
                </div>
              </div>
              <div className="glass-card" style={{ padding: '22px', textAlign: 'center', borderTop: '4px solid #1DB954' }}>
                <div style={{ fontSize: '2.8rem', fontWeight: '800', color: '#1DB954' }}>
                  {divergenceCountries.length > 0 ? `${Math.round(parseFloat(divergenceCountries[divergenceCountries.length - 1]?.overlap_pct || 0))}%` : '…'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                  overlap col Global<br/><strong style={{ color: '#fff' }}>{divergenceCountries[divergenceCountries.length - 1]?.country_name || '…'}</strong>
                  <br/><em style={{ fontSize: '0.7rem' }}>(più globalizzato)</em>
                </div>
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="slide-content">
            <div className="slide-eyebrow">01 · I Brani che Attraversano i Confini</div>
            <h2 className="slide-title">Universali o locali? Pochi attraversano tutto.</h2>
            <p className="slide-subtitle">
              Nel DWH tracciamo quante nazioni ospitano ogni brano contemporaneamente. La stragrande maggioranza rimane confinata in pochi mercati — solo una manciata diventa davvero globale.
            </p>
            <div className="slide-live-panel" style={{ gridTemplateColumns: '1.3fr 1fr', gap: '20px', display: 'grid' }}>
              <div className="glass-panel" style={{ padding: '20px', marginBottom: 0 }}>
                <h4 style={{ fontSize: '0.95rem', color: '#1DB954', marginBottom: '12px' }}>
                  Top 10 Brani per Nazioni Raggiunte Simultaneamente
                </h4>
                <div style={{ width: '100%', height: '240px' }}>
                  {universalHitsData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={universalHitsData.map(r => ({
                          name: (r.track_name || '').slice(0, 18) + ((r.track_name || '').length > 18 ? '…' : ''),
                          fullName: r.track_name,
                          artist: r.artist_names,
                          countries: parseInt(r.n_countries || 0)
                        }))}
                        layout="vertical"
                        margin={{ top: 0, right: 20, left: 10, bottom: 0 }}
                      >
                        <XAxis type="number" domain={[0, 72]} tick={{ fill: '#9ea2b5', fontSize: 10 }} tickFormatter={v => `${v} naz.`} />
                        <YAxis type="category" dataKey="name" width={130} tick={{ fill: '#e0e0e0', fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{ background: '#181c26', border: '1px solid var(--border-light)', borderRadius: '4px', fontSize: '0.8rem' }}
                          formatter={(value, name, props) => [`${value} nazioni`, props.payload.fullName]}
                          labelFormatter={() => ''}
                        />
                        <Bar dataKey="countries" fill="#1DB954" radius={[0, 4, 4, 0]}>
                          {universalHitsData.map((_, i) => (
                            <Cell key={i} fill={i === 0 ? '#1DB954' : `rgba(29,185,84,${0.9 - i * 0.07})`} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Caricamento…</div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'center' }}>
                <div className="slide-card" style={{ padding: '16px', borderLeft: '3px solid #1DB954' }}>
                  <h4 style={{ color: '#1DB954', fontSize: '0.95rem', marginBottom: '4px' }}>Misura: n_countries_charted</h4>
                  <p style={{ fontSize: '0.8rem', margin: 0, color: 'var(--text-secondary)' }}>
                    Misura <strong>non-additiva</strong> nel DWH: calcolata con algoritmo bisect in ETL (PostgreSQL non supporta <code>COUNT(DISTINCT) OVER</code>). Usiamo MAX per il picco storico.
                  </p>
                </div>
                <div className="slide-card" style={{ padding: '16px', borderLeft: '3px solid #E67E22' }}>
                  <h4 style={{ color: '#E67E22', fontSize: '0.95rem', marginBottom: '4px' }}>L'Eccezione, non la Regola</h4>
                  <p style={{ fontSize: '0.8rem', margin: 0, color: 'var(--text-secondary)' }}>
                    Solo un pugno di brani raggiunge oltre 60 nazioni. La lunga coda della classifica è profondamente locale: ogni mercato ha il suo suono.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      case 3: {
        const sortedCountries = [...divergenceCountries].sort((a, b) => (a.country_name || '').localeCompare(b.country_name || ''));
        const CountryPanel = ({ stats, hits, label, color, isEmpty }) => (
          <div className="glass-panel" style={{ padding: '18px', marginBottom: 0, flex: 1, opacity: isEmpty ? 0.4 : 1, transition: 'opacity 0.3s', display: 'flex', flexDirection: 'column' }}>
            {isEmpty ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '8px', color: 'var(--text-secondary)' }}>
                <Globe size={28} style={{ opacity: 0.3 }} />
                <span style={{ fontSize: '0.8rem' }}>Seleziona un paese da confrontare</span>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '4px' }}>{label}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '2.4rem', fontWeight: '800', color }}>{Math.round(parseFloat(stats?.overlap_pct || 0))}%</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>overlap con Global</span>
                  </div>
                  <div style={{ marginTop: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
                    <div style={{ width: `${parseFloat(stats?.overlap_pct || 0)}%`, height: '100%', background: color, borderRadius: '6px', transition: 'width 0.8s ease' }} />
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {parseInt(stats?.global_tracks || 0).toLocaleString()} brani globali su {parseInt(stats?.total_tracks || 0).toLocaleString()} totali
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color, marginBottom: '8px', fontWeight: '600' }}>Top 5 brani esclusivi (non nel Global)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {hits.map((h, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: '5px', borderLeft: `2px solid ${color}` }}>
                      <span style={{ fontSize: '0.65rem', color, fontWeight: '700', width: '14px' }}>{i + 1}</span>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: '600', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.track_name}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.artist_names}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
        return (
          <div className="slide-content">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <div className="slide-eyebrow" style={{ margin: 0 }}>02 · SLICE &amp; DICE — ESPLORA UN PAESE</div>
              <span style={{ background: 'rgba(52,152,219,0.2)', color: '#3498DB', fontSize: '0.65rem', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', letterSpacing: '1px' }}>OLAP: SLICE</span>
              <span style={{ background: 'rgba(155,89,182,0.2)', color: '#9B59B6', fontSize: '0.65rem', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', letterSpacing: '1px' }}>DICE</span>
            </div>
            <h2 className="slide-title" style={{ fontSize: '2rem', margin: '8px 0' }}>Scegli un paese — i dati cambiano in tempo reale</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Paese principale:</span>
                <select
                  value={slide3Country}
                  onChange={e => setSlide3Country(e.target.value)}
                  style={{ background: '#181c26', border: '1px solid var(--border-light)', color: '#fff', padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  {sortedCountries.map(c => (
                    <option key={c.country_code} value={c.country_code}>{c.country_name}</option>
                  ))}
                </select>
              </div>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>vs</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Confronta (DICE):</span>
                <select
                  value={slide3Compare}
                  onChange={e => setSlide3Compare(e.target.value)}
                  style={{ background: '#181c26', border: '1px solid var(--border-light)', color: '#fff', padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  <option value="">— nessuno —</option>
                  {sortedCountries.filter(c => c.country_code !== slide3Country).map(c => (
                    <option key={c.country_code} value={c.country_code}>{c.country_name}</option>
                  ))}
                </select>
              </div>
              <span style={{ fontSize: '0.72rem', color: '#3498DB', background: 'rgba(52,152,219,0.1)', padding: '3px 8px', borderRadius: '4px' }}>
                Media globale: {avgOverlap}%
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: slide3Compare ? '1fr 1fr' : '1fr', gap: '16px', flex: 1 }}>
              <CountryPanel
                stats={slide3Stats}
                hits={slide3LocalHits}
                label={divergenceCountries.find(c => c.country_code === slide3Country)?.country_name || slide3Country}
                color="#E67E22"
                isEmpty={false}
              />
              {slide3Compare ? (
                <CountryPanel
                  stats={slide3CompareStats}
                  hits={slide3CompareHits}
                  label={divergenceCountries.find(c => c.country_code === slide3Compare)?.country_name || slide3Compare}
                  color="#1DB954"
                  isEmpty={false}
                />
              ) : (
                <CountryPanel isEmpty stats={null} hits={[]} label="" color="" />
              )}
            </div>
          </div>
        );
      }
      case 4: {
        const CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America'];
        const CONTINENT_COLORS = {
          'Africa': '#E67E22', 'Asia': '#E74C3C', 'Europe': '#3498DB',
          'North America': '#1DB954', 'Oceania': '#9B59B6', 'South America': '#F39C12'
        };
        const BreadCrumb = () => (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', marginBottom: '12px' }}>
            <span
              onClick={() => { setSlide4Level('continent'); setSlide4SelectedContinent(null); setSlide4CountryData([]); setSlide4SelectedCountry(null); setSlide4TrackData([]); }}
              style={{ color: '#3498DB', cursor: 'pointer', textDecoration: 'underline' }}
            >Continenti</span>
            {slide4SelectedContinent && (
              <>
                <span style={{ color: 'var(--text-secondary)' }}>/</span>
                <span
                  onClick={() => { if (slide4Level === 'tracks') { setSlide4Level('country'); setSlide4SelectedCountry(null); setSlide4TrackData([]); } }}
                  style={{ color: slide4Level === 'tracks' ? '#3498DB' : '#fff', cursor: slide4Level === 'tracks' ? 'pointer' : 'default', textDecoration: slide4Level === 'tracks' ? 'underline' : 'none' }}
                >{slide4SelectedContinent}</span>
              </>
            )}
            {slide4SelectedCountry && (
              <>
                <span style={{ color: 'var(--text-secondary)' }}>/</span>
                <span style={{ color: '#fff' }}>{slide4SelectedCountry.name}</span>
              </>
            )}
          </div>
        );
        return (
          <div className="slide-content">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <div className="slide-eyebrow" style={{ margin: 0 }}>03 · DRILL-DOWN — CONTINENTE → PAESE → BRANI</div>
              <span style={{ background: 'rgba(231,76,60,0.2)', color: '#E74C3C', fontSize: '0.65rem', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', letterSpacing: '1px' }}>OLAP: DRILL-DOWN</span>
            </div>
            <h2 className="slide-title" style={{ fontSize: '2rem', margin: '8px 0' }}>Clicca per scendere nella gerarchia</h2>
            <BreadCrumb />

            {slide4Level === 'continent' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', flex: 1 }}>
                {CONTINENTS.map(cont => {
                  const color = CONTINENT_COLORS[cont] || '#7F8C8D';
                  const countriesInCont = divergenceCountries.filter(c => c.continent === cont);
                  const avgOv = countriesInCont.length > 0
                    ? Math.round(countriesInCont.reduce((s, c) => s + parseFloat(c.overlap_pct || 0), 0) / countriesInCont.length)
                    : null;
                  return (
                    <button
                      key={cont}
                      onClick={() => drillToContinent(cont)}
                      style={{ background: 'rgba(255,255,255,0.04)', border: `2px solid ${color}30`, borderRadius: '10px', padding: '18px 14px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', color: '#fff' }}
                      onMouseOver={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = `${color}15`; }}
                      onMouseOut={e => { e.currentTarget.style.borderColor = `${color}30`; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    >
                      <div style={{ fontSize: '0.75rem', color, fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase' }}>{cont}</div>
                      {avgOv !== null && (
                        <>
                          <div style={{ fontSize: '2rem', fontWeight: '800', color }}>{avgOv}%</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>overlap medio · {countriesInCont.length} paesi</div>
                        </>
                      )}
                      <div style={{ fontSize: '0.72rem', color, marginTop: '10px' }}>Clicca per vedere i paesi →</div>
                    </button>
                  );
                })}
              </div>
            )}

            {slide4Level === 'country' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Overlap % in <strong style={{ color: '#fff' }}>{slide4SelectedContinent}</strong> — dal più locale al più globalizzato. Clicca un paese per vedere i brani esclusivi.
                </div>
                {slide4CountryData.length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Caricamento…</div>
                ) : (
                  <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {slide4CountryData.map((c, i) => {
                      const ov = parseFloat(c.overlap_pct || 0);
                      const color = CONTINENT_COLORS[slide4SelectedContinent] || '#3498DB';
                      return (
                        <button
                          key={c.country_code}
                          onClick={() => drillToCountry(c.country_code, c.country_name)}
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-light)', borderRadius: '6px', padding: '8px 12px', cursor: 'pointer', color: '#fff', textAlign: 'left', transition: 'background 0.15s' }}
                          onMouseOver={e => { e.currentTarget.style.background = `${color}15`; }}
                          onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                        >
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', width: '18px', flexShrink: 0 }}>{i + 1}</span>
                          <span style={{ fontSize: '0.82rem', fontWeight: '600', width: '130px', flexShrink: 0 }}>{c.country_name}</span>
                          <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: '4px', height: '10px', overflow: 'hidden' }}>
                            <div style={{ width: `${ov}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.6s' }} />
                          </div>
                          <span style={{ fontSize: '0.8rem', color, fontWeight: '700', width: '40px', textAlign: 'right', flexShrink: 0 }}>{Math.round(ov)}%</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>→</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {slide4Level === 'tracks' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Brani esclusivi (non nel Global) di <strong style={{ color: '#fff' }}>{slide4SelectedCountry?.name}</strong>
                </div>
                {slide4TrackData.length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Caricamento…</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', flex: 1 }}>
                    {slide4TrackData.map((t, i) => (
                      <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', borderLeft: '3px solid #E74C3C' }}>
                        <span style={{ fontSize: '1.4rem', fontWeight: '800', color: 'rgba(231,76,60,0.4)', flexShrink: 0 }}>{i + 1}</span>
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.track_name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.artist_names}</div>
                          {t.macro_genre && <span style={{ fontSize: '0.65rem', color: '#E74C3C', background: 'rgba(231,76,60,0.1)', padding: '1px 6px', borderRadius: '3px', display: 'inline-block', marginTop: '4px' }}>{t.macro_genre}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }
      case 5: {
        const trendDisplayData = slide5Country === 'ALL' ? overlapTrendData : slide5TrendData;
        const sortedForSlide5 = [...divergenceCountries].sort((a, b) => (a.country_name || '').localeCompare(b.country_name || ''));
        const isRollUp = slide5Country === 'ALL';
        const activeTrendData = trendDisplayData.map(r => ({ year: parseInt(r.year), overlap_pct: parseFloat(r.overlap_pct) }));
        const s5First = activeTrendData[0];
        const s5Last = activeTrendData[activeTrendData.length - 1];
        const s5Delta = s5First && s5Last ? (s5Last.overlap_pct - s5First.overlap_pct).toFixed(1) : null;
        return (
          <div className="slide-content">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <div className="slide-eyebrow" style={{ margin: 0 }}>04 · ROLL-UP / SLICE — TENDENZA NEL TEMPO</div>
              <span style={{ background: isRollUp ? 'rgba(52,152,219,0.2)' : 'rgba(155,89,182,0.2)', color: isRollUp ? '#3498DB' : '#9B59B6', fontSize: '0.65rem', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', letterSpacing: '1px' }}>
                OLAP: {isRollUp ? 'ROLL-UP' : 'SLICE'}
              </span>
            </div>
            <h2 className="slide-title" style={{ fontSize: '2rem', margin: '8px 0' }}>
              {isRollUp ? 'Aggregato globale — tutti i paesi' : `Trend specifico: ${divergenceCountries.find(c => c.country_code === slide5Country)?.country_name || slide5Country}`}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Paese:</span>
              <select
                value={slide5Country}
                onChange={e => setSlide5Country(e.target.value)}
                style={{ background: '#181c26', border: '1px solid var(--border-light)', color: '#fff', padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
              >
                <option value="ALL">ALL — Tutti i paesi (ROLL-UP)</option>
                {sortedForSlide5.map(c => (
                  <option key={c.country_code} value={c.country_code}>{c.country_name} (SLICE)</option>
                ))}
              </select>
              <div style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: '4px', background: isRollUp ? 'rgba(52,152,219,0.1)' : 'rgba(155,89,182,0.1)', color: isRollUp ? '#3498DB' : '#9B59B6', fontWeight: '600' }}>
                {isRollUp ? 'ROLL-UP: aggregazione su tutti i paesi' : 'SLICE: filtro per paese specifico'}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px', flex: 1 }}>
              <div className="glass-panel" style={{ padding: '20px', marginBottom: 0 }}>
                <h4 style={{ fontSize: '0.9rem', color: '#1DB954', marginBottom: '12px' }}>
                  Overlap Medio % — Anno per Anno {!isRollUp && `(${divergenceCountries.find(c => c.country_code === slide5Country)?.country_name})`}
                </h4>
                <div style={{ width: '100%', height: '220px' }}>
                  {activeTrendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={activeTrendData} margin={{ top: 10, right: 20, left: -15, bottom: 5 }}>
                        <XAxis dataKey="year" tick={{ fill: '#9ea2b5', fontSize: 10 }} />
                        <YAxis domain={['auto', 'auto']} tick={{ fill: '#9ea2b5', fontSize: 10 }} tickFormatter={v => `${v}%`} />
                        <Tooltip
                          contentStyle={{ background: '#181c26', border: '1px solid var(--border-light)', borderRadius: '4px' }}
                          formatter={(value) => [`${value}%`, 'Overlap medio']}
                        />
                        <ReferenceLine y={avgOverlap} stroke="rgba(155,89,182,0.5)" strokeDasharray="4 4" label={{ value: `media globale ${avgOverlap}%`, fill: '#9B59B6', fontSize: 9 }} />
                        <Line type="monotone" dataKey="overlap_pct" stroke={isRollUp ? '#1DB954' : '#9B59B6'} strokeWidth={3} dot={{ fill: isRollUp ? '#1DB954' : '#9B59B6', r: 5 }} activeDot={{ r: 7 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                      {slide5Country !== 'ALL' && slide5TrendData.length === 0 ? 'Caricamento…' : 'Dati non disponibili'}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'center' }}>
                {s5Delta !== null && (
                  <div className="glass-card" style={{ padding: '20px', textAlign: 'center', borderTop: `4px solid ${parseFloat(s5Delta) >= 0 ? '#1DB954' : '#E67E22'}` }}>
                    <div style={{ fontSize: '2.2rem', fontWeight: '800', color: parseFloat(s5Delta) >= 0 ? '#1DB954' : '#E67E22' }}>
                      {parseFloat(s5Delta) >= 0 ? '+' : ''}{s5Delta}pp
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                      {s5First?.year}→{s5Last?.year}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#fff', marginTop: '8px', fontWeight: '600' }}>
                      {parseFloat(s5Delta) >= 2 ? 'Convergenza' : parseFloat(s5Delta) <= -2 ? 'Divergenza' : 'Tendenza stabile'}
                    </div>
                  </div>
                )}
                <div className="slide-card" style={{ padding: '14px', borderLeft: `3px solid ${isRollUp ? '#3498DB' : '#9B59B6'}` }}>
                  <h4 style={{ color: isRollUp ? '#3498DB' : '#9B59B6', fontSize: '0.85rem', marginBottom: '6px' }}>
                    {isRollUp ? 'ROLL-UP applicato' : 'SLICE applicato'}
                  </h4>
                  <p style={{ fontSize: '0.75rem', margin: 0, color: 'var(--text-secondary)' }}>
                    {isRollUp
                      ? 'Aggregazione su tutti i paesi → media globale anno per anno. La granularità sale: da paese a mondo.'
                      : `Filtro su ${divergenceCountries.find(c => c.country_code === slide5Country)?.country_name}. Stessa query, WHERE country_code = '${slide5Country}'.`
                    }
                  </p>
                </div>
                <div className="slide-card" style={{ padding: '12px 14px', borderLeft: '3px solid rgba(255,255,255,0.15)' }}>
                  <p style={{ fontSize: '0.7rem', margin: 0, color: 'var(--text-secondary)' }}>
                    Query eseguita live su DuckDB-WASM · 2,1M righe · partition pruning su <code style={{ color: '#1DB954' }}>date_key</code>
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      }
      case 6:
        return (
          <div className="slide-content">
            <div className="slide-eyebrow">05 · Conclusioni</div>
            <h2 className="slide-title" style={{ fontSize: '2.8rem' }}>
              Spotify non globalizza la cultura.<br/>La amplifica.
            </h2>
            <p className="slide-subtitle" style={{ marginBottom: '28px' }}>
              Il Data Warehouse rivela che ogni mercato mantiene la sua identità musicale. La divergenza culturale non è un'anomalia: è la norma misurabile nei dati.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div className="glass-card" style={{ padding: '20px', textAlign: 'center', borderTop: '4px solid #E67E22' }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '6px' }}>Paese più Indipendente</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#E67E22' }}>{Math.round(parseFloat(divergenceCountries[0]?.overlap_pct || 0))}%</div>
                <div style={{ fontSize: '0.85rem', color: '#fff', marginTop: '4px', fontWeight: '600' }}>{divergenceCountries[0]?.country_name || '…'}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>overlap con Global</div>
              </div>
              <div className="glass-card" style={{ padding: '20px', textAlign: 'center', borderTop: '4px solid #9B59B6' }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '6px' }}>Media su 72 Nazioni</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#9B59B6' }}>{avgOverlap}%</div>
                <div style={{ fontSize: '0.85rem', color: '#fff', marginTop: '4px', fontWeight: '600' }}>overlap medio</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>dei brani è locale</div>
              </div>
              <div className="glass-card" style={{ padding: '20px', textAlign: 'center', borderTop: '4px solid #1DB954' }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '6px' }}>Tendenza {trendFirst?.year}→{trendLast?.year}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '800', color: trendDelta && parseFloat(trendDelta) >= 0 ? '#1DB954' : '#E67E22' }}>
                  {trendDelta ? `${parseFloat(trendDelta) >= 0 ? '+' : ''}${trendDelta}pp` : '…'}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#fff', marginTop: '4px', fontWeight: '600' }}>
                  {trendDelta ? (parseFloat(trendDelta) >= 2 ? 'Convergenza' : parseFloat(trendDelta) <= -2 ? 'Divergenza' : 'Stabilità') : '…'}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>variazione overlap</div>
              </div>
            </div>
            <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', background: 'rgba(29, 185, 84, 0.05)', border: '1px solid rgba(29, 185, 84, 0.2)', borderRadius: '6px' }}>
              <div style={{ color: '#1DB954' }}><Award size={22} /></div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                <strong style={{ color: '#fff' }}>Validato empiricamente su DuckDB-WASM.</strong> Tutte le metriche — overlap%, distribuzione generi, trend temporale — sono calcolate in tempo reale dal DWH con schema star (bridge Kimball, dim_genere conformata, fact partizionata 2017–2024). Nessun dato pre-impostato.
              </p>
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
              {[1, 2, 3, 4, 5, 6].map((s) => (
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
                Slide {currentSlide} di 6
              </span>
              <button 
                className="slide-nav-btn" 
                onClick={() => setCurrentSlide(prev => Math.min(prev + 1, 6))}
                disabled={currentSlide === 6}
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
                    <Sparkles size={14} style={{ marginRight: '4px', display: 'inline' }} /> Acoustic Features
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
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginTop: '10px' }}>
                  <div className="song-table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                      Classifica annuale basata sui <strong>Chart Points</strong> totalizzati nel corso del {selectedTimeframe.year} in {countryStats.country_name || selectedCountry}.
                    </p>
                    <table className="song-table">
                      <thead>
                        <tr>
                          <th className="song-rank-col">Rank</th>
                          <th>Titolo</th>
                          <th>Artista</th>
                          <th style={{ textAlign: 'right' }}>Punti</th>
                        </tr>
                      </thead>
                      <tbody>
                        {yearlyCountrySongs.map((s, idx) => (
                          <tr key={idx} onClick={() => loadTrackDetail(s.track_name, 'dashboard')} style={{ cursor: 'pointer' }}>
                            <td className="song-rank-col">#{idx + 1}</td>
                            <td style={{ fontWeight: '500' }}>{s.track_name}</td>
                            <td>{renderArtistCell(s.artist_names)}</td>
                            <td style={{ fontWeight: 'bold', color: 'var(--accent-green)', textAlign: 'right' }}>{formatNumber(s.chart_points)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="glass-panel" style={{ padding: '16px', marginBottom: 0, display: 'flex', flexDirection: 'column' }}>
                    <h4 style={{ fontSize: '0.95rem', marginBottom: '12px', color: 'var(--accent-green)' }}>Distribuzione Chart Points (Top 10)</h4>
                    <div style={{ width: '100%', height: '300px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={yearlyCountrySongs.slice(0, 10).map(s => ({ name: s.track_name.substring(0, 15), Punti: s.chart_points }))} layout="vertical" margin={{ top: 5, right: 15, left: 10, bottom: 5 }}>
                          <XAxis type="number" tick={{ fill: '#9ea2b5', fontSize: 10 }} />
                          <YAxis dataKey="name" type="category" tick={{ fill: '#9ea2b5', fontSize: 9 }} width={90} />
                          <Tooltip contentStyle={{ background: '#181c26', border: '1px solid var(--border-light)' }} />
                          <Bar dataKey="Punti" fill="var(--accent-green)" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'yearly-global' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginTop: '10px' }}>
                  <div className="song-table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                      Classifica globale basata sui <strong>Chart Points</strong> totali in tutti i paesi nel {selectedTimeframe.year}.
                    </p>
                    <table className="song-table">
                      <thead>
                        <tr>
                          <th className="song-rank-col">Rank</th>
                          <th>Titolo</th>
                          <th>Artista</th>
                          <th style={{ textAlign: 'right' }}>Punti</th>
                        </tr>
                      </thead>
                      <tbody>
                        {yearlyGlobalSongs.map((s, idx) => (
                          <tr key={idx} onClick={() => loadTrackDetail(s.track_name, 'dashboard')} style={{ cursor: 'pointer' }}>
                            <td className="song-rank-col">#{idx + 1}</td>
                            <td style={{ fontWeight: '500' }}>{s.track_name}</td>
                            <td>{renderArtistCell(s.artist_names)}</td>
                            <td style={{ fontWeight: 'bold', color: 'var(--accent-purple)', textAlign: 'right' }}>{formatNumber(s.chart_points)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="glass-panel" style={{ padding: '16px', marginBottom: 0, display: 'flex', flexDirection: 'column' }}>
                    <h4 style={{ fontSize: '0.95rem', marginBottom: '12px', color: 'var(--accent-purple)' }}>Distribuzione Chart Points Globale (Top 10)</h4>
                    <div style={{ width: '100%', height: '300px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={yearlyGlobalSongs.slice(0, 10).map(s => ({ name: s.track_name.substring(0, 15), Punti: s.chart_points }))} layout="vertical" margin={{ top: 5, right: 15, left: 10, bottom: 5 }}>
                          <XAxis type="number" tick={{ fill: '#9ea2b5', fontSize: 10 }} />
                          <YAxis dataKey="name" type="category" tick={{ fill: '#9ea2b5', fontSize: 9 }} width={90} />
                          <Tooltip contentStyle={{ background: '#181c26', border: '1px solid var(--border-light)' }} />
                          <Bar dataKey="Punti" fill="var(--accent-purple)" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'mood-scatter' && (
                <div style={{ height: '380px', width: '100%', marginTop: '10px' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    Distribuzione delle caratteristiche acustiche delle Top 10 Hit settimanali: <strong>Valence</strong> (allegria/felicità, in verde) ed <strong>Energy</strong> (intensità/ritmo, in viola) a confronto per ciascun brano.
                  </p>
                  
                  <div style={{ width: '100%', height: '300px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topSongs.slice(0, 10).map(s => ({ name: s.track_name.substring(0, 15), Valence: parseFloat(s.valence || 0), Energy: parseFloat(s.energy || 0) }))} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                        <XAxis dataKey="name" tick={{ fill: '#9ea2b5', fontSize: 9 }} />
                        <YAxis tick={{ fill: '#9ea2b5', fontSize: 10 }} domain={[0, 1]} />
                        <Tooltip contentStyle={{ background: '#181c26', border: '1px solid var(--border-light)' }} />
                        <Legend />
                        <Bar dataKey="Valence" fill="var(--accent-green)" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="Energy" fill="var(--accent-purple)" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
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
