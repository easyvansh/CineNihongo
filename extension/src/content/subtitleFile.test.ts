import { describe, expect, it } from "vitest";
import { cueAt, fallbackRomanize, parseSubtitleFile } from "./subtitleFile";

describe("subtitle files", () => {
  it("rejects malformed, reversed, zero-length and nonfinite timings", () => {
    for (const timing of ['bad --> time', '00:02.000 --> 00:01.000', '00:01.000 --> 00:01.000', '00:99.000 --> 01:00.000', 'NaN --> Infinity']) {
      expect(parseSubtitleFile(`${timing}\n日本語`)).toEqual([]);
    }
  });

  it("handles BOM, CRLF, VTT settings and exclusive end times", () => {
    const cues = parseSubtitleFile('\uFEFFWEBVTT\r\n\r\nid\r\n00:01.000 --> 00:03.000 align:start\r\n日本語');
    expect(cueAt(cues, 1)?.text).toBe('日本語'); expect(cueAt(cues, 3)).toBeNull();
  });
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
