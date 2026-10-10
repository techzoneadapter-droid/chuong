(function(root){
  'use strict';
  function validate(value){
    const text=String(value??'').trim(),count=Number(text);
    if(!/^\d+$/.test(text)||!Number.isSafeInteger(count)||count>100000)throw new Error('Số chương đọc thử phải là số nguyên từ 0 đến 100.000.');
    return count;
  }
  root.chuongFreePreview={validate};
  if(typeof document!=='undefined')document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-free-preview-for]');
    if(!button)return;
    const input=document.getElementById(button.dataset.freePreviewFor);
    if(input&&!input.disabled){input.value=button.dataset.freePreviewValue;input.dispatchEvent(new Event('input',{bubbles:true}));}
  });
})(globalThis);
