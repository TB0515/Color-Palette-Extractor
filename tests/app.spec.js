import { test, expect } from '@playwright/test';

const mockMovies = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  title: `Test Movie ${i + 1}`,
  poster_path: `/test${i + 1}.jpg`,
}));

const mockFewMovies = mockMovies.slice(0, 5);

const mockPalette = {
  choices: [{
    message: {
      content: JSON.stringify({
        background: "#111", hover: "#222", button: "#333",
        darkOne: "#444", darkTwo: "#555", lightOne: "#eee", lightTwo: "#ddd"
      })
    }
  }]
};

test.beforeEach(async ({ page }) => {
  await page.route('/api/movies*', route =>
    route.fulfill({ json: mockMovies })
  );
  await page.route('/api/searchmovies*', route =>
    route.fulfill({ json: mockFewMovies })
  );
  await page.route('/proxy-image*', route =>
    route.fulfill({ body: Buffer.alloc(100), contentType: 'image/jpeg' })
  );
  await page.route('/api/extract-colors', route =>
    route.fulfill({ json: mockPalette })
  );
  await page.goto('/');
});

test('page loads with correct title', async ({ page }) => {
  await expect(page).toHaveTitle(/Color Palette/i);
});

test('genre change fetches and shows movie cards', async ({ page }) => {
  await page.selectOption('#genre', '28');
  await expect(page.locator('.movieCard')).toHaveCount(20);
});

test('genre change shows at most 20 cards', async ({ page }) => {
  await page.selectOption('#genre', '28');
  const count = await page.locator('.movieCard').count();
  expect(count).toBeLessThanOrEqual(20);
});

test('switching genres replaces all cards', async ({ page }) => {
  await page.selectOption('#genre', '28');
  await expect(page.locator('.movieCard')).toHaveCount(20);
  await page.selectOption('#genre', '35');
  await expect(page.locator('.movieCard')).toHaveCount(20);
});

test('search returns movie cards', async ({ page }) => {
  await page.fill('#searchInput', 'Test');
  await page.click('#searchBtn');
  await expect(page.locator('.movieCard')).toHaveCount(5);
});

test('second search replaces first search results', async ({ page }) => {
  await page.fill('#searchInput', 'First');
  await page.click('#searchBtn');
  await expect(page.locator('.movieCard')).toHaveCount(5);

  await page.fill('#searchInput', 'Second');
  await page.click('#searchBtn');
  await expect(page.locator('.movieCard')).toHaveCount(5);
});

test('pagination controls show after genre load', async ({ page }) => {
  await page.selectOption('#genre', '28');
  await expect(page.locator('#pageControls')).toBeVisible();
});

test('pagination hidden after search', async ({ page }) => {
  await page.selectOption('#genre', '28');
  await expect(page.locator('#pageControls')).toBeVisible();
  await page.fill('#searchInput', 'Test');
  await page.click('#searchBtn');
  await expect(page.locator('#pageControls')).toBeHidden();
});

test('next and prev buttons are no-ops in search mode', async ({ page }) => {
  await page.fill('#searchInput', 'Test');
  await page.click('#searchBtn');
  await expect(page.locator('.movieCard')).toHaveCount(5);

  // Force show page controls to try clicking next
  await page.evaluate(() => {
    document.getElementById('pageControls').style.display = 'flex';
  });
  await page.click('#nextPage');
  // Should still show same 5 cards (search mode, no new fetch)
  await expect(page.locator('.movieCard')).toHaveCount(5);
});

test('movie card click updates poster src', async ({ page }) => {
  await page.selectOption('#genre', '28');
  await page.locator('.movieCard').first().click();
  const src = await page.locator('#moviePoster').getAttribute('src');
  expect(src).toContain('/proxy-image');
});

test('extract dark button is visible', async ({ page }) => {
  await expect(page.locator('#extractDarkColor')).toBeVisible();
});

test('extract buttons are disabled while loading', async ({ page }) => {
  await page.route('/api/extract-colors', async route => {
    await new Promise(r => setTimeout(r, 300));
    await route.fulfill({ json: mockPalette });
  });
  await page.selectOption('#genre', '28');
  await page.locator('.movieCard').first().click();

  const clickPromise = page.locator('#extractDarkColor').click();
  await expect(page.locator('#extractDarkColor')).toBeDisabled();
  await clickPromise;
});

test('shows error message when extraction fails', async ({ page }) => {
  await page.route('/api/extract-colors', route =>
    route.fulfill({ status: 500, json: { error: 'fail' } })
  );
  await page.selectOption('#genre', '28');
  await page.locator('.movieCard').first().click();
  await page.locator('#extractDarkColor').click();
  await expect(page.locator('#colorValues')).toContainText('Failed to extract');
});

test('successful palette extraction applies CSS vars', async ({ page }) => {
  await page.selectOption('#genre', '28');
  await page.locator('.movieCard').first().click();
  await page.locator('#extractDarkColor').click();
  const bg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
  );
  expect(bg).toBe('#111');
});

test('year error shown when startYear is greater than endYear', async ({ page }) => {
  await page.fill('#startYear', '2024');
  await page.fill('#endYear', '2020');
  await page.dispatchEvent('#startYear', 'change');
  await expect(page.locator('#yearError')).toBeVisible();
  await expect(page.locator('#yearError')).toContainText('Start year must not be greater than end year');
});

test('year inputs default to current year', async ({ page }) => {
  const currentYear = new Date().getFullYear().toString();
  const startVal = await page.inputValue('#startYear');
  const endVal = await page.inputValue('#endYear');
  expect(startVal).toBe(currentYear);
  expect(endVal).toBe(currentYear);
});
