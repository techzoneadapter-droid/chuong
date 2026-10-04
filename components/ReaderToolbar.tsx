import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { xianxia } from '../constants/xianxia';

export type ReaderTool = 'chapters' | 'settings' | 'audio' | 'ai' | 'more';

interface Props { onSelect: (tool: ReaderTool) => void; dark?: boolean; }

const tools: { id: ReaderTool; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { id: 'chapters', icon: 'list', label: 'Mục lục' },
  { id: 'settings', icon: 'text', label: 'Giao diện' },
  { id: 'audio', icon: 'headset-outline', label: 'Nghe' },
  { id: 'ai', icon: 'sparkles-outline', label: 'AI' },
  { id: 'more', icon: 'ellipsis-horizontal', label: 'Thêm' },
];

export function ReaderToolbar({ onSelect, dark = false }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, dark && styles.darkBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tools.map((tool) => (
        <Pressable key={tool.id} accessibilityRole="button" accessibilityLabel={tool.label} onPress={() => onSelect(tool.id)} style={({ pressed }) => [styles.tool, pressed && styles.pressed]}>
          <View style={[styles.iconShell, dark && styles.darkIconShell, tool.id === 'ai' && styles.aiShell]}>
            <Ionicons name={tool.icon} size={19} color={tool.id === 'ai' ? xianxia.cinnabar : dark ? xianxia.goldSoft : xianxia.jadeDeep} />
          </View>
          <Text style={[styles.label, dark && styles.darkLabel]}>{tool.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#FFF8EA',
    borderTopWidth: 1,
    borderTopColor: xianxia.goldSoft,
    flexDirection: 'row',
    paddingTop: 7,
    shadowColor: '#3A3029',
    shadowOpacity: .10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  darkBar: { backgroundColor: '#1B2522', borderTopColor: '#5F594D' },
  tool: { flex: 1, alignItems: 'center', minHeight: 51, justifyContent: 'center' },
  pressed: { opacity: .62 },
  iconShell: { width: 31, height: 29, borderRadius: 10, backgroundColor: '#EDF1E9', borderWidth: 1, borderColor: '#C3CEBF', alignItems: 'center', justifyContent: 'center' },
  darkIconShell: { backgroundColor: '#263630', borderColor: '#45574E' },
  aiShell: { backgroundColor: '#F4E5DF', borderColor: '#E1C5BA' },
  label: { color: xianxia.inkSoft, fontSize: 8.5, fontWeight: '800', marginTop: 4 },
  darkLabel: { color: '#E8DDD2' },
});
