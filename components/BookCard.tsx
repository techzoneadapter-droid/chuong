import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { xianxia } from '../constants/xianxia';
import { artwork } from '../constants/artwork';
import { Book } from '../types';

interface Props {
  book: Book;
  compact?: boolean;
}

export function BookCard({ book, compact = false }: Props) {
  const router = useRouter();
  const badge = book.isVip ? 'VIP' : book.status === 'Đang ra' ? 'TÂN CHƯƠNG' : book.status === 'Đã hoàn thành' ? 'HOÀN' : 'TIÊN ĐỀ CỬ';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Mở truyện ${book.title}`}
      onPress={() => router.push({ pathname: '/book/[id]', params: { id: book.id } })}
      style={({ pressed }) => [styles.card, compact && styles.compact, pressed && styles.pressed]}
    >
      <View style={[styles.coverFrame, compact && styles.compactFrame]}>
        <View style={[styles.cover, compact && styles.compactCover, { backgroundColor: book.cover || xianxia.jadeDeep }]}>
          {book.coverUrl ? <Image source={{ uri: book.coverUrl }} style={styles.coverImage} resizeMode="cover" /> : null}
          <View style={styles.coverTop}>
            <Text style={styles.coverBrand}>CHƯƠNG</Text>
          </View>
          {!book.coverUrl ? <View style={styles.fallbackCopy}>
            <Text numberOfLines={4} style={[styles.coverTitle, compact && styles.compactCoverTitle]}>{book.title}</Text>
            <Text numberOfLines={1} style={styles.coverAuthor}>{book.author}</Text>
          </View> : null}
          <View style={styles.coverFooter}>
            {book.isVip ? <Image source={artwork.vip} accessibilityLabel="VIP" resizeMode="contain" style={{ width: 48, height: 27 }} /> : <Text style={styles.badge}>{badge}</Text>}
            <View style={styles.chapterPill}><Ionicons name="reader-outline" color={xianxia.goldSoft} size={12} /><Text style={styles.chapterText}>{book.totalChapters}</Text></View>
          </View>
        </View>
      </View>
      <Text numberOfLines={2} style={styles.title}>{book.title}</Text>
      <Text numberOfLines={1} style={styles.meta}>{book.author}</Text>
      <View style={styles.genreRow}><Text numberOfLines={1} style={styles.genre}>{book.genre}</Text><Text style={styles.dot}>·</Text><Text style={styles.rating}>★ {Number(book.rating || 0).toFixed(1)}</Text></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 146, marginRight: 14 },
  compact: { width: 122 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
  coverFrame: { borderRadius: 6, padding: 1, backgroundColor: xianxia.goldSoft },
  compactFrame: { borderRadius: 6 },
  cover: { height: 188, borderRadius: 5, padding: 12, justifyContent: 'space-between', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,.16)' },
  compactCover: { height: 164, borderRadius: 5, padding: 10 },
  coverImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  imageShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12,24,22,.16)' },
  coverTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 2 },
  coverBrand: { color: 'rgba(255,253,248,.86)', fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
  seal: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(229,209,163,.75)', backgroundColor: 'rgba(103,39,32,.78)', alignItems: 'center', justifyContent: 'center' },
  sealText: { color: '#F2DCA9', fontSize: 12, fontWeight: '900' },
  fallbackCopy: { zIndex: 2, paddingRight: 8 },
  coverTitle: { color: xianxia.white, fontSize: 19, lineHeight: 24, fontWeight: '900', textShadowColor: 'rgba(0,0,0,.30)', textShadowRadius: 6 },
  compactCoverTitle: { fontSize: 15, lineHeight: 19 },
  coverAuthor: { color: 'rgba(255,253,248,.76)', fontSize: 9, fontWeight: '700', marginTop: 6 },
  coverFooter: { zIndex: 2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { color: '#FFF9EA', backgroundColor: 'rgba(20,34,31,.70)', borderWidth: 1, borderColor: 'rgba(229,209,163,.38)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, fontSize: 8, fontWeight: '900' },
  chapterPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(20,34,31,.58)', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 99 },
  chapterText: { color: xianxia.goldSoft, fontSize: 8, fontWeight: '900' },
  title: { color: xianxia.ink, fontSize: 14, lineHeight: 20, fontWeight: '600', marginTop: 10 },
  meta: { color: xianxia.jade, fontSize: 10, fontWeight: '700', marginTop: 3 },
  genreRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  genre: { flexShrink: 1, color: xianxia.muted, fontSize: 9 },
  dot: { color: '#B6A993', fontSize: 9 },
  rating: { color: xianxia.gold, fontSize: 9, fontWeight: '800' },
});
