-- Reclassify the existing authorized catalog so discovery is no longer
-- dominated by the old generic "Tiên hiệp" assignment.
-- Primary genre prefers strong title signals; if title is unclear, it reads
-- the first chapter sample. Additional high-confidence title tags are kept
-- for multi-genre discovery.

begin;

with signals as (
  select b.id,b.title,
         lower(b.title) as t,
         lower(coalesce((
           select left(c.content,7000)
           from public.chapters c
           where c.book_id=b.id
           order by c.chapter_number
           limit 1
         ),'')) as c
  from public.books b
  where b.source_type='authorized'
),
classified as (
  select id,
    case
      when t ~ '(xuyên (không|thư|thành|qua|về|vào))' then 'Xuyên không'
      when t ~ '(trọng sinh|sống lại|quay về năm|trở lại năm)' then 'Trọng sinh'
      when t ~ '(hệ thống|ký chủ|ban thưởng|rút thưởng|100 triệu mạng)' then 'Hệ thống'
      when t ~ '(mạt thế|tận thế|zombie|xác sống)' then 'Mạt thế'
      when t ~ '(đam mỹ|boy love|song nam chủ|underground idol)' then 'Đam mỹ'
      when t ~ '(cung đấu|hậu cung|hoàng hậu|quý phi|sủng phi)' then 'Cung đấu'
      when t ~ '(huyền học|bói toán|phong thủy|xem tướng)' then 'Huyền học'
      when t ~ '(trinh thám|phá án|thám tử|pháp y|vụ án)' then 'Trinh thám'
      when t ~ '(esports|thể thao điện tử|tuyển thủ|đội tuyển)' then 'Esports'
      when t ~ '(giới giải trí|showbiz|minh tinh|ảnh đế|idol|thần tượng|livestream)' then 'Giới giải trí'
      when t ~ '(tu tiên|tu chân|tiên đế|tiên tôn|trường sinh|phi thăng|tông môn|tiên môn)' then 'Tiên hiệp'
      when t ~ '(huyền huyễn|đấu la|đấu phá|võ hồn|dị giới|đại đế|chí tôn)' then 'Huyền huyễn'
      when t ~ '(khoa huyễn|tinh tế|cơ giáp|vũ trụ|robot|chiến hạm)' then 'Khoa huyễn'
      when t ~ '(kinh dị|linh dị|cương thi|ma ám|quỷ)' then 'Kinh dị'
      when t ~ '(kiếm hiệp|võ hiệp|võ lâm|giang hồ|hiệp khách)' then 'Kiếm hiệp'
      when t ~ '(fantasy|ma pháp|pháp sư|phù thủy|ma vương)' then 'Fantasy'
      when t ~ '(điền văn|điền viên|nông gia|làm ruộng|trồng trọt)' then 'Điền văn'
      when t ~ '(vô hạn lưu|phó bản|chủ thần|trò chơi sinh tồn)' then 'Vô hạn lưu'
      when t ~ '(niên đại|thập niên (50|60|70|80|90)|thời bao cấp)' then 'Niên đại'
      when t ~ '(vương gia|điện hạ|hoàng đế|công chúa|sủng phi)' then 'Cổ đại'
      when t ~ '(tổng tài|phu nhân|hào môn|hôn nhân|ly hôn|vợ cũ|tình yêu)' then 'Ngôn tình'
      when c ~ '(xuyên không|xuyên thư|xuyên thành|xuyên vào truyện|xuyên vào sách)' then 'Xuyên không'
      when c ~ '(trọng sinh|sống lại|quay về năm|trở lại năm|làm lại cuộc đời)' then 'Trọng sinh'
      when c ~ '(ký chủ|ban thưởng|rút thưởng|bảng thuộc tính|điểm kỹ năng|hệ thống nhiệm vụ|hệ thống ban thưởng)' then 'Hệ thống'
      when c ~ '(mạt thế|tận thế|zombie|xác sống|dị năng|thây ma)' then 'Mạt thế'
      when c ~ '(đam mỹ|boy love|công thụ|song nam chủ|(^|[^[:alnum:]_])thụ([^[:alnum:]_]|$))' then 'Đam mỹ'
      when c ~ '(hậu cung|hoàng hậu|quý phi|phi tần|sủng phi|lãnh cung|thái hậu)' then 'Cung đấu'
      when c ~ '(huyền học|bói toán|phong thủy|xem tướng|mệnh lý|quẻ bói)' then 'Huyền học'
      when c ~ '(trinh thám|phá án|thám tử|pháp y|vụ án|hung thủ|cảnh sát|điều tra viên|lệnh truy nã)' then 'Trinh thám'
      when c ~ '(thể thao điện tử|đội tuyển|tuyển thủ|mvp|giải đấu game|thi đấu game)' then 'Esports'
      when c ~ '(giới giải trí|showbiz|minh tinh|ảnh đế|idol|thần tượng|diễn viên|ca sĩ)' then 'Giới giải trí'
      when c ~ '(tu tiên|tu chân|người tu tiên|tiên đế|phi thăng|độ kiếp|linh căn|nguyên anh|kim đan|tông môn|tiên môn|linh kiếm)' then 'Tiên hiệp'
      when c ~ '(huyền huyễn|đấu la|đấu phá|võ hồn|dị giới|thần vực|đại đế|chí tôn|huyết mạch|linh thú)' then 'Huyền huyễn'
      when c ~ '(khoa huyễn|tinh tế|cơ giáp|phi thuyền|vũ trụ|người máy|robot|chiến hạm)' then 'Khoa huyễn'
      when c ~ '(kinh dị|linh dị|cương thi|ma ám|âm phủ|nhà ma|tâm linh|quỷ)' then 'Kinh dị'
      when c ~ '(kiếm hiệp|võ hiệp|võ lâm|giang hồ|hiệp khách|kiếm khách)' then 'Kiếm hiệp'
      when c ~ '(fantasy|ma pháp|pháp sư|phù thủy|dũng giả|ma vương)' then 'Fantasy'
      when c ~ '(điền văn|điền viên|nông gia|làm ruộng|trồng trọt|thôn quê|nông thôn)' then 'Điền văn'
      when c ~ '(vô hạn lưu|phó bản|chủ thần|luân hồi|trò chơi sinh tồn)' then 'Vô hạn lưu'
      when c ~ '(niên đại|thập niên (50|60|70|80|90)|thời bao cấp|thời kỳ đầu lập quốc)' then 'Niên đại'
      when c ~ '(vương gia|điện hạ|hoàng đế|công chúa|tử cấm thành|thừa tướng|hầu phủ|vương phủ|kinh thành)' then 'Cổ đại'
      when c ~ '(ngôn tình|tổng tài|phu nhân|hào môn|hôn nhân|ly hôn|kết hôn|vợ cũ|bạn trai|bạn gái|tình yêu)' then 'Ngôn tình'
      when c ~ '(đô thị|thành phố|công ty|tập đoàn|bệnh viện|đại học|trung học|wechat|chung cư)' then 'Đô thị'
      else 'Khác'
    end as genre,
    t
  from signals
),
authorized as (
  select id from public.books where source_type='authorized'
)
delete from public.book_genres bg
using authorized a
where bg.book_id=a.id;

with signals as (
  select b.id,lower(b.title) as t,
         lower(coalesce((
           select left(c.content,7000)
           from public.chapters c
           where c.book_id=b.id
           order by c.chapter_number
           limit 1
         ),'')) as c
  from public.books b
  where b.source_type='authorized'
),
classified as (
  select id,
    case
      when t ~ '(xuyên (không|thư|thành|qua|về|vào))' then 'Xuyên không'
      when t ~ '(trọng sinh|sống lại|quay về năm|trở lại năm)' then 'Trọng sinh'
      when t ~ '(hệ thống|ký chủ|ban thưởng|rút thưởng|100 triệu mạng)' then 'Hệ thống'
      when t ~ '(mạt thế|tận thế|zombie|xác sống)' then 'Mạt thế'
      when t ~ '(đam mỹ|boy love|song nam chủ|underground idol)' then 'Đam mỹ'
      when t ~ '(cung đấu|hậu cung|hoàng hậu|quý phi|sủng phi)' then 'Cung đấu'
      when t ~ '(huyền học|bói toán|phong thủy|xem tướng)' then 'Huyền học'
      when t ~ '(trinh thám|phá án|thám tử|pháp y|vụ án)' then 'Trinh thám'
      when t ~ '(esports|thể thao điện tử|tuyển thủ|đội tuyển)' then 'Esports'
      when t ~ '(giới giải trí|showbiz|minh tinh|ảnh đế|idol|thần tượng|livestream)' then 'Giới giải trí'
      when t ~ '(tu tiên|tu chân|tiên đế|tiên tôn|trường sinh|phi thăng|tông môn|tiên môn)' then 'Tiên hiệp'
      when t ~ '(huyền huyễn|đấu la|đấu phá|võ hồn|dị giới|đại đế|chí tôn)' then 'Huyền huyễn'
      when t ~ '(khoa huyễn|tinh tế|cơ giáp|vũ trụ|robot|chiến hạm)' then 'Khoa huyễn'
      when t ~ '(kinh dị|linh dị|cương thi|ma ám|quỷ)' then 'Kinh dị'
      when t ~ '(kiếm hiệp|võ hiệp|võ lâm|giang hồ|hiệp khách)' then 'Kiếm hiệp'
      when t ~ '(fantasy|ma pháp|pháp sư|phù thủy|ma vương)' then 'Fantasy'
      when t ~ '(điền văn|điền viên|nông gia|làm ruộng|trồng trọt)' then 'Điền văn'
      when t ~ '(vô hạn lưu|phó bản|chủ thần|trò chơi sinh tồn)' then 'Vô hạn lưu'
      when t ~ '(niên đại|thập niên (50|60|70|80|90)|thời bao cấp)' then 'Niên đại'
      when t ~ '(vương gia|điện hạ|hoàng đế|công chúa|sủng phi)' then 'Cổ đại'
      when t ~ '(tổng tài|phu nhân|hào môn|hôn nhân|ly hôn|vợ cũ|tình yêu)' then 'Ngôn tình'
      when c ~ '(xuyên không|xuyên thư|xuyên thành|xuyên vào truyện|xuyên vào sách)' then 'Xuyên không'
      when c ~ '(trọng sinh|sống lại|quay về năm|trở lại năm|làm lại cuộc đời)' then 'Trọng sinh'
      when c ~ '(ký chủ|ban thưởng|rút thưởng|bảng thuộc tính|điểm kỹ năng|hệ thống nhiệm vụ|hệ thống ban thưởng)' then 'Hệ thống'
      when c ~ '(mạt thế|tận thế|zombie|xác sống|dị năng|thây ma)' then 'Mạt thế'
      when c ~ '(đam mỹ|boy love|công thụ|song nam chủ|(^|[^[:alnum:]_])thụ([^[:alnum:]_]|$))' then 'Đam mỹ'
      when c ~ '(hậu cung|hoàng hậu|quý phi|phi tần|sủng phi|lãnh cung|thái hậu)' then 'Cung đấu'
      when c ~ '(huyền học|bói toán|phong thủy|xem tướng|mệnh lý|quẻ bói)' then 'Huyền học'
      when c ~ '(trinh thám|phá án|thám tử|pháp y|vụ án|hung thủ|cảnh sát|điều tra viên|lệnh truy nã)' then 'Trinh thám'
      when c ~ '(thể thao điện tử|đội tuyển|tuyển thủ|mvp|giải đấu game|thi đấu game)' then 'Esports'
      when c ~ '(giới giải trí|showbiz|minh tinh|ảnh đế|idol|thần tượng|diễn viên|ca sĩ)' then 'Giới giải trí'
      when c ~ '(tu tiên|tu chân|người tu tiên|tiên đế|phi thăng|độ kiếp|linh căn|nguyên anh|kim đan|tông môn|tiên môn|linh kiếm)' then 'Tiên hiệp'
      when c ~ '(huyền huyễn|đấu la|đấu phá|võ hồn|dị giới|thần vực|đại đế|chí tôn|huyết mạch|linh thú)' then 'Huyền huyễn'
      when c ~ '(khoa huyễn|tinh tế|cơ giáp|phi thuyền|vũ trụ|người máy|robot|chiến hạm)' then 'Khoa huyễn'
      when c ~ '(kinh dị|linh dị|cương thi|ma ám|âm phủ|nhà ma|tâm linh|quỷ)' then 'Kinh dị'
      when c ~ '(kiếm hiệp|võ hiệp|võ lâm|giang hồ|hiệp khách|kiếm khách)' then 'Kiếm hiệp'
      when c ~ '(fantasy|ma pháp|pháp sư|phù thủy|dũng giả|ma vương)' then 'Fantasy'
      when c ~ '(điền văn|điền viên|nông gia|làm ruộng|trồng trọt|thôn quê|nông thôn)' then 'Điền văn'
      when c ~ '(vô hạn lưu|phó bản|chủ thần|luân hồi|trò chơi sinh tồn)' then 'Vô hạn lưu'
      when c ~ '(niên đại|thập niên (50|60|70|80|90)|thời bao cấp|thời kỳ đầu lập quốc)' then 'Niên đại'
      when c ~ '(vương gia|điện hạ|hoàng đế|công chúa|tử cấm thành|thừa tướng|hầu phủ|vương phủ|kinh thành)' then 'Cổ đại'
      when c ~ '(ngôn tình|tổng tài|phu nhân|hào môn|hôn nhân|ly hôn|kết hôn|vợ cũ|bạn trai|bạn gái|tình yêu)' then 'Ngôn tình'
      when c ~ '(đô thị|thành phố|công ty|tập đoàn|bệnh viện|đại học|trung học|wechat|chung cư)' then 'Đô thị'
      else 'Khác'
    end as genre,
    t
  from signals
)
insert into public.book_genres(book_id,genre)
select id,genre from classified;

-- Add secondary tags only from strong title signals so discovery can find a
-- story by important tropes without noisy full-text over-tagging.
with signals as (
  select b.id,lower(b.title) as t
  from public.books b
  where b.source_type='authorized'
),
extra as (
  select id,'Xuyên không' genre from signals where t ~ '(xuyên (không|thư|thành|qua|về|vào))'
  union all select id,'Trọng sinh' from signals where t ~ '(trọng sinh|sống lại)'
  union all select id,'Hệ thống' from signals where t ~ '(hệ thống|ký chủ|ban thưởng|rút thưởng|100 triệu mạng)'
  union all select id,'Mạt thế' from signals where t ~ '(mạt thế|tận thế|zombie|xác sống)'
  union all select id,'Đam mỹ' from signals where t ~ '(đam mỹ|boy love|song nam chủ|underground idol)'
  union all select id,'Cung đấu' from signals where t ~ '(cung đấu|hậu cung|hoàng hậu|quý phi|sủng phi)'
  union all select id,'Huyền học' from signals where t ~ '(huyền học|bói toán|phong thủy|xem tướng)'
  union all select id,'Trinh thám' from signals where t ~ '(trinh thám|phá án|thám tử|pháp y|vụ án)'
  union all select id,'Esports' from signals where t ~ '(esports|thể thao điện tử|tuyển thủ|đội tuyển)'
  union all select id,'Giới giải trí' from signals where t ~ '(giới giải trí|showbiz|minh tinh|ảnh đế|idol|thần tượng|livestream)'
  union all select id,'Tiên hiệp' from signals where t ~ '(tu tiên|tu chân|tiên đế|tiên tôn|trường sinh|phi thăng|tông môn|tiên môn)'
  union all select id,'Huyền huyễn' from signals where t ~ '(huyền huyễn|đấu la|đấu phá|võ hồn|dị giới|đại đế|chí tôn)'
  union all select id,'Khoa huyễn' from signals where t ~ '(khoa huyễn|tinh tế|cơ giáp|vũ trụ|robot|chiến hạm)'
  union all select id,'Kinh dị' from signals where t ~ '(kinh dị|linh dị|cương thi|ma ám|quỷ)'
  union all select id,'Kiếm hiệp' from signals where t ~ '(kiếm hiệp|võ hiệp|võ lâm|giang hồ|hiệp khách)'
  union all select id,'Fantasy' from signals where t ~ '(fantasy|ma pháp|pháp sư|phù thủy|ma vương)'
  union all select id,'Điền văn' from signals where t ~ '(điền văn|điền viên|nông gia|làm ruộng|trồng trọt)'
  union all select id,'Vô hạn lưu' from signals where t ~ '(vô hạn lưu|phó bản|chủ thần|trò chơi sinh tồn)'
  union all select id,'Niên đại' from signals where t ~ '(niên đại|thập niên (50|60|70|80|90)|thời bao cấp)'
  union all select id,'Cổ đại' from signals where t ~ '(vương gia|điện hạ|hoàng đế|công chúa|sủng phi)'
  union all select id,'Ngôn tình' from signals where t ~ '(tổng tài|phu nhân|hào môn|hôn nhân|ly hôn|vợ cũ|tình yêu)'
)
insert into public.book_genres(book_id,genre)
select distinct e.id,e.genre
from extra e
where not exists (
  select 1 from public.book_genres bg where bg.book_id=e.id and bg.genre=e.genre
);

commit;
