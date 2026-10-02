const openings = [
  'Gió từ triền núi tràn xuống khi trời vừa sang canh. Mùi đất ẩm quyện với hương thông, len qua khe cửa căn trọ nhỏ và lay ngọn đèn dầu chỉ còn một quầng sáng mỏng.',
  'Cơn mưa đã ngớt, nhưng nước vẫn rơi đều từ mái hiên xuống phiến đá xanh. Ngoài phố, tiếng vó ngựa xa dần, để lại khoảng lặng khiến người ta nghe rõ cả nhịp thở của mình.',
  'Bình minh chưa kịp chạm tới chân trời, bến sông đã sáng lên bởi hàng chục chiếc đèn lồng. Những người khuân vác nói với nhau bằng giọng thật khẽ, như sợ đánh thức màn sương.'
];

const paragraphs = [
  'Diệp Phàm đặt chén trà xuống, đầu ngón tay dừng lại trên vết nứt mảnh chạy quanh miệng chén. Chàng đã nhìn thấy dấu hiệu ấy ở trạm dịch ba ngày trước: một nét khắc giống cánh chim, rất nông, chỉ hiện lên khi nghiêng về phía ánh sáng. Người để lại nó hẳn biết chàng sẽ đi qua con đường này.',
  '“Nếu đã tới, sao còn đứng ngoài cửa?” chàng hỏi. Không ai đáp. Chỉ có tấm rèm tre khẽ lay, rồi một bóng người khoác áo tơi bước vào. Nước mưa chảy dọc vành nón, che đi gần nửa khuôn mặt, nhưng đôi mắt kia thì chàng không thể nhận nhầm.',
  'Người khách không ngồi. Nàng lấy từ tay áo một phong thư đã nhàu, đặt lên bàn rồi lùi lại nửa bước. Con dấu đỏ trên thư đã bị cạo mất, còn mép giấy ám một lớp tro mỏng. “Thứ huynh tìm không còn ở phủ thành,” nàng nói. “Đêm qua có người mang nó về phía bắc.”',
  'Bên ngoài, tiếng chuông canh vang lên ba hồi. Diệp Phàm mở thư, bên trong chỉ có một hàng chữ viết vội và tấm bản đồ nhỏ bằng lòng bàn tay. Nét mực ở cuối câu bị kéo dài, chứng tỏ người viết đã phải dừng bút đột ngột. Chàng đọc lại lần nữa, cảm giác lạnh chạy dọc sống lưng.',
  'Mười năm trước, cũng trong một đêm mưa như thế, cha chàng rời nhà với lời hẹn sẽ trở về trước mùa lúa chín. Lời hẹn ấy chưa bao giờ thành sự thật. Từ đó, mỗi manh mối đều đưa chàng tới một ngõ cụt, mỗi nhân chứng đều im lặng ngay trước khi nói ra điều quan trọng nhất.',
  'Nàng kéo ghế ngồi xuống, đôi bàn tay ôm lấy chén trà còn ấm. “Con đường phía bắc đã bị phong tỏa. Muốn qua đó, chúng ta phải đi theo lối cũ xuyên rừng Thạch Môn.” Giọng nàng bình thản, nhưng ánh mắt lại dừng ở thanh kiếm gãy bên hông chàng lâu hơn cần thiết.',
  'Diệp Phàm gấp tấm bản đồ, cẩn thận giấu vào lớp áo trong. Chàng hiểu chuyến đi này có thể là một cái bẫy. Song có những cánh cửa, dù biết sau đó là vực sâu, người ta vẫn phải tự tay mở ra. Bởi đứng yên đôi khi còn đáng sợ hơn bước tiếp.',
  'Hai người rời quán khi trời bắt đầu hửng. Trên mái ngói, những giọt nước cuối cùng phản chiếu màu đỏ nhạt của bình minh. Người chủ quán đứng sau rèm, lặng lẽ nhìn theo cho tới khi bóng họ khuất hẳn ở cuối con dốc.',
  'Ở phía xa, một cánh chim đen bay vòng trên tháp canh rồi đột ngột đổi hướng. Diệp Phàm siết dây cương. Chàng không quay đầu, nhưng biết từ khoảnh khắc ấy, mọi bước chân của họ đều đã nằm trong tầm mắt của kẻ khác.',
  'Con đường rừng mở ra trước mặt, hẹp và sâu hun hút. Nắng sớm lọt qua tầng lá, rơi thành từng mảng sáng nhỏ trên nền đất. Nàng thúc ngựa đi trước, để lại một câu gần như tan trong gió: “Qua khỏi Thạch Môn, huynh sẽ không thể giả vờ rằng mình chưa biết gì nữa.”',
  'Diệp Phàm khẽ cười, nụ cười không có chút vui vẻ. Chàng đã chờ câu nói này suốt mười năm. Thanh kiếm gãy va nhẹ vào yên ngựa, phát ra âm thanh khô khốc như một lời đáp.',
  'Sau lưng họ, thị trấn thức dậy trong tiếng rao hàng và khói bếp. Không ai chú ý cánh cửa căn trọ vừa khép, cũng không ai biết một bức thư ngắn ngủi đã khiến bánh xe của câu chuyện bắt đầu chuyển động theo hướng hoàn toàn khác.'
];

export function getChapterContent(chapter: number): string[] {
  const shift = chapter % paragraphs.length;
  return [openings[chapter % openings.length], ...paragraphs.slice(shift), ...paragraphs.slice(0, shift)];
}
