import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props { title: string; action?: string; onPress?: () => void; }

export function SectionHeader({ title, action, onPress }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {action ? onPress ? <Pressable onPress={onPress} hitSlop={10}><Text style={styles.action}>{action}</Text></Pressable> : <Text style={styles.actionLabel}>{action}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: 28, marginBottom: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#221A1D', fontSize: 20, fontWeight: '900' },
  action: { color: '#8F1D3F', fontSize: 12, fontWeight: '800' },
  actionLabel: { color: '#8A7E83', fontSize: 12, fontWeight: '700' }
});
