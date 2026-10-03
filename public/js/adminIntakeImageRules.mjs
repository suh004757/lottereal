const MAX_IMAGES = 30;
const MAX_SOURCE_BYTES = 60 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateAdminIntakeImages(files) {
  const list = Array.from(files || []);
  if (list.length > MAX_IMAGES) {
    throw new Error(`현장 사진은 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`);
  }
  list.forEach((file) => {
    if (!SUPPORTED_TYPES.has(String(file?.type || '').toLowerCase())) {
      throw new Error('사진은 JPG, PNG, WebP 형식만 첨부할 수 있습니다.');
    }
    if (!Number.isFinite(file?.size) || file.size <= 0 || file.size > MAX_SOURCE_BYTES) {
      throw new Error('사진 한 장의 원본 크기는 60MB 이하여야 합니다.');
    }
  });
  return list;
}

function privatePathParts(userId, batchId, index) {
  const safeUser = String(userId || '').replace(/[^a-zA-Z0-9-]/g, '');
  const safeBatch = String(batchId || '').replace(/[^a-zA-Z0-9-]/g, '');
  if (!safeUser || !safeBatch || !Number.isInteger(index) || index < 0 || index > 99) {
    throw new Error('비공개 사진 경로를 만들 수 없습니다.');
  }
  return { safeUser, safeBatch, position: String(index).padStart(2, '0') };
}

export function createPrivateImagePath(userId, batchId, index) {
  const { safeUser, safeBatch, position } = privatePathParts(userId, batchId, index);
  return `${safeUser}/${safeBatch}/${position}.jpg`;
}

export function createFamilyPreviewImagePath(userId, batchId, index) {
  const { safeUser, safeBatch, position } = privatePathParts(userId, batchId, index);
  return `${safeUser}/${safeBatch}/preview/${position}.jpg`;
}

export function createFamilyOriginalImagePath(userId, batchId, index, mimeType) {
  const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const extension = extensions[String(mimeType || '').toLowerCase()];
  if (!extension) throw new Error('원본 사진 형식을 확인할 수 없습니다.');
  const { safeUser, safeBatch, position } = privatePathParts(userId, batchId, index);
  return `${safeUser}/${safeBatch}/original/${position}.${extension}`;
}

export function attachPrivateImageMetadata(payload, paths) {
  if (payload?.metadata?.intake_type !== 'listing') {
    throw new Error('사진은 매물 초안에만 첨부할 수 있습니다.');
  }
  const safePaths = Array.from(paths || []);
  if (safePaths.length > MAX_IMAGES || safePaths.some((path) => typeof path !== 'string' || !path || /^https?:\/\//i.test(path))) {
    throw new Error('비공개 사진 경로가 올바르지 않습니다.');
  }
  return {
    ...payload,
    metadata: {
      ...payload.metadata,
      private_image_paths: safePaths,
      image_count: safePaths.length
    }
  };
}

export function attachPendingImageManifest(payload, { userId, draftId, imageCount } = {}) {
  if (payload?.metadata?.intake_type !== 'listing') {
    throw new Error('사진은 매물 초안에만 첨부할 수 있습니다.');
  }
  const count = Number(imageCount);
  if (!userId || !draftId || !Number.isInteger(count) || count < 1 || count > MAX_IMAGES) {
    throw new Error('사진 업로드 준비 정보를 확인할 수 없습니다.');
  }
  return {
    ...payload,
    id: draftId,
    metadata: {
      ...payload.metadata,
      photo_upload_state: 'pending',
      photo_batch_prefix: `${userId}/${draftId}`,
      expected_image_count: count
    }
  };
}

export function isFinalizedImageManifest(metadata, paths) {
  const expected = Array.from(paths || []);
  const actual = metadata?.private_image_paths;
  return metadata?.photo_upload_state === 'complete'
    && metadata?.image_count === expected.length
    && Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((path, index) => path === expected[index]);
}

export function isCompatibleImageManifest(actual = {}, expected = {}) {
  if (actual.intake_type !== expected.intake_type) return false;
  if (expected.photo_upload_state !== 'pending') {
    return actual.photo_upload_state == null
      && actual.photo_batch_prefix == null
      && actual.expected_image_count == null
      && actual.private_image_paths == null
      && actual.image_count == null;
  }

  const count = expected.expected_image_count;
  if (!Number.isInteger(count) || count < 1 || count > MAX_IMAGES) return false;
  if (actual.photo_batch_prefix !== expected.photo_batch_prefix
      || actual.expected_image_count !== count) return false;

  if (actual.photo_upload_state === 'pending') {
    return actual.private_image_paths == null && actual.image_count == null;
  }
  if (actual.photo_upload_state !== 'complete') return false;
  const expectedPaths = Array.from({ length: count }, (_, index) => (
    `${expected.photo_batch_prefix}/${String(index + 1).padStart(2, '0')}.jpg`
  ));
  return isFinalizedImageManifest(actual, expectedPaths);
}

export const ADMIN_INTAKE_IMAGE_LIMIT = MAX_IMAGES;
