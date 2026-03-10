# Color Palette Extractor

A web app that pulls movie posters from The Movie Database (TMDB) and uses GPT-4o's vision to extract colour palettes from them. Pick a poster, hit generate, and the whole UI recolours itself instantly using the extracted palette.

## Live Demo

https://color-palette-extractor-p2kn.onrender.com

## What it does

- Browse movies filtered by genre and release year, or search by title
- Click any movie card to load its poster into the analysis panel
- Extract a 7-colour dark or light themed palette from the poster via AI
- Colours are applied as CSS variables — background, hover states, buttons, and accents update in real time

## Tech stack

- **Backend:** Node.js, Express 5
- **Frontend:** Vanilla HTML, CSS, JavaScript
- **APIs:** [TMDB](https://www.themoviedb.org/) for movie data, OpenAI GPT-4o for colour extraction
- **Packages:** cors, dotenv, node-fetch

## Getting started

### Prerequisites

- Node.js v18+
- A [TMDB API key](https://developer.themoviedb.org/docs/getting-started)
- An [OpenAI API key](https://platform.openai.com/api-keys)

### Setup

```bash
git clone https://github.com/TB0515/Color-Palette-Extractor.git
cd Color-Palette-Extractor
npm install
```

Create a `.env` file in the root:

```
TMDB_ACCESS_TOKEN=your_tmdb_key
OPENAI_API_KEY=your_openai_key
PORT=8000
```

```bash
npm start
```

Open `http://localhost:8000` in your browser.

## Project structure

```
├── server.js          # Express server, API proxy routes
└── frontend/
    ├── index.html
    ├── main.js        # Movie browsing, base64 encoding, CSS variable updates
    └── styles.css
```
