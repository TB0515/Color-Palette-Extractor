import { test, expect } from "@playwright/test";

test("proxy-image rejects non-TMDB URLs", async ({ request }) => {
  const res = await request.get("/proxy-image?url=https://evil.com/img.png");
  expect(res.status()).toBe(400);
});

test("proxy-image rejects missing url param", async ({ request }) => {
  const res = await request.get("/proxy-image");
  expect(res.status()).toBe(400);
});

test("proxy-image rejects subdomain confusion (SSRF)", async ({ request }) => {
  const res = await request.get(
    "/proxy-image?url=https://media.themoviedb.org.evil.com/img.png",
  );
  expect(res.status()).toBe(400);
});

test("proxy-image rejects URL auth bypass (SSRF)", async ({ request }) => {
  const res = await request.get(
    "/proxy-image?url=https://media.themoviedb.org@evil.com/img.png",
  );
  expect(res.status()).toBe(400);
});

test("proxy-image rejects non-https protocol", async ({ request }) => {
  const res = await request.get(
    "/proxy-image?url=http://media.themoviedb.org/img.png",
  );
  expect(res.status()).toBe(400);
});

test("proxy-image rejects invalid URL string", async ({ request }) => {
  const res = await request.get("/proxy-image?url=not-a-url");
  expect(res.status()).toBe(400);
});

test("searchmovies rejects missing query", async ({ request }) => {
  const res = await request.get("/api/searchmovies");
  expect(res.status()).toBe(400);
});

test("searchmovies rejects empty query", async ({ request }) => {
  const res = await request.get("/api/searchmovies?query=");
  expect(res.status()).toBe(400);
});

test("movies rejects missing startYear", async ({ request }) => {
  const res = await request.get("/api/movies?genreID=28&endYear=2020");
  expect(res.status()).toBe(400);
});

test("movies rejects missing endYear", async ({ request }) => {
  const res = await request.get("/api/movies?genreID=28&startYear=2000");
  expect(res.status()).toBe(400);
});

test("movies rejects non-numeric startYear", async ({ request }) => {
  const res = await request.get(
    "/api/movies?genreID=28&startYear=abc&endYear=2020",
  );
  expect(res.status()).toBe(400);
});

test("movies rejects startYear greater than endYear", async ({ request }) => {
  const res = await request.get(
    "/api/movies?genreID=28&startYear=2020&endYear=2000",
  );
  expect(res.status()).toBe(400);
});

test("movies rejects missing genreID", async ({ request }) => {
  const res = await request.get("/api/movies?startYear=2000&endYear=2020");
  expect(res.status()).toBe(400);
});

test("movies rejects non-numeric genreID", async ({ request }) => {
  const res = await request.get(
    "/api/movies?genreID=abc&startYear=2000&endYear=2020",
  );
  expect(res.status()).toBe(400);
});

test("movies rejects non-numeric endYear", async ({ request }) => {
  const res = await request.get(
    "/api/movies?genreID=28&startYear=2000&endYear=abc",
  );
  expect(res.status()).toBe(400);
});

test("searchmovies rejects whitespace-only query", async ({ request }) => {
  const res = await request.get("/api/searchmovies?query=%20");
  expect(res.status()).toBe(400);
});

test("extract-colors rejects missing imageBase64", async ({ request }) => {
  const res = await request.post("/api/extract-colors", {
    data: { theme: "dark" },
  });
  expect(res.status()).toBe(400);
});

test("extract-colors rejects invalid theme", async ({ request }) => {
  const res = await request.post("/api/extract-colors", {
    data: { imageBase64: "abc123", theme: "invalid" },
  });
  expect(res.status()).toBe(400);
});

test("GET /api/palettes returns 200 with an array or 503 when DB unavailable", async ({
  request,
}) => {
  const res = await request.get("/api/palettes");
  if (res.status() === 200) {
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  } else {
    expect(res.status()).toBe(503);
  }
});

test("POST /api/palettes rejects missing movieId", async ({ request }) => {
  const res = await request.post("/api/palettes", {
    data: { movieTitle: "Test", theme: "dark", palette: {} },
  });
  expect(res.status()).toBe(400);
});

test("POST /api/palettes rejects invalid theme", async ({ request }) => {
  const res = await request.post("/api/palettes", {
    data: { movieId: 1, movieTitle: "Test", theme: "invalid", palette: {} },
  });
  expect(res.status()).toBe(400);
});

test("POST /api/palettes rejects missing palette", async ({ request }) => {
  const res = await request.post("/api/palettes", {
    data: { movieId: 1, movieTitle: "Test", theme: "dark" },
  });
  expect(res.status()).toBe(400);
});

test("DELETE /api/palettes/:id returns 400 for malformed id", async ({
  request,
}) => {
  const res = await request.delete("/api/palettes/not-an-id");
  expect(res.status()).toBe(400);
});

test("DELETE /api/palettes/:id returns 404 or 503 for non-existent id", async ({
  request,
}) => {
  const res = await request.delete("/api/palettes/000000000000000000000000");
  expect([404, 503]).toContain(res.status());
});
