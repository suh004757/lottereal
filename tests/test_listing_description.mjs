import assert from 'node:assert/strict';
import test from 'node:test';

import { listingDescriptionPlainText, renderListingDescription } from '../public/js/utils/listingDescription.mjs';

// Minimal DOM: enough for createElement/createTextNode/textContent/appendChild.
class FakeNode {
  constructor(tag) { this.tagName = tag; this.children = []; this.text = ''; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren() { this.children = []; }
  set textContent(value) { this.children = [{ tagName: '#text', text: String(value), children: [] }]; }
  get textContent() { return this.children.map((c) => (c.tagName === '#text' ? c.text : c.textContent)).join(''); }
}
const fakeDoc = {
  createElement: (tag) => new FakeNode(tag.toUpperCase()),
  createTextNode: (text) => ({ tagName: '#text', text, children: [] })
};
const render = (text) => {
  const root = new FakeNode('DIV');
  renderListingDescription(root, text, fakeDoc);
  return root;
};
const tags = (node) => node.children.map((c) => c.tagName);

test('headings, bullet lists and bold become elements', () => {
  const root = render('소개 문단입니다.\n\n## 비용\n- 보증금 **33만원**\n- 임대료 주 85만원\n\n끝 문단');
  assert.deepEqual(tags(root), ['P', 'H3', 'UL', 'P']);
  assert.equal(root.children[1].textContent, '비용');
  const list = root.children[2];
  assert.deepEqual(tags(list), ['LI', 'LI']);
  assert.deepEqual(tags(list.children[0]), ['#text', 'STRONG']);
  assert.equal(list.children[0].textContent, '보증금 33만원');
});

test('older plain-text descriptions keep their paragraphs and line breaks', () => {
  const root = render('첫 줄\n둘째 줄\n\n다음 문단');
  assert.deepEqual(tags(root), ['P', 'P']);
  assert.deepEqual(tags(root.children[0]), ['#text', 'BR', '#text']);
  assert.equal(root.children[1].textContent, '다음 문단');
});

test('markup in the text stays text', () => {
  const root = render('## <img src=x onerror=alert(1)>\n- <script>alert(1)</script>');
  assert.equal(root.children[0].textContent, '<img src=x onerror=alert(1)>');
  assert.deepEqual(tags(root.children[0]), ['#text']);
  assert.equal(root.children[1].children[0].textContent, '<script>alert(1)</script>');
});

test('plain text drops markdown markers for meta descriptions', () => {
  const plain = listingDescriptionPlainText('소개입니다.\n\n## 비용\n- 보증금 **33만원**\n- 주 85만원');
  assert.equal(plain, '소개입니다. 비용 보증금 33만원, 주 85만원');
  assert.doesNotMatch(plain, /##|\*\*|^- /);
  assert.equal(listingDescriptionPlainText(''), '');
});
