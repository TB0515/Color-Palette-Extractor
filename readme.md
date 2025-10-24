# Color Palette AI

Small web app that extracts dark and light color palettes from movie posters and applies them to the page theme.

- Live UI: [frontend/index.html](frontend/index.html)  
- Client logic: [frontend/main.js](frontend/main.js)  
- Server (API + image proxy + static host): [server.js](server.js) 
- Styling: [frontend/styles.css](frontend/styles.css)  
- Project config: [package.json](package.json)

## Features
- Browse movies by genre and year using The Movie Database (TMDB) API ([`fetchMovies`](main.js)).
- Select a poster to preview and request an extracted dark or light color palette.
- Proxy poster images through the local server to convert them to base64 without CORS issues.
- Dynamically update CSS root variables to theme the page ([`applyPaletteToTheme`](main.js)).

## Requirements
- Node.js >= 16
- npm
- TMDB API key (server-side)
- OpenAI API key (server-side)

## Setup

1. Install dependencies:
   ```sh
   npm install
   ```

2. Create a `.env` in the project root (or set environment variables in your environment):
   ```
   TMDB_API_KEY=your_tmdb_api_key
   OPENAI_API_KEY=your_openai_api_key
   PORT=8000   # optional
   ```

3. Ensure the server implements the /api routes listed above and uses TMDB_API_KEY & OPENAI_API_KEY from env vars. Do not put either key in frontend/main.js.

## Run

Start the local server (serves static files and handles the image proxy):
```sh
npm start
```
Open: http://localhost:8000

## Usage
1. Choose a start and end year and a genre, or use the search box. ([`fetchMovies`](main.js)).
2. Click a movie card to preview the poster.
3. Click "Generate Dark-Themed Palette" or "Generate Light-Themed Palette".
   - Client will request the server to extract colors. The server should forward to OpenAI and return the OpenAI response.
4. Extracted palette will be shown in the "Color Palette" text area and applied to CSS variables.

## Notes & Security
- All API keys must remain server-side. The frontend posts images and prompts to the server; the server is responsible for contacting OpenAI and returning a safe response.
- The server proxy at [`/proxy-image` route handler](server.js) streams remote images to the client to avoid CORS restrictions when converting to base64.
- Do not commit .env with keys. Add `.env` to .gitignore.
- The app expects the OpenAI response to return a JSON schema matching the structure defined in [main.js](main.js).

Expected JSON schema (client expects a JSON string in choices[0].message.content that parses to this object)
```json
{
  "background": "#111111",
  "hover": "#222222",
  "button": "#FFAA00",
  "darkOne": "#0F0F0F",
  "darkTwo": "#1A1A1A",
  "lightOne": "#EFEFEF",
  "lightTwo": "#CCCCCC"
}
```

## Files
- frontend/index.html — UI and controls
- frontend/main.js — client code (fetches /api endpoints, converts poster to base64 via /proxy-image, posts to /api/extract-colors)
- server.js — API + proxy + static server (implement TMDB calls, /proxy-image, /api/extract-colors)
- frontend/styles.css — styling
- package.json

## Troubleshooting
- Posters not appearing: ensure the TMDB route implemented by server returns movie objects with poster_path, and the frontend uses the TMDB image base URL (https://media.themoviedb.org/t/p/w220_and_h330_face).
- Image base64 conversion failing: confirm /proxy-image is reachable and correctly streams remote images (client calls `/proxy-image?url=...`).
- Palette extraction fails: inspect Network tab for POST /api/extract-colors and check server logs. The client expects choices[0].message.content to be a JSON string; if your server modifies the OpenAI response, make it compatible.
- If you change the response schema from the assistant, update parsing in frontend/main.js accordingly.