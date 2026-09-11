import { PROTOCOL_VERSION, type RuntimeMessage } from "../shared/types";

let stream: MediaStream | null = null;
let context: AudioContext | null = null;
let socket: WebSocket | null = null;
let sessionId = "";
let mediaTime = 0;
let generation = 0;
let paused = true;
let sampleCursor = 0;

const notify = (state: string, detail?: string) => chrome.runtime.sendMessage({ type: "CAPTURE_STATE", state, detail } satisfies RuntimeMessage).catch(() => undefined);

function resample(input: Float32Array, inputRate: number): Int16Array {
  const ratio = inputRate / 16000;
  const output = new Int16Array(Math.floor(input.length / ratio));
  for (let i = 0; i < output.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)] ?? 0));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

async function stop() {
  stream?.getTracks().forEach((track) => track.stop()); stream = null;
  socket?.close(); socket = null;
  if (context) await context.close(); context = null;
  await notify("stopped");
}

async function start(streamId: string, nextSessionId: string) {
  await stop(); sessionId = nextSessionId; sampleCursor = 0;
  stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } } as MediaTrackConstraints, video: false });
  context = new AudioContext();
  await context.audioWorklet.addModule(chrome.runtime.getURL("audio-worklet.js"));
  const source = context.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(context, "cinenihongo-processor");
  source.connect(worklet); source.connect(context.destination);
  socket = new WebSocket(`ws://127.0.0.1:8765/api/v1/sessions/${sessionId}/stream`);
  socket.binaryType = "arraybuffer";
  socket.onopen = () => { socket?.send(JSON.stringify({ type: "handshake", protocolVersion: PROTOCOL_VERSION })); void notify("capturing"); };
  socket.onerror = () => void notify("error", "Local transcription service unavailable");
  socket.onmessage = (event) => {
    if (typeof event.data !== "string") return;
    const msg = JSON.parse(event.data) as { type: string; result?: unknown; detail?: string };
    if (msg.type === "result" && msg.result) chrome.runtime.sendMessage({ type: "ALIGNED_RESULT", result: msg.result } as RuntimeMessage);
    if (msg.type === "error") void notify("error", msg.detail);
  };
  worklet.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
    if (!socket || socket.readyState !== WebSocket.OPEN || paused) return;
    const pcm = resample(data, context?.sampleRate ?? 48000);
    const startAt = mediaTime + sampleCursor / 16000;
    const endAt = startAt + pcm.length / 16000;
    socket.send(JSON.stringify({ type: "audio", generation, mediaStart: startAt, mediaEnd: endAt, sampleRate: 16000, frames: pcm.length }));
    socket.send(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer); sampleCursor += pcm.length;
  };
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, respond) => {
  if (message.type === "OFFSCREEN_START") { start(message.streamId, message.sessionId).then(() => respond({ ok: true })).catch((e) => { void notify("error", String(e)); respond({ ok: false, error: String(e) }); }); return true; }
  if (message.type === "OFFSCREEN_STOP") { stop().then(() => respond({ ok: true })); return true; }
  if (message.type === "OFFSCREEN_SYNC") { mediaTime = message.mediaTime; generation = message.generation; paused = message.paused; sampleCursor = 0; respond({ ok: true }); }
});
