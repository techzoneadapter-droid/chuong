export type ParsedImportChapter = {
  chapterNumber: number;
  title: string;
  content: string;
};

export type ParsedImportBook = {
  id: string;
  sourceName: string;
  title: string;
  chapters: ParsedImportChapter[];
  warnings: string[];
  coverDataUri?: string;
  coverMimeType?: string;
};

type BrowserFileLike = {
  name: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
  flags: number;
};

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const TEXT_EXTS = new Set(['txt', 'docx']);

function extOf(name: string) {
  const clean = name.split('?')[0].split('#')[0];
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : '';
}

function baseName(path: string) {
  const name = path.replace(/\\/g, '/').split('/').filter(Boolean).pop() || path;
  return name.replace(/\.[^.]+$/, '');
}

function cleanTitle(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+(?:chuong|chương|chapter)\s*\d+.*$/i, '')
    .replace(/\s+\d+$/i, '')
    .trim() || 'Truyện chưa đặt tên';
}

function naturalNumber(name: string) {
  const match = name.match(/(?:chuong|chương|chapter|chap)?[^0-9]*(\d{1,6})/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function chapterTitleFromFilename(name: string, number: number) {
  const stem = baseName(name)
    .replace(/^(?:chuong|chương|chapter|chap)[\s._-]*\d+[\s._:-]*/i, '')
    .replace(/^\d+[\s._:-]*/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stem || `Chương ${number}`;
}

function normalizeText(text: string) {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function romanToNumber(value: string) {
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  let prev = 0;
  for (const char of value.toUpperCase().split('').reverse()) {
    const current = map[char] ?? 0;
    total += current < prev ? -current : current;
    prev = Math.max(prev, current);
  }
  return total;
}

function chineseToNumber(value: string) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = { '\u96f6': 0, '\u3007': 0, '\u4e00': 1, '\u4e8c': 2, '\u4e24': 2, '\u4e09': 3, '\u56db': 4, '\u4e94': 5, '\u516d': 6, '\u4e03': 7, '\u516b': 8, '\u4e5d': 9 };
  const units: Record<string, number> = { '\u5341': 10, '\u767e': 100, '\u5343': 1000, '\u4e07': 10000 };
  let total = 0;
  let section = 0;
  let number = 0;
  for (const char of value) {
    if (char in digits) {
      number = digits[char];
      continue;
    }
    const unit = units[char];
    if (!unit) continue;
    if (unit === 10000) {
      section = (section + (number || 0)) * unit;
      total += section;
      section = 0;
      number = 0;
    } else {
      section += (number || 1) * unit;
      number = 0;
    }
  }
  return total + section + number;
}

function parseChapterNumber(value: string) {
  const token = value.trim();
  if (/^\d+$/.test(token)) return Number(token);
  if (/^[ivxlcdm]+$/i.test(token)) return romanToNumber(token);
  return chineseToNumber(token);
}

export function splitChaptersFromText(raw: string): ParsedImportChapter[] {
  const text = normalizeText(raw);
  if (!text) return [];

  // Supports plain headings, Markdown headings/bold, blockquotes, Vietnamese/English
  // chapter labels, Roman numerals and common Chinese web-novel headings.
  const re = /^[ \t]*(?:>{1,3}[ \t]*)?(?:#{1,6}[ \t]*)?(?:[*_]{1,3}[ \t]*)?(?:(?:chương|chuong|chapter|chap|hồi|hoi|phần|phan|part|tiết|tiet|quyển|quyen|volume)\s*(?:số\s*)?([0-9]{1,6}|[ivxlcdm]{1,12})(?:\s*\/\s*\d{1,6})?|\u7b2c\s*([0-9\u96f6\u3007\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07]{1,16})\s*[\u7ae0\u8282\u56de\u5377\u90e8\u7bc7])(?:[ \t]*[:.\-–—]\s*|\s+)?([^\n]*?)(?:[ \t]*[*_#]{1,6})?[ \t]*$/gim;
  const matches = [...text.matchAll(re)];

  if (!matches.length) {
    return [{ chapterNumber: 1, title: 'Chương 1', content: text }];
  }

  const chapters: ParsedImportChapter[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const next = matches[i + 1];
    const chapterNumber = parseChapterNumber(match[1] || match[2] || '');
    if (!chapterNumber) continue;
    const titleTail = (match[3] || '').replace(/[*_#]+\s*$/g, '').trim();
    const start = (match.index || 0) + match[0].length;
    const end = next?.index ?? text.length;
    const content = normalizeText(text.slice(start, end));
    if (!content) continue;
    chapters.push({
      chapterNumber,
      title: titleTail || `Chương ${chapterNumber}`,
      content,
    });
  }

  return chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
}

function findEocd(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = Math.max(0, bytes.length - 65557); i <= bytes.length - 22; i += 1) {
    const pos = bytes.length - 22 - (i - Math.max(0, bytes.length - 65557));
    if (pos < 0) break;
    if (view.getUint32(pos, true) === 0x06054b50) return pos;
  }
  return -1;
}

function readZipEntries(buffer: ArrayBuffer): ZipEntry[] {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const eocd = findEocd(bytes);
  if (eocd < 0) throw new Error('ZIP không hợp lệ hoặc định dạng chưa được hỗ trợ.');

  const total = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder('utf-8');
  const entries: ZipEntry[] = [];
  let pos = centralOffset;

  for (let index = 0; index < total; index += 1) {
    if (view.getUint32(pos, true) !== 0x02014b50) throw new Error('ZIP bị hỏng ở bảng thư mục.');
    const flags = view.getUint16(pos + 8, true);
    const method = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const uncompressedSize = view.getUint32(pos + 24, true);
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.slice(pos + 46, pos + 46 + nameLength));
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset, flags });
    pos += 46 + nameLength + extraLength + commentLength;
  }

  return entries.filter((entry) => !entry.name.endsWith('/'));
}

async function inflateRaw(data: Uint8Array) {
  const DS = (globalThis as unknown as { DecompressionStream?: new (format: string) => TransformStream<Uint8Array, Uint8Array> }).DecompressionStream;
  if (!DS) throw new Error('Trình duyệt này chưa hỗ trợ giải nén ZIP. Hãy dùng Chrome/Edge mới hoặc dán nội dung trực tiếp.');
  const arrayBuffer = data.slice().buffer as ArrayBuffer;
  const stream = new Blob([arrayBuffer]).stream().pipeThrough(new DS('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function extractZipEntry(buffer: ArrayBuffer, entry: ZipEntry) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if ((entry.flags & 0x1) !== 0) throw new Error(`File ${entry.name} đang được mã hóa mật khẩu nên không thể nhập.`);
  const offset = entry.localOffset;
  if (view.getUint32(offset, true) !== 0x04034b50) throw new Error(`Không đọc được file ${entry.name} trong ZIP.`);
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const start = offset + 30 + nameLength + extraLength;
  const compressed = bytes.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return inflateRaw(compressed);
  throw new Error(`File ${entry.name} dùng kiểu nén ZIP chưa hỗ trợ.`);
}

async function docxText(buffer: ArrayBuffer) {
  const entries = readZipEntries(buffer);
  const document = entries.find((entry) => entry.name === 'word/document.xml');
  if (!document) throw new Error('DOCX không có word/document.xml.');
  const xml = new TextDecoder('utf-8').decode(await extractZipEntry(buffer, document));
  const text = decodeXmlEntities(
    xml
      .replace(/<w:tab\b[^>]*\/>/g, '\t')
      .replace(/<w:br\b[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<\/w:tr>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  );
  return normalizeText(text);
}

function bytesToDataUri(bytes: Uint8Array, mime: string) {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunk, bytes.length)));
  }
  const encoder = (globalThis as unknown as { btoa?: (value: string) => string }).btoa;
  if (!encoder) return undefined;
  return `data:${mime};base64,${encoder(binary)}`;
}

function imageMime(name: string) {
  const ext = extOf(name);
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

async function parseTextOrDocx(name: string, bytes: Uint8Array) {
  const ext = extOf(name);
  if (ext === 'txt') return normalizeText(new TextDecoder('utf-8').decode(bytes));
  if (ext === 'docx') return docxText(bytes.slice().buffer as ArrayBuffer);
  throw new Error(`Không hỗ trợ file .${ext || '?'}.`);
}

function rootGroupKey(path: string) {
  const clean = path.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = clean.split('/').filter(Boolean);
  if (parts.length > 1) return cleanTitle(parts[0]);
  return cleanTitle(baseName(clean));
}

function candidateId(seed: string, index: number) {
  return `${Date.now().toString(36)}-${index}-${seed.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`;
}

async function parseZip(buffer: ArrayBuffer, sourceName: string): Promise<ParsedImportBook[]> {
  const entries = readZipEntries(buffer);
  const supported = entries.filter((entry) => TEXT_EXTS.has(extOf(entry.name)) || IMAGE_EXTS.has(extOf(entry.name)));
  if (!supported.some((entry) => TEXT_EXTS.has(extOf(entry.name)))) {
    throw new Error('ZIP chưa có file TXT hoặc DOCX để nhập.');
  }

  const grouped = new Map<string, ZipEntry[]>();
  for (const entry of supported) {
    const key = rootGroupKey(entry.name);
    const list = grouped.get(key) ?? [];
    list.push(entry);
    grouped.set(key, list);
  }

  const results: ParsedImportBook[] = [];
  const textGroups = [...grouped.entries()].filter(([, groupEntries]) =>
    groupEntries.some((entry) => TEXT_EXTS.has(extOf(entry.name))),
  );
  let index = 0;

  for (const [groupTitle, groupEntries] of textGroups) {
    const docs = groupEntries.filter((entry) => TEXT_EXTS.has(extOf(entry.name))).sort((a, b) => {
      const an = naturalNumber(a.name);
      const bn = naturalNumber(b.name);
      return an === bn ? a.name.localeCompare(b.name, 'vi') : an - bn;
    });
    if (!docs.length) continue;

    const warnings: string[] = [];
    let chapters: ParsedImportChapter[] = [];

    if (docs.length === 1) {
      const entry = docs[0];
      const bytes = await extractZipEntry(buffer, entry);
      const text = await parseTextOrDocx(entry.name, bytes);
      chapters = splitChaptersFromText(text);
    } else {
      chapters = [];
      let fallbackNumber = 1;
      for (const entry of docs) {
        const bytes = await extractZipEntry(buffer, entry);
        const text = await parseTextOrDocx(entry.name, bytes);
        const embedded = splitChaptersFromText(text);
        const filenameNumber = naturalNumber(entry.name);

        if (embedded.length > 1) {
          chapters.push(...embedded);
          fallbackNumber = Math.max(fallbackNumber, ...embedded.map((chapter) => chapter.chapterNumber)) + 1;
          continue;
        }

        const chapterNumber = Number.isFinite(filenameNumber) && filenameNumber !== Number.MAX_SAFE_INTEGER ? filenameNumber : fallbackNumber++;
        chapters.push({
          chapterNumber,
          title: chapterTitleFromFilename(entry.name, chapterNumber),
          content: embedded[0]?.content || text,
        });
      }
    }

    chapters = chapters
      .filter((chapter) => chapter.content.trim().length > 0)
      .sort((a, b) => a.chapterNumber - b.chapterNumber);

    const duplicate = chapters.find((chapter, position) => chapters.findIndex((other) => other.chapterNumber === chapter.chapterNumber) !== position);
    if (duplicate) warnings.push(`Có số chương trùng: ${duplicate.chapterNumber}. Hãy kiểm tra trước khi nhập.`);

    const images = (textGroups.length === 1 ? supported : groupEntries).filter((entry) => IMAGE_EXTS.has(extOf(entry.name)));
    const preferred = images.find((entry) => /(?:^|[\/_-])(cover|bia|bìa)(?:[._-]|$)/i.test(entry.name)) ?? images[0];
    let coverDataUri: string | undefined;
    let coverMimeType: string | undefined;
    if (preferred) {
      const bytes = await extractZipEntry(buffer, preferred);
      coverMimeType = imageMime(preferred.name);
      coverDataUri = bytesToDataUri(bytes, coverMimeType);
      if (!coverDataUri) warnings.push('Tìm thấy ảnh bìa nhưng môi trường hiện tại không tạo được dữ liệu ảnh tự động.');
    }

    if (chapters.length) {
      results.push({
        id: candidateId(groupTitle, index++),
        sourceName,
        title: groupTitle,
        chapters,
        warnings,
        coverDataUri,
        coverMimeType,
      });
    }
  }

  if (!results.length) throw new Error('Không tách được truyện/chương hợp lệ trong ZIP.');
  return results;
}

export async function parseAdminImportFile(file: BrowserFileLike): Promise<ParsedImportBook[]> {
  const buffer = await file.arrayBuffer();
  const ext = extOf(file.name);

  if (ext === 'zip') return parseZip(buffer, file.name);

  const bytes = new Uint8Array(buffer);
  const text = await parseTextOrDocx(file.name, bytes);
  const chapters = splitChaptersFromText(text);
  if (!chapters.length) throw new Error('File không có nội dung chương hợp lệ.');

  return [{
    id: candidateId(file.name, 0),
    sourceName: file.name,
    title: cleanTitle(baseName(file.name)),
    chapters,
    warnings: chapters.length === 1 ? ['Chỉ nhận diện được 1 chương. Nếu file có nhiều chương, hãy dùng tiêu đề dạng “Chương 1”, “Chương 2”…'] : [],
  }];
}

export function parseAdminImportPaste(raw: string, title = 'Truyện nhập nhanh'): ParsedImportBook[] {
  const chapters = splitChaptersFromText(raw);
  if (!chapters.length) return [];
  return [{
    id: candidateId(title, 0),
    sourceName: 'Nội dung dán',
    title: cleanTitle(title),
    chapters,
    warnings: chapters.length === 1 ? ['Chỉ nhận diện được 1 chương. Có thể tiếp tục nhập nếu đây là nội dung mong muốn.'] : [],
  }];
}
