import assert from 'node:assert/strict';
import test from 'node:test';

import {
  escapeHtml,
  safeExternalHttpUrl,
  safeImageUrl
} from '../js/publicRenderSecurity.mjs';

test('escapeHtml neutralizes tags, quotes, and event-handler attribute breakout', () => {
  const payload = '<img src=x onerror="alert(1)">\'&';
  assert.equal(
    escapeHtml(payload),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#039;&amp;'
  );
});

test('safeExternalHttpUrl allows only absolute HTTP and HTTPS URLs', () => {
  assert.equal(safeExternalHttpUrl('https://example.com/path?q=1'), 'https://example.com/path?q=1');
  assert.equal(safeExternalHttpUrl('http://example.com/'), 'http://example.com/');
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '//evil.example/path',
    '/relative/path',
    'not a url'
  ]) {
    assert.equal(safeExternalHttpUrl(value), '');
  }
});

test('safeImageUrl allows local paths and HTTP images but rejects executable schemes', () => {
  assert.equal(safeImageUrl('img/listing.jpg'), 'img/listing.jpg');
  assert.equal(safeImageUrl('/img/listing.jpg'), '/img/listing.jpg');
  assert.equal(safeImageUrl('https://images.example.com/a.jpg'), 'https://images.example.com/a.jpg');
  assert.equal(safeImageUrl('javascript:alert(1)'), '');
  assert.equal(safeImageUrl('data:image/svg+xml,<svg onload=alert(1)>'), '');
  assert.equal(safeImageUrl('x\" onerror=\"alert(1)'), '');
});
