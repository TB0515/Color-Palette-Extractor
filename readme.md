# Color Palette AI

Small web app that extracts a color palette from a movie poster and applies it to the page theme.

- Live UI: [index.html](index.html)  
- Client logic: [main.js](main.js) — key functions: [`fetchMovies`](main.js), [`populateMovies`](main.js), [`getBase64FromImageUrl`](main.js), [`applyPaletteToTheme`](main.js), [`extractColors`](main.js), [`TMDB_API_KEY`](main.js)  
- Server (image proxy + static host): [server.js](server.js) — routes: [`/proxy-image` route handler](server.js), [`/` route handler](server.js)  
- Styling: [styles.css](styles.css)  
- Project config: [package.json](package.json)

## Features
- Browse movies by genre and year using The Movie Database (TMDB) API ([`fetchMovies`](main.js)).
- Select a poster to preview and request an extracted color palette ([`extractColors`](main.js)).
- Proxy poster images through the local server to convert them to base64 without CORS issues ([`/proxy-image` route handler](server.js)).
- Dynamically update CSS root variables to theme the page ([`applyPaletteToTheme`](main.js)).

## Requirements
- Node.js >= 16
- npm

## Setup

1. Install dependencies:
   ```sh
   npm install
   ```

2. Replace the placeholder API keys in [main.js](main.js):
   - TMDB: update [`TMDB_API_KEY`](main.js).
   - OpenAI: remove the hard-coded key inside [`extractColors`](main.js) and use an environment variable instead.

   Recommended: move keys into environment variables and read them in a secure way (do not commit keys).

## Run

Start the local server (serves static files and handles the image proxy):
```sh
npm start
```
Open: http://localhost:8000

## Usage
1. Choose a start and end year and a genre, then click Submit to load movie cards ([`fetchMovies`](main.js)).
2. Click a movie card to preview the poster.
3. Click "Generate Color Palatte" to send the poster (via base64) to the OpenAI chat completions request in [`extractColors`](main.js). The returned JSON schema is applied to CSS variables by [`applyPaletteToTheme`](main.js).

## Notes & Security
- The project currently contains hard-coded API keys in [main.js](main.js). Replace them with secure environment variables before sharing or pushing to version control.
- The server proxy at [`/proxy-image` route handler](server.js) streams remote images to the client to avoid CORS restrictions when converting to base64.
- The app expects the OpenAI response to return a JSON schema matching the structure defined in [main.js](main.js).

## Files
- [index.html](index.html)
- [main.js](main.js)
- [server.js](server.js)
- [styles.css](styles.css)
- [package.json](package.json)

## Troubleshooting
- If posters don't load, check console for networking errors and confirm the TMDB image base URL is reachable.
- If palette extraction fails, check the OpenAI response inside the browser console (see the network call made by [`extractColors`](main.js)).