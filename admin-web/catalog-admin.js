
(() => {
  const PAGE_SIZE=100;
  const CHAPTER_PAGE_SIZE=50;
  const GENRES=['Tiên hiệp','Huyền huyễn','Đô thị','Kiếm hiệp','Ngôn tình','Kinh dị','Fantasy','Khoa huyễn','Hệ thống','Trinh thám','Văn học','Khác'];
  const $c=(id)=>document.getElementById(id);
  const catalogState={
    loaded:false,loading:false,page:1,total:0,rows:[],selected:new Set(),
    editing:null,chapterPage:1,chapterTotal:0,chapterRows:[],editingChapter:null,
    coverBusy:false
  };
  const EXPERIENTIAL_IMAGE_DEFAULT='gemini-2.5-flash-image';
  const EXPERIENTIAL_PROMPT_DEFAULT='deepseek-v4-flash';

  function esc(value){
    return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  }
  function showCatalogMessage(text,type='info'){
    const box=$c('catalogMessage');if(!box)return;
    box.textContent=text;box.className='message '+type;
  }
  function setApiCheckStatus(stateName,text){
    const box=$c('coverApiCheckStatus');if(!box)return;
    box.className='api-check-status '+stateName;
    const label=box.querySelector('span:last-child');
    if(label)label.textContent=text;
  }
  async function checkExperientialApi(){
    const settings=aiSettings();
    persistAiSettings();
    if(!settings.apiKey){
      setApiCheckStatus('bad','Chưa nhập Experiential API key');
      return;
    }
    const button=$c('coverCheckApiBtn');
    button.disabled=true;
    button.textContent='Đang kiểm tra...';
    setApiCheckStatus('checking','Đang xác thực khóa và kiểm tra model...');
    try{
      const response=await fetch(SUPABASE_URL+'/functions/v1/ai-generate-cover',{
        method:'POST',
        headers:authHeaders({'Content-Type':'application/json'}),
        body:JSON.stringify({
          action:'check',
          imageApiKey:settings.apiKey,
          imageModel:settings.imageModel,
          promptModel:settings.promptModel
        })
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok){
        throw new Error(data.detail||data.error||'API key không hợp lệ.');
      }
      const parts=['API key hợp lệ'];
      if(Number.isFinite(Number(data.modelCount)))parts.push(Number(data.modelCount).toLocaleString('vi-VN')+' model truy cập được');
      if(data.imageModelAvailable===false)parts.push('model tạo ảnh chưa khả dụng');
      else if(data.imageModelAvailable===true)parts.push('model tạo ảnh OK');
      if(data.promptModel&&data.promptModelAvailable===false)parts.push('model viết prompt chưa khả dụng');
      else if(data.promptModel&&data.promptModelAvailable===true)parts.push('model prompt OK');
      setApiCheckStatus(data.imageModelAvailable===false?'warn':'ok',parts.join(' · '));
    }catch(error){
      setApiCheckStatus('bad','Kiểm tra thất bại: '+(error.message||String(error)));
    }finally{
      button.disabled=false;
      button.textContent='Kiểm tra API';
    }
  }


  function showEditMessage(text,type='info'){
    const box=$c('catalogEditMessage');if(!box)return;
    box.textContent=text;box.className='message '+type;
  }
  function showBulkEditMessage(text,type='info'){
    const box=$c('catalogBulkEditMessage');if(!box)return;
    box.textContent=text;box.className='message '+type;
  }
  function setCatalogProgress(done,total,text){
    const pct=total?Math.round(done*100/total):0;
    $c('catalogProgressBar').style.width=pct+'%';
    $c('catalogProgressText').textContent=text||pct+'%';
  }
  function statusLabel(value){
    return value==='draft'?'Riêng tư':value==='completed'?'Hoàn thành':value==='paused'?'Tạm dừng / Drop':'Đang ra';
  }
  function coverHtml(row){
    if(row.cover_url)return '<img src="'+esc(row.cover_url)+'" alt="" loading="lazy" />';
    return '<span>Chưa có</span>';
  }
  function aiSettings(){
    const promptEnabled=$c('coverPromptProvider').value==='experiential';
    return {
      apiKey:$c('coverAiKey').value.trim(),
      imageModel:$c('coverAiModel').value.trim()||EXPERIENTIAL_IMAGE_DEFAULT,
      promptModel:promptEnabled?($c('coverPromptModel').value.trim()||EXPERIENTIAL_PROMPT_DEFAULT):'',
      overwrite:$c('coverAiOverwrite').checked
    };
  }
  function applyPromptMode(){
    const enabled=$c('coverPromptProvider').value==='experiential';
    $c('coverPromptFields').classList.toggle('is-disabled',!enabled);
    for(const input of $c('coverPromptFields').querySelectorAll('input'))input.disabled=!enabled;
    $c('coverPromptProviderHint').textContent=enabled
      ?'Dùng chung Experiential API key. Model gợi ý: deepseek-v4-flash.'
      :'Không dùng AI trung gian · prompt khóa cứng từ tên truyện + thể loại.';
  }
  function persistAiSettings(){
    const settings=aiSettings();
    sessionStorage.setItem('chuong_explabs_image_model',settings.imageModel);
    sessionStorage.setItem('chuong_explabs_prompt_mode',$c('coverPromptProvider').value);
    sessionStorage.setItem('chuong_explabs_prompt_model',$c('coverPromptModel').value.trim());
    if(settings.apiKey)sessionStorage.setItem('chuong_explabs_api_key',settings.apiKey);
    else sessionStorage.removeItem('chuong_explabs_api_key');
  }
  function restoreAiSettings(){
    $c('coverAiKey').value=sessionStorage.getItem('chuong_explabs_api_key')||sessionStorage.getItem('chuong_cover_image_key')||'';
    $c('coverAiModel').value=sessionStorage.getItem('chuong_explabs_image_model')||EXPERIENTIAL_IMAGE_DEFAULT;
    $c('coverPromptProvider').value=sessionStorage.getItem('chuong_explabs_prompt_mode')||'none';
    $c('coverPromptModel').value=sessionStorage.getItem('chuong_explabs_prompt_model')||EXPERIENTIAL_PROMPT_DEFAULT;
    applyPromptMode();
  }

  function catalogQueryBody(limit=PAGE_SIZE,offset=(catalogState.page-1)*PAGE_SIZE){
    return {
      p_query:$c('catalogSearch').value.trim()||null,
      p_author:$c('catalogAuthorFilter').value.trim()||null,
      p_genre:$c('catalogGenreFilter').value||null,
      p_status:$c('catalogStatusFilter').value||null,
      p_cover_state:$c('catalogCoverFilter').value||null,
      p_sort:$c('catalogSort').value||'views_desc',
      p_min_views:$c('catalogMinViews').value===''?null:Math.max(0,Number($c('catalogMinViews').value)||0),
      p_max_views:$c('catalogMaxViews').value===''?null:Math.max(0,Number($c('catalogMaxViews').value)||0),
      p_limit:limit,
      p_offset:offset
    };
  }

  async function loadCatalog(resetPage=false){
    if(catalogState.loading||!state?.token)return;
    if(resetPage)catalogState.page=1;
    catalogState.loading=true;
    $c('catalogRows').innerHTML='<tr><td colspan="10" class="bulk-empty">Đang tải kho truyện…</td></tr>';
    try{
      const body=catalogQueryBody();
      const rows=await rest('rpc/admin_catalog_search',{method:'POST',body});
      catalogState.rows=rows||[];
      catalogState.total=Number(rows?.[0]?.total_count||0);
      catalogState.loaded=true;
      renderCatalog();
    }catch(error){
      catalogState.rows=[];catalogState.total=0;
      $c('catalogRows').innerHTML='<tr><td colspan="10" class="bulk-empty">Không thể tải kho truyện.</td></tr>';
      showCatalogMessage(error.message||String(error),'error');
    }finally{
      catalogState.loading=false;
    }
  }
  window.chuongLoadCatalog=()=>loadCatalog(!catalogState.loaded);

  function renderCatalog(){
    const pages=Math.max(1,Math.ceil(catalogState.total/PAGE_SIZE));
    catalogState.page=Math.min(Math.max(1,catalogState.page),pages);
    $c('catalogTotalCount').textContent=catalogState.total.toLocaleString('vi-VN');
    $c('catalogStatTotal').textContent=catalogState.total.toLocaleString('vi-VN');
    $c('catalogStatViews').textContent=catalogState.rows.reduce((sum,row)=>sum+Number(row.views_count||0),0).toLocaleString('vi-VN');
    $c('catalogStatNoCover').textContent=catalogState.rows.filter(row=>!row.cover_url).length.toLocaleString('vi-VN');
    $c('catalogPageLabel').textContent=catalogState.page+' / '+pages;
    $c('catalogPrevPage').disabled=catalogState.page<=1;
    $c('catalogNextPage').disabled=catalogState.page>=pages;
    if(!catalogState.rows.length){
      $c('catalogRows').innerHTML='<tr><td colspan="10" class="bulk-empty">Không tìm thấy truyện phù hợp.</td></tr>';
      updateSelectionUi();return;
    }
    $c('catalogRows').innerHTML=catalogState.rows.map(row=>{
      const checked=catalogState.selected.has(row.id);
      const genre=(row.genres||[])[0]||'Khác';
      return '<tr data-catalog-id="'+row.id+'">'+
        '<td><input type="checkbox" data-catalog-select="'+row.id+'" '+(checked?'checked':'')+' /></td>'+
        '<td><div class="catalog-cover">'+coverHtml(row)+'</div></td>'+
        '<td><strong class="catalog-title">'+esc(row.title)+'</strong><div class="tiny">'+(row.is_vip?'VIP · ':'')+'ID: '+row.id.slice(0,8)+'</div></td>'+
        '<td>'+esc(row.author_name||'Chuong')+'</td>'+
        '<td>'+esc(genre)+'</td>'+
        '<td><span class="catalog-status status-'+esc(row.status)+'">'+esc(statusLabel(row.status))+'</span></td>'+
        '<td><strong>'+Number(row.views_count||0).toLocaleString('vi-VN')+'</strong><div class="tiny">'+Number(row.followers_count||0).toLocaleString('vi-VN')+' theo dõi</div></td>'+
        '<td>'+Number(row.total_chapters||0).toLocaleString('vi-VN')+'</td>'+
        '<td>'+new Date(row.updated_at).toLocaleDateString('vi-VN')+'</td>'+
        '<td><button class="secondary mini" data-catalog-edit="'+row.id+'" type="button">Sửa</button></td>'+
      '</tr>';
    }).join('');
    updateSelectionUi();
  }
  function updateSelectionUi(){
    const count=catalogState.selected.size;
    $c('catalogSelectedCount').textContent=count.toLocaleString('vi-VN');
    if($c('catalogStatSelected'))$c('catalogStatSelected').textContent=count.toLocaleString('vi-VN');
    $c('catalogBulkEditBtn').disabled=count===0;
    $c('catalogBulkCoverBtn').disabled=count===0;
    $c('catalogBulkDeleteBtn').disabled=count===0;
  }

  async function selectAllFiltered(){
    if(catalogState.loading)return;
    const button=$c('catalogSelectAllBtn');
    button.disabled=true;
    try{
      catalogState.selected.clear();
      const total=Math.max(0,catalogState.total);
      if(!total){updateSelectionUi();return;}
      let offset=0;
      while(offset<total){
        const rows=await rest('rpc/admin_catalog_search',{method:'POST',body:catalogQueryBody(200,offset)});
        if(!rows?.length)break;
        rows.forEach(row=>catalogState.selected.add(row.id));
        offset+=rows.length;
        setCatalogProgress(Math.min(offset,total),total,'Đang chọn tất cả kết quả · '+Math.min(offset,total)+'/'+total);
        if(rows.length<200)break;
      }
      renderCatalog();
      showCatalogMessage('Đã chọn '+catalogState.selected.size.toLocaleString('vi-VN')+' truyện theo bộ lọc hiện tại.','success');
      setCatalogProgress(catalogState.selected.size,catalogState.selected.size,'Đã chọn toàn bộ kết quả.');
    }catch(error){
      showCatalogMessage(error.message||String(error),'error');
    }finally{
      button.disabled=false;
    }
  }

  function openBook(row){
    catalogState.editing={...row};
    catalogState.chapterPage=1;
    catalogState.editingChapter=null;
    $c('catalogEditModal').classList.remove('hidden');
    $c('catalogEditHeading').textContent=row.title;
    $c('catalogEditTitle').value=row.title||'';
    $c('catalogEditAuthor').value=row.author_name||'Chuong';
    $c('catalogEditGenre').value=(row.genres||[])[0]||'Khác';
    $c('catalogEditStatus').value=row.status||'draft';
    $c('catalogEditDescription').value=row.description||'';
    renderEditCover(row.cover_url);
    $c('catalogChapterEditor').classList.add('hidden');
    showEditMessage('');
    loadChapterPage();
  }
  function closeBook(){
    $c('catalogEditModal').classList.add('hidden');
    catalogState.editing=null;catalogState.editingChapter=null;
  }
  function renderEditCover(url){
    $c('catalogEditCoverPreview').innerHTML=url?
      '<img src="'+esc(url)+'" alt="Bìa truyện" />':
      '<span>Truyện chưa có bìa · có thể thêm tay hoặc tạo bằng AI.</span>';
  }

  async function saveBook(){
    const row=catalogState.editing;if(!row)return;
    const title=$c('catalogEditTitle').value.trim();
    const author=$c('catalogEditAuthor').value.trim()||'Chuong';
    const genre=$c('catalogEditGenre').value;
    const status=$c('catalogEditStatus').value;
    const description=$c('catalogEditDescription').value.trim();
    if(title.length<2)return showEditMessage('Tên truyện quá ngắn.','error');
    try{
      $c('catalogSaveBookBtn').disabled=true;
      await rest('books?id=eq.'+encodeURIComponent(row.id),{
        method:'PATCH',
        body:{title,credited_author_name:author,description,updated_at:new Date().toISOString()}
      });
      await rest('book_genres?book_id=eq.'+encodeURIComponent(row.id),{method:'DELETE',prefer:'return=minimal'});
      await rest('book_genres',{method:'POST',prefer:'return=minimal',body:{book_id:row.id,genre}});
      if(status!==row.status){
        const result=await rest('rpc/admin_bulk_edit_books',{
          method:'POST',
          body:{p_book_ids:[row.id],p_set_author:false,p_author:null,p_set_genre:false,p_genre:null,p_set_status:true,p_status:status}
        });
        if(!result?.[0]?.success)throw new Error(result?.[0]?.message||'Không thể đổi trạng thái.');
      }
      row.title=title;row.author_name=author;row.description=description;row.genres=[genre];row.status=status;
      $c('catalogEditHeading').textContent=title;
      showEditMessage('Đã lưu thông tin truyện.','success');
      await loadCatalog(false);
    }catch(error){showEditMessage(error.message||String(error),'error');}
    finally{$c('catalogSaveBookBtn').disabled=false;}
  }

  async function loadChapterPage(){
    const row=catalogState.editing;if(!row)return;
    $c('catalogChapterList').innerHTML='<div class="tiny">Đang tải chương…</div>';
    const offset=(catalogState.chapterPage-1)*CHAPTER_PAGE_SIZE;
    try{
      const [chapters,countRows]=await Promise.all([
        rest('chapters?book_id=eq.'+encodeURIComponent(row.id)+'&select=id,chapter_number,title,status,updated_at&order=chapter_number.asc&limit='+CHAPTER_PAGE_SIZE+'&offset='+offset),
        rest('books?id=eq.'+encodeURIComponent(row.id)+'&select=total_chapters')
      ]);
      catalogState.chapterRows=chapters||[];
      catalogState.chapterTotal=Number(countRows?.[0]?.total_chapters||catalogState.chapterRows.length);
      renderChapters();
    }catch(error){
      $c('catalogChapterList').innerHTML='<div class="tiny">Không thể tải danh sách chương.</div>';
      showEditMessage(error.message||String(error),'error');
    }
  }
  function renderChapters(){
    const pages=Math.max(1,Math.ceil(catalogState.chapterTotal/CHAPTER_PAGE_SIZE));
    catalogState.chapterPage=Math.min(Math.max(1,catalogState.chapterPage),pages);
    $c('catalogChapterCount').textContent=catalogState.chapterTotal.toLocaleString('vi-VN')+' chương';
    $c('catalogChapterPage').textContent=catalogState.chapterPage+'/'+pages;
    $c('catalogChapterPrev').disabled=catalogState.chapterPage<=1;
    $c('catalogChapterNext').disabled=catalogState.chapterPage>=pages;
    if(!catalogState.chapterRows.length){
      $c('catalogChapterList').innerHTML='<div class="bulk-empty">Chưa có chương.</div>';return;
    }
    $c('catalogChapterList').innerHTML=catalogState.chapterRows.map(ch=>
      '<button type="button" class="catalog-chapter-item" data-edit-chapter="'+ch.id+'">'+
        '<b>Chương '+ch.chapter_number+'</b><span>'+esc(ch.title)+'</span><small>'+esc(ch.status==='published'?'Đã xuất bản':'Bản nháp')+'</small>'+
      '</button>'
    ).join('');
  }
  async function openChapter(id){
    const row=catalogState.editing;if(!row)return;
    try{
      const items=await rest('chapters?id=eq.'+encodeURIComponent(id)+'&book_id=eq.'+encodeURIComponent(row.id)+'&select=id,chapter_number,title,content,status&limit=1');
      const chapter=items?.[0];if(!chapter)throw new Error('Không tìm thấy chương.');
      catalogState.editingChapter=chapter;
      $c('catalogChapterNumber').value=chapter.chapter_number;
      $c('catalogChapterTitle').value=chapter.title||'';
      $c('catalogChapterContent').value=chapter.content||'';
      $c('catalogChapterStatus').value=chapter.status||'draft';
      $c('catalogChapterEditor').classList.remove('hidden');
    }catch(error){showEditMessage(error.message||String(error),'error');}
  }
  async function saveChapter(){
    const row=catalogState.editing,chapter=catalogState.editingChapter;if(!row||!chapter)return;
    const title=$c('catalogChapterTitle').value.trim();
    const content=$c('catalogChapterContent').value.trim();
    const status=$c('catalogChapterStatus').value;
    if(title.length<2)return showEditMessage('Tiêu đề chương quá ngắn.','error');
    if(status==='published'&&content.length<50)return showEditMessage('Chương đã xuất bản cần ít nhất 50 ký tự.','error');
    try{
      $c('catalogSaveChapterBtn').disabled=true;
      await rest('chapters?id=eq.'+encodeURIComponent(chapter.id)+'&book_id=eq.'+encodeURIComponent(row.id),{
        method:'PATCH',
        body:{title,content,status,published_at:status==='published'?(chapter.status==='published'?undefined:new Date().toISOString()):null,updated_at:new Date().toISOString()}
      });
      chapter.title=title;chapter.content=content;chapter.status=status;
      showEditMessage('Đã lưu nội dung chương '+chapter.chapter_number+'.','success');
      await loadChapterPage();
    }catch(error){showEditMessage(error.message||String(error),'error');}
    finally{$c('catalogSaveChapterBtn').disabled=false;}
  }

  function base64ToBlob(base64,mime){
    const binary=atob(base64);
    const chunks=[];
    for(let offset=0;offset<binary.length;offset+=8192){
      const slice=binary.slice(offset,offset+8192);
      const bytes=new Uint8Array(slice.length);
      for(let i=0;i<slice.length;i++)bytes[i]=slice.charCodeAt(i);
      chunks.push(bytes);
    }
    return new Blob(chunks,{type:mime||'image/png'});
  }

  async function normalizeGeneratedCover(blob){
    const targetWidth=1024,targetHeight=1536,targetRatio=targetWidth/targetHeight;
    let source=null,sourceWidth=0,sourceHeight=0,cleanup=()=>{};
    if('createImageBitmap' in window){
      source=await createImageBitmap(blob);
      sourceWidth=source.width;sourceHeight=source.height;
      cleanup=()=>source.close?.();
    }else{
      const url=URL.createObjectURL(blob);
      const image=new Image();
      image.decoding='async';
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Không đọc được ảnh AI.'));image.src=url;});
      source=image;sourceWidth=image.naturalWidth;sourceHeight=image.naturalHeight;
      cleanup=()=>URL.revokeObjectURL(url);
    }
    if(!sourceWidth||!sourceHeight){cleanup();throw new Error('Ảnh AI không có kích thước hợp lệ.');}
    const sourceRatio=sourceWidth/sourceHeight;
    let sx=0,sy=0,sw=sourceWidth,sh=sourceHeight;
    if(sourceRatio>targetRatio){
      sw=Math.round(sourceHeight*targetRatio);
      sx=Math.round((sourceWidth-sw)/2);
    }else if(sourceRatio<targetRatio){
      sh=Math.round(sourceWidth/targetRatio);
      sy=Math.round((sourceHeight-sh)/2);
    }
    const canvas=document.createElement('canvas');
    canvas.width=targetWidth;canvas.height=targetHeight;
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx){cleanup();throw new Error('Trình duyệt không hỗ trợ chuẩn hóa bìa.');}
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';
    ctx.drawImage(source,sx,sy,sw,sh,0,0,targetWidth,targetHeight);
    cleanup();
    const output=await new Promise((resolve,reject)=>canvas.toBlob(
      value=>value?resolve(value):reject(new Error('Không thể xuất bìa 1024×1536.')),
      'image/jpeg',
      0.94
    ));
    return output;
  }
  async function uploadCatalogCover(bookId,blob,mime){
    if(blob.size>12*1024*1024)throw new Error('Ảnh bìa lớn hơn 12 MB.');
    const ext=mime==='image/webp'?'webp':mime==='image/jpeg'?'jpg':'png';
    const path=state.userId+'/'+bookId+'/admin-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'.'+ext;
    const encoded=path.split('/').map(encodeURIComponent).join('/');
    const res=await fetch(SUPABASE_URL+'/storage/v1/object/book-covers/'+encoded,{
      method:'POST',headers:authHeaders({'Content-Type':mime||'image/png','x-upsert':'false'}),body:blob
    });
    if(!res.ok){const body=await res.json().catch(()=>null);throw new Error(body?.message||'Không thể tải bìa lên kho.');}
    const url=SUPABASE_URL+'/storage/v1/object/public/book-covers/'+encoded;
    await rest('books?id=eq.'+encodeURIComponent(bookId),{method:'PATCH',body:{cover_url:url,updated_at:new Date().toISOString()}});
    return url;
  }
  async function generateCover(bookId){
    const settings=aiSettings();persistAiSettings();
    if(!settings.apiKey)throw new Error('Hãy nhập Experiential Labs API key.');
    const response=await fetch(SUPABASE_URL+'/functions/v1/ai-generate-cover',{
      method:'POST',
      headers:authHeaders({'Content-Type':'application/json'}),
      body:JSON.stringify({
        bookId,
        imageProvider:'experiential',
        imageApiKey:settings.apiKey,
        imageModel:settings.imageModel,
        promptProvider:settings.promptModel?'experiential':'none',
        promptApiKey:settings.apiKey,
        promptModel:settings.promptModel
      })
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.detail||data.error||'AI không tạo được bìa.');
    if(!data.imageBase64)throw new Error('AI không trả về ảnh.');
    const rawBlob=base64ToBlob(data.imageBase64,data.mimeType||'image/png');
    const coverBlob=await normalizeGeneratedCover(rawBlob);
    return uploadCatalogCover(bookId,coverBlob,'image/jpeg');
  }
  async function generateSingleCover(){
    const row=catalogState.editing;if(!row||catalogState.coverBusy)return;
    try{
      catalogState.coverBusy=true;$c('catalogAiCoverBtn').disabled=true;
      showEditMessage('AI đang đọc tên truyện và tạo bìa 2:3 1024×1536…','info');
      const url=await generateCover(row.id);
      row.cover_url=url;renderEditCover(url);
      showEditMessage('Đã tạo và gắn bìa AI cho truyện.','success');
      await loadCatalog(false);
    }catch(error){showEditMessage(error.message||String(error),'error');}
    finally{catalogState.coverBusy=false;$c('catalogAiCoverBtn').disabled=false;}
  }
  async function manualCover(file){
    const row=catalogState.editing;if(!row||!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))return showEditMessage('Chỉ nhận JPG / PNG / WebP.','error');
    try{
      showEditMessage('Đang tải bìa…','info');
      const url=await uploadCatalogCover(row.id,file,file.type);
      row.cover_url=url;renderEditCover(url);
      showEditMessage('Đã cập nhật bìa.','success');
      await loadCatalog(false);
    }catch(error){showEditMessage(error.message||String(error),'error');}
  }

  async function bulkGenerateCovers(){
    const ids=[...catalogState.selected];if(!ids.length)return;
    const settings=aiSettings();persistAiSettings();
    if(!settings.apiKey)return showCatalogMessage('Hãy nhập Experiential Labs API key trước.','error');
    $c('catalogBulkCoverBtn').disabled=true;
    let done=0,success=0,skipped=0,failed=0;
    for(const id of ids){
      try{
        const rows=await rest('books?id=eq.'+encodeURIComponent(id)+'&select=cover_url&limit=1');
        if(rows?.[0]?.cover_url&&!settings.overwrite){skipped++;done++;setCatalogProgress(done,ids.length,'Bỏ qua bìa đã có · '+done+'/'+ids.length);continue;}
        setCatalogProgress(done,ids.length,'Đang tạo bìa AI '+(done+1)+'/'+ids.length);
        await generateCover(id);success++;
      }catch(error){failed++;showCatalogMessage('Có lỗi khi tạo bìa: '+(error.message||String(error)),'warn');}
      done++;setCatalogProgress(done,ids.length,'Đã xử lý bìa '+done+'/'+ids.length);
    }
    showCatalogMessage('Tạo bìa xong · '+success+' thành công · '+skipped+' bỏ qua · '+failed+' lỗi.',failed?'warn':'success');
    $c('catalogBulkCoverBtn').disabled=false;
    await loadCatalog(false);
  }

  function openBulkEdit(){
    if(!catalogState.selected.size)return;
    $c('catalogBulkEditModal').classList.remove('hidden');
    showBulkEditMessage('');
  }
  function closeBulkEdit(){$c('catalogBulkEditModal').classList.add('hidden');}
  async function applyBulkEdit(){
    const ids=[...catalogState.selected];
    const setAuthor=$c('bulkEditSetAuthor').checked,setGenre=$c('bulkEditSetGenre').checked,setStatus=$c('bulkEditSetStatus').checked;
    if(!setAuthor&&!setGenre&&!setStatus)return showBulkEditMessage('Hãy chọn ít nhất một mục cần thay đổi.','error');
    try{
      $c('catalogApplyBulkEditBtn').disabled=true;
      const result=await rest('rpc/admin_bulk_edit_books',{
        method:'POST',
        body:{
          p_book_ids:ids,
          p_set_author:setAuthor,p_author:$c('bulkEditAuthor').value.trim()||'Chuong',
          p_set_genre:setGenre,p_genre:$c('bulkEditGenre').value,
          p_set_status:setStatus,p_status:$c('bulkEditStatus').value
        }
      });
      const ok=(result||[]).filter(x=>x.success).length,fail=(result||[]).length-ok;
      showBulkEditMessage('Đã cập nhật '+ok+' truyện'+(fail?' · '+fail+' truyện bị bỏ qua.':''),fail?'warn':'success');
      catalogState.selected.clear();updateSelectionUi();await loadCatalog(false);
    }catch(error){showBulkEditMessage(error.message||String(error),'error');}
    finally{$c('catalogApplyBulkEditBtn').disabled=false;}
  }

  async function deleteBooks(ids,fromEditor=false){
    if(!ids.length)return;
    const phrase='XOA '+ids.length;
    const typed=prompt('Xóa vĩnh viễn '+ids.length+' truyện chưa có lịch sử giao dịch.\nTruyện đã có doanh thu/giao dịch sẽ được hệ thống từ chối xóa.\n\nNhập "'+phrase+'" để xác nhận:');
    if(typed!==phrase)return;
    try{
      const result=await rest('rpc/admin_delete_books',{method:'POST',body:{p_book_ids:ids}});
      const deleted=(result||[]).filter(x=>x.deleted).length;
      const blocked=(result||[]).filter(x=>!x.deleted);
      if(fromEditor&&deleted)closeBook();
      ids.forEach(id=>catalogState.selected.delete(id));
      updateSelectionUi();
      await loadCatalog(false);
      const detail=blocked.length?' · '+blocked.length+' truyện được giữ lại do có lịch sử giao dịch.':'';
      showCatalogMessage('Đã xóa '+deleted+' truyện'+detail,blocked.length?'warn':'success');
    }catch(error){
      (fromEditor?showEditMessage:showCatalogMessage)(error.message||String(error),'error');
    }
  }

  function debounce(fn,wait=350){let timer;return (...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),wait);};}
  const reloadDebounced=debounce(()=>loadCatalog(true));

  restoreAiSettings();
  $c('coverPromptProvider')?.addEventListener('change',()=>{applyPromptMode();persistAiSettings();setApiCheckStatus('neutral','Cấu hình đã thay đổi · hãy kiểm tra lại API');});
  ['coverAiKey','coverAiModel','coverPromptModel'].forEach(id=>$c(id)?.addEventListener('input',()=>{persistAiSettings();setApiCheckStatus('neutral','Cấu hình đã thay đổi · hãy kiểm tra lại API');}));
  $c('coverCheckApiBtn')?.addEventListener('click',()=>void checkExperientialApi());
  $c('catalogRefreshBtn')?.addEventListener('click',()=>loadCatalog(true));
  $c('catalogResetFilters')?.addEventListener('click',()=>{
    $c('catalogSearch').value='';$c('catalogAuthorFilter').value='';$c('catalogGenreFilter').value='';$c('catalogStatusFilter').value='';
    $c('catalogCoverFilter').value='';$c('catalogMinViews').value='';$c('catalogMaxViews').value='';$c('catalogSort').value='views_desc';
    catalogState.selected.clear();loadCatalog(true);
  });
  $c('catalogSearch')?.addEventListener('input',reloadDebounced);
  $c('catalogAuthorFilter')?.addEventListener('input',reloadDebounced);
  $c('catalogMinViews')?.addEventListener('input',reloadDebounced);
  $c('catalogMaxViews')?.addEventListener('input',reloadDebounced);
  ['catalogGenreFilter','catalogStatusFilter','catalogCoverFilter','catalogSort'].forEach(id=>$c(id)?.addEventListener('change',()=>{catalogState.selected.clear();loadCatalog(true);}));
  $c('catalogPrevPage')?.addEventListener('click',()=>{if(catalogState.page>1){catalogState.page--;loadCatalog(false);}});
  $c('catalogNextPage')?.addEventListener('click',()=>{catalogState.page++;loadCatalog(false);});
  $c('catalogSelectPageBtn')?.addEventListener('click',()=>{catalogState.rows.forEach(r=>catalogState.selected.add(r.id));renderCatalog();});
  $c('catalogSelectAllBtn')?.addEventListener('click',()=>void selectAllFiltered());
  $c('catalogClearSelectionBtn')?.addEventListener('click',()=>{catalogState.selected.clear();renderCatalog();});
  $c('catalogBulkEditBtn')?.addEventListener('click',openBulkEdit);
  $c('catalogBulkCoverBtn')?.addEventListener('click',()=>void bulkGenerateCovers());
  $c('catalogBulkDeleteBtn')?.addEventListener('click',()=>void deleteBooks([...catalogState.selected],false));
  $c('catalogRows')?.addEventListener('change',event=>{
    const id=event.target.dataset.catalogSelect;if(!id)return;
    if(event.target.checked)catalogState.selected.add(id);else catalogState.selected.delete(id);
    updateSelectionUi();
  });
  $c('catalogRows')?.addEventListener('click',event=>{
    const id=event.target.closest?.('[data-catalog-edit]')?.dataset.catalogEdit;
    if(!id)return;
    const row=catalogState.rows.find(item=>item.id===id);if(row)openBook(row);
  });
  document.querySelectorAll('[data-close-catalog-modal]').forEach(el=>el.addEventListener('click',closeBook));
  document.querySelectorAll('[data-close-bulk-edit]').forEach(el=>el.addEventListener('click',closeBulkEdit));
  $c('catalogSaveBookBtn')?.addEventListener('click',()=>void saveBook());
  $c('catalogDeleteBookBtn')?.addEventListener('click',()=>catalogState.editing&&void deleteBooks([catalogState.editing.id],true));
  $c('catalogAiCoverBtn')?.addEventListener('click',()=>void generateSingleCover());
  $c('catalogManualCover')?.addEventListener('change',event=>{const file=event.target.files?.[0];if(file)void manualCover(file);event.target.value='';});
  $c('catalogChapterPrev')?.addEventListener('click',()=>{if(catalogState.chapterPage>1){catalogState.chapterPage--;void loadChapterPage();}});
  $c('catalogChapterNext')?.addEventListener('click',()=>{catalogState.chapterPage++;void loadChapterPage();});
  $c('catalogChapterList')?.addEventListener('click',event=>{const id=event.target.closest?.('[data-edit-chapter]')?.dataset.editChapter;if(id)void openChapter(id);});
  $c('catalogSaveChapterBtn')?.addEventListener('click',()=>void saveChapter());
  $c('catalogApplyBulkEditBtn')?.addEventListener('click',()=>void applyBulkEdit());
})();
