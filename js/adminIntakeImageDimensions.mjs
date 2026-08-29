const HEADER_LIMIT = 2 * 1024 * 1024;
export const MAX_SOURCE_PIXELS = 64_000_000;
export const MAX_SOURCE_DIMENSION = 16_384;

const JPEG_START_OF_FRAME = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
]);
const SWAPPED_ORIENTATIONS = new Set([5, 6, 7, 8]);

export async function readImageDimensions(file) {
  if (!file?.slice || !Number.isFinite(file.size)) throw new Error('사진 파일 정보를 읽을 수 없습니다.');
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, HEADER_LIMIT)).arrayBuffer());
  const type = String(file.type || '').toLowerCase();
  let dimensions;
  if (type === 'image/jpeg' || isJpeg(bytes)) dimensions = readJpegDimensions(bytes);
  else if (type === 'image/png' || isPng(bytes)) dimensions = readPngDimensions(bytes);
  else if (type === 'image/webp' || isWebp(bytes)) dimensions = readWebpDimensions(bytes);
  if (!dimensions || !isPositiveInteger(dimensions.width) || !isPositiveInteger(dimensions.height)) {
    throw new Error('사진의 픽셀 크기를 확인할 수 없습니다.');
  }
  if (
    dimensions.width > MAX_SOURCE_DIMENSION ||
    dimensions.height > MAX_SOURCE_DIMENSION ||
    dimensions.width * dimensions.height > MAX_SOURCE_PIXELS
  ) {
    throw new Error('사진 픽셀 수는 64MP 이하, 한 변은 16,384px 이하여야 합니다.');
  }
  return dimensions;
}

export function getOrientedDimensions({ width, height, orientation = 1 }) {
  return SWAPPED_ORIENTATIONS.has(orientation)
    ? { width: height, height: width }
    : { width, height };
}

function readJpegDimensions(bytes) {
  if (!isJpeg(bytes)) return null;
  let offset = 2;
  let dimensions = null;
  let orientation = 1;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset];
    const markerStart = offset - 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 1;
      continue;
    }
    if (markerStart + 3 >= bytes.length) break;
    const length = (bytes[markerStart + 2] << 8) | bytes[markerStart + 3];
    const segmentEnd = markerStart + 2 + length;
    if (length < 2 || segmentEnd > bytes.length) break;
    if (marker === 0xe1) {
      orientation = readExifOrientation(bytes, markerStart + 4, segmentEnd) || orientation;
    }
    if (JPEG_START_OF_FRAME.has(marker)) {
      if (length < 8 || markerStart + 8 >= segmentEnd) return null;
      dimensions = {
        width: (bytes[markerStart + 7] << 8) | bytes[markerStart + 8],
        height: (bytes[markerStart + 5] << 8) | bytes[markerStart + 6]
      };
    }
    offset = segmentEnd;
  }
  return dimensions ? { ...dimensions, orientation } : null;
}

function readExifOrientation(bytes, start, end) {
  if (end - start < 14 || ascii(bytes, start, 4) !== 'Exif' || bytes[start + 4] !== 0 || bytes[start + 5] !== 0) {
    return null;
  }
  const tiff = start + 6;
  const order = ascii(bytes, tiff, 2);
  const littleEndian = order === 'II';
  if (!littleEndian && order !== 'MM') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const read16 = (position) => position + 2 <= end ? view.getUint16(position, littleEndian) : null;
  const read32 = (position) => position + 4 <= end ? view.getUint32(position, littleEndian) : null;
  if (read16(tiff + 2) !== 42) return null;
  const ifdOffset = read32(tiff + 4);
  if (ifdOffset === null) return null;
  const ifd = tiff + ifdOffset;
  const entryCount = read16(ifd);
  if (entryCount === null || entryCount > 512) return null;
  for (let index = 0; index < entryCount; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > end) return null;
    const tag = read16(entry);
    const type = read16(entry + 2);
    const count = read32(entry + 4);
    if (tag === 0x0112 && type === 3 && count === 1) {
      const orientation = read16(entry + 8);
      return orientation >= 1 && orientation <= 8 ? orientation : null;
    }
  }
  return null;
}

function readPngDimensions(bytes) {
  if (
    !isPng(bytes) || bytes.length < 24 ||
    readUint32BE(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== 'IHDR'
  ) return null;
  return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20), orientation: 1 };
}

function readWebpDimensions(bytes) {
  if (!isWebp(bytes) || bytes.length < 30) return null;
  const chunk = ascii(bytes, 12, 4);
  if (chunk === 'VP8X') {
    return { width: 1 + readUint24LE(bytes, 24), height: 1 + readUint24LE(bytes, 27), orientation: 1 };
  }
  if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: ((bytes[27] << 8) | bytes[26]) & 0x3fff,
      height: ((bytes[29] << 8) | bytes[28]) & 0x3fff,
      orientation: 1
    };
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f && bytes.length >= 25) {
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
      orientation: 1
    };
  }
  return null;
}

function isJpeg(bytes) {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function isPng(bytes) {
  return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    .every((value, index) => bytes[index] === value);
}

function isWebp(bytes) {
  return bytes.length >= 16 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP';
}

function ascii(bytes, offset, length) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function readUint24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32BE(bytes, offset) {
  return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}
