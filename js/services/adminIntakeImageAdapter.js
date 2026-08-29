import { getSupabaseClient } from '../config/supabaseConfig.js';
import {
  validateAdminIntakeImages,
  createPrivateImagePath
} from '../adminIntakeImageRules.mjs';
import { runAdminIntakeUploadQueue } from '../adminIntakeUploadQueue.mjs';

const BUCKET = 'admin-intake-images';
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;
const CONCURRENCY = 3;

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

export async function prepareAdminIntakeImage(file) {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
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
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('사진을 변환하지 못했습니다.')), 'image/jpeg', JPEG_QUALITY);
  });
  if (blob.size > MAX_OUTPUT_BYTES) {
    throw new Error('변환된 사진이 8MB를 초과합니다.');
  }
  return new File([blob], 'field-photo.jpg', { type: 'image/jpeg', lastModified: Date.now() });
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
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
