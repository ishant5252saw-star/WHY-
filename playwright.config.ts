import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
  screenshot: "only-on-failure",
  trace: "on-first-retry",
  viewport: { width: 1280, height: 720 },
  actionTimeout: 10000,
  navigationTimeout: 15000,
  extraHTTPHeaders: {
      "x-test-mode": "true",
    },
  // Ignore self-signed cert errors
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 30000,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
