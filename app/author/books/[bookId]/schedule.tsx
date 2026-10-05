import { isUuid, routeParam } from '../../../../lib/routeParams';
export { AuthorRouteError as ErrorBoundary } from '../../../../components/AuthorRouteError';
import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChapterScheduleManager } from '../../../../components/ChapterScheduleManager';
import { LoadingState } from '../../../../components/States';
import { useAuth } from '../../../../contexts/AuthContext';

export default function AuthorBookScheduleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookId?: string | string[] }>();
  const bookId = routeParam(params.bookId);
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!isUuid(bookId)) { router.replace('/write'); return; }
    if (!loading && !user) router.replace('/auth/login');
  }, [loading, router, user, bookId]);

  if (loading || !user || !isUuid(bookId)) return <LoadingState label="Đang mở lịch đăng…" />;
  return <ChapterScheduleManager bookId={bookId} contextLabel="Quản lý lịch đăng" onBack={() => router.canGoBack() ? router.back() : router.replace('/write')} />;
}
