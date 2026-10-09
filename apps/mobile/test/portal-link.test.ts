import assert from 'node:assert/strict';
import { test } from 'node:test';
import { portalLink } from '../src/lib/portalLink';

test('no portal URL: no link (the screens hide it)', () => {
  assert.equal(portalLink(undefined, '/terms'), undefined);
  assert.equal(portalLink('', '/terms'), undefined);
  assert.equal(portalLink('   ', '/privacy'), undefined);
});

test('a portal URL gives the page address, trailing slashes removed', () => {
  assert.equal(portalLink('https://portal.example.test', '/terms'), 'https://portal.example.test/terms');
  assert.equal(portalLink('https://portal.example.test///', '/privacy'), 'https://portal.example.test/privacy');
  assert.equal(portalLink(' http://192.168.1.5:3000 ', '/terms'), 'http://192.168.1.5:3000/terms');
});

test('anything that is not an http(s) address is refused', () => {
  assert.equal(portalLink('javascript:alert(1)', '/terms'), undefined);
  assert.equal(portalLink('ongod.example', '/terms'), undefined);
  assert.equal(portalLink('ftp://example.test', '/terms'), undefined);
});
