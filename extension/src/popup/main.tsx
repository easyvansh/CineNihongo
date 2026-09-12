import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_SETTINGS, type RuntimeMessage, type RuntimeState, type Settings } from "../shared/types";
import "./popup.css";
const runtime = (message: RuntimeMessage) => chrome.runtime.sendMessage(message) as Promise<RuntimeState>;
async function activeTab() { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (!tab.id) throw new Error("No active tab"); return tab.id; }
function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS); const [state, setState] = useState<RuntimeState>({ phase: "idle" }); const [busy, setBusy] = useState(false);
  useEffect(() => {
    void chrome.storage.local.get("settings").then(({ settings: saved }) => setSettings({ ...DEFAULT_SETTINGS, ...saved }));
    void activeTab().then(async (tabId) => { await runtime({ type: "ENSURE_CONTENT", tabId }); setState(await runtime({ type: "DIAGNOSTICS", tabId })); }).catch((error) => setState({ phase: "error", lastError: { code: "UNKNOWN", message: String(error) } }));
    const listener = (message: RuntimeMessage) => { if (message.type === "CAPTURE_STATE") setState((previous) => ({ ...previous, phase: message.state, bufferedAudioSeconds: message.bufferedAudioSeconds, lastError: message.detail ? { code: "UNKNOWN", message: message.detail } : undefined })); if (message.type === "ALIGNED_RESULT") setState((previous) => ({ ...previous, phase: "processing" })); };
    chrome.runtime.onMessage.addListener(listener); return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);
  async function diagnostics() { setBusy(true); try { const tabId = await activeTab(); await runtime({ type: "ENSURE_CONTENT", tabId }); setState(await runtime({ type: "DIAGNOSTICS", tabId })); } catch (error) { setState({ phase: "error", lastError: { code: "UNKNOWN", message: String(error) } }); } finally { setBusy(false); } }
  function update(patch: Partial<Settings>) { const next = { ...settings, ...patch }; setSettings(next); void chrome.storage.local.set({ settings: next }); void activeTab().then((tabId) => chrome.tabs.sendMessage(tabId, { type: "SETTINGS_UPDATED", settings: next } satisfies RuntimeMessage)).catch(() => undefined); }
  async function start() { setBusy(true); setState({ phase: "backend-connecting", mode: "live-asr" }); try { setState(await runtime({ type: "START_LIVE", tabId: await activeTab(), settings })); } finally { setBusy(false); } }
  async function stop() { setBusy(true); setState(await runtime({ type: "STOP", tabId: await activeTab() })); setBusy(false); }
  async function load(file?: File) { if (!file) return; setBusy(true); try { setState(await runtime({ type: "LOAD_FILE", tabId: await activeTab(), text: await file.text(), filename: file.name, settings })); } finally { setBusy(false); } }
  const capability = state.capability;
  return <main><header><div><h1>CineNihongo</h1><small>Japanese, one line at a time</small></div><span className={`dot ${state.phase === "error" ? "bad" : ""}`} /></header>
    <div className="status"><strong>{state.phase}</strong>{state.lastError && <span>{state.lastError.code}: {state.lastError.message}</span>}</div>
    <div className="actions"><button className="primary" disabled={busy} onClick={() => void start()}>Start Live ASR</button><button disabled={busy} onClick={() => void stop()}>Stop</button></div>
    <label className="file">Load Japanese SRT/VTT<input type="file" accept=".srt,.vtt" onChange={(event) => void load(event.target.files?.[0])}/></label>
    <section><h2>Diagnostics</h2><div className="facts"><span>Adapter</span><b>{capability?.adapter ?? "—"}</b><span>Video</span><b>{capability?.videoFound ? "found" : "not found"}</b><span>Subtitles</span><b>{capability?.subtitleSource ?? "—"}</b><span>Backend</span><b>{capability?.backendReachable ? "online" : "offline"}</b><span>Audio sent</span><b>{(state.bufferedAudioSeconds ?? 0).toFixed(1)}s</b>{state.cueCount !== undefined && <><span>File cues</span><b>{state.cueCount}</b></>}</div><button disabled={busy} onClick={() => void diagnostics()}>Run Diagnostics</button><button onClick={() => void activeTab().then((tabId) => runtime({ type: "PICK_SUBTITLE", tabId }))}>Pick Caption Element</button><button onClick={() => void navigator.clipboard.writeText(JSON.stringify(state, null, 2))}>Copy JSON</button></section>
    <section><h2>Display</h2><label><input type="checkbox" checked={settings.showRomaji} onChange={(e) => update({ showRomaji: e.target.checked })}/> Romaji</label><label><input type="checkbox" checked={settings.showJapanese} onChange={(e) => update({ showJapanese: e.target.checked })}/> Japanese</label><label><input type="checkbox" checked={settings.showEnglish} onChange={(e) => update({ showEnglish: e.target.checked })}/> Native English</label><label><input type="checkbox" checked={settings.debug} onChange={(e) => update({ debug: e.target.checked })}/> Debug overlay</label></section>
    <section><h2>Subtitle offset</h2><output>{settings.subtitleOffset.toFixed(1)}s</output><div className="offset"><button onClick={() => update({ subtitleOffset: settings.subtitleOffset - 1 })}>−1s</button><button onClick={() => update({ subtitleOffset: settings.subtitleOffset - .1 })}>−0.1s</button><button onClick={() => update({ subtitleOffset: 0 })}>Reset</button><button onClick={() => update({ subtitleOffset: settings.subtitleOffset + .1 })}>+0.1s</button><button onClick={() => update({ subtitleOffset: settings.subtitleOffset + 1 })}>+1s</button></div></section>
    <section><h2>Transcription</h2><label>Model<select value={settings.model} onChange={(e) => update({ model: e.target.value })}><option>base</option><option>small</option><option>medium</option></select></label><label>Confidence <output>{settings.confidenceThreshold.toFixed(2)}</output><input type="range" min="0.3" max="0.95" step="0.05" value={settings.confidenceThreshold} onChange={(e) => update({ confidenceThreshold: Number(e.target.value) })}/></label></section>
  </main>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
