import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Book } from '../types';

interface Props {
  book: Book;
  compact?: boolean;
}

export function BookCard({ book, compact = false }: Props) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Mở truyện ${book.title}`}
      onPress={() => router.push({ pathname: '/book/[id]', params: { id: book.id } })}
      style={({ pressed }) => [styles.card, compact && styles.compact, pressed && styles.pressed]}
    >
      <View style={[styles.cover, compact && styles.compactCover, { backgroundColor: book.cover }]}> 
        {book.coverUrl ? <Image source={{ uri: book.coverUrl }} style={styles.coverImage} /> : null}
        <Text style={styles.coverBrand}>CHƯƠNG</Text>
        <Text style={[styles.coverTitle, compact && styles.compactCoverTitle]}>{book.title}</Text>
        <View style={styles.coverFooter}>
          <Text style={styles.badge}>{book.isVip ? 'VIP' : book.status === 'Đang ra' ? 'MỚI' : 'HOT'}</Text>
          <Ionicons name="book-outline" color="rgba(255,255,255,.75)" size={14} />
        </View>
      </View>
      <Text numberOfLines={2} style={styles.title}>{book.title}</Text>
      <Text numberOfLines={1} style={styles.meta}>{book.author} · {book.genre}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 140, marginRight: 14 },
  compact: { width: 120 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  cover: { height: 190, borderRadius: 16, padding: 14, justifyContent: 'space-between', overflow: 'hidden' },
  coverImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  compactCover: { height: 162, borderRadius: 14, padding: 12 },
  coverBrand: { color: 'rgba(255,255,255,.72)', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  coverTitle: { color: '#FFFFFF', fontSize: 18, lineHeight: 23, fontWeight: '900' },
  compactCoverTitle: { fontSize: 15, lineHeight: 19 },
  coverFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,.24)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, fontSize: 9, fontWeight: '900' },
  title: { color: '#221A1D', fontSize: 14, lineHeight: 19, fontWeight: '800', marginTop: 9 },
  meta: { color: '#756B6F', fontSize: 11, marginTop: 3 }
});
