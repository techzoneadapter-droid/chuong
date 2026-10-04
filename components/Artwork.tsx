import { Ionicons } from '@expo/vector-icons';
import { Image, ImageSourcePropType, StyleSheet, Text, View } from 'react-native';
import { brandLogoDataUri } from '../constants/brand-logo';
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
  const muted = inverse ? 'rgba(255,253,248,.72)' : xianxia.muted;
  return <View style={[styles.brandWrap, compact && styles.brandWrapCompact]}>
    <Image
      accessibilityLabel="Logo CHƯƠNG"
      source={{ uri: brandLogoDataUri }}
      resizeMode="contain"
      style={[styles.brandLogo, compact && styles.brandLogoCompact]}
    />
    {showTagline ? <Text style={[styles.brandTagline, compact && styles.brandTaglineCompact, { color: muted }]}>Mỗi chương, một thế giới.</Text> : null}
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

export function AssetBookCover({
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
  if (coverUrl) {
    return <Image
      accessible
      accessibilityLabel={`Bìa truyện ${title}`}
      source={{ uri: coverUrl }}
      resizeMode={resizeMode}
      style={style}
    />;
  }

  return <View
    accessible
    accessibilityLabel={`${title} chưa có ảnh bìa`}
    style={[styles.noCover, style]}
  >
    <Ionicons name="image-outline" size={24} color={xianxia.jade} />
    <Text style={styles.noCoverText}>Chưa có bìa</Text>
  </View>;
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  dividerWrap: { alignItems: 'center', marginVertical: 10 },
  brandWrap: { minWidth: 0, alignItems: 'flex-start' },
  brandWrapCompact: { alignItems: 'flex-start' },
  brandLogo: { width: 238, height: 80 },
  brandLogoCompact: { width: 158, height: 53 },
  brandTagline: { width: 238, textAlign: 'center', fontSize: 8.5, marginTop: -5, letterSpacing: .15 },
  brandTaglineCompact: { width: 158, fontSize: 7.5, marginTop: -4 },
  noCover: {
    backgroundColor: '#EFE7D6',
    borderWidth: 1,
    borderColor: xianxia.line,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  noCoverText: { color: xianxia.muted, fontSize: 8, fontWeight: '800' },
});
