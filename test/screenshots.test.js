import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../scripts/capture-screenshots.js';

test('accepts page definitions with navigation steps', () => {
  const config = { pages: [{ name: 'lesson', path: '/#lesson', viewport: { width: 800, height: 600 }, steps: [
    { action: 'click', selector: 'a' },
    { action: 'fill', selector: 'input', value: 'search' },
    { action: 'press', selector: 'input', key: 'Enter' },
    { action: 'waitFor', selector: 'main' }
  ] }] };
  assert.equal(validateConfig(config), config);
});

test('rejects invalid or duplicate screenshot definitions', () => {
  for (const config of [
    { pages: [] },
    { pages: [{ name: '../outside', path: '/' }] },
    { pages: [{ name: 'a', path: '//other.example' }] },
    { pages: [{ name: 'a', path: '/', steps: [{ action: 'fill', selector: 'input' }] }] },
    { pages: [{ name: 'a', path: '/' }, { name: 'a', path: '/other' }] }
  ]) assert.throws(() => validateConfig(config));
});
