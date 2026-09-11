import { PROTOCOL_VERSION, type AlignedSubtitle, type SubtitleEvent } from "./types";

const BASE = "http://127.0.0.1:8765";

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-CineNihongo-Protocol": PROTOCOL_VERSION, ...init?.headers }
  });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

export const api = {
  health: () => json<{ status: string; model: string; device: string }>("/health"),
  startSession: (filmId: string, model: string, confidenceThreshold: number) =>
    json<{ sessionId: string }>("/api/v1/sessions", { method: "POST", body: JSON.stringify({ filmId, model, confidenceThreshold, protocolVersion: PROTOCOL_VERSION }) }),
  stopSession: (sessionId: string) => json(`/api/v1/sessions/${sessionId}`, { method: "DELETE" }),
  subtitleEvent: (event: SubtitleEvent) => json<{ accepted: boolean }>(`/api/v1/sessions/${event.sessionId}/subtitle-events`, { method: "POST", body: JSON.stringify(event) }),
  romanize: (text: string) => json<{ japanese: string; romaji: string }>("/api/v1/romanize", { method: "POST", body: JSON.stringify({ text }) }),
  results: (sessionId: string) => json<{ results: AlignedSubtitle[] }>(`/api/v1/sessions/${sessionId}/results`)
};
