import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_SETTINGS, type RuntimeMessage, type RuntimeState, type Settings } from '../shared/types';
import './popup.css';
const runtime = (message: RuntimeMessage) => chrome.runtime.sendMessage(message) as Promise<RuntimeState>;
async function activeTab() { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (tab?.id === undefined) throw new Error('No active tab'); return tab.id; }
function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [state, setState] = useState<RuntimeState>({ phase: 'idle' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let alive = true;
    let polling = false;
    void chrome.storage.local.get('settings').then(({ settings: saved }) => { if (alive) setSettings({ ...DEFAULT_SETTINGS, ...saved }); });
    const poll = () => { if (polling) return; polling = true; void activeTab().then(tabId => runtime({ type: 'DIAGNOSTICS', tabId })).then(next => { if (alive) setState(next); }).catch(error => { if (alive) setState({ phase: 'error', lastError: { code: 'UNKNOWN', message: String(error) } }); }).finally(() => { polling = false; }); };
    poll(); const timer = setInterval(poll, 2500);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  async function run(work: () => Promise<RuntimeState>) {
    setBusy(true); setNotice('');
    try { setState(await work()); }
    catch (error) { setState({ phase: 'error', lastError: { code: 'UNKNOWN', message: String(error) } }); }
    finally { setBusy(false); }
  }
  function update(patch: Partial<Settings>) {
    const next = { ...settings, ...patch }; setSettings(next);
    void chrome.storage.local.set({ settings: next });
    void activeTab().then(tabId => chrome.tabs.sendMessage(tabId, { type: 'SETTINGS_UPDATED', settings: next } satisfies RuntimeMessage)).catch(() => undefined);
  }
  const capability = state.capability;
  return <main>
    <header><div><h1>CineNihongo</h1><small>Japanese, one line at a time</small></div><span className={`dot ${state.phase === 'error' ? 'bad' : ''}`} /></header>
    <div className="status" role="status"><strong>{state.phase}</strong>{state.lastError && <span>{state.lastError.code}: {state.lastError.message}</span>}{notice && <span>{notice}</span>}</div>
    <div className="actions"><button className="primary" disabled={busy} onClick={() => void run(async () => runtime({ type: 'START_LIVE', tabId: await activeTab(), settings }))}>Start Live ASR</button><button disabled={busy} onClick={() => void run(async () => runtime({ type: 'STOP', tabId: await activeTab() }))}>Stop</button></div>
    <small>Japanese audio only. Live lines appear after a short processing delay.</small>
    <label className="file">Load Japanese SRT/VTT<input disabled={busy} type="file" accept=".srt,.vtt" onChange={event => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (file) void run(async () => {
        if (file.size > 5 * 1024 * 1024) throw new Error('Subtitle file must be smaller than 5 MB.');
        return runtime({ type: 'LOAD_FILE', tabId: await activeTab(), text: new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()), filename: file.name, settings });
      });
    }}/></label>
    <section><h2>Diagnostics</h2><div className="facts">
      <span>Adapter</span><b>{capability?.adapter ?? '—'}</b><span>Video</span><b>{capability?.videoFound ? 'found' : 'not found'}</b>
      <span>Subtitles</span><b>{capability?.subtitleSource ?? '—'}</b><span>Backend</span><b>{capability?.backendReachable ? 'online' : 'offline / incompatible'}</b>
      <span>Audio sent</span><b>{(state.audioSecondsSent ?? 0).toFixed(1)}s</b><span>Audio buffered</span><b>{(state.bufferedAudioSeconds ?? 0).toFixed(1)}s</b>
      <span>Stream</span><b>{state.streamStatus ?? '—'}</b><span>Model</span><b>{state.modelState ?? 'not loaded'}</b><span>Queue</span><b>{state.queueDepth ?? 0}</b>
      {state.cueCount !== undefined && <><span>File cues</span><b>{state.cueCount}</b></>}
    </div>
      {capability?.warnings.map(warning => <p key={warning}>{warning}</p>)}
      <button disabled={busy} onClick={() => void run(async () => runtime({ type: 'DIAGNOSTICS', tabId: await activeTab() }))}>Run Diagnostics</button>
      <button disabled={busy} onClick={() => void activeTab().then(tabId => runtime({ type: 'PICK_SUBTITLE', tabId })).then(() => { setNotice('Click the caption text on the page. Escape cancels.'); }).catch(error => setNotice(String(error)))}>Pick Caption Element</button>
      <button onClick={() => void navigator.clipboard.writeText(JSON.stringify(state, null, 2)).then(() => setNotice('Diagnostics copied.')).catch(error => setNotice(String(error)))}>Copy JSON</button>
    </section>
    <section><h2>Display</h2>{(['showRomaji', 'showJapanese', 'showEnglish', 'debug'] as const).map((key, index) => <label key={key}><input type="checkbox" checked={settings[key]} onChange={e => update({ [key]: e.target.checked })}/>{['Romaji', 'Japanese', 'Native English', 'Debug overlay'][index]}</label>)}</section>
    <section><h2>Subtitle file offset</h2><output>{settings.subtitleOffset.toFixed(1)}s</output><div className="offset">
      {[-1, -.1, 0, .1, 1].map(value => <button key={value} onClick={() => update({ subtitleOffset: value === 0 ? 0 : Math.round((settings.subtitleOffset + value) * 10) / 10 })}>{value === 0 ? 'Reset' : `${value > 0 ? '+' : '−'}${Math.abs(value)}s`}</button>)}
    </div></section>
    <section><h2>Transcription</h2><label>Model<select value={settings.model} onChange={e => update({ model: e.target.value })}><option>base</option><option>small</option><option>medium</option></select></label>
      <label>Confidence <output>{settings.confidenceThreshold.toFixed(2)}</output><input aria-label="Confidence" type="range" min="0.3" max="0.95" step="0.05" value={settings.confidenceThreshold} onChange={e => update({ confidenceThreshold: Number(e.target.value) })}/></label>
      <small>Restart live ASR after changing model or confidence. Use base for a slower CPU.</small>
    </section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
