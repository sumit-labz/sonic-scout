import { describe, expect, it } from "vitest";
import { FAMILIES, HOSTS, INSTRUMENTS, KITS, LEFT_OUT, RIGHTS } from "../shared/instruments";

describe("instrument catalogue", () => {
  it("has unique ids", () => {
    expect(new Set(INSTRUMENTS.map((item) => item.id)).size).toBe(INSTRUMENTS.length);
  });

  it("files every instrument under a known family, host and rights level", () => {
    const families = new Set(FAMILIES.map((family) => family.id));
    for (const item of INSTRUMENTS) {
      expect(families.has(item.family), item.id).toBe(true);
      expect(HOSTS[item.host], item.id).toBeTruthy();
      expect(RIGHTS[item.rights], item.id).toBeTruthy();
    }
  });

  it("links only over https", () => {
    for (const item of INSTRUMENTS) {
      expect(item.url, item.id).toMatch(/^https:\/\//);
      if (item.image) expect(item.image, item.id).toMatch(/^https:\/\//);
    }
  });

  it("gives every family something to show", () => {
    for (const family of FAMILIES) expect(INSTRUMENTS.some((item) => item.family === family.id), family.id).toBe(true);
  });

  it("builds every kit from instruments in the catalogue", () => {
    const ids = new Set(INSTRUMENTS.map((item) => item.id));
    for (const kit of KITS) for (const part of kit.parts) expect(ids.has(part.id), kit.id + ": " + part.id).toBe(true);
  });

  it("keeps out what was rejected for licence or price", () => {
    const names = INSTRUMENTS.map((item) => item.name.toLowerCase());
    for (const banned of ["ob-xd", "keyzone classic", "attic grand", "obelisk"]) expect(names).not.toContain(banned);
    expect(LEFT_OUT.length).toBeGreaterThan(0);
  });
});
