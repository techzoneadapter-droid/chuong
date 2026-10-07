
(() => {
  const PAGE_SIZE=100;
  const CHAPTER_PAGE_SIZE=50;
  const GENRES=['Xuyên không','Trọng sinh','Hệ thống','Tiên hiệp','Huyền huyễn','Mạt thế','Đam mỹ','Ngôn tình','Cổ đại','Cung đấu','Đô thị','Giới giải trí','Huyền học','Trinh thám','Kinh dị','Khoa huyễn','Esports','Kiếm hiệp','Fantasy','Điền văn','Vô hạn lưu','Niên đại','Văn học','Khác'];
  const $c=(id)=>document.getElementById(id);
  const catalogState={
    loaded:false,loading:false,page:1,total:0,rows:[],selected:new Set(),
    editing:null,chapterPage:1,chapterTotal:0,chapterRows:[],editingChapter:null,
    coverBusy:false,
    coverModelTest:{provider:null,model:null,ok:false},
    cleanupPreview:{ids:[],items:[]}
  };
  const EXPERIENTIAL_IMAGE_DEFAULT='gemini-2.5-flash-image';
  const EXPERIENTIAL_PROMPT_DEFAULT='deepseek-v4-flash';
  const OPENAI_IMAGE_DEFAULT='gpt-image-2.5-sunburst';
  const OPENAI_IMAGE_MODELS=[
    {id:'gpt-image-2.5-sunburst',name:'GPT Image 2.5 Sunburst · đẹp nhất'},
    {id:'gpt-image-2.5-flare',name:'GPT Image 2.5 Flare · nhanh, chất lượng cao'},
    {id:'gpt-image-2',name:'GPT Image 2'}
  ];

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
  function populateImageModels(models,preferred,provider){
    const select=$c('coverAiModel');if(!select)return;
    const rows=Array.isArray(models)?models.filter(item=>item&&item.id):[];
    const fallback=provider==='openai'?OPENAI_IMAGE_DEFAULT:EXPERIENTIAL_IMAGE_DEFAULT;
    const current=preferred||select.value||fallback;
    select.innerHTML='';
    const source=rows.length?rows:(provider==='openai'?OPENAI_IMAGE_MODELS:[]);
    if(!source.length){
      const option=document.createElement('option');
      option.value=current;option.textContent=current;
      select.appendChild(option);
      $c('coverImageModelHint').textContent='Không đọc được danh sách model ảnh. Bạn vẫn có thể thử model đang chọn.';
      return;
    }
    for(const item of source){
      const option=document.createElement('option');
      option.value=item.id;
      option.textContent=item.name&&item.name!==item.id?item.name+' · '+item.id:item.id;
      select.appendChild(option);
    }
    const found=source.some(item=>item.id===current);
    if(found)select.value=current;
    else if(source.some(item=>item.id===fallback))select.value=fallback;
    else select.selectedIndex=0;
    $c('coverImageModelHint').textContent=provider==='openai'
      ?'OpenAI đã sẵn sàng. Sunburst ưu tiên chất lượng; Flare nhanh hơn cho batch lớn.'
      :'Đã tải '+source.length.toLocaleString('vi-VN')+' model tạo ảnh khả dụng. Chọn model rồi bấm tạo bìa.';
    persistAiSettings();
  }

  function providerLabel(provider){
    return provider==='openai'?'OpenAI':'Experiential Labs';
  }

  function applyImageProviderMode(loadStored=true){
    const provider=$c('coverImageProvider')?.value||'experiential';
    const isOpenAI=provider==='openai';
    const providerTitle=$c('coverImageProviderTitle');
    const providerSubtitle=$c('coverImageProviderSubtitle');
    const keyLabel=$c('coverApiKeyLabel');
    const key=$c('coverAiKey');
    if(providerTitle)providerTitle.textContent='AI tạo ảnh · '+providerLabel(provider);
    if(providerSubtitle)providerSubtitle.textContent=isOpenAI
      ?'Dùng OpenAI API key trực tiếp; key chỉ lưu trong phiên trình duyệt.'
      :'Dùng API key mua tại platform.experientiallabs.ai';
    if(keyLabel)keyLabel.textContent=isOpenAI?'OpenAI API key':'Experiential API key';
    if(key)key.placeholder=isOpenAI?'sk-...':'xpl_...';
    $c('coverImageQualityField')?.classList.toggle('hidden',!isOpenAI);
    $c('coverBuyCreditsLink')?.classList.toggle('hidden',true);

    if(loadStored&&key){
      key.value=sessionStorage.getItem(isOpenAI?'chuong_openai_api_key':'chuong_explabs_api_key')||'';
    }

    const storedModel=sessionStorage.getItem(isOpenAI?'chuong_openai_image_model':'chuong_explabs_image_model')||(isOpenAI?OPENAI_IMAGE_DEFAULT:EXPERIENTIAL_IMAGE_DEFAULT);
    if(isOpenAI){
      populateImageModels(OPENAI_IMAGE_MODELS,storedModel,'openai');
    }else{
      const current=storedModel==='gemini-3.1-flash-lite-image'?EXPERIENTIAL_IMAGE_DEFAULT:storedModel;
      populateImageModels([],current,'experiential');
    }

    const promptSelect=$c('coverPromptProvider');
    if(promptSelect&&promptSelect.value!=='none'&&promptSelect.value!==provider){
      promptSelect.value=provider;
    }
    catalogState.coverModelTest={provider:null,model:null,ok:false};
    sessionStorage.removeItem('chuong_cover_tested_model');
    sessionStorage.removeItem('chuong_cover_tested_provider');
    applyPromptMode();
    updateSelectionUi();
  }


  function renderModelDiagnostic(data){
    const box=$c('coverModelDiagnostic');if(!box)return;
    const creditsLink=$c('coverBuyCreditsLink');
    creditsLink?.classList.add('hidden');
    box.classList.remove('hidden');
    if(!data){
      box.innerHTML='<strong>Không có dữ liệu chẩn đoán.</strong>';return;
    }

    const code=String(data.error?.code||'');
    const message=String(data.error?.message||'');
    const purchaseLocked=code==='insufficient_quota'||/model_requires_purchase|locked on your account|buy credits/i.test(message);

    if(purchaseLocked){
      catalogState.coverModelTest={provider:$c('coverImageProvider')?.value||'experiential',model:data.imageModel||$c('coverAiModel').value,ok:false};
      sessionStorage.removeItem('chuong_cover_tested_model');
      sessionStorage.removeItem('chuong_cover_tested_provider');
      box.className='model-diagnostic bad quota-lock';
      box.innerHTML=[
        '<div class="diag-head"><strong>CHƯA ĐƯỢC MỞ QUYỀN TẠO ẢNH</strong><span>'+esc(String(data.httpStatus||429))+'</span></div>',
        '<div class="quota-title">API key đúng, nhưng tài khoản '+esc(providerLabel($c('coverImageProvider')?.value||'experiential'))+' chưa có quota/credits để dùng model này.</div>',
        '<div class="diag-grid">',
        '<span>Model</span><b>'+esc(data.imageModel||'—')+'</b>',
        '<span>Error</span><b>'+esc(code||'insufficient_quota')+'</b>',
        '<span>Trạng thái</span><b>Cần mua credits</b>',
        '</div>',
        '<div class="diag-message">'+(($c('coverImageProvider')?.value||'experiential')==='openai'?'Kiểm tra Billing/Usage của OpenAI rồi bấm Test model ảnh lại.':'Khoản xác minh thẻ $1 không mở khóa model. Bạn cần mua credits thật trên Experiential, sau đó bấm Test model ảnh lại.')+'</div>'
      ].join('');
      creditsLink?.classList.remove('hidden');
      updateSelectionUi();
      return;
    }

    const status=data.ok?'PASS':'FAIL';
    catalogState.coverModelTest={provider:$c('coverImageProvider')?.value||'experiential',model:data.imageModel||$c('coverAiModel').value,ok:Boolean(data.ok)};
    if(data.ok){
      sessionStorage.setItem('chuong_cover_tested_model',catalogState.coverModelTest.model||'');
      sessionStorage.setItem('chuong_cover_tested_provider',catalogState.coverModelTest.provider||'');
    }else{
      sessionStorage.removeItem('chuong_cover_tested_model');
      sessionStorage.removeItem('chuong_cover_tested_provider');
    }
    const bits=[
      '<div class="diag-head"><strong>'+status+' · '+esc(data.imageModel||'')+'</strong><span>'+esc(String(data.httpStatus||''))+'</span></div>',
      '<div class="diag-grid">',
      '<span>Stage</span><b>'+esc(data.stage||'—')+'</b>',
      '<span>Error code</span><b>'+esc(code||'—')+'</b>',
      '<span>Provider</span><b>'+esc(data.provider||data.gatewayProvider||providerLabel($c('coverImageProvider')?.value||'experiential'))+'</b>',
      '<span>Route depth</span><b>'+esc(data.routeDepth||'—')+'</b>',
      '<span>Request ID</span><b class="diag-request">'+esc(data.requestId||'—')+'</b>',
      '</div>'
    ];
    if(message)bits.push('<div class="diag-message">'+esc(message)+'</div>');
    if(data.contentPreview)bits.push('<div class="diag-message">Response text: '+esc(data.contentPreview)+'</div>');
    if(data.imagePayloadFound===false&&data.httpStatus===200)bits.push('<div class="diag-message">Gateway trả 200 nhưng không có payload ảnh.</div>');
    box.innerHTML=bits.join('');
    box.classList.toggle('ok',Boolean(data.ok));
    box.classList.toggle('bad',!data.ok);
    updateSelectionUi();
  }

  async function diagnoseImageModel(){
    const settings=aiSettings();persistAiSettings();
    if(!settings.apiKey){
      setApiCheckStatus('bad','Chưa nhập '+providerLabel(settings.imageProvider)+' API key');
      return false;
    }
    const button=$c('coverDiagnoseModelBtn');
    button.disabled=true;button.textContent='Đang test...';
    const box=$c('coverModelDiagnostic');
    box.classList.remove('hidden');box.className='model-diagnostic';
    box.textContent='Đang gửi đúng 1 request thử nghiệm tới '+providerLabel(settings.imageProvider)+' · '+settings.imageModel+'...';
    try{
      const response=await window.chuongAuthFetch(SUPABASE_URL+'/functions/v1/ai-generate-cover',{
        method:'POST',
        headers:authHeaders({'Content-Type':'application/json'}),
        body:JSON.stringify({
          action:'diagnose',
          imageProvider:settings.imageProvider,
          imageApiKey:settings.apiKey,
          imageModel:settings.imageModel,
          imageQuality:settings.imageQuality
        })
      });
      const data=await response.json().catch(()=>({ok:false,stage:'invalid_json',error:{code:'invalid_json',message:'Không đọc được phản hồi chẩn đoán.'}}));
      renderModelDiagnostic({...data,provider:data.provider||providerLabel(settings.imageProvider)});
      if(data.ok)setApiCheckStatus('ok',providerLabel(settings.imageProvider)+' · model tạo ảnh chạy được thực tế · có thể chạy batch.');
      else if(String(data.error?.code||'')==='insufficient_quota'||/model_requires_purchase|buy credits|billing|quota/i.test(String(data.error?.message||'')))setApiCheckStatus('bad','API key hợp lệ nhưng tài khoản chưa có quota/credits cho model này.');
      else setApiCheckStatus('bad','Model test thất bại · xem chẩn đoán bên dưới.');
      return Boolean(data.ok);
    }catch(error){
      renderModelDiagnostic({ok:false,provider:providerLabel(settings.imageProvider),stage:'browser',imageModel:settings.imageModel,error:{code:'browser_error',message:error.message||String(error)}});
      return false;
    }finally{
      button.disabled=false;button.textContent='Test model ảnh';
    }
  }

  async function checkImageApi(){
    const settings=aiSettings();
    persistAiSettings();
    if(!settings.apiKey){
      setApiCheckStatus('bad','Chưa nhập '+providerLabel(settings.imageProvider)+' API key');
      return;
    }
    const button=$c('coverCheckApiBtn');
    button.disabled=true;
    button.textContent='Đang kiểm tra...';
    setApiCheckStatus('checking','Đang xác thực '+providerLabel(settings.imageProvider)+' API key và kiểm tra model...');
    try{
      const response=await window.chuongAuthFetch(SUPABASE_URL+'/functions/v1/ai-generate-cover',{
        method:'POST',
        headers:authHeaders({'Content-Type':'application/json'}),
        body:JSON.stringify({
          action:'check',
          imageProvider:settings.imageProvider,
          imageApiKey:settings.apiKey,
          imageModel:settings.imageModel,
          promptModel:settings.promptModel
        })
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok){
        const detail=String(data.detail||data.error||'API key không hợp lệ.');
        if(/invalid_api_key|incorrect api key|invalid key|expired|revoked/i.test(detail)){
          throw new Error('API key không hợp lệ, đã hết hạn hoặc bị thu hồi. Hãy tạo key mới rồi thử lại.');
        }
        throw new Error(detail);
      }
      populateImageModels(data.imageModels,settings.imageModel,settings.imageProvider);
      const parts=[providerLabel(settings.imageProvider)+' API key hợp lệ'];
      if(Number.isFinite(Number(data.modelCount)))parts.push(Number(data.modelCount).toLocaleString('vi-VN')+' model truy cập được');
      if(Array.isArray(data.imageModels))parts.push(data.imageModels.length.toLocaleString('vi-VN')+' model tạo ảnh');
      if(data.imageModelAvailable===false&&data.imageModels?.length)parts.push('đã tự chọn model ảnh khả dụng');
      else if(data.imageModelAvailable===true)parts.push('model có quyền truy cập · cần Test model ảnh');
      setApiCheckStatus(data.imageModels?.length?'ok':'warn',parts.join(' · '));
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
    const imageProvider=$c('coverImageProvider')?.value||'experiential';
    const promptProvider=$c('coverPromptProvider')?.value||'none';
    const fallback=imageProvider==='openai'?OPENAI_IMAGE_DEFAULT:EXPERIENTIAL_IMAGE_DEFAULT;
    const promptFallback=promptProvider==='openai'?'gpt-6-luna':EXPERIENTIAL_PROMPT_DEFAULT;
    return {
      imageProvider,
      apiKey:$c('coverAiKey').value.trim(),
      imageModel:$c('coverAiModel').value.trim()||fallback,
      imageQuality:imageProvider==='openai'?($c('coverImageQuality')?.value||'high'):'auto',
      promptProvider,
      promptModel:promptProvider!=='none'?($c('coverPromptModel').value.trim()||promptFallback):'',
      overwrite:$c('coverAiOverwrite').checked
    };
  }

  function applyPromptMode(){
    const provider=$c('coverPromptProvider').value||'none';
    const enabled=provider!=='none';
    $c('coverPromptFields').classList.toggle('is-disabled',!enabled);
    for(const input of $c('coverPromptFields').querySelectorAll('input'))input.disabled=!enabled;
    if(enabled){
      const sameProvider=$c('coverImageProvider')?.value||'experiential';
      if(provider!==sameProvider)$c('coverPromptProvider').value=sameProvider;
      const finalProvider=$c('coverPromptProvider').value;
      const input=$c('coverPromptModel');
      if(finalProvider==='openai'&&(!input.value.trim()||input.value===EXPERIENTIAL_PROMPT_DEFAULT))input.value='gpt-6-luna';
      if(finalProvider==='experiential'&&(!input.value.trim()||input.value==='gpt-6-luna'))input.value=EXPERIENTIAL_PROMPT_DEFAULT;
      $c('coverPromptProviderHint').textContent='Dùng chung '+providerLabel(finalProvider)+' API key ở bên trái để tối ưu prompt trước khi tạo bìa.';
    }else{
      $c('coverPromptProviderHint').textContent='Không dùng AI trung gian · prompt khóa cứng từ tên truyện + thể loại.';
    }
  }

  function persistAiSettings(){
    const settings=aiSettings();
    sessionStorage.setItem('chuong_cover_image_provider',settings.imageProvider);
    sessionStorage.setItem(settings.imageProvider==='openai'?'chuong_openai_image_model':'chuong_explabs_image_model',settings.imageModel);
    sessionStorage.setItem('chuong_openai_image_quality',$c('coverImageQuality')?.value||'high');
    sessionStorage.setItem('chuong_cover_prompt_mode',$c('coverPromptProvider').value);
    sessionStorage.setItem('chuong_cover_prompt_model',$c('coverPromptModel').value.trim());
    const keyName=settings.imageProvider==='openai'?'chuong_openai_api_key':'chuong_explabs_api_key';
    if(settings.apiKey)sessionStorage.setItem(keyName,settings.apiKey);
    else sessionStorage.removeItem(keyName);
  }

  function restoreAiSettings(){
    const provider=sessionStorage.getItem('chuong_cover_image_provider')||'experiential';
    if($c('coverImageProvider'))$c('coverImageProvider').value=provider==='openai'?'openai':'experiential';
    if($c('coverImageQuality'))$c('coverImageQuality').value=sessionStorage.getItem('chuong_openai_image_quality')||'high';
    $c('coverPromptProvider').value=sessionStorage.getItem('chuong_cover_prompt_mode')||sessionStorage.getItem('chuong_explabs_prompt_mode')||'none';
    $c('coverPromptModel').value=sessionStorage.getItem('chuong_cover_prompt_model')||sessionStorage.getItem('chuong_explabs_prompt_model')||EXPERIENTIAL_PROMPT_DEFAULT;
    applyImageProviderMode(true);
    const testedModel=sessionStorage.getItem('chuong_cover_tested_model')||'';
    const testedProvider=sessionStorage.getItem('chuong_cover_tested_provider')||'';
    catalogState.coverModelTest={
      provider:testedProvider||null,
      model:testedModel||null,
      ok:Boolean(testedModel&&testedProvider===($c('coverImageProvider')?.value||'experiential')&&testedModel===$c('coverAiModel').value)
    };
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
    if($c('catalogAutoGenreBtn'))$c('catalogAutoGenreBtn').disabled=count===0;
    if($c('catalogContentCleanupBtn'))$c('catalogContentCleanupBtn').disabled=count===0;
    const selectedModel=$c('coverAiModel')?.value||null;
    const selectedProvider=$c('coverImageProvider')?.value||'experiential';
    const modelReady=catalogState.coverModelTest.ok&&catalogState.coverModelTest.provider===selectedProvider&&catalogState.coverModelTest.model===selectedModel;
    $c('catalogBulkCoverBtn').disabled=count===0;
    $c('catalogBulkCoverBtn').title=modelReady?'Tạo bìa AI hàng loạt':'Model chưa test PASS; hệ thống sẽ tự test 1 lần trước khi chạy batch.';
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
    const res=await window.chuongAuthFetch(SUPABASE_URL+'/storage/v1/object/book-covers/'+encoded,{
      method:'POST',headers:authHeaders({'Content-Type':mime||'image/png','x-upsert':'false'}),body:blob
    });
    if(!res.ok){const body=await res.json().catch(()=>null);throw new Error(body?.message||'Không thể tải bìa lên kho.');}
    const url=SUPABASE_URL+'/storage/v1/object/public/book-covers/'+encoded;
    await rest('books?id=eq.'+encodeURIComponent(bookId),{method:'PATCH',body:{cover_url:url,updated_at:new Date().toISOString()}});
    return url;
  }
  async function generateCover(bookId){
    const settings=aiSettings();persistAiSettings();
    if(!settings.apiKey)throw new Error('Hãy nhập '+providerLabel(settings.imageProvider)+' API key.');
    const response=await window.chuongAuthFetch(SUPABASE_URL+'/functions/v1/ai-generate-cover',{
      method:'POST',
      headers:authHeaders({'Content-Type':'application/json'}),
      body:JSON.stringify({
        bookId,
        imageProvider:settings.imageProvider,
        imageApiKey:settings.apiKey,
        imageModel:settings.imageModel,
        imageQuality:settings.imageQuality,
        promptProvider:settings.promptProvider,
        promptApiKey:settings.promptProvider==='none'?'':settings.apiKey,
        promptModel:settings.promptModel
      })
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      const raw=String(data.detail||data.error||'AI không tạo được bìa.');
      if(raw.includes('experiential_upstream_unavailable')){
        throw new Error('Experiential đang lỗi tuyến tạo ảnh. Hệ thống đã tự thử lại và chuyển sang model dự phòng nhưng vẫn chưa thành công. Hãy thử lại sau ít phút.');
      }
      if(/invalid_api_key|incorrect api key|invalid key|expired|revoked/i.test(raw)){
        throw new Error(providerLabel(settings.imageProvider)+' API key không hợp lệ, đã hết hạn hoặc bị thu hồi.');
      }
      const clean=raw.replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').trim().slice(0,420);
      throw new Error(clean||'AI không tạo được bìa.');
    }
    if(!data.imageBase64)throw new Error('AI không trả về ảnh.');
    const rawBlob=base64ToBlob(data.imageBase64,data.mimeType||'image/png');
    const coverBlob=await normalizeGeneratedCover(rawBlob);
    return uploadCatalogCover(bookId,coverBlob,'image/jpeg');
  }
  async function generateSingleCover(){
    const row=catalogState.editing;if(!row||catalogState.coverBusy)return;
    try{
      catalogState.coverBusy=true;$c('catalogAiCoverBtn').disabled=true;
      showEditMessage(providerLabel(aiSettings().imageProvider)+' đang đọc tên truyện và tạo bìa 2:3 1024×1536…','info');
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
    try{await window.chuongEnsureFreshToken(false);}
    catch(error){return showCatalogMessage(error.message||String(error),'error');}
    const settings=aiSettings();persistAiSettings();
    if(!settings.apiKey)return showCatalogMessage('Hãy nhập '+providerLabel(settings.imageProvider)+' API key trước.','error');
    if(!catalogState.coverModelTest.ok||catalogState.coverModelTest.provider!==settings.imageProvider||catalogState.coverModelTest.model!==settings.imageModel){
      showCatalogMessage('Model chưa được test PASS. Đang tự kiểm tra '+providerLabel(settings.imageProvider)+' trước khi chạy batch…','info');
      const ok=await diagnoseImageModel();
      if(!ok){
        return showCatalogMessage('Model tạo ảnh chưa PASS nên chưa chạy batch. Xem kết quả Test model ảnh ở phía trên.','warn');
      }
    }
    $c('catalogBulkCoverBtn').disabled=true;
    let done=0,success=0,skipped=0,failed=0,consecutiveProviderFailures=0,stoppedEarly=false;
    for(const id of ids){
      try{
        const rows=await rest('books?id=eq.'+encodeURIComponent(id)+'&select=cover_url&limit=1');
        if(rows?.[0]?.cover_url&&!settings.overwrite){skipped++;done++;setCatalogProgress(done,ids.length,'Bỏ qua bìa đã có · '+done+'/'+ids.length);continue;}
        setCatalogProgress(done,ids.length,'Đang tạo bìa AI '+(done+1)+'/'+ids.length);
        await generateCover(id);
        success++;
        consecutiveProviderFailures=0;
        await new Promise(resolve=>setTimeout(resolve,1200));
      }catch(error){
        failed++;
        const message=error.message||String(error);
        const providerDown=/Experiential đang lỗi tuyến tạo ảnh|experiential_upstream_unavailable|all_routes_failed|provider_internal|unavailable_route|image_provider_429|image_provider_5\\d\\d|rate.?limit|temporarily unavailable/i.test(message);
        consecutiveProviderFailures=providerDown?consecutiveProviderFailures+1:0;
        showCatalogMessage('Có lỗi khi tạo bìa: '+message,'warn');
        if(consecutiveProviderFailures>=2){
          stoppedEarly=true;
          done++;
          setCatalogProgress(done,ids.length,'Đã dừng sớm vì '+providerLabel(settings.imageProvider)+' lỗi liên tiếp · '+done+'/'+ids.length);
          break;
        }
      }
      done++;setCatalogProgress(done,ids.length,'Đã xử lý bìa '+done+'/'+ids.length);
    }
    if(stoppedEarly){
      showCatalogMessage('Đã tự dừng batch sau 2 lỗi '+providerLabel(settings.imageProvider)+' liên tiếp để tránh chạy hỏng cả lô. Thành công: '+success+' · lỗi: '+failed+'. Hãy kiểm tra lại API/model rồi chạy tiếp.','warn');
    }else{
      showCatalogMessage('Tạo bìa xong · '+success+' thành công · '+skipped+' bỏ qua · '+failed+' lỗi.',failed?'warn':'success');
    }
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


  function chunkIds(ids,size=80){
    const chunks=[];
    for(let i=0;i<ids.length;i+=size)chunks.push(ids.slice(i,i+size));
    return chunks;
  }

  async function autoReclassifySelected(){
    const ids=[...catalogState.selected];
    if(!ids.length)return;
    if(typeof inferGenresFromStory!=='function'){
      return showCatalogMessage('Bộ phân loại thể loại chưa được tải. Hãy tải lại trang rồi thử lại.','error');
    }
    if(!confirm('Phân loại lại '+ids.length+' truyện đang chọn?\n\nHệ thống sẽ đọc tên + tóm tắt + 3 chương mẫu, sau đó thay thể loại hiện tại bằng tối đa 3 thể loại phù hợp.')){
      return;
    }
    const button=$c('catalogAutoGenreBtn');
    button.disabled=true;
    let done=0,success=0,failed=0;
    try{
      const batches=chunkIds(ids,80);
      for(const batch of batches){
        setCatalogProgress(done,ids.length,'Đang đọc nội dung để phân loại '+done+'/'+ids.length);
        const inputs=await rest('rpc/admin_genre_scan_inputs',{method:'POST',body:{p_book_ids:batch}});
        const updates=(inputs||[]).map(row=>{
          const inferred=inferGenresFromStory({
            title:row.title||'',
            summary:row.description||'',
            sample:row.sample_text||''
          });
          const genres=(inferred?.genres||[]).filter(Boolean).slice(0,3);
          return {book_id:row.book_id,genres:genres.length?genres:['Khác']};
        });
        if(updates.length){
          const result=await rest('rpc/admin_apply_book_genres',{method:'POST',body:{p_updates:updates}});
          success+=(result||[]).filter(item=>item.success).length;
          failed+=(result||[]).filter(item=>!item.success).length;
        }
        done+=batch.length;
        setCatalogProgress(Math.min(done,ids.length),ids.length,'Đã phân loại lại '+Math.min(done,ids.length)+'/'+ids.length);
      }
      showCatalogMessage('Phân loại lại hoàn tất · '+success+' thành công'+(failed?' · '+failed+' lỗi':'')+'. Mỗi truyện có tối đa 3 thể loại để người đọc tìm dễ hơn.',failed?'warn':'success');
      await loadCatalog(false);
    }catch(error){
      showCatalogMessage('Không thể phân loại lại: '+(error.message||String(error)),'error');
    }finally{
      button.disabled=catalogState.selected.size===0;
    }
  }



  function closeCleanupPreview(){
    $c('catalogCleanupModal')?.classList.add('hidden');
  }

  function renderCleanupPreview(ids,items){
    catalogState.cleanupPreview={ids:[...ids],items:[...items]};
    const modal=$c('catalogCleanupModal');
    const list=$c('catalogCleanupList');
    const summary=$c('catalogCleanupSummary');
    if(!modal||!list||!summary)return;

    const chapters=new Set(items.map(item=>item.chapter_id));
    const books=new Set(items.map(item=>item.book_id));
    summary.textContent=
      'Tìm thấy '+items.length.toLocaleString('vi-VN')+' dòng rác thực tế trong '+
      chapters.size.toLocaleString('vi-VN')+' chương / '+
      books.size.toLocaleString('vi-VN')+' truyện.';

    list.innerHTML=items.length
      ?items.map((item,index)=>{
        const chapterTitle=String(item.chapter_title||'').trim();
        return '<div class="cleanup-preview-item">'+
          '<div class="cleanup-preview-meta">'+
            '<strong>#'+(index+1)+' · '+esc(item.book_title||'Không rõ truyện')+'</strong>'+
            '<span>Chương '+Number(item.chapter_number||0).toLocaleString('vi-VN')+
              (chapterTitle?' · '+esc(chapterTitle):'')+'</span>'+
            '<span>Dòng '+Number(item.line_number||0).toLocaleString('vi-VN')+'</span>'+
          '</div>'+
          '<div class="cleanup-preview-text">'+esc(item.junk_text||'')+'</div>'+
        '</div>';
      }).join('')
      :'<div class="cleanup-preview-empty">Không tìm thấy dòng rác nào.</div>';

    const confirmBtn=$c('catalogCleanupConfirmBtn');
    if(confirmBtn){
      confirmBtn.disabled=!items.length;
      confirmBtn.textContent=items.length
        ?'Xác nhận xóa '+items.length.toLocaleString('vi-VN')+' dòng trên'
        :'Không có gì để xóa';
    }
    modal.classList.remove('hidden');
  }

  async function cleanSelectedContent(){
    const ids=[...catalogState.selected];
    if(!ids.length)return;
    const button=$c('catalogContentCleanupBtn');
    button.disabled=true;
    try{
      const items=[];
      let done=0;

      // Fetch exact matches one book at a time to avoid statement_timeout on a large library.
      for(const id of ids){
        setCatalogProgress(done,ids.length,'Đang quét và lấy văn bản rác thật '+done+'/'+ids.length+' truyện');
        const rows=await rest('rpc/admin_content_hygiene_items',{method:'POST',body:{p_book_id:id}});
        for(const row of rows||[])items.push(row);
        done++;
        setCatalogProgress(done,ids.length,'Đã quét '+done+'/'+ids.length+' truyện · tìm thấy '+items.length+' dòng rác');
        if(done<ids.length)await new Promise(resolve=>setTimeout(resolve,70));
      }

      if(!items.length){
        catalogState.cleanupPreview={ids:[],items:[]};
        showCatalogMessage(
          'Quét xong '+ids.length+' truyện · không phát hiện dòng rác nào. Không dùng AI.',
          'success'
        );
        return;
      }

      renderCleanupPreview(ids,items);
      showCatalogMessage(
        'Đã quét xong. Mở bảng kết quả để kiểm tra đúng '+items.length+
        ' dòng rác thực tế trước khi quyết định xóa. Chưa có nội dung nào bị xóa.',
        'warn'
      );
    }catch(error){
      const message=error.message||String(error);
      const timeout=/57014|statement timeout|canceling statement/i.test(message);
      showCatalogMessage(
        timeout
          ?'Một truyện vẫn vượt thời gian quét. Chưa có nội dung nào bị xóa. Hãy thử chọn ít truyện hơn hoặc báo tên truyện đó để tối ưu riêng.'
          :'Không thể quét rác: '+message,
        'error'
      );
    }finally{
      button.disabled=catalogState.selected.size===0;
    }
  }

  async function runConfirmedCleanup(){
    const ids=[...(catalogState.cleanupPreview?.ids||[])];
    const expectedItems=[...(catalogState.cleanupPreview?.items||[])];
    if(!ids.length||!expectedItems.length)return;

    const confirmBtn=$c('catalogCleanupConfirmBtn');
    const cancelBtn=$c('catalogCleanupCancelBtn');
    if(confirmBtn)confirmBtn.disabled=true;
    if(cancelBtn)cancelBtn.disabled=true;

    let done=0,changed=0,removed=0,skipped=0,failedBooks=0;
    try{
      closeCleanupPreview();
      for(const id of ids){
        try{
          setCatalogProgress(done,ids.length,'Đang dọn rác '+done+'/'+ids.length+' truyện');
          const rows=await rest('rpc/admin_clean_story_junk',{method:'POST',body:{p_book_ids:[id]}});
          const result=rows?.[0]||{};
          changed+=Number(result.chapters_changed||0);
          removed+=Number(result.junk_lines_removed||0);
          skipped+=Number(result.chapters_skipped||0);
        }catch(error){
          failedBooks++;
          console.warn('Story cleanup failed for book',id,error);
        }
        done++;
        setCatalogProgress(done,ids.length,'Đã dọn '+done+'/'+ids.length+' truyện');
        if(done<ids.length)await new Promise(resolve=>setTimeout(resolve,70));
      }

      const notes=[];
      if(skipped)notes.push(skipped+' chương được giữ nguyên để tránh xóa quá nhiều nội dung');
      if(failedBooks)notes.push(failedBooks+' truyện lỗi và được bỏ qua');

      showCatalogMessage(
        'Dọn rác hoàn tất · '+removed+' dòng đã xóa trong '+changed+' chương'+
        (notes.length?' · '+notes.join(' · '):'')+
        '. Mọi chương đã sửa đều có bản sao lưu nội bộ. Không dùng AI.',
        failedBooks||skipped?'warn':'success'
      );
      catalogState.cleanupPreview={ids:[],items:[]};
      await loadCatalog(false);
    }finally{
      if(confirmBtn)confirmBtn.disabled=false;
      if(cancelBtn)cancelBtn.disabled=false;
    }
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
  $c('coverImageProvider')?.addEventListener('change',()=>{
    applyImageProviderMode(true);
    persistAiSettings();
    setApiCheckStatus('neutral','Đã đổi nhà cung cấp · hãy nhập/kiểm tra API key tương ứng.');
    $c('coverModelDiagnostic')?.classList.add('hidden');
  });
  $c('coverPromptProvider')?.addEventListener('change',()=>{applyPromptMode();persistAiSettings();setApiCheckStatus('neutral','Cấu hình đã thay đổi · hãy kiểm tra lại API');});
  ['coverAiKey','coverPromptModel'].forEach(id=>$c(id)?.addEventListener('input',()=>{
    catalogState.coverModelTest={provider:null,model:null,ok:false};
    sessionStorage.removeItem('chuong_cover_tested_model');
    sessionStorage.removeItem('chuong_cover_tested_provider');
    persistAiSettings();
    setApiCheckStatus('neutral','Cấu hình đã thay đổi · hãy kiểm tra lại API');
    $c('coverBuyCreditsLink')?.classList.add('hidden');
    updateSelectionUi();
  }));
  $c('coverAiModel')?.addEventListener('change',()=>{
    catalogState.coverModelTest={provider:null,model:null,ok:false};
    sessionStorage.removeItem('chuong_cover_tested_model');
    sessionStorage.removeItem('chuong_cover_tested_provider');
    persistAiSettings();
    setApiCheckStatus('neutral','Đã đổi model tạo ảnh · hệ thống sẽ tự test khi bạn bấm tạo bìa.');
    $c('coverModelDiagnostic')?.classList.add('hidden');
    $c('coverBuyCreditsLink')?.classList.add('hidden');
    updateSelectionUi();
  });
  $c('coverImageQuality')?.addEventListener('change',()=>{persistAiSettings();setApiCheckStatus('neutral','Đã đổi chất lượng OpenAI · nên Test model ảnh trước khi chạy batch.');});
  $c('coverCheckApiBtn')?.addEventListener('click',()=>void checkImageApi());
  $c('coverDiagnoseModelBtn')?.addEventListener('click',()=>void diagnoseImageModel());
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
  $c('catalogAutoGenreBtn')?.addEventListener('click',()=>void autoReclassifySelected());
  $c('catalogContentCleanupBtn')?.addEventListener('click',()=>void cleanSelectedContent());
  $c('catalogCleanupConfirmBtn')?.addEventListener('click',()=>void runConfirmedCleanup());
  $c('catalogCleanupCancelBtn')?.addEventListener('click',closeCleanupPreview);
  document.querySelectorAll('[data-close-cleanup-preview]').forEach(el=>el.addEventListener('click',closeCleanupPreview));
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
