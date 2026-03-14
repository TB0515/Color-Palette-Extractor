import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import cors from "cors";
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
app.use(express.json({ limit: "10mb" }));
app.use(cors());

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
app.get("/api/movies", async (req, res) => {
  const { genreID, startYear, endYear, page } = req.query;
  const pageNumber = Math.max(parseInt(page) || 1, 1);

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
  if (genreID !== "" && !/^\d+$/.test(genreID)) {
    return res.status(400).json({ error: "Invalid genreID" });
  }

  try {
    const startDate = new Date(start, 0, 1).toISOString().slice(0, 10);
    const endDate = new Date(end, 11, 31).toISOString().slice(0, 10);

    const genreParam = genreID ? `&with_genres=${genreID}` : "";
    const url = `https://api.themoviedb.org/3/discover/movie?include_adult=false&language=en-US&page=${pageNumber}${genreParam}&primary_release_date.gte=${startDate}&primary_release_date.lte=${endDate}`;
    const response = await fetch(url, TMDB_OPTIONS);
    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: "Failed to fetch from TMDB" });
    }
    const data = await response.json();
    res.json(data.results ?? []);
  } catch (err) {
    console.error("Error fetching movies:", err);
    res.status(500).json({ error: "Failed to fetch movies" });
  }
});

// TMDB search movies proxy route
app.get("/api/searchmovies", async (req, res) => {
  const { query } = req.query;
  if (!query || !query.trim()) {
    return res.status(400).json({ error: "Missing query" });
  }

  const url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`;
  try {
    const response = await fetch(url, TMDB_OPTIONS);
    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: "Failed to fetch from TMDB" });
    }
    const data = await response.json();
    res.json(data.results ?? []);
  } catch (err) {
    console.error("Error searching movies:", err);
    res.status(500).json({ error: "Failed to search movies" });
  }
});

// Image proxy route to avoid CORS issues

app.get("/proxy-image", async (req, res) => {
  const imageUrl = req.query.url;
  let parsedUrl;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return res.status(400).send("Invalid image URL");
  }
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== "media.themoviedb.org"
  ) {
    return res.status(400).send("Invalid image URL");
  }
  try {
    const response = await fetch(imageUrl);
    res.set("Content-Type", response.headers.get("content-type"));
    response.body.on("error", (err) => {
      console.error("Error piping image stream:", err);
      if (!res.headersSent) res.status(500).send("Failed to stream image");
    });
    response.body.pipe(res);
  } catch (err) {
    console.error("Error fetching image:", err);
    res.status(500).send("Failed to fetch image");
  }
});

// OpenAI color extraction proxy
app.post("/api/extract-colors", async (req, res) => {
  const { imageBase64, theme, movieId } = req.body;
  if (!imageBase64 || !["dark", "light"].includes(theme)) {
    return res.status(400).json({ error: "Invalid request" });
  }

  // Reject payloads where decoded image would exceed 8 MB
  if (imageBase64.length > 10_900_000) {
    return res.status(413).json({ error: "Image too large (max 8 MB)" });
  }

  // Cache lookup — only for saved palettes (skipped if DB not ready)
  if (db && movieId && ["dark", "light"].includes(theme)) {
    const cached = await db
      .collection("palettes")
      .findOne({ movieId: Number(movieId), theme });
    if (cached) {
      return res.json({
        cached: true,
        palette: cached.palette,
        id: cached._id,
      });
    }
  }

  const openaiApiKey = process.env.OPENAI_API_KEY;
  const systemPrompt =
    theme === "dark"
      ? "You are a color extraction assistant. Return six hex-coded colors (background, hover, button, darkOne, darkTwo, lightOne, lightTwo) derived from the uploaded poster.  Always choose a dark color for the background. Ensure all other colors provide good, accessible contrast on the dark background from the poster composition."
      : "You are a color extraction assistant. Return six hex-coded colors (background, hover, button, darkOne, darkTwo, lightOne, lightTwo) derived from the uploaded poster. Always choose a light color for the background. Ensure all other colors provide good, accessible contrast on the light background from the poster composition.";

  const outputStructure = {
    name: "poster_palette_schema",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "background",
        "hover",
        "button",
        "darkOne",
        "darkTwo",
        "lightOne",
        "lightTwo",
      ],
      properties: {
        background: { type: "string" },
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
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json(err);
    }

    const data = await response.json();
    res.json({ cached: false, choices: data.choices });
  } catch (err) {
    console.error("Error extracting colors:", err);
    res.status(500).json({ error: "Failed to extract colors" });
  }
});

// Saved palettes routes
app.get("/api/palettes", async (_req, res) => {
  if (!db) return res.status(503).json({ error: "Database not ready" });
  try {
    const palettes = await db
      .collection("palettes")
      .find()
      .sort({ savedAt: -1 })
      .toArray();
    res.json(palettes);
  } catch (err) {
    console.error("Error fetching palettes:", err);
    res.status(500).json({ error: "Failed to fetch palettes" });
  }
});

app.post("/api/palettes", async (req, res) => {
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
  if (!db) return res.status(503).json({ error: "Database not ready" });
  try {
    const doc = {
      movieId: Number(movieId),
      movieTitle: String(movieTitle),
      theme,
      palette,
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
    console.error("Error saving palette:", err);
    res.status(500).json({ error: "Failed to save palette" });
  }
});

app.delete("/api/palettes/:id", async (req, res) => {
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
    console.error("Error deleting palette:", err);
    res.status(500).json({ error: "Failed to delete palette" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "./frontend/index.html"));
});

connectDB().catch((err) => {
  console.error("Failed to connect to MongoDB:", err);
});

app.listen(PORT, () => {
  console.log(`Image proxy server running at http://localhost:${PORT}`);
});
