import { Image, ImageSourcePropType, Platform, StyleSheet, Text, View } from 'react-native';
import { artwork } from '../constants/artwork';
import { xianxia } from '../constants/xianxia';

export function ArtIcon({ source, size = 36 }: { source: ImageSourcePropType; size?: number }) {
  return <Image accessible={false} source={source} resizeMode="contain" style={{ width: size, height: size }} />;
}

export function BrandLockup({
  compact = false,
  inverse = false,
  showTagline = true,
}: {
  compact?: boolean;
  inverse?: boolean;
  showTagline?: boolean;
}) {
  const ink = inverse ? xianxia.white : xianxia.jadeDeep;
  const muted = inverse ? 'rgba(255,253,248,.68)' : xianxia.muted;
  return <View style={styles.brandRow}>
    <Image accessible={false} source={artwork.icon} resizeMode="contain" style={[styles.brandIcon, compact && styles.brandIconCompact]} />
    <View style={styles.brandCopy}>
      <Text accessibilityRole="header" style={[styles.brandWord, compact && styles.brandWordCompact, { color: ink }]}>CHƯƠNG</Text>
      {showTagline ? <Text style={[styles.brandTagline, { color: muted }]}>Mỗi chương, một thế giới.</Text> : null}
    </View>
  </View>;
}

export function ArtDivider({ width = 190 }: { width?: number }) {
  return <View pointerEvents="none" style={styles.dividerWrap}>
    <Image accessible={false} source={artwork.divider} resizeMode="contain" style={{ width, height: 30 }} />
  </View>;
}

export function ButtonArt({ opacity = 1 }: { opacity?: number }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
    <Image accessible={false} source={artwork.button} resizeMode="stretch" style={styles.fill} />
  </View>;
}

export function VipArt({ width = 52 }: { width?: number }) {
  return <Image accessibilityLabel="VIP" source={artwork.vip} resizeMode="contain" style={{ width, height: width * .56 }} />;
}

const placeholderCovers = [artwork.coverPalace, artwork.coverBamboo, artwork.coverArchive] as const;

function hashKey(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

export function placeholderCoverFor(bookId: string, title = ''): ImageSourcePropType {
  return placeholderCovers[hashKey(bookId || title || 'chuong') % placeholderCovers.length];
}

export function AssetBookCover({
  bookId,
  title,
  coverUrl,
  style,
  resizeMode = 'cover',
}: {
  bookId: string;
  title: string;
  coverUrl?: string | null;
  style?: object;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
}) {
  return <Image
    accessible
    accessibilityLabel={`Bìa truyện ${title}`}
    source={coverUrl ? { uri: coverUrl } : placeholderCoverFor(bookId, title)}
    resizeMode={resizeMode}
    style={style}
  />;
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  dividerWrap: { alignItems: 'center', marginVertical: 10 },
  brandRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandIcon: { width: 68, height: 58 },
  brandIconCompact: { width: 47, height: 40 },
  brandCopy: { minWidth: 0, justifyContent: 'center' },
  brandWord: {
    color: xianxia.jadeDeep,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: 1.6,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  brandWordCompact: { fontSize: 20, lineHeight: 23, letterSpacing: 1.1 },
  brandTagline: { color: xianxia.muted, fontSize: 8.5, marginTop: 1, letterSpacing: .15 },
});
