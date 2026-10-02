import { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  scroll?: boolean;
  tall?: boolean;
}

export function BottomSheet({ visible, title, onClose, children, scroll = false, tall = false }: Props) {
  const insets = useSafeAreaInsets();
  const body = <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, 18) }]}>{children}</View>;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel="Đóng" />
        <View style={[styles.sheet, tall && styles.tall]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} style={styles.close}><Ionicons name="close" size={21} color="#342A2E" /></Pressable>
          </View>
          {scroll ? <ScrollView showsVerticalScrollIndicator={false}>{body}</ScrollView> : body}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(25,16,20,.38)', justifyContent: 'flex-end' },
  dismiss: { flex: 1 },
  sheet: { maxHeight: '82%', backgroundColor: '#FFFDFC', borderTopLeftRadius: 25, borderTopRightRadius: 25, overflow: 'hidden' },
  tall: { height: '82%' },
  handle: { width: 38, height: 4, borderRadius: 3, backgroundColor: '#D4C8C2', alignSelf: 'center', marginTop: 9 },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E9DDD6' },
  title: { flex: 1, color: '#221A1D', fontSize: 19, fontWeight: '900' },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F5EDEA', alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 16 }
});
