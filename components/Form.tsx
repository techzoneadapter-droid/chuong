import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function FormScreen({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <SafeAreaView style={styles.safe}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}><Text style={styles.brand}>CHƯƠNG</Text><Text style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}<View style={styles.form}>{children}</View></ScrollView></SafeAreaView>;
}

export function FormField({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput placeholderTextColor="#9A8E93" style={[styles.input, props.multiline && styles.multiline]} {...props} /></View>;
}

export function PrimaryButton({ label, onPress, loading, disabled }: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress} style={[styles.button, (disabled || loading) && styles.disabled]}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{label}</Text>}</Pressable>;
}

export function FormMessage({ children, error }: { children: ReactNode; error?: boolean }) {
  return <Text style={[styles.message, error && styles.error]}>{children}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  page: { flexGrow: 1, width: '100%', maxWidth: 520, alignSelf: 'center', padding: 24, justifyContent: 'center' },
  brand: { color: '#8F1D3F', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#221A1D', fontSize: 30, fontWeight: '900', marginTop: 12 },
  subtitle: { color: '#756B6F', fontSize: 13, lineHeight: 20, marginTop: 7 },
  form: { marginTop: 24 }, field: { marginBottom: 14 }, label: { color: '#45393E', fontSize: 12, fontWeight: '800', marginBottom: 7 },
  input: { minHeight: 50, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#DDD0C9', borderRadius: 14, paddingHorizontal: 14, color: '#2D2327', fontSize: 14 },
  multiline: { minHeight: 112, paddingTop: 13, textAlignVertical: 'top' },
  button: { height: 52, backgroundColor: '#8F1D3F', borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 7 },
  disabled: { opacity: .45 }, buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  message: { color: '#507555', fontSize: 12, lineHeight: 18, marginBottom: 12 }, error: { color: '#A12B48' }
});
