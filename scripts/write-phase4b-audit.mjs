import { readFileSync, writeFileSync } from 'node:fs';
const raw=JSON.parse(readFileSync('.cache/npm-audit-phase4b-final.json','utf8').replace(/^\uFEFF/,''));
if (!raw.metadata?.vulnerabilities || raw.error) throw new Error('Online audit unavailable');
const old=JSON.parse(readFileSync('docs/DEPENDENCY_SECURITY_AUDIT.json','utf8'));
const findings=Object.values(raw.vulnerabilities).map(f=>({name:f.name,severity:f.severity,direct:f.isDirect,range:f.range,
  via:f.via.map(v=>typeof v==='string'?v:{name:v.name,title:v.title,url:v.url,range:v.range}),fixAvailable:f.fixAvailable}));
const closed=old.findings.filter(f=>!raw.vulnerabilities[f.name]).map(f=>f.name);
writeFileSync('docs/DEPENDENCY_SECURITY_PHASE4B.json',JSON.stringify({date:'2026-10-12',source:'npm audit --json online, final locked graph',
  before:old.counts,counts:raw.metadata.vulnerabilities,
  fixes:[{dependency:'postcss',version:'8.5.29',scope:'same-major JS CSS build tooling override'},
    {dependency:'uuid',version:'11.1.1',scope:'xcode only; CommonJS v4 retained, no native upgrade'}],
  resolvedFindingNames:closed,
  triage:old.findings.map(f=>({name:f.name,severity:f.severity,status:closed.includes(f.name)?'RESOLVED in online graph':'OPEN',
    assessment:closed.includes(f.name)?'Resolved via safe tooling override; validated by exports/Expo checks.':
      ['decode-uri-component','query-string','expo-linking','expo-router'].includes(f.name)?'Runtime/linking input parsing; replacement decoder is ESM and cannot be forced into pinned CommonJS query-string. Remains release review blocker.':
      'Primarily transitive build/config tooling; keep untrusted imported files away from CLI, Metro and signing tools. Native/SDK/toolchain replacement not authorized; reachability is not legal/security acceptance.'})),
  findings,note:'Native Expo54/RN0.81.5/IAP5.8.2/Ads16.3.4 pins unchanged. OPEN entries are not accepted or waived; no npm audit fix --force.'},null,2)+'\n');
console.log(JSON.stringify({counts:raw.metadata.vulnerabilities,resolved:closed}));
