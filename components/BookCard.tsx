import { memo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AssetBookCover, VipArt } from './Artwork';
import { xianxia } from '../constants/xianxia';
import { Book } from '../types';

interface Props {
  book: Book;
  compact?: boolean;
}

export const BookCard = memo(function BookCard({ book, compact = false }: Props) {
  const router = useRouter();
  const badge = book.status === 'Đang ra' ? 'TÂN CHƯƠNG' : book.status === 'Đã hoàn thành' ? 'HOÀN' : 'ĐỀ CỬ';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Mở truyện ${book.title}`}
      onPress={() => router.push({ pathname: '/book/[id]', params: { id: book.id } })}
      style={({ pressed }) => [styles.card, compact && styles.compact, pressed && styles.pressed]}
    >
      <View style={[styles.coverFrame, compact && styles.compactFrame]}>
        <View style={[styles.cover, compact && styles.compactCover]}>
          <AssetBookCover bookId={book.id} title={book.title} coverUrl={book.coverUrl} style={StyleSheet.absoluteFillObject} />
          <View pointerEvents="none" style={styles.imageShade} />
          <View style={styles.coverTop}>
            <Text style={styles.coverBrand}>CHƯƠNG</Text>
          </View>
          <View style={styles.coverFooter}>
            {book.isVip ? <VipArt width={compact ? 43 : 50} /> : <Text style={styles.badge}>{badge}</Text>}
            <View style={styles.chapterPill}><Ionicons name="reader-outline" color={xianxia.goldSoft} size={12} /><Text style={styles.chapterText}>{book.totalChapters}</Text></View>
          </View>
        </View>
      </View>
      <Text numberOfLines={2} style={styles.title}>{book.title}</Text>
      <Text numberOfLines={1} style={styles.meta}>{book.author}</Text>
      <View style={styles.genreRow}><Text numberOfLines={1} style={styles.genre}>{book.genre}</Text><Text style={styles.dot}>·</Text><Text style={styles.rating}>★ {Number(book.rating || 0).toFixed(1)}</Text></View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { width: 146, marginRight: 14, padding: 5, paddingBottom: 9, borderRadius: 11, backgroundColor: 'rgba(255,253,247,.97)', borderWidth: 1, borderColor: '#D6C9B5', shadowColor: '#2B342E', shadowOpacity: .08, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  compact: { width: 122 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  coverFrame: { borderRadius: 9, padding: 2, backgroundColor: xianxia.gold, shadowColor: '#2B342E', shadowOpacity: .16, shadowRadius: 9, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  compactFrame: { borderRadius: 8 },
  cover: { height: 202, borderRadius: 7, justifyContent: 'space-between', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,.20)' },
  compactCover: { height: 168, borderRadius: 6 },
  imageShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(9,22,20,.08)' },
  coverTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 2, padding: 9 },
  coverBrand: { color: '#FFF8EA', fontSize: 7, fontWeight: '900', letterSpacing: 1.2, textShadowColor: 'rgba(0,0,0,.45)', textShadowRadius: 4 },
  coverFooter: { zIndex: 2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', padding: 8 },
  badge: { color: '#FFF9EA', backgroundColor: 'rgba(23,63,53,.88)', borderWidth: 1, borderColor: 'rgba(229,209,163,.72)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, fontSize: 7.5, fontWeight: '900' },
  chapterPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(19,43,37,.76)', borderWidth: 1, borderColor: 'rgba(229,209,163,.42)', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 99 },
  chapterText: { color: xianxia.goldSoft, fontSize: 8, fontWeight: '900' },
  title: { color: '#24231F', fontSize: 13.5, lineHeight: 18, fontWeight: '800', marginTop: 9 },
  meta: { color: xianxia.jadeDeep, fontSize: 9.5, fontWeight: '700', marginTop: 3 },
  genreRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  genre: { flexShrink: 1, color: '#5F5A53', fontSize: 8.8, fontWeight: '600' },
  dot: { color: '#B6A993', fontSize: 9 },
  rating: { color: xianxia.gold, fontSize: 9, fontWeight: '800' },
});
