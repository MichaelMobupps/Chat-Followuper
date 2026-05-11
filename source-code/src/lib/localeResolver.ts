/**
 * Locale resolution: combine prospect country + language into a BCP 47
 * locale tag suitable for region-aware nativeness/greeting lookups.
 *
 * TICKET: B-locale-plumbing
 *
 * The chat-followuper's stored `language` field is typically ISO 639-1
 * only (e.g. "pt", "es", "zh"). The country is stored separately. For
 * region-sensitive verticals (Portuguese, Spanish, Chinese, Arabic,
 * English, French, German), we need the locale tag to differentiate:
 *   - Brazilian vs European Portuguese (pt-BR vs pt-PT)
 *   - Mexican vs Argentinian vs Spanish Spanish (es-MX vs es-AR vs es-ES)
 *   - Simplified vs Traditional Chinese (zh-Hans vs zh-Hant)
 *   - Egyptian vs Saudi vs Maghrebi Arabic (ar-EG vs ar-SA vs ar-MA)
 *   - Indian vs US vs UK English (en-IN vs en-US vs en-GB)
 *
 * resolveLocale combines country + language into the most accurate
 * BCP 47 tag we can compose. Downstream nativeness/greeting lookups
 * (in `languageNativeness.ts` and `messagePrompts.ts`) then try the
 * full tag first and fall back to the primary subtag if no
 * region-specific guide exists.
 *
 * This file is plumbing only. The per-locale CONTENT (the pt-BR vs
 * pt-PT nativeness guides, the es-MX vs es-ES greeting differences,
 * the zh-Hans vs zh-Hant vocabulary tables) is added in a follow-up
 * ticket (B-locale-tier1). Until that ticket lands, all lookups fall
 * through to the existing primary-subtag entries — i.e. behavior is
 * identical to today.
 *
 * Pure functions. No side effects.
 */

// ─────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────

/**
 * Combine country + language into a BCP 47 locale tag.
 *
 *   - Both empty → ""
 *   - Language only → primary language tag (e.g. "es")
 *   - Country only → "" (we cannot infer language from country alone here;
 *                        upstream pipeline owns language detection)
 *   - Both present, language already has region/script → return language
 *                                                       normalized
 *   - Both present, country maps the language to a region → composed tag
 *   - Both present, no mapping → bare primary language
 *
 * Examples:
 *   resolveLocale("Brazil", "pt") → "pt-BR"
 *   resolveLocale("Portugal", "pt") → "pt-PT"
 *   resolveLocale("China", "zh") → "zh-Hans"
 *   resolveLocale("Taiwan", "zh") → "zh-Hant"
 *   resolveLocale("Hong Kong", "zh") → "zh-Hant"
 *   resolveLocale("Mexico", "es") → "es-MX"
 *   resolveLocale("India", "en") → "en-IN"
 *   resolveLocale("Brazil", "pt-BR") → "pt-BR" (language already specifies)
 *   resolveLocale("Brazil", "en") → "en-US" (English in BR markets defaults
 *                                            to en-US adtech idioms)
 *   resolveLocale("Greece", "fr") → "fr" (French in Greece, no mapping)
 *   resolveLocale("", "ja") → "ja"
 *   resolveLocale("Japan", "") → ""
 */
export function resolveLocale(
  country: string | null | undefined,
  language: string | null | undefined,
): string {
  const lang = (language ?? "").trim();
  const ctry = (country ?? "").trim();

  if (!lang) return "";

  // Language already has region/script info — normalize and return as-is.
  if (lang.includes("-") || lang.includes("_")) {
    return normalizeTag(lang);
  }

  const primary = lang.toLowerCase();
  if (!ctry) return primary;

  const isoCountry = normalizeCountry(ctry);
  if (!isoCountry) return primary;

  // Region-aware lookup.
  const variant = LOCALE_TABLE[primary]?.[isoCountry];
  if (variant) return variant;

  return primary;
}

/**
 * Get the primary language subtag from a locale tag.
 *
 *   primarySubtag("pt-BR")     → "pt"
 *   primarySubtag("zh-Hans")   → "zh"
 *   primarySubtag("zh-Hant-TW") → "zh"
 *   primarySubtag("en")        → "en"
 *   primarySubtag("EN_US")     → "en"
 *   primarySubtag("")          → ""
 */
export function primarySubtag(localeTag: string | null | undefined): string {
  const raw = (localeTag ?? "").trim();
  if (!raw) return "";
  const primary = raw.split(/[-_]/)[0].toLowerCase();
  if (!/^[a-z]{2,3}$/.test(primary)) return "";
  return primary;
}

/**
 * Normalize a language tag to canonical BCP 47 case:
 *   - Primary subtag lowercase
 *   - Script subtag (4 letters) Title Case
 *   - Region subtag (2 letters or 3 digits) UPPERCASE
 *
 *   normalizeTag("EN_US")        → "en-US"
 *   normalizeTag("zh-hans-tw")   → "zh-Hans-TW"
 *   normalizeTag("PT-br")        → "pt-BR"
 *   normalizeTag("ja")           → "ja"
 */
export function normalizeTag(tag: string): string {
  const parts = (tag ?? "").trim().split(/[-_]/);
  const primary = parts[0]?.toLowerCase() ?? "";
  if (!primary) return "";
  if (parts.length === 1) return primary;

  const out: string[] = [primary];
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    if (/^[A-Za-z]{4}$/.test(p)) {
      // Script subtag: Title Case
      out.push(p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
    } else if (/^[A-Za-z]{2}$/.test(p) || /^\d{3}$/.test(p)) {
      // Region subtag: UPPERCASE
      out.push(p.toUpperCase());
    } else {
      // Variant or extension: lowercase
      out.push(p.toLowerCase());
    }
  }
  return out.join("-");
}

// ─────────────────────────────────────────────────────────────────
// Country normalization
// ─────────────────────────────────────────────────────────────────
//
// Maps free-text country values (Apollo data, SDR pastes) to ISO 3166-1
// alpha-2 codes. Curated for the ~70 countries with significant MobUpps
// prospect volume; case-insensitive; tolerates common variants and the
// most common non-English forms. Returns "" for unknown values so the
// resolver falls back to the bare primary language.

const COUNTRY_TO_ISO2: Record<string, string> = {
  // Americas
  argentina: "AR",
  ar: "AR",
  bolivia: "BO",
  brazil: "BR",
  brasil: "BR",
  br: "BR",
  canada: "CA",
  ca: "CA",
  chile: "CL",
  cl: "CL",
  colombia: "CO",
  co: "CO",
  ecuador: "EC",
  guatemala: "GT",
  mexico: "MX",
  méxico: "MX",
  mx: "MX",
  paraguay: "PY",
  peru: "PE",
  perú: "PE",
  pe: "PE",
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  "u.s.a.": "US",
  "u.s.": "US",
  us: "US",
  uruguay: "UY",
  venezuela: "VE",

  // Europe — Iberian, Latin
  portugal: "PT",
  pt: "PT",
  spain: "ES",
  españa: "ES",
  es: "ES",
  france: "FR",
  fr: "FR",
  italy: "IT",
  italia: "IT",
  it: "IT",

  // Europe — Germanic + Low Countries
  germany: "DE",
  deutschland: "DE",
  de: "DE",
  austria: "AT",
  österreich: "AT",
  at: "AT",
  switzerland: "CH",
  schweiz: "CH",
  suisse: "CH",
  ch: "CH",
  netherlands: "NL",
  "the netherlands": "NL",
  nl: "NL",
  belgium: "BE",
  belgië: "BE",
  belgique: "BE",
  be: "BE",
  luxembourg: "LU",
  lu: "LU",

  // Europe — Nordics + UK + Ireland
  "united kingdom": "GB",
  uk: "GB",
  "great britain": "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  gb: "GB",
  ireland: "IE",
  ie: "IE",
  sweden: "SE",
  se: "SE",
  norway: "NO",
  no: "NO",
  denmark: "DK",
  dk: "DK",
  finland: "FI",
  fi: "FI",
  iceland: "IS",
  is: "IS",

  // Europe — East
  poland: "PL",
  pl: "PL",
  "czech republic": "CZ",
  czechia: "CZ",
  cz: "CZ",
  romania: "RO",
  ro: "RO",
  hungary: "HU",
  hu: "HU",
  greece: "GR",
  gr: "GR",
  bulgaria: "BG",
  bg: "BG",
  serbia: "RS",
  croatia: "HR",
  slovenia: "SI",
  slovakia: "SK",
  russia: "RU",
  "russian federation": "RU",
  ru: "RU",
  ukraine: "UA",
  ua: "UA",
  belarus: "BY",
  turkey: "TR",
  türkiye: "TR",
  tr: "TR",

  // Asia — East
  china: "CN",
  "people's republic of china": "CN",
  prc: "CN",
  cn: "CN",
  taiwan: "TW",
  tw: "TW",
  "republic of china": "TW",
  "hong kong": "HK",
  hk: "HK",
  macau: "MO",
  macao: "MO",
  mo: "MO",
  japan: "JP",
  jp: "JP",
  "south korea": "KR",
  korea: "KR",
  "republic of korea": "KR",
  kr: "KR",

  // Asia — South
  india: "IN",
  in: "IN",
  pakistan: "PK",
  pk: "PK",
  bangladesh: "BD",
  bd: "BD",
  "sri lanka": "LK",
  lk: "LK",
  nepal: "NP",

  // Asia — Southeast
  indonesia: "ID",
  id: "ID",
  malaysia: "MY",
  my: "MY",
  singapore: "SG",
  sg: "SG",
  philippines: "PH",
  ph: "PH",
  thailand: "TH",
  th: "TH",
  vietnam: "VN",
  "viet nam": "VN",
  vn: "VN",

  // Middle East
  "saudi arabia": "SA",
  sa: "SA",
  "united arab emirates": "AE",
  uae: "AE",
  ae: "AE",
  qatar: "QA",
  qa: "QA",
  kuwait: "KW",
  kw: "KW",
  bahrain: "BH",
  bh: "BH",
  oman: "OM",
  om: "OM",
  jordan: "JO",
  lebanon: "LB",
  egypt: "EG",
  eg: "EG",
  morocco: "MA",
  ma: "MA",
  algeria: "DZ",
  dz: "DZ",
  tunisia: "TN",
  tn: "TN",
  israel: "IL",
  il: "IL",
  iran: "IR",
  ir: "IR",
  iraq: "IQ",

  // Africa
  "south africa": "ZA",
  za: "ZA",
  kenya: "KE",
  ke: "KE",
  nigeria: "NG",
  ng: "NG",
  tanzania: "TZ",
  tz: "TZ",
  ethiopia: "ET",
  ghana: "GH",
  uganda: "UG",
  angola: "AO",
  mozambique: "MZ",

  // Oceania
  australia: "AU",
  au: "AU",
  "new zealand": "NZ",
  nz: "NZ",
};

function normalizeCountry(country: string): string {
  const cleaned = country.toLowerCase().trim().replace(/\s+/g, " ");
  return COUNTRY_TO_ISO2[cleaned] ?? "";
}

// ─────────────────────────────────────────────────────────────────
// Locale table — primary language × ISO-2 country → BCP 47 tag
// ─────────────────────────────────────────────────────────────────
//
// Two-level lookup: LOCALE_TABLE[primaryLanguage][iso2Country] → full tag.
// If the entry is missing, resolveLocale falls back to the bare primary
// subtag.
//
// PHILOSOPHY ON GROUPING: where two countries share the same dialect at
// the level of B2B adtech writing, they map to the SAME locale tag (e.g.
// Bolivia/Chile/Paraguay/Uruguay all map to es-AR — they share rioplatense
// and Southern Cone register more closely than they share Iberian or
// Mexican register). This keeps the tier1 content table to a manageable
// 4-5 Spanish locales rather than 20.

const LOCALE_TABLE: Record<string, Record<string, string>> = {
  // ── Portuguese ────────────────────────────────────────────────
  pt: {
    BR: "pt-BR",
    PT: "pt-PT",
    AO: "pt-PT", // Angola: PT-aligned in B2B register
    MZ: "pt-PT", // Mozambique: PT-aligned in B2B register
  },

  // ── Spanish ───────────────────────────────────────────────────
  // Group reasoning above. 4 buckets: MX, ES, AR (Southern Cone),
  // CO (northern LATAM).
  es: {
    AR: "es-AR",
    BO: "es-AR",
    CL: "es-AR",
    PY: "es-AR",
    UY: "es-AR",
    CO: "es-CO",
    EC: "es-CO",
    PE: "es-CO",
    VE: "es-CO",
    ES: "es-ES",
    GT: "es-MX",
    MX: "es-MX",
  },

  // ── Chinese ───────────────────────────────────────────────────
  // Split is by SCRIPT, not region. Mainland + Singapore → Simplified;
  // Taiwan + Hong Kong + Macau → Traditional.
  zh: {
    CN: "zh-Hans",
    SG: "zh-Hans",
    HK: "zh-Hant",
    MO: "zh-Hant",
    TW: "zh-Hant",
  },

  // ── Arabic ────────────────────────────────────────────────────
  // 3 buckets: EG (Egypt — relaxed MSA), SA (Gulf — formal MSA),
  // MA (Maghreb — French-influenced).
  ar: {
    EG: "ar-EG",
    AE: "ar-SA",
    BH: "ar-SA",
    KW: "ar-SA",
    OM: "ar-SA",
    QA: "ar-SA",
    SA: "ar-SA",
    DZ: "ar-MA",
    MA: "ar-MA",
    TN: "ar-MA",
  },

  // ── English ───────────────────────────────────────────────────
  en: {
    GB: "en-GB",
    IE: "en-GB", // Ireland: GB-aligned in B2B register
    AU: "en-GB", // Australia: closer to en-GB than en-US in B2B
    NZ: "en-GB",
    ZA: "en-GB",
    IN: "en-IN",
    PK: "en-IN",
    BD: "en-IN",
    LK: "en-IN",
    US: "en-US",
    CA: "en-US", // Canadian B2B largely en-US in adtech
    BE: "en-BE", // Belgium: English as neutral lingua franca in B2B tech (BE-Flemish vs BE-Walloon split)
    NL: "en-NL", // Netherlands: tech B2B defaults to English; bare nl remains fallback for explicit Dutch contexts
    AE: "en-AE", // UAE: English-default B2B; ar-SA via ar block remains for Arabic-language prospects
    SG: "en-SG", // Singapore: English official business language; zh-Hans via zh block remains for Chinese-language prospects
  },

  // ── French ────────────────────────────────────────────────────
  fr: {
    CA: "fr-CA",
    FR: "fr-FR",
    BE: "fr-FR",
    CH: "fr-FR",
    LU: "fr-FR",
    MA: "fr-FR", // French in Morocco — Maghreb pattern
    DZ: "fr-FR",
    TN: "fr-FR",
  },

  // ── German ────────────────────────────────────────────────────
  de: {
    DE: "de-DE",
    AT: "de-AT",
    CH: "de-CH",
    LU: "de-DE",
  },

  // ── Hindi ─────────────────────────────────────────────────────
  // India is the only major Hindi B2B adtech market. Pakistan and
  // Nepal use Urdu and Nepali respectively in business contexts.
  hi: {
    IN: "hi-IN",
  },

  // ── Bengali ───────────────────────────────────────────────────
  // Two distinct markets that differ materially in vocabulary, peer
  // brands, and English code-mixing intensity: Bangladesh (bn-BD)
  // and India / West Bengal (bn-IN). Both default to the formal
  // আপনি (apni) verb form for B2B; bn-BD is somewhat less English-
  // heavy than bn-IN in everyday register.
  bn: {
    BD: "bn-BD",
    IN: "bn-IN",
  },

  // ── Japanese ──────────────────────────────────────────────────
  // Japan is the only major Japanese B2B adtech market. No other
  // country has commercial Japanese-language B2B volume.
  ja: {
    JP: "ja-JP",
  },

  // ── Korean ────────────────────────────────────────────────────
  // South Korea is the only major Korean B2B adtech market. North
  // Korea has no commercial B2B market access. Korean diaspora
  // markets (Korean-speakers in US, Japan, China) communicate in
  // their host-country language for B2B, not Korean.
  ko: {
    KR: "ko-KR",
  },

  // ── Hebrew ────────────────────────────────────────────────────
  // Israel is the only major Hebrew B2B adtech market. Hebrew is
  // not used in business contexts outside Israel; diaspora Jewish
  // communities communicate in their host-country language for B2B.
  he: {
    IL: "he-IL",
  },

  // ── Turkish ───────────────────────────────────────────────────
  // Turkey is the primary Turkish B2B adtech market. Turkish is
  // also spoken in Cyprus and parts of the Balkans, but those are
  // not commercial B2B targets for mobile adtech.
  tr: {
    TR: "tr-TR",
  },

  // ── Italian ───────────────────────────────────────────────────
  // Italy is the primary Italian B2B adtech market. Italian-speaking
  // Switzerland (Ticino) and San Marino are too small to warrant
  // separate adtech buckets; Italian-speakers in those markets
  // resolve to it-IT by default which is correct for B2B register.
  it: {
    IT: "it-IT",
  },

  // ── Polish ────────────────────────────────────────────────────
  // Poland is the only major Polish B2B adtech market. Polish is
  // spoken in diaspora communities but those are not commercial
  // B2B adtech targets.
  pl: {
    PL: "pl-PL",
  },

  // ── Russian ───────────────────────────────────────────────────
  // Russia is the primary Russian B2B adtech market. Russian is
  // widely spoken in Belarus, Kazakhstan, Kyrgyzstan, and other
  // post-Soviet states; B2B Russian in those markets is register-
  // adjacent enough to RU that a single bucket suffices for adtech.
  ru: {
    RU: "ru-RU",
  },

  // ── Indonesian ────────────────────────────────────────────────
  // Indonesia is the only major Indonesian B2B adtech market.
  // Bahasa Indonesia is the formal register; Malay (ms) is a
  // separate language with its own register and is routed
  // separately when present. Indonesian-speaking diaspora
  // communities are not commercial B2B adtech targets.
  id: {
    ID: "id-ID",
  },

  // ── Ukrainian ─────────────────────────────────────────────────
  // Ukraine is the only major Ukrainian B2B adtech market. The
  // Ukrainian diaspora in Poland and elsewhere uses host-country
  // languages for B2B; Ukrainian B2B adtech is concentrated in
  // Ukraine itself plus a growing Lviv-IT remote-work footprint.
  uk: {
    UA: "uk-UA",
  },

  // ── Czech ─────────────────────────────────────────────────────
  // Czech Republic / Czechia is the only major Czech B2B adtech
  // market. Czech is a separate language from Slovak (sk) and the
  // two should not be bundled despite mutual intelligibility; B2B
  // norms differ meaningfully.
  cs: {
    CZ: "cs-CZ",
  },

  // ── Romanian ──────────────────────────────────────────────────
  // Romania is the primary Romanian B2B adtech market. Moldova
  // (ro-MD) is technically Romanian-speaking but its adtech market
  // is too small to warrant a separate bucket; falls back to bare ro.
  ro: {
    RO: "ro-RO",
  },

  // ── Hungarian ─────────────────────────────────────────────────
  // Hungary is the only major Hungarian B2B adtech market.
  // Hungarian-speaking minorities exist in Slovakia, Romania
  // (Transylvania), and Serbia (Vojvodina), but those use the
  // host-country language for B2B.
  hu: {
    HU: "hu-HU",
  },

  // ── Bulgarian ─────────────────────────────────────────────────
  // Bulgaria is the only major Bulgarian B2B adtech market.
  // Bulgarian-speaking minorities exist in Greece, North Macedonia,
  // Serbia, and Romania, but those use the host-country language
  // for B2B.
  bg: {
    BG: "bg-BG",
  },

  // ── Greek ─────────────────────────────────────────────────────
  // Greece is the primary Greek B2B adtech market. Cyprus (el-CY)
  // is technically Greek-speaking but the adtech market is too
  // small for a separate bucket; falls back to bare el for non-GR
  // contexts.
  el: {
    GR: "el-GR",
  },

  // ── Thai ──────────────────────────────────────────────────────
  // Thailand is the only major Thai B2B adtech market.
  th: {
    TH: "th-TH",
  },

  // ── Vietnamese ────────────────────────────────────────────────
  // Vietnam is the only major Vietnamese B2B market. Overseas
  // Vietnamese communities (US, Australia, Canada) use host-country
  // language for B2B.
  vi: {
    VN: "vi-VN",
  },
};
