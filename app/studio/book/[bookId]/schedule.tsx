import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChapterScheduleManager } from '../../../../components/ChapterScheduleManager';
import { LoadingState } from '../../../../components/States';
import { useAuth } from '../../../../contexts/AuthContext';

export default function StudioBookScheduleScreen() {
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/studio/login');
    else if (profile?.role !== 'admin') router.replace('/(tabs)/profile');
  }, [loading, profile?.role, router, user]);

  if (loading || !user || profile?.role !== 'admin') return <LoadingState label="Đang mở lịch đăng…" />;
  return <ChapterScheduleManager bookId={bookId} contextLabel="Content Studio · Lịch đăng" onBack={() => router.back()} />;
}
