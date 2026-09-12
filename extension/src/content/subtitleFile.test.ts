import { describe, expect, it } from "vitest";
import { cueAt, fallbackRomanize, parseSubtitleFile } from "./subtitleFile";

describe("subtitle files", () => {
  it("parses SRT and strips markup", () => {
    const cues = parseSubtitleFile("1\n00:00:10,000 --> 00:00:12,500\n<b>ここにいる間は</b>\n\n");
    expect(cues).toEqual([{ start: 10, end: 12.5, text: "ここにいる間は" }]);
    expect(cueAt(cues, 11)?.text).toBe("ここにいる間は");
    expect(cueAt(cues, 13)).toBeNull();
  });

  it("parses WebVTT without numeric indexes", () => {
    expect(parseSubtitleFile("WEBVTT\n\n00:01.000 --> 00:03.000\nこんにちは")).toHaveLength(1);
  });

  it("provides offline kana romanization", () => {
    expect(fallbackRomanize("こんにちは")).toBe("konnichiha");
    expect(fallbackRomanize("カタカナ")).toBe("katakana");
  });
});
