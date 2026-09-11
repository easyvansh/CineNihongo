import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_SETTINGS, type RuntimeMessage, type Settings } from "../shared/types";
import "./popup.css";

const send = async (message: RuntimeMessage) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) throw new Error("No active tab");
  return chrome.tabs.sendMessage(tab.id, message);
};

function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState("Checking…");
  useEffect(() => {
    chrome.storage.local.get("settings").then(({ settings: saved }) => saved && setSettings({ ...DEFAULT_SETTINGS, ...saved }));
    send({ type: "STATUS" }).then((s) => setStatus(s.active ? `Connected · film ${s.filmId}` : s.status ?? "Ready")).catch(() => setStatus("Open a CineJoy movie"));
  }, []);
  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch }; setSettings(next); void chrome.storage.local.set({ settings: next }); void send({ type: "SETTINGS_UPDATED", settings: next }).catch(() => undefined);
  };
  const start = () => { setStatus("Starting…"); send({ type: "START", settings }).then((r) => setStatus(r.ok ? "Connected" : r.error)).catch((e) => setStatus(String(e))); };
  const stop = () => send({ type: "STOP" }).then(() => setStatus("Stopped"));
  const loadFile = async (file?: File) => { if (file) { const result = await send({ type: "IMPORT_SUBTITLES", text: await file.text(), filename: file.name }); setStatus(`${result.count} cues loaded`); } };
  return <main>
    <header><div><h1>CineNihongo</h1><small>Japanese, one line at a time</small></div><span className="dot" /></header>
    <div className="status">{status}</div>
    <div className="actions"><button className="primary" onClick={start}>Start</button><button onClick={stop}>Stop</button></div>
    <section><h2>Display</h2>
      <label><input type="checkbox" checked={settings.showRomaji} onChange={(e) => update({ showRomaji: e.target.checked })}/> Romaji</label>
      <label><input type="checkbox" checked={settings.showJapanese} onChange={(e) => update({ showJapanese: e.target.checked })}/> Japanese</label>
      <label><input type="checkbox" checked={settings.showEnglish} onChange={(e) => update({ showEnglish: e.target.checked })}/> Native English</label>
    </section>
    <section><h2>Transcription</h2>
      <label>Model<select value={settings.model} onChange={(e) => update({ model: e.target.value })}><option>base</option><option>small</option><option>medium</option></select></label>
      <label>Confidence <output>{settings.confidenceThreshold.toFixed(2)}</output><input type="range" min="0.3" max="0.95" step="0.05" value={settings.confidenceThreshold} onChange={(e) => update({ confidenceThreshold: Number(e.target.value) })}/></label>
      <label>Mode<select value={settings.processingMode} onChange={(e) => update({ processingMode: e.target.value as Settings["processingMode"] })}><option value="delayed">Delayed</option><option value="predictive">Predictive</option></select></label>
    </section>
    <section><h2>Fallback</h2><label className="file">Load Japanese SRT/VTT<input type="file" accept=".srt,.vtt" onChange={(e) => void loadFile(e.target.files?.[0])}/></label></section>
    <label><input type="checkbox" checked={settings.debug} onChange={(e) => update({ debug: e.target.checked })}/> Debug overlay</label>
  </main>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
