
(() => {
  const PAGE_SIZE=100;
  const CHAPTER_PAGE_SIZE=50;
  const GENRES=['Xuyên không','Trọng sinh','Hệ thống','Tiên hiệp','Huyền huyễn','Mạt thế','Đam mỹ','Ngôn tình','Cổ đại','Cung đấu','Đô thị','Giới giải trí','Huyền học','Trinh thám','Kinh dị','Khoa huyễn','Esports','Kiếm hiệp','Fantasy','Điền văn','Vô hạn lưu','Niên đại','Văn học','Khác'];
  const $c=(id)=>document.getElementById(id);
  const catalogState={
    loaded:false,loading:false,page:1,total:0,rows:[],selected:new Set(),
    editing:null,creatingBook:false,chapterPage:1,chapterTotal:0,chapterRows:[],editingChapter:null,
    bulkChapterRows:[],bulkChapterTimer:null,bulkChapterLargePaste:false,
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
      if(($c('coverImageProvider')?.value||'experiential')==='experiential')creditsLink?.classList.remove('hidden');
      else creditsLink?.classList.add('hidden');
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

  function catalogSlugify(value){
    return String(value||'')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/đ/g,'d').replace(/Đ/g,'D')
      .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);
  }

  function setBookEditorMode(creating){
    catalogState.creatingBook=Boolean(creating);
    if($c('catalogEditKicker'))$c('catalogEditKicker').textContent=creating?'THÊM TRUYỆN MỚI':'CHỈNH SỬA TRUYỆN';
    $c('catalogSaveBookBtn').textContent=creating?'Tạo truyện':'Lưu thông tin';
    $c('catalogDeleteBookBtn').disabled=creating;
    $c('catalogAiCoverBtn').disabled=creating;
    $c('catalogManualCover').disabled=creating;
    $c('catalogAddChapterBtn').disabled=creating;
    $c('catalogAddBulkChapterBtn').disabled=creating;
    $c('catalogChapterPrev').disabled=creating;
    $c('catalogChapterNext').disabled=creating;
    if(creating){
      $c('catalogChapterCount').textContent='0 chương';
      $c('catalogChapterPage').textContent='1/1';
      $c('catalogChapterList').innerHTML='<div class="bulk-empty">Hãy tạo truyện trước, sau đó bạn có thể thêm chương ngay tại đây.</div>';
      $c('catalogChapterEditor').classList.add('hidden');
      $c('catalogBulkChapterEditor').classList.add('hidden');
    }
  }

  function openBook(row){
    catalogState.editing={...row};
    catalogState.chapterPage=1;
    catalogState.chapterTotal=0;
    catalogState.chapterRows=[];
    catalogState.editingChapter=null;
    setBookEditorMode(false);
    $c('catalogEditModal').classList.remove('hidden');
    $c('catalogEditHeading').textContent=row.title;
    $c('catalogEditTitle').value=row.title||'';
    $c('catalogEditAuthor').value=row.author_name||'Chuong';
    $c('catalogEditGenre').value=(row.genres||[])[0]||'Khác';
    $c('catalogEditStatus').value=row.status||'draft';
    $c('catalogEditDescription').value=row.description||'';
    renderEditCover(row.cover_url);
    $c('catalogChapterEditor').classList.add('hidden');
    $c('catalogBulkChapterEditor').classList.add('hidden');
    catalogState.bulkChapterRows=[];
    showEditMessage('');
    loadChapterPage();
  }

  function openCreateBook(){
    catalogState.editing={
      id:'',
      title:'',
      author_name:'Chuong',
      genres:['Khác'],
      status:'draft',
      description:'',
      cover_url:null
    };
    catalogState.chapterPage=1;
    catalogState.chapterTotal=0;
    catalogState.chapterRows=[];
    catalogState.editingChapter=null;
    setBookEditorMode(true);
    $c('catalogEditModal').classList.remove('hidden');
    $c('catalogEditHeading').textContent='Truyện mới';
    $c('catalogEditTitle').value='';
    $c('catalogEditAuthor').value='Chuong';
    $c('catalogEditGenre').value='Khác';
    $c('catalogEditStatus').value='draft';
    $c('catalogEditDescription').value='';
    renderEditCover('');
    $c('catalogBulkChapterEditor').classList.add('hidden');
    catalogState.bulkChapterRows=[];
    showEditMessage('Nhập thông tin truyện rồi bấm “Tạo truyện”. Sau khi tạo xong, bạn có thể thêm 1 chương hoặc dán nhiều chương để nhập hàng loạt.','info');
  }

  function closeBook(){
    $c('catalogEditModal').classList.add('hidden');
    catalogState.editing=null;
    catalogState.creatingBook=false;
    catalogState.editingChapter=null;
    catalogState.bulkChapterRows=[];
    if($c('catalogBulkChapterEditor'))$c('catalogBulkChapterEditor').classList.add('hidden');
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
    const description=$c('catalogEditDescription').value.trim()||'Hãy khám phá.';
    if(title.length<2)return showEditMessage('Tên truyện quá ngắn.','error');

    try{
      $c('catalogSaveBookBtn').disabled=true;

      if(catalogState.creatingBook){
        if(!state?.ownerAuthorId)throw new Error('Chưa xác định được tác giả nội bộ Admin. Hãy đăng nhập lại trang quản trị.');
        const duplicateRows=await rest(
          'books?select=id,title&title=eq.'+encodeURIComponent(title)+'&limit=3'
        );
        if(duplicateRows?.length){
          throw new Error('Đã có truyện cùng tên trong kho. Hãy mở truyện cũ để sửa hoặc dùng chức năng cập nhật ZIP.');
        }
        const slug=(catalogSlugify(title)||'truyen')+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
        const created=await rest('books?select=id,title,status,description,cover_url,total_chapters',{
          method:'POST',
          prefer:'return=representation',
          body:{
            author_id:state.ownerAuthorId,
            title,
            slug,
            description,
            credited_author_name:author,
            language:'vi',
            source_type:'authorized',
            status,
            visibility:status==='draft'?'private':'public',
            tags:[],
            is_vip:false,
            price_coins:0
          }
        });
        const book=created?.[0];
        if(!book?.id)throw new Error('Database không trả về ID truyện mới.');
        await rest('book_genres',{method:'POST',prefer:'return=minimal',body:{book_id:book.id,genre}});
        catalogState.editing={
          ...row,
          ...book,
          id:book.id,
          title,
          author_name:author,
          description,
          genres:[genre],
          status
        };
        setBookEditorMode(false);
        $c('catalogEditHeading').textContent=title;
        showEditMessage('Đã tạo truyện mới. Bạn có thể bấm “+ Thêm chương” để nhập chương đầu tiên.','success');
        await loadCatalog(true);
        await loadChapterPage();
        return;
      }

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
    }catch(error){
      showEditMessage(error.message||String(error),'error');
    }finally{
      $c('catalogSaveBookBtn').disabled=false;
    }
  }

  async function loadChapterPage(){
    const row=catalogState.editing;if(!row?.id||catalogState.creatingBook)return;
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
      $c('catalogChapterList').innerHTML='<div class="bulk-empty">Chưa có chương. Bấm “+ Thêm chương” để nhập chương đầu tiên.</div>';
      return;
    }
    $c('catalogChapterList').innerHTML=catalogState.chapterRows.map(ch=>
      '<button type="button" class="catalog-chapter-item" data-edit-chapter="'+ch.id+'">'+
        '<b>Chương '+ch.chapter_number+'</b>'+
        '<span>'+esc(ch.title||('Chương '+ch.chapter_number))+'</span>'+
        '<small>'+esc(ch.status==='published'?'Đã xuất bản · Sửa chương':'Bản nháp · Sửa chương')+'</small>'+
      '</button>'
    ).join('');
  }

  function closeChapterEditor(){
    catalogState.editingChapter=null;
    $c('catalogChapterEditor').classList.add('hidden');
    $c('catalogChapterNumber').readOnly=true;
  }



  function normalizeBulkChapterText(value){
    return String(value||'')
      .replace(/^\uFEFF/,'')
      .replace(/\r\n?/g,'\n')
      .replace(/[ \t]+\n/g,'\n')
      .replace(/\n{4,}/g,'\n\n\n')
      .trim();
  }

  function bulkRomanToNumber(value){
    const map={I:1,V:5,X:10,L:50,C:100,D:500,M:1000};
    let total=0,prev=0;
    for(const ch of String(value||'').toUpperCase().split('').reverse()){
      const n=map[ch]||0;
      total+=n<prev?-n:n;
      prev=Math.max(prev,n);
    }
    return total||0;
  }

  function bulkChineseToNumber(value){
    if(/^\d+$/.test(String(value||'')))return Number(value);
    const digit={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
    const unit={十:10,百:100,千:1000,万:10000};
    let total=0,section=0,num=0;
    for(const ch of String(value||'')){
      if(ch in digit){num=digit[ch];continue;}
      const u=unit[ch];
      if(!u)continue;
      if(u===10000){
        section=(section+(num||0))*u;
        total+=section;
        section=0;
        num=0;
      }else{
        section+=(num||1)*u;
        num=0;
      }
    }
    return total+section+num;
  }

  function parseBulkChapterNumber(value){
    const raw=String(value||'').trim();
    if(/^\d+$/.test(raw))return Number(raw);
    if(/^[ivxlcdm]+$/i.test(raw))return bulkRomanToNumber(raw);
    return bulkChineseToNumber(raw);
  }

  function parseBulkChapterText(raw){
    // PERF: avoid normalizing/copying the whole multi-megabyte novel several times.
    // Only normalize CRLF once; each chapter body is normalized after slicing.
    const text=String(raw||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
    if(!text.trim())return[];

    // IMPORTANT: a Roman chapter number must end before whitespace/separator/end.
    // Without this boundary, prose such as "Phan Dực..." was parsed as:
    // "Phan" + Roman D (=500), and "Phần còn..." as Roman C (=100).
    const re=/^[ \t]*(?:>{1,3}[ \t]*)?(?:#{1,6}[ \t]*)?(?:[*_]{1,3}[ \t]*)?(?:(?:chương|chuong|chapter|chap|hồi|hoi|phần|phan|part|tiết|tiet|quyển|quyen|volume)\s*(?:số\s*)?([0-9]{1,6}|[ivxlcdm]{1,12})(?=\s|[:.\-–—/]|$)(?:\s*\/\s*\d{1,6})?|第\s*([0-9零〇一二两三四五六七八九十百千万]{1,16})\s*[章节回卷部篇])(?:[ \t]*[:.\-–—]\s*|\s+)?([^\n]*?)(?:[ \t]*[*_#]{1,6})?[ \t]*$/gim;

    const rawMatches=[...text.matchAll(re)];
    if(!rawMatches.length)return[];

    // Some source files contain the same chapter heading twice in a row
    // (often plain heading + Markdown heading) with only blank lines between.
    // Treat that as one heading and keep the later/real heading.
    const matches=[];
    for(const match of rawMatches){
      const chapterNumber=parseBulkChapterNumber(match[1]||match[2]);
      if(!Number.isInteger(chapterNumber)||chapterNumber<1)continue;
      const previous=matches[matches.length-1];
      if(previous&&previous.chapterNumber===chapterNumber){
        const previousEnd=(previous.match.index||0)+previous.match[0].length;
        const gap=text.slice(previousEnd,match.index||0);
        if(!gap.trim()){
          matches[matches.length-1]={match,chapterNumber};
          continue;
        }
      }
      matches.push({match,chapterNumber});
    }

    const rows=[];
    for(let i=0;i<matches.length;i++){
      const current=matches[i],next=matches[i+1];
      const match=current.match;
      const tail=(match[3]||'').replace(/[*_#]+\s*$/g,'').trim();
      const start=(match.index||0)+match[0].length;
      const end=next?.match?.index??text.length;
      rows.push({
        chapterNumber:current.chapterNumber,
        title:tail||('Chương '+current.chapterNumber),
        content:normalizeBulkChapterText(text.slice(start,end))
      });
    }
    return rows.sort((a,b)=>a.chapterNumber-b.chapterNumber);
  }

  function analyzeBulkChapterRows(rows){
    const seen=new Set(),duplicates=new Set(),empty=[];
    for(let i=0;i<rows.length;i++){
      const number=Number(rows[i].chapterNumber);
      if(seen.has(number))duplicates.add(number);
      seen.add(number);
      if(!String(rows[i].content||'').trim())empty.push(number);
    }
    return {duplicates:[...duplicates].sort((a,b)=>a-b),empty};
  }

  function renderBulkChapterPreview(){
    const rows=catalogState.bulkChapterRows||[];
    const summary=$c('catalogBulkChapterSummary');
    const preview=$c('catalogBulkChapterPreview');
    const save=$c('catalogSaveBulkChapterBtn');
    if(!rows.length){
      summary.className='audit warn';
      summary.textContent=$c('catalogBulkChapterText').value.trim()
        ?'Chưa nhận diện được chương. Hãy đặt tiêu đề trên dòng riêng, ví dụ “Chương 1: Khởi đầu”.'
        :'Dán văn bản để hệ thống tự nhận diện chương.';
      preview.innerHTML='';
      save.disabled=true;
      return;
    }
    const audit=analyzeBulkChapterRows(rows);
    const first=rows[0].chapterNumber,last=rows[rows.length-1].chapterNumber;
    if(audit.duplicates.length||audit.empty.length){
      summary.className='audit bad';
      const notes=[];
      if(audit.duplicates.length)notes.push('Trùng số chương: '+audit.duplicates.slice(0,20).join(', ')+(audit.duplicates.length>20?'…':''));
      if(audit.empty.length)notes.push('Chương rỗng: '+audit.empty.slice(0,20).join(', ')+(audit.empty.length>20?'…':''));
      summary.textContent='Nhận diện '+rows.length+' chương ('+first+' → '+last+'). '+notes.join(' · ')+' — cần sửa trước khi lưu.';
      save.disabled=true;
    }else{
      summary.className='audit';
      summary.textContent='✓ Nhận diện '+rows.length.toLocaleString('vi-VN')+' chương · khoảng '+first+' → '+last+'. Chương trùng với dữ liệu đang có sẽ '+($c('catalogBulkChapterOverwrite').checked?'được ghi đè.':'được bỏ qua.');
      save.disabled=false;
    }
    // Keep the DOM preview small. Rendering hundreds of rows makes the modal janky.
    preview.innerHTML=rows.slice(0,40).map(row=>{
      const chars=String(row.content||'').length;
      return '<div class="catalog-bulk-chapter-row"><b>Ch. '+row.chapterNumber+'</b><span>'+esc(row.title)+'</span><small>'+chars.toLocaleString('vi-VN')+' ký tự</small></div>';
    }).join('')+(rows.length>40?'<div class="catalog-bulk-chapter-more">… còn '+(rows.length-40).toLocaleString('vi-VN')+' chương (đã nhận diện, không cần render hết)</div>':'');
  }

  function parseBulkChapterInput(rawOverride){
    const field=$c('catalogBulkChapterText');
    const raw=typeof rawOverride==='string'?rawOverride:field.value;
    catalogState.bulkChapterRows=parseBulkChapterText(raw);
    renderBulkChapterPreview();
    return catalogState.bulkChapterRows;
  }

  function scheduleBulkChapterParse(){
    catalogState.bulkChapterLargePaste=false;
    clearTimeout(catalogState.bulkChapterTimer);
    // Large chapter text should not be reparsed on every keystroke.
    catalogState.bulkChapterTimer=setTimeout(parseBulkChapterInput,700);
  }

  function handleBulkChapterPaste(event){
    const pasted=event.clipboardData?.getData('text/plain')||'';
    if(pasted.length<300000)return;

    // Do not place multi-megabyte text inside the textarea: Chromium becomes very
    // slow painting/caret-scrolling it. Parse clipboard text directly instead.
    event.preventDefault();
    clearTimeout(catalogState.bulkChapterTimer);
    catalogState.bulkChapterTimer=null;
    catalogState.bulkChapterLargePaste=true;

    const field=$c('catalogBulkChapterText');
    field.value='';
    field.placeholder='Đang nhận diện văn bản lớn…';
    const summary=$c('catalogBulkChapterSummary');
    summary.className='audit';
    summary.textContent='Đang nhận diện '+(pasted.length/1024/1024).toFixed(1)+' MB văn bản…';
    $c('catalogSaveBulkChapterBtn').disabled=true;

    setTimeout(()=>{
      try{
        const rows=parseBulkChapterInput(pasted);
        field.placeholder=rows.length
          ?'Đã nạp '+(pasted.length/1024/1024).toFixed(1)+' MB vào bộ nhớ · '+rows.length.toLocaleString('vi-VN')+' chương. Dán nội dung khác để thay thế.'
          :'Không nhận diện được chương. Hãy dán lại hoặc kiểm tra định dạng tiêu đề chương.';
        if(rows.length){
          showEditMessage('Đã nhận diện '+rows.length.toLocaleString('vi-VN')+' chương mà không giữ toàn bộ văn bản trong ô nhập, giúp trang nhẹ hơn.','success');
        }
      }catch(error){
        catalogState.bulkChapterRows=[];
        field.placeholder='Dán nội dung nhiều chương';
        showEditMessage(error.message||String(error),'error');
        renderBulkChapterPreview();
      }
    },30);
  }

  function closeBulkChapterEditor(){
    clearTimeout(catalogState.bulkChapterTimer);
    catalogState.bulkChapterTimer=null;
    catalogState.bulkChapterRows=[];
    catalogState.bulkChapterLargePaste=false;
    if($c('catalogBulkChapterEditor'))$c('catalogBulkChapterEditor').classList.add('hidden');
    if($c('catalogBulkChapterText')){
      $c('catalogBulkChapterText').value='';
      $c('catalogBulkChapterText').placeholder='Chương 1: Khởi đầu\n\nNội dung chương 1...\n\nChương 2: Gặp gỡ\n\nNội dung chương 2...';
    }
    if($c('catalogBulkChapterPreview'))$c('catalogBulkChapterPreview').innerHTML='';
    if($c('catalogBulkChapterSummary')){
      $c('catalogBulkChapterSummary').className='audit';
      $c('catalogBulkChapterSummary').textContent='Dán văn bản để hệ thống tự nhận diện chương.';
    }
    if($c('catalogSaveBulkChapterBtn'))$c('catalogSaveBulkChapterBtn').disabled=true;
  }

  function openBulkChapterEditor(){
    const row=catalogState.editing;
    if(!row?.id||catalogState.creatingBook){
      return showEditMessage('Hãy tạo truyện trước khi thêm chương hàng loạt.','warn');
    }
    closeChapterEditor();
    catalogState.bulkChapterRows=[];
    catalogState.bulkChapterLargePaste=false;
    $c('catalogBulkChapterText').value='';
    $c('catalogBulkChapterText').placeholder='Chương 1: Khởi đầu\n\nNội dung chương 1...\n\nChương 2: Gặp gỡ\n\nNội dung chương 2...';
    $c('catalogBulkChapterOverwrite').checked=false;
    $c('catalogBulkChapterStatus').value='draft';
    $c('catalogBulkChapterPreview').innerHTML='';
    $c('catalogBulkChapterSummary').className='audit';
    $c('catalogBulkChapterSummary').textContent='Dán văn bản để hệ thống tự nhận diện chương.';
    $c('catalogSaveBulkChapterBtn').disabled=true;
    $c('catalogBulkChapterEditor').classList.remove('hidden');
    $c('catalogBulkChapterText').focus();
    showEditMessage('Dán nhiều chương vào ô bên dưới. Hệ thống sẽ tự nhận diện sau khi bạn dán.','info');
  }

  async function findExistingBulkChapters(bookId,numbers){
    const byNumber=new Map();
    const unique=[...new Set(numbers)].sort((a,b)=>a-b);
    for(let offset=0;offset<unique.length;offset+=100){
      const slice=unique.slice(offset,offset+100);
      const found=await rest(
        'chapters?book_id=eq.'+encodeURIComponent(bookId)+
        '&chapter_number=in.('+slice.join(',')+')'+
        '&select=id,chapter_number,status,published_at'
      );
      for(const item of found||[])byNumber.set(Number(item.chapter_number),item);
    }
    return byNumber;
  }

  async function saveBulkChapters(){
    const row=catalogState.editing;
    if(!row?.id||catalogState.creatingBook)return showEditMessage('Hãy tạo truyện trước khi thêm chương.','warn');
    // Large paste is parsed directly from clipboard and the textarea is kept empty
    // for performance. Reparse only when the user has actual text in the field.
    if($c('catalogBulkChapterText').value.trim())parseBulkChapterInput();
    const chapters=catalogState.bulkChapterRows||[];
    const audit=analyzeBulkChapterRows(chapters);
    if(!chapters.length)return showEditMessage('Chưa nhận diện được chương nào từ văn bản dán.','error');
    if(audit.duplicates.length)return showEditMessage('Văn bản dán đang trùng số chương: '+audit.duplicates.slice(0,20).join(', ')+'.','error');
    if(audit.empty.length)return showEditMessage('Có chương chưa có nội dung: '+audit.empty.slice(0,20).join(', ')+'.','error');

    const status=$c('catalogBulkChapterStatus').value;
    const overwrite=$c('catalogBulkChapterOverwrite').checked;
    const saveBtn=$c('catalogSaveBulkChapterBtn');
    saveBtn.disabled=true;
    saveBtn.textContent='Đang lưu…';

    try{
      const existing=await findExistingBulkChapters(row.id,chapters.map(item=>item.chapterNumber));
      const now=new Date().toISOString();
      const inserts=[];
      const updates=[];
      let skipped=0;

      for(const chapter of chapters){
        const old=existing.get(Number(chapter.chapterNumber));
        if(old){
          if(!overwrite){skipped++;continue;}
          updates.push({old,chapter});
        }else{
          inserts.push({
            book_id:row.id,
            chapter_number:chapter.chapterNumber,
            title:chapter.title.trim()||('Chương '+chapter.chapterNumber),
            content:chapter.content.trim(),
            status,
            published_at:status==='published'?now:null,
            is_vip:false,
            price_coins:0
          });
        }
      }

      for(let offset=0;offset<inserts.length;offset+=25){
        await rest('chapters',{method:'POST',body:inserts.slice(offset,offset+25),prefer:'return=minimal'});
      }

      for(let offset=0;offset<updates.length;offset+=8){
        const batch=updates.slice(offset,offset+8);
        await Promise.all(batch.map(({old,chapter})=>rest(
          'chapters?id=eq.'+encodeURIComponent(old.id)+'&book_id=eq.'+encodeURIComponent(row.id),
          {
            method:'PATCH',
            body:{
              title:chapter.title.trim()||('Chương '+chapter.chapterNumber),
              content:chapter.content.trim(),
              status,
              published_at:status==='published'?(old.published_at||now):null,
              updated_at:now
            }
          }
        )));
      }

      if(!inserts.length&&!updates.length){
        showEditMessage('Không có chương mới để thêm. '+skipped+' chương đã tồn tại và được bỏ qua.','warn');
        return;
      }

      const estimatedTotal=Math.max(0,catalogState.chapterTotal)+inserts.length;
      catalogState.chapterPage=Math.max(1,Math.ceil(estimatedTotal/CHAPTER_PAGE_SIZE));
      await loadChapterPage();
      await loadCatalog(false);
      closeBulkChapterEditor();

      const parts=[];
      if(inserts.length)parts.push('thêm mới '+inserts.length.toLocaleString('vi-VN')+' chương');
      if(updates.length)parts.push('cập nhật '+updates.length.toLocaleString('vi-VN')+' chương');
      if(skipped)parts.push('bỏ qua '+skipped.toLocaleString('vi-VN')+' chương đã có');
      showEditMessage('Đã '+parts.join(' · ')+'.','success');
    }catch(error){
      showEditMessage(error.message||String(error),'error');
    }finally{
      saveBtn.disabled=false;
      saveBtn.textContent='Lưu chương hàng loạt';
      if(!$c('catalogBulkChapterEditor').classList.contains('hidden'))renderBulkChapterPreview();
    }
  }

  async function openNewChapter(){
    const row=catalogState.editing;
    if(!row?.id||catalogState.creatingBook){
      return showEditMessage('Hãy tạo truyện trước khi thêm chương.','warn');
    }
    closeBulkChapterEditor();
    try{
      const latest=await rest(
        'chapters?book_id=eq.'+encodeURIComponent(row.id)+'&select=chapter_number&order=chapter_number.desc&limit=1'
      );
      const next=Math.max(1,Number(latest?.[0]?.chapter_number||0)+1);
      catalogState.editingChapter={
        id:null,
        chapter_number:next,
        title:'Chương '+next,
        content:'',
        status:'draft',
        isNew:true
      };
      $c('catalogChapterNumber').readOnly=false;
      $c('catalogChapterNumber').value=next;
      $c('catalogChapterTitle').value='Chương '+next;
      $c('catalogChapterContent').value='';
      $c('catalogChapterStatus').value='draft';
      $c('catalogSaveChapterBtn').textContent='Thêm chương';
      $c('catalogChapterEditor').classList.remove('hidden');
      $c('catalogChapterTitle').focus();
      showEditMessage('Đang thêm chương mới. Số chương có thể chỉnh trước khi lưu.','info');
    }catch(error){
      showEditMessage(error.message||String(error),'error');
    }
  }

  async function openChapter(id){
    const row=catalogState.editing;if(!row?.id)return;
    closeBulkChapterEditor();
    try{
      const items=await rest('chapters?id=eq.'+encodeURIComponent(id)+'&book_id=eq.'+encodeURIComponent(row.id)+'&select=id,chapter_number,title,content,status&limit=1');
      const chapter=items?.[0];if(!chapter)throw new Error('Không tìm thấy chương.');
      catalogState.editingChapter={...chapter,isNew:false};
      $c('catalogChapterNumber').readOnly=false;
      $c('catalogChapterNumber').value=chapter.chapter_number;
      $c('catalogChapterTitle').value=chapter.title||'';
      $c('catalogChapterContent').value=chapter.content||'';
      $c('catalogChapterStatus').value=chapter.status||'draft';
      $c('catalogSaveChapterBtn').textContent='Lưu thay đổi';
      $c('catalogChapterEditor').classList.remove('hidden');
      showEditMessage('Bạn đang sửa chương '+chapter.chapter_number+'.','info');
    }catch(error){
      showEditMessage(error.message||String(error),'error');
    }
  }

  async function saveChapter(){
    const row=catalogState.editing,chapter=catalogState.editingChapter;
    if(!row?.id||!chapter)return;
    const chapterNumber=Number($c('catalogChapterNumber').value);
    const title=$c('catalogChapterTitle').value.trim()||('Chương '+chapterNumber);
    const content=$c('catalogChapterContent').value.trim();
    const status=$c('catalogChapterStatus').value;

    if(!Number.isInteger(chapterNumber)||chapterNumber<1)return showEditMessage('Số chương phải là số nguyên từ 1 trở lên.','error');
    if(status==='published'&&content.length<50)return showEditMessage('Chương đã xuất bản cần ít nhất 50 ký tự.','error');

    try{
      $c('catalogSaveChapterBtn').disabled=true;

      const duplicate=await rest(
        'chapters?book_id=eq.'+encodeURIComponent(row.id)+
        '&chapter_number=eq.'+encodeURIComponent(chapterNumber)+
        '&select=id,chapter_number&limit=2'
      );
      const collision=(duplicate||[]).some(item=>item.id!==chapter.id);
      if(collision)throw new Error('Chương '+chapterNumber+' đã tồn tại trong truyện này. Hãy chọn số chương khác.');

      if(chapter.isNew||!chapter.id){
        const created=await rest('chapters?select=id,chapter_number,title,status',{
          method:'POST',
          prefer:'return=representation',
          body:{
            book_id:row.id,
            chapter_number:chapterNumber,
            title,
            content,
            status,
            published_at:status==='published'?new Date().toISOString():null,
            is_vip:false,
            price_coins:0
          }
        });
        const saved=created?.[0];
        if(!saved?.id)throw new Error('Database không trả về chương vừa tạo.');
        catalogState.editingChapter={...saved,content,isNew:false};
        showEditMessage('Đã thêm chương '+chapterNumber+' thành công.','success');
      }else{
        await rest('chapters?id=eq.'+encodeURIComponent(chapter.id)+'&book_id=eq.'+encodeURIComponent(row.id),{
          method:'PATCH',
          body:{
            chapter_number:chapterNumber,
            title,
            content,
            status,
            published_at:status==='published'?(chapter.status==='published'?undefined:new Date().toISOString()):null,
            updated_at:new Date().toISOString()
          }
        });
        chapter.chapter_number=chapterNumber;
        chapter.title=title;
        chapter.content=content;
        chapter.status=status;
        showEditMessage('Đã lưu thay đổi chương '+chapterNumber+'.','success');
      }

      await loadChapterPage();
      await loadCatalog(false);
      closeChapterEditor();
    }catch(error){
      showEditMessage(error.message||String(error),'error');
    }finally{
      $c('catalogSaveChapterBtn').disabled=false;
    }
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
  $c('catalogNewBookBtn')?.addEventListener('click',openCreateBook);
  $c('catalogSaveBookBtn')?.addEventListener('click',()=>void saveBook());
  $c('catalogDeleteBookBtn')?.addEventListener('click',()=>catalogState.editing?.id&&void deleteBooks([catalogState.editing.id],true));
  $c('catalogAiCoverBtn')?.addEventListener('click',()=>void generateSingleCover());
  $c('catalogManualCover')?.addEventListener('change',event=>{const file=event.target.files?.[0];if(file)void manualCover(file);event.target.value='';});
  $c('catalogAddChapterBtn')?.addEventListener('click',()=>void openNewChapter());
  $c('catalogAddBulkChapterBtn')?.addEventListener('click',openBulkChapterEditor);
  $c('catalogBulkChapterText')?.addEventListener('paste',handleBulkChapterPaste);
  $c('catalogBulkChapterText')?.addEventListener('input',scheduleBulkChapterParse);
  $c('catalogBulkChapterOverwrite')?.addEventListener('change',renderBulkChapterPreview);
  $c('catalogParseBulkChapterBtn')?.addEventListener('click',()=>{
    if($c('catalogBulkChapterText').value.trim())parseBulkChapterInput();
    else renderBulkChapterPreview();
  });
  $c('catalogSaveBulkChapterBtn')?.addEventListener('click',()=>void saveBulkChapters());
  $c('catalogCancelBulkChapterBtn')?.addEventListener('click',closeBulkChapterEditor);
  $c('catalogCloseBulkChapterBtn')?.addEventListener('click',closeBulkChapterEditor);
  $c('catalogChapterPrev')?.addEventListener('click',()=>{if(catalogState.chapterPage>1){catalogState.chapterPage--;void loadChapterPage();}});
  $c('catalogChapterNext')?.addEventListener('click',()=>{catalogState.chapterPage++;void loadChapterPage();});
  $c('catalogChapterList')?.addEventListener('click',event=>{const id=event.target.closest?.('[data-edit-chapter]')?.dataset.editChapter;if(id)void openChapter(id);});
  $c('catalogSaveChapterBtn')?.addEventListener('click',()=>void saveChapter());
  $c('catalogCancelChapterBtn')?.addEventListener('click',closeChapterEditor);
  $c('catalogApplyBulkEditBtn')?.addEventListener('click',()=>void applyBulkEdit());
})();
