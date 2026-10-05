import { Platform, Share } from 'react-native';

export type QuoteShareInput = {
  bookId: string;
  bookTitle: string;
  authorName?: string | null;
  chapterNumber: number;
  chapterTitle?: string | null;
  quote: string;
};

export type QuoteShareResult = 'shared' | 'copied' | 'cancelled' | 'unavailable';

function cleanQuote(value: string) {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= 420) return compact;
  return compact.slice(0, 417).trimEnd() + '…';
}

export function buildReaderShareUrl(bookId: string, chapterNumber: number) {
  const base = process.env.EXPO_PUBLIC_APP_URL?.trim().replace(/\/+$/, '');
  const path = '/reader/' + encodeURIComponent(bookId);
  const query = '?chapter=' + encodeURIComponent(String(chapterNumber)) + '&source=quote_share';
  return base ? base + path + query : 'chuong://reader/' + encodeURIComponent(bookId) + query;
}

export function buildQuoteShareMessage(input: QuoteShareInput) {
  const quote = cleanQuote(input.quote);
  const chapter = 'Chương ' + input.chapterNumber + (input.chapterTitle?.trim() ? ' · ' + input.chapterTitle.trim() : '');
  const author = input.authorName?.trim() ? '\nTác giả: ' + input.authorName.trim() : '';
  const url = buildReaderShareUrl(input.bookId, input.chapterNumber);
  return '“' + quote + '”\n\n' + input.bookTitle + '\n' + chapter + author + '\n\nĐọc trên CHƯƠNG: ' + url;
}

export async function shareQuote(input: QuoteShareInput): Promise<QuoteShareResult> {
  const message = buildQuoteShareMessage(input);
  const url = buildReaderShareUrl(input.bookId, input.chapterNumber);

  if (Platform.OS === 'web') {
    const nav = (globalThis as any).navigator;
    if (nav?.share) {
      try {
        await nav.share({
          title: input.bookTitle + ' · CHƯƠNG',
          text: message,
          url,
        });
        return 'shared';
      } catch (error: any) {
        if (error?.name === 'AbortError') return 'cancelled';
      }
    }

    if (nav?.clipboard?.writeText) {
      try {
        await nav.clipboard.writeText(message);
        return 'copied';
      } catch {
        return 'unavailable';
      }
    }
    return 'unavailable';
  }

  const result = await Share.share(
    {
      title: input.bookTitle + ' · CHƯƠNG',
      message,
      url,
    },
    {
      dialogTitle: 'Chia sẻ trích đoạn CHƯƠNG',
    },
  );

  return result.action === Share.dismissedAction ? 'cancelled' : 'shared';
}
