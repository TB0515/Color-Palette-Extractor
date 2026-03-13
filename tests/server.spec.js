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
