import { describe, expect, it } from "vitest";
import { webHost } from "../shared/links";

describe("webHost", () => {
  it("names the site a sound was posted on", () => {
    expect(webHost("https://freesound.org/people/TRP/sounds/616810")).toBe("freesound.org");
    expect(webHost("https://www.nps.gov/yell/a.mp3")).toBe("nps.gov");
    expect(webHost("https://commons.wikimedia.org/wiki/File:Old_school_bell_1.ogg")).toBe("commons.wikimedia.org");
  });

  it("refuses anything that isn't a web link", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,x", "file:///c:/x", "not a url", "", null, undefined]) {
      expect(webHost(url)).toBeNull();
    }
  });
});
