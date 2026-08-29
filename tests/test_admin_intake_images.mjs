import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateAdminIntakeImages,
  createPrivateImagePath,
  attachPrivateImageMetadata,
  attachPendingImageManifest,
  isFinalizedImageManifest,
  isCompatibleImageManifest
} from '../js/adminIntakeImageRules.mjs';
import { runAdminIntakeUploadQueue } from '../js/adminIntakeUploadQueue.mjs';

const image = (name, type = 'image/jpeg', size = 2_000_000) => ({ name, type, size });

test('accepts up to 30 supported field photos', () => {
  const files = Array.from({ length: 30 }, (_, index) => image(`field-${index}.jpg`));
  assert.equal(validateAdminIntakeImages(files).length, 30);
  assert.throws(() => validateAdminIntakeImages([...files, image('extra.jpg')]), /최대 30장/);
});

test('rejects unsupported or oversized image files', () => {
  assert.throws(() => validateAdminIntakeImages([image('raw.heic', 'image/heic')]), /JPG, PNG, WebP/);
  assert.throws(() => validateAdminIntakeImages([image('huge.jpg', 'image/jpeg', 21 * 1024 * 1024)]), /20MB/);
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
