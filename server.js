import express from 'express';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import cors from 'cors';
import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";

dotenv.config();

const PORT = process.env.PORT || 8000;

const app = express();
app.use(express.json());
app.use(cors());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(express.static(path.join(__dirname, './frontend')));



// TMDB movies proxy route
app.get('/api/movies', async (req, res) => {
  const { genreID, startYear, endYear } = req.query;
  const startDate = new Date(startYear, 0, 1).toISOString().slice(0, 10);
  const endDate = new Date(endYear, 11, 31).toISOString().slice(0, 10);

  const TMDB_API_KEY = process.env.TMDB_API_KEY;

  const url = `https://api.themoviedb.org/3/discover/movie?include_adult=false&language=en-US&page=1&with_genres=${genreID}&primary_release_date.gte=${startDate}&primary_release_date.lte=${endDate}&api_key=${TMDB_API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data.results);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch movies' });
  }
});


// Image proxy route
app.get('/proxy-image', async (req, res) => {
  const imageUrl = req.query.url;
  try {
    const response = await fetch(imageUrl);
    res.set('Content-Type', response.headers.get('content-type'));
    response.body.pipe(res);
  } catch (err) {
    res.status(500).send('Failed to fetch image');
  }
});


// OpenAI color extraction proxy
app.post('/api/extract-colors', async (req, res) => {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const body = req.body;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json(err);
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to extract colors' });
  }
});


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, "./frontend/index.html"));
});

app.listen(PORT, () => {
  console.log(`Image proxy server running at http://localhost:${PORT}`);
});