import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests', testMatch:'student-erp.spec.ts', fullyParallel:true,
  use:{baseURL:'http://127.0.0.1:5187',trace:'retain-on-failure'},
  webServer:{command:'npm run dev -- --host 127.0.0.1 --port 5187 --strictPort',url:'http://127.0.0.1:5187',reuseExistingServer:false},
});
