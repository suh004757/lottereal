import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateAdminIntakeImages,
  createFamilyOriginalImagePath,
  createFamilyPreviewImagePath,
  createPrivateImagePath,
  attachPrivateImageMetadata,
  attachPendingImageManifest,
  isFinalizedImageManifest,
  isCompatibleImageManifest
} from '../js/adminIntakeImageRules.mjs';
import { runAdminIntakeUploadQueue } from '../js/adminIntakeUploadQueue.mjs';
import { readImageDimensions, getOrientedDimensions } from '../js/adminIntakeImageDimensions.mjs';

const image = (name, type = 'image/jpeg', size = 2_000_000) => ({ name, type, size });

test('family board keeps separate preview and original private paths', () => {
  assert.equal(createFamilyPreviewImagePath('user-1', 'draft-1', 1), 'user-1/draft-1/preview/01.jpg');
  assert.equal(createFamilyOriginalImagePath('user-1', 'draft-1', 1, 'image/jpeg'), 'user-1/draft-1/original/01.jpg');
  assert.equal(createFamilyOriginalImagePath('user-1', 'draft-1', 2, 'image/png'), 'user-1/draft-1/original/02.png');
  assert.equal(createFamilyOriginalImagePath('user-1', 'draft-1', 3, 'image/webp'), 'user-1/draft-1/original/03.webp');
  assert.throws(() => createFamilyOriginalImagePath('user-1', 'draft-1', 1, 'image/gif'));
});

test('accepts up to 30 supported field photos', () => {
  const files = Array.from({ length: 30 }, (_, index) => image(`field-${index}.jpg`));
  assert.equal(validateAdminIntakeImages(files).length, 30);
  assert.throws(() => validateAdminIntakeImages([...files, image('extra.jpg')]), /최대 30장/);
});

test('accepts modern high-resolution source photos up to 60MB', () => {
  const files = [image('galaxy-s-ultra.jpg', 'image/jpeg', 60 * 1024 * 1024)];
  assert.equal(validateAdminIntakeImages(files).length, 1);
});

test('rejects unsupported or oversized image files', () => {
  assert.throws(() => validateAdminIntakeImages([image('a.gif', 'image/gif')]), /JPG/);
  assert.throws(() => validateAdminIntakeImages([image('huge.jpg', 'image/jpeg', 61 * 1024 * 1024)]), /60MB/);
});

test('reads a safe large JPEG without decoding the full image', async () => {
  const bytes = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    0x17, 0x70,
    0x27, 0x10,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9
  ]);
  const dimensions = await readImageDimensions(new Blob([bytes], { type: 'image/jpeg' }));
  assert.deepEqual(dimensions, { width: 10000, height: 6000, orientation: 1 });
});

test('rejects a compressed image above the 64MP decode safety ceiling', async () => {
  const bytes = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    0x23, 0x28,
    0x2e, 0xe0,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9
  ]);
  await assert.rejects(
    readImageDimensions(new Blob([bytes], { type: 'image/jpeg' })),
    /64MP/
  );
});

test('reads EXIF orientation 6 and preserves the oriented aspect ratio', async () => {
  const exif = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    0x27, 0x10,
    0x17, 0x70,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9
  ]);
  const dimensions = await readImageDimensions(new Blob([exif], { type: 'image/jpeg' }));
  assert.deepEqual(dimensions, { width: 6000, height: 10000, orientation: 6 });
  assert.deepEqual(getOrientedDimensions(dimensions), { width: 10000, height: 6000 });
});

test('reads PNG dimensions only from a valid IHDR first chunk', async () => {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d, ...Buffer.from('IHDR')], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 8000);
  view.setUint32(20, 6000);
  const dimensions = await readImageDimensions(new Blob([bytes], { type: 'image/png' }));
  assert.deepEqual(dimensions, { width: 8000, height: 6000, orientation: 1 });

  bytes.set(Buffer.from('IDAT'), 12);
  await assert.rejects(readImageDimensions(new Blob([bytes], { type: 'image/png' })), /픽셀 크기/);
});

test('reads WebP VP8X dimensions from its header', async () => {
  const bytes = new Uint8Array(30);
  bytes.set([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBPVP8X')], 0);
  const width = 9000 - 1;
  const height = 7000 - 1;
  bytes.set([width & 0xff, (width >> 8) & 0xff, (width >> 16) & 0xff], 24);
  bytes.set([height & 0xff, (height >> 8) & 0xff, (height >> 16) & 0xff], 27);
  const dimensions = await readImageDimensions(new Blob([bytes], { type: 'image/webp' }));
  assert.deepEqual(dimensions, { width: 9000, height: 7000, orientation: 1 });
});

test('private object paths do not expose original filenames', () => {
  const path = createPrivateImagePath('user-123', 'batch-456', 7);
  assert.equal(path, 'user-123/batch-456/07.jpg');
  assert.equal(path.includes('현장사진'), false);
});

test('listing draft metadata receives private paths without public URLs', () => {
  const payload = { metadata: { intake_source: 'admin-chat', intake_type: 'listing' } };
  const paths = ['user/batch/01.jpg', 'user/batch/02.jpg'];
  const updated = attachPrivateImageMetadata(payload, paths);
  assert.deepEqual(updated.metadata.private_image_paths, paths);
  assert.equal(updated.metadata.image_count, 2);
  assert.equal(JSON.stringify(updated).includes('https://'), false);
  assert.throws(
    () => attachPrivateImageMetadata({ metadata: { intake_type: 'report' } }, paths),
    /매물 초안/
  );
});

test('upload queue waits for in-flight successes before reporting cleanup paths', async () => {
  const started = [];
  await assert.rejects(
    runAdminIntakeUploadQueue(['slow', 'fail', 'never'], {
      concurrency: 2,
      upload: async (item) => {
        started.push(item);
        if (item === 'fail') throw new Error('upload failed');
        await new Promise((resolve) => setTimeout(resolve, 20));
        return `${item}.jpg`;
      }
    }),
    (error) => {
      assert.deepEqual(error.completedPaths, ['slow.jpg']);
      assert.deepEqual(started.sort(), ['fail', 'slow']);
      return true;
    }
  );
});

test('upload queue preserves file order while reporting progress', async () => {
  const progress = [];
  const result = await runAdminIntakeUploadQueue(['a', 'b', 'c'], {
    concurrency: 2,
    upload: async (item) => `${item}.jpg`,
    onProgress: (value) => progress.push(value.completed)
  });
  assert.deepEqual(result, ['a.jpg', 'b.jpg', 'c.jpg']);
  assert.deepEqual(progress, [1, 2, 3]);
});

test('pending manifest ties every future object to an existing draft', () => {
  const payload = { metadata: { intake_source: 'admin-chat', intake_type: 'listing' } };
  const pending = attachPendingImageManifest(payload, {
    userId: 'user-1',
    draftId: 'draft-1',
    imageCount: 30
  });
  assert.equal(pending.metadata.photo_upload_state, 'pending');
  assert.equal(pending.metadata.photo_batch_prefix, 'user-1/draft-1');
  assert.equal(pending.metadata.expected_image_count, 30);
  assert.equal('private_image_paths' in pending.metadata, false);
});

test('finalized manifest readback must exactly match all paths', () => {
  const paths = ['user/draft/01.jpg', 'user/draft/02.jpg'];
  assert.equal(isFinalizedImageManifest({
    photo_upload_state: 'complete',
    image_count: 2,
    private_image_paths: paths
  }, paths), true);
  assert.equal(isFinalizedImageManifest({
    photo_upload_state: 'pending',
    image_count: 2,
    private_image_paths: paths
  }, paths), false);
  assert.equal(isFinalizedImageManifest({
    photo_upload_state: 'complete',
    image_count: 1,
    private_image_paths: paths.slice(0, 1)
  }, paths), false);
});

test('draft readback rejects a missing or altered upload manifest before upload', () => {
  const expected = {
    intake_type: 'listing',
    photo_upload_state: 'pending',
    photo_batch_prefix: 'user/draft',
    expected_image_count: 2
  };
  assert.equal(isCompatibleImageManifest({ intake_type: 'listing' }, expected), false);
  assert.equal(isCompatibleImageManifest({ ...expected, expected_image_count: 1 }, expected), false);
  assert.equal(isCompatibleImageManifest({ ...expected, photo_batch_prefix: 'user/other' }, expected), false);
  assert.equal(isCompatibleImageManifest({ ...expected }, expected), true);
});

test('draft retry accepts only an exact already-complete manifest', () => {
  const expected = {
    intake_type: 'listing',
    photo_upload_state: 'pending',
    photo_batch_prefix: 'user/draft',
    expected_image_count: 2
  };
  const complete = {
    ...expected,
    photo_upload_state: 'complete',
    image_count: 2,
    private_image_paths: ['user/draft/01.jpg', 'user/draft/02.jpg']
  };
  assert.equal(isCompatibleImageManifest(complete, expected), true);
  assert.equal(isCompatibleImageManifest({ ...complete, private_image_paths: ['user/draft/02.jpg', 'user/draft/01.jpg'] }, expected), false);
});
