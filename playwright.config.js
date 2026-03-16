import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 15_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:8000" },
  webServer: {
    command: "npm start",
    url: "http://localhost:8000",
    reuseExistingServer: true,
  },
});
