import { Image, StyleSheet, View } from 'react-native';
import { xianxia } from '../constants/xianxia';
import { artwork, coverArtwork } from '../constants/artwork';

export function XianxiaBackdrop({ dark = false }: { dark?: boolean }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: dark ? '#172421' : xianxia.paper }]}>
    <Image source={artwork.banner} resizeMode="cover" style={{ position: 'absolute', bottom: 0, width: '100%', height: 210, opacity: dark ? 0.08 : 0.06 }} />
  </View>;
}

export function XianxiaCoverArt({ compact = false, seed = '' }: { compact?: boolean; seed?: string }) {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Image source={coverArtwork(seed)} resizeMode="cover" style={[StyleSheet.absoluteFillObject, { width: '100%', height: '100%' }]} />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: compact ? 'rgba(8,25,20,0.48)' : 'rgba(8,25,20,0.56)' }]} />
  </View>;
}
