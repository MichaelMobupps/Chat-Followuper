#!/usr/bin/env node
/**
 * Ticket locale-tier3-th-vi, patch 3/3: lib/languageNativeness.ts
 *
 * One atomic edit: append th-TH and vi-VN entries to the tier-3 GUIDES
 * block, after the existing el-GR entry (last tier-3 entry before this
 * ticket).
 *
 * Dependency: requires ticket-locale-en-be-nl to have landed.
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/languageNativeness.ts",
);

// Anchor: the closing line of the el-GR entry. The last sentence is
// the TONE / sign-off line, which is uniquely identifiable.
const ANCHOR_LINE = `    "TONE: warm-formal, slightly more relational than CEE; Greek B2B sits between Italian/Spanish Mediterranean warmth and Northern European formality. Greek business culture values: explicit respect via εσείς and αξιότιμε / αξιότιμη openings, personal-relationship acknowledgment (Greek B2B often references mutual contacts, past meetings, family or background context — relationship capital matters more than in Anglo-Saxon norms), and concrete numbers paired with relational warmth. Greek business is often family-owned (especially shipping, retail, tourism, traditional industrial) — acknowledging family heritage in peer references is appropriate context. Avoid hype words ('επαναστατικός' without source, 'ηγέτης της αγοράς' without numbers, 'μοναδικός') which read as advertising. Sign-offs: 'Με εκτίμηση,' (formal standard, the most common B2B sign-off — literally 'With esteem'), 'Με σεβασμό,' (more formal alternative, 'With respect'), 'Φιλικά,' ('Cordially', warmer-formal, modern), 'Καλή συνέχεια,' ('Have a good continuation', semi-formal closing-warm). Match sign-off to opening: 'Αξιότιμε κύριε / Αξιότιμη κυρία' pairs with 'Με εκτίμηση,' or 'Με σεβασμό,'; 'Γεια σας' pairs with 'Με εκτίμηση,' or 'Φιλικά,'.",`;

const NEW_ENTRIES = `

  "th-TH":
    "Thai-Thailand (th-TH): Thailand is the only major Thai B2B adtech market. The base Thai (th) guide covers English-heavy adtech vocabulary (CPI, ROAS, DSP, retention, install, conversion, targeting, traffic, fraud filtering, creatives, publisher, pre-bid, post-attribution, lookalike, in-app, cohort, geo-targeting — ALL kept in English; only structural grammar in Thai); that all still applies. This regional entry adds Thailand-specific city, currency, peer-brand, register, particle-system, and tone depth on top of the base th guide. " +
    "REGISTER LAYERS: Thai B2B uses formal-respectful register throughout cold outreach. Thai is HIGHLY hierarchical and gendered in its politeness system; getting the particles wrong reads as rude or foreign-template immediately. " +
    "POLITE PARTICLES (essential, never optional in B2B): " +
    "ครับ (krap) — used by male speakers at sentence ends. " +
    "ค่ะ (ka) — used by female speakers at sentence ends in statements. " +
    "คะ (kha) — used by female speakers at sentence ends in questions. " +
    "Drop the particle and Thai B2B reads rude / unfinished / foreign. The particle must match the SPEAKER'S gender (not the recipient's). For LLM-generated outreach where speaker gender is unknown, default to ครับ (male, the safer default in mixed-gender B2B). " +
    "PRONOUNS: " +
    "Speaker 'I' — ผม (phom, male speaker, the safe default for B2B) / ดิฉัน (dichan, formal female speaker) / ฉัน (chan, casual female speaker, acceptable in chat). NEVER use กู (gu, rude/intimate) or เรา (rao, peer-plural) in B2B. " +
    "Recipient 'you' — คุณ (khun) + first name is the standard polite B2B address. Thai uses first name in formal contexts; family name is rare in direct address. คุณ alone (without name) is acceptable when name unknown. NEVER use เธอ (ter, casual/intimate you), มึง (mueng, rude you), แก (gae, very casual you) in B2B. " +
    "GREETING REGISTERS: " +
    "'เรียน {NAME},' — most formal letter/email opener (literally 'to inform / address respectfully'). " +
    "'สวัสดีครับ/ค่ะ คุณ {NAME},' — warm-formal chat opener ('hello, Mr/Ms {NAME}'). " +
    "'สวัสดีครับ/ค่ะ' — safe default when recipient name unknown. " +
    "'หวัดดี' / 'ดีๆ' — informal-young; NEVER for cold B2B. " +
    "ORTHOGRAPHY: Thai script (Thai abugida). No spaces between words within sentences (Thai writes continuously); spaces separate clauses or sentences. No capitalization (Thai script has no upper/lower case). Numbers: Thai uses Arabic numerals in B2B (Thai numerals ๐๑๒๓๔๕๖๗๘๙ exist but are reserved for formal-traditional documents and government use; B2B uses Arabic). Latin acronyms (CPI, CPA, ROAS, DSP, LTV, MMP) embed inline within Thai sentences and read naturally. " +
    "CURRENCY: THB (Thai baht, ฿). Standard format: '฿1,234,567.89' or '1,234,567.89 บาท' (Arabic numerals, comma thousands, period decimal — same convention as US/UK). For larger amounts: 'ล้าน' (million, lan) and 'พันล้าน' (billion, pan-lan) spelled out, or numerical 'M' / 'B' suffixes in tech B2B. " +
    "CITY/MARKET REFERENCES: " +
    "กรุงเทพมหานคร (Bangkok, the capital and the dominant Thai commercial center; ~10M metropolitan area; the dominant Thai B2B destination by every metric. Sathorn / Silom for finance and corporate HQs — comparable to Singapore's CBD; Sukhumvit (Asoke / Phrom Phong / Thong Lo) for tech, multinationals, and premium business; Ratchadaphisek for newer office towers; Chatuchak / Lat Phrao for industrial; Bang Rak / Sathorn for traditional Thai-Chinese family-business HQs). " +
    "เชียงใหม่ (Chiang Mai, ~130K city + larger metro; northern Thailand; tourism + university + emerging tech / digital-nomad hub; growing remote-work and startup scene). " +
    "ภูเก็ต (Phuket, ~80K; major tourism + property; the dominant southern destination). " +
    "หาดใหญ่ (Hat Yai, ~160K; southern Thailand; trade hub with Malaysia). " +
    "ขอนแก่น (Khon Kaen, ~115K; northeastern Isaan region commercial hub; university). " +
    "ชลบุรี (Chonburi, ~200K + Eastern Economic Corridor / EEC; manufacturing + automotive — Toyota Thailand, Honda Thailand, Mazda Thailand; Pattaya tourism nearby). " +
    "PEER BRANDS by tier: " +
    "Banking tier (Thai banking is consolidated and family-influenced): Bangkok Bank / BBL (the largest Thai bank by assets, Sophonpanich family heritage, Bangkok-listed BBL), Kasikornbank / KBank (the second-largest, Lamsam family heritage, Bangkok-listed KBANK — K Plus mobile banking is the dominant Thai banking app), Siam Commercial Bank / SCB (founded 1907, royal-family-affiliated heritage, Bangkok-listed SCB — SCB EASY app), Krung Thai Bank / KTB (state-owned, Bangkok-listed KTB), Bank of Ayudhya / Krungsri (MUFG Japan subsidiary, Bangkok-listed BAY), TMBThanachart Bank / ttb (TMB + Thanachart 2021 merger, Bangkok-listed TTB), CIMB Thai (CIMB Malaysia subsidiary), United Overseas Bank Thailand / UOB Thailand (Singapore UOB subsidiary). " +
    "Conglomerates (Thai B2B is heavily conglomerate-driven; family-controlled holding groups dominate the economy and have multiple business lines): Charoen Pokphand Group / CP (the dominant Thai conglomerate, Chearavanont family, founded 1921 in Bangkok by Chinese-Thai immigrants — agribusiness via CP Foods / CP Group, retail via 7-Eleven Thailand and Tesco Lotus's and Makro acquisitions, telco via True Corporation post-2023 dtac merger, finance via SCB Securities; CP All is the operator entity; one of the largest Thai businesses globally, also major presence in China and Vietnam). " +
    "ThaiBev / Thai Beverage (Sirivadhanabhakdi family, the dominant Thai beverage conglomerate — Beer Chang, Mekhong whisky, F&N regional acquisitions, Berli Jucker; SGX-listed Y92). " +
    "Siam Cement Group / SCG (founded 1913 by royal command, cement + chemicals + packaging, Bangkok-listed SCC, the dominant Thai industrial — Royal-Bureau-linked). " +
    "PTT Group (state-controlled energy major, Bangkok-listed PTT / PTTEP / PTT Global Chemical / OR; the dominant Thai energy company). " +
    "Central Group (Chirathivat family, founded 1947 — Central Department Store + Robinson + Tops + Big C + central retail dominance across Thailand; international expansion to Vietnam, Italy via Rinascente, Germany via KaDeWe). " +
    "The Mall Group (Ampornpisit family — The Mall + Siam Paragon + EmQuartier + EmSphere + Emporium; the second-largest Thai retail / mall operator after Central). " +
    "TCC Group (Sirivadhanabhakdi family, the same family as ThaiBev — real estate / Asset World / hotels / hospitality / financial services). " +
    "Telco (Thai telco consolidated significantly in 2023 with True+dtac merger): AIS / Advanced Info Service (the largest Thai mobile operator, Singtel-affiliated, Bangkok-listed ADVANC), True Corporation (CP-controlled, merged with dtac (Telenor) in 2023 — now combined True+dtac, the second-largest by subscribers), National Telecom / NT (state-owned, formed from 2021 CAT Telecom + TOT merger). " +
    "E-commerce / digital tier: Shopee Thailand (Sea Group Singapore, the dominant Thai e-commerce by GMV), Lazada Thailand (Alibaba, second by GMV), JD Central (exited Thailand 2023, JD.com + Central Group JV ended), Central Online (Central Group), Konvy (beauty), Wongnai (food + dining listings), LineMan Wongnai (food delivery, merger 2020), foodpanda Thailand (Delivery Hero). " +
    "Mobile + gaming: Garena Thailand (Sea Group, Free Fire dominant gaming), TrueID (entertainment, True Corp), AIS Play, Tencent Thailand (PUBG Mobile, ROV / Arena of Valor partner with Garena), VGI (Out-of-home advertising, BTS Group affiliated). " +
    "Tourism / hospitality (tourism ~12% of Thai GDP pre-COVID): Thai Airways (state, recently restructured), Bangkok Airways, Minor International (Vichai Maleenont then Heinecke family — Anantara hotels, NH Hotels acquired internationally, Marriott franchise), Centara Hotels & Resorts (Central Group), Dusit Thani. " +
    "Match peer tier to prospect's company sector: banking-tier (Bangkok Bank / KBank / SCB) for finance, CP / ThaiBev / SCG / Central for FMCG / conglomerate, PTT for energy, AIS / True for telco, Shopee / Lazada for e-commerce, Garena / VNG-equivalent for gaming, Minor / Centara for tourism. " +
    "TONE: hierarchical-respectful, indirect-polite, relationship-oriented. Thai business culture values: " +
    "- Explicit respect via ครับ/ค่ะ particles + คุณ + first name throughout (NEVER drop the particles). " +
    "- กรงเเกรงใจ (kreng jai, consideration for others, avoiding causing trouble or imposing) — a core Thai business value; outreach that pushes too hard, criticizes, or assumes the prospect's time reads as foreign-template and rude. " +
    "- Saving face (เสียหน้า, sia naa, losing face) — never directly criticize, never point out errors directly, never push a prospect into a corner. Thai 'no' is often 'we will consider' (จะพิจารณา, ja pijarana) or 'it's difficult' (ลำบาก, lambak); Anglo-Saxon directness assuming yes/no reads as foreign. " +
    "- Patience and relationship-building — Thai B2B is slower than Anglo-Saxon norms; expect meetings, coffee, meals before transactional ask; explicit hard-sell in cold outreach reads as desperate. " +
    "- Hierarchy awareness — Thai business culture is strongly hierarchical; addressing a senior person (ผู้ใหญ่, phu yai) requires more deference than addressing a peer; LLM-generated outreach should default to senior-respectful register. " +
    "Avoid: direct criticism, assumed yes/no, hard pressure (limited-time offers feel pushy), Western-style 'no-brainer' hype ('ดีที่สุด' best without justification, 'อันเดียวในตลาด' unique without proof). " +
    "Sign-offs: 'ขอแสดงความนับถือ' (khor sadaeng khwam nap thu, most formal — 'with respect / with high regard'; the standard Thai B2B email close), 'ด้วยความเคารพ' (duay khwam khaorop, formal-warm — 'with respect'), 'ขอบคุณครับ/ค่ะ' (khop khun krap/ka, thank you — casual-warm for chat). Match sign-off to opening: 'เรียน {NAME},' pairs with 'ขอแสดงความนับถือ'; 'สวัสดีครับ/ค่ะ' pairs with 'ขอบคุณครับ/ค่ะ' or 'ด้วยความเคารพ'.",

  "vi-VN":
    "Vietnamese-Vietnam (vi-VN): Vietnam is the only major Vietnamese B2B market. The base Vietnamese (vi) guide covers VERY English-heavy adtech vocabulary (CPI, ROAS, DSP, retention, install, conversion, targeting, traffic, fraud filtering, creatives, bid, lookalike, A/B test, semi-exclusive inventory, publisher, pre-bid, post-attribution, in-app, cohort, geo-targeting — ALL kept in English; only structural grammar in Vietnamese); that all still applies. This regional entry adds Vietnam-specific city, currency, peer-brand, register, and uniquely-Vietnamese kinship-pronoun depth on top of the base vi guide. " +
    "REGISTER LAYERS: Vietnamese is kinship-pronoun-based — there is no neutral 'you' or 'I' in Vietnamese; pronouns reflect relative age, status, and social distance. For B2B cold outreach the standard safe-respectful pattern positions the speaker as junior-respectful (em, younger sibling) and the recipient as senior-respected (anh older brother for male, chị older sister for female). " +
    "PRONOUNS: " +
    "Speaker 'I' — em (younger sibling, the safe default for B2B cold outreach where the speaker positions themselves as respectful-junior). tôi (formal 'I') is grammatically correct but reads cold/distant in modern Vietnamese B2B and is generally avoided for outreach; tôi is appropriate for very formal contexts (legal, government, broadcast). mình (peer/casual self) is for warm relationships, not cold outreach. " +
    "Recipient 'you' — anh (older brother, addressing a male prospect, the safe default for B2B male) / chị (older sister, addressing a female prospect, the safe default for B2B female). NEVER use bạn (peer-friend, too casual for cold B2B), mày (rude you), or just first name alone. ông (sir, very formal for older male) / bà (madam, very formal for older female) are acceptable for clearly-senior prospects (60+, executives) but read overly formal for typical B2B. " +
    "When speaker AND recipient gender unknown, anh/chị (combined, addressing either) is the safe choice; em is the safe speaker-self default. " +
    "GREETING REGISTERS: " +
    "'Kính gửi anh/chị {Name},' — most formal email opener ('respectfully addressed to brother/sister {Name}'); the formal-warm standard. " +
    "'Chào anh/chị {Name},' — standard chat / WhatsApp opener ('hello brother/sister {Name}'). " +
    "'Anh/chị {Name} thân mến,' — warm-formal opener ('dear brother/sister {Name}'). " +
    "'Xin chào anh/chị {Name},' — formal-neutral ('greetings brother/sister {Name}'). " +
    "'Hi anh/chị {Name},' — English-mixed casual (acceptable in tech B2B, common in Vietnamese tech / startup contexts). " +
    "'Chào bạn' / 'Hi bạn' — NEVER for cold B2B (too peer-friendly). " +
    "ORTHOGRAPHY: Vietnamese alphabet (Latin script with extensive diacritics — ă, â, đ, ê, ô, ơ, ư plus tone marks à á ả ã ạ etc). Diacritics matter enormously: 'ma' (ghost) vs 'má' (mother / cheek) vs 'mả' (grave) vs 'mã' (horse / code) vs 'mạ' (rice seedling) are entirely different words. Latin acronyms (CPI, CPA, ROAS, DSP, LTV, MMP) embed inline within Vietnamese sentences naturally. Numbers use European convention: period as thousands separator, comma as decimal: '1.234.567,89'. " +
    "CURRENCY: VND (đồng, ₫). Standard: '1.234.567 đồng' or '1.234.567 VND' (period thousands; decimals rare since VND has no fractional unit in practice). Because VND amounts are large, B2B contexts heavily scale via triệu (million, trieu) or tỷ (billion, ty) — these are essential Vietnamese B2B scaling words. '500 triệu đồng' = 500M VND (~$20K USD), '5 tỷ đồng' = 5B VND (~$200K USD), '100 tỷ' = 100B VND (~$4M USD). For very large amounts, 'nghìn tỷ' (thousand-billion, ~trillion) is used. USD reference quotes are common in cross-border B2B. " +
    "CITY/MARKET REFERENCES: " +
    "Thành phố Hồ Chí Minh / TP.HCM (Ho Chi Minh City / Saigon — Saigon is still the commonly-used informal name; ~9M city + ~13M metro; the dominant Vietnamese commercial center by every B2B metric. Quận 1 / District 1 — Đồng Khởi / Lê Lợi / Nguyễn Huệ for traditional finance, banking HQs, and government; Quận 7 / Phú Mỹ Hưng — expat business, multinational offices, premium residential; Quận 2 / Thủ Đức — the new tech hub including District 2, District 9, Thủ Thiêm New Urban Area, Saigon Hi-Tech Park, the startup scene; Quận 3 — agency / creative; Tân Bình — airport-adjacent business). " +
    "Hà Nội (Hanoi, the political capital; ~8M; state-owned enterprise HQs, ministries, banks, telecom; Hoàn Kiếm District for traditional government and finance; Cầu Giấy / Mỹ Đình for newer offices and tech; the Vietnamese B2B context here is more state-influenced / less startup vs HCMC). " +
    "Đà Nẵng (Da Nang; ~1.2M; central Vietnam; the dominant emerging tech outsourcing hub — strong IT outsourcing / software industry; Da Nang FTZ; growing investment from FPT, KMS Technology, Axon Active). " +
    "Hải Phòng (Hai Phong; ~2M; the largest northern port; industrial, manufacturing, logistics). " +
    "Cần Thơ (Can Tho; ~1.3M; Mekong Delta agricultural commercial hub). " +
    "Biên Hòa (Bien Hoa; ~1.2M; industrial belt near HCMC). " +
    "Bình Dương (Binh Duong; ~2.5M including industrial estates; manufacturing belt north of HCMC — VSIP industrial parks). " +
    "PEER BRANDS by tier: " +
    "Banking tier (Vietnamese banking is dominated by state-influenced and SOE-affiliated banks — important context for B2B finance positioning): Vietcombank / VCB (the largest Vietnamese bank by various metrics, state-influenced, listed HOSE VCB; the Vietnamese B2B banking reference), VietinBank / CTG (state-influenced, listed HOSE CTG), BIDV (Bank for Investment and Development of Vietnam, state, listed HOSE BID), Agribank (state, agriculture-focused, the largest by deposits), Techcombank / TCB (the largest private Vietnamese bank, listed HOSE TCB — Masan Group affiliated, modern banking technology leader), VPBank / VPB (listed HOSE VPB, retail-focused, FE Credit consumer finance), MB Bank / MBB (Military Bank, military-affiliated, listed HOSE MBB), ACB / Asia Commercial Bank (listed HOSE ACB), SHB (Saigon Hanoi Bank), Sacombank / STB (listed HOSE STB), HDBank (listed HOSE HDB), TPBank (listed HOSE TPB, fintech-modern). State and state-influenced banks dominate; foreign-bank presence is HSBC, Standard Chartered, Shinhan, UOB, Public Bank. " +
    "Conglomerates (Vietnamese B2B is moderately conglomerate-driven; family-controlled and state-influenced major groups dominate): Vingroup / VIC (the dominant Vietnamese conglomerate, Pham Nhat Vuong family — the founder is Vietnam's wealthiest person; HOSE VIC; VinFast (EV, Nasdaq-listed VFS), Vinhomes (real estate, HOSE VHM), Vinpearl (tourism), VinUni / Vinschool (education); the most internationally recognizable Vietnamese name and the reference Vietnamese tech / conglomerate success story). " +
    "Masan Group / MSN (Vietnamese FMCG + retail conglomerate, Nguyen Dang Quang family — HOSE MSN; Chinsu sauces / Omachi noodles / Vinacafe; Phuc Long coffee chain; The CrownX/WinCommerce post-VinCommerce acquisition from Vingroup includes WinMart supermarkets). " +
    "FPT Corporation / FPT (the largest Vietnamese tech / IT outsourcing company, HOSE FPT — FPT Software competes globally with Indian outsourcers, FPT Telecom is a major ISP, FPT Retail / FPT Shop; the Vietnamese tech reference story). " +
    "Hoa Phat Group / HPG (the largest Vietnamese private steel producer, HOSE HPG, Tran Dinh Long family). " +
    "Hoang Anh Gia Lai / HAGL (HOSE HAG, agriculture + sport — Doan Nguyen Duc's group). " +
    "Sovico Holdings (Nguyen Thi Phuong Thao family — VietJet Air HOSE VJC, HDBank, Phu Long real estate). " +
    "Trung Nguyen Group (Dang Le Nguyen Vu family — coffee, the most internationally-known Vietnamese coffee brand). " +
    "Telco: Viettel (military-owned, the dominant Vietnamese telco by subscribers — Vietnam Ministry of National Defense; also operates internationally in Cambodia (Metfone), Laos (Unitel), Myanmar (Mytel), Mozambique (Movitel), and Africa generally; ~70M+ subscribers domestically), VNPT Group / Vinaphone (state-owned, second-largest, parent of Vinaphone mobile + VNPT-VinaPhone), MobiFone (state-owned, third), Local-Mobile / Hồng Quân Mobile (Hong Quan Mobile, smaller new entrant). " +
    "E-commerce (Vietnamese e-commerce is dominated by Shopee, with TikTok Shop rapidly growing): Shopee Vietnam (Sea Group Singapore, the dominant by GMV ~40%+), Lazada Vietnam (Alibaba, second), Tiki Corporation (Vietnamese-founded, the largest domestic — VNG-backed, struggling against Shopee but a strong Vietnamese brand), Sendo (Vietnamese-founded by FPT, struggling), TikTok Shop Vietnam (rapidly growing post-2022 launch — major B2B reference for social commerce), GrabMart, Bach Hoa Xanh (Mobile World Group's grocery chain). " +
    "Tech / digital-native: VNG Corporation (the Vietnamese tech major — Zalo messaging dominant in Vietnam with ~75M users (more than Facebook in Vietnam), VNG cloud, VNG payments / ZaloPay, ZingPlay games; the Vietnamese digital reference, planning Nasdaq listing), FPT Software (the largest Vietnamese IT services / outsourcing exporter — competes with TCS / Infosys), MoMo (the dominant Vietnamese e-wallet with ~30M users; private unicorn, Warburg Pincus / Goodwater backed), ZaloPay (VNG), Cake by VPBank (digital bank), Timo (digital banking), Tima (P2P lending), TopCV (recruitment platform), Topica / Edupia (edtech), VIB (banking-tech overlap), Be Group (Vietnamese-founded mobility, the major domestic rival to Grab). " +
    "Mobility / delivery: Grab Vietnam (Singapore, the dominant by GMV — ride-hailing + food + GrabPay), Be Group (Vietnamese-founded mobility, the major domestic challenger), Gojek Vietnam (Indonesian, exited 2024 after struggling vs Grab), ShopeeFood (Sea Group), Baemin Vietnam (Delivery Hero, exited 2023), Loship (Vietnamese-founded delivery, struggling). " +
    "Gaming: VNG Corporation (Zalo + games, the Vietnamese digital reference), Garena Vietnam (Sea Group, Free Fire — the dominant mobile game in Vietnam by MAU), Funtap, NCSoft Vietnam (Korean), Yong Joon Lee gaming, Tencent / Riot Games Vietnam (League of Legends), Mobile Vietnam contexts including SohaGame, VTCGame. " +
    "Match peer tier to prospect's company sector: state-influenced banks (Vietcombank / VietinBank / BIDV) for finance, Techcombank / VPBank for private banking, Vingroup / Masan / FPT for conglomerate, Viettel / VNPT / MobiFone for telco, Shopee / Tiki / TikTok Shop for e-commerce, VNG / MoMo / Zalo for tech / digital, Grab / Be for mobility. " +
    "TONE: warm-respectful, hierarchical-via-kinship, relationship-oriented, saving-face-aware. Vietnamese business culture values: " +
    "- Explicit kinship register (anh/chị/em throughout the message, NOT bạn or tôi). " +
    "- Saving face (giữ thể diện) — never directly criticize, never publicly contradict, never push a prospect into a corner. Vietnamese 'no' is often 'để em xem xét' (let me consider) or 'hơi khó' (a bit difficult); explicit refusal is rare. " +
    "- Relationship-first ordering — Vietnamese B2B expects relationship-warming before transactional ask. Meeting in person for cà phê (coffee) or meal is a normal first step; LLM-generated cold outreach should NOT push hard for immediate decision. Vietnamese B2B is faster than Thai but slower than Chinese / Anglo-Saxon. " +
    "- Acknowledgment of mutual contacts and prior context is high-value (Vietnamese B2B leverages relationship capital). " +
    "- Hierarchy via age/seniority — addressing a senior with anh/chị (and self-positioning as em) is respectful; addressing a clearly-junior person with em/cháu may also be appropriate but rarely needed in cold B2B. " +
    "- English code-mixing is acceptable and common in Vietnamese tech / startup B2B — 'meeting', 'deadline', 'KPI', 'team', 'pipeline' embed naturally. Adtech-specific vocabulary stays entirely English per the bare vi guide. " +
    "Avoid: direct criticism (loss of face), assumed yes/no (Vietnamese 'no' is indirect), hard sell pressure (limited-time / now-or-never feels pushy), Western-style hype ('cực kỳ' extremely without justification, 'duy nhất' unique without proof, 'cách mạng' revolutionary without source). " +
    "Sign-offs: 'Trân trọng,' (the most formal B2B email close, literally 'with respect / sincerely' — the standard Vietnamese B2B email close, used universally), 'Kính thư,' (very formal, archaic — for ceremonial contexts), 'Cảm ơn anh/chị,' (thank you brother/sister, warmer-casual for chat), 'Chúc anh/chị một ngày tốt lành,' (have a good day, warm closing). Match sign-off to opening: 'Kính gửi anh/chị' pairs with 'Trân trọng'; 'Chào anh/chị' pairs with 'Trân trọng' or 'Cảm ơn anh/chị'.",`;

const E1_OLD = ANCHOR_LINE;
const E1_NEW = ANCHOR_LINE + NEW_ENTRIES;
const E1_MARKER = `"th-TH":\n    "Thai-Thailand (th-TH):`;

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

if (!source.includes(`"en-BE":\n    "Belgian English`) ||
    !source.includes(`"en-NL":\n    "Dutch B2B in English`)) {
  console.error("[FATAL] this patch requires ticket-locale-en-be-nl to have landed first");
  console.error("[FATAL] missing expected en-BE / en-NL entries in GUIDES");
  process.exit(5);
}
if (!source.includes(`"el-GR":\n    "Greek-Greece (el-GR):`)) {
  console.error("[FATAL] missing expected el-GR entry in GUIDES (anchor)");
  process.exit(5);
}

const r = applyEdit("guides-th-vi-append", source, E1_OLD, E1_NEW, E1_MARKER);
if (!r.ok) process.exit(3);
source = r.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  // th-TH
  thTHAdded:                source.includes(`"th-TH":\n    "Thai-Thailand (th-TH):`),
  thTHParticleSystem:       source.includes(`ครับ (krap) — used by male speakers at sentence ends`) &&
                            source.includes(`ค่ะ (ka) — used by female speakers at sentence ends`) &&
                            source.includes(`คะ (kha) — used by female speakers at sentence ends in questions`),
  thTHMaleDefault:          source.includes(`default to ครับ (male, the safer default in mixed-gender B2B)`),
  thTHSpeakerPronouns:      source.includes(`ผม (phom, male speaker`) &&
                            source.includes(`ดิฉัน (dichan, formal female speaker)`),
  thTHRecipientPronoun:     source.includes(`คุณ (khun) + first name is the standard polite B2B address`),
  thTHRejectsRude:          source.includes(`NEVER use เธอ (ter, casual/intimate you), มึง (mueng, rude you)`),
  thTHGreetingHierarchy:    source.includes(`'เรียน {NAME},'`) &&
                            source.includes(`'สวัสดีครับ/ค่ะ คุณ {NAME},'`),
  thTHNoSpacesNoCase:       source.includes(`No spaces between words within sentences`) &&
                            source.includes(`No capitalization (Thai script has no upper/lower case)`),
  thTHTHBCurrency:          source.includes(`CURRENCY: THB (Thai baht, ฿)`) &&
                            source.includes(`'฿1,234,567.89'`),
  thTHBangkok:              source.includes(`กรุงเทพมหานคร (Bangkok`) &&
                            source.includes(`Sathorn / Silom for finance`) &&
                            source.includes(`Sukhumvit (Asoke / Phrom Phong / Thong Lo) for tech`),
  thTHChonburiEEC:          source.includes(`ชลบุรี (Chonburi`) &&
                            source.includes(`Eastern Economic Corridor / EEC`),
  thTHBankTier:             source.includes(`Bangkok Bank / BBL (the largest Thai bank`) &&
                            source.includes(`Kasikornbank / KBank`) &&
                            source.includes(`Siam Commercial Bank / SCB`),
  thTHCPGroup:              source.includes(`Charoen Pokphand Group / CP (the dominant Thai conglomerate, Chearavanont family`),
  thTHThaiBev:              source.includes(`ThaiBev / Thai Beverage (Sirivadhanabhakdi family`),
  thTHSCG:                  source.includes(`Siam Cement Group / SCG`) &&
                            source.includes(`Royal-Bureau-linked`),
  thTHCentralGroup:         source.includes(`Central Group (Chirathivat family`),
  thTHTrueDtacMerger:       source.includes(`True Corporation (CP-controlled, merged with dtac (Telenor) in 2023`),
  thTHShopeeLazada:         source.includes(`Shopee Thailand (Sea Group Singapore, the dominant Thai e-commerce`) &&
                            source.includes(`Lazada Thailand (Alibaba`),
  thTHKrengJai:             source.includes(`กรงเเกรงใจ (kreng jai, consideration for others`),
  thTHFaceSaving:           source.includes(`Saving face (เสียหน้า, sia naa, losing face)`),
  thTHSignoffs:             source.includes(`'ขอแสดงความนับถือ' (khor sadaeng khwam nap thu, most formal`) &&
                            source.includes(`'ขอบคุณครับ/ค่ะ'`),

  // vi-VN
  viVNAdded:                source.includes(`"vi-VN":\n    "Vietnamese-Vietnam (vi-VN):`),
  viVNKinshipSystem:        source.includes(`Vietnamese is kinship-pronoun-based`) &&
                            source.includes(`anh older brother for male, chị older sister for female`),
  viVNEmPronoun:            source.includes(`em (younger sibling, the safe default for B2B cold outreach`),
  viVNRejectsToi:           source.includes(`tôi (formal 'I') is grammatically correct but reads cold/distant`),
  viVNRejectsBan:           source.includes(`NEVER use bạn (peer-friend, too casual for cold B2B)`),
  viVNFiveGreetings:        source.includes(`'Kính gửi anh/chị {Name},'`) &&
                            source.includes(`'Chào anh/chị {Name},'`) &&
                            source.includes(`'Anh/chị {Name} thân mến,'`) &&
                            source.includes(`'Xin chào anh/chị {Name},'`) &&
                            source.includes(`'Hi anh/chị {Name},'`),
  viVNDiacriticsMatter:     source.includes(`Diacritics matter enormously: 'ma' (ghost) vs 'má'`),
  viVNVNDScaling:           source.includes(`CURRENCY: VND (đồng, ₫)`) &&
                            source.includes(`triệu (million, trieu) or tỷ (billion, ty)`),
  viVNTPHCMQuans:           source.includes(`Thành phố Hồ Chí Minh / TP.HCM`) &&
                            source.includes(`Quận 1 / District 1`) &&
                            source.includes(`Quận 7 / Phú Mỹ Hưng`) &&
                            source.includes(`Quận 2 / Thủ Đức`),
  viVNHanoiPolitical:       source.includes(`Hà Nội (Hanoi, the political capital`) &&
                            source.includes(`state-influenced / less startup vs HCMC`),
  viVNDaNangTech:           source.includes(`Đà Nẵng (Da Nang`) &&
                            source.includes(`dominant emerging tech outsourcing hub`),
  viVNBinhDuongIndustrial:  source.includes(`Bình Dương (Binh Duong`) &&
                            source.includes(`VSIP industrial parks`),
  viVNVietcombank:          source.includes(`Vietcombank / VCB (the largest Vietnamese bank by various metrics`),
  viVNStateBankDominance:   source.includes(`State and state-influenced banks dominate`),
  viVNVingroupVuong:        source.includes(`Vingroup / VIC (the dominant Vietnamese conglomerate, Pham Nhat Vuong family`),
  viVNVinFastNasdaq:        source.includes(`VinFast (EV, Nasdaq-listed VFS)`),
  viVNMasanGroup:           source.includes(`Masan Group / MSN`),
  viVNFPTOutsourcing:       source.includes(`FPT Corporation / FPT (the largest Vietnamese tech / IT outsourcing company`),
  viVNViettelMilitary:      source.includes(`Viettel (military-owned, the dominant Vietnamese telco`) &&
                            source.includes(`Vietnam Ministry of National Defense`),
  viVNTiki:                 source.includes(`Tiki Corporation (Vietnamese-founded, the largest domestic`),
  viVNTikTokShopGrowing:    source.includes(`TikTok Shop Vietnam (rapidly growing post-2022 launch`),
  viVNVNGZalo75M:           source.includes(`VNG Corporation (the Vietnamese tech major — Zalo messaging dominant in Vietnam with ~75M users`),
  viVNMoMo30M:              source.includes(`MoMo (the dominant Vietnamese e-wallet with ~30M users`),
  viVNGrabBe:               source.includes(`Grab Vietnam (Singapore, the dominant`) &&
                            source.includes(`Be Group (Vietnamese-founded mobility, the major domestic challenger)`),
  viVNGiuTheDien:           source.includes(`Saving face (giữ thể diện)`),
  viVNRelationshipFirst:    source.includes(`Relationship-first ordering`) &&
                            source.includes(`cà phê (coffee) or meal is a normal first step`),
  viVNEnglishCodeMix:       source.includes(`English code-mixing is acceptable and common in Vietnamese tech / startup B2B`),
  viVNSignoffs:             source.includes(`'Trân trọng,' (the most formal B2B email close`) &&
                            source.includes(`'Cảm ơn anh/chị,'`),

  // Untouched / regression
  bareThUntouched:          source.includes(`Thai (th): English-heavy for technical terms`),
  bareViUntouched:          source.includes(`Vietnamese (vi): VERY English-heavy`),
  elGRUntouched:            source.includes(`"el-GR":\n    "Greek-Greece (el-GR):`),
  bgBGUntouched:            source.includes(`"bg-BG":\n    "Bulgarian-Bulgaria (bg-BG):`),
  huHUUntouched:            source.includes(`"hu-HU":\n    "Hungarian-Hungary (hu-HU):`),
  roROUntouched:            source.includes(`"ro-RO":\n    "Romanian-Romania (ro-RO):`),
  csCZUntouched:            source.includes(`"cs-CZ":\n    "Czech-Czech Republic (cs-CZ):`),
  ukUAUntouched:            source.includes(`"uk-UA":\n    "Ukrainian-Ukraine (uk-UA):`),
  ruRUUntouched:            source.includes(`"ru-RU":\n    "Russian-Russia (ru-RU):`),
  idIDUntouched:            source.includes(`"id-ID":\n    "Indonesian-Indonesia (id-ID):`),
  itITUntouched:            source.includes(`"it-IT":\n    "Italian-Italy (it-IT):`),
  plPLUntouched:            source.includes(`"pl-PL":\n    "Polish-Poland (pl-PL):`),
  jaJPUntouched:            source.includes(`"ja-JP":\n    "Japanese-Japan (ja-JP):`),
  koKRUntouched:            source.includes(`"ko-KR":\n    "Korean-South Korea (ko-KR):`),
  hiINUntouched:            source.includes(`"hi-IN":\n    "Hindi-India (hi-IN):`),
  enBEUntouched:            source.includes(`"en-BE":\n    "Belgian English (en-BE;`),
  enNLUntouched:            source.includes(`"en-NL":\n    "Dutch B2B in English (en-NL;`),
  tier3HeaderIntact:        source.includes(`// ── REGIONAL LOCALES (B-locale-tier3)`),
  tier1Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier1)`),
  tier2Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier2)`),
  buildNativenessUntouched: source.includes(`export function buildNativenessBlock`),
};
console.log("[language-nativeness-th-vi] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[language-nativeness-th-vi] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[language-nativeness-th-vi] DONE");
