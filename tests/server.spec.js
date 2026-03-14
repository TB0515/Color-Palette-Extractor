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
