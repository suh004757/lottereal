import assert from 'node:assert/strict';
import test from 'node:test';

import { isKakaoInAppBrowser } from '../public/js/webviewPerformance.mjs';

test('KakaoTalk in-app browser user agents use the constrained performance mode', () => {
  assert.equal(isKakaoInAppBrowser('Mozilla/5.0 Linux; Android 15; KAKAOTALK 25.8.0'), true);
  assert.equal(isKakaoInAppBrowser('Mozilla/5.0 (iPhone) KAKAOTALK/11.2.0'), true);
});

test('ordinary mobile browsers keep the full visual experience', () => {
  assert.equal(isKakaoInAppBrowser('Mozilla/5.0 Linux; Android 15 Chrome/140.0 Mobile Safari/537.36'), false);
  assert.equal(isKakaoInAppBrowser('Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1'), false);
  assert.equal(isKakaoInAppBrowser(''), false);
});
