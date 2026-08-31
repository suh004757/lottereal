import { getSupabaseClient } from '../config/supabaseConfig.js';
import {
  validateAdminIntakeImages,
  createFamilyOriginalImagePath,
  createFamilyPreviewImagePath,
  createPrivateImagePath
} from '../adminIntakeImageRules.mjs';
import { runAdminIntakeUploadQueue } from '../adminIntakeUploadQueue.mjs';
import { readImageDimensions, getOrientedDimensions } from '../adminIntakeImageDimensions.mjs';

const BUCKET = 'admin-intake-images';
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const LEGACY_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_DIMENSION = 1920;
const THUMBNAIL_DIMENSION = 320;
const FAMILY_PREVIEW_DIMENSION = 1280;
const JPEG_QUALITY = 0.82;
const THUMBNAIL_QUALITY = 0.72;
const FAMILY_PREVIEW_QUALITY = 0.76;
const CONCURRENCY = 1;

export async function uploadAdminIntakeImages(files, { userId, batchId, onProgress } = {}) {
  const sourceFiles = validateAdminIntakeImages(files);
  if (!sourceFiles.length) return [];
  if (!userId || !batchId) throw new Error('사진 업로드 초안 정보를 확인할 수 없습니다.');
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('사진 저장소에 연결할 수 없습니다.');

  try {
    return await runAdminIntakeUploadQueue(sourceFiles, {
      concurrency: CONCURRENCY,
      onProgress,
      upload: async (file, index) => {
        const prepared = await prepareAdminIntakeImage(file);
        const path = createPrivateImagePath(userId, batchId, index + 1);
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, prepared, { contentType: 'image/jpeg', upsert: true });
        if (error) throw error;
        return path;
      }
    });
  } catch (error) {
    const wrapped = new Error(`사진 업로드에 실패했습니다: ${error?.message || '알 수 없는 오류'}`);
    wrapped.completedPaths = Array.from(error?.completedPaths || []);
    throw wrapped;
  }
}

export async function uploadFamilyListingImages(files, { userId, batchId, onProgress } = {}) {
  const sourceFiles = validateAdminIntakeImages(files);
  if (!sourceFiles.length) return { previewPaths: [], originalPaths: [] };
  if (!userId || !batchId) throw new Error('사진 업로드 초안 정보를 확인할 수 없습니다.');
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('사진 저장소에 연결할 수 없습니다.');
  const previewPaths = [];
  const originalPaths = [];
  const completedPaths = [];
  try {
    for (const [index, file] of sourceFiles.entries()) {
      const position = index + 1;
      const preview = await prepareFamilyListingPreview(file);
      const previewPath = createFamilyPreviewImagePath(userId, batchId, position);
      const previewResult = await supabase.storage.from(BUCKET).upload(previewPath, preview, {
        contentType: 'image/jpeg', upsert: true
      });
      if (previewResult.error) throw previewResult.error;
      completedPaths.push(previewPath);
      previewPaths.push(previewPath);

      const originalPath = createFamilyOriginalImagePath(userId, batchId, position, file.type);
      const originalResult = await supabase.storage.from(BUCKET).upload(originalPath, file, {
        contentType: file.type, upsert: true
      });
      if (originalResult.error) throw originalResult.error;
      completedPaths.push(originalPath);
      originalPaths.push(originalPath);
      onProgress?.({ completed: position, total: sourceFiles.length });
    }
    return { previewPaths, originalPaths };
  } catch (error) {
    const wrapped = new Error(`사진 업로드에 실패했습니다: ${error?.message || '알 수 없는 오류'}`);
    wrapped.completedPaths = completedPaths;
    throw wrapped;
  }
}

export async function prepareAdminIntakeImage(file) {
  const blob = await renderDownsizedJpeg(file, MAX_DIMENSION, JPEG_QUALITY);
  if (blob.size > MAX_OUTPUT_BYTES) {
    throw new Error('변환된 사진이 8MB를 초과합니다.');
  }
  return new File([blob], 'field-photo.jpg', { type: 'image/jpeg', lastModified: Date.now() });
}

export async function prepareFamilyListingPreview(file) {
  const blob = await renderDownsizedJpeg(file, FAMILY_PREVIEW_DIMENSION, FAMILY_PREVIEW_QUALITY);
  if (blob.size > MAX_OUTPUT_BYTES) throw new Error('화면용 사진이 8MB를 초과합니다.');
  return new File([blob], 'listing-preview.jpg', { type: 'image/jpeg', lastModified: Date.now() });
}

export async function createAdminIntakeThumbnail(file) {
  const blob = await renderDownsizedJpeg(file, THUMBNAIL_DIMENSION, THUMBNAIL_QUALITY);
  return URL.createObjectURL(blob);
}

export async function removeAdminIntakeImages(paths) {
  const safePaths = Array.from(new Set(paths || []));
  if (!safePaths.length) return;
  if (safePaths.length > 60 || safePaths.some((path) => typeof path !== 'string' || !path || /^https?:\/\//i.test(path))) {
    throw new Error('정리할 사진 경로를 확인할 수 없습니다.');
  }
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('사진 저장소에 연결할 수 없습니다.');
  const { error } = await supabase.storage.from(BUCKET).remove(safePaths);
  if (error) throw new Error('완료되지 않은 사진을 정리하지 못했습니다.');
}

export async function createAdminIntakeImageSignedUrls(paths, { expiresIn = 900 } = {}) {
  const safePaths = Array.from(new Set(paths || []));
  if (!safePaths.length) return new Map();
  if (safePaths.length > 15000 || safePaths.some((path) => (
    typeof path !== 'string' || !path || /^https?:\/\//i.test(path)
  ))) {
    throw new Error('매물 사진 경로를 확인할 수 없습니다.');
  }
  const ttl = Number(expiresIn);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 3600) {
    throw new Error('사진 보기 시간을 확인할 수 없습니다.');
  }
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('사진 저장소에 연결할 수 없습니다.');
  const urls = new Map();
  for (let index = 0; index < safePaths.length; index += 100) {
    const chunk = safePaths.slice(index, index + 100);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(chunk, ttl);
    if (error) continue;
    for (const item of data || []) {
      if (item?.path && item?.signedUrl) urls.set(item.path, item.signedUrl);
    }
  }
  return urls;
}


export async function downloadAdminIntakeImage(path, filename = 'listing-original.jpg') {
  if (typeof path !== 'string' || !path || /^https?:\/\//i.test(path)) {
    throw new Error('받을 원본 사진 경로를 확인할 수 없습니다.');
  }
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('사진 저장소에 연결할 수 없습니다.');
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error('원본 사진을 내려받지 못했습니다.');
  const safeName = String(filename || 'listing-original.jpg')
    .replace(/[\\/:*?"<>|]/g, '-')
    .slice(0, 160);
  const objectUrl = URL.createObjectURL(data);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = safeName || 'listing-original.jpg';
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

export async function createAdminIntakeImageShareFiles(paths) {
  const safePaths = Array.from(new Set(paths || [])).slice(0, 10);
  if (!safePaths.length) return [];
  if (safePaths.some((path) => typeof path !== 'string' || !path || /^https?:\/\//i.test(path))) {
    throw new Error('공유할 사진 경로를 확인할 수 없습니다.');
  }
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('사진 저장소에 연결할 수 없습니다.');
  const files = [];
  for (const [index, path] of safePaths.entries()) {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) throw new Error('공유할 사진을 불러오지 못했습니다.');
    files.push(new File([data], `listing-photo-${index + 1}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now()
    }));
  }
  return files;
}

async function renderDownsizedJpeg(file, maxDimension, quality) {
  const bitmap = await loadBitmap(file, maxDimension);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return new Promise((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('사진을 변환하지 못했습니다.')), 'image/jpeg', quality);
  });
}

async function loadBitmap(file, maxDimension = MAX_DIMENSION) {
  const sourceDimensions = await readImageDimensions(file);
  const dimensions = getOrientedDimensions(sourceDimensions);
  const scale = Math.min(1, maxDimension / Math.max(dimensions.width, dimensions.height));
  const resizeWidth = Math.max(1, Math.round(dimensions.width * scale));
  const resizeHeight = Math.max(1, Math.round(dimensions.height * scale));
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, {
      resizeWidth,
      resizeHeight,
      resizeQuality: 'high',
      imageOrientation: 'from-image'
    });
  }
  if (file.size > LEGACY_SOURCE_BYTES) {
    throw new Error('대형 사진을 안전하게 줄이려면 최신 브라우저가 필요합니다.');
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('사진을 읽지 못했습니다.'));
      element.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}
