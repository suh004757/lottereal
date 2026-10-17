import test from 'node:test';
import assert from 'node:assert/strict';
import {
  backgroundCandidates,
  blend,
  contrastRatio,
  evaluate,
  parseColor,
  requiredRatio,
} from '../scripts/contrast_audit.mjs';

const hex = (value) => ({
  r: parseInt(value.slice(1, 3), 16),
  g: parseInt(value.slice(3, 5), 16),
  b: parseInt(value.slice(5, 7), 16),
  a: 1,
});

test('contrast ratio matches WCAG reference values', () => {
  assert.equal(contrastRatio(hex('#000000'), hex('#ffffff')).toFixed(2), '21.00');
  assert.equal(contrastRatio(hex('#777777'), hex('#ffffff')).toFixed(2), '4.48');
  assert.equal(contrastRatio(hex('#ffffff'), hex('#ffffff')).toFixed(2), '1.00');
});

test('large or bold-large text needs 3:1, everything else 4.5:1', () => {
  assert.equal(requiredRatio(24, '400'), 3);
  assert.equal(requiredRatio(19, '700'), 3);
  assert.equal(requiredRatio(19, '400'), 4.5);
  assert.equal(requiredRatio(14, '700'), 4.5);
});

test('translucent layers are composited before measuring', () => {
  const half = blend(parseColor('rgba(0, 0, 0, 0.5)'), hex('#ffffff'));
  assert.ok(Math.abs(half.r - 127.5) < 0.01);
  const bgs = backgroundCandidates([
    { color: 'rgba(0, 0, 0, 0)', image: 'none', clip: 'border-box' },
    { color: 'rgb(30, 58, 95)', image: 'none', clip: 'border-box' },
  ]);
  assert.deepEqual(bgs, [{ r: 30, g: 58, b: 95, a: 1 }]);
});

test('gradient backgrounds are judged by their worst stop', () => {
  const item = {
    color: 'rgb(255, 255, 255)',
    opacity: 1,
    fontSize: 16,
    fontWeight: '400',
    layers: [{ color: 'rgba(0, 0, 0, 0)', image: 'linear-gradient(rgb(19, 38, 63), rgb(255, 212, 59))', clip: 'border-box' }],
  };
  assert.equal(evaluate(item).status, 'fail');
});

test('text over a photo is never silently passed', () => {
  const item = {
    color: 'rgb(255, 255, 255)', opacity: 1, fontSize: 16, fontWeight: '400',
    layers: [{ color: 'rgba(0, 0, 0, 0)', image: 'url("hero.jpg")', clip: 'border-box' }],
  };
  assert.equal(evaluate(item).status, 'unverified');
});
