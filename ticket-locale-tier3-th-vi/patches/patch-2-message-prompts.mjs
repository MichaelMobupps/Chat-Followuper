#!/usr/bin/env node
/**
 * Ticket locale-tier3-th-vi, patch 2/3: services/messagePrompts.ts
 *
 * One atomic edit: append th-TH and vi-VN entries to GREETING_TABLE,
 * after the existing el-GR entry (last tier-3 regional entry before
 * this ticket).
 *
 * Both languages have richer register / pronoun systems than the
 * existing bare th / vi entries capture. The tier-3 entries cover:
 *   - formal pronoun / greeting register layers
 *   - country-specific cities, currency, peer brands
 *   - tone notes (hierarchical for Thai, kinship-based for Vietnamese)
 *
 * Dependency: requires ticket-locale-en-be-nl to have landed.
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/messagePrompts.ts",
);

// Anchor: the closing line of the el-GR entry (last tier-3 entry).
// The closing pattern is unique: the el-GR note ends with 'shipping families for maritime."'
// followed by ` },\n};`

const E1_OLD = `  "el-GR": { withName: "Γεια σας, {NAME},", withoutName: "Γεια σας,", note: "Greece. Greek B2B uses formal εσείς (esis, plural-formal second person) register; never εσύ (esy, informal singular) for cold outreach. 'Γεια σας, {NAME},' is the standard chat opening (literally 'health to you' plural-formal); 'Αξιότιμε κύριε {LastName},' / 'Αξιότιμη κυρία {LastName},' is the most formal email-equivalent opener (gendered: κύριε = kyrie Mr. vocative, κυρία = kyria Mrs.). 'Γεια σου' (singular informal) and 'Γεια!' / 'Χαίρετε' are informal; never for cold B2B. Currency EUR (€), with European separators: '€1.234.567,89' (period thousands, comma decimal — same as Italian/German/Spanish convention). 'εκ.' (ekatommyria / millions) or 'εκατομμύρια' spelled out, 'δισ.' (disekatommyria / billions) for larger amounts. Cities: Αθήνα (Athens, the commercial / political center; ~3.1M metro Attica region — the dominant Greek city by every B2B metric; Syntagma / Kolonaki / Vouliagmenis Avenue for traditional business, Marousi for tech / multinational HQs — comparable to a CEE tech-cluster city), Θεσσαλονίκη (Thessaloniki, the second-largest city, ~325K + ~1M metro; northern Greece commercial hub; Aristotle University; growing tech), Πάτρα (Patras, ~210K, western port), Ηράκλειο (Heraklion, ~140K, Crete tourism + university), Λάρισα (Larissa, ~150K, Thessaly agriculture). Peer brands - banking tier: Eurobank Holdings (Greek-listed, the largest by various metrics; subsidiary Postbank operates in Bulgaria), National Bank of Greece / NBG (state-influenced, Greek-listed), Alpha Bank (Greek-listed), Piraeus Bank / Piraeus Financial Holdings (Greek-listed). The four 'systemic' Greek banks are these four post-crisis consolidation. Industrial / state: Public Power Corporation / PPC / ΔΕΗ (state electricity, the dominant utility), DESFA (state gas transmission), Hellenic Petroleum / ELPE (the dominant refiner), Motor Oil Hellas (second refiner), Mytilineos Energy & Metals (BVB-listed conglomerate, energy + metals + concessions). Telco: OTE / Cosmote (Hellenic Telecommunications, Deutsche Telekom-owned — the dominant fixed and mobile), Vodafone Greece (acquired Wind Hellas 2024), Nova Greece (formerly Wind, United Group). Shipping is uniquely important for Greek B2B (Greek shipping is the largest global merchant fleet by tonnage; family-owned shipping houses are major B2B references): Angelicoussis Group, Tsakos Energy Navigation, Star Bulk, Diana Shipping, Costamare. E-commerce / tech: Skroutz (the dominant Greek price-comparison + marketplace, private), e-shop.gr (electronics e-commerce), Public.gr (retail / electronics), Plaisio (electronics), Wolt Greece (Finnish), efood (delivery, OTE-acquired then Delivery Hero context). Hotels / tourism: Astir Palace, Costa Navarino, Sani Resort (Greek tourism is a major sector, ~25% of GDP including indirect). Match peer tier to company sector: banking for finance, PPC/state-industrial for traditional, OTE/Vodafone for telco, Skroutz/Public for retail-tech, shipping families for maritime." },
};`;

const E1_NEW = `  "el-GR": { withName: "Γεια σας, {NAME},", withoutName: "Γεια σας,", note: "Greece. Greek B2B uses formal εσείς (esis, plural-formal second person) register; never εσύ (esy, informal singular) for cold outreach. 'Γεια σας, {NAME},' is the standard chat opening (literally 'health to you' plural-formal); 'Αξιότιμε κύριε {LastName},' / 'Αξιότιμη κυρία {LastName},' is the most formal email-equivalent opener (gendered: κύριε = kyrie Mr. vocative, κυρία = kyria Mrs.). 'Γεια σου' (singular informal) and 'Γεια!' / 'Χαίρετε' are informal; never for cold B2B. Currency EUR (€), with European separators: '€1.234.567,89' (period thousands, comma decimal — same as Italian/German/Spanish convention). 'εκ.' (ekatommyria / millions) or 'εκατομμύρια' spelled out, 'δισ.' (disekatommyria / billions) for larger amounts. Cities: Αθήνα (Athens, the commercial / political center; ~3.1M metro Attica region — the dominant Greek city by every B2B metric; Syntagma / Kolonaki / Vouliagmenis Avenue for traditional business, Marousi for tech / multinational HQs — comparable to a CEE tech-cluster city), Θεσσαλονίκη (Thessaloniki, the second-largest city, ~325K + ~1M metro; northern Greece commercial hub; Aristotle University; growing tech), Πάτρα (Patras, ~210K, western port), Ηράκλειο (Heraklion, ~140K, Crete tourism + university), Λάρισα (Larissa, ~150K, Thessaly agriculture). Peer brands - banking tier: Eurobank Holdings (Greek-listed, the largest by various metrics; subsidiary Postbank operates in Bulgaria), National Bank of Greece / NBG (state-influenced, Greek-listed), Alpha Bank (Greek-listed), Piraeus Bank / Piraeus Financial Holdings (Greek-listed). The four 'systemic' Greek banks are these four post-crisis consolidation. Industrial / state: Public Power Corporation / PPC / ΔΕΗ (state electricity, the dominant utility), DESFA (state gas transmission), Hellenic Petroleum / ELPE (the dominant refiner), Motor Oil Hellas (second refiner), Mytilineos Energy & Metals (BVB-listed conglomerate, energy + metals + concessions). Telco: OTE / Cosmote (Hellenic Telecommunications, Deutsche Telekom-owned — the dominant fixed and mobile), Vodafone Greece (acquired Wind Hellas 2024), Nova Greece (formerly Wind, United Group). Shipping is uniquely important for Greek B2B (Greek shipping is the largest global merchant fleet by tonnage; family-owned shipping houses are major B2B references): Angelicoussis Group, Tsakos Energy Navigation, Star Bulk, Diana Shipping, Costamare. E-commerce / tech: Skroutz (the dominant Greek price-comparison + marketplace, private), e-shop.gr (electronics e-commerce), Public.gr (retail / electronics), Plaisio (electronics), Wolt Greece (Finnish), efood (delivery, OTE-acquired then Delivery Hero context). Hotels / tourism: Astir Palace, Costa Navarino, Sani Resort (Greek tourism is a major sector, ~25% of GDP including indirect). Match peer tier to company sector: banking for finance, PPC/state-industrial for traditional, OTE/Vodafone for telco, Skroutz/Public for retail-tech, shipping families for maritime." },
  "th-TH": { withName: "เรียน {NAME},", withoutName: "เรียน คุณ,", note: "Thailand. Thai B2B uses formal-respectful register throughout cold outreach. The polite particle ครับ (krap, male speaker) / ค่ะ (ka, female speaker) is essential at sentence ends in Thai B2B — drop it and the message reads rude or unfinished. Use คุณ (khun) + first name as the standard polite second-person address; Thai uses first name in formal contexts (not family name). For 'I': ผม (phom, male speaker) / ดิฉัน (dichan, formal female speaker). 'เรียน {NAME},' is the formal letter/email opener (literally 'to inform'); 'สวัสดีครับ/ค่ะ คุณ {NAME},' is the warmer chat opening; 'สวัสดีครับ/ค่ะ' alone for prospect-name-unknown. NEVER use เธอ (informal you), มึง (rude you), or กู (rude I) in B2B. Currency THB (Thai baht, ฿): '฿1,234,567.89' or '1,234,567.89 บาท' (Arabic numerals with comma thousands, period decimal — same as US/UK convention; Thai uses Thai numerals only in formal-traditional contexts). Cities: กรุงเทพมหานคร (Bangkok, the dominant commercial center; ~10M metro; Sathorn/Silom CBD for finance, Sukhumvit for tech and multinationals, Asoke/Phrom Phong/Thong Lo for premium business, Chatuchak/Lat Phrao for industrial), เชียงใหม่ (Chiang Mai, ~130K, northern Thailand, tourism + tech + university), ภูเก็ต (Phuket, ~80K, tourism + property), หาดใหญ่ (Hat Yai, ~160K, southern, trade with Malaysia), ขอนแก่น (Khon Kaen, ~115K, northeastern Isaan region commercial hub). Peer brands - banking tier: Bangkok Bank (the largest Thai bank, Bangkok-listed BBL), Kasikornbank / KBank (Bangkok-listed KBANK, the second-largest, K Plus mobile banking dominant), Siam Commercial Bank / SCB (Bangkok-listed SCB, royal-family-affiliated heritage), Krung Thai Bank / KTB (state-owned), Bank of Ayudhya / Krungsri (MUFG Japan subsidiary), TMBThanachart Bank / ttb (TMB+Thanachart merger), CIMB Thai. Conglomerates (Thai B2B is heavily conglomerate-driven; family-controlled holding groups dominate): Charoen Pokphand Group / CP (the dominant Thai conglomerate, Chearavanont family — agribusiness/CP Foods, retail/7-Eleven Thailand+Lotus's+Makro, telco/True Corporation post-2023 dtac merger; CP All is the operator; one of the largest Thai businesses globally), ThaiBev / Thai Beverage (Sirivadhanabhakdi family, Beer Chang + Mekhong + F&N regional acquisitions), Siam Cement Group / SCG (cement + chemicals + packaging, Bangkok-listed, Royal-Bureau-linked), PTT Group (state-controlled energy major, Bangkok-listed PTT/PTTEP), Central Group (Chirathivat family, Central Department Store + Robinson + Tops + Big C + central retail dominance), The Mall Group (Ampornpisit family, The Mall + Siam Paragon + Emporium). Telco (heavily consolidated post-2023): AIS / Advanced Info Service (the largest Thai mobile operator, Singtel-affiliated, Bangkok-listed ADVANC), True Corporation (CP-controlled, merged with dtac in 2023 — now combined True+dtac, the second-largest), National Telecom / NT (state-owned, formerly CAT+TOT). E-commerce / tech: Shopee Thailand (Sea Group Singapore, the dominant), Lazada Thailand (Alibaba, second), JD Central exited Thailand 2023, Central Online (Central Group), Konvy (beauty). Mobile + gaming: Garena Thailand (Sea Group), TrueID (entertainment), VGI/AIS Play. Match peer tier to company sector: bank-tier for finance, CP/ThaiBev/SCG/Central for FMCG/conglomerate, AIS/True for telco, Shopee/Lazada for e-commerce. TONE: hierarchical-respectful, indirect-polite. Thai business culture values: explicit respect via ครับ/ค่ะ + คุณ + first name throughout, saving face (กรงเเกรงใจ kreng jai — consideration for others), indirect rejection (Thai buyers often say 'we will consider' meaning no), patience (transactional speed is slower than Anglo-Saxon, relationship-building expected). NEVER use direct criticism or hard pressure; NEVER assume Anglo-Saxon directness; ALWAYS include the polite particle ครับ/ค่ะ; ALWAYS use คุณ + first name. Sign-offs: 'ขอแสดงความนับถือ' (most formal, with respect / with high regard), 'ด้วยความเคารพ' (with respect, formal-warm), 'ขอบคุณครับ/ค่ะ' (thank you, casual-warm). Adtech vocabulary stays in English (CPI, ROAS, DSP, retention, install, conversion, etc.) per existing bare th guidance; structural Thai grammar wraps the English terms." },
  "vi-VN": { withName: "Kính gửi anh/chị {NAME},", withoutName: "Kính gửi anh/chị,", note: "Vietnam. Vietnamese B2B uses kinship-based pronoun register (Vietnamese has no neutral 'you' — pronouns reflect relative age/status). For cold outreach the safe-respectful form is anh (older brother, addressing a male prospect) / chị (older sister, addressing a female prospect), with the speaker using em (younger sibling, self-reference). Never use tôi (formal-cold 'I') as the default — it reads distant; em is warmer and standard for B2B outreach where the speaker positions themselves as junior-respectful. 'Kính gửi anh/chị {Name},' is the most formal email opener (Kính gửi = 'respectfully addressed to'); 'Chào anh/chị {Name},' is the standard chat / WhatsApp opener; 'Anh/chị {Name} thân mến,' is warm-formal ('dear'). NEVER use mày (rude you), bạn (peer-friend, too casual for cold B2B), or just first name alone. Currency VND (đồng, ₫): '1.234.567 đồng' or '1.234.567 VND' (period thousands, decimals rare). Because VND amounts are large, B2B contexts commonly quote in triệu (million) or tỷ (billion): '500 triệu đồng' = 500M VND (~$20K USD), '5 tỷ đồng' = 5B VND (~$200K USD). 'tỷ' is the most common scaling word in B2B. Cities: Thành phố Hồ Chí Minh / TP.HCM (Ho Chi Minh City / Saigon, ~9M, the dominant commercial center; Quận 1 / District 1 for traditional finance, Quận 7 / Phú Mỹ Hưng for expat business and tech, Quận 2 / Thủ Đức for the new tech hub and startup scene), Hà Nội (Hanoi, ~8M, political capital + state-owned enterprise HQs + tech), Đà Nẵng (Da Nang, ~1.2M, central Vietnam, the growing tech outsourcing hub), Hải Phòng (Hai Phong, ~2M, northern port), Cần Thơ (Can Tho, ~1.3M, Mekong Delta commercial hub), Biên Hòa (Bien Hoa, ~1.2M, industrial near Ho Chi Minh City). Peer brands - banking tier: Vietcombank (the largest Vietnamese bank by various metrics, state-influenced, listed HOSE VCB), VietinBank (state-influenced, HOSE CTG), BIDV (state, HOSE BID), Agribank (state, agriculture), Techcombank (the largest private bank, HOSE TCB — Masan Group affiliated), VPBank (HOSE VPB), MB Bank (military-affiliated, HOSE MBB), ACB (Asia Commercial Bank, HOSE ACB). State-owned and state-influenced banks dominate Vietnamese finance. Conglomerates: Vingroup (the dominant Vietnamese conglomerate, Pham Nhat Vuong family, HOSE VIC — VinFast EV / Vinhomes real estate / Vinpearl tourism; the most internationally recognizable Vietnamese name), Masan Group (FMCG + retail post-VinCommerce acquisition, HOSE MSN), FPT Corporation (the largest Vietnamese tech / IT outsourcing company, HOSE FPT — competes with Indian outsourcers globally; FPT Software, FPT Telecom, FPT Retail), Hoa Phat Group (steel, HOSE HPG), Hoang Anh Gia Lai / HAGL (agriculture + sport). Telco: Viettel (military-owned, the dominant Vietnamese telco; also operates internationally in Cambodia / Laos / Myanmar / Africa), Vinaphone (state, part of VNPT), Mobifone (state). E-commerce: Shopee Vietnam (Sea Group, the dominant by GMV), Lazada Vietnam (Alibaba), Tiki (Vietnamese-founded, the largest domestic e-commerce — competing with Shopee/Lazada), Sendo (Vietnamese-founded, struggling post-acquisition discussions), TikTok Shop growing rapidly. Tech / digital-native: VNG Corporation (Vietnamese tech major — Zalo messaging dominant ~75M users, gaming, payments; the Vietnamese digital reference), FPT Software (outsourcing global), MoMo (Vietnamese e-wallet dominant, ~30M users), ZaloPay (VNG), VPBank's Cake by VPBank (digital bank), Tima (P2P), Topica/Edupia (edtech). Mobility / delivery: Grab Vietnam (Singapore, the dominant), Be Group (Vietnamese-founded mobility), Gojek Vietnam (Indonesian, exited 2024), ShopeeFood (Sea Group), Baemin Vietnam (Delivery Hero, exited 2023). Gaming: VNG Corporation (gaming + Zalo, the Vietnamese digital reference), Garena Vietnam (Sea Group, Free Fire), Funtap, NCSoft Vietnam, Tencent / Riot Games Vietnam presence. Match peer tier: state-influenced banks for finance, Vingroup/Masan/FPT for conglomerate, Viettel for telco, Shopee/Tiki for e-commerce, VNG/MoMo for tech. TONE: warm-respectful, hierarchical-via-kinship, family-pronoun-based. Vietnamese business culture values: explicit kinship register (anh/chị/em throughout), saving face (never directly criticize), relationship-first (B2B in Vietnam expects relationship-warming before transactional ask — meeting in person at coffee or meal is normal, faster than Thai but slower than Anglo-Saxon), explicit acknowledgment of mutual contacts and prior context. NEVER use direct criticism, NEVER use 'tôi' as default I-pronoun (too cold), NEVER use 'bạn' for cold B2B (too peer-friend). Sign-offs: 'Trân trọng' (most formal, 'with respect / sincerely', the standard B2B email close), 'Kính thư' (very formal, archaic email close), 'Cảm ơn anh/chị' (thank you, warmer). Adtech vocabulary stays in English (CPI, ROAS, DSP, retention, install, conversion, etc.) per existing bare vi guidance; structural Vietnamese grammar wraps the English terms — 'Em đang giúp một số DSP tăng ROAS' (I'm helping several DSPs increase ROAS) is the natural mixed register." },
};`;

const E1_MARKER = `"th-TH": { withName: "เรียน {NAME},"`;

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
  return count;
}

function applyEdit(label, source, oldStr, newStr, marker) {
  const m = countOccurrences(source, marker);
  const o = countOccurrences(source, oldStr);
  if (m > 0) { console.log(`[${label}] SKIP - already applied`); return { source, ok: true }; }
  if (o === 0) { console.log(`[${label}] NOOP - anchor not found`); return { source, ok: false }; }
  if (o > 1) { console.log(`[${label}] FAIL - anchor matched ${o} times`); return { source, ok: false }; }
  console.log(`[${label}] APPLY`);
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try { source = readFileSync(FILE, "utf8"); }
catch (err) { console.error(`[FATAL] cannot read ${FILE}: ${err.message}`); process.exit(2); }

if (!source.includes(`"en-BE": { withName: "Hi {NAME},"`) ||
    !source.includes(`"en-NL": { withName: "Hi {NAME},"`)) {
  console.error("[FATAL] this patch requires ticket-locale-en-be-nl to have landed first");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["greeting-th-vi-tier3", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  // th-TH
  thTHAdded:                source.includes(`"th-TH": { withName: "เรียน {NAME},"`),
  thTHFormalParticles:      source.includes(`polite particle ครับ (krap, male speaker) / ค่ะ (ka, female speaker)`),
  thTHPronouns:             source.includes(`ผม (phom, male speaker) / ดิฉัน (dichan, formal female speaker)`),
  thTHRejectsRude:          source.includes(`NEVER use เธอ (informal you), มึง (rude you), or กู (rude I)`),
  thTHRespectfulOpener:     source.includes(`'เรียน {NAME},'`) &&
                            source.includes(`'สวัสดีครับ/ค่ะ คุณ {NAME},'`),
  thTHTHBCurrency:          source.includes(`Currency THB (Thai baht, ฿)`) &&
                            source.includes(`'฿1,234,567.89'`),
  thTHBangkok:              source.includes(`กรุงเทพมหานคร (Bangkok, the dominant commercial center`),
  thTHChiangMai:            source.includes(`เชียงใหม่ (Chiang Mai`),
  thTHBangkokBank:          source.includes(`Bangkok Bank (the largest Thai bank`) &&
                            source.includes(`Kasikornbank / KBank`) &&
                            source.includes(`Siam Commercial Bank / SCB`),
  thTHCPGroup:              source.includes(`Charoen Pokphand Group / CP (the dominant Thai conglomerate`),
  thTHCentralGroup:         source.includes(`Central Group (Chirathivat family`),
  thTHAISTrueMerger:        source.includes(`AIS / Advanced Info Service`) &&
                            source.includes(`True Corporation (CP-controlled, merged with dtac in 2023`),
  thTHShopeeLazada:         source.includes(`Shopee Thailand (Sea Group Singapore, the dominant)`) &&
                            source.includes(`Lazada Thailand (Alibaba`),
  thTHKrengJai:             source.includes(`saving face (กรงเเกรงใจ kreng jai`),
  thTHSignoffs:             source.includes(`'ขอแสดงความนับถือ'`) && source.includes(`'ด้วยความเคารพ'`),

  // vi-VN
  viVNAdded:                source.includes(`"vi-VN": { withName: "Kính gửi anh/chị {NAME},"`),
  viVNKinshipPronouns:      source.includes(`kinship-based pronoun register`) &&
                            source.includes(`anh (older brother, addressing a male prospect) / chị (older sister`),
  viVNEmPronoun:            source.includes(`Never use tôi (formal-cold 'I') as the default`) &&
                            source.includes(`em is warmer and standard for B2B outreach`),
  viVNRespectfulOpener:     source.includes(`'Kính gửi anh/chị {Name},'`) &&
                            source.includes(`'Chào anh/chị {Name},'`),
  viVNRejectsRude:          source.includes(`NEVER use mày (rude you), bạn (peer-friend, too casual for cold B2B)`),
  viVNVNDCurrency:          source.includes(`Currency VND (đồng, ₫)`) &&
                            source.includes(`triệu (million) or tỷ (billion)`),
  viVNTPHCMQuans:           source.includes(`Thành phố Hồ Chí Minh / TP.HCM`) &&
                            source.includes(`Quận 1 / District 1`) &&
                            source.includes(`Quận 7 / Phú Mỹ Hưng`),
  viVNHanoi:                source.includes(`Hà Nội (Hanoi`),
  viVNDaNang:               source.includes(`Đà Nẵng (Da Nang`),
  viVNVietcombank:          source.includes(`Vietcombank (the largest Vietnamese bank`),
  viVNVingroup:             source.includes(`Vingroup (the dominant Vietnamese conglomerate, Pham Nhat Vuong family`),
  viVNFPT:                  source.includes(`FPT Corporation (the largest Vietnamese tech / IT outsourcing`),
  viVNViettel:              source.includes(`Viettel (military-owned, the dominant Vietnamese telco`),
  viVNTiki:                 source.includes(`Tiki (Vietnamese-founded, the largest domestic e-commerce`),
  viVNVNGZalo:              source.includes(`VNG Corporation (Vietnamese tech major — Zalo messaging dominant`),
  viVNMoMo:                 source.includes(`MoMo (Vietnamese e-wallet dominant`),
  viVNSignoffs:             source.includes(`'Trân trọng'`) && source.includes(`'Kính thư'`) &&
                            source.includes(`'Cảm ơn anh/chị'`),

  // Untouched / regression
  bareThUntouched:          source.includes(`th: { withName: "เรียน {NAME},", withoutName: "เรียน คุณ,", note: "Keep formal เรียน even on WhatsApp; Thai B2B expects this." },`),
  bareViUntouched:          source.includes(`vi: { withName: "Chào {NAME},", withoutName: "Chào anh/chị,", note: "Soft WhatsApp variant of the email's 'Kính gửi anh/chị'." },`),
  // Prior tier-3 unaffected
  elGRUntouched:            source.includes(`"el-GR": { withName: "Γεια σας, {NAME},"`),
  bgBGUntouched:            source.includes(`"bg-BG": { withName: "Здравейте, {NAME},"`),
  huHUUntouched:            source.includes(`"hu-HU": { withName: "Üdvözlöm, {NAME},"`),
  roROUntouched:            source.includes(`"ro-RO": { withName: "Bună ziua, {NAME},"`),
  csCZUntouched:            source.includes(`"cs-CZ": { withName: "Dobrý den, {NAME},"`),
  ukUAUntouched:            source.includes(`"uk-UA": { withName: "Вітаю, {NAME},"`),
  idIDUntouched:            source.includes(`"id-ID": { withName: "Selamat pagi, Bapak/Ibu {NAME},"`),
  ruRUUntouched:            source.includes(`"ru-RU": { withName: "Здравствуйте, {NAME},"`),
  itITUntouched:            source.includes(`"it-IT": { withName: "Salve {NAME},"`),
  jaJPUntouched:            source.includes(`"ja-JP": { withName: "{NAME}様、"`),
  koKRUntouched:            source.includes(`"ko-KR": { withName: "{NAME} 님,"`),
  hiINUntouched:            source.includes(`"hi-IN": { withName: "Namaste {NAME},"`),
  // en-BE / en-NL unaffected
  enBEUntouched:            source.includes(`"en-BE": { withName: "Hi {NAME},"`),
  enNLUntouched:            source.includes(`"en-NL": { withName: "Hi {NAME},"`),
  tier3HeaderIntact:        source.includes(`// ── REGIONAL LOCALES (B-locale-tier3)`),
  tier1Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier1)`),
  tier2Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier2)`),
};
console.log("[message-prompts-th-vi] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[message-prompts-th-vi] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[message-prompts-th-vi] DONE");
