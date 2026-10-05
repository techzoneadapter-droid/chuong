import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../../components/States';
import { XianxiaBackdrop } from '../../components/XianxiaBackdrop';
import { xianxia } from '../../constants/xianxia';
import { useAuth } from '../../contexts/AuthContext';
import { getAuthorForUser } from '../../services/authors';
import {
  AuthorEvent,
  AuthorEventLeaderboardRow,
  getAuthorEventCenter,
  getAuthorEventLeaderboard,
  joinAuthorEvent,
  syncAuthorEventBadge,
} from '../../services/authorEvents';

function progress(value: number, target: number) {
  if (!target) return 1;
  return Math.max(0, Math.min(1, value / target));
}

function daysLeft(endsAt: string) {
  const diff = new Date(endsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

export default function AuthorEventsScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<AuthorEvent[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [leaderboard, setLeaderboard] = useState<AuthorEventLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selected = useMemo(
    () => events.find((item) => item.eventId === selectedId) ?? events[0] ?? null,
    [events, selectedId],
  );

  const load = useCallback(async (refresh = false) => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth/login');
      return;
    }

    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const author = await getAuthorForUser(user.id);
      if (!author) {
        router.replace('/author/onboarding');
        return;
      }

      let rows = await getAuthorEventCenter(author.id);
      const eligible = rows.filter((item) =>
        item.joined &&
        !item.badgeAwarded &&
        item.wordsWritten >= item.targetWords &&
        item.chaptersPublished >= item.targetChapters
      );

      if (eligible.length) {
        await Promise.all(eligible.map((item) => syncAuthorEventBadge(item.eventId).catch(() => false)));
        rows = rows.map((item) => eligible.some((entry) => entry.eventId === item.eventId)
          ? { ...item, badgeAwarded: true }
          : item);
      }

      setEvents(rows);
      const target = rows.find((item) => item.eventId === selectedId) ?? rows[0];
      if (target) {
        setSelectedId(target.eventId);
        setLeaderboard(await getAuthorEventLeaderboard(target.eventId, 30));
      } else {
        setLeaderboard([]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải sự kiện tác giả.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authLoading, router, selectedId, user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const selectEvent = async (event: AuthorEvent) => {
    setSelectedId(event.eventId);
    setError('');
    try {
      setLeaderboard(await getAuthorEventLeaderboard(event.eventId, 30));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải bảng xếp hạng.');
    }
  };

  const join = async () => {
    if (!selected || joining) return;
    setJoining(true);
    setError('');
    setNotice('');
    try {
      await joinAuthorEvent(selected.eventId);
      setNotice('Đã tham gia sự kiện. Từ bây giờ chương hợp lệ mới xuất bản sẽ được tính tiến độ.');
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tham gia sự kiện.');
    } finally {
      setJoining(false);
    }
  };

  if (loading && !events.length) {
    return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><LoadingState label="Đang mở Đại Hội Văn Đạo…" /></SafeAreaView>;
  }
  if (error && !events.length) {
    return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><RetryState detail={error} onRetry={() => void load()} /></SafeAreaView>;
  }

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <XianxiaBackdrop />
    <View style={styles.topbar}>
      <Pressable style={styles.icon} onPress={() => router.back()}><Ionicons name="arrow-back" size={21} color={xianxia.ink} /></Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.topTitle}>Đại Hội Văn Đạo</Text>
        <Text style={styles.topSub}>Sự kiện · mục tiêu viết · bảng xếp hạng</Text>
      </View>
      <Pressable style={styles.icon} onPress={() => void load(true)}><Ionicons name="refresh" size={19} color={xianxia.cinnabar} /></Pressable>
    </View>

    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={xianxia.jadeDeep} />}
      contentContainerStyle={styles.page}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {!events.length ? <View style={styles.empty}><Ionicons name="calendar-outline" size={26} color={xianxia.muted} /><Text style={styles.emptyTitle}>Chưa có sự kiện</Text><Text style={styles.emptyBody}>Khi CHƯƠNG mở một thử thách mới, thông tin sẽ xuất hiện tại đây.</Text></View> : null}

      {events.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eventTabs}>
        {events.map((event) => <Pressable key={event.eventId} onPress={() => void selectEvent(event)} style={[styles.eventTab, selected?.eventId === event.eventId && styles.eventTabActive]}>
          <Text numberOfLines={1} style={[styles.eventTabText, selected?.eventId === event.eventId && styles.eventTabTextActive]}>{event.title}</Text>
        </Pressable>)}
      </ScrollView> : null}

      {selected ? <>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroSeal}><Ionicons name="trophy-outline" size={24} color={xianxia.goldSoft} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroKicker}>{selected.status === 'running' ? 'ĐANG DIỄN RA' : selected.status === 'upcoming' ? 'SẮP DIỄN RA' : 'ĐÃ KẾT THÚC'}</Text>
              <Text style={styles.heroTitle}>{selected.title}</Text>
            </View>
            <View style={styles.daysPill}><Text style={styles.daysValue}>{selected.status === 'running' ? daysLeft(selected.endsAt) : selected.participantCount}</Text><Text style={styles.daysLabel}>{selected.status === 'running' ? 'ngày còn lại' : 'tác giả'}</Text></View>
          </View>
          <Text style={styles.heroBody}>{selected.description}</Text>
          <View style={styles.heroMetaRow}>
            <Text style={styles.heroMeta}>Kết thúc {new Date(selected.endsAt).toLocaleDateString('vi-VN')}</Text>
            {selected.genreFilter ? <Text style={styles.heroMeta}>Thể loại · {selected.genreFilter}</Text> : null}
          </View>
        </View>

        {!selected.joined ? <View style={styles.joinCard}>
          <View style={styles.joinIcon}><Ionicons name="flag-outline" size={22} color={xianxia.cinnabar} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.joinTitle}>Tham gia thử thách</Text>
            <Text style={styles.joinBody}>Tiến độ chỉ bắt đầu tính từ lúc bạn tham gia. Không cộng ngược chương đã xuất bản trước đó.</Text>
          </View>
          <Pressable disabled={joining || selected.status === 'ended'} onPress={() => void join()} style={[styles.joinButton, (joining || selected.status === 'ended') && styles.disabled]}>
            <Text style={styles.joinButtonText}>{joining ? 'Đang vào…' : selected.status === 'ended' ? 'Đã đóng' : 'Tham gia'}</Text>
          </Pressable>
        </View> : <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <View>
              <Text style={styles.sectionKicker}>TIẾN ĐỘ CỦA BẠN</Text>
              <Text style={styles.sectionTitle}>Hành trình Tân Tinh</Text>
            </View>
            <View style={styles.rankPill}><Ionicons name="podium-outline" size={14} color={xianxia.goldSoft} /><Text style={styles.rankText}>{selected.rank ? '#' + selected.rank : '—'}</Text></View>
          </View>

          <ProgressMetric
            icon="document-text-outline"
            label="Số từ đã tính"
            value={selected.wordsWritten}
            target={selected.targetWords}
            suffix="từ"
          />
          <ProgressMetric
            icon="book-outline"
            label="Chương đã xuất bản"
            value={selected.chaptersPublished}
            target={selected.targetChapters}
            suffix="chương"
          />

          <View style={[styles.badgeBox, selected.badgeAwarded && styles.badgeBoxEarned]}>
            <View style={[styles.badgeIcon, selected.badgeAwarded && styles.badgeIconEarned]}><Ionicons name={selected.badgeAwarded ? 'ribbon' : 'ribbon-outline'} size={21} color={selected.badgeAwarded ? xianxia.goldSoft : xianxia.jadeDeep} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.badgeTitle}>{selected.badgeLabel}</Text>
              <Text style={styles.badgeBody}>{selected.badgeAwarded ? 'Đã đạt mục tiêu và nhận huy hiệu.' : `Hoàn thành ${selected.targetWords.toLocaleString('vi-VN')} từ + ${selected.targetChapters} chương để nhận huy hiệu.`}</Text>
            </View>
            {selected.badgeAwarded ? <Ionicons name="checkmark-circle" size={21} color="#55785D" /> : null}
          </View>
        </View>}

        <View style={styles.sectionHead}><View><Text style={styles.sectionKicker}>BẢNG XẾP HẠNG</Text><Text style={styles.sectionTitle}>Top tác giả</Text></View><Text style={styles.sectionMeta}>{selected.participantCount.toLocaleString('vi-VN')} người tham gia</Text></View>

        {!leaderboard.length ? <View style={styles.emptySmall}><Text style={styles.emptyBody}>Chưa có tác giả nào được xếp hạng.</Text></View> : <View style={styles.leaderboard}>
          {leaderboard.map((row) => <View key={row.authorId} style={styles.leaderRow}>
            <View style={[styles.place, row.rank <= 3 && styles.placeTop]}><Text style={[styles.placeText, row.rank <= 3 && styles.placeTextTop]}>{row.rank}</Text></View>
            {row.avatarUrl ? <Image source={{ uri: row.avatarUrl }} style={styles.avatar} /> : <View style={styles.avatar}><Text style={styles.avatarText}>{row.penName.slice(0,1).toUpperCase()}</Text></View>}
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}><Text numberOfLines={1} style={styles.name}>{row.penName}</Text>{row.goalReached ? <Ionicons name="ribbon" size={14} color={xianxia.cinnabar} /> : null}</View>
              <Text style={styles.leaderMeta}>{row.wordsWritten.toLocaleString('vi-VN')} từ · {row.chaptersPublished} chương</Text>
            </View>
          </View>)}
        </View>}

        <View style={styles.sectionHead}><View><Text style={styles.sectionKicker}>THỂ LỆ</Text><Text style={styles.sectionTitle}>Cách tính</Text></View></View>
        <View style={styles.rules}>
          {selected.rules.map((rule, index) => <View key={index} style={styles.rule}><View style={styles.ruleNo}><Text style={styles.ruleNoText}>{index + 1}</Text></View><Text style={styles.ruleText}>{rule}</Text></View>)}
        </View>

        <View style={styles.note}><Ionicons name="shield-checkmark-outline" size={18} color={xianxia.jadeDeep} /><Text style={styles.noteText}>Bảng xếp hạng lấy trực tiếp từ chương đã xuất bản và được duyệt. Bản nháp, nội dung chưa duyệt và chương xuất bản trước thời điểm tham gia không được tính.</Text></View>
      </> : null}
    </ScrollView>
  </SafeAreaView>;
}

function ProgressMetric({ icon, label, value, target, suffix }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; target: number; suffix: string }) {
  const ratio = progress(value,target);
  return <View style={styles.metric}>
    <View style={styles.metricHead}><View style={styles.metricLabelRow}><Ionicons name={icon} size={15} color={xianxia.jadeDeep} /><Text style={styles.metricLabel}>{label}</Text></View><Text style={styles.metricValue}>{Math.min(value,target).toLocaleString('vi-VN')} / {target.toLocaleString('vi-VN')} {suffix}</Text></View>
    <View style={styles.track}><View style={[styles.fill,{ width: (Math.round(ratio*100)+'%') as any }]} /></View>
    <Text style={styles.percent}>{Math.round(ratio*100)}%</Text>
  </View>;
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:xianxia.paper},
  topbar:{minHeight:64,paddingHorizontal:12,flexDirection:'row',alignItems:'center',borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:xianxia.line,backgroundColor:'rgba(255,248,234,.96)'},
  icon:{width:42,height:42,alignItems:'center',justifyContent:'center'},
  topTitle:{color:xianxia.ink,fontSize:16,fontWeight:'900',textAlign:'center'},
  topSub:{color:xianxia.muted,fontSize:8.5,textAlign:'center',marginTop:2},
  page:{padding:16,paddingBottom:48,width:'100%',maxWidth:760,alignSelf:'center'},
  error:{color:xianxia.danger,backgroundColor:'#F6E6E3',borderRadius:11,padding:10,fontSize:9.5,marginBottom:10},
  notice:{color:'#47704D',backgroundColor:'#E8F2EA',borderRadius:11,padding:10,fontSize:9.5,marginBottom:10},
  eventTabs:{gap:7,paddingBottom:10},
  eventTab:{maxWidth:210,minHeight:36,borderRadius:11,paddingHorizontal:11,alignItems:'center',justifyContent:'center',backgroundColor:'#FFFDFC',borderWidth:1,borderColor:xianxia.line},
  eventTabActive:{backgroundColor:xianxia.jadeDeep,borderColor:xianxia.gold},
  eventTabText:{color:xianxia.muted,fontSize:8.5,fontWeight:'800'},
  eventTabTextActive:{color:'#FFF8EA'},
  hero:{borderRadius:20,padding:16,backgroundColor:'#27423B',borderWidth:1,borderColor:xianxia.gold},
  heroTop:{flexDirection:'row',alignItems:'center',gap:11},
  heroSeal:{width:48,height:48,borderRadius:14,backgroundColor:xianxia.cinnabar,borderWidth:1,borderColor:xianxia.gold,alignItems:'center',justifyContent:'center'},
  heroKicker:{color:xianxia.goldSoft,fontSize:7.5,fontWeight:'900',letterSpacing:1},
  heroTitle:{color:'#FFFDF8',fontSize:17,fontWeight:'900',marginTop:3},
  heroBody:{color:'rgba(255,253,248,.84)',fontSize:9.5,lineHeight:15,marginTop:12},
  heroMetaRow:{flexDirection:'row',flexWrap:'wrap',gap:9,marginTop:10},
  heroMeta:{color:xianxia.goldSoft,fontSize:8,fontWeight:'800'},
  daysPill:{minWidth:64,borderRadius:12,padding:8,backgroundColor:'rgba(255,255,255,.07)',borderWidth:1,borderColor:'rgba(229,209,163,.32)',alignItems:'center'},
  daysValue:{color:'#FFF8EA',fontSize:18,fontWeight:'900'},
  daysLabel:{color:'rgba(255,253,248,.68)',fontSize:6.8,marginTop:1},
  joinCard:{marginTop:11,borderRadius:16,padding:12,backgroundColor:'#FFFDFC',borderWidth:1,borderColor:xianxia.line,flexDirection:'row',alignItems:'center',gap:10},
  joinIcon:{width:42,height:42,borderRadius:13,backgroundColor:'#F2E4E8',alignItems:'center',justifyContent:'center'},
  joinTitle:{color:xianxia.ink,fontSize:11,fontWeight:'900'},
  joinBody:{color:xianxia.muted,fontSize:8,lineHeight:12,marginTop:3},
  joinButton:{minHeight:38,borderRadius:11,paddingHorizontal:11,backgroundColor:xianxia.cinnabar,alignItems:'center',justifyContent:'center'},
  joinButtonText:{color:'#FFF8EA',fontSize:8.5,fontWeight:'900'},
  disabled:{opacity:.45},
  progressCard:{marginTop:11,borderRadius:17,padding:13,backgroundColor:'#FFFDFC',borderWidth:1,borderColor:xianxia.line},
  progressHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  sectionKicker:{color:xianxia.cinnabar,fontSize:7.5,fontWeight:'900',letterSpacing:1},
  sectionTitle:{color:xianxia.ink,fontSize:17,fontWeight:'900',marginTop:2},
  rankPill:{minHeight:34,borderRadius:12,paddingHorizontal:10,backgroundColor:xianxia.jadeDeep,borderWidth:1,borderColor:xianxia.gold,flexDirection:'row',alignItems:'center',gap:5},
  rankText:{color:'#FFF8EA',fontSize:10,fontWeight:'900'},
  metric:{marginTop:14},
  metricHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  metricLabelRow:{flexDirection:'row',alignItems:'center',gap:5},
  metricLabel:{color:xianxia.ink,fontSize:9.5,fontWeight:'900'},
  metricValue:{color:xianxia.muted,fontSize:8.5,fontWeight:'800'},
  track:{height:7,borderRadius:5,backgroundColor:'#E5DDD1',overflow:'hidden',marginTop:7},
  fill:{height:7,backgroundColor:xianxia.jadeDeep},
  percent:{color:xianxia.jadeDeep,fontSize:7.5,fontWeight:'900',marginTop:4,textAlign:'right'},
  badgeBox:{marginTop:15,borderRadius:14,padding:11,backgroundColor:'#EDF3EF',borderWidth:1,borderColor:'#C6D7CC',flexDirection:'row',alignItems:'center',gap:9},
  badgeBoxEarned:{backgroundColor:'#F8F0DB',borderColor:'#D9C38C'},
  badgeIcon:{width:38,height:38,borderRadius:12,backgroundColor:'#DCE9E0',alignItems:'center',justifyContent:'center'},
  badgeIconEarned:{backgroundColor:xianxia.cinnabar,borderWidth:1,borderColor:xianxia.gold},
  badgeTitle:{color:xianxia.ink,fontSize:10.5,fontWeight:'900'},
  badgeBody:{color:xianxia.muted,fontSize:8,lineHeight:12,marginTop:3},
  sectionHead:{marginTop:23,marginBottom:8,flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',gap:10},
  sectionMeta:{color:xianxia.muted,fontSize:8},
  leaderboard:{gap:7},
  leaderRow:{minHeight:64,borderRadius:14,paddingHorizontal:10,backgroundColor:'#FFFDFC',borderWidth:1,borderColor:xianxia.line,flexDirection:'row',alignItems:'center',gap:9},
  place:{width:29,height:29,borderRadius:10,backgroundColor:'#EFE8DD',alignItems:'center',justifyContent:'center'},
  placeTop:{backgroundColor:xianxia.cinnabar,borderWidth:1,borderColor:xianxia.gold},
  placeText:{color:xianxia.muted,fontSize:9,fontWeight:'900'},
  placeTextTop:{color:xianxia.goldSoft},
  avatar:{width:38,height:38,borderRadius:12,backgroundColor:xianxia.jadeMist,alignItems:'center',justifyContent:'center'},
  avatarText:{color:xianxia.jadeDeep,fontSize:13,fontWeight:'900'},
  nameRow:{flexDirection:'row',alignItems:'center',gap:5},
  name:{color:xianxia.ink,fontSize:10.5,fontWeight:'900',maxWidth:'88%'},
  leaderMeta:{color:xianxia.muted,fontSize:8,marginTop:3},
  rules:{gap:7},
  rule:{borderRadius:13,padding:10,backgroundColor:'#FFFDFC',borderWidth:1,borderColor:xianxia.line,flexDirection:'row',gap:9,alignItems:'flex-start'},
  ruleNo:{width:24,height:24,borderRadius:8,backgroundColor:xianxia.jadeDeep,alignItems:'center',justifyContent:'center'},
  ruleNoText:{color:'#FFF8EA',fontSize:8,fontWeight:'900'},
  ruleText:{flex:1,color:xianxia.muted,fontSize:8.8,lineHeight:14},
  note:{marginTop:14,borderRadius:14,padding:11,backgroundColor:'#EDF3EF',borderWidth:1,borderColor:'#C6D7CC',flexDirection:'row',gap:8,alignItems:'flex-start'},
  noteText:{flex:1,color:'#62736B',fontSize:8.5,lineHeight:13},
  empty:{minHeight:180,borderRadius:18,backgroundColor:'#FFFDFC',borderWidth:1,borderColor:xianxia.line,alignItems:'center',justifyContent:'center',padding:20},
  emptySmall:{minHeight:72,borderRadius:13,backgroundColor:'#FFFDFC',borderWidth:1,borderColor:xianxia.line,alignItems:'center',justifyContent:'center',padding:12},
  emptyTitle:{color:xianxia.ink,fontSize:13,fontWeight:'900',marginTop:8},
  emptyBody:{color:xianxia.muted,fontSize:8.8,lineHeight:14,textAlign:'center',marginTop:4},
});
