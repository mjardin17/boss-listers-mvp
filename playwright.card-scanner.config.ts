import path from 'node:path';
import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./e2e',testMatch:'card-scanner.spec.ts',fullyParallel:false,workers:1,retries:0,timeout:60000,
 outputDir:'data/card-scanner-validation/browser-results',reporter:[['list'],['json',{outputFile:'data/card-scanner-validation/browser-results.json'}]],
 use:{baseURL:'http://127.0.0.1:3001',serviceWorkers:'block',screenshot:'only-on-failure',trace:'off'},
 webServer:[
  {command:'node tests/fixtures/card-auth-server.cjs',url:'http://127.0.0.1:3112/health',reuseExistingServer:false,
   env:{BOSS_SCANNER_TEST_FIXTURE:'1'}},
  {command:'npm run dev -- --hostname 0.0.0.0',url:'http://127.0.0.1:3001/login',reuseExistingServer:false,timeout:120000,
   env:{SUPABASE_URL:'http://127.0.0.1:3112',SUPABASE_ANON_KEY:'local-test-fixture',SUPABASE_SERVICE_ROLE_KEY:'',
    CARD_FACTORY_LOCAL_ENABLED:'1',BOSS_CARD_FACTORY_ROOT:path.join(process.cwd(),'data/card-scanner-e2e'),
    CARD_FACTORY_ALLOW_PAID_AI:'',CARD_FACTORY_ALLOW_EBAY:'',GEMINI_API_KEY:'',EBAY_APP_TOKEN:'',NEXT_TELEMETRY_DISABLED:'1'}},
 ],
 projects:[
  {name:'chromium-mobile',use:{...devices['iPhone 13'],browserName:'chromium'}},
  {name:'webkit-iphone13-emulation',use:{...devices['iPhone 13'],browserName:'webkit'}},
 ],
});
