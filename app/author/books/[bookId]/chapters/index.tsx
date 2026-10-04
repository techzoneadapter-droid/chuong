import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, LoadingState, RetryState } from '../../../../../components/States';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../../../../contexts/AuthContext';
import { deleteDraftBook, setAuthorBookStatus } from '../../../../../services/books';
import { removeBookCover, replaceBookCover } from '../../../../../services/storage';
import { messageForError } from '../../../../../services/errors';
import { getAuthorChapters, getAuthorForUser, getMyBooks } from '../../../../../services/authors';
import { Book, BookStatus, Chapter } from '../../../../../types';

export default function AuthorChapterListScreen() {
  const router = useRouter(); const { bookId } = useLocalSearchParams<{ bookId: string }>(); const [chapters, setChapters] = useState<Chapter[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const { user, loading: authLoading } = useAuth();
  const [book, setBook] = useState<Book | null>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setLoading(true); setError(''); try { if (!user) { if (!authLoading) router.replace('/auth/login'); return; } const author = await getAuthorForUser(user.id); const owned = author ? (await getMyBooks(author.id)).find((item) => item.id === bookId) : null; if (!owned) throw new Error('Không tìm thấy truyện hoặc bạn không có quyền chỉnh sửa.'); setBook(owned); setChapters(await getAuthorChapters(bookId)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải bản thảo.'); } finally { setLoading(false); } }, [bookId, user?.id, authLoading]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const changeBookStatus = async (status: BookStatus) => {
    if (!book || busy) return;
    if (status !== 'draft' && !chapters.some((chapter) => chapter.status === 'published')) return setError('Hãy xuất bản ít nhất một chương trước khi công khai truyện.');
    setBusy(true);
    setError('');
    try {
      await setAuthorBookStatus(bookId, status);
      await load();
    } catch (cause) { setError(messageForError(cause)); } finally { setBusy(false); }
  };
  const changeCover = async () => {
    if (!user || !book || busy) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [2, 3], quality: .85 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) return setError('Ảnh bìa cần nhỏ hơn 5 MB.');
      setBusy(true);
      await replaceBookCover(user.id, book.id, asset.uri, asset.mimeType, book.coverUrl);
      await load();
    } catch (cause) { setError(messageForError(cause, 'Không thể thay ảnh bìa.')); } finally { setBusy(false); }
  };
  const clearCover = async () => {
    if (!user || !book || busy || !book.coverUrl) return;
    setBusy(true); setError('');
    try { await removeBookCover(user.id, book.id, book.coverUrl); await load(); }
    catch (cause) { setError(messageForError(cause, 'Không thể xóa ảnh bìa.')); }
    finally { setBusy(false); }
  };
  const drafts = chapters.filter((chapter) => chapter.status === 'draft').length;
  return <SafeAreaView style={styles.safe}><View style={styles.header}><Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#2D2327" /></Pressable><View style={styles.headCopy}><Text style={styles.title}>Quản lý chương</Text><Text style={styles.subtitle}>{drafts} bản nháp · {chapters.length - drafts} đã xuất bản</Text></View><Pressable style={styles.add} onPress={() => router.push({ pathname: '/author/books/[bookId]/chapters/[chapterId]', params: { bookId, chapterId: 'new' } })}><Ionicons name="add" size={20} color="#FFFFFF" /></Pressable></View>
    <ScrollView contentContainerStyle={styles.page}>
      {book ? <View style={{ paddingVertical: 16 }}><Text style={styles.title}>{book.title}</Text><Text style={styles.meta}>{book.status} · {book.visibility === 'public' ? 'Công khai' : 'Riêng tư'}</Text>
        {book.coverUrl ? <Image source={{ uri: book.coverUrl }} style={{ width: 80, height: 120, borderRadius: 10, marginTop: 12 }} /> : null}
        <View style={styles.coverActions}>
          <Pressable disabled={busy} style={styles.coverSelect} onPress={changeCover}><Ionicons name="images-outline" size={15} color="#8F1D3F" /><Text style={styles.coverSelectText}>{busy ? 'Đang lưu…' : book.coverUrl ? 'Chọn lại ảnh' : 'Chọn ảnh bìa'}</Text></Pressable>
          {book.coverUrl ? <Pressable disabled={busy} style={styles.coverDelete} onPress={clearCover}><Ionicons name="trash-outline" size={15} color="#9E3444" /><Text style={styles.coverDeleteText}>Xóa ảnh</Text></Pressable> : null}
        </View>
        <View style={styles.coverGuide}><Text style={styles.coverGuideTitle}>Bìa đẹp nhất</Text><Text style={styles.coverGuideText}>Tỷ lệ 2:3 · 1200 × 1800 px · tối thiểu 800 × 1200 px · 300 KB – 1.5 MB là lý tưởng · tối đa 5 MB · ưu tiên WebP/JPG.</Text></View>
        <View style={styles.statusPanel}>
          <Text style={styles.statusTitle}>Trạng thái truyện</Text>
          <Text style={styles.statusHelp}>Bạn có thể đổi trạng thái truyện của mình bất cứ lúc nào. Muốn công khai cần có ít nhất 1 chương đã xuất bản.</Text>
          <View style={styles.statusRow}>
            {([
              ['draft', 'Riêng tư', 'lock-closed-outline'],
              ['ongoing', 'Đang ra', 'radio-outline'],
              ['completed', 'Hoàn thành', 'checkmark-done-outline'],
              ['paused', 'Tạm dừng / Drop', 'pause-circle-outline'],
            ] as const).map(([value, label, icon]) => {
              const active = book.backendStatus === value;
              return <Pressable disabled={busy} key={value} onPress={() => changeBookStatus(value)} style={[styles.statusChip, active && styles.statusChipActive]}>
                <Ionicons name={icon} size={15} color={active ? '#F1D89A' : '#315247'} />
                <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>{label}</Text>
              </Pressable>;
            })}
          </View>
        </View>
        <Pressable style={styles.importCard} disabled={busy} onPress={() => router.push({ pathname: '/author/books/[bookId]/import', params: { bookId } })}>
          <View style={styles.importIcon}><Ionicons name="cloud-upload-outline" size={20} color="#F1D89A" /></View>
          <View style={{ flex: 1 }}><Text style={styles.importTitle}>Tải truyện / AI dịch</Text><Text style={styles.importBody}>Nhập TXT, DOCX, ZIP hoặc dán bản convert. AI toàn truyện chỉ dành cho Premium.</Text></View>
          <Ionicons name="chevron-forward" size={18} color="#F1D89A" />
        </Pressable>
        {book.backendStatus === 'draft' ? <Pressable disabled={busy} onPress={async () => { setBusy(true); try { await deleteDraftBook(book.id); router.replace('/write'); } catch (cause) { setError(messageForError(cause)); setBusy(false); } }}><Text style={styles.meta}>Xóa truyện nháp</Text></Pressable> : null}
      </View> : null}{loading ? <LoadingState label="Đang tải bản thảo…" /> : error ? <RetryState title="Không tải được chương" detail={error} onRetry={load} /> : chapters.length === 0 ? <EmptyState title="Chưa có chương" detail="Tạo bản nháp đầu tiên cho truyện này." /> : chapters.map((chapter) => <Pressable key={chapter.id} style={styles.row} onPress={() => router.push({ pathname: '/author/books/[bookId]/chapters/[chapterId]', params: { bookId, chapterId: chapter.id! } })}><View style={[styles.number, chapter.status === 'published' && styles.numberPublished]}><Text style={styles.numberText}>{chapter.number}</Text></View><View style={styles.copy}><Text numberOfLines={1} style={styles.chapterTitle}>{chapter.title}</Text><Text style={styles.meta}>{chapter.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'} · {(chapter.content?.length ?? 0).toLocaleString('vi-VN')} ký tự</Text></View><Ionicons name="chevron-forward" size={17} color="#A79B9F" /></Pressable>)}</ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ importCard: { minHeight: 72, marginTop: 14, borderRadius: 15, padding: 12, backgroundColor: '#23473D', borderWidth: 1, borderColor: '#C7A95D', flexDirection: 'row', alignItems: 'center', gap: 10 }, importIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(241,216,154,.12)', alignItems: 'center', justifyContent: 'center' }, importTitle: { color: '#FFF8EA', fontSize: 11, fontWeight: '900' }, importBody: { color: 'rgba(255,248,234,.68)', fontSize: 8.5, lineHeight: 13, marginTop: 3 }, safe: { flex: 1, backgroundColor: '#F8F2E9' }, header: { height: 63, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA' }, back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, headCopy: { flex: 1, marginLeft: 5 }, title: { color: '#291F23', fontSize: 17, fontWeight: '900' }, subtitle: { color: '#81757A', fontSize: 9, marginTop: 2 }, add: { width: 37, height: 37, borderRadius: 19, backgroundColor: '#8F1D3F', alignItems: 'center', justifyContent: 'center' }, page: { paddingHorizontal: 16, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' }, row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED2CB' }, number: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEE5E1', alignItems: 'center', justifyContent: 'center' }, numberPublished: { backgroundColor: '#E2ECE2' }, numberText: { color: '#8F1D3F', fontSize: 11, fontWeight: '900' }, copy: { flex: 1 }, chapterTitle: { color: '#2D2327', fontSize: 13, fontWeight: '900' }, meta: { color: '#81757A', fontSize: 9, marginTop: 4 } , coverActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }, coverSelect: { minHeight: 38, borderRadius: 10, paddingHorizontal: 11, backgroundColor: '#F3E8EC', borderWidth: 1, borderColor: '#D8BCC6', flexDirection: 'row', alignItems: 'center', gap: 6 }, coverSelectText: { color: '#8F1D3F', fontSize: 10, fontWeight: '900' }, coverDelete: { minHeight: 38, borderRadius: 10, paddingHorizontal: 11, backgroundColor: '#F8E8EA', borderWidth: 1, borderColor: '#E5C5CB', flexDirection: 'row', alignItems: 'center', gap: 6 }, coverDeleteText: { color: '#9E3444', fontSize: 10, fontWeight: '900' }, coverGuide: { marginTop: 9, padding: 10, borderRadius: 11, backgroundColor: '#EEF3EF', borderWidth: 1, borderColor: '#C8D7CD' }, coverGuideTitle: { color: '#315247', fontSize: 9, fontWeight: '900', marginBottom: 3 }, coverGuideText: { color: '#716965', fontSize: 8.5, lineHeight: 13 }, statusPanel: { marginTop: 12, borderRadius: 14, padding: 11, backgroundColor: '#EDF3EF', borderWidth: 1, borderColor: '#C5D5CA' }, statusTitle: { color: '#291F23', fontSize: 11, fontWeight: '900' }, statusHelp: { color: '#6F6863', fontSize: 8.5, lineHeight: 13, marginTop: 4 }, statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }, statusChip: { minHeight: 36, borderRadius: 10, paddingHorizontal: 10, backgroundColor: '#FFFDF7', borderWidth: 1, borderColor: '#C8D5CC', flexDirection: 'row', alignItems: 'center', gap: 5 }, statusChipActive: { backgroundColor: '#23473D', borderColor: '#C7A95D' }, statusChipText: { color: '#315247', fontSize: 8.5, fontWeight: '900' }, statusChipTextActive: { color: '#FFF8EA' }});
