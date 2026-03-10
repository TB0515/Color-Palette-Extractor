import { test, expect } from '@playwright/test';

test('proxy-image rejects non-TMDB URLs', async ({ request }) => {
  const res = await request.get('/proxy-image?url=https://evil.com/img.png');
  expect(res.status()).toBe(400);
});

test('proxy-image rejects missing url param', async ({ request }) => {
  const res = await request.get('/proxy-image');
  expect(res.status()).toBe(400);
});
