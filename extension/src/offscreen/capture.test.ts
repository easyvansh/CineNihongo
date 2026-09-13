/* eslint-disable @typescript-eslint/no-this-alias -- Expose browser mocks to lifecycle assertions. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeMessage } from '../shared/types';

type Listener = (message: RuntimeMessage, sender: unknown, respond: (value: unknown) => void) => boolean | void;
let listener: Listener;
let worklet: { port: { onmessage?: (event: { data: { samples: Float32Array; contextStart: number } }) => void } };
const notify = vi.fn(async () => ({}));
const track = { stop: vi.fn(), onended: null as (() => void) | null };
let ws: FakeSocket;
class FakeSocket {
  static OPEN = 1;
  readyState = 1; bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: (string | ArrayBuffer)[] = [];
  constructor() { ws = this; queueMicrotask(() => this.onopen?.()); }
  send(value: string | ArrayBuffer) {
    this.sent.push(value);
    if (typeof value === 'string' && JSON.parse(value).type === 'handshake') queueMicrotask(() => this.onmessage?.({ data: '{"type":"ready"}' }));
  }
  close() { this.readyState = 3; this.onclose?.(); }
}
const getMedia = vi.fn(async () => ({ getTracks: () => [track] }));
function invoke(message: RuntimeMessage): Promise<unknown> { return new Promise(resolve => listener(message, {}, resolve)); }
function audio(level = .1) { worklet.port.onmessage?.({ data: { samples: new Float32Array(2048).fill(level), contextStart: 1 } }); }
const sync = (patch = {}) => invoke({ type: 'OFFSCREEN_SYNC', sessionId: 's', mediaTime: 5, generation: 1, paused: false, playbackRate: 1, discontinuity: true, ...patch });

beforeEach(async () => {
  vi.resetModules(); notify.mockClear(); track.stop.mockClear(); getMedia.mockClear();
  vi.stubGlobal('chrome', { runtime: { getURL: (s: string) => s, sendMessage: notify, onMessage: { addListener: (fn: Listener) => { listener = fn; } } } });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: getMedia } });
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('AudioContext', class {
    sampleRate = 44100; currentTime = 1; state = 'running'; destination = {};
    audioWorklet = { addModule: async () => undefined };
    createMediaStreamSource() { return { connect: vi.fn() }; }
    createGain() { return { gain: { value: 1 }, connect: vi.fn() }; }
    async resume() { /* mock audio clock */ }
    async close() { this.state = 'closed'; }
  });
  vi.stubGlobal('AudioWorkletNode', class {
    port = {}; connect = vi.fn(); constructor() { worklet = this; }
  });
  await import('./index');
});
afterEach(async () => { await invoke({ type: 'OFFSCREEN_STOP' }); vi.unstubAllGlobals(); });

describe('offscreen capture lifecycle', () => {
  it('acknowledges handshake, pauses audio, resumes and releases tracks', async () => {
    expect(await invoke({ type: 'OFFSCREEN_START', streamId: 'id', sessionId: 's' })).toEqual({ ok: true });
    await sync(); audio();
    const headers = () => ws.sent.filter((v): v is string => typeof v === 'string').map(v => JSON.parse(v)).filter(v => v.type === 'audio');
    expect(headers()[0]).toMatchObject({ generation: 1, mediaStart: 5, sampleRate: 16000 });
    await sync({ paused: true }); audio(); expect(headers()).toHaveLength(1);
    await sync({ mediaTime: 20, generation: 2, playbackRate: 2 }); audio();
    expect(headers()[1].mediaStart).toBe(20);
    expect(headers()[1].mediaEnd - 20).toBeCloseTo(headers()[1].frames / 8000);
    await invoke({ type: 'OFFSCREEN_STOP' }); expect(track.stop).toHaveBeenCalled(); expect(ws.readyState).toBe(3);
  });
  it('cleans partial startup when capture is denied', async () => {
    getMedia.mockRejectedValueOnce(new Error('Permission denied'));
    expect(await invoke({ type: 'OFFSCREEN_START', streamId: 'id', sessionId: 's' })).toMatchObject({ ok: false });
  });
  it('reports capture loss and socket disconnection', async () => {
    await invoke({ type: 'OFFSCREEN_START', streamId: 'id', sessionId: 's' });
    track.onended?.();
    await vi.waitFor(() => expect(track.stop).toHaveBeenCalled());
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ code: 'CAPTURE_LOST', state: 'error' }));
    await invoke({ type: 'OFFSCREEN_START', streamId: 'id', sessionId: 's' });
    ws.onclose?.();
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(expect.objectContaining({ code: 'WEBSOCKET_FAILED' })));
  });
  it('reports prolonged silence and clears it on audible input', async () => {
    await invoke({ type: 'OFFSCREEN_START', streamId: 'id', sessionId: 's' }); await sync();
    for (let i = 0; i < 180; i++) audio(0);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ code: 'SILENT_AUDIO', state: 'capturing' }));
    audio(.2); expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'capturing', detail: undefined }));
  });
  it('bounds WebSocket backlog and closes the capture', async () => {
    await invoke({ type: 'OFFSCREEN_START', streamId: 'id', sessionId: 's' }); await sync();
    ws.bufferedAmount = 2 * 1024 * 1024; audio();
    await vi.waitFor(() => expect(track.stop).toHaveBeenCalled());
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ code: 'QUEUE_FULL' }));
  });
});
