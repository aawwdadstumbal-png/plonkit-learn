import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, splitNoteParagraphs, plainText } from '../app/js/md.js';

test('renders bold', () => {
  assert.match(renderMarkdown('a **b** c'), /<strong>b<\/strong>/);
});

test('renders italic with both markers', () => {
  assert.match(renderMarkdown('a _b_ c'), /<em>b<\/em>/);
  assert.match(renderMarkdown('a *b* c'), /<em>b<\/em>/);
});

test('renders a link', () => {
  const html = renderMarkdown('see [here](https://x.test/a)');
  assert.match(html, /href="https:\/\/x\.test\/a"/);
  assert.match(html, />here<\/a>/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /target="_blank"/);
});

test('rejects a javascript link', () => {
  const html = renderMarkdown('[x](javascript:alert(1))');
  assert.doesNotMatch(html, /href=/);
  assert.doesNotMatch(html, /javascript:/i);
});

test('escapes html', () => {
  const html = renderMarkdown('<script>alert(1)</script>');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('escapes a quote', () => {
  const html = renderMarkdown('say "hi"');
  assert.doesNotMatch(html, /"hi"/);
  assert.match(html, /&quot;hi&quot;/);
});

test('linkifies a bare url', () => {
  const html = renderMarkdown('go to https://x.test/b now');
  assert.match(html, /href="https:\/\/x\.test\/b"/);
});

test('plainText strips markup', () => {
  assert.equal(plainText('a **b** [c](https://x.test/d) _e_'), 'a b c e');
});

test('splitNoteParagraphs splits on NOTE', () => {
  const result = splitNoteParagraphs(['first', 'NOTE: second', 'third']);
  assert.deepEqual(result.text, ['first', 'third']);
  assert.deepEqual(result.notes, ['NOTE: second']);
});

test('splitNoteParagraphs handles a lowercase note', () => {
  const result = splitNoteParagraphs(['note: x']);
  assert.deepEqual(result.notes, ['note: x']);
  assert.deepEqual(result.text, []);
});

test('splitNoteParagraphs leaves an ordinary paragraph alone', () => {
  const result = splitNoteParagraphs(['The plates are blue']);
  assert.deepEqual(result.notes, []);
  assert.deepEqual(result.text, ['The plates are blue']);
});

test('splitNoteParagraphs on an empty list', () => {
  assert.deepEqual(splitNoteParagraphs([]), { text: [], notes: [] });
});

test('renderMarkdown of an empty string', () => {
  assert.equal(renderMarkdown(''), '');
});

test('renderMarkdown keeps a paragraph break', () => {
  const html = renderMarkdown('first\n\nsecond');
  assert.match(html, /first/);
  assert.match(html, /second/);
});

test('a data url is not linkified', () => {
  const html = renderMarkdown('data:text/html,<script>');
  assert.doesNotMatch(html, /href="data:/);
});
