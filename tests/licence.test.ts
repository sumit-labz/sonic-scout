import { describe, expect, it } from "vitest";
import { attributionLine, classifyLicence, isCleared, refusalReason } from "../server/licence/classify";

const base = { field: "test", sourcePageUrl: "https://example.org/x" };
const strict = { allowShareAlike: false };

function clearedWith(claim: { name?: string; url?: string }) {
  return isCleared(classifyLicence({ ...base, ...claim }), strict);
}

describe("classifyLicence", () => {
  it.each([
    ["https://creativecommons.org/publicdomain/zero/1.0/", "cc0", false],
    ["http://creativecommons.org/publicdomain/mark/1.0/", "pdm", false],
    ["https://creativecommons.org/licenses/by/4.0", "cc-by", true],
    ["http://creativecommons.org/licenses/by/3.0/", "cc-by", true],
    ["//creativecommons.org/licenses/by/2.0/", "cc-by", true],
  ])("reads cleared licence %s", (url, code, attribution) => {
    const licence = classifyLicence({ ...base, url });
    expect(licence.code).toBe(code);
    expect(licence.commercialUse).toBe(true);
    expect(licence.attributionRequired).toBe(attribution);
  });

  it.each([
    ["Creative Commons 0", "cc0"],
    ["Attribution", "cc-by"],
    ["Attribution NonCommercial", "cc-by-nc"],
    ["CC BY-SA 4.0", "cc-by-sa"],
    ["CC BY 4.0", "cc-by"],
    ["Public domain", "pdm"],
  ])("reads the name %s", (name, code) => {
    expect(classifyLicence({ ...base, name }).code).toBe(code);
  });

  it("keeps the raw claim as evidence", () => {
    const licence = classifyLicence({ ...base, name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0" });
    expect(licence.evidence.rawValue).toContain("CC BY 4.0");
    expect(licence.evidence.sourcePageUrl).toBe(base.sourcePageUrl);
    expect(licence.evidence.checkedAt).toBeTruthy();
  });

  it("does not mistake a lookalike domain for Creative Commons", () => {
    expect(classifyLicence({ ...base, url: "https://creativecommons.org.evil.test/licenses/by/4.0/" }).code).toBe("unknown");
    expect(classifyLicence({ ...base, url: "https://evil.test/creativecommons.org/publicdomain/zero/1.0/" }).code).toBe("unknown");
  });
});

describe("the commercial gate", () => {
  it.each([
    [{ url: "https://creativecommons.org/publicdomain/zero/1.0/" }],
    [{ url: "https://creativecommons.org/licenses/by/4.0/" }],
    [{ name: "Public domain" }],
  ])("clears %j", (claim) => {
    expect(clearedWith(claim)).toBe(true);
  });

  it.each([
    ["non-commercial", { url: "https://creativecommons.org/licenses/by-nc/4.0/" }],
    ["non-commercial share-alike", { url: "https://creativecommons.org/licenses/by-nc-sa/4.0/" }],
    ["no derivatives", { url: "https://creativecommons.org/licenses/by-nd/4.0/" }],
    ["share-alike by default", { url: "https://creativecommons.org/licenses/by-sa/4.0/" }],
    ["sampling plus", { name: "Sampling+" }],
    ["missing licence", {}],
    ["free text", { name: "royalty free, use however you like" }],
    ["a provider's bare commercial claim", { name: "Commercial licence" }],
    ["personal use", { name: "Personal use only" }],
    ["multi-licence strings", { name: "CC BY-SA 3.0, GFDL" }],
  ])("refuses %s", (_label, claim) => {
    expect(clearedWith(claim as { name?: string; url?: string })).toBe(false);
  });

  it("refuses a record whose name and URL disagree", () => {
    const licence = classifyLicence({ ...base, name: "CC0", url: "https://creativecommons.org/licenses/by-nc/4.0/" });
    expect(licence.code).toBe("unknown");
    expect(licence.conflict).toBeTruthy();
    expect(isCleared(licence, strict)).toBe(false);
  });

  it("allows share-alike only when the policy says so", () => {
    const licence = classifyLicence({ ...base, name: "CC BY-SA 4.0" });
    expect(refusalReason(licence, strict)).toMatch(/ShareAlike/);
    expect(isCleared(licence, { allowShareAlike: true })).toBe(true);
  });

  it("never lets the policy unlock non-commercial", () => {
    expect(isCleared(classifyLicence({ ...base, name: "Attribution NonCommercial" }), { allowShareAlike: true })).toBe(false);
  });
});

describe("attributionLine", () => {
  const args = { title: "Bell", creator: "Ana", sourcePageUrl: "https://example.org/x" };

  it("names the creator, source and licence for CC BY", () => {
    const licence = classifyLicence({ ...base, url: "https://creativecommons.org/licenses/by/4.0/" });
    const line = attributionLine({ ...args, licence });
    for (const part of ["Bell", "Ana", "https://example.org/x", "CC BY 4.0"]) expect(line).toContain(part);
  });

  it("is empty for CC0", () => {
    expect(attributionLine({ ...args, licence: classifyLicence({ ...base, name: "CC0" }) })).toBeNull();
  });
});
