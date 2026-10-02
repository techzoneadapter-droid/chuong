export type ConvertMode = 'Convert chuẩn' | 'Convert mượt' | 'Hiện đại' | 'Kiếm hiệp' | 'Ngôn tình';

export const originalExcerpt = 'Diệp Phàm ánh mắt ngưng tụ, đối với người phía trước mở miệng nói.';

const converted: Record<ConvertMode, string> = {
  'Convert chuẩn': 'Diệp Phàm chăm chú nhìn người phía trước rồi lên tiếng.',
  'Convert mượt': 'Diệp Phàm khẽ nheo mắt, nhìn người trước mặt rồi lên tiếng.',
  'Hiện đại': 'Diệp Phàm nhìn thẳng người đối diện và cất lời.',
  'Kiếm hiệp': 'Diệp Phàm thu ánh mắt, hướng về người trước mặt mà trầm giọng nói.',
  'Ngôn tình': 'Ánh mắt Diệp Phàm khẽ dừng trên người đối diện, rồi chậm rãi cất lời.'
};

export function convertExcerpt(mode: ConvertMode, variation = 0) {
  const base = converted[mode];
  return variation % 2 === 0 ? base : `${base.replace(/[.]$/, '')}, giọng nói bình tĩnh mà rõ ràng.`;
}

export function answerStoryQuestion(question: string) {
  const normalized = question.toLowerCase();
  if (normalized.includes('lâm động') || normalized.includes('nhân vật')) {
    return 'Theo phần bạn đã đọc, Lâm Động là người dẫn đường từng cứu đoàn ở cửa ải Thạch Môn. Anh kín tiếng, hiểu rõ địa hình phía Bắc và dường như có liên hệ với quá khứ của Diệp Phàm.';
  }
  if (normalized.includes('mối quan hệ')) {
    return 'Diệp Phàm và người đồng hành vẫn dè chừng nhau, nhưng đã hình thành sự tin cậy sau chuyến đi qua Thạch Môn. Lâm Động là cầu nối giữa họ và manh mối về bức thư.';
  }
  if (normalized.includes('tại sao')) {
    return 'Nhân vật chọn tiếp tục vì manh mối lần này liên quan trực tiếp đến lời hẹn của cha mình. Đây là điều đã thôi thúc anh suốt mười năm.';
  }
  return 'Ngay trước đoạn hiện tại, Diệp Phàm nhận được một bức thư bí mật, biết manh mối đã được chuyển về phía Bắc và quyết định đi qua rừng Thạch Môn dù nhận ra đó có thể là một cái bẫy.';
}
