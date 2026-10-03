import { StyleSheet, View } from 'react-native';
import { xianxia } from '../constants/xianxia';

export function XianxiaBackdrop({ dark = false }: { dark?: boolean }) {
  const background = dark ? '#172421' : xianxia.paper;
  const mountainBack = dark ? '#223530' : '#D7E0D7';
  const mountainFront = dark ? '#1B2C28' : '#C7D3C9';
  const mist = dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.60)';
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: background, overflow: 'hidden' }]}>
      <View style={[styles.sun, { backgroundColor: dark ? 'rgba(226,197,127,.14)' : 'rgba(196,154,80,.18)' }]} />
      <View style={[styles.mountain, styles.mountainBackOne, { backgroundColor: mountainBack }]} />
      <View style={[styles.mountain, styles.mountainBackTwo, { backgroundColor: mountainBack }]} />
      <View style={[styles.mountain, styles.mountainFrontOne, { backgroundColor: mountainFront }]} />
      <View style={[styles.mountain, styles.mountainFrontTwo, { backgroundColor: mountainFront }]} />
      <View style={[styles.mist, styles.mistOne, { backgroundColor: mist }]} />
      <View style={[styles.mist, styles.mistTwo, { backgroundColor: mist }]} />
      <View style={[styles.mist, styles.mistThree, { backgroundColor: mist }]} />
      <View style={[styles.inkWash, { backgroundColor: dark ? 'rgba(0,0,0,.12)' : 'rgba(49,94,84,.035)' }]} />
    </View>
  );
}

export function XianxiaCoverArt({ compact = false }: { compact?: boolean }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.coverMoon} />
      <View style={[styles.coverMountain, { left: compact ? -42 : -28, bottom: compact ? -68 : -58 }]} />
      <View style={[styles.coverMountain, styles.coverMountainSecond, { right: compact ? -60 : -44, bottom: compact ? -82 : -72 }]} />
      <View style={styles.coverMist} />
      <View style={styles.coverGoldLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  sun: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    right: -52,
    top: 44,
  },
  mountain: {
    position: 'absolute',
    width: 300,
    height: 300,
    transform: [{ rotate: '45deg' }],
    borderRadius: 24,
  },
  mountainBackOne: { left: -150, bottom: -225 },
  mountainBackTwo: { right: -140, bottom: -220 },
  mountainFrontOne: { left: 35, bottom: -260, width: 350, height: 350 },
  mountainFrontTwo: { right: 15, bottom: -290, width: 390, height: 390 },
  mist: {
    position: 'absolute',
    height: 34,
    borderRadius: 999,
  },
  mistOne: { width: '76%', left: '-14%', top: '31%' },
  mistTwo: { width: '64%', right: '-20%', top: '49%' },
  mistThree: { width: '58%', left: '8%', bottom: '9%' },
  inkWash: {
    position: 'absolute',
    width: 320,
    height: 180,
    borderRadius: 160,
    left: -140,
    top: 110,
    transform: [{ rotate: '-18deg' }],
  },
  coverMoon: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    right: 12,
    top: 20,
    backgroundColor: 'rgba(238,211,145,.30)',
    borderWidth: 1,
    borderColor: 'rgba(238,211,145,.42)',
  },
  coverMountain: {
    position: 'absolute',
    width: 150,
    height: 150,
    transform: [{ rotate: '45deg' }],
    backgroundColor: 'rgba(10,28,26,.36)',
    borderRadius: 12,
  },
  coverMountainSecond: {
    width: 185,
    height: 185,
    backgroundColor: 'rgba(7,20,18,.48)',
  },
  coverMist: {
    position: 'absolute',
    height: 19,
    width: '88%',
    left: '-16%',
    top: '44%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,.13)',
  },
  coverGoldLine: {
    position: 'absolute',
    width: 1,
    height: '76%',
    right: 12,
    top: '12%',
    backgroundColor: 'rgba(229,209,163,.42)',
  },
});
