export const PROTOCOL_VERSION = "1";

export type ProcessingMode = "delayed" | "predictive";
export type ResultSource = "whisper" | "subtitle-file" | "cache";

export interface Settings {
  showRomaji: boolean;
  showJapanese: boolean;
  showEnglish: boolean;
  debug: boolean;
  model: string;
  confidenceThreshold: number;
  processingMode: ProcessingMode;
}

export const DEFAULT_SETTINGS: Settings = {
  showRomaji: true,
  showJapanese: false,
  showEnglish: true,
  debug: false,
  model: "small",
  confidenceThreshold: 0.65,
  processingMode: "delayed"
};

export interface SubtitleEvent {
  id: string;
  sessionId: string;
  filmId: string;
  englishText: string;
  appearedAtVideoTime: number;
  disappearedAtVideoTime?: number;
  detectedAtWallClock: number;
  generation: number;
}

export interface AlignedSubtitle {
  subtitleId: string;
  filmId: string;
  english: string;
  japanese: string;
  romaji: string;
  start: number;
  end: number;
  confidence: number;
  source: ResultSource;
}

export type RuntimeMessage =
  | { type: "START"; settings: Settings }
  | { type: "STOP" }
  | { type: "STATUS" }
  | { type: "SETTINGS_UPDATED"; settings: Settings }
  | { type: "IMPORT_SUBTITLES"; text: string; filename: string }
  | { type: "CAPTURE_START"; sessionId: string }
  | { type: "CAPTURE_STOP" }
  | { type: "CAPTURE_SYNC"; mediaTime: number; generation: number; paused: boolean }
  | { type: "OFFSCREEN_START"; streamId: string; sessionId: string }
  | { type: "OFFSCREEN_STOP" }
  | { type: "OFFSCREEN_SYNC"; mediaTime: number; generation: number; paused: boolean }
  | { type: "ALIGNED_RESULT"; result: AlignedSubtitle }
  | { type: "CAPTURE_STATE"; state: string; detail?: string }
  | { type: "REPLAY" };
