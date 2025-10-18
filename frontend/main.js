window.addEventListener('load', function() {
    const startYearSelection = document.getElementById("startYear");
    const endYearSelection = document.getElementById("endYear");
    const filterOption = document.getElementById("genre");
    const searchInput = document.getElementById("searchInput");
    const searchButton = document.getElementById("searchButton");
    const movieContainer = document.getElementById("moviesContainer");
    const prevPageBtn = document.getElementById("prevPage");
    const nextPageBtn = document.getElementById("nextPage");
    const img = document.getElementById("moviePoster");
    const btn = document.getElementById("extractColor");

    let currentPage = 1;

    // Get Movie list
    async function fetchMovies(genreID, startYear, endYear, page) {
        const url = `/api/movies?genreID=${genreID}&startYear=${startYear}&endYear=${endYear}&page=${page}`;
        const response = await fetch(url);
        const movies = await response.json();
        
        populateMovies(movies)
    }

    function populateMovies(movies) {
        movies.forEach((movie) => {
            const card = document.createElement("button");
            card.classList.add("movieCard");

            card.addEventListener("click", () => {
                img.src = `https://media.themoviedb.org/t/p/w220_and_h330_face${movie.poster_path}`;
            });

            const movieImg = document.createElement("img");
            movieImg.src = `https://media.themoviedb.org/t/p/w220_and_h330_face${movie.poster_path}`;
            movieImg.alt = movie.title;
            movieImg.onerror = function () {
                this.onerror = null;
                this.src = "./images/movie_poster_placeholder.png";
            };
            const info = document.createElement("div");
            info.classList.add("movie-info");

            const nameEl = document.createElement("h3");
            nameEl.textContent = movie.title;

            info.appendChild(nameEl);
            
            card.appendChild(movieImg);
            card.appendChild(info);
            movieContainer.appendChild(card);
        });
    }

    filterOption.addEventListener("change", async () => {
        const currentGenreID = filterOption.value;
        const startYear = startYearSelection.value;
        const endYear = endYearSelection.value;
        currentPage = 1;
        movieContainer.innerHTML = "";
        await fetchMovies(currentGenreID, startYear, endYear, currentPage);
    });


    // Search functionality
    async function fetchSearchResults(query) {
        const url = `/api/searchmovies?query=${query}`;
        const response = await fetch(url);
        const movies = await response.json();
        populateMovies(movies);
    }

    searchButton.addEventListener("click", async () => {
        const query = searchInput.value.toLowerCase();
        movieContainer.innerHTML = "";
        await fetchSearchResults(query);
    });

    searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault(); 
            searchButton.click();    
        }
    });

    // Pagination with TMDB API


    prevPageBtn.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            movieContainer.innerHTML = "";
            const currentGenreID = filterOption.value;
            const startYear = startYearSelection.value;
            const endYear = endYearSelection.value;
            fetchMovies(currentGenreID, startYear, endYear, currentPage);
        }
    });

    nextPageBtn.addEventListener("click", () => {
        currentPage++;
        movieContainer.innerHTML = "";
        const currentGenreID = filterOption.value;
        const startYear = startYearSelection.value;
        const endYear = endYearSelection.value;
        fetchMovies(currentGenreID, startYear, endYear, currentPage);
    });


    //convert url to file object and then file to base64 string
    
    async function getBase64FromImageUrl(imageUrl) {
        const PROXY_BASE_URL = process.env.PROXY_BASE_URL || 'http://localhost:8000';
        const proxyUrl = `${PROXY_BASE_URL}/proxy-image?url=${encodeURIComponent(imageUrl)}`
        const response = await fetch(proxyUrl);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result.split(',')[1];
                resolve(base64data);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    
    // Change the CSS root 
    
    function applyPaletteToTheme(palette) {
        const root = document.documentElement; 
        for (const key in palette) {
            root.style.setProperty(`--${key}`, palette[key]);
        }
        document.body.classList.add('movieTheme');
    }
    
    // Structured Response Output
    
    let outputStructure = {
        name: "poster_palette_schema",
        strict: true,
        schema: {
            type: "object",
            additionalProperties: false,
            required: ["background", "hover", "button", "darkOne", "darkTwo", "lightOne", "lightTwo"],
            properties: {
                background: { type: "string" },
                hover: { type: "string" },
                button: { type: "string" },
                darkOne: { type: "string" },
                darkTwo: { type: "string" },
                lightOne: { type: "string" },
                lightTwo: { type: "string" }
            }
        }
    }
    
    // Getting the color palatte
    
    async function extractColors() {
        try {
            const base64Image = await getBase64FromImageUrl(img.src);
            if (!base64Image) {
                throw new Error('Base64 image data is empty');
            }
            const response = await fetch("/api/extract-colors", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "gpt-4o",
                    response_format: {
                        type: "json_schema",
                        json_schema: outputStructure
                    },
                    messages: [
                        {
                            role: "system",
                            content: "You are a color extraction assistant. Return six hex-coded colors (background, hover, button, darkOne, darkTwo, lightOne, lightTwo) derived from the uploaded poster.  Always choose a dark color for the background. Ensure all other colors provide good, accessible contrast on the dark background from the poster composition."
                        },
                        {
                            role: "user",
                            content: [
                                { type: "text", text: "Extract color palette from this image as JSON following the defined roles." },
                                { type: "image_url", image_url: { url: `data:image/png;base64,${base64Image}` } }
                            ]
                        }
                    ]
                })
            });
            if (!response.ok) {
                const err = await response.json();
                console.error("API error:", err);
                throw new Error(`OpenAI API error: ${response.status} ${err.error?.message || ''}`);
            }
            const data = await response.json();
            console.log(data);
            const palette = JSON.parse(data.choices[0].message.content);
            document.getElementById("colorValues").textContent = JSON.stringify(palette, null, 2);
            applyPaletteToTheme(palette);
            console.log("Extracted palette:", palette);
        } catch (err) {
            console.error("Error extracting colors:", err);
        }
    }
    
    btn.addEventListener("click", () => {
        document.getElementById("colorValues").textContent = "Extracting colors...";
        extractColors();
    });
})