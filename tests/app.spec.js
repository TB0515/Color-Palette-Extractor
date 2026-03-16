import { test, expect } from "@playwright/test";

const mockMovies = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  title: `Test Movie ${i + 1}`,
  poster_path: `/test${i + 1}.jpg`,
}));

const mockMoviesWithNullPosters = [
  ...mockMovies,
  {
    id: 101,
    title: "Backdrop Only",
    poster_path: null,
    backdrop_path: "/bd1.jpg",
  },
  { id: 102, title: "No Image", poster_path: null, backdrop_path: null },
];

const mockFewMovies = mockMovies.slice(0, 5);

const mockPalette = {
  cached: false,
  choices: [
    {
      message: {
        content: JSON.stringify({
          background: "#111",
          surface: "#1a1a1a",
          hover: "#222",
          button: "#333",
          darkOne: "#444",
          darkTwo: "#555",
          lightOne: "#eee",
          lightTwo: "#ddd",
        }),
      },
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("/api/movies*", (route) =>
    route.fulfill({ json: { results: mockMovies, totalPages: 3 } }),
  );
  await page.route("/api/searchmovies*", (route) =>
    route.fulfill({ json: mockFewMovies }),
  );
  // Minimal valid 1x1 PNG so canvas.drawImage() succeeds in getBase64FromImg
  const VALID_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=",
    "base64",
  );
  await page.route("/proxy-image*", (route) =>
    route.fulfill({ body: VALID_PNG, contentType: "image/png" }),
  );
  await page.route("/api/extract-colors", (route) =>
    route.fulfill({ json: mockPalette }),
  );
  await page.goto("/");
});

test("page loads with correct title", async ({ page }) => {
  await expect(page).toHaveTitle(/Color Palette/i);
});

test("genre change fetches and shows movie cards", async ({ page }) => {
  await page.selectOption("#genre", "28");
  await expect(page.locator(".movieCard")).toHaveCount(20);
});

test("genre change shows at most 20 cards", async ({ page }) => {
  await page.selectOption("#genre", "28");
  const count = await page.locator(".movieCard").count();
  expect(count).toBeLessThanOrEqual(20);
});

test("switching genres replaces all cards", async ({ page }) => {
  await page.selectOption("#genre", "28");
  await expect(page.locator(".movieCard")).toHaveCount(20);
  await page.selectOption("#genre", "35");
  await expect(page.locator(".movieCard")).toHaveCount(20);
});

test("search returns movie cards", async ({ page }) => {
  await page.fill("#searchInput", "Test");
  await page.click("#searchBtn");
  await expect(page.locator(".movieCard")).toHaveCount(5);
});

test("second search replaces first search results", async ({ page }) => {
  await page.fill("#searchInput", "First");
  await page.click("#searchBtn");
  await expect(page.locator(".movieCard")).toHaveCount(5);

  await page.fill("#searchInput", "Second");
  await page.click("#searchBtn");
  await expect(page.locator(".movieCard")).toHaveCount(5);
});

test("pagination controls show after genre load", async ({ page }) => {
  await page.selectOption("#genre", "28");
  await expect(page.locator("#pageControls")).toBeVisible();
});

test("pagination hidden after search", async ({ page }) => {
  await page.selectOption("#genre", "28");
  await expect(page.locator("#pageControls")).toBeVisible();
  await page.fill("#searchInput", "Test");
  await page.click("#searchBtn");
  await expect(page.locator("#pageControls")).toBeHidden();
});

test("next and prev buttons are no-ops in search mode", async ({ page }) => {
  await page.fill("#searchInput", "Test");
  await page.click("#searchBtn");
  await expect(page.locator(".movieCard")).toHaveCount(5);

  // Force show page controls to try clicking next
  await page.evaluate(() => {
    document.getElementById("pageControls").style.display = "flex";
  });
  await page.click("#nextPage");
  // Should still show same 5 cards (search mode, no new fetch)
  await expect(page.locator(".movieCard")).toHaveCount(5);
});

test("movie card click updates poster src", async ({ page }) => {
  await page.selectOption("#genre", "28");
  await page.locator(".movieCard").first().click();
  const src = await page.locator("#moviePoster").getAttribute("src");
  expect(src).toContain("/proxy-image");
});

test("extract dark button is visible", async ({ page }) => {
  await expect(page.locator("#extractDarkColor")).toBeVisible();
});

test("extract buttons are disabled while loading", async ({ page }) => {
  await page.route("/api/extract-colors", async (route) => {
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({ json: mockPalette });
  });
  await page.selectOption("#genre", "28");
  await page.locator(".movieCard").first().click();

  const clickPromise = page.locator("#extractDarkColor").click();
  await expect(page.locator("#extractDarkColor")).toBeDisabled();
  await clickPromise;
});

test("shows error message when extraction fails", async ({ page }) => {
  await page.route("/api/extract-colors", (route) =>
    route.fulfill({ status: 500, json: { error: "fail" } }),
  );
  await page.selectOption("#genre", "28");
  await page.locator(".movieCard").first().click();
  await page.locator("#extractDarkColor").click();
  await expect(page.locator("#colorValues")).toContainText("Failed to extract");
});

test("successful palette extraction applies CSS vars", async ({ page }) => {
  await page.selectOption("#genre", "28");
  await page.locator(".movieCard").first().click();
  await Promise.all([
    page.waitForResponse("/api/extract-colors"),
    page.locator("#extractDarkColor").click(),
  ]);
  const bg = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--background")
      .trim(),
  );
  expect(bg).toBe("#111");
});

test("year error shown when startYear is greater than endYear", async ({
  page,
}) => {
  await page.fill("#startYear", "2024");
  await page.fill("#endYear", "2020");
  await page.dispatchEvent("#startYear", "change");
  await expect(page.locator("#yearError")).toBeVisible();
  await expect(page.locator("#yearError")).toContainText(
    "Start year must not be greater than end year",
  );
});

test("next page does not advance currentPage on failed fetch", async ({
  page,
}) => {
  await page.selectOption("#genre", "28");
  await expect(page.locator(".movieCard")).toHaveCount(20);

  // Make next fetch fail
  await page.route("/api/movies*", (route) =>
    route.fulfill({ status: 500, json: { error: "fail" } }),
  );
  await page.locator("#nextPage").click();

  // Re-route to succeed and click next again — should still request page 2, not 3
  let requestedPage;
  await page.route("/api/movies*", (route) => {
    requestedPage = new URL(route.request().url()).searchParams.get("page");
    route.fulfill({ json: { results: mockMovies, totalPages: 3 } });
  });
  await page.locator("#nextPage").click();
  expect(requestedPage).toBe("2");
});

test("extract shows message when no poster selected", async ({ page }) => {
  await page.locator("#extractDarkColor").click();
  await expect(page.locator("#colorValues")).toContainText(
    "Please select a movie poster first.",
  );
});

test("year inputs default to current year", async ({ page }) => {
  const currentYear = new Date().getFullYear().toString();
  const startVal = await page.inputValue("#startYear");
  const endVal = await page.inputValue("#endYear");
  expect(startVal).toBe(currentYear);
  expect(endVal).toBe(currentYear);
});

test("save palette button is hidden by default", async ({ page }) => {
  await expect(page.locator("#savePaletteBtn")).toBeHidden();
});

test("save palette button appears after successful extraction", async ({
  page,
}) => {
  await page.selectOption("#genre", "28");
  await page.locator(".movieCard").first().click();
  await Promise.all([
    page.waitForResponse("/api/extract-colors"),
    page.locator("#extractDarkColor").click(),
  ]);
  await expect(page.locator("#savePaletteBtn")).toBeVisible();
});

test("remove button visible and save button hidden when extract-colors returns cached:true", async ({
  page,
}) => {
  await page.route("/api/extract-colors", (route) =>
    route.fulfill({
      json: {
        cached: true,
        palette: {
          background: "#111",
          surface: "#1a1a1a",
          hover: "#222",
          button: "#333",
          darkOne: "#444",
          darkTwo: "#555",
          lightOne: "#eee",
          lightTwo: "#ddd",
        },
      },
    }),
  );
  await page.selectOption("#genre", "28");
  await page.locator(".movieCard").first().click();
  await Promise.all([
    page.waitForResponse("/api/extract-colors"),
    page.locator("#extractDarkColor").click(),
  ]);
  await expect(page.locator("#removeSavedBtn")).toBeVisible();
  await expect(page.locator("#savePaletteBtn")).toBeHidden();
});

test("sidebar is hidden by default", async ({ page }) => {
  await expect(page.locator("#savedSidebar")).toBeHidden();
});

test("sidebar toggle button shows the sidebar", async ({ page }) => {
  await page.route("/api/palettes*", (route) => route.fulfill({ json: [] }));
  await page.locator("#sidebarToggle").click();
  await expect(page.locator("#savedSidebar")).toBeVisible();
});

test("sidebar toggle button closes the sidebar", async ({ page }) => {
  await page.route("/api/palettes*", (route) => route.fulfill({ json: [] }));
  await page.locator("#sidebarToggle").click();
  await expect(page.locator("#savedSidebar")).toBeVisible();
  await page.locator("#sidebarToggle").click();
  await expect(page.locator("#savedSidebar")).toBeHidden();
});

test("clicking no-poster movie with backdrop proxies backdrop URL", async ({
  page,
}) => {
  await page.route("/api/movies*", (route) =>
    route.fulfill({
      json: { results: mockMoviesWithNullPosters, totalPages: 1 },
    }),
  );
  await page.selectOption("#genre", "28");
  await page.locator(".movieCard", { hasText: "Backdrop Only" }).click();
  const src = await page.locator("#moviePoster").getAttribute("src");
  expect(src).toContain("/proxy-image");
});

test("clicking no-image movie shows no-poster placeholder text", async ({
  page,
}) => {
  await page.route("/api/movies*", (route) =>
    route.fulfill({
      json: { results: mockMoviesWithNullPosters, totalPages: 1 },
    }),
  );
  await page.selectOption("#genre", "28");
  await page.locator(".movieCard", { hasText: "No Image" }).click();
  await expect(page.locator("#posterPlaceholder")).toContainText(
    "Select a different movie",
  );
});

test("extract shows poster-required message when no-image movie selected", async ({
  page,
}) => {
  await page.route("/api/movies*", (route) =>
    route.fulfill({
      json: { results: mockMoviesWithNullPosters, totalPages: 1 },
    }),
  );
  await page.selectOption("#genre", "28");
  await page.locator(".movieCard", { hasText: "No Image" }).click();
  await page.locator("#extractDarkColor").click();
  await expect(page.locator("#colorValues")).toContainText(
    "Please select a movie poster first.",
  );
});

test("clicking no-image movie removes aria-hidden from posterPlaceholder", async ({
  page,
}) => {
  await page.route("/api/movies*", (route) =>
    route.fulfill({
      json: { results: mockMoviesWithNullPosters, totalPages: 1 },
    }),
  );
  await page.selectOption("#genre", "28");
  await page.locator(".movieCard", { hasText: "No Image" }).click();
  const ariaHidden = await page
    .locator("#posterPlaceholder")
    .getAttribute("aria-hidden");
  expect(ariaHidden).toBeNull();
});

test("clicking poster movie sets aria-hidden on posterPlaceholder", async ({
  page,
}) => {
  await page.selectOption("#genre", "28");
  await page.locator(".movieCard").first().click();
  await expect(page.locator("#posterPlaceholder")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
});

test("sidebarToggle aria-expanded updates on open/close", async ({ page }) => {
  await page.route("/api/palettes*", (route) => route.fulfill({ json: [] }));
  await expect(page.locator("#sidebarToggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.locator("#sidebarToggle").click();
  await expect(page.locator("#sidebarToggle")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

test("sidebar close button hides the sidebar", async ({ page }) => {
  await page.route("/api/palettes*", (route) => route.fulfill({ json: [] }));
  await page.locator("#sidebarToggle").click();
  await expect(page.locator("#savedSidebar")).toBeVisible();
  await page.locator("#sidebarClose").click();
  await expect(page.locator("#savedSidebar")).toBeHidden();
});

test("Escape key closes the sidebar", async ({ page }) => {
  await page.route("/api/palettes*", (route) => route.fulfill({ json: [] }));
  await page.locator("#sidebarToggle").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#savedSidebar")).toBeHidden();
});

test("next page button disabled when on last page", async ({ page }) => {
  await page.route("/api/movies*", (route) =>
    route.fulfill({ json: { results: mockMovies, totalPages: 1 } }),
  );
  await page.selectOption("#genre", "28");
  await expect(page.locator("#nextPage")).toBeDisabled();
});

test("next page button disabled after navigating to last page", async ({
  page,
}) => {
  await page.route("/api/movies*", (route) =>
    route.fulfill({ json: { results: mockMovies, totalPages: 2 } }),
  );
  await page.selectOption("#genre", "28");
  await expect(page.locator("#nextPage")).not.toBeDisabled();
  await page.locator("#nextPage").click();
  await expect(page.locator("#nextPage")).toBeDisabled();
});

test("prev page button disabled on page 1", async ({ page }) => {
  await page.selectOption("#genre", "28");
  await expect(page.locator("#prevPage")).toBeDisabled();
});

test("palette extraction renders color swatches", async ({ page }) => {
  await page.selectOption("#genre", "28");
  await page.locator(".movieCard").first().click();
  await Promise.all([
    page.waitForResponse("/api/extract-colors"),
    page.locator("#extractDarkColor").click(),
  ]);
  const count = await page.locator(".palette-swatch").count();
  expect(count).toBe(8);
});

test("broken thumbnail image falls back to SVG placeholder", async ({
  page,
}) => {
  await page.selectOption("#genre", "28");
  const firstImg = page.locator(".movieCard").first().locator("img");
  await firstImg.evaluate((img) => img.dispatchEvent(new Event("error")));
  const src = await firstImg.getAttribute("src");
  expect(src).toContain("data:image/svg+xml");
});

test("removing active palette from sidebar hides remove-btn and shows save-btn", async ({
  page,
}) => {
  const paletteId = "000000000000000000000001";
  const cachedPalette = {
    cached: true,
    palette: {
      background: "#111",
      surface: "#1a1a1a",
      hover: "#222",
      button: "#333",
      darkOne: "#444",
      darkTwo: "#555",
      lightOne: "#eee",
      lightTwo: "#ddd",
    },
    id: paletteId,
  };
  await page.route("/api/extract-colors", (route) =>
    route.fulfill({ json: cachedPalette }),
  );
  await page.route("/api/palettes", (route) =>
    route.fulfill({
      json: [
        {
          _id: paletteId,
          movieTitle: "Test Movie 1",
          theme: "dark",
          palette: cachedPalette.palette,
          savedAt: new Date().toISOString(),
        },
      ],
    }),
  );
  await page.route(`/api/palettes/${paletteId}`, (route) =>
    route.fulfill({ status: 204, body: "" }),
  );

  // Extract cached palette so remove button is visible
  await page.selectOption("#genre", "28");
  await page.locator(".movieCard").first().click();
  await Promise.all([
    page.waitForResponse("/api/extract-colors"),
    page.locator("#extractDarkColor").click(),
  ]);
  await expect(page.locator("#removeSavedBtn")).toBeVisible();

  // Open sidebar and delete the active palette
  await page.locator("#sidebarToggle").click();
  await expect(page.locator("#savedSidebar")).toBeVisible();
  await page.locator(".sidebar-delete-btn").first().click();

  // Save button should reappear, remove button should hide
  await expect(page.locator("#savePaletteBtn")).toBeVisible();
  await expect(page.locator("#removeSavedBtn")).toBeHidden();
});
