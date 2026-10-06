-- Expand deterministic story-cleanup rules for common Vietnamese scraper watermarks.
-- No AI is involved; this is intentionally rule-based and reversible.
begin;

create or replace function private.is_story_junk_line(p_line text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := lower(trim(coalesce(p_line,'')));
begin
  if v = '' then return false; end if;

  -- Pure scraper separators such as ///, ////, //|//, etc.
  if char_length(v) <= 120 and v ~ '^[[:space:]/\\|._~*=+-]{3,}$' then
    return true;
  end if;

  -- Scraped reader controls / obvious boilerplate.
  if char_length(v) <= 220 and (
    v ~ '^(chữ to|chu to).*(chữ nhỏ|chu nho)$'
    or v ~ '^(chương trước|chuong truoc|chương sau|chuong sau|mục lục|muc luc|đọc tiếp|doc tiep|trang chủ|trang chu|quảng cáo|quang cao)[[:space:][:punct:]]*$'
  ) then return true; end if;

  -- URL or known reading-site watermark. Punctuation around the site name is allowed:
  -- "//nettruyen", "nettruyen nettruyen", "/// truyenfull ///", etc.
  if char_length(v) <= 600 and (
    v ~ '(https?://|www\.)'
    or v ~ '(^|[^[:alnum:]_])(nettruyen|ntetruyen|nettruyenviet|truyenfull|truyenfullvn|truyenfulllive|metruyenchu|wikidich|tangthuvien|bachngocsach|sstruyen|dtruyen|truyenyy|truyencv|wattpad|wordpress|noveltoon|webtruyen)([^[:alnum:]_]|$)'
  ) then return true; end if;

  -- Source/editor/repost markers must look like labels, not normal narrative words.
  if char_length(v) <= 500 and (
    v ~ '^(nguồn|source|convert|converter|edit|editor|dịch|dich|beta|raw|reup)[[:space:]]*[:：|\-]'
    or v ~ '^edit(or)?[[:space:]]+(có lời muốn nói|co loi muon noi)[[:space:][:punct:]]*'
    or v ~ '^(đăng tại|dang tai|đọc tại|doc tai|đọc truyện tại|doc truyen tai|website|web truyện|web truyen|truyện được đăng|truyen duoc dang|truyện được lấy|truyen duoc lay|tham gia nhóm|tham gia group|join group|fanpage|facebook|telegram|zalo)[[:space:][:punct:]]'
  ) then return true; end if;

  -- Account-number spam. Do not match ordinary dialogue containing "chuyển khoản".
  if char_length(v) <= 260
     and v ~ '(^|[[:space:][:punct:]])(stk|số tài khoản|so tai khoan)([[:space:][:punct:]]|$)'
     and v ~ '([0-9][ .-]?){6,19}'
  then return true; end if;

  if char_length(v) <= 500 and v ~
    '(vui lòng không reup|vui long khong reup|không reup|khong reup|không copy|khong copy|cấm reup|cam reup|cấm sao chép|cam sao chep|ủng hộ team|ung ho team|ủng hộ editor|ung ho editor)'
  then return true; end if;

  return false;
end;
$$;

commit;
