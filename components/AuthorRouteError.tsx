import { ErrorBoundaryProps, useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RetryState } from './States';

export function AuthorRouteError({ error, retry }: ErrorBoundaryProps) {
  const router = useRouter();
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F2E9' }}>
    <Pressable accessibilityRole="button" onPress={() => router.replace('/write')} style={{ padding: 18 }}>
      <Text style={{ color: '#315247', fontWeight: '800' }}>Quay lại truyện của tôi</Text>
    </Pressable>
    <RetryState title="Không thể mở chương" detail="Có lỗi khi mở bản thảo. Hãy thử lại hoặc quay lại truyện của tôi." onRetry={retry} />
  </SafeAreaView>;
}
