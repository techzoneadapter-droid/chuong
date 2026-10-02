import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ReaderTool = 'chapters' | 'settings' | 'audio' | 'ai' | 'more';

interface Props { onSelect: (tool: ReaderTool) => void; dark?: boolean; }

const tools: { id: ReaderTool; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { id: 'chapters', icon: 'list', label: 'Chương' }, { id: 'settings', icon: 'text', label: 'Giao diện' },
  { id: 'audio', icon: 'headset-outline', label: 'Nghe' }, { id: 'ai', icon: 'sparkles-outline', label: 'AI' },
  { id: 'more', icon: 'ellipsis-horizontal', label: 'Thêm' }
];

export function ReaderToolbar({ onSelect, dark = false }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, dark && styles.darkBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tools.map((tool) => (
        <Pressable key={tool.id} onPress={() => onSelect(tool.id)} style={styles.tool}>
          <Ionicons name={tool.icon} size={21} color={tool.id === 'ai' ? '#A52C52' : dark ? '#F3E9E1' : '#3A3034'} />
          <Text style={[styles.label, dark && styles.darkLabel]}>{tool.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: '#FFFDFC', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DCCFC8', flexDirection: 'row', paddingTop: 8 },
  darkBar: { backgroundColor: '#211F20', borderTopColor: '#3F3B3D' },
  tool: { flex: 1, alignItems: 'center', minHeight: 46, justifyContent: 'center' },
  label: { color: '#554A4E', fontSize: 10, fontWeight: '700', marginTop: 3 },
  darkLabel: { color: '#E9DDD6' }
});
