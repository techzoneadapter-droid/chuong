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
function splitChapters(raw) {
  const text = normalizeText(raw);
  if (!text) return [];
  const re = /^(?:chương|chuong|chapter|chap)\s*(\d{1,6})(?:\s*[:.\-–—]\s*|\s+)?([^\n]*)$/gim;
  const matches = [...text.matchAll(re)];
  if (!matches.length) return [{ chapterNumber: 1, title: 'Chương 1', content: text }];
  const out = [];
  for (let i=0;i<matches.length;i++) {
    const m=matches[i], next=matches[i+1];
    const number=Number(m[1]), tail=(m[2]||'').trim();
    const start=(m.index||0)+m[0].length, end=next?.index ?? text.length;
    const content=normalizeText(text.slice(start,end));
    if (content) out.push({ chapterNumber:number, title:tail || ('Chương ' + number), content });
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
async function parseStoryFile(file){
  hideMessage(uploadMessage);
  const ext=extOf(file.name),buffer=await file.arrayBuffer();
  state.sourceName=file.name;
  let chapters=[],title=cleanTitle(baseName(file.name)),zipCover=null,zipCoverMime='';
  if(ext==='txt'){
    chapters=splitChapters(new TextDecoder('utf-8').decode(buffer));
  }else if(ext==='docx'){
    chapters=splitChapters(await docxText(buffer));
  }else if(ext==='zip'){
    const entries=readZipEntries(buffer);
    const docs=entries.filter(e=>['txt','docx'].includes(extOf(e.name))).sort((a,b)=>naturalNumber(a.name)-naturalNumber(b.name)||a.name.localeCompare(b.name,'vi'));
    if(!docs.length)throw new Error('ZIP chưa có TXT hoặc DOCX.');
    const top=docs[0].name.replace(/\\/g,'/').split('/').filter(Boolean);
    if(top.length>1)title=cleanTitle(top[0]); else title=cleanTitle(baseName(file.name));
    let fallback=1;
    for(const entry of docs){
      const bytes=await extractZipEntry(buffer,entry),text=await parseTextBytes(entry.name,bytes),embedded=splitChapters(text),num=naturalNumber(entry.name);
      if(embedded.length>1){chapters.push(...embedded);fallback=Math.max(fallback,...embedded.map(x=>x.chapterNumber))+1;}
      else{const n=Number.isFinite(num)&&num!==Number.MAX_SAFE_INTEGER?num:fallback++;chapters.push({chapterNumber:n,title:chapterTitleFromFilename(entry.name,n),content:embedded[0]?.content||text});}
    }
    const images=entries.filter(e=>['jpg','jpeg','png','webp'].includes(extOf(e.name)));
    const cover=images.find(e=>/(?:^|[\/_-])(cover|bia|bìa)(?:[._-]|$)/i.test(e.name))||images[0];
    if(cover){const bytes=await extractZipEntry(buffer,cover);zipCoverMime=extOf(cover.name)==='png'?'image/png':extOf(cover.name)==='webp'?'image/webp':'image/jpeg';zipCover=new Blob([bytes],{type:zipCoverMime});}
  }else throw new Error('Chỉ hỗ trợ TXT, DOCX hoặc ZIP.');
  state.chapters=chapters.filter(x=>x.content.trim()).sort((a,b)=>a.chapterNumber-b.chapterNumber);
  $('bookTitle').value=title;$('pasteTitle').value=title;
  if(zipCover)setCover(zipCover,zipCoverMime);
  renderPreview();
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
  const title=$('bookTitle').value.trim(),author=$('authorName').value.trim(),genre=$('genre').value,sourceType=$('sourceType').value,publish=$('publishNow').checked,rights=$('rightsConfirmed').checked,chapters=state.chapters;
  if(!state.ownerAuthorId)return showMessage(uploadMessage,'Chưa xác định được tác giả nội bộ Admin.');
  if(title.length<2)return showMessage(uploadMessage,'Hãy nhập tên truyện.');
  if(!author)return showMessage(uploadMessage,'Hãy nhập tên tác giả hiển thị.');
  if(!rights)return showMessage(uploadMessage,'Cần xác nhận quyền nội dung trước khi đẩy.');
  if(!chapters.length)return showMessage(uploadMessage,'Chưa có chương để đẩy.');
  const audit=auditChapters(chapters);if(audit.duplicates.length)return showMessage(uploadMessage,'Có số chương trùng, chưa thể đẩy.');
  if(publish&&chapters.some(ch=>ch.content.trim().length<50))return showMessage(uploadMessage,'Có chương dưới 50 ký tự. Hãy tắt “Xuất bản ngay” hoặc kiểm tra lại nội dung.');
  const btn=$('uploadBtn');btn.disabled=true;btn.textContent='Đang đẩy và xác minh…';
  let bookId='';
  try{
    const slug=(slugify(title)||'truyen')+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
    const books=await rest('books?select=id',{method:'POST',prefer:'return=representation',body:{author_id:state.ownerAuthorId,title,slug,description:'Truyện được Admin nhập bằng CHƯƠNG Upload Studio từ nguồn '+(state.sourceName||'nội dung quản trị')+'.',credited_author_name:author,language:'vi',source_type:sourceType,status:'draft',visibility:'private',tags:[]}});
    bookId=books[0].id;
    await rest('book_genres',{method:'POST',prefer:'return=minimal',body:{book_id:bookId,genre}});
    await insertChapters(bookId,chapters);
    const verification=await verifyStored(bookId,chapters);
    if(!verification.ok)throw new Error('Xác minh thất bại: dự kiến '+verification.want.length+' chương nhưng database có '+verification.actual.length+'.');
    if(state.coverBlob)await uploadCover(bookId);
    if(publish){
      const now=new Date().toISOString();
      await rest('chapters?book_id=eq.'+bookId,{method:'PATCH',body:{status:'published',published_at:now}});
      await rest('books?id=eq.'+bookId,{method:'PATCH',body:{status:'ongoing',visibility:'public'}});
    }
    showMessage(uploadMessage,'✓ Đẩy truyện thành công.\n✓ Đã đọc ngược database và xác minh đủ '+chapters.length+'/'+chapters.length+' chương.\nTrạng thái: '+(publish?'Đã công khai trong app':'Bản nháp riêng tư')+'.\nBook ID: '+bookId,'success');
    btn.textContent='Đã đẩy đủ '+chapters.length+'/'+chapters.length+' chương';
  }catch(err){
    if(bookId)await deleteDraftBook(bookId);
    showMessage(uploadMessage,(err.message||String(err))+'\nNếu thao tác dừng giữa chừng, truyện nháp mới tạo đã được dọn lại khi có thể.');
    btn.disabled=false;btn.textContent='Đẩy truyện lên app';
  }
});
ensureAdmin();
