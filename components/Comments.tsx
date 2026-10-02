import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { comments as demoComments } from '../data/books';
import { createComment, deleteComment, getComments, setCommentLike } from '../services/comments';
import { messageForError } from '../services/errors';
import { DiscussionComment } from '../types';
import { LoadingState, RetryState } from './States';

export function Comments({ bookId, chapterId }: { bookId: string; chapterId?: string }) {
  const router = useRouter(); const { user } = useAuth();
  const [items, setItems] = useState<DiscussionComment[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [text, setText] = useState(''); const [reply, setReply] = useState<DiscussionComment | null>(null);
  const [sending, setSending] = useState(false); const [notice, setNotice] = useState('');
  const pending = useRef(new Set<string>());
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current; setLoading(true); setError('');
    try {
      const data = isSupabaseConfigured ? await getComments(bookId, chapterId, user?.id) : demoComments.map((item) => ({ id: item.id, userId: '', parentId: null, name: item.name, avatarUrl: null, content: item.body, createdAt: '', likes: item.likes, liked: false }));
      if (request === generation.current) setItems(data);
    } catch (cause) { if (request === generation.current) setError(messageForError(cause)); }
    finally { if (request === generation.current) setLoading(false); }
  }, [bookId, chapterId, user?.id]);
  useEffect(() => { setReply(null); setText(''); void load(); return () => { ++generation.current; }; }, [load]);
  const send = async () => {
    if (!user) return router.push('/auth/login');
    if (sending || !text.trim()) return;
    setSending(true); setError('');
    try { await createComment(user.id, bookId, text, chapterId, reply?.id); setText(''); setReply(null); await load(); }
    catch (cause) { setError(messageForError(cause)); }
    finally { setSending(false); }
  };
  const like = async (item: DiscussionComment) => {
    if (isSupabaseConfigured && !user) return router.push('/auth/login');
    if (pending.current.has(item.id)) return;
    pending.current.add(item.id);
    const liked = !item.liked;
    setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, liked, likes: row.likes + (liked ? 1 : -1) } : row));
    try { if (user && isSupabaseConfigured) await setCommentLike(item.id, user.id, liked); }
    catch (cause) { setItems((rows) => rows.map((row) => row.id === item.id ? item : row)); setError(messageForError(cause)); }
    finally { pending.current.delete(item.id); }
  };
  const remove = async (id: string) => {
    if (!user) return;
    try { await deleteComment(id, user.id); await load(); } catch (cause) { setError(messageForError(cause)); }
  };
  const render = (item: DiscussionComment, nested = false) => <View key={item.id} style={[styles.row, nested && styles.reply]}>
    {item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={styles.avatar} /> : <View style={styles.avatar}><Text style={styles.initial}>{item.name[0]}</Text></View>}
    <View style={styles.copy}><Text style={styles.name}>{item.name}</Text><Text style={styles.body}>{item.content}</Text>
      <Text style={styles.time}>{item.createdAt ? new Date(item.createdAt).toLocaleString('vi-VN') : 'Demo'}</Text>
      <View style={styles.actions}><Pressable onPress={() => like(item)}><Text style={styles.action}>{item.liked ? '♥' : '♡'} {item.likes}</Text></Pressable>
        {!nested ? <Pressable onPress={() => { if (!user && isSupabaseConfigured) router.push('/auth/login'); else setReply(item); }}><Text style={styles.action}>Trả lời</Text></Pressable> : null}
        {user?.id === item.userId ? <Pressable onPress={() => remove(item.id)}><Text style={styles.action}>Xóa</Text></Pressable> : null}
        <Pressable onPress={() => setNotice('Báo cáo sẽ được hỗ trợ khi hệ thống kiểm duyệt hoạt động.')}><Text style={styles.action}>Báo cáo</Text></Pressable></View>
    </View>
  </View>;
  return <View>
    <Text style={styles.heading}>{chapterId ? 'Thảo luận chương' : 'Bình luận'} · {items.length}</Text>
    {loading ? <LoadingState label="Đang tải bình luận…" /> : null}
    {error ? <RetryState detail={error} onRetry={load} /> : null}
    {!loading && !items.length && !error ? <Text style={styles.body}>Chưa có bình luận. Hãy bắt đầu cuộc trò chuyện.</Text> : null}
    {items.filter((item) => !item.parentId).map((item) => <View key={item.id}>{render(item)}{items.filter((row) => row.parentId === item.id).map((row) => render(row, true))}</View>)}
    {notice ? <Text style={styles.time}>{notice}</Text> : null}
    {reply ? <Pressable onPress={() => setReply(null)}><Text style={styles.action}>Trả lời {reply.name} · Hủy</Text></Pressable> : null}
    {isSupabaseConfigured && user ? <><TextInput style={styles.input} value={text} onChangeText={setText} placeholder="Viết bình luận…" multiline maxLength={3000} /><Pressable disabled={sending || !text.trim()} onPress={send}><Text style={styles.send}>{sending ? 'Đang gửi…' : 'Gửi bình luận'}</Text></Pressable></> : <Pressable onPress={() => isSupabaseConfigured ? router.push('/auth/login') : setNotice('Demo · Cấu hình Supabase để đăng bình luận.')}><Text style={styles.send}>{isSupabaseConfigured ? 'Đăng nhập để bình luận' : 'Bình luận mẫu · Demo'}</Text></Pressable>}
  </View>;
}
const styles = StyleSheet.create({ heading: { fontSize: 18, fontWeight: '900', color: '#8F1D3F', marginVertical: 15 }, row: { flexDirection: 'row', gap: 10, paddingVertical: 12 }, reply: { marginLeft: 28 }, avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' }, initial: { color: '#8F1D3F', fontWeight: '900' }, copy: { flex: 1 }, name: { fontSize: 12, fontWeight: '800', color: '#8F1D3F' }, body: { color: '#84766B', fontSize: 13, lineHeight: 20, marginTop: 4 }, time: { color: '#91858A', fontSize: 10, marginTop: 5 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 8 }, action: { color: '#A52C52', fontSize: 11, paddingVertical: 4 }, input: { borderWidth: 1, borderColor: '#D8CBC5', borderRadius: 12, padding: 12, minHeight: 65, marginTop: 12, backgroundColor: '#FFFDFC', color: '#302821' }, send: { color: '#8F1D3F', fontWeight: '800', paddingVertical: 14 } });
