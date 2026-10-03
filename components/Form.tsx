import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { xianxia } from '../constants/xianxia';
import { XianxiaBackdrop } from './XianxiaBackdrop';

export function FormScreen({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <SafeAreaView style={styles.safe}>
    <XianxiaBackdrop />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
      <View style={styles.brandRow}><View style={styles.seal}><Text style={styles.sealText}>章</Text></View><View><Text style={styles.brand}>CHƯƠNG</Text><Text style={styles.brandSub}>Mỗi chương, một thế giới.</Text></View></View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.form}>{children}</View>
    </ScrollView>
  </SafeAreaView>;
}

export function FormField({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput placeholderTextColor="#9A9186" style={[styles.input, props.multiline && styles.multiline]} {...props} /></View>;
}

export function PrimaryButton({ label, onPress, loading, disabled }: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, (disabled || loading) && styles.disabled, pressed && !(disabled || loading) && styles.pressed]}>
    {loading ? <ActivityIndicator color={xianxia.goldSoft} /> : <><Text style={styles.buttonText}>{label}</Text><Text style={styles.buttonRune}>›</Text></>}
  </Pressable>;
}

export function FormMessage({ children, error }: { children: ReactNode; error?: boolean }) {
  return <View style={[styles.messageBox, error && styles.errorBox]}><Text style={[styles.message, error && styles.error]}>{children}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  page: { flexGrow: 1, width: '100%', maxWidth: 540, alignSelf: 'center', padding: 24, justifyContent: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  seal: { width: 34, height: 34, borderRadius: 10, backgroundColor: xianxia.cinnabar, borderWidth: 1, borderColor: xianxia.gold, alignItems: 'center', justifyContent: 'center' },
  sealText: { color: '#F4DDA8', fontSize: 17, fontWeight: '900' },
  brand: { color: xianxia.ink, fontSize: 14, fontWeight: '900', letterSpacing: 1.8 },
  brandSub: { color: xianxia.muted, fontSize: 8, marginTop: 1 },
  title: { color: xianxia.ink, fontSize: 30, fontWeight: '900', marginTop: 18 },
  subtitle: { color: xianxia.muted, fontSize: 13, lineHeight: 20, marginTop: 7 },
  form: { marginTop: 24, borderRadius: 20, backgroundColor: 'rgba(255,253,247,.80)', borderWidth: 1, borderColor: xianxia.line, padding: 16 },
  field: { marginBottom: 14 },
  label: { color: xianxia.inkSoft, fontSize: 11, fontWeight: '900', marginBottom: 7 },
  input: { minHeight: 50, backgroundColor: '#FFFCF6', borderWidth: 1, borderColor: xianxia.line, borderRadius: 14, paddingHorizontal: 14, color: xianxia.ink, fontSize: 14 },
  multiline: { minHeight: 112, paddingTop: 13, textAlignVertical: 'top' },
  button: { minHeight: 52, backgroundColor: xianxia.jadeDeep, borderRadius: 15, borderWidth: 1, borderColor: '#496A61', paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 7 },
  disabled: { opacity: .45 },
  pressed: { opacity: .9, transform: [{ scale: .995 }] },
  buttonText: { color: xianxia.white, fontSize: 13, fontWeight: '900' },
  buttonRune: { color: xianxia.goldSoft, fontSize: 20, lineHeight: 20, marginTop: -2 },
  messageBox: { borderRadius: 12, backgroundColor: '#E7EFE9', borderWidth: 1, borderColor: '#C7D9CB', padding: 10, marginBottom: 12 },
  errorBox: { backgroundColor: '#F5E5E1', borderColor: '#E2C2BA' },
  message: { color: '#507555', fontSize: 11, lineHeight: 17 },
  error: { color: xianxia.danger },
});
