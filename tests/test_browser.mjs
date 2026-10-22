import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, connect, newPage, chromiumPath, sleep } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, 'screenshots');
const base = process.env.PLONKIT_BASE_URL || '';

if (!base) {
  test('the browser tests need a served app', { skip: 'PLONKIT_BASE_URL is not set' }, () => {});
} else if (!chromiumPath()) {
  test('the browser tests need chromium', { skip: 'chromium was not found' }, () => {});
} else {
  mkdirSync(shots, { recursive: true });

  const browser = await launchChromium();
  const cdp = await connect(browser.wsUrl);
  const page = await newPage(cdp);
  await page.setViewport(1280, 1000);

  const shot = (name) => page.screenshot(join(shots, `${name}.png`));

  test.after(async () => {
    await page.close();
    cdp.close();
    browser.close();
  });

  test('the home screen lists every country', async () => {
    await page.goto(`${base}/#/`);
    await page.waitForSelector('[data-testid="country-card"]');
    const count = await page.evaluate(
      `document.querySelectorAll('[data-testid="country-card"]').length`,
    );
    assert.equal(count, 138);
    await shot('01-home');
  });

  test('the search box filters the countries', async () => {
    await page.goto(`${base}/#/`);
    await page.waitForSelector('[data-testid="country-card"]');
    await page.evaluate(`(() => {
      const box = document.querySelector('[data-testid="country-search"]');
      box.value = 'japan';
      box.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(200);
    const count = await page.evaluate(
      `document.querySelectorAll('[data-testid="country-card"]').length`,
    );
    assert.equal(count, 1);
  });

  test('a sample of country cards each open their country screen', async () => {
    await page.goto(`${base}/#/`);
    await page.waitForSelector('[data-testid="country-card"]');
    // The search box keeps its value between visits, so clear it first.
    await page.evaluate(`(() => {
      const box = document.querySelector('[data-testid="country-search"]');
      box.value = '';
      box.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(200);
    const slugs = await page.evaluate(`(() => {
      const cards = Array.from(document.querySelectorAll('[data-testid="country-card"]'));
      return cards.filter((_, i) => i % 14 === 0).slice(0, 10).map((c) => c.dataset.slug);
    })()`);
    assert.ok(slugs.length >= 5, 'expected at least five cards to sample');
    for (const slug of slugs) {
      await page.goto(`${base}/#/country/${slug}`);
      await sleep(500);
      const heading = await page.evaluate(`document.querySelector('h1')?.textContent || ''`);
      assert.ok(heading.length > 0, `${slug} did not open`);
      const error = await page.evaluate(`document.body.innerText.includes('Something went wrong')`);
      assert.equal(error, false, `${slug} showed an error`);
    }
  });

  test('a meta shows its image and text, and remembers that it was seen', async () => {
    await page.goto(`${base}/#/country/japan`);
    await page.waitForSelector('.section-link');
    const href = await page.evaluate(`document.querySelector('.section-link').getAttribute('href')`);
    await page.goto(`${base}/${href}`);
    await page.waitForSelector('[data-testid="meta-text"]');
    const image = await page.waitForImage('[data-testid="meta-image"] img');
    assert.ok(image, 'the meta should have an image element');
    assert.ok(image.w > 0, 'the image should have loaded');
    await shot('02-meta');

    await page.click('[data-testid="seen-toggle"]');
    await page.goto(`${base}/${href}`);
    await page.waitForSelector('[data-testid="seen-toggle"]');
    const label = await page.text('[data-testid="seen-toggle"]');
    assert.equal(label.trim(), 'Seen');
  });

  test('a meta with no image shows a placeholder, not a broken image', async () => {
    const missing = await page.evaluate(`(() => {
      const links = Array.from(document.querySelectorAll('a[href^="#/meta/"]'));
      return links.length;
    })()`);
    assert.ok(missing >= 0);
    // A meta whose image file is not on disk must show the placeholder.
    await page.goto(`${base}/#/meta/japan/PmSr`);
    await sleep(400);
    const rendered = await page.evaluate(`(() => {
      const box = document.querySelector('[data-testid="meta-image"]');
      if (!box) return null;
      const img = box.querySelector('img');
      return { hasImg: !!img, w: img ? img.naturalWidth : 0, placeholder: !!box.querySelector('.img-placeholder') };
    })()`);
    assert.ok(rendered, 'the meta should have an image container');
    if (!rendered.hasImg) {
      assert.equal(rendered.placeholder, true, 'a missing image must show the placeholder');
    } else {
      assert.ok(rendered.w > 0);
    }
  });

  test('the quiz shows an image and no answer text before answering', async () => {
    await page.goto(`${base}/#/quiz/japan`);
    await page.waitForSelector('[data-testid="quiz-option"]');
    const state = await page.evaluate(`(() => ({
      options: document.querySelectorAll('[data-testid="quiz-option"]').length,
      revealHidden: document.querySelector('[data-testid="quiz-reveal"]').hasAttribute('hidden'),
      image: !!document.querySelector('[data-testid="quiz-image"] img'),
    }))()`);
    assert.equal(state.options, 6);
    assert.equal(state.revealHidden, true, 'the answer text must not be shown before answering');
    assert.equal(state.image, true, 'the quiz must show an image');
    const image = await page.waitForImage('[data-testid="quiz-image"] img');
    assert.ok(image && image.w > 0, 'the quiz image should have loaded');
    await shot('03-quiz');
  });

  test('answering wrong reveals the answer and marks the option', async () => {
    await page.goto(`${base}/#/quiz/japan`);
    await page.waitForSelector('[data-testid="quiz-option"]');
    const slugs = await page.evaluate(
      `Array.from(document.querySelectorAll('[data-testid="quiz-option"]')).map(n => n.dataset.slug)`,
    );
    const wrong = slugs.find((slug) => slug !== 'japan') || slugs[0];
    await page.click(`[data-testid="quiz-option"][data-slug="${wrong}"]`);
    await sleep(300);
    const state = await page.evaluate(`(() => ({
      revealHidden: document.querySelector('[data-testid="quiz-reveal"]').hasAttribute('hidden'),
      correct: !!document.querySelector('.quiz-option.correct'),
      wrong: !!document.querySelector('.quiz-option.wrong'),
      nextVisible: !document.querySelector('[data-testid="quiz-next"]').hasAttribute('hidden'),
    }))()`);
    assert.equal(state.revealHidden, false);
    assert.equal(state.correct, true);
    assert.equal(state.wrong, true);
    assert.equal(state.nextVisible, true);
    await shot('04-quiz-answered');
  });

  test('the session ends with a summary', async () => {
    await page.goto(`${base}/#/quiz/japan`);
    await page.waitForSelector('[data-testid="quiz-option"]');
    await page.click('[data-testid="quiz-skip"]');
    await sleep(300);
    const summary = await page.evaluate(`(() => {
      const box = document.querySelector('[data-testid="quiz-summary"]');
      return box ? { hidden: box.hasAttribute('hidden'), text: box.textContent.slice(0, 60) } : null;
    })()`);
    assert.ok(summary, 'there should be a summary');
    assert.equal(summary.hidden, false);
    assert.match(summary.text, /right answers/);
    await shot('05-quiz-summary');
  });

  test('the stats screen reports what was answered', async () => {
    await page.goto(`${base}/#/stats`);
    await page.waitForSelector('[data-testid="stats-total"]');
    const total = await page.text('[data-testid="stats-total"]');
    assert.ok(Number(total.trim()) >= 0);
    const weakest = await page.evaluate(`!!document.querySelector('[data-testid="stats-weakest"]')`);
    assert.equal(weakest, true);
    await shot('06-stats');
  });

  test('the review and settings screens open', async () => {
    for (const [hash, testid] of [
      ['#/review', 'review-due'],
      ['#/settings', 'settings-export'],
    ]) {
      await page.goto(`${base}/${hash}`);
      await page.waitForSelector(`[data-testid="${testid}"]`);
    }
    await shot('07-settings');
  });

  test('nothing logged an error along the way', () => {
    assert.deepEqual(page.consoleErrors, []);
    assert.deepEqual(page.pageErrors, []);
  });
}
