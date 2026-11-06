import { defineConfig } from "@playwright/test";

// End-to-end checks against a production build. The mock data is shared
// in memory, so tests run one at a time and pick their own documents.
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 60_000,
  use: { baseURL: "http://localhost:3400", trace: "off", viewport: { width: 1280, height: 900 } },
  webServer: {
    command: "npm run build && npx next start -p 3400",
    url: "http://localhost:3400/api/users",
    timeout: 240_000,
    reuseExistingServer: false,
  },
});
