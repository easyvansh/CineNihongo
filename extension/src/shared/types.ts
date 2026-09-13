export const PROTOCOL_VERSION = "3";
export type ProcessingMode = "delayed" | "predictive";
export type SourceMode = "live-asr" | "subtitle-file" | "romanized-file";
export type AdapterName = "cinejoy" | "youtube" | "native-track" | "generic-dom";
export type SubtitleSource = "dom" | "text-track" | "file" | "none";
export type ErrorCode = "UNSUPPORTED_PAGE" | "NO_VIDEO" | "NO_SUBTITLE_SOURCE" | "BACKEND_OFFLINE" | "CAPTURE_DENIED" | "CAPTURE_LOST" | "OFFSCREEN_FAILED" | "WEBSOCKET_FAILED" | "PROTOCOL_MISMATCH" | "SILENT_AUDIO" | "QUEUE_FULL" | "MODEL_FAILED" | "UNKNOWN";

export interface Settings { showRomaji: boolean; showJapanese: boolean; showEnglish: boolean; debug: boolean; model: string; confidenceThreshold: number; processingMode: ProcessingMode; subtitleOffset: number; }
export const DEFAULT_SETTINGS: Settings = { showRomaji: true, showJapanese: true, showEnglish: true, debug: false, model: "small", confidenceThreshold: 0.65, processingMode: "delayed", subtitleOffset: 0 };

export interface CapabilityReport { adapter: AdapterName; frameId: number; videoFound: boolean; subtitleSource: SubtitleSource; backendReachable: boolean; captureSupported: boolean; mediaId: string; warnings: string[]; }
export interface RuntimeState { phase: "idle" | "detecting" | "backend-connecting" | "capturing" | "processing" | "file-ready" | "error"; mode?: SourceMode; mediaTime?: number; bufferedAudioSeconds?: number; audioSecondsSent?: number; captureStatus?: string; streamStatus?: string; modelState?: string; queueDepth?: number; lastResultTime?: number; cueCount?: number; filename?: string; capability?: CapabilityReport; lastError?: { code: ErrorCode; message: string }; }
export interface SubtitleEvent { id: string; sessionId: string; filmId: string; englishText: string; appearedAtVideoTime: number; disappearedAtVideoTime?: number; detectedAtWallClock: number; generation: number; windowKind: "caption" | "rolling"; playbackRate: number; }
export interface AlignedSubtitle { subtitleId: string; filmId: string; sessionId?: string; generation?: number; english: string; japanese: string; romaji: string; start: number; end: number; confidence: number; source: "whisper" | "subtitle-file" | "cache"; }

export type RuntimeMessage =
  | { type: "ENSURE_CONTENT"; tabId: number }
  | { type: "DIAGNOSTICS"; tabId?: number }
  | { type: "GET_STATE"; tabId?: number }
  | { type: "START_LIVE"; tabId: number; settings: Settings }
  | { type: "LOAD_FILE"; tabId: number; text: string; filename: string; settings: Settings }
  | { type: "PICK_SUBTITLE"; tabId: number }
  | { type: "STOP"; tabId?: number }
  | { type: "DETECT"; backendReachable?: boolean }
  | { type: "LIVE_SESSION"; sessionId: string; settings: Settings }
  | { type: "IMPORT_SUBTITLES"; text: string; filename: string; settings: Settings }
  | { type: "SETTINGS_UPDATED"; settings: Settings }
  | { type: "CONTENT_STOP" }
  | { type: "BEGIN_PICK_SUBTITLE" }
  | { type: "SUBTITLE_EVENT"; event: SubtitleEvent }
  | { type: "ROMANIZE"; text: string }
  | { type: "CAPTURE_SYNC"; sessionId: string; mediaTime: number; generation: number; paused: boolean; playbackRate: number; discontinuity?: boolean }
  | { type: "OFFSCREEN_START"; streamId: string; sessionId: string }
  | { type: "OFFSCREEN_STOP" }
  | { type: "OFFSCREEN_SYNC"; sessionId: string; mediaTime: number; generation: number; paused: boolean; playbackRate: number; discontinuity?: boolean }
  | { type: "ALIGNED_RESULT"; result: AlignedSubtitle }
  | { type: "CAPTURE_STATE"; sessionId?: string; state: RuntimeState["phase"]; detail?: string; code?: ErrorCode; bufferedAudioSeconds?: number; audioSecondsSent?: number; captureStatus?: string; streamStatus?: string; modelState?: string; queueDepth?: number }
  | { type: "REPLAY" };
