import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests', testMatch:'student-erp-ui.spec.ts', workers:1,
  use:{baseURL:'http://127.0.0.1:5189',trace:'retain-on-failure'},
  reporter:[['list'],['junit',{outputFile:'test-results/student-erp-ui.xml'}]],
  webServer:{command:'npm run dev -- --host 127.0.0.1 --port 5189',url:'http://127.0.0.1:5189',reuseExistingServer:false},
});
