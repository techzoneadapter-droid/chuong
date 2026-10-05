import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { xianxia } from '../constants/xianxia';
import { EmptyState, LoadingState, RetryState } from './States';
import {
  BookChapterSchedule,
  buildLocalScheduleIso,
  cancelBookChapterSchedule,
  defaultScheduleFields,
  getBookChapterSchedule,
  publishScheduledChapterNow,
  reschedulePendingBookChapters,
  updateScheduledChapterTime,
} from '../services/publishingSchedule';
import { BookStatus } from '../types';

type FinalStatus = Exclude<BookStatus, 'draft'>;

type Props = {
  bookId: string;
  contextLabel?: string;
  onBack: () => void;
};

function toFields(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

function relativeTime(value: string) {
  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) return 'đang đến giờ đăng';
  const minutes = Math.ceil(diff / 60_000);
  if (minutes < 60) return `còn ${minutes} phút`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `còn khoảng ${hours} giờ`;
  const days = Math.ceil(hours / 24);
  return `còn khoảng ${days} ngày`;
}

function statusLabel(value: FinalStatus | null) {
  if (value === 'completed') return 'Hoàn thành';
  if (value === 'paused') return 'Tạm dừng / Drop';
  return 'Đang ra';
}

export function ChapterScheduleManager({ bookId, contextLabel = 'Lịch đăng chương', onBack }: Props) {
  const defaults = useMemo(() => defaultScheduleFields(), []);
  const [data, setData] = useState<BookChapterSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [startDate, setStartDate] = useState(defaults.date);
  const [startTime, setStartTime] = useState(defaults.time);
  const [perDay, setPerDay] = useState(1);
  const [finalStatus, setFinalStatus] = useState<FinalStatus>('ongoing');

  const [editNumber, setEditNumber] = useState<number | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [confirmPublish, setConfirmPublish] = useState<number | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<number | null>(null);
  const [confirmCancelAll, setConfirmCancelAll] = useState(false);

  const load = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const next = await getBookChapterSchedule(bookId);
      setData(next);
      setFinalStatus(next.finalStatus ?? 'ongoing');
      if (next.pending.length) {
        const first = toFields(next.pending[0].scheduledPublishAt);
        setStartDate(first.date);
        setStartTime(first.time);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải lịch đăng chương.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookId]);

  useEffect(() => { void load(); }, [load]);

  const firstPending = data?.pending[0]?.scheduledPublishAt ?? null;
  const lastPending = data?.pending[data.pending.length - 1]?.scheduledPublishAt ?? null;
  const progress = data && data.totalChapters
    ? Math.round((data.publishedCount / data.totalChapters) * 100)
    : 0;

  const rescheduleAll = async () => {
    if (!data?.pending.length || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const startAt = buildLocalScheduleIso(startDate.trim(), startTime.trim());
      const rows = await reschedulePendingBookChapters(bookId, startAt, perDay, finalStatus);
      setMessage(`Đã xếp lại ${rows.length} chương · ${perDay} chương/ngày.`);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xếp lại lịch.');
    } finally {
      setBusy(false);
    }
  };

  const beginEdit = (chapterNumber: number, scheduledAt: string) => {
    const fields = toFields(scheduledAt);
    setEditNumber(chapterNumber);
    setEditDate(fields.date);
    setEditTime(fields.time);
    setConfirmPublish(null);
    setConfirmCancel(null);
  };

  const saveEdit = async () => {
    if (editNumber == null || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const scheduledAt = buildLocalScheduleIso(editDate.trim(), editTime.trim());
      await updateScheduledChapterTime(bookId, editNumber, scheduledAt);
      setMessage(`Đã đổi giờ đăng Chương ${editNumber}.`);
      setEditNumber(null);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể đổi giờ đăng.');
    } finally {
      setBusy(false);
    }
  };

  const publishNow = async (chapterNumber: number) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await publishScheduledChapterNow(bookId, chapterNumber);
      setMessage(`Chương ${chapterNumber} đã được đăng ngay.`);
      setConfirmPublish(null);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể đăng chương.');
    } finally {
      setBusy(false);
    }
  };

  const cancelOne = async (chapterNumber: number) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await cancelBookChapterSchedule(bookId, [chapterNumber]);
      setMessage(`Đã hủy lịch Chương ${chapterNumber}; chương vẫn được giữ ở bản nháp.`);
      setConfirmCancel(null);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể hủy lịch chương.');
    } finally {
      setBusy(false);
    }
  };

  const cancelAll = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const count = await cancelBookChapterSchedule(bookId);
      setMessage(`Đã hủy lịch ${count} chương. Các chương vẫn được giữ nguyên dưới dạng bản nháp.`);
      setConfirmCancelAll(false);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể hủy toàn bộ lịch.');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <SafeAreaView style={styles.safe}><LoadingState label="Đang tải lịch đăng…" /></SafeAreaView>;
  if (error && !data) return <SafeAreaView style={styles.safe}><RetryState detail={error} onRetry={() => void load()} /></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.header}>
      <Pressable style={styles.back} onPress={onBack}><Ionicons name="arrow-back" size={21} color={xianxia.ink} /></Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{contextLabel}</Text>
        <Text numberOfLines={1} style={styles.subtitle}>{data?.bookTitle ?? 'Quản lý lịch xuất bản'}</Text>
      </View>
      <Pressable disabled={refreshing} style={styles.back} onPress={() => void load(true)}><Ionicons name="refresh" size={19} color={xianxia.cinnabar} /></Pressable>
    </View>

    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      {data ? <>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroSeal}><Ionicons name="calendar-outline" size={22} color={xianxia.goldSoft} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroKicker}>LỊCH XUẤT BẢN</Text>
              <Text style={styles.heroTitle}>{data.pendingCount ? `${data.pendingCount} chương đang chờ đăng` : 'Chưa có chương hẹn đăng'}</Text>
              <Text style={styles.heroMeta}>Sau chương cuối · {statusLabel(data.finalStatus)}</Text>
            </View>
          </View>
          <View style={styles.heroProgress}><View style={[styles.heroFill, { width: `${progress}%` as any }]} /></View>
          <Text style={styles.heroProgressText}>{data.publishedCount}/{data.totalChapters} chương đã xuất bản · {progress}%</Text>
        </View>

        <View style={styles.stats}>
          <Stat value={data.publishedCount} label="Đã đăng" />
          <Stat value={data.pendingCount} label="Đang chờ" />
          <Stat value={data.draftCount} label="Nháp thường" />
        </View>

        {data.pendingCount ? <>
          <View style={styles.timeline}>
            <View><Text style={styles.timelineLabel}>Chương kế tiếp</Text><Text style={styles.timelineValue}>{firstPending ? new Date(firstPending).toLocaleString('vi-VN') : '—'}</Text></View>
            <Ionicons name="arrow-forward" size={16} color={xianxia.muted} />
            <View style={{ alignItems: 'flex-end' }}><Text style={styles.timelineLabel}>Chương cuối lịch</Text><Text style={styles.timelineValue}>{lastPending ? new Date(lastPending).toLocaleString('vi-VN') : '—'}</Text></View>
          </View>

          <View style={styles.rescheduleCard}>
            <Text style={styles.sectionKicker}>ĐỔI TOÀN BỘ NHỊP ĐĂNG</Text>
            <Text style={styles.sectionTitle}>Xếp lại lịch còn chờ</Text>
            <Text style={styles.sectionBody}>Chỉ các chương chưa đăng trong lịch hiện tại được xếp lại. Chương đã đăng không bị thay đổi.</Text>
            <View style={styles.fields}>
              <Field label="Ngày bắt đầu" value={startDate} onChange={setStartDate} placeholder="YYYY-MM-DD" />
              <Field label="Giờ bắt đầu" value={startTime} onChange={setStartTime} placeholder="20:00" />
              <Field label="Chương / ngày" value={String(perDay)} onChange={(value) => setPerDay(Math.max(1, Math.min(24, Number(value.replace(/\D/g, '')) || 1)))} placeholder="1" numeric />
            </View>
            <View style={styles.chips}>
              {[1,2,3,4,6].map((value) => <Pressable key={value} onPress={() => setPerDay(value)} style={[styles.chip, perDay === value && styles.chipActive]}><Text style={[styles.chipText, perDay === value && styles.chipTextActive]}>{value}/ngày</Text></Pressable>)}
            </View>
            <Text style={styles.fieldLabel}>Trạng thái sau chương cuối</Text>
            <View style={styles.chips}>
              {([
                ['ongoing','Đang ra'],
                ['completed','Hoàn thành'],
                ['paused','Tạm dừng'],
              ] as const).map(([value,label]) => <Pressable key={value} onPress={() => setFinalStatus(value)} style={[styles.chip, finalStatus === value && styles.chipActive]}><Text style={[styles.chipText, finalStatus === value && styles.chipTextActive]}>{label}</Text></Pressable>)}
            </View>
            <Pressable disabled={busy} onPress={() => void rescheduleAll()} style={[styles.primary, busy && styles.disabled]}>
              <Ionicons name="repeat-outline" size={17} color="#FFF8EA" /><Text style={styles.primaryText}>{busy ? 'Đang xử lý…' : 'Xếp lại toàn bộ lịch còn chờ'}</Text>
            </Pressable>
          </View>

          <View style={styles.sectionHead}>
            <View><Text style={styles.sectionKicker}>HÀNG ĐỢI</Text><Text style={styles.sectionTitle}>Các chương sắp đăng</Text></View>
            {!confirmCancelAll ? <Pressable onPress={() => setConfirmCancelAll(true)}><Text style={styles.cancelAllText}>Hủy toàn bộ lịch</Text></Pressable> : null}
          </View>

          {confirmCancelAll ? <View style={styles.dangerConfirm}>
            <Text style={styles.dangerTitle}>Hủy lịch tất cả {data.pendingCount} chương?</Text>
            <Text style={styles.dangerBody}>Nội dung không bị xóa; toàn bộ chương sẽ trở lại bản nháp bình thường.</Text>
            <View style={styles.confirmActions}>
              <Pressable onPress={() => setConfirmCancelAll(false)} style={styles.lightButton}><Text style={styles.lightButtonText}>Giữ lịch</Text></Pressable>
              <Pressable disabled={busy} onPress={() => void cancelAll()} style={styles.dangerButton}><Text style={styles.dangerButtonText}>Xác nhận hủy</Text></Pressable>
            </View>
          </View> : null}

          <View style={styles.list}>
            {data.pending.map((chapter, index) => {
              const editing = editNumber === chapter.chapterNumber;
              const publishing = confirmPublish === chapter.chapterNumber;
              const cancelling = confirmCancel === chapter.chapterNumber;
              return <View key={chapter.id} style={styles.row}>
                <View style={styles.number}><Text style={styles.numberText}>{chapter.chapterNumber}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={styles.chapterTitle}>{chapter.title}</Text>
                  <Text style={styles.chapterTime}>{new Date(chapter.scheduledPublishAt).toLocaleString('vi-VN')}</Text>
                  <Text style={styles.relative}>{index === 0 ? 'Kế tiếp · ' : ''}{relativeTime(chapter.scheduledPublishAt)}</Text>

                  {editing ? <View style={styles.inlineEditor}>
                    <Field label="Ngày" value={editDate} onChange={setEditDate} placeholder="YYYY-MM-DD" compact />
                    <Field label="Giờ" value={editTime} onChange={setEditTime} placeholder="20:00" compact />
                    <View style={styles.confirmActions}>
                      <Pressable onPress={() => setEditNumber(null)} style={styles.lightButton}><Text style={styles.lightButtonText}>Hủy sửa</Text></Pressable>
                      <Pressable disabled={busy} onPress={() => void saveEdit()} style={styles.saveButton}><Text style={styles.saveButtonText}>Lưu giờ mới</Text></Pressable>
                    </View>
                  </View> : null}

                  {publishing ? <View style={styles.inlineConfirm}>
                    <Text style={styles.confirmText}>Đăng Chương {chapter.chapterNumber} ngay bây giờ?</Text>
                    <View style={styles.confirmActions}>
                      <Pressable onPress={() => setConfirmPublish(null)} style={styles.lightButton}><Text style={styles.lightButtonText}>Không</Text></Pressable>
                      <Pressable disabled={busy} onPress={() => void publishNow(chapter.chapterNumber)} style={styles.saveButton}><Text style={styles.saveButtonText}>Đăng ngay</Text></Pressable>
                    </View>
                  </View> : null}

                  {cancelling ? <View style={styles.inlineConfirm}>
                    <Text style={styles.confirmText}>Hủy lịch chương này và giữ lại dưới dạng bản nháp?</Text>
                    <View style={styles.confirmActions}>
                      <Pressable onPress={() => setConfirmCancel(null)} style={styles.lightButton}><Text style={styles.lightButtonText}>Không</Text></Pressable>
                      <Pressable disabled={busy} onPress={() => void cancelOne(chapter.chapterNumber)} style={styles.dangerButton}><Text style={styles.dangerButtonText}>Hủy lịch</Text></Pressable>
                    </View>
                  </View> : null}

                  {!editing && !publishing && !cancelling ? <View style={styles.rowActions}>
                    <Pressable onPress={() => beginEdit(chapter.chapterNumber, chapter.scheduledPublishAt)} style={styles.smallAction}><Ionicons name="time-outline" size={13} color={xianxia.jadeDeep} /><Text style={styles.smallActionText}>Đổi giờ</Text></Pressable>
                    <Pressable onPress={() => { setConfirmPublish(chapter.chapterNumber); setConfirmCancel(null); setEditNumber(null); }} style={styles.smallAction}><Ionicons name="paper-plane-outline" size={13} color={xianxia.jadeDeep} /><Text style={styles.smallActionText}>Đăng ngay</Text></Pressable>
                    <Pressable onPress={() => { setConfirmCancel(chapter.chapterNumber); setConfirmPublish(null); setEditNumber(null); }} style={[styles.smallAction, styles.smallDanger]}><Ionicons name="close-circle-outline" size={13} color={xianxia.danger} /><Text style={styles.smallDangerText}>Hủy lịch</Text></Pressable>
                  </View> : null}
                </View>
              </View>;
            })}
          </View>
        </> : <EmptyState title="Không có lịch đăng đang chờ" detail="Hãy dùng tính năng nhập hàng loạt và bật “Hẹn lịch đăng tự động” để tạo lịch mới." />}
      </> : null}
    </ScrollView>
  </SafeAreaView>;
}

function Stat({ value, label }: { value: number; label: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value.toLocaleString('vi-VN')}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function Field({ label, value, onChange, placeholder, numeric = false, compact = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; numeric?: boolean; compact?: boolean }) {
  return <View style={[styles.field, compact && styles.fieldCompact]}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChange} keyboardType={numeric ? 'number-pad' : 'default'} placeholder={placeholder} placeholderTextColor="#9B9185" style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  header: { minHeight: 64, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line, backgroundColor: 'rgba(255,248,234,.96)' },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  title: { color: xianxia.ink, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: xianxia.muted, fontSize: 8.5, marginTop: 2, textAlign: 'center' },
  page: { padding: 16, paddingBottom: 54, width: '100%', maxWidth: 760, alignSelf: 'center' },
  error: { color: xianxia.danger, backgroundColor: '#F6E6E3', borderRadius: 11, padding: 10, fontSize: 9.5, marginBottom: 10 },
  success: { color: '#47704D', backgroundColor: '#E8F2EA', borderRadius: 11, padding: 10, fontSize: 9.5, marginBottom: 10 },
  hero: { borderRadius: 19, padding: 15, backgroundColor: '#27423B', borderWidth: 1, borderColor: xianxia.gold },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroSeal: { width: 44, height: 44, borderRadius: 13, backgroundColor: xianxia.cinnabar, borderWidth: 1, borderColor: xianxia.gold, alignItems: 'center', justifyContent: 'center' },
  heroKicker: { color: xianxia.goldSoft, fontSize: 7.5, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { color: '#FFFDF8', fontSize: 15, fontWeight: '900', marginTop: 3 },
  heroMeta: { color: 'rgba(255,253,248,.72)', fontSize: 8.2, marginTop: 4 },
  heroProgress: { height: 7, borderRadius: 5, backgroundColor: 'rgba(255,255,255,.12)', overflow: 'hidden', marginTop: 13 },
  heroFill: { height: 7, backgroundColor: xianxia.goldSoft },
  heroProgressText: { color: 'rgba(255,253,248,.74)', fontSize: 7.8, marginTop: 5, textAlign: 'right' },
  stats: { flexDirection: 'row', gap: 7, marginTop: 9 },
  stat: { flex: 1, minHeight: 61, borderRadius: 13, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: xianxia.line, alignItems: 'center', justifyContent: 'center', padding: 8 },
  statValue: { color: xianxia.jadeDeep, fontSize: 16, fontWeight: '900' },
  statLabel: { color: xianxia.muted, fontSize: 7.5, marginTop: 2, fontWeight: '800' },
  timeline: { minHeight: 65, borderRadius: 14, padding: 11, backgroundColor: '#F8F0DB', borderWidth: 1, borderColor: '#DCC89C', marginTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  timelineLabel: { color: xianxia.muted, fontSize: 7.2, fontWeight: '800' },
  timelineValue: { color: xianxia.ink, fontSize: 8.6, fontWeight: '900', marginTop: 3 },
  rescheduleCard: { marginTop: 13, borderRadius: 16, padding: 13, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: xianxia.line },
  sectionKicker: { color: xianxia.cinnabar, fontSize: 7.4, fontWeight: '900', letterSpacing: 1 },
  sectionTitle: { color: xianxia.ink, fontSize: 15, fontWeight: '900', marginTop: 2 },
  sectionBody: { color: xianxia.muted, fontSize: 8.3, lineHeight: 13, marginTop: 5 },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 },
  field: { flexGrow: 1, minWidth: 118 },
  fieldCompact: { minWidth: 106, flexBasis: '46%' },
  fieldLabel: { color: xianxia.inkSoft, fontSize: 7.6, fontWeight: '900', marginBottom: 5, marginTop: 9 },
  input: { height: 38, borderRadius: 10, borderWidth: 1, borderColor: '#BFD0C4', backgroundColor: '#FFFDF7', paddingHorizontal: 9, color: xianxia.ink, fontSize: 9.4, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { minHeight: 32, borderRadius: 9, borderWidth: 1, borderColor: '#BED0C3', backgroundColor: xianxia.jadeMist, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: xianxia.jadeDeep, borderColor: xianxia.gold },
  chipText: { color: xianxia.jadeDeep, fontSize: 7.8, fontWeight: '900' },
  chipTextActive: { color: '#FFF8EA' },
  primary: { minHeight: 46, borderRadius: 13, backgroundColor: xianxia.cinnabar, borderWidth: 1, borderColor: xianxia.gold, marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryText: { color: '#FFF8EA', fontSize: 9.6, fontWeight: '900' },
  disabled: { opacity: .48 },
  sectionHead: { marginTop: 22, marginBottom: 8, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  cancelAllText: { color: xianxia.danger, fontSize: 8, fontWeight: '900' },
  dangerConfirm: { borderRadius: 13, padding: 11, backgroundColor: '#F8E9E7', borderWidth: 1, borderColor: '#E1C2BD', marginBottom: 8 },
  dangerTitle: { color: xianxia.danger, fontSize: 9.6, fontWeight: '900' },
  dangerBody: { color: '#806A68', fontSize: 8, lineHeight: 12, marginTop: 3 },
  list: { gap: 7 },
  row: { minHeight: 82, borderRadius: 14, padding: 10, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: xianxia.line, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  number: { width: 35, height: 35, borderRadius: 11, backgroundColor: xianxia.jadeDeep, borderWidth: 1, borderColor: xianxia.gold, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: xianxia.goldSoft, fontSize: 9, fontWeight: '900' },
  chapterTitle: { color: xianxia.ink, fontSize: 10.5, fontWeight: '900' },
  chapterTime: { color: xianxia.muted, fontSize: 8.3, marginTop: 3 },
  relative: { color: xianxia.jadeDeep, fontSize: 7.8, fontWeight: '900', marginTop: 3 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  smallAction: { minHeight: 31, borderRadius: 9, paddingHorizontal: 8, backgroundColor: '#EDF3EF', borderWidth: 1, borderColor: '#C5D7CB', flexDirection: 'row', alignItems: 'center', gap: 4 },
  smallActionText: { color: xianxia.jadeDeep, fontSize: 7.4, fontWeight: '900' },
  smallDanger: { backgroundColor: '#F8E9E7', borderColor: '#E1C2BD' },
  smallDangerText: { color: xianxia.danger, fontSize: 7.4, fontWeight: '900' },
  inlineEditor: { marginTop: 8, padding: 9, borderRadius: 11, backgroundColor: '#EDF3EF', borderWidth: 1, borderColor: '#C5D7CB', flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  inlineConfirm: { marginTop: 8, padding: 9, borderRadius: 11, backgroundColor: '#F8F0DB', borderWidth: 1, borderColor: '#DCC89C' },
  confirmText: { color: xianxia.ink, fontSize: 8.5, fontWeight: '900' },
  confirmActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  lightButton: { minHeight: 32, borderRadius: 9, paddingHorizontal: 10, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: xianxia.line, alignItems: 'center', justifyContent: 'center' },
  lightButtonText: { color: xianxia.muted, fontSize: 7.8, fontWeight: '900' },
  saveButton: { minHeight: 32, borderRadius: 9, paddingHorizontal: 10, backgroundColor: xianxia.jadeDeep, alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { color: '#FFF8EA', fontSize: 7.8, fontWeight: '900' },
  dangerButton: { minHeight: 32, borderRadius: 9, paddingHorizontal: 10, backgroundColor: xianxia.danger, alignItems: 'center', justifyContent: 'center' },
  dangerButtonText: { color: '#FFF', fontSize: 7.8, fontWeight: '900' },
});
