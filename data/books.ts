import { Book, Chapter, CommentItem } from '../types';

const chapterTitles = [
  'Gió đổi chiều', 'Người trong màn mưa', 'Lời hẹn dưới hiên', 'Một ngọn đèn xa',
  'Dấu chân bên sông', 'Bức thư chưa gửi', 'Đêm không trăng', 'Khách từ phương Bắc',
  'Qua miền ký ức', 'Tiếng chuông cuối phố', 'Mây tan trên đỉnh núi', 'Cánh cửa thứ hai',
  'Trước giờ ly biệt', 'Hương trà đầu đông', 'Bí mật trong thư phòng', 'Đường về có nắng'
];

function makeChapters(total: number, progress: number, vipFrom = 1): Chapter[] {
  const readTo = Math.floor(total * progress / 100);
  return Array.from({ length: total }, (_, index) => {
    const number = index + 1;
    const daysAgo = total - number;
    return {
      number,
      title: chapterTitles[(number * 7 + total) % chapterTitles.length],
      date: daysAgo === 0 ? 'Hôm nay' : daysAgo === 1 ? 'Hôm qua' : `${Math.min(daysAgo, 28)} ngày trước`,
      relativeDate: number === total ? '2 giờ trước' : number === total - 1 ? '5 giờ trước' : `${Math.min(daysAgo + 1, 28)} ngày trước`,
      access: number >= vipFrom && number % 5 === 1 ? 'vip' : 'free',
      isRead: number <= readTo,
      isDownloaded: number <= readTo && number % 3 === 0
    };
  });
}

type BookSeed = Omit<Book, 'chapters'>;

const seeds: BookSeed[] = [
  {
    id: 'kiem-yen-van', title: 'Kiếm Yên Vân', author: 'Mộc Phong', authorFollowers: '128K', cover: '#294C60',
    genre: 'Tiên hiệp', rating: 4.9, views: '12,8M', followers: '386K', status: 'Đang ra',
    description: 'Giữa Yên Vân mười sáu châu đầy biến động, một thiếu niên mang thanh kiếm gãy rời làng để tìm lại tên thật của cha. Càng tiến sâu vào giang hồ, cậu càng nhận ra món nợ năm xưa không chỉ thuộc về một gia tộc, mà còn che giấu vận mệnh của cả vùng biên ải.',
    tags: ['Giang hồ', 'Trưởng thành', 'Ân oán'], totalChapters: 240, latestChapter: 240, isVip: true, price: 3, progress: 77.5
  },
  {
    id: 'thanh-pho-sau-mua', title: 'Thành Phố Sau Mưa', author: 'An Nhiên', authorFollowers: '83K', cover: '#6D2E46',
    genre: 'Đô thị', rating: 4.8, views: '6,4M', followers: '214K', status: 'Đã hoàn thành',
    description: 'Một kiến trúc sư trở lại Đà Lạt sau mười năm, tiếp quản căn nhà kính cũ và những bức thư không đề tên. Trong những ngày thành phố chìm trong mưa, cô gặp lại người từng biến mất khỏi tuổi trẻ mình.',
    tags: ['Chữa lành', 'Đà Lạt', 'Tình cảm'], totalChapters: 210, latestChapter: 210, isVip: true, price: 2, progress: 41
  },
  {
    id: 'nguoi-giu-ky-uc', title: 'Người Giữ Ký Ức', author: 'Hạ Lam', authorFollowers: '62K', cover: '#4E426D',
    genre: 'Fantasy', rating: 4.8, views: '4,9M', followers: '176K', status: 'Đang ra',
    description: 'Ở thành phố nơi ký ức có thể mua bán, Minh Châu làm nghề phục chế những tháng ngày đã vỡ. Một vị khách lạ mang đến ký ức không thuộc về bất kỳ người sống nào, kéo cô vào bí mật bị chôn dưới tháp đồng hồ.',
    tags: ['Kỳ ảo', 'Bí ẩn', 'Nữ cường'], totalChapters: 168, latestChapter: 168, isVip: false, price: 0, progress: 20
  },
  {
    id: 'he-thong-tiem-nho', title: 'Hệ Thống Tiệm Nhỏ', author: 'Lâm Khê', authorFollowers: '91K', cover: '#2D6A62',
    genre: 'Hệ thống', rating: 4.7, views: '8,1M', followers: '245K', status: 'Đang ra',
    description: 'Sau một lần mất việc, Hoài Nam nhận được chìa khóa của tiệm tạp hóa chỉ mở cửa lúc nửa đêm. Mỗi món hàng bán đi sẽ đổi lấy một câu chuyện, và mỗi câu chuyện lại mở thêm một cánh cửa kỳ lạ.',
    tags: ['Đời thường', 'Hài hước', 'Ấm áp'], totalChapters: 196, latestChapter: 196, isVip: true, price: 2, progress: 8
  },
  {
    id: 'trieu-dai-cuoi-cung', title: 'Triều Đại Cuối Cùng', author: 'Vũ Tịch', authorFollowers: '156K', cover: '#70452D',
    genre: 'Lịch sử', rating: 4.9, views: '15,2M', followers: '421K', status: 'Đã hoàn thành',
    description: 'Cuối mùa hạ năm ấy, người chép sử trẻ tuổi bước vào hoàng thành và chứng kiến một triều đại đi đến hồi kết. Giữa quyền lực và sự thật, anh phải chọn điều nào sẽ được lưu lại cho hậu thế.',
    tags: ['Cung đình', 'Quyền mưu', 'Chính kịch'], totalChapters: 320, latestChapter: 320, isVip: true, price: 4, progress: 0
  },
  {
    id: 'hang-thu-bay', title: 'Hàng Ghế Thứ Bảy', author: 'Miên Du', authorFollowers: '45K', cover: '#9A6555',
    genre: 'Ngôn tình', rating: 4.6, views: '3,7M', followers: '142K', status: 'Đã hoàn thành',
    description: 'Hai người xa lạ luôn vô tình ngồi cạnh nhau ở hàng ghế thứ bảy của rạp chiếu phim cũ. Khi rạp sắp đóng cửa, họ quyết định cùng nhau hoàn thành danh sách mười bộ phim còn dang dở.',
    tags: ['Hiện đại', 'Nhẹ nhàng', 'Điện ảnh'], totalChapters: 108, latestChapter: 108, isVip: false, price: 0, progress: 0
  },
  {
    id: 'tram-thu-phat-song', title: 'Trạm Thu Phát Sóng', author: 'Tường Vi', authorFollowers: '38K', cover: '#315D67',
    genre: 'Trinh thám', rating: 4.8, views: '5,2M', followers: '188K', status: 'Đang ra',
    description: 'Một kỹ sư âm thanh nhận được tín hiệu radio phát từ tương lai đúng bảy ngày. Mỗi bản tin đều báo trước một vụ mất tích, nhưng lần này cái tên được đọc lên chính là cô.',
    tags: ['Phá án', 'Khoa học', 'Căng thẳng'], totalChapters: 142, latestChapter: 142, isVip: true, price: 3, progress: 0
  },
  {
    id: 'bep-lua-mua-dong', title: 'Bếp Lửa Mùa Đông', author: 'Nguyên Hà', authorFollowers: '72K', cover: '#A1593B',
    genre: 'Chữa lành', rating: 4.7, views: '4,1M', followers: '163K', status: 'Đang ra',
    description: 'Một đầu bếp trẻ rời thành phố về mở quán ăn bên bến sông quê ngoại. Những món ăn cũ, những vị khách quen và cuốn sổ tay của bà dần giúp cô tìm lại nhịp sống đã đánh mất.',
    tags: ['Ẩm thực', 'Gia đình', 'Đời thường'], totalChapters: 126, latestChapter: 126, isVip: false, price: 0, progress: 0
  },
  {
    id: 'mat-troi-duoi-day-bien', title: 'Mặt Trời Dưới Đáy Biển', author: 'Đông Quân', authorFollowers: '104K', cover: '#1F5063',
    genre: 'Khoa học', rating: 4.8, views: '7,6M', followers: '229K', status: 'Đang ra',
    description: 'Đội khảo sát đáy biển Đông phát hiện một quầng sáng không thuộc về địa chất. Cuộc lặn sâu ba nghìn mét mở ra dấu vết của nền văn minh từng tồn tại trước mọi trang sử.',
    tags: ['Viễn tưởng', 'Thám hiểm', 'Bí ẩn'], totalChapters: 184, latestChapter: 184, isVip: true, price: 3, progress: 0
  },
  {
    id: 'mua-phuong-nam', title: 'Mùa Phương Nam', author: 'Khánh Ly', authorFollowers: '51K', cover: '#7B7842',
    genre: 'Văn học', rating: 4.9, views: '2,9M', followers: '119K', status: 'Đã hoàn thành',
    description: 'Bốn người bạn lớn lên bên một dòng kênh miền Tây, cùng hẹn mỗi mùa nước nổi sẽ trở về. Hai mươi năm sau, lời hẹn cũ đưa họ đối diện những điều chưa từng dám nói.',
    tags: ['Miền Tây', 'Tình bạn', 'Hoài niệm'], totalChapters: 96, latestChapter: 96, isVip: false, price: 0, progress: 0
  },
  {
    id: 'hoa-tieu-tren-may', title: 'Hoa Tiêu Trên Mây', author: 'Bắc Thần', authorFollowers: '88K', cover: '#486078',
    genre: 'Xuyên không', rating: 4.6, views: '9,3M', followers: '267K', status: 'Đang ra',
    description: 'Nữ phi công thử nghiệm tỉnh dậy trên một phi thuyền gỗ giữa biển mây. Không bản đồ, không la bàn, cô phải dẫn một đoàn thương nhân đi qua vùng trời nơi bão tố biết gọi tên người.',
    tags: ['Phiêu lưu', 'Nữ cường', 'Dị giới'], totalChapters: 232, latestChapter: 232, isVip: true, price: 3, progress: 0
  },
  {
    id: 'tiem-anh-cuoi-pho', title: 'Tiệm Ảnh Cuối Phố', author: 'Cẩm Tú', authorFollowers: '43K', cover: '#76565E',
    genre: 'Kinh dị', rating: 4.7, views: '3,4M', followers: '151K', status: 'Đang ra',
    description: 'Tiệm ảnh chỉ nhận khách sau nửa đêm và mỗi tấm hình rửa ra đều có thêm một bóng người. Người thợ mới học việc phải tìm danh tính của họ trước khi căn phòng tối không còn mở cửa.',
    tags: ['Tâm linh', 'Điều tra', 'Đô thị'], totalChapters: 154, latestChapter: 154, isVip: true, price: 2, progress: 0
  }
];

export const books: Book[] = seeds.map((book) => ({
  ...book,
  chapters: makeChapters(book.totalChapters, book.progress, Math.floor(book.totalChapters * 0.45))
}));

export const getBook = (id?: string) => books.find((book) => book.id === id) ?? books[0];

export const comments: CommentItem[] = [
  { id: '1', name: 'Hà My', avatar: 'HM', body: 'Nhịp truyện chương này rất đẹp, đoạn đối thoại dưới mưa đọc xong vẫn còn ám ảnh.', time: '18 phút trước', likes: 42 },
  { id: '2', name: 'Trần Minh', avatar: 'TM', body: 'Tác giả cài chi tiết thanh kiếm từ những chương đầu hay thật. Mong sớm có chương mới!', time: '1 giờ trước', likes: 27 },
  { id: '3', name: 'Mây Nhỏ', avatar: 'MN', body: 'Mình thích cách nhân vật chính bình tĩnh hơn sau mỗi biến cố, trưởng thành rất tự nhiên.', time: 'Hôm qua', likes: 19 }
];
