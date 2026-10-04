import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = new URL('../', import.meta.url);
const roots = ['app', 'components', 'constants', 'data', 'hooks', 'services'];
const allowedExt = new Set(['.ts', '.tsx', '.js', '.jsx', '.json']);
const han = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u;
const findings = [];

function walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path);
      continue;
    }
    if (!allowedExt.has(extname(path))) continue;
    const source = readFileSync(path, 'utf8');
    source.split('\n').forEach((line, index) => {
      if (!han.test(line)) return;
      const chars = [...new Set([...line].filter((char) => han.test(char)))].join('');
      findings.push({
        file: relative(new URL('../', import.meta.url).pathname, path).replaceAll('\\', '/'),
        line: index + 1,
        chars,
        text: line.trim().slice(0, 220),
      });
    });
  }
}

for (const name of roots) walk(new URL(\`../\${name}\`, import.meta.url).pathname);

if (findings.length) {
  console.error('UI COPY AUDIT FAILED: found Han/CJK characters in runtime source.');
  for (const finding of findings) {
    console.error(\`- \${finding.file}:\${finding.line} [\${finding.chars}] \${finding.text}\`);
  }
  process.exit(1);
}

console.log('UI COPY AUDIT PASS: no Han/CJK characters in runtime source.');
