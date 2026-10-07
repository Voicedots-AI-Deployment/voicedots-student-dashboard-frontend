import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: { baseURL: "http://127.0.0.1:5175", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5175",
    reuseExistingServer: !process.env.CI,
  },
});
