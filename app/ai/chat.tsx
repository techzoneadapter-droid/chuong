import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getBook } from '../../data/books';
import { answerStoryQuestion } from '../../services/ai';

interface Message { id: number; role: 'user' | 'assistant'; text: string; }
const suggestions = ['Nhân vật này là ai?', 'Tóm tắt mối quan hệ', 'Tại sao nhân vật làm vậy?', 'Chuyện gì vừa xảy ra?'];

export default function StoryChatScreen() {
  const router = useRouter();
  const { bookId, chapter } = useLocalSearchParams<{ bookId?: string; chapter?: string }>();
  const book = getBook(bookId);
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: 'user', text: 'Lâm Động là ai?' },
    { id: 2, role: 'assistant', text: answerStoryQuestion('Lâm Động là ai?') }
  ]);
  const scrollRef = useRef<ScrollView>(null);
  const send = (question = text) => {
    const clean = question.trim(); if (!clean) return;
    setMessages((items) => [...items, { id: Date.now(), role: 'user', text: clean }, { id: Date.now() + 1, role: 'assistant', text: answerStoryQuestion(clean) }]);
    setText('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}><Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#2D2327" /></Pressable><View style={styles.aiAvatar}><Ionicons name="sparkles" size={17} color="#FFFFFF" /></View><View style={{ flex: 1 }}><Text style={styles.title}>Hỏi truyện</Text><Text style={styles.subtitle}>{book.title} · đến Chương {chapter ?? 1}</Text></View></View>
      <View style={styles.notice}><Ionicons name="shield-checkmark-outline" size={16} color="#8F1D3F" /><Text style={styles.noticeText}>AI chỉ sử dụng nội dung bạn đã đọc để hạn chế tiết lộ cốt truyện.</Text></View>
      <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={styles.messageContent} showsVerticalScrollIndicator={false}>
        {messages.map((message) => <View key={message.id} style={[styles.message, message.role === 'user' ? styles.userMessage : styles.aiMessage]}>{message.role === 'assistant' ? <Text style={styles.aiLabel}>✦ CHƯƠNG AI</Text> : null}<Text style={[styles.messageText, message.role === 'user' && styles.userText]}>{message.text}</Text></View>)}
        <Text style={styles.suggestLabel}>GỢI Ý CÂU HỎI</Text><View style={styles.suggestions}>{suggestions.map((item) => <Pressable key={item} style={styles.suggestion} onPress={() => send(item)}><Text style={styles.suggestionText}>{item}</Text></Pressable>)}</View>
      </ScrollView>
      <View style={styles.composer}><TextInput value={text} onChangeText={setText} onSubmitEditing={() => send()} placeholder="Hỏi về nhân vật, tình tiết…" placeholderTextColor="#9A8E93" style={styles.input} multiline /><Pressable onPress={() => send()} style={[styles.send, !text.trim() && styles.sendDisabled]} disabled={!text.trim()}><Ionicons name="arrow-up" size={20} color="#FFFFFF" /></Pressable></View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' }, header: { height: 61, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA', gap: 9 }, back: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E3D6D0', alignItems: 'center', justifyContent: 'center' }, aiAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#8F1D3F', alignItems: 'center', justifyContent: 'center' }, title: { color: '#291F23', fontSize: 16, fontWeight: '900' }, subtitle: { color: '#81757A', fontSize: 9, marginTop: 2 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#F1E3E7', paddingHorizontal: 16, paddingVertical: 9 }, noticeText: { flex: 1, color: '#744957', fontSize: 9, lineHeight: 13, fontWeight: '700' }, messages: { flex: 1 }, messageContent: { padding: 16, paddingBottom: 24, maxWidth: 720, width: '100%', alignSelf: 'center' }, message: { maxWidth: '86%', paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12 }, aiMessage: { alignSelf: 'flex-start', backgroundColor: '#FFFDFC', borderTopRightRadius: 15, borderBottomLeftRadius: 15, borderBottomRightRadius: 15, borderWidth: 1, borderColor: '#E1D4CE' }, userMessage: { alignSelf: 'flex-end', backgroundColor: '#8F1D3F', borderTopLeftRadius: 15, borderBottomLeftRadius: 15, borderBottomRightRadius: 15 }, aiLabel: { color: '#8F1D3F', fontSize: 8, fontWeight: '900', letterSpacing: .8, marginBottom: 5 }, messageText: { color: '#4B4044', fontSize: 13, lineHeight: 19 }, userText: { color: '#FFFFFF' }, suggestLabel: { color: '#8F1D3F', fontSize: 8, fontWeight: '900', letterSpacing: 1, marginTop: 13, marginBottom: 8 }, suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, suggestion: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: '#D3BAC3', backgroundColor: '#FBF6F3' }, suggestionText: { color: '#7D2945', fontSize: 10, fontWeight: '800' },
  composer: { borderTopWidth: 1, borderTopColor: '#DFD2CB', backgroundColor: '#FFFDFC', paddingHorizontal: 13, paddingVertical: 9, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }, input: { flex: 1, maxHeight: 100, minHeight: 42, borderRadius: 21, backgroundColor: '#F3ECE8', paddingHorizontal: 15, paddingTop: 11, paddingBottom: 10, color: '#33292D', fontSize: 13 }, send: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#8F1D3F', alignItems: 'center', justifyContent: 'center' }, sendDisabled: { opacity: .35 }
});
