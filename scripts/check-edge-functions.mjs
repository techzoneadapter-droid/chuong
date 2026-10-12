import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const cache=fileURLToPath(new URL('../.cache/',import.meta.url));
mkdirSync(cache,{recursive:true});
const version=JSON.parse(readFileSync(new URL('../node_modules/@supabase/supabase-js/package.json',import.meta.url),'utf8')).version;
const map=fileURLToPath(new URL('../.cache/edge-import-map.json',import.meta.url));
writeFileSync(map,JSON.stringify({imports:{
  'jsr:@supabase/functions-js/edge-runtime.d.ts':pathToFileURL(fileURLToPath(new URL('../node_modules/@supabase/functions-js/src/edge-runtime.d.ts',import.meta.url))).href,
  'npm:@supabase/supabase-js@2':'npm:@supabase/supabase-js@'+version,
}},null,2));
// Uses official installed declarations instead of downloading JSR at check time.
// Only checks types; this never runs handlers, accesses secrets, or deploys.
execFileSync(process.env.DENO_BINARY || 'deno',['check','--no-lock','--node-modules-dir=manual','--import-map='+map,
  'supabase/functions/admob-ssv/index.ts','supabase/functions/iap-events/index.ts',
  'supabase/functions/iap-verify/index.ts','supabase/functions/subscription-verify/index.ts'],
  {cwd:root,stdio:'inherit',env:{...process.env,DENO_DIR:cache+'deno'}});
