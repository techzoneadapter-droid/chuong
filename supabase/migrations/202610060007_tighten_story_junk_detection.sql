-- Tighten story-junk detection to avoid deleting legitimate narrative prose.
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

  if char_length(v) <= 220 and (
    v ~ '^(chữ to|chu to).*(chữ nhỏ|chu nho)$'
    or v ~ '^(chương trước|chuong truoc|chương sau|chuong sau|mục lục|muc luc|đọc tiếp|doc tiep|trang chủ|trang chu|quảng cáo|quang cao)[[:space:][:punct:]]*$'
  ) then return true; end if;

  if char_length(v) <= 600 and (
    v ~ '(https?://|www\.)'
    or v ~ '(^|[^[:alnum:]_])(truyenfull|truyenfullvn|truyenfulllive|metruyenchu|wikidich|tangthuvien|bachngocsach|sstruyen|dtruyen|truyenyy|truyencv|wattpad|wordpress|noveltoon|webtruyen)([^[:alnum:]_]|$)'
  ) then return true; end if;

  if char_length(v) <= 500 and (
    v ~ '^(nguồn|source|convert|converter|edit|editor|dịch|dich|beta|raw|reup)[[:space:]]*[:：|\-]'
    or v ~ '^edit(or)?[[:space:]]+(có lời muốn nói|co loi muon noi)[[:space:][:punct:]]*'
    or v ~ '^(đăng tại|dang tai|đọc tại|doc tai|đọc truyện tại|doc truyen tai|website|web truyện|web truyen|truyện được đăng|truyen duoc dang|truyện được lấy|truyen duoc lay|tham gia nhóm|tham gia group|join group|fanpage|facebook|telegram|zalo)[[:space:][:punct:]]'
  ) then return true; end if;

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
