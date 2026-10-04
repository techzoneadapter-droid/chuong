import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArtDivider, ButtonArt } from '../../components/Artwork';
import { XianxiaBackdrop } from '../../components/XianxiaBackdrop';
import { xianxia } from '../../constants/xianxia';
import { usePersistentState } from '../../hooks/usePersistentState';
import { defaultReaderSettings } from '../../services/storage';
import { ReaderFont, ReaderMode, ReaderSettings, ReaderSpacing, ReaderTheme } from '../../types';

const themes: Record<ReaderTheme, { bg: string; text: string; muted: string }> = {
  white: { bg: '#FFFFFF', text: '#282326', muted: '#837A7E' },
  paper: { bg: '#F4EBD8', text: '#2B2A24', muted: '#766F66' },
  night: { bg: '#27282C', text: '#DAD5CD', muted: '#A9A49D' },
  amoled: { bg: '#000000', text: '#D1CDCA', muted: '#8D8986' },
};

export default function ReadingSettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = usePersistentState<ReaderSettings>('reader:settings', defaultReaderSettings);
  const palette = themes[settings.theme];
  const dark = settings.theme === 'night' || settings.theme === 'amoled';
  const lineHeight = settings.fontSize * ({ compact: 1.5, normal: 1.72, relaxed: 1.95 }[settings.spacing]);
  const fontFamily = settings.font === 'serif' ? 'Georgia' : settings.font === 'sans' ? 'Arial' : undefined;
  const update = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <XianxiaBackdrop />
    <View style={styles.topbar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.back} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={21} color={xianxia.ink} />
      </Pressable>
      <View style={styles.topCopy}><Text style={styles.kicker}>ĐỌC TRUYỆN</Text><Text style={styles.topTitle}>Giao diện & đọc</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Khôi phục mặc định" style={styles.resetTop} onPress={() => setSettings(defaultReaderSettings)}>
        <Ionicons name="refresh-outline" size={19} color={xianxia.jadeDeep} />
      </Pressable>
    </View>

    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={[styles.preview, { backgroundColor: palette.bg, borderColor: dark ? '#4D4B48' : xianxia.goldSoft }]}>
        <Text style={[styles.previewKicker, { color: palette.muted }]}>CHƯƠNG · XEM TRƯỚC</Text>
        <Text style={[styles.previewTitle, { color: palette.text }]}>Một trang tiên hiệp trong tay</Text>
        {dark ? <View style={[styles.rule, { backgroundColor: palette.muted }]} /> : <ArtDivider width={150} />}
        <Text style={[styles.previewText, { color: palette.text, fontSize: settings.fontSize, lineHeight, fontFamily }]}>Mây mỏng trôi ngang đỉnh núi. Một tiếng chuông xa vọng qua sơn cốc, mở ra con đường tu hành chưa ai biết điểm cuối.</Text>
        <Text style={[styles.previewMeta, { color: palette.muted }]}>{settings.mode === 'page' ? 'Lật trang' : 'Cuộn dọc'} · {settings.fontSize}px · lề {settings.padding}px</Text>
      </View>

      <View style={styles.card}>
        <Label title="Cỡ chữ" value={`${settings.fontSize}px`} />
        <View style={styles.adjust}>
          <Pressable style={styles.adjustButton} onPress={() => update('fontSize', Math.max(14, settings.fontSize - 1))}><Text style={styles.smallA}>A−</Text></Pressable>
          <View style={styles.track}><View style={[styles.fill, { width: `${(settings.fontSize - 14) / 12 * 100}%` }]} /></View>
          <Pressable style={styles.adjustButton} onPress={() => update('fontSize', Math.min(26, settings.fontSize + 1))}><Text style={styles.bigA}>A+</Text></Pressable>
        </View>

        <Label title="Phông chữ" />
        <Segment options={[['default', 'Mặc định'], ['serif', 'Serif'], ['sans', 'Sans']]} value={settings.font} onChange={(value) => update('font', value as ReaderFont)} />

        <Label title="Giãn dòng" />
        <Segment options={[['compact', 'Gọn'], ['normal', 'Thường'], ['relaxed', 'Thoáng']]} value={settings.spacing} onChange={(value) => update('spacing', value as ReaderSpacing)} />

        <Label title="Nền đọc" />
        <View style={styles.themeRow}>{([['white', 'Trắng', '#FFFFFF'], ['paper', 'Giấy', '#F4EBD8'], ['night', 'Đêm', '#27282C'], ['amoled', 'AMOLED', '#000000']] as const).map(([id, label, color]) => <Pressable key={id} style={styles.themeOption} onPress={() => update('theme', id as ReaderTheme)}>
          <View style={[styles.themeCircle, { backgroundColor: color }, settings.theme === id && styles.themeActive]}>{settings.theme === id ? <Ionicons name="checkmark" size={16} color={id === 'white' || id === 'paper' ? xianxia.cinnabar : '#FFF'} /> : null}</View>
          <Text style={styles.themeLabel}>{label}</Text>
        </Pressable>)}</View>

        <Label title="Lề trang" value={`${settings.padding}px`} />
        <View style={styles.paddingRow}>
          <Pressable onPress={() => update('padding', Math.max(14, settings.padding - 4))}><Ionicons name="remove-circle-outline" size={29} color={xianxia.jadeDeep} /></Pressable>
          <View style={styles.paddingDemo}><View style={{ width: `${Math.max(35, 92 - settings.padding)}%`, height: 3, backgroundColor: xianxia.jadeDeep }} /><View style={{ width: `${Math.max(28, 80 - settings.padding)}%`, height: 3, backgroundColor: '#CDBDC2' }} /></View>
          <Pressable onPress={() => update('padding', Math.min(42, settings.padding + 4))}><Ionicons name="add-circle-outline" size={29} color={xianxia.jadeDeep} /></Pressable>
        </View>

        <Label title="Chế độ đọc" />
        <Segment options={[['scroll', 'Cuộn dọc'], ['page', 'Lật trang']]} value={settings.mode} onChange={(value) => update('mode', value as ReaderMode)} />
      </View>

      <View style={styles.note}><Ionicons name="checkmark-circle-outline" size={19} color={xianxia.jadeDeep} /><Text style={styles.noteText}>Thay đổi được lưu tự động. Reader sẽ dùng đúng thiết lập này ngay lần mở tiếp theo và bạn vẫn có thể chỉnh nhanh khi đang đọc.</Text></View>

      <Pressable style={styles.reset} onPress={() => setSettings(defaultReaderSettings)}>
        <ButtonArt opacity={.92} />
        <Ionicons name="refresh-outline" size={18} color={xianxia.goldSoft} />
        <Text style={styles.resetText}>Khôi phục mặc định</Text>
      </Pressable>
    </ScrollView>
  </SafeAreaView>;
}

function Label({ title, value }: { title: string; value?: string }) {
  return <View style={styles.labelRow}><Text style={styles.label}>{title}</Text>{value ? <Text style={styles.labelValue}>{value}</Text> : null}</View>;
}

function Segment({ options, value, onChange }: { options: readonly (readonly [string, string])[]; value: string; onChange: (value: string) => void }) {
  return <View style={styles.segment}>{options.map(([id, label]) => <Pressable key={id} onPress={() => onChange(id)} style={[styles.segmentItem, value === id && styles.segmentActive]}><Text style={[styles.segmentText, value === id && styles.segmentTextActive]}>{label}</Text></Pressable>)}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  topbar: { minHeight: 64, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line, backgroundColor: 'rgba(244,235,216,.90)' },
  back: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  resetTop: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF' },
  topCopy: { flex: 1, alignItems: 'center' },
  kicker: { color: xianxia.cinnabar, fontSize: 7.5, fontWeight: '900', letterSpacing: 1.2 },
  topTitle: { color: xianxia.ink, fontSize: 18, fontWeight: '900', marginTop: 2 },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 16, paddingBottom: 50 },
  preview: { borderRadius: 19, borderWidth: 1, paddingHorizontal: 22, paddingVertical: 20, minHeight: 245, shadowColor: '#3C332C', shadowOpacity: .08, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  previewKicker: { fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  previewTitle: { fontSize: 19, lineHeight: 25, fontWeight: '900', marginTop: 8, textAlign: 'center' },
  previewText: { marginTop: 8, textAlign: 'justify' },
  previewMeta: { fontSize: 8.5, textAlign: 'center', marginTop: 18, fontWeight: '800' },
  rule: { height: 1, opacity: .5, marginVertical: 16 },
  card: { marginTop: 14, borderRadius: 18, padding: 14, backgroundColor: 'rgba(255,248,234,.95)', borderWidth: 1, borderColor: xianxia.line },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13, marginBottom: 8 },
  label: { color: xianxia.ink, fontSize: 11, fontWeight: '900' },
  labelValue: { color: xianxia.jade, fontSize: 9, fontWeight: '800' },
  adjust: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  adjustButton: { width: 45, height: 40, borderRadius: 12, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', alignItems: 'center', justifyContent: 'center' },
  smallA: { color: xianxia.jadeDeep, fontSize: 13, fontWeight: '900' },
  bigA: { color: xianxia.jadeDeep, fontSize: 18, fontWeight: '900' },
  track: { flex: 1, height: 5, borderRadius: 4, backgroundColor: '#DDD4C8', overflow: 'hidden' },
  fill: { height: 5, borderRadius: 4, backgroundColor: xianxia.jadeDeep },
  segment: { flexDirection: 'row', borderRadius: 12, backgroundColor: '#EEE7DB', padding: 3, gap: 3 },
  segmentItem: { flex: 1, minHeight: 37, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentActive: { backgroundColor: xianxia.jadeDeep },
  segmentText: { color: xianxia.inkSoft, fontSize: 9, fontWeight: '800' },
  segmentTextActive: { color: xianxia.goldSoft },
  themeRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  themeOption: { flex: 1, alignItems: 'center' },
  themeCircle: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: '#BEB5AA', alignItems: 'center', justifyContent: 'center' },
  themeActive: { borderWidth: 3, borderColor: xianxia.gold },
  themeLabel: { color: xianxia.inkSoft, fontSize: 8, fontWeight: '800', marginTop: 5 },
  paddingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  paddingDemo: { flex: 1, height: 40, borderRadius: 11, backgroundColor: '#F2ECE2', alignItems: 'center', justifyContent: 'center', gap: 7 },
  note: { marginTop: 14, borderRadius: 14, padding: 12, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', flexDirection: 'row', gap: 8 },
  noteText: { flex: 1, color: xianxia.inkSoft, fontSize: 9, lineHeight: 14 },
  reset: { position: 'relative', overflow: 'hidden', alignSelf: 'center', minWidth: 200, minHeight: 48, marginTop: 16, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  resetText: { color: '#FFF8EA', fontSize: 10, fontWeight: '900' },
});
