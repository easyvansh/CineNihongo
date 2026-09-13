import { PROTOCOL_VERSION, type CapabilityReport, type ErrorCode, type RuntimeMessage, type RuntimeState, type Settings } from '../shared/types';
const BASE = 'http://127.0.0.1:8765';
type Active = { tabId: number; sessionId: string };
let active: Active | null = null;
const ready = chrome.storage.session.get('active').then(saved => { active = saved.active ?? null; });
let operation: Promise<unknown> = Promise.resolve();
const headers = { 'Content-Type': 'application/json', 'X-CineNihongo-Protocol': PROTOCOL_VERSION };
function failure(code: ErrorCode, message: string): RuntimeState { return { phase: 'error', lastError: { code, message } }; }
async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${BASE}${path}`, { ...init, headers, signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response.json();
}
async function ensureContent(tabId: number) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.url && !/^https?:\/\//.test(tab.url)) throw new Error('UNSUPPORTED_PAGE: Open an http(s) page with a top-level HTML5 video.');
  try { await chrome.tabs.sendMessage(tabId, { type: 'GET_STATE' } satisfies RuntimeMessage); }
  catch { await chrome.scripting.executeScript({ target: { tabId }, files: ['assets/content.js'] }); }
}
async function detect(tabId: number): Promise<CapabilityReport> {
  await ensureContent(tabId);
  let reachable = false;
  try { const health = await request('/health'); reachable = health.protocolVersion === PROTOCOL_VERSION; } catch { /* diagnostics still work offline */ }
  return chrome.tabs.sendMessage(tabId, { type: 'DETECT', backendReachable: reachable } satisfies RuntimeMessage);
}
async function stop(tabId?: number, clearContent = true) {
  await ready;
  if (active && (tabId === undefined || active.tabId === tabId)) {
    const old = active; active = null; await chrome.storage.session.remove('active');
    await chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP' } satisfies RuntimeMessage).catch(() => undefined);
    await request(`/api/v1/sessions/${old.sessionId}`, { method: 'DELETE' }).catch(() => undefined);
    if (clearContent) await chrome.tabs.sendMessage(old.tabId, { type: 'CONTENT_STOP' } satisfies RuntimeMessage).catch(() => undefined);
  }
  if (tabId !== undefined && clearContent) await chrome.tabs.sendMessage(tabId, { type: 'CONTENT_STOP' } satisfies RuntimeMessage).catch(() => undefined);
}
async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT], documentUrls: [chrome.runtime.getURL('offscreen.html')] });
  if (!contexts.length) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: [chrome.offscreen.Reason.USER_MEDIA], justification: 'Transcribe user-approved tab audio locally' });
}
function streamId(tabId: number) { return new Promise<string>((resolve, reject) => chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, id => { const error = chrome.runtime.lastError; if (error || !id) reject(new Error(`CAPTURE_DENIED: ${error?.message ?? 'No stream ID'}`)); else resolve(id); })); }
async function startLive(tabId: number, settings: Settings): Promise<RuntimeState> {
  await stop();
  const capability = await detect(tabId);
  if (!capability.videoFound) return failure('NO_VIDEO', capability.warnings[0] ?? 'No visible HTML5 video.');
  try {
    const health = await request('/health');
    if (health.protocolVersion !== PROTOCOL_VERSION) return failure('PROTOCOL_MISMATCH', 'Reload the extension and restart the updated backend.');
  } catch { return failure('BACKEND_OFFLINE', 'Start the local backend on 127.0.0.1:8765.'); }
  let created = '';
  try {
    const session = await request('/api/v1/sessions', { method: 'POST', body: JSON.stringify({ filmId: capability.mediaId, model: settings.model, confidenceThreshold: settings.confidenceThreshold, protocolVersion: PROTOCOL_VERSION }) });
    created = session.sessionId;
    await ensureOffscreen(); const id = await streamId(tabId);
    active = { tabId, sessionId: created }; await chrome.storage.session.set({ active });
    const capture = await chrome.runtime.sendMessage({ type: 'OFFSCREEN_START', streamId: id, sessionId: created } satisfies RuntimeMessage);
    if (!capture?.ok) throw new Error(capture?.error ?? 'OFFSCREEN_FAILED: Capture failed.');
    await chrome.tabs.sendMessage(tabId, { type: 'LIVE_SESSION', sessionId: created, settings } satisfies RuntimeMessage);
    return { phase: 'capturing', mode: 'live-asr', capability, captureStatus: 'active', streamStatus: 'connected' };
  } catch (error) {
    await stop();
    if (created) await request(`/api/v1/sessions/${created}`, { method: 'DELETE' }).catch(() => undefined);
    const detail = String(error);
    return failure(detail.includes('WebSocket') ? 'WEBSOCKET_FAILED' : detail.includes('CAPTURE_DENIED') ? 'CAPTURE_DENIED' : 'OFFSCREEN_FAILED', detail);
  }
}
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = operation.catch(() => undefined).then(work); operation = next; return next;
}
chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, respond) => {
  const reply = (work: Promise<unknown>) => { void work.then(respond).catch(error => respond(failure(String(error).includes('UNSUPPORTED_PAGE') ? 'UNSUPPORTED_PAGE' : 'UNKNOWN', String(error)))); return true; };
  if (message.type === 'ENSURE_CONTENT') return reply(ensureContent(message.tabId).then(() => ({ ok: true })));
  if (message.type === 'DIAGNOSTICS' && message.tabId !== undefined) return reply((async () => {
    const capability = await detect(message.tabId!);
    const state = await chrome.tabs.sendMessage(message.tabId!, { type: 'GET_STATE' } satisfies RuntimeMessage);
    return { ...state, capability };
  })());
  if (message.type === 'GET_STATE' && message.tabId !== undefined) return reply(chrome.tabs.sendMessage(message.tabId, { type: 'GET_STATE' } satisfies RuntimeMessage));
  if (message.type === 'START_LIVE') return reply(serial(() => startLive(message.tabId, message.settings)));
  if (message.type === 'LOAD_FILE') return reply(serial(async () => {
    await stop(); await ensureContent(message.tabId);
    return chrome.tabs.sendMessage(message.tabId, { type: 'IMPORT_SUBTITLES', text: message.text, filename: message.filename, settings: message.settings } satisfies RuntimeMessage);
  }));
  if (message.type === 'PICK_SUBTITLE') return reply(ensureContent(message.tabId).then(() => chrome.tabs.sendMessage(message.tabId, { type: 'BEGIN_PICK_SUBTITLE' } satisfies RuntimeMessage)));
  if (message.type === 'ROMANIZE') return reply(request('/api/v1/romanize', { method: 'POST', body: JSON.stringify({ text: message.text }) }).catch(() => ({ romaji: '' })));
  if (message.type === 'STOP') return reply(serial(async () => { await stop(message.tabId ?? sender.tab?.id); return { phase: 'idle' }; }));
  if (message.type === 'SUBTITLE_EVENT') return reply((async () => {
    await ready;
    if (sender.tab?.id !== active?.tabId || message.event.sessionId !== active?.sessionId) return { accepted: false };
    try { return await request(`/api/v1/sessions/${active.sessionId}/subtitle-events`, { method: 'POST', body: JSON.stringify(message.event) }); }
    catch (error) { return failure(String(error).includes('429') ? 'QUEUE_FULL' : 'BACKEND_OFFLINE', String(error)); }
  })());
  if (message.type === 'CAPTURE_SYNC') return reply((async () => {
    await ready;
    if (sender.tab?.id !== active?.tabId || message.sessionId !== active?.sessionId) return { ok: false };
    return chrome.runtime.sendMessage({ ...message, type: 'OFFSCREEN_SYNC' } satisfies RuntimeMessage);
  })());
  if (message.type === 'ALIGNED_RESULT' || message.type === 'CAPTURE_STATE') {
    // Results and capture status may only originate from our offscreen document.
    if (sender.url !== chrome.runtime.getURL('offscreen.html')) return;
    return reply((async () => {
      await ready;
      const id = message.type === 'ALIGNED_RESULT' ? message.result.sessionId : message.sessionId;
      if (!active || id !== active.sessionId) return { ok: false };
      await chrome.tabs.sendMessage(active.tabId, message).catch(() => undefined);
      if (message.type === 'CAPTURE_STATE' && message.state === 'error') await serial(() => stop(undefined, false));
      return { ok: true };
    })());
  }
});
chrome.tabs.onRemoved.addListener(tabId => { void serial(() => stop(tabId)).catch(() => undefined); });
chrome.tabs.onUpdated.addListener((tabId, change) => { if (change.status === 'loading') void serial(() => stop(tabId)).catch(() => undefined); });
chrome.commands.onCommand.addListener(command => { if (command === 'replay-dialogue') void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => tab?.id && chrome.tabs.sendMessage(tab.id, { type: 'REPLAY' } satisfies RuntimeMessage)).catch(() => undefined); });
