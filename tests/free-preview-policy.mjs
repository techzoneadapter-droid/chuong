import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../lib/freeChapterPreview.ts', import.meta.url), 'utf8');
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports});
const browser={};
vm.runInNewContext(readFileSync(new URL('../admin-web/free-preview.js',import.meta.url),'utf8'),browser);
test('mobile and admin validators agree, reject invalid values and preserve exact N boundary',()=>{
  for(const value of [0,5,10,50,7,100000,'005',' 10 '])assert.equal(module.exports.validateFreePreviewCount(value),browser.chuongFreePreview.validate(value));
  for(const value of [-1,1.5,100001,'','1e2','NaN',null]){
    assert.throws(()=>module.exports.validateFreePreviewCount(value));assert.throws(()=>browser.chuongFreePreview.validate(value));
  }
  for(const n of [0,5,10,50,7]){
    assert.equal(module.exports.isFreePreviewChapter(n+1,n),false);
    assert.equal(module.exports.isFreePreviewChapter(0,n),false);
    if(n)assert.equal(module.exports.isFreePreviewChapter(n,n),true);
  }
});
test('free preview helper has safe presets and nonnegative index guard', () => {
  assert.match(source, /\[0, 5, 10, 50\]/);
  assert.match(source, /chapterNumber >= 1/);
  assert.match(source, /Number\.isInteger\(chapterNumber\)/);
});
