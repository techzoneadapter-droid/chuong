import { Image, StyleSheet, View } from 'react-native';
import { xianxia } from '../constants/xianxia';
import { artwork } from '../constants/artwork';

export function XianxiaBackdrop({
  dark = false,
  opacity = 0.78,
}: {
  dark?: boolean;
  opacity?: number;
}) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: dark ? '#172421' : xianxia.paper }]}>
    {!dark ? <>
      <Image source={artwork.background} resizeMode="cover" style={[StyleSheet.absoluteFillObject, { width: '100%', height: '100%', opacity }]} />
      <View style={[StyleSheet.absoluteFillObject, styles.paperVeil]} />
    </> : null}
  </View>;
}

const styles = StyleSheet.create({ paperVeil: { backgroundColor: 'rgba(244,235,216,.14)' } });
