import type { LicenceCode, LicenceEvidence, LicenceInfo } from "../../shared/types";

interface Terms {
  label: string;
  commercialUse: boolean;
  attributionRequired: boolean;
  shareAlike: boolean;
  noDerivatives: boolean;
}

const TERMS: Record<LicenceCode, Terms> = {
  cc0: { label: "CC0", commercialUse: true, attributionRequired: false, shareAlike: false, noDerivatives: false },
  pdm: { label: "Public domain", commercialUse: true, attributionRequired: false, shareAlike: false, noDerivatives: false },
  "cc-by": { label: "CC BY", commercialUse: true, attributionRequired: true, shareAlike: false, noDerivatives: false },
  "cc-by-sa": { label: "CC BY-SA", commercialUse: true, attributionRequired: true, shareAlike: true, noDerivatives: false },
  "cc-by-nd": { label: "CC BY-ND", commercialUse: true, attributionRequired: true, shareAlike: false, noDerivatives: true },
  "cc-by-nc": { label: "CC BY-NC", commercialUse: false, attributionRequired: true, shareAlike: false, noDerivatives: false },
  "cc-by-nc-sa": { label: "CC BY-NC-SA", commercialUse: false, attributionRequired: true, shareAlike: true, noDerivatives: false },
  "cc-by-nc-nd": { label: "CC BY-NC-ND", commercialUse: false, attributionRequired: true, shareAlike: false, noDerivatives: true },
  "sampling-plus": { label: "Sampling+", commercialUse: false, attributionRequired: true, shareAlike: false, noDerivatives: false },
  // A provider saying "commercial licence" is not proof of the terms, so it is
  // never auto-cleared. It needs its own reviewed mapping first.
  commercial: { label: "Commercial licence", commercialUse: false, attributionRequired: false, shareAlike: false, noDerivatives: false },
  personal: { label: "Personal use only", commercialUse: false, attributionRequired: false, shareAlike: false, noDerivatives: false },
  unknown: { label: "Unknown licence", commercialUse: false, attributionRequired: false, shareAlike: false, noDerivatives: false },
};

const URL_PATTERNS: Array<[RegExp, LicenceCode]> = [
  [/^creativecommons\.org\/publicdomain\/zero\/(\d\.\d)/, "cc0"],
  [/^creativecommons\.org\/publicdomain\/mark\/(\d\.\d)/, "pdm"],
  [/^creativecommons\.org\/licenses\/by\/(\d\.\d)/, "cc-by"],
  [/^creativecommons\.org\/licenses\/by-sa\/(\d\.\d)/, "cc-by-sa"],
  [/^creativecommons\.org\/licenses\/by-nd\/(\d\.\d)/, "cc-by-nd"],
  [/^creativecommons\.org\/licenses\/by-nc\/(\d\.\d)/, "cc-by-nc"],
  [/^creativecommons\.org\/licenses\/by-nc-sa\/(\d\.\d)/, "cc-by-nc-sa"],
  [/^creativecommons\.org\/licenses\/by-nc-nd\/(\d\.\d)/, "cc-by-nc-nd"],
  [/^creativecommons\.org\/licenses\/sampling\+\/(\d\.\d)/, "sampling-plus"],
];

// Whole-string matches only. "CC BY-SA 3.0, GFDL" is a multi-licence file, which
// Commons warns is unreliable, so it must fall through to unknown.
const NAME_PATTERNS: Array<[RegExp, LicenceCode]> = [
  [/^(cc0|cc-?0(\s*\d\.\d)?|creative commons 0|cc0 \d\.\d)$/i, "cc0"],
  [/^(public domain|pd|pdm|public domain mark(\s*\d\.\d)?)$/i, "pdm"],
  [/^(attribution|cc[ -]by(?:[ -](\d\.\d))?)$/i, "cc-by"],
  [/^(attribution[ -]sharealike|cc[ -]by-sa(?:[ -](\d\.\d))?)$/i, "cc-by-sa"],
  [/^(attribution[ -]noderivs|cc[ -]by-nd(?:[ -](\d\.\d))?)$/i, "cc-by-nd"],
  [/^(attribution[ -]noncommercial|cc[ -]by-nc(?:[ -](\d\.\d))?)$/i, "cc-by-nc"],
  [/^(cc[ -]by-nc-sa(?:[ -](\d\.\d))?)$/i, "cc-by-nc-sa"],
  [/^(cc[ -]by-nc-nd(?:[ -](\d\.\d))?)$/i, "cc-by-nc-nd"],
  [/^sampling\+?( plus)?$/i, "sampling-plus"],
  [/^personal(-| )use( only)?$/i, "personal"],
  [/^commercial( licen[cs]e)?$/i, "commercial"],
];

function fromUrl(raw: string | null | undefined): { code: LicenceCode; version: string | null } | null {
  if (!raw) return null;
  const clean = raw.trim().replace(/^(https?:)?\/\//i, "").replace(/^www\./i, "");
  for (const [pattern, code] of URL_PATTERNS) {
    const match = clean.match(pattern);
    if (match) return { code, version: match[1] ?? null };
  }
  return null;
}

function fromName(raw: string | null | undefined): { code: LicenceCode; version: string | null } | null {
  if (!raw) return null;
  const clean = raw.trim();
  for (const [pattern, code] of NAME_PATTERNS) {
    if (pattern.test(clean)) return { code, version: clean.match(/\d\.\d/)?.[0] ?? null };
  }
  return null;
}

export interface LicenceClaim {
  name?: string | null;
  url?: string | null;
  field: string;
  sourcePageUrl: string;
  checkedAt?: string;
}

/**
 * Turns a provider's licence fields into a verdict. Anything that does not match
 * a known licence exactly, or whose name and URL disagree, becomes "unknown".
 */
export function classifyLicence(claim: LicenceClaim): LicenceInfo {
  const urlHit = fromUrl(claim.url);
  // Freesound has been seen returning the URL in its name field.
  const nameHit = fromName(claim.name) ?? fromUrl(claim.name);
  const evidence: LicenceEvidence = {
    rawValue: [claim.name, claim.url].filter(Boolean).join(" | "),
    field: claim.field,
    sourcePageUrl: claim.sourcePageUrl,
    checkedAt: claim.checkedAt ?? new Date().toISOString(),
  };

  let code: LicenceCode = urlHit?.code ?? nameHit?.code ?? "unknown";
  let conflict: string | null = null;
  if (urlHit && nameHit && urlHit.code !== nameHit.code) {
    code = "unknown";
    conflict = `Provider says "${claim.name}" but links to ${claim.url}.`;
  }

  const terms = TERMS[code];
  const version = code === "unknown" ? null : (urlHit?.version ?? nameHit?.version ?? null);
  return {
    code,
    label: version ? `${terms.label} ${version}` : terms.label,
    version,
    url: code === "unknown" ? null : (urlHit ? claim.url!.trim() : canonicalUrl(code, version)),
    commercialUse: terms.commercialUse,
    attributionRequired: terms.attributionRequired,
    shareAlike: terms.shareAlike,
    noDerivatives: terms.noDerivatives,
    conflict,
    evidence,
  };
}

function canonicalUrl(code: LicenceCode, version: string | null): string | null {
  if (code === "cc0") return `https://creativecommons.org/publicdomain/zero/${version ?? "1.0"}/`;
  const path = code.startsWith("cc-by") ? code.slice(3) : null;
  return path && version ? `https://creativecommons.org/licenses/${path}/${version}/` : null;
}

export interface LicencePolicy {
  allowShareAlike: boolean;
}

/** The commercial gate. Returns why a licence is refused, or null if it is cleared. */
export function refusalReason(licence: LicenceInfo, policy: LicencePolicy): string | null {
  if (licence.conflict) return licence.conflict;
  if (licence.code === "unknown") return "No verifiable licence on record.";
  if (!licence.commercialUse) return `${licence.label} does not allow commercial use.`;
  if (licence.noDerivatives) return `${licence.label} forbids adaptations, which covers sound design and syncing to picture.`;
  if (licence.shareAlike && !policy.allowShareAlike) {
    return `${licence.label} allows commercial use, but ShareAlike can extend to a film the sound is synced into.`;
  }
  return null;
}

export function isCleared(licence: LicenceInfo, policy: LicencePolicy): boolean {
  return refusalReason(licence, policy) === null;
}

export function attributionLine(args: {
  title: string;
  creator: string;
  sourcePageUrl: string;
  licence: LicenceInfo;
}): string | null {
  if (!args.licence.attributionRequired) return null;
  const licence = args.licence.url ? `${args.licence.label} (${args.licence.url})` : args.licence.label;
  return `"${args.title}" by ${args.creator}, ${args.sourcePageUrl}, licensed under ${licence}.`;
}
