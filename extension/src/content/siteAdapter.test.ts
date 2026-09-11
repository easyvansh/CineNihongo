import { describe, expect, it } from "vitest";
import { normalizeSubtitle, parseFilmId } from "./siteAdapter";

describe("CineJoy adapter", () => {
  it("extracts film identifiers", () => {
    expect(parseFilmId("https://cinejoy.to/watch/movie/17962")).toBe("17962");
    expect(parseFilmId("https://cinejoy.to/watch/series/17962")).toBeNull();
    expect(parseFilmId("not a url")).toBeNull();
  });

  it("normalizes subtitle text", () => {
    expect(normalizeSubtitle("  In the end,\n they're   the worst ")).toBe("In the end, they're the worst");
  });
});
