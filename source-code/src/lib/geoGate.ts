/**
 * Geo gate. Restricts WhatsApp outreach to the allowed market list:
 * Brazil, LATAM, India, Southeast Asia. Ported verbatim from the old
 * WhatsApp Prospector codebase, with these adaptations:
 *
 *   - The original imported ALLOWED_COUNTRIES, ALLOWED_PHONE_PREFIXES,
 *     isAllowedCountry, and isAllowedPhone from a shared/types module
 *     that does not exist in this repo. Those values are inlined here
 *     so this file is self-contained.
 *   - Adds three exports the chat followuper adapter needs:
 *       isAllowedPhone(phone) -> boolean
 *       detectCountry(phone)  -> string | null
 *       countryToLanguage(c)  -> string | null
 *     The first two preserve the original allowed-list semantics. The
 *     diagnostic prefix table extends detectCountry so blocked phones
 *     can still surface a useful country code on GeoGateBlockedError
 *     (the integration test relies on +971 resolving to "AE").
 *   - TypeScript strict adaptations: explicit return types throughout,
 *     readonly tuples for the prefix tables.
 */

export const ALLOWED_COUNTRIES: Record<string, string> = {
  BR: "Brazil",
  MX: "Mexico",
  AR: "Argentina",
  CO: "Colombia",
  CL: "Chile",
  PE: "Peru",
  EC: "Ecuador",
  UY: "Uruguay",
  PY: "Paraguay",
  BO: "Bolivia",
  VE: "Venezuela",
  CR: "Costa Rica",
  PA: "Panama",
  GT: "Guatemala",
  HN: "Honduras",
  SV: "El Salvador",
  NI: "Nicaragua",
  DO: "Dominican Republic",
  IN: "India",
  TH: "Thailand",
  VN: "Vietnam",
  PH: "Philippines",
  ID: "Indonesia",
  MY: "Malaysia",
  SG: "Singapore",
  MM: "Myanmar",
  KH: "Cambodia",
  LA: "Laos",
};

/**
 * Allowed phone prefixes. Each tuple is [prefix, ISO 3166-1 alpha-2, name].
 * Verbatim from the old prospector. Dominican Republic shares +1 with the
 * NANP, so it is intentionally absent from this list (DO is allowed by
 * country code only; the phone-prefix tables exclude DO).
 */
export const ALLOWED_PHONE_PREFIXES: ReadonlyArray<readonly [string, string, string]> = [
  ["+55", "BR", "Brazil"],
  ["+52", "MX", "Mexico"],
  ["+54", "AR", "Argentina"],
  ["+57", "CO", "Colombia"],
  ["+56", "CL", "Chile"],
  ["+51", "PE", "Peru"],
  ["+593", "EC", "Ecuador"],
  ["+598", "UY", "Uruguay"],
  ["+595", "PY", "Paraguay"],
  ["+591", "BO", "Bolivia"],
  ["+58", "VE", "Venezuela"],
  ["+506", "CR", "Costa Rica"],
  ["+507", "PA", "Panama"],
  ["+502", "GT", "Guatemala"],
  ["+504", "HN", "Honduras"],
  ["+503", "SV", "El Salvador"],
  ["+505", "NI", "Nicaragua"],
  ["+91", "IN", "India"],
  ["+66", "TH", "Thailand"],
  ["+84", "VN", "Vietnam"],
  ["+63", "PH", "Philippines"],
  ["+62", "ID", "Indonesia"],
  ["+60", "MY", "Malaysia"],
  ["+65", "SG", "Singapore"],
  ["+95", "MM", "Myanmar"],
  ["+855", "KH", "Cambodia"],
  ["+856", "LA", "Laos"],
];

/**
 * Blocked-country prefix table used ONLY to surface a country code on
 * GeoGateBlockedError when isAllowedPhone returns false. Never used to
 * grant access. Covers the common prefixes a sales rep is likely to
 * paste in by accident. Unknown phones still resolve to null.
 */
const DIAGNOSTIC_PHONE_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ["+971", "AE"],
  ["+972", "IL"],
  ["+966", "SA"],
  ["+974", "QA"],
  ["+965", "KW"],
  ["+973", "BH"],
  ["+968", "OM"],
  ["+962", "JO"],
  ["+961", "LB"],
  ["+20", "EG"],
  ["+27", "ZA"],
  ["+234", "NG"],
  ["+254", "KE"],
  ["+212", "MA"],
  ["+213", "DZ"],
  ["+216", "TN"],
  ["+44", "GB"],
  ["+353", "IE"],
  ["+33", "FR"],
  ["+49", "DE"],
  ["+34", "ES"],
  ["+39", "IT"],
  ["+351", "PT"],
  ["+31", "NL"],
  ["+32", "BE"],
  ["+41", "CH"],
  ["+43", "AT"],
  ["+45", "DK"],
  ["+46", "SE"],
  ["+47", "NO"],
  ["+358", "FI"],
  ["+48", "PL"],
  ["+420", "CZ"],
  ["+30", "GR"],
  ["+90", "TR"],
  ["+7", "RU"],
  ["+380", "UA"],
  ["+86", "CN"],
  ["+852", "HK"],
  ["+886", "TW"],
  ["+81", "JP"],
  ["+82", "KR"],
  ["+61", "AU"],
  ["+64", "NZ"],
  ["+1", "US"],
];

export function isAllowedCountry(countryCode: string): boolean {
  return countryCode.toUpperCase() in ALLOWED_COUNTRIES;
}

export function isAllowedPhone(phone: string): boolean {
  const cleaned = phone.replace(/[^0-9+]/g, "");
  return ALLOWED_PHONE_PREFIXES.some(([prefix]) => cleaned.startsWith(prefix));
}

export interface GeoCheckResult {
  allowed: boolean;
  country: string;
  countryName: string;
  reason?: string;
}

export function checkCountryAllowed(countryCode: string): GeoCheckResult {
  const upper = countryCode.toUpperCase();
  if (isAllowedCountry(upper)) {
    return {
      allowed: true,
      country: upper,
      countryName: ALLOWED_COUNTRIES[upper],
    };
  }
  return {
    allowed: false,
    country: upper,
    countryName: upper,
    reason: `Country ${upper} is not in the WhatsApp-allowed market list. Allowed: Brazil, LATAM, India, Southeast Asia.`,
  };
}

export function checkPhoneAllowed(phone: string): GeoCheckResult {
  if (isAllowedPhone(phone)) {
    const country = detectCountryFromPhone(phone);
    return {
      allowed: true,
      country: country.code,
      countryName: country.name,
    };
  }
  return {
    allowed: false,
    country: "UNKNOWN",
    countryName: "Unknown",
    reason: `Phone ${phone.substring(0, 5)}*** does not match allowed country prefixes. WhatsApp outreach restricted to Brazil, LATAM, India, Southeast Asia.`,
  };
}

function detectCountryFromPhone(phone: string): { code: string; name: string } {
  const cleaned = phone.replace(/[^0-9+]/g, "");
  const sorted = [...ALLOWED_PHONE_PREFIXES].sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [prefix, code, name] of sorted) {
    if (cleaned.startsWith(prefix)) {
      return { code, name };
    }
  }
  return { code: "UNKNOWN", name: "Unknown" };
}

/**
 * Resolve a phone to an ISO country code. Tries the allowed-prefix
 * table first, then the diagnostic table. Returns null when no prefix
 * matches. The diagnostic fallback exists so blocked phones still
 * surface a usable country code for error reporting.
 */
export function detectCountry(phone: string): string | null {
  const cleaned = phone.replace(/[^0-9+]/g, "");

  const allowedSorted = [...ALLOWED_PHONE_PREFIXES].sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [prefix, code] of allowedSorted) {
    if (cleaned.startsWith(prefix)) {
      return code;
    }
  }

  const diagSorted = [...DIAGNOSTIC_PHONE_PREFIXES].sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [prefix, code] of diagSorted) {
    if (cleaned.startsWith(prefix)) {
      return code;
    }
  }

  return null;
}

export function normalizeCountryCode(apolloCountry: string): string {
  const map: Record<string, string> = {
    brazil: "BR",
    brasil: "BR",
    mexico: "MX",
    "méxico": "MX",
    argentina: "AR",
    colombia: "CO",
    chile: "CL",
    peru: "PE",
    "perú": "PE",
    ecuador: "EC",
    uruguay: "UY",
    paraguay: "PY",
    bolivia: "BO",
    venezuela: "VE",
    "costa rica": "CR",
    panama: "PA",
    "panamá": "PA",
    guatemala: "GT",
    honduras: "HN",
    "el salvador": "SV",
    nicaragua: "NI",
    "dominican republic": "DO",
    "república dominicana": "DO",
    india: "IN",
    thailand: "TH",
    vietnam: "VN",
    "viet nam": "VN",
    philippines: "PH",
    indonesia: "ID",
    malaysia: "MY",
    singapore: "SG",
    myanmar: "MM",
    burma: "MM",
    cambodia: "KH",
    laos: "LA",
    us: "US",
    usa: "US",
    "united states": "US",
    uk: "GB",
    "united kingdom": "GB",
    israel: "IL",
    germany: "DE",
    france: "FR",
    japan: "JP",
    "south korea": "KR",
  };

  const lower = (apolloCountry || "").toLowerCase().trim();
  if (lower.length <= 3) return lower.toUpperCase();
  return map[lower] || apolloCountry.toUpperCase().substring(0, 2);
}

const LANGUAGE_BY_COUNTRY: Record<string, string> = {
  BR: "pt",
  MX: "es",
  AR: "es",
  CO: "es",
  CL: "es",
  PE: "es",
  EC: "es",
  UY: "es",
  PY: "es",
  BO: "es",
  VE: "es",
  CR: "es",
  PA: "es",
  GT: "es",
  HN: "es",
  SV: "es",
  NI: "es",
  DO: "es",
  IN: "en",
  TH: "th",
  VN: "vi",
  PH: "en",
  ID: "id",
  MY: "en",
  SG: "en",
  MM: "my",
  KH: "km",
  LA: "en",
};

export function getLanguageForCountry(countryCode: string): string {
  return LANGUAGE_BY_COUNTRY[countryCode.toUpperCase()] || "en";
}

/**
 * Same as getLanguageForCountry but returns null for unknown countries
 * instead of the "en" fallback. Use this when callers need to distinguish
 * "we know this country speaks English" from "we have no idea".
 */
export function countryToLanguage(countryCode: string): string | null {
  return LANGUAGE_BY_COUNTRY[countryCode.toUpperCase()] ?? null;
}