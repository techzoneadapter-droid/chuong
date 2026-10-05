import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL semantics, entirely local; no environment files or remote credentials.
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('role',current_setting('request.jwt.claim.role',true)) $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;`);
const migrationDir = new URL('../supabase/migrations/', import.meta.url);
for (const file of readdirSync(migrationDir).sort()) {
  // Wallet, entitlement, revenue and store dependencies; other feature tests remain separate.
  if (file.startsWith('202610020') || (file >= '202610030001' && file < '202610030018') || (file >= '202610050001' && file < '202610050005')) {
    await db.exec(readFileSync(new URL(file,migrationDir),'utf8').replace('create extension if not exists pgcrypto;',''));
  }
}
await db.exec(`grant usage on schema public, auth to authenticated,service_role;
grant select,insert,update,delete on all tables in schema public to authenticated;
grant select,insert,update,delete on all tables in schema public to service_role;`);
const reader = '10000000-0000-4000-8000-000000000001';
const writer = '10000000-0000-4000-8000-000000000002';
const admin = '10000000-0000-4000-8000-000000000003';
const author = '20000000-0000-4000-8000-000000000001';
const book = '30000000-0000-4000-8000-000000000001';
const chapter = '40000000-0000-4000-8000-000000000001';
await db.exec(`insert into auth.users(id) values('${reader}'),('${writer}'),('${admin}');
select set_config('request.jwt.claim.role','service_role',false);
update public.profiles set role='admin' where id='${admin}';
insert into public.authors(id,user_id,pen_name) values('${author}','${writer}','Writer');
insert into public.books(id,author_id,title,slug) values('${book}','${author}','Economy test','economy-test');
insert into public.chapters(id,book_id,chapter_number,title,content,is_vip,price_coins,status)
values('${chapter}','${book}',1,'VIP chapter',repeat('Chapter content ',20),true,101,'published');
update public.books set visibility='public',status='ongoing' where id='${book}';
update public.wallet_accounts set balance_coins=1000 where user_id='${reader}';`);
async function identity(id,role='authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id,role]);
  await db.exec(`set role ${role}`);
}
async function row(sql) { return (await db.query(sql)).rows[0]; }
await identity(admin);
await db.exec("select public.admin_set_revenue_share_policy(7000,'Economy test',true);");
// Seed an old verified top-up to exercise backward-compatible refunds after migration.
await identity(reader,'service_role');
await db.exec(`select public.credit_verified_store_purchase('${reader}','google_play','chuong.linhthach.100','legacy-store-1','0123456789abcdef');`);
await db.exec('reset role');
await db.exec(readFileSync(new URL('202610050017_two_tier_spirit_stones.sql',migrationDir),'utf8'));
await db.exec(readFileSync(new URL('202610030018_phase4e_payout_workflow.sql',migrationDir),'utf8'));
// A real old entitlement/refund with no VND snapshot remains unpriced on migration.
const legacyEnt = await row(`with tx as (
 insert into wallet_transactions(user_id,currency_type,type,amount_coins,balance_after,idempotency_key,reference_type,reference_id)
 values('${reader}','high','unlock_debit',-1,0,'legacy-vnd-fixture','book','${book}') returning id
), ent as (
 insert into book_entitlements(user_id,book_id,source,price_paid_coins,wallet_transaction_id)
 select '${reader}','${book}','coin_unlock',1,id from tx returning *
), sale as (
 insert into author_revenue_ledger(author_id,type,gross_coins,book_id,book_entitlement_id,wallet_transaction_id)
 select '${author}','sale',1,'${book}',id,wallet_transaction_id from ent returning id
) select id from ent`);
await identity(admin);
await db.exec(`select admin_refund_entitlement('book','${legacyEnt.id}','Old refund fixture','old-vnd-refund-fixture')`);
await db.exec('reset role');
await db.exec(`update wallet_accounts set high_spirit_stones=0 where user_id='${reader}'`);
await db.exec(readFileSync(new URL('202610050018_author_vnd_settlement.sql',migrationDir),'utf8'));
await db.exec(readFileSync(new URL('202610050019_author_gift_vnd_policy.sql',migrationDir),'utf8'));
const legacyVnd = await row(`select * from author_vnd_ledger where source_reference_id='${legacyEnt.id}' and entry_type='sale'`);
assert.equal(legacyVnd.settlement_status,'legacy_pending_settlement');
assert.equal(legacyVnd.author_earnings_vnd,null);
assert.equal(Number((await row(`select count(*) as n from author_vnd_ledger where original_id='${legacyVnd.id}' and entry_type='reversal'`)).n),1);
await identity(writer);
assert.deepEqual((await row('select get_my_author_gifts() as data')).data, { totalHigh: 0, totalLow: 0, count: 0, recent: [] });
await db.exec(`select author_update_payout_profile('manual_bank','Test bank destination')`);
await assert.rejects(db.exec(`select author_request_payout_vnd(1,'','missing-rate-test')`),/VND_RATE_NOT_CONFIGURED/);
await identity(admin);
// Fixture-only rate, explicitly configured by admin, never a production default.
await db.exec('select admin_set_author_payout_policy(123,6000,6000,8000,6000,1,0)');
await db.exec('reset role');
assert.equal(Number((await row(`select low_spirit_stones from wallet_accounts where user_id='${reader}'`)).low_spirit_stones),1100);
assert.equal(Number((await row(`select high_spirit_stones from wallet_accounts where user_id='${reader}'`)).high_spirit_stones),0);
assert.equal(Number((await row(`select price_coins from chapters where id='${chapter}'`)).price_coins),101);
await identity(reader);
await assert.rejects(db.exec(`select * from unlock_chapter_currency('${chapter}','high-no-funds','high')`),/INSUFFICIENT_COINS/);
await assert.rejects(db.exec(`select * from send_author_gift('${book}','linh_hoa','gift-no-high-funds')`),/INSUFFICIENT_COINS/);
await assert.rejects(db.exec(`select * from unlock_chapter_currency('${chapter}','bad-currency','wrong')`),/INVALID_CURRENCY/);
await identity(reader,'service_role');
await db.exec(`select credit_verified_store_purchase('${reader}','google_play','chuong.linhthach.100','new-store-1','fedcba9876543210');`);
await db.exec(`select credit_verified_store_purchase('${reader}','google_play','chuong.linhthach.100','new-store-1','fedcba9876543210');`);
await identity(reader);
let wallet = await row(`select * from wallet_accounts where user_id='${reader}'`);
assert.equal(Number(wallet.high_spirit_stones),100,'top-up replay does not mint twice');
assert.equal(Number(wallet.low_spirit_stones),1100,'top-up never credits free balance');
const unlocked = await row(`select * from unlock_chapter_currency('${chapter}','unlock-premium-test','high')`);
assert.equal(Number(unlocked.price_paid_coins),51,'odd premium price rounds up');
assert.equal(Number(unlocked.balance_coins),49);
await db.exec(`select * from unlock_chapter_currency('${chapter}','unlock-premium-test','high');`);
await db.exec(`select * from unlock_chapter('${chapter}','unlock-old-client-test');`);
assert.equal(Number((await row(`select high_spirit_stones from wallet_accounts where user_id='${reader}'`)).high_spirit_stones),49,'both unlock APIs share entitlement and cannot charge twice');
let tx = await row(`select * from wallet_transactions where idempotency_key='unlock-premium-test'`);
assert.equal(tx.currency_type,'high'); assert.equal(tx.source_type,'vip_unlock'); assert.equal(tx.direction,'out'); assert.equal(Number(tx.amount),51);
await identity(admin);
await db.exec(`select * from admin_refund_entitlement('chapter','${unlocked.entitlement_id}','Refund test','refund-premium-test');`);
await db.exec(`select * from admin_refund_entitlement('chapter','${unlocked.entitlement_id}','Refund test','refund-premium-test');`);
wallet = await row(`select * from wallet_accounts where user_id='${reader}'`);
assert.equal(Number(wallet.high_spirit_stones),100,'refund restores premium exactly once');
assert.equal(Number(wallet.low_spirit_stones),1100,'premium refund never mints low');
await identity(reader);
const lowUnlock = await row(`select * from unlock_chapter_currency('${chapter}','unlock-low-test','low')`);
assert.equal(Number(lowUnlock.price_paid_coins),101);
await db.exec('reset role');
await db.exec('update revenue_share_policies set active=false');
await identity(reader);
const gift = await row(`select * from send_author_gift('${book}','tien_dan','gift-premium-test')`);
await db.exec(`select * from send_author_gift('${book}','tien_dan','gift-premium-test');`);
assert.equal(Number(gift.balance_coins),50);
assert.equal(Number(gift.author_earnings_coins),40,'gift compatibility share follows new gift policy');
assert.equal((await row(`select currency_type from author_gifts where id='${gift.gift_id}'`)).currency_type,'high');
await identity(writer);
await assert.rejects(db.exec(`select * from send_author_gift('${book}','linh_hoa','gift-self-test')`),/SELF_GIFT_NOT_ALLOWED/);
const dashboard = (await row('select get_my_author_gifts() as data')).data;
assert.equal(Number(dashboard.totalHigh),50);
assert.equal(dashboard.recent.length,1);
await identity(reader);
assert.equal(Number((await row('select get_my_author_gifts() as data')).data.totalHigh),0,'sender cannot read author dashboard');
await identity(reader,'service_role');
await db.exec(`select revoke_verified_store_purchase('google_play','new-store-1','Refund store');`);
wallet = await row(`select * from wallet_accounts where user_id='${reader}'`);
assert.equal(Number(wallet.high_spirit_stones),0); assert.equal(Number(wallet.low_spirit_stones),999);
assert.equal(Number(wallet.debt_coins),50,'spent premium becomes debt');
await db.exec(`select restore_revoked_store_purchase('google_play','new-store-1','Reversal store');`);
wallet = await row(`select * from wallet_accounts where user_id='${reader}'`);
assert.equal(Number(wallet.high_spirit_stones),50); assert.equal(Number(wallet.debt_coins),0);
await db.exec(`select revoke_verified_store_purchase('google_play','legacy-store-1','Legacy refund');`);
wallet = await row(`select * from wallet_accounts where user_id='${reader}'`);
assert.equal(Number(wallet.low_spirit_stones),899,'historical purchase reversal stays low');
assert.equal(Number(wallet.high_spirit_stones),50);
await db.exec(`select restore_revoked_store_purchase('google_play','legacy-store-1','Legacy reversal');`);
// Reward helper exercises the same production wallet and immutable ledger mapping.
await db.exec('reset role');
await db.exec(`select private.credit_daily_cultivation_reward('${reader}',current_date,'checkin',5);
select private.credit_daily_cultivation_reward('${reader}',current_date,'rewarded_ad',10);
select private.credit_daily_cultivation_reward('${reader}',current_date,'read_10m',5);
select private.credit_daily_cultivation_reward('${reader}',current_date,'read_10m',5);`);
for (const [quest,source] of [['checkin','daily_checkin'],['rewarded_ad','ad_reward'],['read_10m','mission_reward']]) {
 tx=await row(`select * from wallet_transactions where metadata->>'quest_key'='${quest}'`);
 assert.equal(tx.currency_type,'low'); assert.equal(tx.source_type,source); assert.equal(tx.direction,'in');
}
wallet = await row(`select * from wallet_accounts where user_id='${reader}'`);
assert.equal(Number(wallet.low_spirit_stones),1019); assert.equal(Number(wallet.high_spirit_stones),50);
// Book unlocks share the same two-currency rules and revoked purchase history.
await db.exec(`update books set is_vip=true,price_coins=105 where id='${book}';`);
await identity(reader,'service_role');
await db.exec(`select credit_verified_store_purchase('${reader}','google_play','chuong.linhthach.100','book-store-1','0123abcd4567ef89');`);
await identity(reader);
const bookUnlock = await row(`select * from unlock_book_currency('${book}','book-high-test','high')`);
assert.equal(Number(bookUnlock.price_paid_coins),53);
await identity(admin);
await db.exec(`select * from admin_refund_entitlement('book','${bookUnlock.entitlement_id}','Refund book','refund-book-test');`);
await identity(reader);
const lowBookUnlock = await row(`select * from unlock_book_currency('${book}','book-low-test','low')`);
assert.equal(Number(lowBookUnlock.price_paid_coins),105);
assert.notEqual(lowBookUnlock.entitlement_id,bookUnlock.entitlement_id,'repurchase preserves original refund history');
await identity(admin);
await db.exec(`select * from admin_refund_entitlement('book','${lowBookUnlock.entitlement_id}','Refund low book','refund-low-book-test');`);
wallet = await row(`select * from wallet_accounts where user_id='${reader}'`);
assert.equal(Number(wallet.low_spirit_stones),1019);
assert.equal(Number(wallet.high_spirit_stones),150);
const adjusted = await row(`select * from admin_adjust_wallet_currency('${reader}',7,'Test premium adjustment','premium-admin-test','high')`);
assert.equal(Number(adjusted.balance_coins),157);
await db.exec(`select * from admin_adjust_wallet_currency('${reader}',7,'Test premium adjustment','premium-admin-test','high');`);
await assert.rejects(db.exec(`select * from admin_adjust_wallet_currency('${reader}',7,'Wrong currency','premium-admin-test','low')`));
await identity(reader);
await assert.rejects(db.exec(`select private.credit_daily_cultivation_reward('${reader}',current_date,'checkin',999)`));
await assert.rejects(db.exec(`select * from admin_adjust_wallet_currency('${reader}',999,'Unauthorized adjustment','reader-admin-test','high')`));
await identity(reader);
assert.equal((await db.query(`update wallet_accounts set high_spirit_stones=999999 where user_id='${reader}' returning user_id`)).rows.length,0,'reader cannot edit wallet');
await assert.rejects(db.exec(`select credit_verified_store_purchase('${reader}','google_play','chuong.linhthach.100','forged-store','0123456789abcdef')`));
await identity(writer);
let vnd = (await row(`select get_author_vnd_dashboard('${author}') as data`)).data;
const chapterVnd = vnd.ledger.find(l => l.source_reference_id === unlocked.entitlement_id && l.entry_type === 'sale');
assert.equal(Number(chapterVnd.gross_value_vnd),51*123);
assert.equal(Number(chapterVnd.author_earnings_vnd),Math.floor(51*123*.6));
assert.equal(chapterVnd.author_share_bps_snapshot,6000);
assert.equal(vnd.ledger.find(l => l.source_reference_id === lowUnlock.entitlement_id).settlement_status,'pending_settlement');
assert.equal(Number(vnd.ledger.find(l => l.source_reference_id === bookUnlock.entitlement_id && l.entry_type === 'sale').author_earnings_vnd),Math.floor(53*123*.6));
assert.equal(Number(vnd.ledger.find(l => l.source_reference_id === gift.gift_id).author_earnings_vnd),4920);
assert.equal(Number(vnd.available_payout_vnd),4920,'refunded high sales and pending low sales cannot be withdrawn');
await assert.rejects(db.exec(`select author_request_payout_vnd(-1,'','negative-payout-test')`),/INVALID_PAYOUT_AMOUNT/);
await assert.rejects(db.exec(`select author_request_payout_vnd(5000,'','excess-payout-test')`),/INSUFFICIENT_REQUESTABLE_EARNINGS/);
const payout = await row(`select * from author_request_payout_vnd(4920,'','vnd-payout-one')`);
assert.equal(Number(payout.requested_vnd),4920);
assert.equal(Number(payout.net_vnd),4920);
assert.equal(payout.request_snapshot.destination_label,'Test bank destination');
assert.equal((await row(`select * from author_request_payout_vnd(4920,'','vnd-payout-one')`)).id,payout.id);
await assert.rejects(db.exec(`select author_request_payout_vnd(1,'','vnd-payout-two')`),/INSUFFICIENT_REQUESTABLE_EARNINGS/);
await db.exec(`select author_cancel_payout_request('${payout.id}')`);
assert.equal(Number((await row(`select get_author_vnd_dashboard('${author}') as data`)).data.available_payout_vnd),4920);
const concurrent = await Promise.allSettled([
 db.query(`select * from author_request_payout_vnd(4920,'','race-payout-one')`),
 db.query(`select * from author_request_payout_vnd(4920,'','race-payout-two')`),
]);
assert.equal(concurrent.filter(r => r.status === 'fulfilled').length,1,'overlapping withdrawal calls reserve only one available balance');
const racePayout = concurrent.find(r => r.status === 'fulfilled').value.rows[0];
await db.exec(`select author_cancel_payout_request('${racePayout.id}')`);
const paidRequest = await row(`select * from author_request_payout_vnd(4920,'','vnd-payout-paid')`);
await identity(admin);
await db.exec(`select admin_set_author_payout_compliance('${author}','verified','not_required','Test verified');
select admin_review_payout_request('${paidRequest.id}','approve','Test');
select admin_mark_payout_paid('${paidRequest.id}','test-transfer-reference','Test');
select admin_mark_payout_paid('${paidRequest.id}','test-transfer-reference','Test');`);
assert.equal(Number((await row(`select get_author_vnd_dashboard('${author}') as data`)).data.paid_vnd),4920);
await db.exec('select admin_set_author_payout_policy(456,5000,5500,7500,2000,1,12)');
assert.equal(Number((await row(`select * from author_vnd_ledger where id='${chapterVnd.id}'`)).author_earnings_vnd),Math.floor(51*123*.6),'policy never reprices history');
assert.equal(Number((await row(`select * from author_payouts where id='${paidRequest.id}'`)).fee_vnd),0,'payout fee snapshot never changes');
await db.exec(`select admin_settle_author_period('2020-01-01','2030-01-01',100000)`);
vnd = (await row(`select get_author_vnd_dashboard('${author}') as data`)).data;
assert.equal(Number(vnd.available_payout_vnd),60000,'actual low creator pool is now withdrawable');
await assert.rejects(db.exec(`select admin_settle_author_period('2020-01-01','2030-01-01',100000)`),/NO_PENDING_LOW_REVENUE/);
await db.exec(`select admin_refund_entitlement('chapter','${lowUnlock.entitlement_id}','Settled low refund','settled-low-refund');
select admin_refund_entitlement('chapter','${lowUnlock.entitlement_id}','Settled low refund','settled-low-refund-again');`);
assert.equal(Number((await row(`select get_author_vnd_dashboard('${author}') as data`)).data.available_payout_vnd),0,'settled low refund reverses exactly once');
// A refund after actual payment creates a debt adjustment; it never rewrites paid totals.
await db.exec(`update books set price_coins=105,is_vip=true where id='${book}'`);
await identity(reader);
const debtUnlock = await row(`select * from unlock_book_currency('${book}','paid-refund-book','high')`);
await identity(writer);
const debtRequest = await row(`select * from author_request_payout_vnd(13292,'','paid-refund-request')`);
assert.equal(Number(debtRequest.fee_vnd),12); assert.equal(Number(debtRequest.net_vnd),13280);
await identity(admin);
await db.exec(`select admin_review_payout_request('${debtRequest.id}','approve','Test');
select admin_mark_payout_paid('${debtRequest.id}','debt-test-transfer','Test');
select admin_refund_entitlement('book','${debtUnlock.entitlement_id}','After payout refund','after-payout-refund');
select admin_refund_entitlement('book','${debtUnlock.entitlement_id}','After payout refund','after-payout-refund-again');`);
vnd = (await row(`select get_author_vnd_dashboard('${author}') as data`)).data;
assert.equal(Number(vnd.debt_vnd),13292); assert.equal(Number(vnd.available_payout_vnd),0);
assert.equal(Number(vnd.paid_vnd),18212,'already paid history stays intact');
// Unconfigured high rates still allow entitlement, but cannot fabricate author VND.
await db.exec('select admin_set_author_payout_policy(null,6000,6000,8000,6000,1,0)');
await identity(reader);
const noRate = await row(`select * from unlock_book_currency('${book}','no-rate-book-unlock','high')`);
await identity(admin);
await db.exec(`update books set price_coins=8000 where id='${book}'`);
await identity(reader);
const repriced = await row(`select * from unlock_book_currency('${book}','existing-book-new-price','high')`);
assert.equal(repriced.entitlement_id,noRate.entitlement_id);
assert.equal(Number(repriced.price_paid_coins),53,'future price changes preserve purchased entitlement and original paid price');
await identity(writer);
vnd = (await row(`select get_author_vnd_dashboard('${author}') as data`)).data;
assert.equal(vnd.ledger.find(l => l.source_reference_id === noRate.entitlement_id).author_earnings_vnd,null);
await assert.rejects(db.exec(`select author_request_payout_vnd(1,'','disabled-rate-payout')`),/VND_RATE_NOT_CONFIGURED/);
await identity(admin);
await db.exec('select admin_set_author_payout_policy(789,6000,6000,8000,6000,1,0)');
assert.equal((await row(`select author_earnings_vnd from author_vnd_ledger where source_reference_id='${noRate.entitlement_id}'`)).author_earnings_vnd,null,'new rate never backfills missing historical VND');
await assert.rejects(db.exec(`update author_vnd_ledger set author_earnings_vnd=999 where id='${chapterVnd.id}'`));
await identity(reader);
await assert.rejects(db.exec(`select get_author_vnd_dashboard('${author}')`),/AUTHOR_ACCESS_REQUIRED/);
await assert.rejects(db.exec('select admin_set_author_payout_policy(1,6000,6000,8000,6000,1,0)'),/ADMIN_REQUIRED/);
await db.exec('reset role');
// No app subscription source is representable in the VND ledger, even with privileged writes.
await assert.rejects(db.exec(`insert into author_vnd_ledger(author_id,source_type,source_reference_id,currency_type,stones_spent,settlement_status) values('${author}','app_vip',gen_random_uuid(),'high',1,'pending_settlement')`));
assert.equal((await row('select count(*) as n from author_vnd_ledger where source_type not in (\'chapter_unlock\',\'book_unlock\',\'author_gift\')')).n,0);
await db.close();
console.log('PASS: VND snapshots, no-rate gating, low settlement, payout reservations/cancellation/payment, immutable policies, reversal/debt, VIP exclusion; legacy migration, both unlock currencies, rounding, idempotency, premium-only gifts, privacy, refunds, store reversals, rewards and wallet security');
