import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";

dotenv.config();

const REQUIRED_ENV = ["TMDB_ACCESS_TOKEN", "OPENAI_API_KEY", "MONGODB_URI"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

if (!process.env.ALLOWED_ORIGINS) {
  console.warn(
    "Warning: ALLOWED_ORIGINS not set — defaulting to http://localhost:8000. Set this in production.",
  );
}

const mongoClient = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
let db;

async function connectDB() {
  await mongoClient.connect();
  db = mongoClient.db();
  await db
    .collection("palettes")
    .createIndex({ movieId: 1, theme: 1 }, { unique: true });
  console.log("Connected to MongoDB");
}

const PORT = process.env.PORT || 8000;

const app = express();
app.use(express.json({ limit: "11mb" }));

const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS || "http://localhost:8000"
).split(",");
app.use(
  cors({
    origin: (origin, cb) =>
      ALLOWED_ORIGINS.includes(origin)
        ? cb(null, true)
        : cb(new Error("Not allowed")),
  }),
);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "https://media.themoviedb.org", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
  }),
);

const extractColorsLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
const proxyImageLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

function fetchWithTimeout(url, options = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(id),
  );
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(express.static(path.join(__dirname, "./frontend")));

const TMDB_OPTIONS = {
  headers: {
    accept: "application/json",
    Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`,
  },
};

// TMDB movies proxy route
app.get("/api/movies", apiLimiter, async (req, res) => {
  const { genreID, startYear, endYear, page } = req.query;
  const pageNumber = Math.min(Math.max(parseInt(page) || 1, 1), 500);

  const start = parseInt(startYear, 10);
  const end = parseInt(endYear, 10);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 1888 ||
    end > 2100 ||
    start > end
  ) {
    return res.status(400).json({ error: "Invalid year range" });
  }
  if (genreID === undefined || genreID === null) {
    return res
      .status(400)
      .json({ error: "Missing required parameter: genreID" });
  }
  if (genreID !== "" && !/^\d+$/.test(genreID)) {
    return res.status(400).json({ error: "Invalid genreID" });
  }

  try {
    const startDate = new Date(start, 0, 1).toISOString().slice(0, 10);
    const endDate = new Date(end, 11, 31).toISOString().slice(0, 10);

    const genreParam = genreID ? `&with_genres=${genreID}` : "";
    const url = `https://api.themoviedb.org/3/discover/movie?include_adult=false&language=en-US&page=${pageNumber}${genreParam}&primary_release_date.gte=${startDate}&primary_release_date.lte=${endDate}`;
    const response = await fetchWithTimeout(url, TMDB_OPTIONS, 15_000);
    if (!response.ok) {
      return res.status(502).json({ error: "Failed to fetch from TMDB" });
    }
    const data = await response.json();
    res.json({
      results: data.results ?? [],
      totalPages: data.total_pages ?? 1,
    });
  } catch (err) {
    if (err.name === "AbortError")
      return res.status(504).json({ error: "Request timed out" });
    console.error("Error fetching movies:", err.message);
    res.status(500).json({ error: "Failed to fetch movies" });
  }
});

// TMDB search movies proxy route
app.get("/api/searchmovies", apiLimiter, async (req, res) => {
  const { query } = req.query;
  if (!query || !query.trim()) {
    return res.status(400).json({ error: "Missing query" });
  }

  const url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`;
  try {
    const response = await fetchWithTimeout(url, TMDB_OPTIONS, 15_000);
    if (!response.ok) {
      return res.status(502).json({ error: "Failed to fetch from TMDB" });
    }
    const data = await response.json();
    res.json(data.results ?? []);
  } catch (err) {
    if (err.name === "AbortError")
      return res.status(504).json({ error: "Request timed out" });
    console.error("Error searching movies:", err.message);
    res.status(500).json({ error: "Failed to search movies" });
  }
});

// Image proxy route to avoid CORS issues

app.get("/proxy-image", proxyImageLimiter, async (req, res) => {
  const imageUrl = req.query.url;
  let parsedUrl;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return res.status(400).json({ error: "Invalid image URL" });
  }
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== "media.themoviedb.org"
  ) {
    return res.status(400).json({ error: "Invalid image URL" });
  }
  try {
    const response = await fetchWithTimeout(imageUrl, {}, 20_000);
    if (!response.ok) {
      return res.status(502).json({ error: "Failed to fetch image" });
    }
    const contentLength = parseInt(
      response.headers.get("content-length") || "0",
      10,
    );
    if (contentLength > 10_000_000) {
      return res.status(413).json({ error: "Image too large" });
    }
    const upstreamContentType = response.headers.get("content-type") || "";
    if (!upstreamContentType.startsWith("image/")) {
      return res
        .status(502)
        .json({ error: "Upstream returned non-image content type" });
    }
    const chunks = [];
    let bytesReceived = 0;
    response.body.on("data", (chunk) => {
      bytesReceived += chunk.length;
      if (bytesReceived > 10_000_000) {
        response.body.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    response.body.on("error", (err) => {
      console.error("Error piping image stream:", err.message);
      if (!res.headersSent)
        res.status(500).json({ error: "Failed to stream image" });
    });
    response.body.on("end", () => {
      if (bytesReceived > 10_000_000) {
        return res.status(413).json({ error: "Image too large" });
      }
      res.set("Content-Type", upstreamContentType);
      res.send(Buffer.concat(chunks));
    });
  } catch (err) {
    if (err.name === "AbortError")
      return res.status(504).json({ error: "Request timed out" });
    console.error("Error fetching image:", err.message);
    res.status(500).json({ error: "Failed to fetch image" });
  }
});

// WebAIM contrast checker — returns result object or null on network error
async function checkContrastPair(fg, bg) {
  const fcolor = fg.replace("#", "");
  const bcolor = bg.replace("#", "");
  try {
    const response = await fetchWithTimeout(
      `https://webaim.org/resources/contrastchecker/?fcolor=${fcolor}&bcolor=${bcolor}&api`,
      {},
      10_000,
    );
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// Audits all relevant contrast pairs for the given theme.
// Returns array of failing pair descriptors, or null if a network error
// prevented the audit (caller should skip retries and return palette as-is).
async function auditPalette(palette, theme) {
  const pairs =
    theme === "dark"
      ? [
          {
            label: "body text",
            bgKey: "background",
            fgKey: "lightOne",
            isUI: false,
          },
          {
            label: "filter/label text",
            bgKey: "background",
            fgKey: "lightTwo",
            isUI: false,
          },
          {
            label: "input border",
            bgKey: "background",
            fgKey: "lightTwo",
            isUI: true,
          },
          {
            label: "movie card text",
            bgKey: "darkTwo",
            fgKey: "lightTwo",
            isUI: false,
          },
          {
            label: "button text",
            bgKey: "button",
            fgKey: "darkOne",
            isUI: false,
          },
          {
            label: "button hover text",
            bgKey: "hover",
            fgKey: "darkOne",
            isUI: false,
          },
          {
            label: "sidebar text",
            bgKey: "darkOne",
            fgKey: "lightOne",
            isUI: false,
          },
        ]
      : [
          {
            label: "body text",
            bgKey: "background",
            fgKey: "darkOne",
            isUI: false,
          },
          {
            label: "filter/label text",
            bgKey: "background",
            fgKey: "darkTwo",
            isUI: false,
          },
          {
            label: "input border",
            bgKey: "background",
            fgKey: "darkTwo",
            isUI: true,
          },
          {
            label: "movie card text",
            bgKey: "lightTwo",
            fgKey: "darkOne",
            isUI: false,
          },
          {
            label: "button text",
            bgKey: "button",
            fgKey: "darkOne",
            isUI: false,
          },
          {
            label: "button hover text",
            bgKey: "hover",
            fgKey: "darkOne",
            isUI: false,
          },
          {
            label: "sidebar text",
            bgKey: "lightOne",
            fgKey: "darkOne",
            isUI: false,
          },
        ];

  const failures = [];
  for (const pair of pairs) {
    const bgHex = palette[pair.bgKey];
    const fgHex = palette[pair.fgKey];
    const result = await checkContrastPair(fgHex, bgHex);
    if (result === null) {
      console.warn(
        "[contrast audit] network error — skipping audit, returning palette as-is",
      );
      return null;
    }
    const passes = pair.isUI ? result.AALarge === "pass" : result.AA === "pass";
    if (!passes) {
      failures.push({
        label: pair.label,
        bgKey: pair.bgKey,
        fgKey: pair.fgKey,
        bgHex,
        fgHex,
        ratio: result.ratio,
        isUI: pair.isUI,
      });
    }
  }
  return failures;
}

// Calls OpenAI and returns choices array, or null on API error
async function callOpenAI(systemPrompt, imageBase64) {
  const outputStructure = {
    name: "poster_palette_schema",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "background",
        "surface",
        "hover",
        "button",
        "darkOne",
        "darkTwo",
        "lightOne",
        "lightTwo",
      ],
      properties: {
        background: { type: "string" },
        surface: { type: "string" },
        hover: { type: "string" },
        button: { type: "string" },
        darkOne: { type: "string" },
        darkTwo: { type: "string" },
        lightOne: { type: "string" },
        lightTwo: { type: "string" },
      },
    },
  };

  const requestBody = {
    model: "gpt-4o",
    response_format: {
      type: "json_schema",
      json_schema: outputStructure,
    },
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract color palette from this image as JSON following the defined roles.",
          },
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${imageBase64}` },
          },
        ],
      },
    ],
  };

  try {
    const response = await fetchWithTimeout(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
      90_000,
    );

    if (!response.ok) {
      console.error("OpenAI API error: status", response.status);
      return null;
    }

    const data = await response.json();
    return data.choices;
  } catch (err) {
    if (err.name === "AbortError") return null;
    console.error("OpenAI fetch error:", err.message);
    return null;
  }
}

// OpenAI color extraction proxy
app.post("/api/extract-colors", extractColorsLimiter, async (req, res) => {
  const { imageBase64, theme, movieId } = req.body;
  if (!imageBase64 || !["dark", "light"].includes(theme)) {
    return res.status(400).json({ error: "Invalid request" });
  }

  // base64 encodes ~4/3 of raw bytes; 10.9 MB base64 ≈ 8 MB decoded image
  if (imageBase64.length > 10_900_000) {
    return res.status(413).json({ error: "Image too large (max 8 MB)" });
  }

  // Cache lookup — only for saved palettes (skipped if DB not ready)
  const numericMovieId = Number(movieId);
  if (
    db &&
    movieId &&
    !Number.isNaN(numericMovieId) &&
    ["dark", "light"].includes(theme)
  ) {
    const cached = await db
      .collection("palettes")
      .findOne({ movieId: numericMovieId, theme });
    if (cached) {
      return res.json({
        cached: true,
        palette: cached.palette,
        id: cached._id,
      });
    }
  }

  const baseSystemPrompt =
    theme === "dark"
      ? "You are a color extraction assistant. Return eight hex-coded colors (background, surface, hover, button, darkOne, darkTwo, lightOne, lightTwo) derived from the uploaded poster. surface is a slightly lighter or darker shade of background, used for card and panel backgrounds. Always choose a dark color for the background. Ensure all other colors provide good, accessible contrast on the dark background from the poster composition."
      : "You are a color extraction assistant. Return eight hex-coded colors (background, surface, hover, button, darkOne, darkTwo, lightOne, lightTwo) derived from the uploaded poster. surface is a slightly lighter or darker shade of background, used for card and panel backgrounds. Always choose a light color for the background. Ensure all other colors provide good, accessible contrast on the light background from the poster composition.";

  let bestChoices = null;
  let bestFailureCount = Infinity;
  let currentSystemPrompt = baseSystemPrompt;

  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const choices = await callOpenAI(currentSystemPrompt, imageBase64);
      if (!choices) {
        if (attempt === 1) {
          return res
            .status(502)
            .json({ error: "Color extraction service unavailable" });
        }
        break;
      }

      let palette;
      try {
        palette = JSON.parse(choices[0].message.content);
      } catch {
        if (attempt === 1) {
          return res
            .status(502)
            .json({ error: "Color extraction service unavailable" });
        }
        break;
      }

      const failures = await auditPalette(palette, theme);

      // Network error during audit — skip retries, return current palette
      if (failures === null) {
        return res.json({ cached: false, choices, contrastAuditSkipped: true });
      }

      const failureCount = failures.length;

      if (failureCount < bestFailureCount) {
        bestChoices = choices;
        bestFailureCount = failureCount;
      }

      if (failureCount === 0) {
        return res.json({ cached: false, choices });
      }

      if (attempt < 3) {
        const failingKeys = [
          ...new Set(failures.flatMap((f) => [f.bgKey, f.fgKey])),
        ];
        const unchangedKeys = Object.keys(palette).filter(
          (k) => !failingKeys.includes(k),
        );
        const unchangedList = unchangedKeys
          .map((k) => `${k}=${palette[k]}`)
          .join(", ");
        const failingList = failures
          .map(
            (f) =>
              `- ${f.fgKey} (${f.fgHex}) on ${f.bgKey} (${f.bgHex}): ${f.ratio}:1 — needs ${f.isUI ? "≥3:1 [UI component]" : `≥4.5:1 [${f.label}]`}`,
          )
          .join("\n");

        currentSystemPrompt = `${baseSystemPrompt}\nThe previous palette had contrast failures. Revise ONLY the following colors to meet WCAG AA (4.5:1 for text, 3:1 for UI components). Keep ALL other colors exactly as-is.\n\nFailing pairs:\n${failingList}\n\nUnchanged colors: ${unchangedList}`;
      }
    }

    // All attempts exhausted — return best palette found
    return res.json({ cached: false, choices: bestChoices });
  } catch (err) {
    console.error("Error extracting colors:", err.message);
    res.status(500).json({ error: "Failed to extract colors" });
  }
});

// Saved palettes routes
app.get("/api/palettes", apiLimiter, async (_req, res) => {
  if (!db) return res.status(503).json({ error: "Database not ready" });
  try {
    const palettes = await db
      .collection("palettes")
      .find()
      .sort({ savedAt: -1 })
      .limit(200)
      .toArray();
    res.json(palettes);
  } catch (err) {
    console.error("Error fetching palettes:", err.message);
    res.status(500).json({ error: "Failed to fetch palettes" });
  }
});

const PALETTE_KEYS = [
  "background",
  "surface",
  "hover",
  "button",
  "darkOne",
  "darkTwo",
  "lightOne",
  "lightTwo",
];
const HEX_RE =
  /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

app.post("/api/palettes", apiLimiter, async (req, res) => {
  const { movieId, movieTitle, theme, palette } = req.body;
  if (
    !movieId ||
    !movieTitle ||
    !["dark", "light"].includes(theme) ||
    !palette ||
    typeof palette !== "object"
  ) {
    return res.status(400).json({ error: "Invalid request" });
  }
  const titleStr = String(movieTitle);
  if (titleStr.length > 500)
    return res.status(400).json({ error: "Invalid movieTitle" });
  if (
    PALETTE_KEYS.some((k) => !palette[k] || !HEX_RE.test(String(palette[k])))
  ) {
    return res.status(400).json({ error: "Invalid palette" });
  }
  const cleanPalette = Object.fromEntries(
    PALETTE_KEYS.map((k) => [k, palette[k]]),
  );
  const numericMovieId = Number(movieId);
  if (Number.isNaN(numericMovieId)) {
    return res.status(400).json({ error: "Invalid request" });
  }
  if (!db) return res.status(503).json({ error: "Database not ready" });
  try {
    const doc = {
      movieId: numericMovieId,
      movieTitle: titleStr,
      theme,
      palette: cleanPalette,
      savedAt: new Date(),
    };
    await db
      .collection("palettes")
      .replaceOne({ movieId: doc.movieId, theme }, doc, { upsert: true });
    const saved = await db
      .collection("palettes")
      .findOne({ movieId: doc.movieId, theme });
    res.status(201).json(saved);
  } catch (err) {
    console.error("Error saving palette:", err.message);
    res.status(500).json({ error: "Failed to save palette" });
  }
});

app.delete("/api/palettes/:id", apiLimiter, async (req, res) => {
  let objectId;
  try {
    objectId = new ObjectId(req.params.id);
  } catch {
    return res.status(400).json({ error: "Invalid id" });
  }
  if (!db) return res.status(503).json({ error: "Database not ready" });
  try {
    const result = await db.collection("palettes").deleteOne({ _id: objectId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Palette not found" });
    }
    res.status(204).end();
  } catch (err) {
    console.error("Error deleting palette:", err.message);
    res.status(500).json({ error: "Failed to delete palette" });
  }
});

app.get("/healthz", (_req, res) => {
  if (!db) {
    return res
      .status(503)
      .json({ status: "unavailable", reason: "database not connected" });
  }
  res.json({ status: "ok" });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "./frontend/index.html"));
});

(async () => {
  try {
    await connectDB();
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`Image proxy server running at http://localhost:${PORT}`);
  });

  async function shutdown() {
    server.close(async () => {
      try {
        await mongoClient.close();
      } catch (e) {
        console.error("MongoDB close error:", e.message);
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000);
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
})();
