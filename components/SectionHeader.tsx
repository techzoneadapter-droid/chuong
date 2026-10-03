import { Pressable, StyleSheet, Text, View } from 'react-native';
import { xianxia } from '../constants/xianxia';

interface Props { title: string; action?: string; onPress?: () => void; }

export function SectionHeader({ title, action, onPress }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.titleWrap}>
        <View style={styles.ornament}><View style={styles.dot} /></View>
        <Text style={styles.title}>{title}</Text>
      </View>
      {action ? onPress ? <Pressable onPress={onPress} hitSlop={10}><Text style={styles.action}>{action}</Text></Pressable> : <Text style={styles.actionLabel}>{action}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: 28, marginBottom: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
  ornament: { width: 17, height: 22, borderLeftWidth: 1, borderRightWidth: 1, borderColor: xianxia.gold, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: xianxia.cinnabar },
  title: { color: xianxia.ink, fontSize: 18, fontWeight: '900' },
  action: { color: xianxia.cinnabar, fontSize: 10, fontWeight: '900' },
  actionLabel: { color: xianxia.muted, fontSize: 10, fontWeight: '800' },
});
