const SUPABASE_URL = 'https://lwchpifeahyuoajeidsa.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dItrQ5tEdt3J-peHAqauzQ_VPnRVu0l';

const state = {
  token: sessionStorage.getItem('chuong_admin_token') || '',
  userId: sessionStorage.getItem('chuong_admin_user') || '',
  ownerAuthorId: '',
  chapters: [],
  sourceName: '',
  coverBlob: null,
  coverMime: '',
  aiReady: false,
  aiProvider: '',
  ocrLang: '',
};

const $ = (id) => document.getElementById(id);
const loginView = $('loginView');
const studioView = $('studioView');
const loginMessage = $('loginMessage');
const uploadMessage = $('uploadMessage');

function showMessage(el, text, type='error') {
  el.textContent = text;
  el.className = 'message ' + type;
}
function hideMessage(el) { el.className = 'message hidden'; el.textContent = ''; }
function authHeaders(extra={}) {
  return { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + state.token, ...extra };
}
async function jsonFetch(url, options={}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const code = data?.code || data?.error_code || '';
    let message = data?.message || data?.msg || data?.error_description || data?.error || ('HTTP ' + res.status);
    if (code === 'invalid_credentials' || /invalid login credentials/i.test(String(message))) {
      message = 'Email hoặc mật khẩu không đúng. Hãy kiểm tra lại mật khẩu của tài khoản Admin.';
    }
    throw new Error(message);
  }
  return data;
}
async function rest(path, { method='GET', body, prefer }={}) {
  const headers = authHeaders({ 'Content-Type': 'application/json' });
  if (prefer) headers.Prefer = prefer;
  return jsonFetch(SUPABASE_URL + '/rest/v1/' + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function slugify(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
function cleanTitle(value) {
  return value.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim() || 'Truyện chưa đặt tên';
}
function normalizeText(text) {
  return String(text || '').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/[ \t]+\n/g,'\n').replace(/\n{4,}/g,'\n\n\n').trim();
}
function romanToNumber(value) {
  const map={I:1,V:5,X:10,L:50,C:100,D:500,M:1000};
  let total=0,prev=0;
  for(const ch of String(value).toUpperCase().split('').reverse()){const n=map[ch]||0;total+=n<prev?-n:n;prev=Math.max(prev,n);}
  return total||0;
}
function chineseToNumber(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const digit={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
  const unit={十:10,百:100,千:1000,万:10000};
  let total=0,section=0,num=0;
  for(const ch of String(value)){if(ch in digit){num=digit[ch];continue;}const u=unit[ch];if(!u)continue;if(u===10000){section=(section+(num||0))*u;total+=section;section=0;num=0;}else{section+=(num||1)*u;num=0;}}
  return total+section+num;
}
function parseChapterNumber(token) {
  const raw=String(token||'').trim();
  if(/^\d+$/.test(raw)) return Number(raw);
  if(/^[ivxlcdm]+$/i.test(raw)) return romanToNumber(raw);
  return chineseToNumber(raw);
}
function splitChapters(raw) {
  const text=normalizeText(raw);
  if(!text)return[];
  const re=/^(?:(?:chương|chuong|chapter|chap|hồi|hoi|phần|phan|part|tiết|tiet)\s*([0-9]{1,6}|[ivxlcdm]{1,12})|第\s*([0-9零〇一二两三四五六七八九十百千万]{1,16})\s*[章节回卷部篇])(?:\s*[:.\-–—]\s*|\s+)?([^\n]*)$/gim;
  const matches=[...text.matchAll(re)];
  if(!matches.length)return[{chapterNumber:1,title:'Chương 1',content:text}];
  const out=[];
  for(let i=0;i<matches.length;i++){
    const m=matches[i],next=matches[i+1];
    const number=parseChapterNumber(m[1]||m[2]);
    if(!number)continue;
    const tail=(m[3]||'').trim();
    const start=(m.index||0)+m[0].length,end=next?.index??text.length;
    const content=normalizeText(text.slice(start,end));
    if(content)out.push({chapterNumber:number,title:tail||('Chương '+number),content});
  }
  return out.sort((a,b)=>a.chapterNumber-b.chapterNumber);
}
function auditChapters(chapters) {
  const nums = chapters.map(x=>x.chapterNumber);
  const seen = new Set(), dup = [];
  for (const n of nums) { if (seen.has(n)) dup.push(n); seen.add(n); }
  const missing = [];
  if (nums.length) for (let n=Math.min(...nums); n<=Math.max(...nums); n++) if (!seen.has(n)) missing.push(n);
  return { duplicates:[...new Set(dup)], missing, first:nums.length?Math.min(...nums):0, last:nums.length?Math.max(...nums):0 };
}
function renderPreview() {
  const chapters=state.chapters, audit=auditChapters(chapters);
  $('emptyPreview').classList.toggle('hidden', chapters.length>0);
  $('chapterPreview').classList.toggle('hidden', !chapters.length);
  $('uploadBtn').disabled = !chapters.length || audit.duplicates.length>0;
  if (!chapters.length) return;
  $('chapterCount').textContent=chapters.length.toLocaleString('vi-VN');
  $('chapterRange').textContent=audit.first===audit.last ? String(audit.first) : audit.first + ' → ' + audit.last;
  const box=$('auditBox');
  if (audit.duplicates.length) {
    box.className='audit bad';
    box.textContent='Có số chương bị trùng: ' + audit.duplicates.slice(0,30).join(', ') + '. Cần sửa trước khi đẩy.';
  } else if (audit.missing.length) {
    box.className='audit warn';
    box.textContent='Tách được ' + chapters.length + ' chương nhưng thiếu số: ' + audit.missing.slice(0,30).join(', ') + (audit.missing.length>30?'…':'') + '. Bạn vẫn có thể đẩy nếu truyện cố ý bỏ số.';
  } else {
    box.className='audit';
    box.textContent='✓ Số chương liên tục và không trùng. Sau khi tải, hệ thống sẽ đọc ngược database để xác minh lại đủ ' + chapters.length + '/' + chapters.length + ' chương.';
  }
  $('chapterList').innerHTML=chapters.slice(0,250).map(ch=>'<div class="chapter-row"><strong>Ch. '+ch.chapterNumber+'</strong><span>'+escapeHtml(ch.title)+'</span></div>').join('') + (chapters.length>250?'<div class="chapter-row"><strong>…</strong><span>Còn '+(chapters.length-250)+' chương</span></div>':'');
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[ch]));
}
function setCover(blob, mime) {
  state.coverBlob=blob; state.coverMime=mime || blob?.type || 'image/jpeg';
  const preview=$('coverPreview');
  if (!blob) { preview.innerHTML='<span>Chưa có bìa</span>'; return; }
  const url=URL.createObjectURL(blob);
  preview.innerHTML='<img alt="Ảnh bìa" src="'+url+'" />';
}
function extOf(name){ const m=String(name).toLowerCase().match(/\.([a-z0-9]+)$/); return m?m[1]:''; }
function baseName(path){ const name=String(path).replace(/\\/g,'/').split('/').filter(Boolean).pop()||path; return name.replace(/\.[^.]+$/,''); }
function naturalNumber(name){ const m=String(name).match(/(?:chuong|chương|chapter|chap)?[^0-9]*(\d{1,6})/i); return m?Number(m[1]):Number.MAX_SAFE_INTEGER; }
function chapterTitleFromFilename(name, number){
  const stem=baseName(name).replace(/^(?:chuong|chương|chapter|chap)[\s._-]*\d+[\s._:-]*/i,'').replace(/^\d+[\s._:-]*/,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
  return stem || ('Chương '+number);
}
function findEocd(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(let pos=bytes.length-22;pos>=Math.max(0,bytes.length-65557);pos--) if(view.getUint32(pos,true)===0x06054b50)return pos;
  return -1;
}
function readZipEntries(buffer){
  const bytes=new Uint8Array(buffer),view=new DataView(buffer),eocd=findEocd(bytes);
  if(eocd<0)throw new Error('ZIP không hợp lệ.');
  const total=view.getUint16(eocd+10,true),centralOffset=view.getUint32(eocd+16,true),decoder=new TextDecoder('utf-8');
  const entries=[];let pos=centralOffset;
  for(let i=0;i<total;i++){
    if(view.getUint32(pos,true)!==0x02014b50)throw new Error('ZIP bị hỏng.');
    const flags=view.getUint16(pos+8,true),method=view.getUint16(pos+10,true),compressedSize=view.getUint32(pos+20,true),uncompressedSize=view.getUint32(pos+24,true),nameLength=view.getUint16(pos+28,true),extraLength=view.getUint16(pos+30,true),commentLength=view.getUint16(pos+32,true),localOffset=view.getUint32(pos+42,true),name=decoder.decode(bytes.slice(pos+46,pos+46+nameLength));
    if(!name.endsWith('/'))entries.push({name,flags,method,compressedSize,uncompressedSize,localOffset});
    pos+=46+nameLength+extraLength+commentLength;
  }
  return entries;
}
async function inflateRaw(data){
  if(!globalThis.DecompressionStream)throw new Error('Trình duyệt chưa hỗ trợ giải nén ZIP. Hãy dùng Chrome/Edge mới.');
  const stream=new Blob([data.slice().buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function extractZipEntry(buffer,entry){
  const view=new DataView(buffer),bytes=new Uint8Array(buffer),offset=entry.localOffset;
  if(entry.flags&1)throw new Error('ZIP có mật khẩu nên không thể đọc.');
  if(view.getUint32(offset,true)!==0x04034b50)throw new Error('Không đọc được '+entry.name);
  const nameLength=view.getUint16(offset+26,true),extraLength=view.getUint16(offset+28,true),start=offset+30+nameLength+extraLength,compressed=bytes.slice(start,start+entry.compressedSize);
  if(entry.method===0)return compressed;
  if(entry.method===8)return inflateRaw(compressed);
  throw new Error('Kiểu nén ZIP chưa hỗ trợ.');
}
function decodeXmlEntities(value){return value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'");}
async function docxText(buffer){
  const entries=readZipEntries(buffer),doc=entries.find(e=>e.name==='word/document.xml');
  if(!doc)throw new Error('DOCX không hợp lệ.');
  const xml=new TextDecoder('utf-8').decode(await extractZipEntry(buffer,doc));
  return normalizeText(decodeXmlEntities(xml.replace(/<w:tab\b[^>]*\/>/g,'\t').replace(/<w:br\b[^>]*\/>/g,'\n').replace(/<\/w:p>/g,'\n').replace(/<\/w:tr>/g,'\n').replace(/<[^>]+>/g,'')));
}
async function parseTextBytes(name,bytes){
  const ext=extOf(name);
  if(ext==='txt')return normalizeText(new TextDecoder('utf-8').decode(bytes));
  if(ext==='docx')return docxText(bytes.slice().buffer);
  throw new Error('Không hỗ trợ .'+ext);
}
function showParse(text,type='info'){const el=$('parseMessage');if(!el)return;showMessage(el,text,type);}
function hideParse(){const el=$('parseMessage');if(el)hideMessage(el);}
function htmlToText(html){
  const prepared=String(html||'')
    .replace(/<br\s*\/?\s*>/gi,'\n')
    .replace(/<\/(?:p|div|h[1-6]|li|tr|section|article)>/gi,'\n')
    .replace(/<(?:p|div|h[1-6]|li|tr|section|article)\b[^>]*>/gi,'\n');
  const doc=new DOMParser().parseFromString(prepared,'text/html');
  return normalizeText(doc.body?.textContent||doc.documentElement?.textContent||'');
}
function htmlTitle(html){
  const doc=new DOMParser().parseFromString(String(html||''),'text/html');
  return normalizeText(doc.querySelector('h1,h2,title')?.textContent||'').split('\n')[0]||'';
}
function rtfToText(rtf){
  let text=String(rtf||'')
    .replace(/\\par[d]?\b/gi,'\n')
    .replace(/\\line\b/gi,'\n')
    .replace(/\\tab\b/gi,'\t')
    .replace(/\\u(-?\d+)\??/g,(_,n)=>String.fromCodePoint((Number(n)+65536)%65536))
    .replace(/\\'([0-9a-f]{2})/gi,(_,h)=>String.fromCharCode(parseInt(h,16)))
    .replace(/\\[a-z]+-?\d* ?/gi,'')
    .replace(/[{}]/g,'');
  return normalizeText(text);
}
function xmlToText(xml){
  return normalizeText(decodeXmlEntities(String(xml||'')
    .replace(/<text:(?:line-break|tab)[^>]*\/>/gi,'\n')
    .replace(/<\/(?:text:p|text:h|p|section|title)>/gi,'\n')
    .replace(/<[^>]+>/g,'')));
}
function normalizeZipPath(path){
  const parts=[];
  for(const part of String(path||'').replace(/\\/g,'/').split('/')){
    if(!part||part==='.')continue;
    if(part==='..')parts.pop(); else parts.push(part);
  }
  return parts.join('/');
}
function resolveZipPath(baseFile,href){
  const base=String(baseFile||'').replace(/\\/g,'/').split('/');base.pop();
  return normalizeZipPath([...base,String(href||'')].join('/'));
}
async function odtText(buffer){
  const entries=readZipEntries(buffer),content=entries.find(e=>e.name==='content.xml');
  if(!content)throw new Error('ODT không có content.xml.');
  return xmlToText(new TextDecoder('utf-8').decode(await extractZipEntry(buffer,content)));
}
async function epubBook(buffer,sourceName){
  const entries=readZipEntries(buffer);
  const byName=new Map(entries.map(e=>[normalizeZipPath(e.name),e]));
  const container=byName.get('META-INF/container.xml');
  let opfPath='';
  if(container){
    const xml=new TextDecoder('utf-8').decode(await extractZipEntry(buffer,container));
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    opfPath=doc.querySelector('rootfile')?.getAttribute('full-path')||'';
  }
  if(!opfPath){
    opfPath=[...byName.keys()].find(n=>n.toLowerCase().endsWith('.opf'))||'';
  }
  if(!opfPath)throw new Error('EPUB không tìm thấy package OPF.');
  const opfEntry=byName.get(normalizeZipPath(opfPath));
  if(!opfEntry)throw new Error('EPUB không đọc được package OPF.');
  const opfXml=new TextDecoder('utf-8').decode(await extractZipEntry(buffer,opfEntry));
  const opf=new DOMParser().parseFromString(opfXml,'application/xml');
  const firstNs=(tag)=>opf.getElementsByTagNameNS('*',tag)?.[0]?.textContent?.trim()||'';
  const title=firstNs('title')||cleanTitle(baseName(sourceName));
  const author=firstNs('creator')||'';
  const manifest=new Map();
  for(const item of [...opf.getElementsByTagNameNS('*','item')]){
    const id=item.getAttribute('id')||'',href=item.getAttribute('href')||'',media=item.getAttribute('media-type')||'',props=item.getAttribute('properties')||'';
    if(id&&href)manifest.set(id,{path:resolveZipPath(opfPath,decodeURIComponent(href)),media,props});
  }
  const spineIds=[...opf.getElementsByTagNameNS('*','itemref')].map(x=>x.getAttribute('idref')||'').filter(Boolean);
  let ordered=spineIds.map(id=>manifest.get(id)).filter(Boolean).filter(x=>/html|xhtml/i.test(x.media)&&!/nav/i.test(x.props));
  if(!ordered.length)ordered=[...manifest.values()].filter(x=>/html|xhtml/i.test(x.media)&&!/nav/i.test(x.props));
  const chapters=[];let fallback=1;
  for(let i=0;i<ordered.length;i++){
    const item=ordered[i],entry=byName.get(normalizeZipPath(item.path));if(!entry)continue;
    const html=new TextDecoder('utf-8').decode(await extractZipEntry(buffer,entry));
    const text=htmlToText(html);if(text.length<20)continue;
    const embedded=splitChapters(text);
    const startsWithHeading=/^(?:chương|chuong|chapter|chap|hồi|hoi|phần|phan|part|tiết|tiet)\s*(?:\d+|[ivxlcdm]+)|^第\s*[0-9零〇一二两三四五六七八九十百千万]+\s*[章节回卷部篇]/i.test(text);
    if(embedded.length>1||startsWithHeading){
      chapters.push(...embedded);fallback=Math.max(fallback,...embedded.map(x=>x.chapterNumber))+1;
    }else{
      chapters.push({chapterNumber:fallback,title:htmlTitle(html)||('Chương '+fallback),content:text});fallback++;
    }
  }
  if(!chapters.length)throw new Error('EPUB không tách được nội dung đọc.');
  const coverMeta=[...opf.getElementsByTagNameNS('*','meta')].find(x=>(x.getAttribute('name')||'').toLowerCase()==='cover');
  const coverId=coverMeta?.getAttribute('content')||'';
  let coverItem=coverId?manifest.get(coverId):null;
  if(!coverItem)coverItem=[...manifest.values()].find(x=>/cover-image/i.test(x.props)||/^image\//i.test(x.media)&&/cover|bia|bìa/i.test(x.path));
  let coverBlob=null,coverMime='';
  if(coverItem){
    const ce=byName.get(normalizeZipPath(coverItem.path));
    if(ce){const bytes=await extractZipEntry(buffer,ce);coverMime=coverItem.media||imageMime(coverItem.path);coverBlob=new Blob([bytes],{type:coverMime});}
  }
  return {title,author,chapters:chapters.sort((a,b)=>a.chapterNumber-b.chapterNumber),coverBlob,coverMime};
}
async function ocrRecognize(source,label){
  if(!globalThis.Tesseract)throw new Error('Bộ OCR chưa tải được. Hãy kiểm tra mạng rồi tải file lại.');
  const candidates=state.ocrLang?[state.ocrLang]:['vie+eng+chi_sim','vie+eng','eng'];
  let lastError=null;
  for(const lang of candidates){
    try{
      const result=await globalThis.Tesseract.recognize(source,lang,{logger:m=>{if(m?.status==='recognizing text'&&typeof m.progress==='number')showParse(label+' · OCR '+Math.round(m.progress*100)+'%','info');}});
      state.ocrLang=lang;
      return normalizeText(result?.data?.text||'');
    }catch(err){lastError=err;}
  }
  throw lastError||new Error('OCR thất bại.');
}
async function pdfText(buffer,label){
  const pdfjs=globalThis.pdfjsLib;
  if(!pdfjs)throw new Error('Bộ đọc PDF chưa tải được. Hãy kiểm tra mạng rồi tải lại.');
  pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf=await pdfjs.getDocument({data:new Uint8Array(buffer)}).promise;
  const pages=[];
  for(let n=1;n<=pdf.numPages;n++){
    showParse('Đang đọc PDF trang '+n+'/'+pdf.numPages+'…','info');
    const page=await pdf.getPage(n);
    const tc=await page.getTextContent();
    let text=normalizeText((tc.items||[]).map(x=>(x.str||'')+(x.hasEOL?'\n':' ')).join(''));
    if(text.replace(/\s/g,'').length<80){
      const viewport=page.getViewport({scale:1.65}),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      await page.render({canvasContext:ctx,viewport}).promise;
      text=await ocrRecognize(canvas,'PDF trang '+n+'/'+pdf.numPages);
    }
    if(text)pages.push(text);
  }
  const all=normalizeText(pages.join('\n\n'));
  if(!all)throw new Error('PDF không nhận diện được chữ.');
  return all;
}
async function parseBytesToText(name,bytes){
  const ext=extOf(name);
  if(ext==='txt'||ext==='md')return normalizeText(new TextDecoder('utf-8').decode(bytes));
  if(ext==='html'||ext==='htm')return htmlToText(new TextDecoder('utf-8').decode(bytes));
  if(ext==='rtf')return rtfToText(new TextDecoder('utf-8').decode(bytes));
  if(ext==='fb2')return xmlToText(new TextDecoder('utf-8').decode(bytes));
  if(ext==='docx')return docxText(bytes.slice().buffer);
  if(ext==='odt')return odtText(bytes.slice().buffer);
  if(ext==='pdf')return pdfText(bytes.slice().buffer,name);
  throw new Error('Không hỗ trợ .'+ext);
}
async function parseZipStory(buffer,fileName){
  const entries=readZipEntries(buffer);
  const contentExts=new Set(['txt','md','html','htm','rtf','fb2','docx','odt','pdf']);
  const docs=entries.filter(e=>contentExts.has(extOf(e.name))).sort((a,b)=>naturalNumber(a.name)-naturalNumber(b.name)||a.name.localeCompare(b.name,'vi'));
  const images=entries.filter(e=>['jpg','jpeg','png','webp'].includes(extOf(e.name)));
  let chapters=[],title=cleanTitle(baseName(fileName)),coverBlob=null,coverMime='';
  if(docs.length){
    const top=docs[0].name.replace(/\\/g,'/').split('/').filter(Boolean);if(top.length>1)title=cleanTitle(top[0]);
    let fallback=1;
    for(const entry of docs){
      showParse('Đang đọc '+entry.name+'…','info');
      const bytes=await extractZipEntry(buffer,entry),text=await parseBytesToText(entry.name,bytes),embedded=splitChapters(text),num=naturalNumber(entry.name);
      if(embedded.length>1){chapters.push(...embedded);fallback=Math.max(fallback,...embedded.map(x=>x.chapterNumber))+1;}
      else{const n=Number.isFinite(num)&&num!==Number.MAX_SAFE_INTEGER?num:fallback++;chapters.push({chapterNumber:n,title:chapterTitleFromFilename(entry.name,n),content:embedded[0]?.content||text});}
    }
    const cover=images.find(e=>/(?:^|[\/_-])(cover|bia|bìa)(?:[._-]|$)/i.test(e.name))||images[0];
    if(cover){const bytes=await extractZipEntry(buffer,cover);coverMime=imageMime(cover.name);coverBlob=new Blob([bytes],{type:coverMime});}
  }else if(images.length){
    const sorted=images.sort((a,b)=>naturalNumber(a.name)-naturalNumber(b.name)||a.name.localeCompare(b.name,'vi'));
    const pageTexts=[];
    for(let i=0;i<sorted.length;i++){const bytes=await extractZipEntry(buffer,sorted[i]);pageTexts.push(await ocrRecognize(new Blob([bytes],{type:imageMime(sorted[i].name)}),'Ảnh '+(i+1)+'/'+sorted.length));}
    chapters=splitChapters(pageTexts.join('\n\n'));
  }else throw new Error('ZIP chưa có định dạng truyện hỗ trợ.');
  return {title,chapters:chapters.filter(x=>x.content.trim()).sort((a,b)=>a.chapterNumber-b.chapterNumber),coverBlob,coverMime};
}
async function parseStoryFile(file){
  hideMessage(uploadMessage);hideParse();
  state.coverBlob=null;state.coverMime='';
  const ext=extOf(file.name),buffer=await file.arrayBuffer();
  state.sourceName=file.name;
  let chapters=[],title=cleanTitle(baseName(file.name)),detectedAuthor='',coverBlob=null,coverMime='';
  showParse('Đang tự nhận dạng '+file.name+'…','info');
  if(ext==='epub'){
    const epub=await epubBook(buffer,file.name);chapters=epub.chapters;title=epub.title;detectedAuthor=epub.author;coverBlob=epub.coverBlob;coverMime=epub.coverMime;
  }else if(ext==='zip'){
    const parsed=await parseZipStory(buffer,file.name);chapters=parsed.chapters;title=parsed.title;coverBlob=parsed.coverBlob;coverMime=parsed.coverMime;
  }else if(['jpg','jpeg','png','webp'].includes(ext)){
    const text=await ocrRecognize(file,'Đang đọc ảnh');chapters=splitChapters(text);
  }else{
    const text=await parseBytesToText(file.name,new Uint8Array(buffer));chapters=splitChapters(text);
  }
  state.chapters=chapters.filter(x=>x.content.trim()).sort((a,b)=>a.chapterNumber-b.chapterNumber);
  if(!state.chapters.length)throw new Error('Không nhận diện được chương/nội dung hợp lệ từ file.');
  $('bookTitle').value=title;$('pasteTitle').value=title;
  if(detectedAuthor&&!$('authorName').value.trim())$('authorName').value=detectedAuthor;
  if(coverBlob)setCover(coverBlob,coverMime);
  renderPreview();
  showParse('✓ Đã nhận dạng '+file.name+' · '+state.chapters.length+' chương.','success');
}
async function invokeAi(body){
  return jsonFetch(SUPABASE_URL+'/functions/v1/ai-translate-book',{
    method:'POST',
    headers:authHeaders({'Content-Type':'application/json'}),
    body:JSON.stringify(body),
  });
}
async function checkAiStatus(){
  const el=$('aiStatus'),toggle=$('aiTranslate');
  try{
    const data=await invokeAi({action:'status'});
    state.aiReady=Boolean(data?.premium&&data?.providerReady);
    state.aiProvider=[data?.provider,data?.model].filter(Boolean).join(' · ');
    if(state.aiReady){
      el.textContent='✓ AI sẵn sàng'+(state.aiProvider?' · '+state.aiProvider:'');
      el.className='ai-status ready';
      toggle.disabled=false;
    }else if(!data?.premium){
      el.textContent='AI đang khóa cho tài khoản này.';
      el.className='ai-status bad';
      toggle.disabled=true;toggle.checked=false;
    }else{
      el.textContent='AI chưa được cấu hình API/model trên máy chủ. Bạn vẫn nhập truyện bình thường được.';
      el.className='ai-status bad';
      toggle.disabled=true;toggle.checked=false;
    }
  }catch(err){
    state.aiReady=false;
    el.textContent='Không kiểm tra được AI: '+(err.message||String(err));
    el.className='ai-status bad';
    toggle.disabled=true;toggle.checked=false;
  }
}
function jobInfo(job){
  return {
    id:String(job?.id||''),
    status:String(job?.status||''),
    total:Number(job?.total_chapters??job?.totalChapters??0),
    done:Number(job?.completed_chapters??job?.completedChapters??0),
    error:job?.error_message??job?.errorMessage??'',
  };
}
async function translateWholeBook(bookId,genre){
  let data=await invokeAi({action:'start',bookId,genre});
  let job=jobInfo(data?.job);
  if(!job.id)throw new Error(data?.message||data?.error||'Không tạo được tác vụ AI.');
  while(job.status==='queued'||job.status==='processing'){
    showMessage(uploadMessage,'AI đang dịch/làm mượt '+job.done+'/'+job.total+' chương…','info');
    data=await invokeAi({action:'step',jobId:job.id});
    job=jobInfo(data?.job);
  }
  if(job.status!=='completed')throw new Error(job.error||'AI chưa hoàn tất toàn truyện.');
  showMessage(uploadMessage,'✓ AI đã xử lý đủ '+job.done+'/'+job.total+' chương.','success');
  return job;
}
async function ensureAdmin(){
  if(!state.token||!state.userId)return false;
  try{
    const rows=await rest('profiles?id=eq.'+encodeURIComponent(state.userId)+'&select=role,display_name,username');
    const profile=rows?.[0];
    if(profile?.role!=='admin')throw new Error('Tài khoản không có quyền Admin.');
    $('adminName').textContent=profile.display_name||profile.username||'Admin';
    const authors=await rest('authors?moderation_state=eq.approved&select=id,user_id,pen_name,verified&order=verified.desc,pen_name.asc');
    const preferred=authors.find(a=>String(a.pen_name||'').toLocaleLowerCase('vi').includes('chương studio'))||authors[0];
    if(!preferred)throw new Error('Chưa có hồ sơ tác giả nội bộ để gắn truyện Admin.');
    state.ownerAuthorId=preferred.id;
    loginView.classList.add('hidden');studioView.classList.remove('hidden');
    checkAiStatus();
    return true;
  }catch(err){ logout(); showMessage(loginMessage,err.message||String(err)); return false; }
}
function logout(){
  state.token='';state.userId='';state.ownerAuthorId='';
  sessionStorage.removeItem('chuong_admin_token');sessionStorage.removeItem('chuong_admin_user');
  studioView.classList.add('hidden');loginView.classList.remove('hidden');
}
$('loginForm').addEventListener('submit',async(e)=>{
  e.preventDefault();hideMessage(loginMessage);
  try{
    const data=await jsonFetch(SUPABASE_URL+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value.trim(),password:$('password').value})});
    state.token=data.access_token;state.userId=data.user.id;
    sessionStorage.setItem('chuong_admin_token',state.token);sessionStorage.setItem('chuong_admin_user',state.userId);
    await ensureAdmin();
  }catch(err){showMessage(loginMessage,err.message||String(err));}
});
$('logoutBtn').addEventListener('click',logout);
$('storyFile').addEventListener('change',async(e)=>{const file=e.target.files?.[0];if(!file)return;try{await parseStoryFile(file);}catch(err){showMessage(uploadMessage,err.message||String(err));}});
$('dropZone').addEventListener('dragover',e=>{e.preventDefault();$('dropZone').classList.add('drag');});
$('dropZone').addEventListener('dragleave',()=>$('dropZone').classList.remove('drag'));
$('dropZone').addEventListener('drop',async e=>{e.preventDefault();$('dropZone').classList.remove('drag');const file=e.dataTransfer.files?.[0];if(!file)return;try{await parseStoryFile(file);}catch(err){showMessage(uploadMessage,err.message||String(err));}});
$('parsePasteBtn').addEventListener('click',()=>{
  const raw=$('pasteText').value.trim();if(raw.length<20)return showMessage(uploadMessage,'Hãy dán nội dung truyện trước.');
  state.chapters=splitChapters(raw);state.sourceName='Nội dung dán';
  const title=$('pasteTitle').value.trim()||'Truyện nhập từ Admin';$('bookTitle').value=title;renderPreview();hideMessage(uploadMessage);
});
$('coverFile').addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>5*1024*1024)return showMessage(uploadMessage,'Ảnh bìa cần nhỏ hơn 5 MB.');setCover(file,file.type);});
async function uploadCover(bookId){
  if(!state.coverBlob)return null;
  const ext=state.coverMime==='image/png'?'png':state.coverMime==='image/webp'?'webp':'jpg';
  const path=state.userId+'/'+bookId+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,10)+'.'+ext;
  const encoded=path.split('/').map(encodeURIComponent).join('/');
  const res=await fetch(SUPABASE_URL+'/storage/v1/object/book-covers/'+encoded,{method:'POST',headers:authHeaders({'Content-Type':state.coverMime,'x-upsert':'false'}),body:state.coverBlob});
  if(!res.ok){const data=await res.json().catch(()=>null);throw new Error(data?.message||'Không thể tải ảnh bìa.');}
  const publicUrl=SUPABASE_URL+'/storage/v1/object/public/book-covers/'+encoded;
  await rest('books?id=eq.'+bookId,{method:'PATCH',body:{cover_url:publicUrl}});
  return publicUrl;
}
async function insertChapters(bookId,chapters){
  for(let offset=0;offset<chapters.length;offset+=25){
    const batch=chapters.slice(offset,offset+25).map(ch=>({book_id:bookId,chapter_number:ch.chapterNumber,title:ch.title.trim()||('Chương '+ch.chapterNumber),content:ch.content.trim(),status:'draft',published_at:null,is_vip:false,price_coins:0}));
    await rest('chapters',{method:'POST',body:batch,prefer:'return=minimal'});
  }
}
async function verifyStored(bookId,expected){
  const rows=await rest('chapters?book_id=eq.'+bookId+'&select=chapter_number&order=chapter_number.asc');
  const actual=rows.map(x=>Number(x.chapter_number)).sort((a,b)=>a-b),want=expected.map(x=>x.chapterNumber).sort((a,b)=>a-b);
  return {ok:actual.length===want.length&&want.every((n,i)=>actual[i]===n),actual,want};
}
async function deleteDraftBook(bookId){ try{await rest('books?id=eq.'+bookId+'&status=eq.draft',{method:'DELETE',prefer:'return=minimal'});}catch{} }
$('uploadBtn').addEventListener('click',async()=>{
  hideMessage(uploadMessage);
  const title=$('bookTitle').value.trim(),author=$('authorName').value.trim(),genre=$('genre').value,sourceType=$('sourceType').value,publish=$('publishNow').checked,rights=$('rightsConfirmed').checked,useAi=$('aiTranslate').checked,chapters=state.chapters;
  if(!state.ownerAuthorId)return showMessage(uploadMessage,'Chưa xác định được tác giả nội bộ Admin.');
  if(title.length<2)return showMessage(uploadMessage,'Hãy nhập tên truyện.');
  if(!author)return showMessage(uploadMessage,'Hãy nhập tên tác giả hiển thị.');
  if(!rights)return showMessage(uploadMessage,'Cần xác nhận quyền nội dung trước khi đẩy.');
  if(!chapters.length)return showMessage(uploadMessage,'Chưa có chương để đẩy.');
  if(useAi&&!state.aiReady)return showMessage(uploadMessage,'AI chưa sẵn sàng trên máy chủ. Hãy tắt AI hoặc cấu hình nhà cung cấp AI.');
  const audit=auditChapters(chapters);if(audit.duplicates.length)return showMessage(uploadMessage,'Có số chương trùng, chưa thể đẩy.');
  if(publish&&chapters.some(ch=>ch.content.trim().length<50))return showMessage(uploadMessage,'Có chương dưới 50 ký tự. Hãy tắt “Xuất bản ngay” hoặc kiểm tra lại nội dung.');
  const btn=$('uploadBtn');btn.disabled=true;btn.textContent=useAi?'Đang nhập rồi AI xử lý…':'Đang đẩy và xác minh…';
  let bookId='';
  try{
    const slug=(slugify(title)||'truyen')+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
    const books=await rest('books?select=id',{method:'POST',prefer:'return=representation',body:{author_id:state.ownerAuthorId,title,slug,description:'Truyện được Admin nhập bằng CHƯƠNG Upload Studio từ nguồn '+(state.sourceName||'nội dung quản trị')+'.',credited_author_name:author,language:'vi',source_type:sourceType,status:'draft',visibility:'private',tags:[]}});
    bookId=books[0].id;
    await rest('book_genres',{method:'POST',prefer:'return=minimal',body:{book_id:bookId,genre}});
    showMessage(uploadMessage,'Đang ghi '+chapters.length+' chương vào kho…','info');
    await insertChapters(bookId,chapters);
    const verification=await verifyStored(bookId,chapters);
    if(!verification.ok)throw new Error('Xác minh thất bại: dự kiến '+verification.want.length+' chương nhưng database có '+verification.actual.length+'.');
    if(state.coverBlob)await uploadCover(bookId);
    if(useAi)await translateWholeBook(bookId,genre);
    if(publish){
      const now=new Date().toISOString();
      await rest('chapters?book_id=eq.'+bookId,{method:'PATCH',body:{status:'published',published_at:now}});
      await rest('books?id=eq.'+bookId,{method:'PATCH',body:{status:'ongoing',visibility:'public',language:'vi'}});
    }
    showMessage(uploadMessage,'✓ Đẩy truyện thành công.\n✓ Đã xác minh đủ '+chapters.length+'/'+chapters.length+' chương.'+(useAi?'\n✓ AI đã dịch/làm mượt toàn truyện sang tiếng Việt.':'')+'\nTrạng thái: '+(publish?'Đã công khai trong app':'Bản nháp riêng tư')+'.\nBook ID: '+bookId,'success');
    btn.textContent='Đã đẩy đủ '+chapters.length+'/'+chapters.length+' chương';
  }catch(err){
    if(bookId)await deleteDraftBook(bookId);
    showMessage(uploadMessage,(err.message||String(err))+'\nNếu thao tác dừng giữa chừng, truyện nháp mới tạo đã được dọn lại khi có thể.');
    btn.disabled=false;btn.textContent='Đẩy truyện lên app';
  }
});
ensureAdmin();
