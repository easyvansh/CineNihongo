import { chromium } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { readFile, cp, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'node:http';
import { generateKeyPairSync, createHash } from 'node:crypto';

// Test-only extension copy grants the loopback fixture origin so executeScript can
// be exercised without clicking the browser toolbar. Production stays activeTab-only.
const temporary = await mkdtemp(join(tmpdir(), 'cinenihongo-browser-'));
const extension = join(temporary, 'extension');
await cp(resolve('dist'), extension, { recursive: true });
const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
manifest.host_permissions.push('http://127.0.0.1/*');
const publicKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'der' });
manifest.key = publicKey.toString('base64');
const testExtensionId = createHash('sha256').update(publicKey).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, c => String.fromCharCode(97 + parseInt(c, 16)));
await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
const html = await readFile(resolve('fixtures/reliability.html'));
const server = createServer((_req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/fixture`;
let browser;
let count = 0;
const pass = name => { count++; console.log(`PASS ${name}`); };
try {
  browser = await chromium.launchPersistentContext(join(temporary, 'profile'), {
    channel: 'chromium', headless: true,
    ignoreDefaultArgs: ['--mute-audio'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--autoplay-policy=no-user-gesture-required',
      ...(process.argv.includes('--capture') ? [`--allowlisted-extension-id=${testExtensionId}`] : [])]
  });
  const worker = browser.serviceWorkers()[0] ?? await browser.waitForEvent('serviceworker');
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
  const tabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(t => t.url === url).id, url);
  // Messages sent by the worker do not loop back to itself; use an extension page.
  const extensionPage = await browser.newPage();
  await extensionPage.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  const background = message => extensionPage.evaluate(message => chrome.runtime.sendMessage(message), message);
  const content = message => worker.evaluate(({ tabId, message }) => chrome.tabs.sendMessage(tabId, message), { tabId, message });
  const settings = { showRomaji: true, showJapanese: true, showEnglish: true, debug: false, model: 'base', confidenceThreshold: .65, processingMode: 'delayed', subtitleOffset: 0 };
  await background({ type: 'ENSURE_CONTENT', tabId });
  assert.equal((await content({ type: 'DETECT' })).videoFound, true);
  pass('built classic content script injects through chrome.scripting');

  const jp = () => page.locator('#cinenihongo-overlay-host .jp').textContent();
  await page.evaluate(() => window.fixture.time = 2);
  let state = await background({ type: 'LOAD_FILE', tabId, filename: 'test.srt', text: '1\n00:00:01,000 --> 00:00:04,000\nこんにちは', settings });
  assert.equal(state.phase, 'file-ready');
  await page.waitForFunction(() => document.querySelector('#cinenihongo-overlay-host')?.shadowRoot?.querySelector('.jp')?.textContent === 'こんにちは');
  assert.equal(await page.locator('#cinenihongo-overlay-host .ro').textContent(), 'konnichiha');
  pass('UTF-8 SRT and offline kana rendering');
  await page.evaluate(() => window.fixture.time = 4);
  await page.waitForFunction(() => document.querySelector('#cinenihongo-overlay-host').shadowRoot.querySelector('.jp').textContent === '');
  pass('expired file cues clear at exclusive end boundary');
  await content({ type: 'SETTINGS_UPDATED', settings: { ...settings, subtitleOffset: 2, showEnglish: false } });
  await page.waitForFunction(() => document.querySelector('#cinenihongo-overlay-host').shadowRoot.querySelector('.jp').textContent === 'こんにちは');
  assert.equal(await page.locator('.caption').evaluate(e => e.style.visibility), 'hidden');
  await background({ type: 'STOP', tabId });
  assert.equal(await page.locator('.caption').evaluate(e => e.style.visibility), '');
  pass('file offset and native-caption visibility restoration on stop');

  await page.evaluate(() => {
    document.querySelector('.caption').remove();
    const el = document.createElement('div'); el.className = 'caption'; el.textContent = 'Replacement'; document.querySelector('.stage').append(el);
  });
  assert.equal((await content({ type: 'DETECT' })).subtitleSource, 'dom');
  await page.evaluate(() => {
    const track = document.querySelector('video').addTextTrack('subtitles', 'English', 'en'); track.mode = 'showing';
    track.addCue(new VTTCue(0, 10, 'Native cue'));
  });
  assert.equal((await content({ type: 'DETECT' })).subtitleSource, 'text-track');
  pass('replaced DOM captions and preferred native text tracks');

  await content({ type: 'BEGIN_PICK_SUBTITLE' });
  await page.locator('.caption').click();
  assert.equal((await content({ type: 'DETECT' })).subtitleSource, 'dom');
  pass('user-picked caption overrides native track');

  await page.evaluate(() => window.fixture.replaceVideo());
  await page.waitForFunction(() => document.querySelector('.stage video').readyState >= 2);
  await content({ type: 'DETECT' });
  assert.equal(await page.locator('#cinenihongo-overlay-host').count(), 1);
  pass('player replacement leaves one overlay');
  await page.evaluate(() => { const ad = document.createElement('video'); ad.style.cssText = 'width:10px;height:10px'; document.body.append(ad); });
  assert.equal((await content({ type: 'DETECT' })).videoFound, true);
  await page.evaluate(() => {
    const button = document.createElement('button'); button.id = 'fullscreen-test'; button.textContent = 'Fullscreen';
    button.onclick = () => document.querySelector('.stage').requestFullscreen(); document.body.append(button);
  });
  await page.bringToFront();
  await page.locator('#fullscreen-test').click();
  await page.waitForFunction(() => document.fullscreenElement?.contains(document.querySelector('#cinenihongo-overlay-host')));
  await page.evaluate(() => document.exitFullscreen());
  pass('multiple-video selection and player-container fullscreen overlay');

  await content({ type: 'LIVE_SESSION', sessionId: 'fixture-session', settings });
  await page.evaluate(() => window.fixture.time = 4);
  await page.waitForFunction(() => !document.querySelector('.stage video').seeking);
  state = await content({ type: 'GET_STATE' });
  // Intercept outgoing messages only in the content world's chrome runtime by
  // asking the real worker to inspect the current generation via captured sync.
  const gen = await worker.evaluate(async tabId => {
    return new Promise(resolve => {
      const listener = (msg, sender) => { if (msg.type === 'CAPTURE_SYNC' && sender.tab?.id === tabId) { chrome.runtime.onMessage.removeListener(listener); resolve(msg.generation); } };
      chrome.runtime.onMessage.addListener(listener);
    });
  }, tabId);
  const aligned = { subtitleId: 'a', sessionId: 'fixture-session', generation: gen, filmId: state.capability.mediaId, english: '', japanese: '日本語', romaji: 'nihongo', start: 1, end: 3, confidence: .9, source: 'whisper' };
  await content({ type: 'ALIGNED_RESULT', result: aligned });
  assert.equal(await jp(), '日本語');
  await page.evaluate(() => { window.fixture.time = 1; document.querySelector('.stage video').dispatchEvent(new Event('seeking')); });
  await content({ type: 'ALIGNED_RESULT', result: aligned });
  await page.waitForFunction(() => document.querySelector('#cinenihongo-overlay-host').shadowRoot.querySelector('.jp').textContent === '');
  pass('delayed live result displays and stale result is rejected after seek');
  await page.evaluate(() => history.pushState({}, '', '/another-film'));
  await page.waitForTimeout(300);
  assert.equal((await content({ type: 'GET_STATE' })).phase, 'idle');
  pass('SPA media navigation stops the prior session');

  if (process.argv.includes('--capture')) {
    await page.evaluate(() => { window.fixture.time = 5; return document.querySelector('.stage video').play(); });
    await extensionPage.evaluate(({ tabId, settings }) => {
      const button = document.createElement('button'); button.id = 'capture-test'; button.textContent = 'Start fixture capture';
      button.onclick = async () => { window.captureResult = await chrome.runtime.sendMessage({ type: 'START_LIVE', tabId, settings }); };
      document.body.append(button);
    }, { tabId, settings });
    await extensionPage.locator('#capture-test').click();
    await extensionPage.waitForFunction(() => window.captureResult !== undefined);
    const capture = await extensionPage.evaluate(() => window.captureResult);
    assert.equal(capture.phase, 'capturing', JSON.stringify(capture));
    await page.bringToFront();
    try {
      await page.waitForFunction(() => document.querySelector('#cinenihongo-overlay-host')?.shadowRoot?.querySelector('.jp')?.textContent === 'こんにちは', undefined, { timeout: 15000 });
    } catch (error) {
      console.error('Capture diagnostics:', await content({ type: 'GET_STATE' }));
      console.error('Backend diagnostics:', await worker.evaluate(async () => {
        const { active } = await chrome.storage.session.get('active');
        if (!active) return 'No active session';
        return (await fetch(`http://127.0.0.1:8765/api/v1/sessions/${active.sessionId}/diagnostics`, { headers: { 'X-CineNihongo-Protocol': '3' } })).json();
      }));
      throw error;
    }
    state = await content({ type: 'GET_STATE' });
    assert.ok(state.audioSecondsSent > 0, JSON.stringify(state));
    await background({ type: 'STOP', tabId });
    assert.equal((await content({ type: 'GET_STATE' })).phase, 'idle');
    pass('real tabCapture → offscreen resampling → WebSocket → deterministic ASR → overlay → stop');
  }

  await page.evaluate(() => document.querySelectorAll('video').forEach(v => v.remove()));
  assert.equal((await content({ type: 'DETECT' })).videoFound, false);
  state = await background({ type: 'LOAD_FILE', tabId, text: 'invalid', filename: 'bad.srt', settings });
  assert.equal(state.phase, 'error');
  pass('missing video and invalid subtitle file produce a recoverable error');
  assert.deepEqual(errors, []);
  console.log(`${count} browser scenarios passed.`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
