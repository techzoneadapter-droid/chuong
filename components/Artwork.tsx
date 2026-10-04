import { Image, ImageSourcePropType, StyleSheet, View } from 'react-native';
import { artwork } from '../constants/artwork';

export function ArtIcon({ source, size = 36 }: { source: ImageSourcePropType; size?: number }) {
  return <Image accessible={false} source={source} resizeMode="contain" style={{ width: size, height: size }} />;
}

export function ArtDivider() {
  return <View pointerEvents="none" style={{ alignItems: 'center', marginVertical: 10 }}>
    <Image accessible={false} source={artwork.divider} resizeMode="contain" style={{ width: 190, height: 30 }} />
  </View>;
}

export function ButtonArt() {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}><Image accessible={false} source={artwork.button} resizeMode="stretch" style={{ width: '100%', height: '100%' }} /></View>;
}
