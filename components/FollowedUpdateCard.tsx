import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { xianxia } from '../constants/xianxia';
import { FollowedBookUpdate } from '../services/followedUpdates';
import { AssetBookCover } from './Artwork';

export function FollowedUpdateCard({ item, compact = false }: { item: FollowedBookUpdate; compact?: boolean }) {
  const router = useRouter();
  const nextChapter = item.next_chapter_number;
  const date = item.latest_published_at ? new Date(item.latest_published_at).toLocaleString('vi-VN') : null;
  return <View style={styles.card}>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Xem truyện ${item.title}`} onPress={() => router.push({ pathname: '/book/[id]', params: { id: item.book_id } })}>
        <AssetBookCover bookId={item.book_id} title={item.title} coverUrl={item.cover_url} style={[styles.cover, compact && { width: 52, height: 74 }]} />
      </Pressable>
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.meta}>{item.author_name}</Text>
        {item.has_updates ? <Text style={styles.badge}>{item.unread_count} chương mới</Text> : null}
        <Text style={styles.meta}>{item.current_chapter_number == null
          ? `Chưa bắt đầu · ${item.published_count} chương đã phát hành`
          : `Bạn đang ở Chương ${item.current_chapter_number}${item.latest_chapter_number == null ? '' : ` · Mới nhất Chương ${item.latest_chapter_number}`}`}</Text>
      </View>
    </View>
    {!compact && item.latest_chapter_number != null ? <Text style={styles.meta}>Mới nhất: Chương {item.latest_chapter_number} · {item.latest_chapter_title}</Text> : null}
    {!compact && date ? <Text style={styles.meta}>Phát hành: {date}</Text> : null}
    {nextChapter != null ? <Pressable accessibilityRole="button" style={styles.button}
      onPress={() => router.push({ pathname: '/reader/[bookId]', params: { bookId: item.book_id, chapter: nextChapter } })}>
      <Text style={styles.buttonText}>{item.current_chapter_number == null ? 'Đọc từ đầu' : 'Đọc tiếp'}</Text>
    </Pressable> : <Text style={styles.status}>{item.published_count === 0 ? 'Chưa có chương đã phát hành' : 'Đã đọc đến chương mới nhất'}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: xianxia.card, borderColor: xianxia.line, borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  row: { flexDirection: 'row', gap: 12 },
  cover: { width: 68, height: 94, borderRadius: 8 },
  copy: { flex: 1, gap: 5 },
  title: { fontSize: 16, fontWeight: '800', color: xianxia.ink },
  meta: { fontSize: 12, lineHeight: 18, color: xianxia.muted },
  badge: { color: xianxia.jadeDeep, fontWeight: '800', fontSize: 12 },
  status: { color: xianxia.jadeDeep, fontSize: 13, lineHeight: 20 },
  button: { backgroundColor: xianxia.jadeDeep, padding: 12, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: xianxia.white, fontWeight: '800', fontSize: 14 },
});
