import type { RuntimeMessage } from "../shared/types";

async function ensureOffscreen() {
  const url = chrome.runtime.getURL("offscreen.html");
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT], documentUrls: [url] });
  if (!contexts.length) await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: [chrome.offscreen.Reason.USER_MEDIA], justification: "Capture user-approved tab audio for local transcription" });
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, respond) => {
  if (message.type === "CAPTURE_START") {
    (async () => {
      if (!sender.tab?.id) throw new Error("Capture must start from a CineJoy tab");
      await ensureOffscreen();
      const streamId = await new Promise<string>((resolve, reject) => {
        chrome.tabCapture.getMediaStreamId({ targetTabId: sender.tab!.id }, (id) => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message)); else resolve(id);
        });
      });
      await chrome.runtime.sendMessage({ type: "OFFSCREEN_START", streamId, sessionId: message.sessionId } satisfies RuntimeMessage);
      respond({ ok: true });
    })().catch((e) => { respond({ ok: false, error: String(e) }); });
    return true;
  }
  if (message.type === "CAPTURE_STOP") { chrome.runtime.sendMessage({ type: "OFFSCREEN_STOP" } satisfies RuntimeMessage).then(() => respond({ ok: true })); return true; }
  if (message.type === "CAPTURE_SYNC") { chrome.runtime.sendMessage({ ...message, type: "OFFSCREEN_SYNC" } satisfies RuntimeMessage).then(() => respond({ ok: true })); return true; }
  if (message.type === "ALIGNED_RESULT" || message.type === "CAPTURE_STATE") {
    chrome.tabs.query({ url: "https://cinejoy.to/watch/movie/*" }).then((tabs) => Promise.all(tabs.flatMap((tab) => tab.id ? [chrome.tabs.sendMessage(tab.id, message).catch(() => undefined)] : [])));
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "replay-dialogue") chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => tab?.id && chrome.tabs.sendMessage(tab.id, { type: "REPLAY" } satisfies RuntimeMessage));
});
