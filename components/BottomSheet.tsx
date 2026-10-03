import { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { xianxia } from '../constants/xianxia';

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
            <View style={styles.seal}><Text style={styles.sealText}>章</Text></View>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} style={styles.close}><Ionicons name="close" size={20} color={xianxia.ink} /></Pressable>
          </View>
          {scroll ? <ScrollView showsVerticalScrollIndicator={false}>{body}</ScrollView> : body}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(19,29,26,.46)', justifyContent: 'flex-end' },
  dismiss: { flex: 1 },
  sheet: { maxHeight: '82%', backgroundColor: '#FBF7EF', borderTopLeftRadius: 25, borderTopRightRadius: 25, overflow: 'hidden', borderTopWidth: 1, borderColor: xianxia.goldSoft },
  tall: { height: '82%' },
  handle: { width: 38, height: 4, borderRadius: 3, backgroundColor: '#C9BEAD', alignSelf: 'center', marginTop: 9 },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line },
  seal: { width: 28, height: 28, borderRadius: 9, backgroundColor: xianxia.cinnabar, borderWidth: 1, borderColor: xianxia.gold, alignItems: 'center', justifyContent: 'center' },
  sealText: { color: '#F3D99D', fontSize: 13, fontWeight: '900' },
  title: { flex: 1, color: xianxia.ink, fontSize: 17, fontWeight: '900' },
  close: { width: 34, height: 34, borderRadius: 11, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#C2D1C6', alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 16 },
});
