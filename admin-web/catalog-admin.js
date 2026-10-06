
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
  const IMAGE_PRESETS={
    openai:{label:'OpenAI',baseUrl:'https://api.openai.com/v1',model:'gpt-image-2',hint:'OpenAI Images · bìa dọc 1024×1536, phù hợp tạo ảnh thương mại.'},
    gemini:{label:'Gemini',baseUrl:'https://generativelanguage.googleapis.com/v1beta',model:'gemini-3.1-flash-image',hint:'Google Gemini / Nano Banana · sinh ảnh trực tiếp, tỷ lệ 2:3, kích thước 1K.'},
    xai:{label:'xAI',baseUrl:'https://api.x.ai/v1',model:'grok-imagine-image-2.0',hint:'xAI Grok Imagine · tỷ lệ 2:3, độ phân giải 1K.'},
    custom:{label:'Custom',baseUrl:'',model:'',hint:'Nhà cung cấp OpenAI-compatible khác · tự nhập Base URL và model.'}
  };
  const PROMPT_PRESETS={
    none:{label:'OFF',baseUrl:'',model:'',hint:'Không dùng AI trung gian · hệ thống tự tạo prompt từ tên truyện + thể loại + mô tả.'},
    deepseek:{label:'DeepSeek',baseUrl:'https://api.deepseek.com',model:'deepseek-flash',hint:'DeepSeek chỉ viết/tối ưu prompt; ảnh vẫn do AI tạo ảnh ở cột bên trái sinh ra.'},
    gemini:{label:'Gemini',baseUrl:'https://generativelanguage.googleapis.com/v1beta',model:'gemini-3.1-flash',hint:'Gemini đọc tên, thể loại và mô tả rồi viết prompt bìa chi tiết trước khi tạo ảnh.'},
    xai:{label:'xAI',baseUrl:'https://api.x.ai/v1',model:'grok-4.7',hint:'Grok viết prompt hình ảnh chi tiết; Grok Imagine hoặc provider khác sẽ sinh ảnh.'},
    openai:{label:'OpenAI',baseUrl:'https://api.openai.com/v1',model:'gpt-6-luna',hint:'OpenAI tối ưu prompt trước khi chuyển sang model tạo ảnh.'},
    custom:{label:'Custom',baseUrl:'',model:'',hint:'AI viết prompt theo chuẩn OpenAI Chat Completions · tự nhập Base URL và model.'}
  };

  function esc(value){
    return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  }
  function showCatalogMessage(text,type='info'){
    const box=$c('catalogMessage');if(!box)return;
    box.textContent=text;box.className='message '+type;
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
    return {
      imageProvider:$c('coverImageProvider').value||'openai',
      imageApiKey:$c('coverAiKey').value.trim(),
      imageBaseUrl:$c('coverAiBaseUrl').value.trim(),
      imageModel:$c('coverAiModel').value.trim(),
      promptProvider:$c('coverPromptProvider').value||'none',
      promptApiKey:$c('coverPromptKey').value.trim(),
      promptBaseUrl:$c('coverPromptBaseUrl').value.trim(),
      promptModel:$c('coverPromptModel').value.trim(),
      extraPrompt:'',
      overwrite:$c('coverAiOverwrite').checked
    };
  }
  function providerClass(provider){
    return 'provider-badge provider-'+String(provider||'none').replace(/[^a-z0-9_-]/gi,'');
  }
  function applyImageProvider(provider,applyPreset=true){
    const preset=IMAGE_PRESETS[provider]||IMAGE_PRESETS.openai;
    $c('coverImageProvider').value=provider;
    if(applyPreset){
      $c('coverAiBaseUrl').value=preset.baseUrl;
      $c('coverAiModel').value=preset.model;
    }
    const badge=$c('coverImageProviderBadge');
    badge.textContent=preset.label;
    badge.className=providerClass(provider);
    $c('coverImageProviderHint').textContent=preset.hint;
  }
  function applyPromptProvider(provider,applyPreset=true){
    const preset=PROMPT_PRESETS[provider]||PROMPT_PRESETS.none;
    $c('coverPromptProvider').value=provider;
    if(applyPreset){
      $c('coverPromptBaseUrl').value=preset.baseUrl;
      $c('coverPromptModel').value=preset.model;
    }
    const disabled=provider==='none';
    $c('coverPromptFields').classList.toggle('is-disabled',disabled);
    for(const input of $c('coverPromptFields').querySelectorAll('input'))input.disabled=disabled;
    const badge=$c('coverPromptProviderBadge');
    badge.textContent=preset.label;
    badge.className=providerClass(provider);
    $c('coverPromptProviderHint').textContent=preset.hint;
  }
  function persistAiSettings(){
    const settings=aiSettings();
    sessionStorage.setItem('chuong_cover_image_provider',settings.imageProvider);
    sessionStorage.setItem('chuong_cover_image_base_url',settings.imageBaseUrl);
    sessionStorage.setItem('chuong_cover_image_model',settings.imageModel);
    sessionStorage.setItem('chuong_cover_prompt_provider',settings.promptProvider);
    sessionStorage.setItem('chuong_cover_prompt_base_url',settings.promptBaseUrl);
    sessionStorage.setItem('chuong_cover_prompt_model',settings.promptModel);
    sessionStorage.removeItem('chuong_cover_ai_extra');
    if(settings.imageApiKey)sessionStorage.setItem('chuong_cover_image_key',settings.imageApiKey);
    else sessionStorage.removeItem('chuong_cover_image_key');
    if(settings.promptApiKey)sessionStorage.setItem('chuong_cover_prompt_key',settings.promptApiKey);
    else sessionStorage.removeItem('chuong_cover_prompt_key');
  }
  function restoreAiSettings(){
    const imageProvider=sessionStorage.getItem('chuong_cover_image_provider')||'openai';
    const promptProvider=sessionStorage.getItem('chuong_cover_prompt_provider')||'none';
    applyImageProvider(imageProvider,false);
    applyPromptProvider(promptProvider,false);
    $c('coverAiKey').value=sessionStorage.getItem('chuong_cover_image_key')||sessionStorage.getItem('chuong_cover_ai_key')||'';
    $c('coverAiBaseUrl').value=sessionStorage.getItem('chuong_cover_image_base_url')||IMAGE_PRESETS[imageProvider]?.baseUrl||'';
    $c('coverAiModel').value=sessionStorage.getItem('chuong_cover_image_model')||IMAGE_PRESETS[imageProvider]?.model||'';
    $c('coverPromptKey').value=sessionStorage.getItem('chuong_cover_prompt_key')||'';
    $c('coverPromptBaseUrl').value=sessionStorage.getItem('chuong_cover_prompt_base_url')||PROMPT_PRESETS[promptProvider]?.baseUrl||'';
    $c('coverPromptModel').value=sessionStorage.getItem('chuong_cover_prompt_model')||PROMPT_PRESETS[promptProvider]?.model||'';
    applyImageProvider(imageProvider,false);
    applyPromptProvider(promptProvider,false);
  }

  async function loadCatalog(resetPage=false){
    if(catalogState.loading||!state?.token)return;
    if(resetPage)catalogState.page=1;
    catalogState.loading=true;
    $c('catalogRows').innerHTML='<tr><td colspan="10" class="bulk-empty">Đang tải kho truyện…</td></tr>';
    try{
      const body={
        p_query:$c('catalogSearch').value.trim()||null,
        p_author:$c('catalogAuthorFilter').value.trim()||null,
        p_genre:$c('catalogGenreFilter').value||null,
        p_status:$c('catalogStatusFilter').value||null,
        p_sort:$c('catalogSort').value||'views_desc',
        p_min_views:$c('catalogMinViews').value===''?null:Math.max(0,Number($c('catalogMinViews').value)||0),
        p_max_views:$c('catalogMaxViews').value===''?null:Math.max(0,Number($c('catalogMaxViews').value)||0),
        p_limit:PAGE_SIZE,
        p_offset:(catalogState.page-1)*PAGE_SIZE
      };
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
    if(!settings.imageApiKey)throw new Error('Hãy nhập API key cho AI tạo ảnh.');
    if(settings.promptProvider!=='none'&&!settings.promptApiKey)throw new Error('Hãy nhập API key cho AI viết prompt hoặc chọn “Không dùng”.');
    const response=await fetch(SUPABASE_URL+'/functions/v1/ai-generate-cover',{
      method:'POST',
      headers:authHeaders({'Content-Type':'application/json'}),
      body:JSON.stringify({
        bookId,
        imageProvider:settings.imageProvider,imageApiKey:settings.imageApiKey,imageBaseUrl:settings.imageBaseUrl,imageModel:settings.imageModel,
        promptProvider:settings.promptProvider,promptApiKey:settings.promptApiKey,promptBaseUrl:settings.promptBaseUrl,promptModel:settings.promptModel
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
    if(!settings.imageApiKey)return showCatalogMessage('Hãy nhập API key cho AI tạo ảnh trước.','error');
    if(settings.promptProvider!=='none'&&!settings.promptApiKey)return showCatalogMessage('AI viết prompt đang bật nhưng chưa có API key.','error');
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
  $c('coverImageProvider')?.addEventListener('change',event=>{applyImageProvider(event.target.value,true);persistAiSettings();});
  $c('coverPromptProvider')?.addEventListener('change',event=>{applyPromptProvider(event.target.value,true);persistAiSettings();});
  ['coverAiKey','coverAiBaseUrl','coverAiModel','coverPromptKey','coverPromptBaseUrl','coverPromptModel'].forEach(id=>$c(id)?.addEventListener('change',persistAiSettings));
  $c('catalogRefreshBtn')?.addEventListener('click',()=>loadCatalog(true));
  $c('catalogResetFilters')?.addEventListener('click',()=>{
    $c('catalogSearch').value='';$c('catalogAuthorFilter').value='';$c('catalogGenreFilter').value='';$c('catalogStatusFilter').value='';
    $c('catalogMinViews').value='';$c('catalogMaxViews').value='';$c('catalogSort').value='views_desc';loadCatalog(true);
  });
  $c('catalogSearch')?.addEventListener('input',reloadDebounced);
  $c('catalogAuthorFilter')?.addEventListener('input',reloadDebounced);
  $c('catalogMinViews')?.addEventListener('input',reloadDebounced);
  $c('catalogMaxViews')?.addEventListener('input',reloadDebounced);
  ['catalogGenreFilter','catalogStatusFilter','catalogSort'].forEach(id=>$c(id)?.addEventListener('change',()=>loadCatalog(true)));
  $c('catalogPrevPage')?.addEventListener('click',()=>{if(catalogState.page>1){catalogState.page--;loadCatalog(false);}});
  $c('catalogNextPage')?.addEventListener('click',()=>{catalogState.page++;loadCatalog(false);});
  $c('catalogSelectPageBtn')?.addEventListener('click',()=>{catalogState.rows.forEach(r=>catalogState.selected.add(r.id));renderCatalog();});
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
