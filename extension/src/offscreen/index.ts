import { PROTOCOL_VERSION, type ErrorCode, type RuntimeMessage } from '../shared/types';
import { StreamingResampler } from '../shared/resampler';
let stream: MediaStream | null = null; let context: AudioContext | null = null; let socket: WebSocket | null = null;
let sessionId = ''; let generation = 0; let paused = true; let rate = 1;
let anchorMedia = 0; let anchorContext = 0; let lastSync = 0; let sent = 0;
let resampler: StreamingResampler | null = null; let silentSeconds = 0; let reportedSilence = false;
let syncRevision = 0; let acceptedRevision = 0; let nextMedia: number | null = null;
let healthTimer: ReturnType<typeof setInterval> | null = null;
let modelState = 'not-loaded';
let backendDetail: string | undefined; let backendCode: ErrorCode | undefined;
const notify = (state: 'idle' | 'capturing' | 'error', detail = backendDetail, code = backendCode) => chrome.runtime.sendMessage({ type: 'CAPTURE_STATE', sessionId, state, detail, code, audioSecondsSent: sent / 16000, captureStatus: stream ? 'active' : 'stopped', streamStatus: socket?.readyState === WebSocket.OPEN ? 'connected' : 'disconnected', modelState } satisfies RuntimeMessage).catch(() => undefined);
async function stop() {
  if (healthTimer) clearInterval(healthTimer); healthTimer = null;
  const oldStream = stream; stream = null;
  const oldSocket = socket; socket = null; if (oldSocket) { oldSocket.onclose = null; oldSocket.onerror = null; oldSocket.close(); }
  oldStream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
  const oldContext = context; context = null; if (oldContext && oldContext.state !== 'closed') await oldContext.close();
  paused = true; sent = 0; nextMedia = null; resampler = null; sessionId = '';
}
async function fail(detail: string, code: ErrorCode) { await notify('error', detail, code); await stop(); }
async function start(streamId: string, id: string) {
  await stop(); sessionId = id; generation = 0; syncRevision = 0; acceptedRevision = -1; silentSeconds = 0; reportedSilence = false; modelState = 'not-loaded'; backendDetail = undefined; backendCode = undefined;
  stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } as MediaTrackConstraints, video: false });
  for (const track of stream.getTracks()) track.onended = () => { void fail('Tab audio capture ended. Start Live ASR again.', 'CAPTURE_LOST'); };
  context = new AudioContext(); const audioContext = context;
  resampler = new StreamingResampler(audioContext.sampleRate);
  await audioContext.audioWorklet.addModule(chrome.runtime.getURL('audio-worklet.js'));
  const source = audioContext.createMediaStreamSource(stream); const worklet = new AudioWorkletNode(audioContext, 'cinenihongo-processor');
  const silent = audioContext.createGain(); silent.gain.value = 0;
  source.connect(audioContext.destination); source.connect(worklet); worklet.connect(silent); silent.connect(audioContext.destination);
  await audioContext.resume();
  const ws = new WebSocket(`ws://127.0.0.1:8765/api/v1/sessions/${id}/stream`); socket = ws;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket handshake timed out')), 5000);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'handshake', protocolVersion: PROTOCOL_VERSION }));
    ws.onerror = () => { clearTimeout(timeout); reject(new Error('WebSocket connection failed')); };
    ws.onclose = () => { clearTimeout(timeout); reject(new Error('WebSocket closed before handshake')); };
    ws.onmessage = event => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.type === 'ready') { clearTimeout(timeout); resolve(); }
        else if (msg.type === 'result' && msg.result) void chrome.runtime.sendMessage({ type: 'ALIGNED_RESULT', result: msg.result } satisfies RuntimeMessage).catch(() => undefined);
        else if (msg.type === 'status') {
          modelState = msg.modelState ?? modelState;
          backendDetail = msg.detail; backendCode = msg.code;
          void chrome.runtime.sendMessage({ type: 'CAPTURE_STATE', sessionId: id, state: 'capturing', modelState, queueDepth: msg.queueDepth, bufferedAudioSeconds: msg.bufferedAudioSeconds, detail: msg.detail, code: msg.code, audioSecondsSent: sent / 16000 } satisfies RuntimeMessage).catch(() => undefined);
        } else if (msg.type === 'error') void fail(msg.detail ?? 'Audio stream rejected.', 'WEBSOCKET_FAILED');
      } catch { void fail('Backend sent an invalid message.', 'PROTOCOL_MISMATCH'); }
    };
  });
  ws.onclose = () => { if (socket === ws) void fail('Backend disconnected. Check the backend and start again.', 'WEBSOCKET_FAILED'); };
  ws.onerror = () => { if (socket === ws) void fail('Audio connection failed.', 'WEBSOCKET_FAILED'); };
  worklet.port.onmessage = ({ data }: MessageEvent<{ samples: Float32Array; contextStart: number }>) => {
    if (context !== audioContext || socket !== ws || ws.readyState !== WebSocket.OPEN || paused || !resampler) return;
    if (performance.now() - lastSync > 3000) { void fail('Player timing was lost. Reload the page and start again.', 'CAPTURE_LOST'); return; }
    if (ws.bufferedAmount > 1024 * 1024) { void fail('Audio connection cannot keep up. Restart the backend.', 'QUEUE_FULL'); return; }
    if (acceptedRevision !== syncRevision) { resampler.reset(); nextMedia = null; acceptedRevision = syncRevision; }
    const skip = Math.max(0, Math.ceil((anchorContext - data.contextStart) * audioContext.sampleRate));
    const samples = skip ? data.samples.subarray(skip) : data.samples;
    const pcm = resampler.push(samples); if (!pcm.length) return;
    const startTime = nextMedia ?? Math.max(0, anchorMedia + (data.contextStart + skip / audioContext.sampleRate - anchorContext) * rate);
    const endTime = startTime + pcm.length / 16000 * rate; nextMedia = endTime;
    ws.send(JSON.stringify({ type: 'audio', generation, mediaStart: startTime, mediaEnd: endTime, sampleRate: 16000, frames: pcm.length }));
    ws.send(pcm.buffer); sent += pcm.length;
    const rms = Math.sqrt(data.samples.reduce((sum, v) => sum + v * v, 0) / data.samples.length);
    silentSeconds = rms < .001 ? silentSeconds + data.samples.length / audioContext.sampleRate : 0;
    if (silentSeconds >= 8 && !reportedSilence) { reportedSilence = true; void notify('capturing', 'No audible tab audio for 8 seconds. Check playback, mute settings, or protected capture.', 'SILENT_AUDIO'); }
    if (silentSeconds === 0 && reportedSilence) { reportedSilence = false; void notify('capturing'); }
  };
  healthTimer = setInterval(() => {
    if (!paused && performance.now() - lastSync > 3000) void fail('Player timing was lost.', 'CAPTURE_LOST');
    else if (!reportedSilence) void notify('capturing');
  }, 2000);
}
chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, respond) => {
  if (message.type === 'OFFSCREEN_START') { start(message.streamId, message.sessionId).then(() => respond({ ok: true })).catch(async error => { await stop(); respond({ ok: false, error: String(error) }); }); return true; }
  if (message.type === 'OFFSCREEN_STOP') { stop().then(() => respond({ ok: true })); return true; }
  if (message.type === 'OFFSCREEN_SYNC' && context && sessionId === message.sessionId) {
    const expected = anchorMedia + (context.currentTime - anchorContext) * rate;
    if (message.discontinuity || message.generation !== generation || message.paused !== paused || message.playbackRate !== rate || Math.abs(expected - message.mediaTime) > .4) {
      anchorMedia = message.mediaTime; anchorContext = context.currentTime; syncRevision++;
    }
    generation = message.generation; paused = message.paused; rate = message.playbackRate; lastSync = performance.now();
    // A control frame invalidates pending results immediately, even while paused.
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'sync', generation }));
    respond({ ok: true });
  }
});
