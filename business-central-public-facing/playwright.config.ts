import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:3211",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3211",
      url: "http://127.0.0.1:3211",
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        "npm --prefix ../business-central-admin run start -- --hostname 127.0.0.1 --port 3212",
      url: "http://127.0.0.1:3212/receptionist",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
