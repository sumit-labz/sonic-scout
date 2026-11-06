import { describe, expect, it } from "vitest";
import { itemToSound as archiveItem } from "../server/providers/archive";
import { itemToSound as freesoundItem } from "../server/providers/freesound";
import { audioToSound } from "../server/providers/openverse";
import { isAllowedAudioHost } from "../server/providers/registry";
import { pageToSound } from "../server/providers/wikimedia";

describe("Wikimedia mapping", () => {
  const page = (title: string, mime = "audio/wav", licence = "CC BY 4.0") => ({
    title,
    imageinfo: [
      {
        url: "https://upload.wikimedia.org/x.wav?utm_source=commons",
        descriptionurl: "https://commons.wikimedia.org/wiki/File:x.wav",
        size: 1000,
        duration: 5,
        mime,
        extmetadata: {
          LicenseShortName: { value: licence },
          LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0" },
          Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Ana">Ana</a>' },
        },
      },
    ],
  });

  it("keeps the original and strips HTML from the creator", () => {
    const sound = pageToSound(page("File:Heart beat.wav"), "Commons")!;
    expect(sound.title).toBe("Heart beat");
    expect(sound.creator).toBe("Ana");
    expect(sound.original).toMatchObject({ available: true, lossless: true, filename: "Heart beat.wav" });
    expect(sound.previewUrl).not.toContain("utm_source");
  });

  it("skips MIDI and word pronunciations", () => {
    expect(pageToSound(page("File:Tune.mid", "audio/midi"), "Commons")).toBeNull();
    expect(pageToSound(page("File:LL-Q1860 (eng)-Ana-bell.wav"), "Commons")).toBeNull();
    expect(pageToSound(page("File:En-us-bell.ogg"), "Commons")).toBeNull();
  });

  it("flags a name and URL that disagree", () => {
    expect(pageToSound(page("File:x.wav", "audio/wav", "CC BY-NC 4.0"), "Commons")!.licence.code).toBe("unknown");
  });
});

describe("Openverse mapping", () => {
  const item = {
    id: "abc",
    title: "School Bell",
    foreign_landing_url: "https://freesound.org/people/x/sounds/1",
    url: "https://cdn.freesound.org/previews/1/1-hq.mp3",
    creator: "x",
    creator_url: null,
    license: "by",
    license_version: "4.0",
    license_url: "https://creativecommons.org/licenses/by/4.0/",
    filetype: "mp3",
    filesize: 1,
    duration: 7798,
    tags: [{ name: "bell" }],
  };

  it("converts milliseconds and is honest that the file is a preview", () => {
    const sound = audioToSound(item, "Openverse");
    expect(sound.durationSec).toBeCloseTo(7.798);
    expect(sound.original.available).toBe(false);
    expect(sound.licence.code).toBe("cc-by");
    expect(sound.attribution).toContain("CC BY 4.0");
  });
});

describe("Freesound mapping", () => {
  const item = {
    id: 7,
    name: "bell.wav",
    username: "ana",
    license: "Creative Commons 0",
    type: "wav",
    url: "https://freesound.org/s/7/",
    previews: { "preview-hq-mp3": "https://cdn.freesound.org/p.mp3" },
  };

  it("reports whether the original needs a login", () => {
    expect(freesoundItem(item, "Freesound", false).original.needsLogin).toBe(true);
    expect(freesoundItem(item, "Freesound", true).original).toMatchObject({ needsLogin: false, lossless: true, filename: "bell.wav" });
  });

  it("reads the licence when Freesound returns a URL", () => {
    const sound = freesoundItem({ ...item, license: "http://creativecommons.org/licenses/by-nc/4.0/" }, "Freesound", true);
    expect(sound.licence.code).toBe("cc-by-nc");
  });
});

describe("Internet Archive mapping", () => {
  const item = {
    metadata: { identifier: "beat", title: "Heartbeat", licenseurl: "http://creativecommons.org/publicdomain/zero/1.0/" },
    files: [
      { name: "beat.flac", source: "derivative", length: "33" },
      { name: "beat.mp3", source: "derivative", length: "00:33" },
      { name: "beat.wav", source: "original", length: "33.75", size: "1488568" },
    ],
  };

  it("uses the uploaded original and marks the claim unreviewed", () => {
    const sound = archiveItem(item, null, "Archive")!;
    expect(sound.original).toMatchObject({ filename: "beat.wav", lossless: true });
    expect(sound.previewFormat).toBe("mp3");
    expect(sound.licenceReview).toBe("unreviewed");
  });

  it("skips long items", () => {
    expect(archiveItem({ ...item, files: [{ name: "show.mp3", source: "original", length: "01:02:00" }] }, null, "Archive")).toBeNull();
  });
});

describe("audio proxy allowlist", () => {
  it.each(["cdn.freesound.org", "upload.wikimedia.org", "archive.org", "ia803207.us.archive.org"])("allows %s", (host) => {
    expect(isAllowedAudioHost(host)).toBe(true);
  });

  it.each(["localhost", "127.0.0.1", "169.254.169.254", "evil.test", "archive.org.evil.test"])("refuses %s", (host) => {
    expect(isAllowedAudioHost(host)).toBe(false);
  });
});
