
(() => {
  const PAGE_SIZE=100;
  const bulkState={rows:[],page:1,filter:'all',query:'',running:false,paused:false,cancel:false,batchId:''};
  const el=(id)=>document.getElementById(id);
  const statusLabel=(value)=>value==='completed'?'Hoàn thành':value==='paused'?'Tạm dừng / Drop':'Đang ra';
  const wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
  const escapeAttr=(value)=>String(value??'').replace(/[&<>"']/g,ch=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[ch]));
  const relativeName=(file)=>file.webkitRelativePath||file.name;

  function uuid(){
    if(globalThis.crypto?.randomUUID)return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
      const r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16);
    });
  }
  async function sha256Buffer(buffer){
    const digest=await crypto.subtle.digest('SHA-256',buffer);
    return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  function metadataValue(obj,keys){
    for(const key of keys){
      const found=Object.keys(obj||{}).find(k=>k.toLocaleLowerCase('vi')===key.toLocaleLowerCase('vi'));
      if(found!=null&&obj[found]!=null&&String(obj[found]).trim())return String(obj[found]).trim();
    }
    return '';
  }
  function normalizeStatus(value){
    const text=String(value||'').trim().toLocaleLowerCase('vi');
    if(!text)return '';
    if(/hoàn|hoan|complete|completed|full|trọn bộ|tron bo|toàn văn|toan van/.test(text))return 'completed';
    if(/tạm|tam|pause|paused|drop|dừng|dung/.test(text))return 'paused';
    if(/đang|dang|ongoing|serial|còn tiếp|con tiep/.test(text))return 'ongoing';
    return '';
  }
  function parseInfoText(text){
    const info={};
    const normalized=normalizeText(text);
    const patterns=[
      ['title',/^(?:tên truyện|ten truyen|title|book)\s*[:：]\s*(.+)$/im],
      ['author',/^(?:tác giả|tac gia|author|written by)\s*[:：]\s*(.+)$/im],
      ['status',/^(?:trạng thái|trang thai|status)\s*[:：]\s*(.+)$/im],
      ['genre',/^(?:thể loại|the loai|genre|category)\s*[:：]\s*(.+)$/im],
    ];
    for(const [key,re] of patterns){const m=normalized.match(re);if(m)info[key]=m[1].trim();}
    return info;
  }
  async function readMetadata(buffer,entries){
    const candidates=entries.filter(entry=>/(^|\/)(metadata|book|info|manifest)\.(json|txt)$/i.test(entry.name)).slice(0,5);
    const merged={};
    for(const entry of candidates){
      try{
        const bytes=await extractZipEntry(buffer,entry);
        const text=new TextDecoder('utf-8').decode(bytes);
        if(/\.json$/i.test(entry.name)){
          const obj=JSON.parse(text);
          merged.title ||= metadataValue(obj,['title','name','book_title','ten_truyen','tenTruyen']);
          merged.author ||= metadataValue(obj,['author','author_name','tac_gia','tacGia']);
          merged.status ||= metadataValue(obj,['status','trang_thai','trangThai','completed']);
          merged.genre ||= metadataValue(obj,['genre','category','the_loai','theLoai']);
        }else{
          const parsed=parseInfoText(text);
          merged.title ||= parsed.title||'';
          merged.author ||= parsed.author||'';
          merged.status ||= parsed.status||'';
          merged.genre ||= parsed.genre||'';
        }
      }catch{}
    }
    return merged;
  }
  function pickCoverEntry(entries){
    const images=entries.filter(entry=>['jpg','jpeg','png','webp'].includes(extOf(entry.name)));
    if(!images.length)return null;
    return images.find(entry=>/(^|[\/_. -])(cover|bìa|bia|book-cover|poster|front|folder)([\/_. -]|$)/i.test(entry.name))||images[0];
  }
  async function detectChapterSample(buffer,entry){
    try{
      const bytes=await extractZipEntry(buffer,entry);
      const text=await parseBytesToText(entry.name,bytes);
      const prefixed=parsePrefixedStoryChapter(text);
      if(prefixed)return prefixed;
      const author=parseInfoText(text).author||'';
      return {bookTitle:'',chapterNumber:naturalNumber(entry.name),chapterTitle:'',content:'',author};
    }catch{return null;}
  }
  async function duplicateByHash(hash){
    const rows=await rest('admin_import_logs?select=id,book_id,book_title&source_sha256=eq.'+encodeURIComponent(hash)+'&status=eq.completed&limit=1');
    return rows?.[0]||null;
  }
  async function scanRow(row){
    row.scan='scanning';row.message='Đang quét…';renderBulkRows();
    const buffer=await row.file.arrayBuffer();
    row.sha256=await sha256Buffer(buffer);
    row.size=row.file.size;
    const hashDup=await duplicateByHash(row.sha256);
    if(hashDup){
      row.scan='duplicate';row.selected=false;row.duplicateBookId=hashDup.book_id||'';row.message='Đã nhập ZIP này trước đó';
      return;
    }
    const entries=readZipEntries(buffer);
    const docs=entries.filter(entry=>['txt','md','html','htm','rtf','fb2','docx','odt','pdf'].includes(extOf(entry.name)))
      .sort((a,b)=>naturalNumber(a.name)-naturalNumber(b.name)||a.name.localeCompare(b.name,'vi'));
    if(!docs.length)throw new Error('Không tìm thấy file chương trong ZIP.');
    const metadata=await readMetadata(buffer,entries);
    const sampleIndexes=[0,1,Math.floor((docs.length-1)/2),docs.length-1].filter((v,i,a)=>v>=0&&v<docs.length&&a.indexOf(v)===i);
    const samples=[];
    for(const index of sampleIndexes){
      const sample=await detectChapterSample(buffer,docs[index]);
      if(sample)samples.push(sample);
    }
    const detectedTitles=samples.map(s=>s.bookTitle).filter(Boolean);
    let title=metadata.title||mostCommonText(detectedTitles);
    if(!title){
      const firstPath=docs[0].name.replace(/\\/g,'/').split('/').filter(Boolean);
      title=firstPath.length>1?cleanTitle(firstPath[0]):cleanTitle(row.file.name);
    }
    const detectedAuthor=metadata.author||samples.map(s=>s.author).find(Boolean)||'';
    const chosenAuthor=detectedAuthor||String(el('bulkDefaultAuthor')?.value||'Chuong').trim()||'Chuong';
    const detectedStatus=normalizeStatus(metadata.status);
    const chosenStatus=detectedStatus||el('bulkDefaultStatus').value;
    const cover=pickCoverEntry(entries);
    const nums=docs.map(entry=>naturalNumber(entry.name)).filter(n=>Number.isFinite(n)&&n!==Number.MAX_SAFE_INTEGER);
    const duplicateNums=nums.filter((n,i)=>nums.indexOf(n)!==i);
    row.title=title;
    row.author=chosenAuthor;
    row.detectedAuthor=detectedAuthor;
    row.status=chosenStatus;
    const inferredGenre=metadata.genre?{genre:metadata.genre,score:100,matched:['metadata']}:inferGenreFromTitle(title);
    row.genre=metadata.genre||inferredGenre.genre||el('bulkDefaultGenre').value;
    row.genreSource=metadata.genre?'metadata':(inferredGenre.genre?'title':'default');
    row.chapterCount=docs.length;
    row.hasCover=Boolean(cover);
    row.coverEntry=cover?.name||'';
    row.warning=duplicateNums.length?'Trùng số chương trong tên file: '+[...new Set(duplicateNums)].slice(0,8).join(', '):(!cover?'Không có bìa · thêm tay sau':'');
    row.scan=duplicateNums.length?'failed':'ready';
    row.message=duplicateNums.length?'Cần kiểm tra':(row.warning||'Sẵn sàng');
  }
  function rowMatches(row){
    if(bulkState.filter==='ready'&&row.scan!=='ready')return false;
    if(bulkState.filter==='missing-cover'&&row.hasCover!==false)return false;
    if(bulkState.filter==='duplicate'&&row.scan!=='duplicate')return false;
    if(bulkState.filter==='failed'&&!['failed','import-failed'].includes(row.scan))return false;
    const q=bulkState.query.trim().toLocaleLowerCase('vi');
    const hay=(row.file.name+' '+(row.title||'')+' '+(row.author||'')).toLocaleLowerCase('vi');
    if(q&&!hay.includes(q))return false;
    return true;
  }
  function selectedRows(){return bulkState.rows.filter(row=>row.selected&&row.scan==='ready');}
  function updateSummary(){
    el('bulkTotal').textContent=bulkState.rows.length.toLocaleString('vi-VN');
    el('bulkScanned').textContent=bulkState.rows.filter(r=>r.scan!=='waiting'&&r.scan!=='scanning').length.toLocaleString('vi-VN');
    el('bulkReady').textContent=bulkState.rows.filter(r=>r.scan==='ready').length.toLocaleString('vi-VN');
    el('bulkDone').textContent=bulkState.rows.filter(r=>r.scan==='done').length.toLocaleString('vi-VN');
    el('bulkSkipped').textContent=bulkState.rows.filter(r=>r.scan==='duplicate'||r.scan==='skipped').length.toLocaleString('vi-VN');
    el('bulkFailed').textContent=bulkState.rows.filter(r=>r.scan==='failed'||r.scan==='import-failed').length.toLocaleString('vi-VN');
    el('bulkImportBtn').disabled=bulkState.running||selectedRows().length===0;
  }
  function renderBulkRows(){
    const filtered=bulkState.rows.filter(rowMatches);
    const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
    bulkState.page=Math.min(Math.max(1,bulkState.page),pages);
    const start=(bulkState.page-1)*PAGE_SIZE;
    const pageRows=filtered.slice(start,start+PAGE_SIZE);
    el('bulkPageLabel').textContent=bulkState.page+' / '+pages;
    el('bulkPrevPage').disabled=bulkState.page<=1;
    el('bulkNextPage').disabled=bulkState.page>=pages;
    if(!pageRows.length){
      el('bulkRows').innerHTML='<tr><td colspan="8" class="bulk-empty">Không có mục phù hợp.</td></tr>';
      updateSummary();
      return;
    }
    el('bulkRows').innerHTML=pageRows.map(row=>{
      const cls=row.scan==='done'?'row-done':row.scan==='duplicate'||row.scan==='skipped'?'row-skipped':row.scan==='failed'||row.scan==='import-failed'?'row-failed':'';
      const tone=row.scan==='done'||row.scan==='ready'?'ok':row.scan==='duplicate'||row.scan==='skipped'?'warn':row.scan==='failed'||row.scan==='import-failed'?'bad':'';
      const stateText=row.scan==='waiting'?'Chưa quét':row.scan==='scanning'?'Đang quét':row.scan==='ready'?'Sẵn sàng':row.scan==='duplicate'?'Đã nhập / trùng':row.scan==='importing'?'Đang nhập':row.scan==='done'?'Thành công':row.scan==='skipped'?'Bỏ qua':row.scan==='import-failed'||row.scan==='failed'?'Lỗi':row.scan;
      return '<tr class="'+cls+'" data-row-id="'+row.id+'">'+
        '<td><input type="checkbox" data-bulk-select="'+row.id+'" '+(row.selected?'checked':'')+' '+(row.scan==='duplicate'||row.scan==='done'?'disabled':'')+' /></td>'+
        '<td class="zip-name"><strong>'+escapeAttr(relativeName(row.file))+'</strong><div class="tiny">'+(row.file.size/1024).toFixed(0)+' KB</div></td>'+
        '<td><input type="text" data-bulk-title="'+row.id+'" value="'+escapeAttr(row.title||cleanTitle(row.file.name))+'" /></td>'+
        '<td><input type="text" data-bulk-author="'+row.id+'" value="'+escapeAttr(row.author||el('bulkDefaultAuthor').value||'Chuong')+'" /></td>'+
        '<td>'+(row.hasCover===true?'Có bìa':row.hasCover===false?'Không có':'—')+'</td>'+
        '<td><select data-bulk-status="'+row.id+'">'+['completed','ongoing','paused'].map(v=>'<option value="'+v+'" '+((row.status||el('bulkDefaultStatus').value)===v?'selected':'')+'>'+statusLabel(v)+'</option>').join('')+'</select></td>'+
        '<td>'+(row.chapterCount||'—')+'</td>'+
        '<td><span class="bulk-status '+tone+'">'+stateText+'</span><div class="tiny">'+escapeAttr(row.message||row.warning||'')+'</div></td>'+
      '</tr>';
    }).join('');
    updateSummary();
  }
  function addFiles(fileList){
    const files=[...fileList].filter(file=>/\.zip$/i.test(file.name));
    let added=0;
    const existing=new Set(bulkState.rows.map(row=>relativeName(row.file)+'|'+row.file.size+'|'+row.file.lastModified));
    for(const file of files){
      const key=relativeName(file)+'|'+file.size+'|'+file.lastModified;
      if(existing.has(key))continue;
      existing.add(key);
      added++;
      bulkState.rows.push({
        id:uuid(),file,selected:true,scan:'waiting',title:cleanTitle(file.name),
        author:String(el('bulkDefaultAuthor')?.value||'Chuong').trim()||'Chuong',
        status:el('bulkDefaultStatus')?.value||'completed',
        genre:el('bulkDefaultGenre')?.value||'Khác',
        chapterCount:0,hasCover:null,message:'Chưa quét',sha256:''
      });
    }
    bulkState.page=Math.max(1,Math.ceil(bulkState.rows.filter(rowMatches).length/PAGE_SIZE));
    renderBulkRows();
    if(added)showBulkMessage('Đã thêm '+added.toLocaleString('vi-VN')+' file ZIP vào hàng đợi.','info');
  }
  function showBulkMessage(text,type='info'){
    const box=el('bulkMessage');
    box.textContent=text;
    box.className='message '+type;
  }
  function setProgress(done,total,text){
    const pct=total?Math.round(done*100/total):0;
    el('bulkProgressBar').style.width=pct+'%';
    el('bulkProgressText').textContent=text||pct+'%';
  }
  async function scanAll(){
    if(bulkState.running)return;
    const targets=bulkState.rows.filter(row=>row.scan==='waiting'||row.scan==='failed');
    if(!targets.length)return showBulkMessage('Không có ZIP mới cần quét.','warn');
    bulkState.running=true;
    bulkState.cancel=false;
    el('bulkScanBtn').disabled=true;
    el('bulkImportBtn').disabled=true;
    let cursor=0,done=0;
    const worker=async()=>{
      while(cursor<targets.length&&!bulkState.cancel){
        const row=targets[cursor++];
        try{await scanRow(row);}
        catch(error){row.scan='failed';row.selected=false;row.message=error.message||String(error);}
        done++;
        setProgress(done,targets.length,'Đã quét '+done+'/'+targets.length+' ZIP');
        renderBulkRows();
        await wait(0);
      }
    };
    await Promise.all([worker(),worker()]);
    bulkState.running=false;
    el('bulkScanBtn').disabled=false;
    setProgress(done,targets.length,'Quét xong '+done+'/'+targets.length+' ZIP · '+selectedRows().length+' truyện sẵn sàng');
    renderBulkRows();
    showBulkMessage('Quét hoàn tất. Không có tác giả sẽ dùng “'+(el('bulkDefaultAuthor').value||'Chuong')+'”. ZIP không có bìa vẫn được phép nhập.','success');
  }
  async function uploadBulkCover(bookId,blob,mime){
    if(!blob)return null;
    const ext=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
    const path=state.userId+'/'+bookId+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,9)+'.'+ext;
    const encoded=path.split('/').map(encodeURIComponent).join('/');
    const res=await fetch(SUPABASE_URL+'/storage/v1/object/book-covers/'+encoded,{
      method:'POST',
      headers:authHeaders({'Content-Type':mime||'image/jpeg','x-upsert':'false'}),
      body:blob
    });
    if(!res.ok)throw new Error('Không thể tải ảnh bìa.');
    const url=SUPABASE_URL+'/storage/v1/object/public/book-covers/'+encoded;
    await rest('books?id=eq.'+bookId,{method:'PATCH',body:{cover_url:url}});
    return url;
  }
  async function createBulkLog(row,title,author,chapters){
    const audit=auditChapters(chapters);
    const rows=await rest('admin_import_logs?select=id',{
      method:'POST',prefer:'return=representation',
      body:{
        admin_user_id:state.userId,
        source_name:relativeName(row.file),
        book_title:title,
        credited_author_name:author,
        chapter_count:chapters.length,
        word_count:audit.totalWords,
        status:'started',
        detail:'Nhập hàng loạt ZIP.',
        source_sha256:row.sha256,
        source_size_bytes:row.file.size,
        batch_id:bulkState.batchId,
        relative_path:relativeName(row.file)
      }
    });
    return rows?.[0]?.id||'';
  }
  async function finishBulkLog(logId,status,bookId,detail){
    if(!logId)return;
    await rest('admin_import_logs?id=eq.'+encodeURIComponent(logId),{
      method:'PATCH',
      body:{status,book_id:bookId||null,detail:String(detail||'').slice(0,2000),completed_at:new Date().toISOString()}
    }).catch(()=>{});
  }
  async function importOne(row,publishNow){
    row.scan='importing';
    row.message='Đang đọc đầy đủ ZIP…';
    renderBulkRows();
    let bookId='',logId='';
    try{
      const duplicate=await duplicateByHash(row.sha256);
      if(duplicate){
        row.scan='skipped';row.selected=false;row.message='ZIP đã được nhập trước đó';
        return 'skipped';
      }
      const buffer=await row.file.arrayBuffer();
      const parsed=await parseZipStory(buffer,row.file.name);
      const chapters=parsed.chapters||[];
      const audit=auditChapters(chapters);
      if(!chapters.length)throw new Error('Không nhận diện được chương.');
      if(audit.duplicates.length)throw new Error('Trùng số chương: '+audit.duplicates.slice(0,12).join(', '));
      if(audit.empty.length)throw new Error('Có '+audit.empty.length+' chương rỗng.');
      const title=String(row.title||parsed.title||cleanTitle(row.file.name)).trim();
      const author=String(row.author||el('bulkDefaultAuthor').value||'Chuong').trim()||'Chuong';
      const duplicates=await findDuplicateBooks(title,author);
      if(duplicates.length){
        row.scan='skipped';row.selected=false;row.message='Truyện đã tồn tại trong kho';
        return 'skipped';
      }
      logId=await createBulkLog(row,title,author,chapters);
      const slug=(slugify(title)||'truyen')+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
      const books=await rest('books?select=id',{
        method:'POST',prefer:'return=representation',
        body:{
          author_id:state.ownerAuthorId,title,slug,
          description:'Truyện được Admin nhập hàng loạt từ '+relativeName(row.file)+'.',
          credited_author_name:author,language:'vi',source_type:el('bulkSourceType').value,
          status:'draft',visibility:'private',tags:[],is_vip:false,price_coins:0
        }
      });
      bookId=books[0].id;
      await rest('admin_import_logs?id=eq.'+encodeURIComponent(logId),{method:'PATCH',body:{book_id:bookId}}).catch(()=>{});
      await rest('book_genres',{method:'POST',prefer:'return=minimal',body:{book_id:bookId,genre:row.genre||el('bulkDefaultGenre').value||'Khác'}});
      row.message='Đang ghi '+chapters.length+' chương…';
      renderBulkRows();
      await insertChapters(bookId,chapters);
      const verify=await verifyStored(bookId,chapters);
      if(!verify.ok)throw new Error('Xác minh số chương thất bại.');
      if(parsed.coverBlob)await uploadBulkCover(bookId,parsed.coverBlob,parsed.coverMime);
      if(publishNow){
        const now=new Date().toISOString();
        await rest('chapters?book_id=eq.'+bookId,{method:'PATCH',body:{status:'published',published_at:now}});
        await rest('books?id=eq.'+bookId,{
          method:'PATCH',
          body:{status:row.status||el('bulkDefaultStatus').value,visibility:'public',language:'vi'}
        });
      }
      await finishBulkLog(logId,'completed',bookId,'Đã nhập đủ '+chapters.length+' chương'+(parsed.coverBlob?' · có bìa':' · chưa có bìa')+'.');
      row.bookId=bookId;
      row.scan='done';
      row.selected=false;
      row.chapterCount=chapters.length;
      row.hasCover=Boolean(parsed.coverBlob);
      row.message='Đã nhập '+chapters.length+' chương'+(parsed.coverBlob?'':' · thêm bìa sau');
      return 'done';
    }catch(error){
      if(bookId)await deleteDraftBook(bookId);
      await finishBulkLog(logId,'failed',bookId,error.message||String(error));
      row.scan='import-failed';
      row.message=error.message||String(error);
      return 'failed';
    }
  }
  async function importSelected(){
    if(bulkState.running)return;
    if(!el('bulkRightsConfirmed').checked)return showBulkMessage('Cần xác nhận quyền nội dung cho cả lô trước khi nhập.','error');
    const targets=selectedRows();
    if(!targets.length)return showBulkMessage('Không có truyện hợp lệ đang được chọn.','warn');
    bulkState.running=true;
    bulkState.paused=false;
    bulkState.cancel=false;
    bulkState.batchId=uuid();
    el('bulkScanBtn').disabled=true;
    el('bulkImportBtn').disabled=true;
    el('bulkPauseBtn').disabled=false;
    el('bulkPauseBtn').textContent='Tạm dừng';
    const publishNow=el('bulkPublishNow').checked;
    let done=0;
    for(const row of targets){
      while(bulkState.paused&&!bulkState.cancel)await wait(250);
      if(bulkState.cancel)break;
      setProgress(done,targets.length,'Đang nhập '+(done+1)+'/'+targets.length+' · '+(row.title||row.file.name));
      await importOne(row,publishNow);
      done++;
      renderBulkRows();
      setProgress(done,targets.length,'Đã xử lý '+done+'/'+targets.length);
      await wait(0);
    }
    bulkState.running=false;
    el('bulkScanBtn').disabled=false;
    el('bulkPauseBtn').disabled=true;
    el('bulkPauseBtn').textContent='Tạm dừng';
    renderBulkRows();
    loadRecentImportLogs().catch(()=>{});
    const ok=bulkState.rows.filter(r=>r.scan==='done').length;
    const skipped=bulkState.rows.filter(r=>r.scan==='skipped'||r.scan==='duplicate').length;
    const failed=bulkState.rows.filter(r=>r.scan==='import-failed'||r.scan==='failed').length;
    showBulkMessage('Hoàn tất lô. Thành công: '+ok+' · Bỏ qua/trùng: '+skipped+' · Lỗi: '+failed+'.','success');
  }
  function switchMode(mode){
    const single=mode==='single';
    el('singleImportMode').classList.toggle('hidden',!single);
    el('bulkImportMode').classList.toggle('hidden',single);
    el('singleModeBtn').classList.toggle('active',single);
    el('bulkModeBtn').classList.toggle('active',!single);
  }

  el('singleModeBtn')?.addEventListener('click',()=>switchMode('single'));
  el('bulkModeBtn')?.addEventListener('click',()=>switchMode('bulk'));
  el('bulkZipFiles')?.addEventListener('change',event=>{addFiles(event.target.files||[]);event.target.value='';});
  el('bulkZipFolder')?.addEventListener('change',event=>{addFiles(event.target.files||[]);event.target.value='';});
  el('bulkScanBtn')?.addEventListener('click',()=>void scanAll());
  el('bulkImportBtn')?.addEventListener('click',()=>void importSelected());
  el('bulkPauseBtn')?.addEventListener('click',()=>{
    if(!bulkState.running)return;
    bulkState.paused=!bulkState.paused;
    el('bulkPauseBtn').textContent=bulkState.paused?'Tiếp tục':'Tạm dừng';
    showBulkMessage(bulkState.paused?'Đã tạm dừng sau truyện hiện tại.':'Đã tiếp tục hàng đợi.','info');
  });
  el('bulkSearch')?.addEventListener('input',event=>{bulkState.query=event.target.value;bulkState.page=1;renderBulkRows();});
  el('bulkPrevPage')?.addEventListener('click',()=>{bulkState.page--;renderBulkRows();});
  el('bulkNextPage')?.addEventListener('click',()=>{bulkState.page++;renderBulkRows();});
  document.querySelectorAll('.bulk-filter').forEach(button=>button.addEventListener('click',()=>{
    document.querySelectorAll('.bulk-filter').forEach(item=>item.classList.remove('active'));
    button.classList.add('active');
    bulkState.filter=button.dataset.filter||'all';
    bulkState.page=1;
    renderBulkRows();
  }));
  el('bulkRows')?.addEventListener('change',event=>{
    const target=event.target;
    const rowId=target.dataset.bulkSelect||target.dataset.bulkTitle||target.dataset.bulkAuthor||target.dataset.bulkStatus;
    if(!rowId)return;
    const row=bulkState.rows.find(item=>item.id===rowId);
    if(!row)return;
    if(target.dataset.bulkSelect)row.selected=target.checked;
    if(target.dataset.bulkTitle)row.title=target.value.trim();
    if(target.dataset.bulkAuthor)row.author=target.value.trim()||'Chuong';
    if(target.dataset.bulkStatus)row.status=target.value;
    updateSummary();
  });
  for(const id of ['bulkDefaultAuthor','bulkDefaultStatus','bulkDefaultGenre']){
    el(id)?.addEventListener('change',()=>{
      for(const row of bulkState.rows){
        if(row.scan==='waiting'){
          if(id==='bulkDefaultAuthor')row.author=el(id).value.trim()||'Chuong';
          if(id==='bulkDefaultStatus')row.status=el(id).value;
          if(id==='bulkDefaultGenre')row.genre=el(id).value;
        }
      }
      renderBulkRows();
    });
  }
  const drop=el('bulkDropZone');
  drop?.addEventListener('dragover',event=>{event.preventDefault();drop.classList.add('drag');});
  drop?.addEventListener('dragleave',()=>drop.classList.remove('drag'));
  drop?.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('drag');addFiles(event.dataTransfer.files||[]);});
  renderBulkRows();
})();
