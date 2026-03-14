window.addEventListener("load", function () {
  const startYearSelection = document.getElementById("startYear");
  const endYearSelection = document.getElementById("endYear");
  const filterOption = document.getElementById("genre");
  const searchInput = document.getElementById("searchInput");
  const searchButton = document.getElementById("searchBtn");
  const movieContainer = document.getElementById("moviesContainer");
  const pageControls = document.getElementById("pageControls");
  const prevPageBtn = document.getElementById("prevPage");
  const nextPageBtn = document.getElementById("nextPage");
  const img = document.getElementById("moviePoster");
  const btn = document.getElementById("extractDarkColor");
  const lightBtn = document.getElementById("extractLightColor");
  const yearError = document.getElementById("yearError");

  const PLACEHOLDER_IMG = "./images/movie_poster_placeholder.png";

  let currentPage = 1;
  let searchMode = false;

  // Set dynamic year max and default values
  const currentYear = new Date().getFullYear();
  startYearSelection.max = currentYear;
  endYearSelection.max = currentYear;
  startYearSelection.value = currentYear;
  endYearSelection.value = currentYear;

  // Year range validation
  function validateYearRange() {
    if (parseInt(startYearSelection.value) > parseInt(endYearSelection.value)) {
      yearError.textContent = "Start year must not be greater than end year.";
      yearError.style.display = "block";
      return false;
    }
    yearError.style.display = "none";
    return true;
  }

  startYearSelection.addEventListener("change", validateYearRange);
  endYearSelection.addEventListener("change", validateYearRange);

  // Get Movie list
  async function fetchMovies(genreID, startYear, endYear, page) {
    try {
      const url = `/api/movies?genreID=${genreID}&startYear=${startYear}&endYear=${endYear}&page=${page}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch movies: ${response.status}`);
      }
      const movies = await response.json();
      if (movies.length === 0) {
        pageControls.style.display = "none";
      } else {
        pageControls.style.display = "flex";
      }
      populateMovies(movies);
      return true;
    } catch (err) {
      console.error("Error fetching movies:", err);
      return false;
    }
  }

  function populateMovies(movies) {
    movieContainer.replaceChildren();
    const fragment = document.createDocumentFragment();
    movies.forEach((movie) => {
      const card = document.createElement("button");
      card.classList.add("movieCard");
      card.setAttribute("aria-label", "Select " + movie.title);

      card.addEventListener("click", () => {
        const tmdbUrl = `https://media.themoviedb.org/t/p/w220_and_h330_face${movie.poster_path}`;
        img.src = `/proxy-image?url=${encodeURIComponent(tmdbUrl)}`;
        img.alt = movie.title;
        img.dataset.tmdbUrl = tmdbUrl;
      });

      const movieImg = document.createElement("img");
      movieImg.src = `https://media.themoviedb.org/t/p/w220_and_h330_face${movie.poster_path}`;
      movieImg.alt = movie.title;
      movieImg.onerror = function () {
        this.onerror = null;
        this.src = PLACEHOLDER_IMG;
      };
      const info = document.createElement("div");
      info.classList.add("movie-info");

      const nameEl = document.createElement("h3");
      nameEl.textContent = movie.title;

      info.appendChild(nameEl);

      card.appendChild(movieImg);
      card.appendChild(info);
      fragment.appendChild(card);
    });
    movieContainer.appendChild(fragment);
  }

  filterOption.addEventListener("change", async () => {
    searchMode = false;
    if (!validateYearRange()) return;
    const currentGenreID = filterOption.value;
    const startYear = startYearSelection.value;
    const endYear = endYearSelection.value;
    currentPage = 1;
    await fetchMovies(currentGenreID, startYear, endYear, currentPage);
  });

  // Search functionality
  async function fetchSearchResults(query) {
    try {
      searchMode = true;
      pageControls.style.display = "none";
      const url = `/api/searchmovies?query=${encodeURIComponent(query)}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to search movies: ${response.status}`);
      }
      const movies = await response.json();
      populateMovies(movies);
    } catch (err) {
      console.error("Error searching movies:", err);
    }
  }

  searchButton.addEventListener("click", async () => {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) return;
    await fetchSearchResults(query);
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchButton.click();
    }
  });

  // Pagination with TMDB API

  prevPageBtn.addEventListener("click", async () => {
    if (searchMode) return;
    if (currentPage > 1) {
      const prevPage = currentPage - 1;
      const currentGenreID = filterOption.value;
      const startYear = startYearSelection.value;
      const endYear = endYearSelection.value;
      const success = await fetchMovies(
        currentGenreID,
        startYear,
        endYear,
        prevPage,
      );
      if (success) currentPage = prevPage;
    }
  });

  nextPageBtn.addEventListener("click", async () => {
    if (searchMode) return;
    const nextPage = currentPage + 1;
    const currentGenreID = filterOption.value;
    const startYear = startYearSelection.value;
    const endYear = endYearSelection.value;
    const success = await fetchMovies(
      currentGenreID,
      startYear,
      endYear,
      nextPage,
    );
    if (success) currentPage = nextPage;
  });

  //convert url to file object and then file to base64 string

  async function getBase64FromImageUrl(imageUrl) {
    const proxyUrl = `/proxy-image?url=${encodeURIComponent(imageUrl)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (!reader.result || !reader.result.includes(",")) {
          reject(new Error("Unexpected data URL format"));
          return;
        }
        const base64data = reader.result.split(",")[1];
        resolve(base64data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Change the CSS root

  function applyPaletteToTheme(palette, theme) {
    const root = document.documentElement;
    for (const key in palette) {
      root.style.setProperty(`--${key}`, palette[key]);
    }
    if (theme === "light") {
      document.body.classList.add("light-theme");
    } else {
      document.body.classList.remove("light-theme");
    }
  }

  // Getting the color palette

  async function extractDarkColors() {
    btn.disabled = true;
    lightBtn.disabled = true;
    try {
      const base64Image = await getBase64FromImageUrl(img.dataset.tmdbUrl);
      if (!base64Image) {
        throw new Error("Base64 image data is empty");
      }
      const response = await fetch("/api/extract-colors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageBase64: base64Image, theme: "dark" }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(
          `API error: ${response.status} ${err.error?.message || ""}`,
        );
      }
      const data = await response.json();
      let palette;
      try {
        palette = JSON.parse(data.choices[0].message.content);
      } catch {
        throw new Error("Received invalid color data from API");
      }
      document.getElementById("colorValues").textContent = JSON.stringify(
        palette,
        null,
        2,
      );
      applyPaletteToTheme(palette, "dark");
    } catch (err) {
      console.error("Error extracting colors:", err);
      document.getElementById("colorValues").textContent =
        "Failed to extract colors. Please try again.";
    } finally {
      btn.disabled = false;
      lightBtn.disabled = false;
    }
  }

  btn.addEventListener("click", () => {
    if (!img.dataset.tmdbUrl) {
      document.getElementById("colorValues").textContent =
        "Please select a movie poster first.";
      return;
    }
    document.getElementById("colorValues").textContent = "Extracting colors...";
    extractDarkColors();
  });

  async function extractLightColors() {
    btn.disabled = true;
    lightBtn.disabled = true;
    try {
      const base64Image = await getBase64FromImageUrl(img.dataset.tmdbUrl);
      if (!base64Image) {
        throw new Error("Base64 image data is empty");
      }
      const response = await fetch("/api/extract-colors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageBase64: base64Image, theme: "light" }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(
          `API error: ${response.status} ${err.error?.message || ""}`,
        );
      }
      const data = await response.json();
      let palette;
      try {
        palette = JSON.parse(data.choices[0].message.content);
      } catch {
        throw new Error("Received invalid color data from API");
      }
      document.getElementById("colorValues").textContent = JSON.stringify(
        palette,
        null,
        2,
      );
      applyPaletteToTheme(palette, "light");
    } catch (err) {
      console.error("Error extracting colors:", err);
      document.getElementById("colorValues").textContent =
        "Failed to extract colors. Please try again.";
    } finally {
      btn.disabled = false;
      lightBtn.disabled = false;
    }
  }

  lightBtn.addEventListener("click", () => {
    if (!img.dataset.tmdbUrl) {
      document.getElementById("colorValues").textContent =
        "Please select a movie poster first.";
      return;
    }
    document.getElementById("colorValues").textContent = "Extracting colors...";
    extractLightColors();
  });
});
