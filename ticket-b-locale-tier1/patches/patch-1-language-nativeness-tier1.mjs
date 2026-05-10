#!/usr/bin/env node
/**
 * Ticket B-locale-tier1 — patch 1/2: lib/languageNativeness.ts
 *
 * Adds 11 regional-locale entries to the GUIDES map:
 *   pt-BR, pt-PT
 *   es-MX, es-AR, es-CO, es-ES
 *   zh-Hans, zh-Hant
 *   ar-EG, ar-SA, ar-MA
 *
 * Each entry follows the existing GUIDES format (string concatenation
 * with " +"). Content covers register, vocabulary differences from
 * sibling locales, adtech-vocabulary translations, market peer brands,
 * and city/currency references.
 *
 * Anchor: the closing of the GUIDES block (after sw entry, before }).
 * Strategy: insert new entries between sw and }; the existing sw entry
 * is left untouched. No em-dashes in the anchor.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/languageNativeness.ts",
);

// ─────────────────────────────────────────────────────────────────
// New regional-locale entries
// ─────────────────────────────────────────────────────────────────
//
// Each entry is the exact TypeScript string-concat block to insert
// into the GUIDES Record literal. Indentation matches the existing
// entries (2-space outer, 4-space continuation).

const NEW_ENTRIES = `
  // ── REGIONAL LOCALES (B-locale-tier1) ──────────────────────────
  // Region-aware overrides for languages that vary materially across
  // markets. The lookup at buildNativenessBlock tries the full tag
  // first (e.g. "pt-BR") and falls back to the primary subtag ("pt")
  // if no region-specific entry exists.

  "pt-BR":
    "Brazilian Portuguese (pt-BR): Moderate localization. The B2B WhatsApp register is conversational-professional, closer to Spanish-speaking LATAM than to European Portuguese. Use 'voce' (NEVER 'tu' for B2B). " +
    "KEY DIFFERENCES FROM pt-PT (use BR forms only): celular (NOT telemovel), tela (NOT ecra), arquivo (NOT ficheiro), mouse (NOT rato), onibus (NOT autocarro), trem (NOT comboio), time (NOT equipa), aplicativo / app (NOT aplicacao for the mobile app context). " +
    "ADTECH VOCABULARY: BR adtech keeps most compound terms in English. Keep in English: CPI, CPA, ROAS, DSP, MMP, LTV, KPI, lookalike, retention, cohort, in-app, fraud filtering, churn, ARPU. Localize: instalacao, conversao, criativos, segmentacao, trafego, audiencia. " +
    "CITY/MARKET REFERENCES: Sao Paulo, Rio de Janeiro, Belo Horizonte, Curitiba, Porto Alegre, Brasilia, Recife. Currency BRL (R$). Brazilian peer brands (Mercado Livre, iFood, Magalu, Lojas Renner, Americanas, Casas Bahia, Stone, PagSeguro, Nubank, XP Inc, B3). " +
    "TONE: Casual but professional. Avoid Iberian formality ('Prezado Senhor', 'Estimado'). Standard 'Ola {NAME},' is right for WhatsApp. Use BR-localized verb forms throughout.",

  "pt-PT":
    "European Portuguese (pt-PT; covers also Angola and Mozambique B2B): Moderate localization. B2B register is more formal than BR. Use 'voce' (formal) or 'o senhor / a senhora' depending on hierarchy. NEVER use BR forms. " +
    "KEY DIFFERENCES FROM pt-BR (use PT forms only): telemovel (NOT celular), ecra (NOT tela), ficheiro (NOT arquivo), rato (NOT mouse), autocarro (NOT onibus), comboio (NOT trem), equipa (NOT time), aplicacao (for mobile app). " +
    "ADTECH VOCABULARY: PT B2B localizes more than BR. Translate: conversao, segmentacao, instalacao, retencao, trafego, criativos, audiencia, anuncios, leiloes / pujas, editor / publicador. Keep ONLY acronyms in English: CPI, CPA, ROAS, DSP, MMP, LTV, KPI, SDK. Less English-tolerance than Brazilian B2B. " +
    "CITY/MARKET REFERENCES: Lisboa, Porto, Coimbra, Braga, Faro. Currency EUR. Iberian peer brands (Continente, Worten, El Corte Ingles, Pingo Doce, Jumbo, Galp, EDP, MEO, NOS). " +
    "TONE: More formal than BR; standard 'Ola {NAME},' works for WhatsApp; body uses formal verb forms ('voce' or 'o senhor / a senhora'). Avoid Brazilian colloquialisms.",

  "es-MX":
    "Mexican Spanish (es-MX; covers also GT): Moderate localization with strong English tolerance in adtech. B2B WhatsApp register: 'usted' for cold outreach, 'tu' acceptable once warm. " +
    "KEY VOCABULARY: computadora (NOT ordenador), celular (NOT movil), carro (NOT coche), platicar / hablar. Avoid Iberian 'vosotros'. " +
    "ADTECH VOCABULARY: MX adtech is heavily English-tolerant (more than ES). Keep in English: CPI, CPA, ROAS, DSP, LTV, MMP, lookalike, cohort, in-app, retention, churn, fraud filtering. Localize: conversion, segmentacion, instalacion, trafico, creativos, audiencia. " +
    "CITY/MARKET REFERENCES: Ciudad de Mexico (CDMX), Monterrey, Guadalajara, Tijuana, Puebla, Queretaro. Currency MXN. Mexican peer brands (Mercado Libre Mexico, Liverpool, Coppel, OXXO, Walmart Mexico, Soriana, Cinepolis, Banorte, BBVA Mexico). " +
    "TONE: Standard 'Hola {NAME},' for WhatsApp; 'Buen dia' or 'Buenos dias' as more formal cold openers. Direct and warm.",

  "es-AR":
    "Argentinian / Southern Cone Spanish (es-AR; covers also CL, UY, PY, BO): Moderate localization. B2B WhatsApp register: 'usted' for cold outreach. Voseo ('vos') is informal, fine once warm but NOT for first contact. " +
    "KEY VOCABULARY: computadora (NOT ordenador), celular (NOT movil), auto (NOT coche, NOT carro), pibe / chico, 'che' (TOO INFORMAL for B2B). " +
    "ADTECH VOCABULARY: similar to MX, heavy English tolerance. Keep in English: CPI, CPA, ROAS, DSP, LTV, MMP, lookalike, cohort, in-app, retention, churn. Localize: conversion, segmentacion, instalacion, trafico, creativos. " +
    "CITY/MARKET REFERENCES: Buenos Aires (CABA), Cordoba, Rosario, Mendoza, La Plata; Santiago de Chile, Valparaiso; Montevideo; Asuncion; La Paz, Santa Cruz. Currency ARS, CLP, UYU, PYG, BOB. Regional peer brands (Mercado Libre, Globant, Despegar, Falabella, Cencosud, Tiendamia, Naranja, Rappi). " +
    "TONE: Standard 'Hola {NAME},' works. Avoid 'che' and informal voseo conjugations ('vos sos', 'vos podes') for cold messages.",

  "es-CO":
    "Colombian / Northern LATAM Spanish (es-CO; covers also PE, EC, VE): Moderate localization with high politeness register. B2B WhatsApp uses 'usted' even with established colleagues. More formal than other LATAM markets. " +
    "KEY VOCABULARY: computador (masculine, NOT computadora as in MX), celular, parcero / amigo, 'cordial saludo' (typical formal opener). " +
    "ADTECH VOCABULARY: similar English tolerance to other LATAM. Keep in English: CPI, CPA, ROAS, DSP, LTV, MMP, lookalike, cohort, in-app, retention. Localize: conversion, segmentacion, instalacion, trafico, creativos. " +
    "CITY/MARKET REFERENCES: Bogota, Medellin, Cali, Cartagena, Barranquilla; Lima, Arequipa, Trujillo; Quito, Guayaquil; Caracas, Maracaibo. Currency COP, PEN, USD (Ecuador uses USD). Regional peer brands (Rappi, Falabella Colombia, Mercado Libre, Bancolombia, Davivienda, Grupo Exito, Tiendas D1, Avianca). " +
    "TONE: More formal than other LATAM. Acceptable openers: 'Hola {NAME},' or 'Cordial saludo {NAME},'. Use 'usted' verb forms throughout.",

  "es-ES":
    "Iberian Spanish (es-ES): Heavy localization. B2B register: 'usted' (formal) or 'tu' (modern professional, common in tech B2B). 'Vosotros' is plural informal (Spain-only, never LATAM). " +
    "KEY VOCABULARY: ordenador (NOT computadora), movil (NOT celular), coche (NOT carro), vosotros (plural informal), tio / chaval (informal, avoid for B2B). " +
    "ADTECH VOCABULARY: ES localizes more than LATAM. Translate: conversion, segmentacion, instalacion, retencion, trafico, creativos / piezas creativas, audiencia, puja, editor / publicador. Use 'dentro de la app' or 'en la aplicacion' (NOT 'in-app' as compound). Keep ONLY acronyms: CPI, CPA, ROAS, DSP, LTV, MMP, KPI, SDK, OEM. Do NOT add Spanish plural 's' to acronyms ('CPAs' is WRONG, use invariable 'CPA'). " +
    "CITY/MARKET REFERENCES: Madrid, Barcelona, Valencia, Sevilla, Bilbao, Malaga, Zaragoza. Currency EUR. Spanish peer brands (Mercadona, Inditex / Zara, El Corte Ingles, Glovo, Cabify, Wallapop, Idealista, Telefonica / Movistar, BBVA, Santander, CaixaBank). " +
    "TONE: Standard 'Hola {NAME},' for WhatsApp; 'Buenos dias' for more formal openers.",

  "zh-Hans":
    "Simplified Chinese (zh-Hans; for Mainland China and Singapore): HEAVY localization in 简体字 / Simplified Chinese script. EVERY character used in the message MUST be a Simplified character. Traditional characters MUST NOT appear, ever. " +
    "SCRIPT-SPECIFIC VOCABULARY (Simplified ONLY, never Traditional 繁體 forms): 软件 (NOT 軟體), 网络 (NOT 網絡), 数据 (NOT 資料), 视频 (NOT 影片 / 視頻), 程序 (NOT 程式), 信息 (NOT 資訊), 用户 (NOT 使用者), 搜索 (NOT 搜尋), 服务 (NOT 服務), 设置 (NOT 設定), 优化 (NOT 優化), 网站 (NOT 網站). " +
    "MANDATORY ADTECH TRANSLATIONS: 留存 / 用户留存 (retention), 转化 (conversion), 获客 (acquisition), 流量 (traffic), 素材 / 创意素材 (creatives), 反作弊 / 防欺诈 (fraud filtering), 受众 / 目标人群 (audience), 竞价 (bid), 投放 (campaign serving), 发布商 / 媒体方 (publisher), 竞价前 (pre-bid), 归因后 (post-attribution), 相似受众 (lookalike), 群组 / 同期群 (cohort), 应用内 (in-app), 地域定向 / 地理定向 (geo-targeting), 筛选 (screening), 留存用户 (retained user), 付费用户 (payer). " +
    "Keep ONLY pure acronyms in English: CPI, CPA, ROAS, DSP, LTV, D7, MMP, KPI, A/B, OEM, SDK. Nothing else stays in English. " +
    "SCRIPT-MIXING IS FORBIDDEN: NEVER write English directly adjacent to Chinese characters. 'pre-bid筛选' WRONG, write '竞价前筛选'. 'cohort异常' WRONG, write '群组异常'. 'lookalike定向' WRONG, write '相似受众定向'. 'post-attribution验证' WRONG, write '归因后验证'. " +
    "CITY/MARKET REFERENCES: 北京 (Beijing), 上海 (Shanghai), 深圳 (Shenzhen), 广州 (Guangzhou), 杭州 (Hangzhou), 成都 (Chengdu); 新加坡 (Singapore). Currency RMB (¥), SGD (S$). Mainland peer brands (淘宝 Taobao, 京东 JD, 拼多多 Pinduoduo, 美团 Meituan, 抖音 Douyin, 微信 WeChat, 支付宝 Alipay, 滴滴 Didi, 网易 NetEase, 字节跳动 ByteDance). " +
    "TONE: 您好 register only for cold B2B; never 你好 alone. Avoid Cantonese vocabulary.",

  "zh-Hant":
    "Traditional Chinese (zh-Hant; for Taiwan, Hong Kong, Macau): HEAVY localization in 繁體字 / Traditional Chinese script. EVERY character used in the message MUST be a Traditional character. Simplified characters MUST NOT appear, ever. " +
    "SCRIPT-SPECIFIC VOCABULARY (Traditional ONLY, never Simplified 简体 forms): 軟體 (NOT 软件), 網絡 / 網路 (NOT 网络), 資料 (NOT 数据), 影片 / 視頻 (NOT 视频), 程式 (NOT 程序), 資訊 (NOT 信息), 使用者 (NOT 用户), 搜尋 (NOT 搜索), 服務 (NOT 服务), 設定 (NOT 设置), 最佳化 (NOT 优化), 網站 (NOT 网站). " +
    "MANDATORY ADTECH TRANSLATIONS: 留存 / 留存率 (retention), 轉換 (conversion), 獲客 (acquisition), 流量 (traffic), 素材 / 創意素材 (creatives), 反詐欺 / 防詐騙 (fraud filtering), 受眾 / 目標族群 (audience), 競價 (bid), 投放 (campaign serving), 發布商 / 媒體方 (publisher), 競價前 (pre-bid), 歸因後 (post-attribution), 相似受眾 (lookalike), 同期群 (cohort), 應用程式內 (in-app), 地理定向 (geo-targeting), 篩選 (screening). " +
    "Keep ONLY pure acronyms in English: CPI, CPA, ROAS, DSP, LTV, D7, MMP, KPI, A/B, OEM, SDK. Nothing else stays in English. " +
    "SCRIPT-MIXING IS FORBIDDEN: NEVER write English directly adjacent to Traditional Chinese characters. 'pre-bid篩選' WRONG, write '競價前篩選'. 'cohort分析' WRONG, write '同期群分析'. " +
    "CITY/MARKET REFERENCES: 台北 (Taipei), 新北 (New Taipei), 高雄 (Kaohsiung), 台中 (Taichung), 桃園 (Taoyuan); 香港 (Hong Kong), 九龍 (Kowloon), 新界 (New Territories), 澳門 (Macau). Currency TWD (NT$), HKD (HK$), MOP (Macanese pataca). Regional peer brands (蝦皮 Shopee Taiwan, momo購物網, PChome, 露天拍賣, 中華電信 Chunghwa Telecom; 屈臣氏 Watsons, 港鐵 MTR, AIA 友邦保險, 滙豐 HSBC). " +
    "TONE: 您好 register only for cold B2B. Hong Kong B2B may include occasional Cantonese-flavored phrasing but the message body should still be MSC (Modern Standard Chinese) in Traditional script.",

  "ar-EG":
    "Egyptian Arabic / MSA (ar-EG): For B2B WhatsApp, write in Modern Standard Arabic (MSA / فُصحى). Egyptian colloquial (عامية) is too casual for cold outreach. Egyptian MSA register is somewhat more relaxed than Gulf MSA. " +
    "KEY ARABIC ADTECH VOCABULARY: التحويل (conversion), التثبيت (install), الاستهداف (targeting), الجمهور المستهدف (audience), حركة المرور / الزيارات (traffic), الإبداعات / المواد الإبداعية (creatives), الناشر (publisher), داخل التطبيق (in-app), المزايدة / العطاءات (bid), إعادة الاستهداف (retargeting), التجزئة (segmentation), الاحتفاظ بالعملاء (retention), التسويق بالعمولة (CPA / affiliate). " +
    "Keep ONLY acronyms in English: CPI, CPA, ROAS, DSP, LTV, D7, MMP, KPI, A/B, OEM, SDK. " +
    "CITY/MARKET REFERENCES: القاهرة (Cairo), الإسكندرية (Alexandria), الجيزة (Giza), شرم الشيخ (Sharm El Sheikh). Currency EGP (ج.م.). Egyptian peer brands (Talabat Egypt, Vodafone Egypt, Jumia Egypt, Souq.com, B.TECH, Carrefour Egypt, Orange Egypt, Etisalat Misr, Banque Misr, NBE National Bank of Egypt). " +
    "GREETING: Both 'مرحبا {NAME}،' and the more formal 'السلام عليكم {NAME}،' are acceptable. Egypt is more religiously plural than Gulf, so the secular 'مرحبا' is the safer default for unknown recipients. " +
    "SCRIPT-MIXING: Latin acronyms hyphenated to Arabic words are acceptable ('CPI-اقتصادي'); full English words next to Arabic are not. Watch RTL/LTR rendering in WhatsApp.",

  "ar-SA":
    "Gulf Arabic / MSA (ar-SA; covers Saudi Arabia, UAE, Qatar, Kuwait, Bahrain, Oman): For B2B WhatsApp, write in Modern Standard Arabic (MSA / فُصحى). Gulf B2B is the most formal Arabic register, full MSA throughout, no dialect. " +
    "KEY ARABIC ADTECH VOCABULARY: التحويل (conversion), التثبيت (install), الاستهداف (targeting), الجمهور المستهدف (audience), حركة المرور (traffic), المواد الإبداعية (creatives), الناشر (publisher), داخل التطبيق (in-app), المزايدة (bid), إعادة الاستهداف (retargeting), التجزئة (segmentation), الاحتفاظ بالعملاء (retention). " +
    "Keep ONLY acronyms in English: CPI, CPA, ROAS, DSP, LTV, D7, MMP, KPI, A/B, OEM, SDK. Less French loanword tolerance than Maghreb. " +
    "CITY/MARKET REFERENCES: الرياض (Riyadh), جدة (Jeddah), الدمام (Dammam), مكة (Mecca), المدينة (Medina); دبي (Dubai), أبو ظبي (Abu Dhabi), الشارقة (Sharjah); الدوحة (Doha); الكويت (Kuwait City); المنامة (Manama); مسقط (Muscat). Currency SAR (ر.س.), AED (د.إ.), QAR, KWD, BHD, OMR. Gulf peer brands (noon, Talabat, Careem, Hungerstation, Jahez, STC, Etisalat, du, Mobily, Almarai, Al Rajhi Bank, Emirates NBD, Carrefour Gulf, Lulu Hypermarket). " +
    "GREETING: 'السلام عليكم {NAME}،' is the standard formal Gulf B2B opener. 'مرحبا {NAME}،' is acceptable but less common in cold outreach. " +
    "SCRIPT-MIXING: Latin acronyms hyphenated to Arabic words are acceptable; full English words next to Arabic are not.",

  "ar-MA":
    "Maghrebi Arabic / MSA (ar-MA; covers Morocco, Algeria, Tunisia): For B2B WhatsApp, write in MSA but heavy French loanwords are normal and expected. Code-switching with French is the business norm in Maghreb, even in MSA-written messages. " +
    "ARABIC + FRENCH VOCABULARY: Arabic adtech terms work (التحويل, التثبيت, الاستهداف, الجمهور المستهدف) but French equivalents are equally accepted ('le marketing', 'la conversion', 'le ciblage', 'l'audience', 'le publisher'). Mixing French nouns into Arabic sentences is standard ('استهداف l'audience cible'). " +
    "Keep acronyms in English: CPI, CPA, ROAS, DSP, LTV, D7, MMP, KPI, A/B, OEM, SDK. " +
    "CITY/MARKET REFERENCES: الدار البيضاء / Casablanca, الرباط / Rabat, فاس / Fes, مراكش / Marrakech, طنجة / Tangier; الجزائر / Algiers, وهران / Oran, قسنطينة / Constantine; تونس / Tunis, صفاقس / Sfax. Currency MAD (Morocco), DZD (Algeria), TND (Tunisia). Maghrebi peer brands (Jumia Maroc, Avito.ma, Marjane, Inwi, Maroc Telecom / IAM, Attijariwafa Bank; Ouedkniss, Djezzy, Mobilis; Tunisie Telecom, Ooredoo, Carrefour Tunisie). " +
    "GREETING: 'مرحبا {NAME}،' or 'السلام عليكم {NAME}،'. French openers ('Bonjour {NAME},') are also acceptable in business contexts where French is the working language. " +
    "SCRIPT-MIXING: Latin/French words next to Arabic are MORE TOLERATED here than in other Arabic markets, but be consistent (do not mix English/French/Arabic randomly within one sentence). " +
    "TONE: Less formal than Gulf, more formal than Egypt.",
`;

// ─── Edit — insert new entries before closing }; of GUIDES ───────
//
// Anchor: the last entry (sw) plus the closing };. Replace with the
// same content + new entries inserted before the closing.
const E_OLD = `  sw:
    "Swahili (sw): English-heavy for adtech. Keep ALL technical terms " +
    "in English: pre-bid, post-attribution, lookalike, in-app, cohort, " +
    "geo-targeting, publisher. Write structural grammar in Swahili.",
};`;

const E_NEW = `  sw:
    "Swahili (sw): English-heavy for adtech. Keep ALL technical terms " +
    "in English: pre-bid, post-attribution, lookalike, in-app, cohort, " +
    "geo-targeting, publisher. Write structural grammar in Swahili.",
${NEW_ENTRIES}};`;

const E_MARKER = `// ── REGIONAL LOCALES (B-locale-tier1)`;

// ─── applyEdit ───────────────────────────────────────────────────

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
  return count;
}

function applyEdit(label, source, oldStr, newStr, marker) {
  const m = countOccurrences(source, marker);
  const o = countOccurrences(source, oldStr);
  if (m > 0) { console.log(`[${label}] SKIP — already applied`); return { source, ok: true }; }
  if (o === 0) { console.log(`[${label}] NOOP — anchor not found`); return { source, ok: false }; }
  if (o > 1) { console.log(`[${label}] FAIL — anchor matched ${o} times`); return { source, ok: false }; }
  console.log(`[${label}] APPLY`);
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try { source = readFileSync(FILE, "utf8"); }
catch (err) { console.error(`[FATAL] cannot read ${FILE}: ${err.message}`); process.exit(2); }

const r = applyEdit("guides-tier1", source, E_OLD, E_NEW, E_MARKER);
if (!r.ok) process.exit(3);
source = r.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  markerPresent: countOccurrences(source, "// ── REGIONAL LOCALES (B-locale-tier1)") === 1,
  ptBR: countOccurrences(source, `"pt-BR":`) === 1,
  ptPT: countOccurrences(source, `"pt-PT":`) === 1,
  esMX: countOccurrences(source, `"es-MX":`) === 1,
  esAR: countOccurrences(source, `"es-AR":`) === 1,
  esCO: countOccurrences(source, `"es-CO":`) === 1,
  esES: countOccurrences(source, `"es-ES":`) === 1,
  zhHans: countOccurrences(source, `"zh-Hans":`) === 1,
  zhHant: countOccurrences(source, `"zh-Hant":`) === 1,
  arEG: countOccurrences(source, `"ar-EG":`) === 1,
  arSA: countOccurrences(source, `"ar-SA":`) === 1,
  arMA: countOccurrences(source, `"ar-MA":`) === 1,
  ptOriginalIntact: countOccurrences(source, `pt:\n    "Portuguese (pt):`) === 1,
  esOriginalIntact: countOccurrences(source, `es:\n    "Spanish (es):`) === 1,
  zhOriginalIntact: countOccurrences(source, `zh:\n    "Chinese (zh):`) === 1,
  arOriginalIntact: countOccurrences(source, `ar:\n    "Arabic (ar):`) === 1,
  swStillPresent: source.includes(`Write structural grammar in Swahili.`),
};
console.log("[language-nativeness-tier1] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[language-nativeness-tier1] FAIL"); process.exit(4);
}
console.log("[language-nativeness-tier1] DONE");
