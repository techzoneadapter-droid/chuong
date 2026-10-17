import { test, expect } from '@playwright/test';
test.skip(!process.env.TEST_ADMIN_URL, 'Requires local admin QA server');
test('admin preview controls persist canonical field and cancel reduced limit before writes', async ({page})=>{
  const id='30000000-0000-4000-8000-000000000001';
  const book={id,title:'Preview fixture',status:'ongoing',description:'Fixture',genres:['Tiên hiệp'],total_count:1,total_chapters:1,updated_at:'2026-10-10',is_vip:true,free_preview_chapters:5};
  const writes:any[]=[];
  const creates:any[]=[];
  await page.addInitScript(()=>{
    sessionStorage.setItem('chuong_admin_token','test-token');sessionStorage.setItem('chuong_admin_refresh','test-refresh');sessionStorage.setItem('chuong_admin_user','10000000-0000-4000-8000-000000000001');sessionStorage.setItem('chuong_admin_expires_at',String(Date.now()+3600000));
  });
  await page.route('https://lwchpifeahyuoajeidsa.supabase.co/**',async route=>{
    const url=new URL(route.request().url()),method=route.request().method();
    if(method==='PATCH'&&url.pathname.endsWith('/books')){const body=route.request().postDataJSON();writes.push(body);Object.assign(book,body);return route.fulfill({json:[]});}
    if(method==='POST'&&url.pathname.endsWith('/books')){const body=route.request().postDataJSON();creates.push(body);return route.fulfill({json:[{...book,...body,id:'30000000-0000-4000-8000-000000000002'}]});}
    if(url.pathname.endsWith('/profiles'))return route.fulfill({json:[{role:'admin',display_name:'QA Admin'}]});
    if(url.pathname.endsWith('/authors'))return route.fulfill({json:[{id:'20000000-0000-4000-8000-000000000001',pen_name:'Chương studio'}]});
    if(url.pathname.endsWith('/admin_catalog_search'))return route.fulfill({json:[book]});
    if(url.pathname.endsWith('/books'))return route.fulfill({json:url.searchParams.has('title')?[]:[book]});
    if(url.pathname.endsWith('/chapters'))return route.fulfill({json:[{id:'chapter',chapter_number:1,title:'Chapter',status:'published'}]});
    return route.fulfill({json:[]});
  });
  await page.goto(process.env.TEST_ADMIN_URL!);
  await page.locator('#manageModeBtn').click();
  await page.locator('[data-catalog-edit]').first().click();
  await expect(page.locator('#catalogFreePreview')).toHaveValue('5');
  await page.locator('[data-free-preview-for="catalogFreePreview"][data-free-preview-value="10"]').click();
  await page.locator('#catalogSaveBookBtn').click();
  await expect.poll(()=>writes.length).toBe(1);expect(writes[0].free_preview_chapters).toBe(10);
  await page.locator('#catalogFreePreview').fill('0');
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('#catalogSaveBookBtn').click();
  await expect(page.locator('#catalogSaveBookBtn')).toBeEnabled();expect(writes.length).toBe(1);
  await page.locator('#catalogFreePreview').fill('100001');await page.locator('#catalogSaveBookBtn').click();
  expect(writes.length).toBe(1);
  await page.locator('#catalogFreePreview').fill('7');page.once('dialog',dialog=>dialog.accept());await page.locator('#catalogSaveBookBtn').click();
  await expect.poll(()=>writes.length).toBe(2);expect(writes[1].free_preview_chapters).toBe(7);
  await expect(page.locator('#catalogSaveBookBtn')).toBeEnabled();
  await page.locator('#catalogNewBookBtn').click();
  await expect(page.locator('#catalogFreePreview')).toHaveValue('0');
  await page.locator('#catalogEditTitle').fill('Admin preview creation');
  await page.locator('[data-free-preview-for="catalogFreePreview"][data-free-preview-value="50"]').click();
  await page.locator('#catalogSaveBookBtn').click();
  await expect.poll(()=>creates.length).toBe(1);expect(creates[0].free_preview_chapters).toBe(50);
});
