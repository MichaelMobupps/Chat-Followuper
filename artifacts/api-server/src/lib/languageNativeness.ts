/**
 * Language nativeness / code-switching rules for non-English follow-up emails.
 *
 * This module is the core mechanism that prevents "translated-from-English"
 * output: it tells the LLM exactly which industry terms to localize versus
 * keep in English, based on how native ad-tech professionals in each language
 * actually write business emails.
 *
 * Ported from the MobUpps Prospector app's `_build_nativeness_block` in
 * prospector/stages/s5_write.py. Both apps share the same knowledge base;
 * long-term this should live in a shared `lib/` package both import from.
 *
 * Usage:
 *   const block = buildNativenessBlock("bg");   // returns full rule block
 *   const block = buildNativenessBlock("en");   // returns "" (no block needed)
 *   const block = buildNativenessBlock("sw-TZ");  // normalizes to "sw"
 */

/**
 * Extract the primary language subtag from a BCP 47 language tag.
 * Examples:
 *   "bg"       -> "bg"
 *   "bg-BG"    -> "bg"
 *   "zh-Hans"  -> "zh"
 *   "nb-NO"    -> "nb"
 *   "EN_US"    -> "en"
 *   ""         -> ""
 */
export function normalizeLanguageCode(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  // Strip anything after the first separator (hyphen or underscore).
  const primary = raw.split(/[-_]/)[0].toLowerCase();
  // Must be 2-3 letters per BCP 47 primary subtag rules.
  if (!/^[a-z]{2,3}$/.test(primary)) return "";
  return primary;
}

/**
 * Per-language code-switching guides. Each entry describes which ad-tech
 * terms must be localized, which stay in English, and concrete examples of
 * valid vs. invalid phrasing for that language.
 *
 * Grouping (maintained in this order for reviewer clarity):
 *   HEAVY      — translate virtually all compound terms
 *   MODERATE   — translate core concepts, keep some in English
 *   ENGLISH-TOLERANT — keep most terms in English (German, Dutch, Nordics)
 *   ENGLISH-HEAVY — keep ALL ad-tech terms in English (SEA, Indian subcontinent, Swahili)
 */
const GUIDES: Record<string, string> = {
  // ── HEAVY LOCALIZATION ────────────────────────────────────────────────
  ru:
    "Russian (ru): HEAVY localization. Russian adtech professionals " +
    "translate virtually all compound terms to Cyrillic. Only pure " +
    "2-4 letter acronyms stay in Latin script. " +
    "MANDATORY translations: " +
    "retention>удержание, install>установка, conversion>конверсия, " +
    "targeting>таргетинг, traffic>трафик, fraud>фрод, creatives>креативы, " +
    "bid>ставка, budget>бюджет, audience>аудитория, inventory>инвентарь, " +
    "payer>платящий пользователь, screening>скрининг, " +
    "lookalike>лукэлайк or похожие аудитории, " +
    "pre-bid>пре-бид or предварительный, " +
    "post-attribution>пост-атрибуция, " +
    "cohort>когорта, A/B>А/Б (Cyrillic letters), " +
    "programmatic>программатик, in-app>инапп or внутри приложения, " +
    "publisher>паблишер, look-alike>лукэлайк, " +
    "anomaly detection>обнаружение аномалий, " +
    "ML (machine learning)>ML (kept as acronym, but 'ML-модели' is acceptable). " +
    "Game genre names: match-3>три-в-ряд, casual>казуальный, " +
    "hyper-casual>гиперказуальный, shooter>шутер. " +
    "Keep ONLY these acronyms in Latin: " +
    "CPI, CPA, ROAS, DSP, MMP, LTV, D7, KPI, ML, IAP, SDK, OEM. " +
    "When using a Latin acronym with a Cyrillic word, hyphenation is " +
    "acceptable: 'D7-удержание', 'ROAS-оптимизация', 'IAP-проект'. " +
    "But FULL English words must NEVER appear next to Cyrillic. " +
    "SCRIPT-MIXING IS FORBIDDEN — every violation below is WRONG: " +
    "'pre-bid скрининг' WRONG → 'пре-бид скрининг'. " +
    "'programmatic-платформу' WRONG → 'программатик-платформу'. " +
    "'in-app сеть' WRONG → 'инапп-сеть' or 'сеть внутри приложений'. " +
    "'look-alike аудитории' WRONG → 'лукэлайк-аудитории'. " +
    "'A/B-тесты' with Latin A/B WRONG → 'А/Б-тесты' with Cyrillic. " +
    'For exclusive inventory: "полуэксклюзивный инвентарь" or ' +
    '"эксклюзивные источники трафика". ' +
    'For fraud filtering: "фрод-фильтрация" or "система антифрода". ' +
    "CONSISTENCY: once you choose a form, use it everywhere. " +
    "Do NOT write 'лукэлайк' in one paragraph and 'похожие аудитории' " +
    "in another — pick one and stick with it.",

  uk:
    "Ukrainian (uk): Heavy localization, similar to Russian but use " +
    "Ukrainian terms: retention>утримання, install>встановлення, " +
    "conversion>конверсія, targeting>таргетинг, traffic>трафік, " +
    "fraud>фрод, creatives>креативи, bid>ставка, " +
    "publisher>видавець/паблішер, in-app>в додатку, " +
    "pre-bid>пре-бід/попередня фільтрація, post-attribution>пост-атрибуція, " +
    "lookalike>схожі аудиторії, cohort>когорта, " +
    "geo-targeting>геотаргетинг. " +
    "Keep ONLY acronyms in English: CPI, CPA, ROAS, DSP, LTV, D7. " +
    "NEVER mix Latin and Cyrillic in a compound term.",

  pl:
    "Polish (pl): Heavy localization. retention>retencja, " +
    "install>instalacja, conversion>konwersja, targeting>targetowanie, " +
    "traffic>ruch, fraud>fraud (kept in English, standard in Polish adtech), " +
    "creatives>kreacje/materialy reklamowe, bid>stawka, " +
    "audience>grupa docelowa, publisher>wydawca, " +
    "in-app>w aplikacji, pre-bid>pre-bid (kept, standard in Polish), " +
    "post-attribution>post-atrybucja, lookalike>podobni uzytkownicy, " +
    "cohort>kohorta, geo-targeting>geotargetowanie. " +
    "Keep acronyms: CPI, CPA, ROAS, DSP, LTV.",

  cs:
    "Czech (cs): Heavy localization. retention>retence, install>instalace, " +
    "conversion>konverze, targeting>cileni, traffic>provoz/navstevnost, " +
    "creatives>kreativy, bid>nabidka, publisher>vydavatel, " +
    "in-app>v aplikaci, pre-bid>pre-bid (kept), " +
    "post-attribution>post-atribuce, lookalike>podobna publika, " +
    "cohort>kohorta, geo-targeting>geograficke cileni. " +
    "Keep acronyms: CPI, CPA, ROAS, DSP, LTV.",

  ro:
    "Romanian (ro): Heavy localization. retention>retentie, install>instalare, " +
    "conversion>conversie, targeting>targetare, traffic>trafic, " +
    "creatives>creative, bid>licitatie, publisher>editor/publicator, " +
    "in-app>in aplicatie, pre-bid>pre-licitatie, " +
    "post-attribution>post-atribuire, lookalike>audienta similara, " +
    "cohort>cohorta, geo-targeting>targetare geografica. " +
    "Keep acronyms: CPI, CPA, ROAS, DSP, LTV.",

  hu:
    "Hungarian (hu): Heavy localization. retention>megtartas, " +
    "install>telepites, conversion>konverzio, targeting>celzas, " +
    "traffic>forgalom, creatives>kreativok, bid>ajanlat/licit, " +
    "publisher>kiado, in-app>alkalmazason belul, " +
    "pre-bid>ajanlattétel elotti, post-attribution>attribuciót követo, " +
    "lookalike>hasonlo kozonseg, cohort>kohorta, " +
    "geo-targeting>foldrazi celzas. " +
    "Keep acronyms: CPI, CPA, ROAS, DSP, LTV.",

  el:
    "Greek (el): Heavy localization. retention>διατήρηση, " +
    "install>εγκατάσταση, conversion>μετατροπή, targeting>στόχευση, " +
    "traffic>επισκεψιμότητα, creatives>δημιουργικά, bid>προσφορά, " +
    "publisher>εκδότης, in-app>εντός εφαρμογής, " +
    "pre-bid>προ-προσφοράς, post-attribution>μετά την απόδοση, " +
    "lookalike>παρόμοιο κοινό, cohort>ομάδα χρηστών, " +
    "geo-targeting>γεωγραφική στόχευση. " +
    "Keep acronyms: CPI, CPA, ROAS, DSP, LTV.",

  bg:
    "Bulgarian (bg): Heavy localization, similar to Russian. " +
    "retention>задържане, install>инсталация, conversion>конверсия, " +
    "targeting>таргетиране, traffic>трафик, fraud>фрод, " +
    "creatives>криейтиви, bid>наддаване, audience>аудитория, " +
    "publisher>издател/паблишър, in-app>в приложението, " +
    "pre-bid>пре-бид/предварителна фильтрация, " +
    "post-attribution>пост-атрибуция, lookalike>подобна аудитория, " +
    "cohort>кохорта, geo-targeting>гео-таргетиране. " +
    "Keep ONLY acronyms in Latin: CPI, CPA, ROAS, DSP, LTV, D7, MMP. " +
    "NEVER mix Latin and Cyrillic in a compound term. " +
    "Violations: 'user acquisition' WRONG → 'привличане на потребители'; " +
    "'DSP канал' ACCEPTABLE (acronym + hyphen + Cyrillic). " +
    "CONSISTENCY: pick one form per term and use it throughout the email.",

  ja:
    "Japanese (ja): HEAVY katakana/Japanese localization. Every English " +
    "compound term must be fully converted to katakana or native Japanese. " +
    "Established katakana loanwords: リテンション, インストール, コンバージョン, " +
    "トラフィック, クリエイティブ, オーディエンス, ターゲティング. " +
    "Use フラウド (NOT フロード) for fraud. Use 不正検知 or フラウド検知 for " +
    "fraud detection. " +
    "Keep ONLY these pure acronyms in English: CPI, ROAS, DSP, LTV, MMP, " +
    "KPI, KYC, D7, SDK, OEM. Nothing else stays in Latin script. " +
    "MANDATORY conversions (do NOT leave in English): " +
    "pre-bid>プレビッド or 入札前, post-attribution>ポストアトリビューション or 帰属後, " +
    "lookalike>ルックアライク or 類似オーディエンス, publisher>パブリッシャー, " +
    "in-app>アプリ内, cohort>コホート, geo-targeting>ジオターゲティング or 地域, " +
    "anomaly detection>アノマリー検知 or 異常検知, screening>スクリーニング, " +
    "fraud>フラウド or 不正. " +
    "SCRIPT-MIXING IS FORBIDDEN: NEVER write a Latin/English word directly " +
    "adjacent to Japanese characters. Every violation listed below is WRONG: " +
    "'pre-bid審査' WRONG → 'プレビッド審査' or '入札前審査'. " +
    "'post-attribution検証' WRONG → 'ポストアトリビューション検証'. " +
    "'anomaly detection' WRONG → 'アノマリー検知'. " +
    "'geo targeting' WRONG → 'ジオターゲティング'. " +
    "'fraud対策' WRONG → 'フラウド対策' or '不正対策'. " +
    "'cohort分析' WRONG → 'コホート分析'. " +
    "For inventory, use 独自配信面 or パブリッシャー在庫. " +
    "Use セミエクスクルーシブ sparingly, consider 独自の or 独占的な instead.",

  zh:
    "Chinese (zh): HEAVY localization — Chinese adtech professionals " +
    "translate almost all compound terms to Chinese. Only pure letter " +
    "acronyms stay in English. " +
    "MANDATORY translations (do NOT leave these in English): " +
    "留存/用户留存, 转化, 获客, 流量, 素材/创意素材, 反作弊/防欺诈, " +
    "受众/目标人群, 竞价, 投放, publisher>发布商/媒体方, " +
    "pre-bid>竞价前, post-attribution>归因后, lookalike>相似受众, " +
    "cohort>群组/同期群, fraud filtering>反作弊过滤, " +
    "in-app>应用内, geo-targeting>地域定向/地理定向, " +
    "screening>筛选, retained user>留存用户, payer>付费用户. " +
    "Keep ONLY these pure acronyms in English: CPI, CPA, ROAS, DSP, LTV, " +
    "D7, MMP, KPI, A/B, OEM, SDK. Nothing else stays in English. " +
    "SCRIPT-MIXING IS FORBIDDEN: NEVER write an English word directly " +
    "adjacent to Chinese characters. 'pre-bid筛选' is WRONG — write " +
    "'竞价前筛选'. 'cohort异常' is WRONG — write '群组异常'. " +
    "'lookalike定向' is WRONG — write '相似受众定向'. " +
    "'post-attribution验证' is WRONG — write '归因后验证'. " +
    "For inventory exclusivity, use 独家流量 or 优质独占资源.",

  es:
    "Spanish (es): HEAVY localization. Spanish adtech professionals " +
    "translate virtually all compound terms. Only pure acronyms stay English. " +
    "MANDATORY translations (do NOT leave in English): " +
    "conversion>conversión, targeting>segmentación, install>instalación, " +
    "retention>retención, traffic>tráfico, creatives>creativos/piezas creativas, " +
    "audience>audiencia, bid>puja, publisher>editor/publicador, " +
    "in-app>dentro de la app or en la aplicación (NEVER use 'in-app'), " +
    "pre-bid>previo a la puja or verificación previa (NEVER use 'pre-bid'), " +
    "post-attribution>post-atribución (acceptable Spanish form), " +
    "geo-targeting>segmentación geográfica, " +
    "lookalike>audiencias similares, cohort>cohorte, " +
    "screening>filtrado/verificación, postback>devolución de datos or postback " +
    "(acceptable once but not repeatedly). " +
    "Keep ONLY these acronyms in English: CPI, CPA, ROAS, DSP, LTV, D7, " +
    "MMP, KPI, SDK, OEM. Nothing else stays in English. " +
    "Do NOT add Spanish plural 's' to English acronyms — " +
    "'CPAs' is WRONG, use 'CPA' (invariable). " +
    "ENGLISH WORDS IN SPANISH TEXT ARE FORBIDDEN: " +
    "'acuerdos con publishers' WRONG → 'acuerdos con editores'. " +
    "'verificación pre-bid' WRONG → 'verificación previa a la puja'. " +
    "'vídeo in-app' WRONG → 'vídeo dentro de la app'. " +
    "For inventory: 'inventario en exclusiva' or 'inventario preferente'. " +
    "For fraud: 'filtrado antifraude' or 'detección de fraude'. " +
    "CONSISTENCY: pick one form per term, use it throughout the email.",

  // ── MODERATE LOCALIZATION ─────────────────────────────────────────────
  ko:
    "Korean (ko): Moderate adaptation. Use established Korean terms: " +
    "리텐션, 설치, 전환, 트래픽, 크리에이티브, 타겟팅, 오디언스. " +
    "Keep English acronyms: CPI, CPA, ROAS, DSP, LTV, D7, MMP. " +
    "For fraud: 프로드 or 부정 트래픽. " +
    "For exclusive inventory: 독점 인벤토리 or 프리미엄 지면. " +
    "Keep compound English terms that Korean adtech uses in English " +
    '(e.g. "lookalike modeling", "A/B test").',

  pt:
    "Portuguese (pt): Moderate-to-heavy localization, similar to Spanish. " +
    "conversão, segmentação, instalação, retenção, tráfego, criativos, " +
    "audiência, lance, publisher>editor/publicador, " +
    "in-app>dentro do app/no aplicativo, pre-bid>pré-lance/verificação prévia, " +
    "post-attribution>pós-atribuição, lookalike>audiências semelhantes, " +
    "cohort>coorte, geo-targeting>segmentação geográfica. " +
    "Keep ONLY acronyms: CPI, CPA, ROAS, DSP, LTV, D7. " +
    "For inventory: 'inventário exclusivo' or 'inventário premium'. " +
    "For fraud: 'filtragem antifraude'. " +
    "Do NOT add Portuguese plural to English acronyms.",

  it:
    "Italian (it): Moderate localization. conversione, targeting (kept, " +
    "standard in Italian adtech), installazione, retention (kept or " +
    "'fidelizzazione'), traffico, creatività, audience (kept), " +
    "bid/offerta, publisher>editore (or keep publisher), " +
    "in-app>in-app (acceptable in Italian) or 'nell app', " +
    "pre-bid>pre-bid (kept, standard), post-attribution>post-attribuzione, " +
    "lookalike>pubblico simile or lookalike (both used), " +
    "cohort>coorte, geo-targeting>targeting geografico. " +
    "Keep: CPI, CPA, ROAS, DSP, LTV. For fraud: 'filtro antifrode'. " +
    "For inventory: 'inventario esclusivo' or 'fonti di traffico esclusive'.",

  fr:
    "French (fr): Moderate localization. conversion, ciblage, " +
    "installation, rétention, trafic, créations/créatifs, audience, " +
    "enchère, publisher>éditeur, in-app>in-app (acceptable in French) " +
    "or 'dans l application', pre-bid>pré-enchère, " +
    "post-attribution>post-attribution (kept, standard in French adtech), " +
    "lookalike>audiences similaires, cohort>cohorte, " +
    "geo-targeting>ciblage géographique. " +
    "Keep: CPI, CPA, ROAS, DSP, LTV, D7. " +
    "For fraud: 'filtrage anti-fraude'. " +
    "For inventory: 'inventaire exclusif' or 'sources de trafic privilégiées'.",

  tr:
    "Turkish (tr): Moderate localization. retention>elde tutma, " +
    "install>yukleme/kurulum, conversion>donusum, targeting>hedefleme, " +
    "traffic>trafik, creatives>yaratici icerikler/kreatifler, " +
    "bid>teklif, audience>hedef kitle, publisher>yayinci, " +
    "in-app>uygulama ici, pre-bid>teklif oncesi, " +
    "post-attribution>atribüsyon sonrasi, lookalike>benzer kitle, " +
    "cohort>kohort, geo-targeting>cografi hedefleme. " +
    "Keep acronyms: CPI, CPA, ROAS, DSP, LTV. " +
    "For fraud: 'sahtecilik filtreleme' or 'dolandiricilik onleme'. " +
    "For inventory: 'ozel envanter' or 'yari-ozel trafik kaynaklari'.",

  he:
    "Hebrew (he): Moderate localization. retention>שימור, " +
    "install>התקנה, conversion>המרה, targeting>טירגוט (transliteration " +
    "common), traffic>טראפיק (transliteration common), " +
    "creatives>קריאייטיבים, bid>הצעת מחיר, audience>קהל יעד, " +
    "publisher>פאבלישר (transliteration), in-app>באפליקציה, " +
    "pre-bid>פרה-ביד (transliteration) or סינון מוקדם, " +
    "post-attribution>פוסט-אטריביושן (transliteration), " +
    "lookalike>לוקאלייק (transliteration) or קהלים דומים, " +
    "cohort>קוהורט (transliteration), geo-targeting>טירגוט גיאוגרפי. " +
    "Keep acronyms: CPI, CPA, ROAS, DSP, LTV. " +
    "Hebrew adtech uses many transliterated English terms — transliterate " +
    "into Hebrew script rather than leaving in Latin. " +
    "For fraud: 'סינון פראוד' or 'מערכת אנטי-פראוד'. " +
    "For inventory: 'אינוונטורי אקסקלוסיבי' or 'מקורות טראפיק בלעדיים'.",

  ar:
    "Arabic (ar): Moderate localization. Translate core concepts: " +
    "retention>الاحتفاظ, install>تثبيت, conversion>تحويل, " +
    "targeting>استهداف, traffic>حركة المرور/الزيارات, " +
    "creatives>المواد الإبداعية, bid>عرض السعر/مزايدة, " +
    "audience>الجمهور المستهدف, publisher>الناشر, " +
    "in-app>داخل التطبيق, pre-bid>ما قبل المزايدة, " +
    "post-attribution>ما بعد الإسناد, lookalike>جمهور مشابه, " +
    "cohort>مجموعة/فوج, geo-targeting>الاستهداف الجغرافي. " +
    "Keep English acronyms: CPI, CPA, ROAS, DSP, LTV. " +
    "For fraud: 'تصفية الاحتيال' or 'مكافحة الاحتيال'. " +
    "Write right-to-left naturally. Formal register is expected. " +
    "NEVER mix Latin and Arabic script in a compound term.",

  fa:
    "Persian/Farsi (fa): Similar to Arabic in localization approach. " +
    "Translate core concepts to Farsi. Keep English acronyms. " +
    "publisher>ناشر, in-app>درون‌برنامه‌ای, pre-bid>پیش از مزایده, " +
    "post-attribution>پس از اسناد, lookalike>مخاطبان مشابه, " +
    "cohort>گروه همدوره, geo-targeting>هدف‌گذاری جغرافیایی. " +
    "Write right-to-left. Formal register expected for B2B. " +
    "NEVER mix Latin and Persian script in a compound term.",

  fi:
    "Finnish (fi): Moderate localization. retention>retentio (or keep " +
    "'retention'), install>asennus, conversion>konversio, " +
    "targeting>kohdentaminen, traffic>liikenne, " +
    "creatives>luovat materiaalit, publisher>julkaisija, " +
    "in-app>sovelluksessa/in-app (both used), pre-bid>pre-bid (kept), " +
    "post-attribution>post-attribuutio, lookalike>samankaltainen yleiso, " +
    "cohort>kohortti, geo-targeting>maantieteellinen kohdentaminen. " +
    "Keep acronyms: CPI, CPA, ROAS, DSP, LTV. " +
    "Finnish adtech tolerates English well.",

  // ── ENGLISH-TOLERANT ──────────────────────────────────────────────────
  de:
    "German (de): Mixed — many terms stay English in German adtech: " +
    "Targeting, Traffic, Retention, Conversion, Audience, Creatives, " +
    "Bid, Publisher, Pre-bid, Lookalike, Geo-Targeting, In-App, Cohort " +
    "(all acceptable in English in German adtech). " +
    "Translate: Installation, Betrugsfilterung/Betrugserkennung. " +
    "Keep: CPI, CPA, ROAS, DSP, LTV, Programmatic. " +
    "For inventory: 'exklusives Inventar' or 'Premium-Publisher-Inventar'. " +
    "German adtech is very English-tolerant — do NOT force translations " +
    "of terms that German professionals use in English.",

  nl:
    "Dutch (nl): Similar to German — English-tolerant. Keep in English: " +
    "targeting, traffic, retention, conversion, creatives, bid, publisher, " +
    "pre-bid, post-attribution, lookalike, in-app, cohort, geo-targeting, " +
    "CPI, CPA, ROAS, DSP, LTV, programmatic. " +
    "Translate: installatie, fraudefiltering/fraudedetectie. " +
    "For inventory: 'exclusieve inventory' or 'premium uitgeversnetwerk'.",

  sv:
    "Swedish (sv): English-tolerant in adtech. Keep in English: " +
    "retention, conversion, targeting, traffic, creatives, bid, publisher, " +
    "pre-bid, post-attribution, lookalike, in-app, cohort, geo-targeting, " +
    "CPI, ROAS, DSP, LTV. Translate: installation, bedrägerifiltrering. " +
    "Use natural Swedish sentence structure.",

  no:
    "Norwegian (no/nb): Very similar to Swedish. Keep in English: " +
    "all adtech compound terms (pre-bid, post-attribution, lookalike, " +
    "in-app, cohort, geo-targeting, publisher). " +
    "Translate: installasjon, svindelfiltrering. " +
    "Use natural Norwegian sentence structure.",

  nb:
    "Norwegian Bokmal (nb): Very similar to Swedish. Keep in English: " +
    "all adtech compound terms (pre-bid, post-attribution, lookalike, " +
    "in-app, cohort, geo-targeting, publisher). " +
    "Translate: installasjon, svindelfiltrering. " +
    "Use natural Norwegian sentence structure.",

  da:
    "Danish (da): Similar to Swedish/Norwegian. Keep in English: " +
    "all adtech compound terms (pre-bid, post-attribution, lookalike, " +
    "in-app, cohort, geo-targeting, publisher). " +
    "Translate: installation, svindelfiltrering. " +
    "Use natural Danish sentence structure.",

  // ── ENGLISH-HEAVY ─────────────────────────────────────────────────────
  vi:
    "Vietnamese (vi): VERY English-heavy. Keep ALL adtech terms in " +
    "English: retention, install, conversion, targeting, traffic, fraud " +
    "filtering, creatives, bid, DSP, CPI, ROAS, LTV, lookalike, A/B test, " +
    "semi-exclusive inventory, publisher, pre-bid, post-attribution, " +
    "in-app, cohort, geo-targeting. Write structural grammar and " +
    "transitions in Vietnamese, technical vocabulary in English. " +
    "Do NOT over-translate.",

  th:
    "Thai (th): English-heavy for technical terms, similar to Vietnamese. " +
    "Keep ALL adtech compound terms in English: retention, install, " +
    "conversion, targeting, traffic, fraud filtering, creatives, publisher, " +
    "pre-bid, post-attribution, lookalike, in-app, cohort, geo-targeting, " +
    "CPI, ROAS, DSP, LTV. Write structural grammar in Thai.",

  id:
    "Indonesian (id): English-heavy for adtech. Keep ALL compound terms " +
    "in English: retention, install, conversion, targeting, traffic, fraud " +
    "filtering, creatives, publisher, pre-bid, post-attribution, lookalike, " +
    "in-app, cohort, geo-targeting, CPI, ROAS, DSP, LTV. " +
    "Write structural grammar in Indonesian.",

  ms:
    "Malay (ms): Similar to Indonesian — English-heavy for adtech. " +
    "Keep ALL compound terms in English: pre-bid, post-attribution, " +
    "lookalike, in-app, cohort, geo-targeting, publisher. " +
    "Write structural grammar in Malay.",

  fil:
    "Filipino/Tagalog (fil): Extremely English-heavy. Filipino B2B " +
    "communication in adtech is predominantly English with Tagalog " +
    "grammar. Keep ALL adtech terms in English: pre-bid, post-attribution, " +
    "lookalike, in-app, cohort, geo-targeting, publisher, and all others. " +
    "Many Filipino professionals write B2B emails entirely in English.",

  tl:
    "Filipino/Tagalog (tl): Extremely English-heavy. Keep ALL adtech " +
    "terms in English: pre-bid, post-attribution, lookalike, in-app, " +
    "cohort, geo-targeting, publisher. Write grammar in Tagalog.",

  hi:
    "Hindi (hi): English-heavy. Indian adtech is conducted primarily in " +
    "English, even when writing in Hindi. Keep ALL adtech terms in English: " +
    "retention, install, conversion, targeting, traffic, creatives, " +
    "publisher, pre-bid, post-attribution, lookalike, in-app, cohort, " +
    "geo-targeting, fraud filtering, CPI, ROAS, DSP, LTV. " +
    "Write structural sentences in Hindi, all technical vocabulary in English.",

  bn:
    "Bengali (bn): Similar to Hindi — English-heavy for adtech terms. " +
    "Keep ALL compound terms in English: pre-bid, post-attribution, " +
    "lookalike, in-app, cohort, geo-targeting, publisher. " +
    "Write grammar and transitions in Bengali.",

  ur:
    "Urdu (ur): Similar to Hindi but with Perso-Arabic script. " +
    "Keep ALL adtech terms in English: pre-bid, post-attribution, " +
    "lookalike, in-app, cohort, geo-targeting, publisher. " +
    "Write structural grammar in Urdu. Formal register expected.",

  sw:
    "Swahili (sw): English-heavy for adtech. Keep ALL technical terms " +
    "in English: pre-bid, post-attribution, lookalike, in-app, cohort, " +
    "geo-targeting, publisher. Write structural grammar in Swahili.",

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

  // ── REGIONAL LOCALES (B-locale-tier2) ──────────────────────────
  // English / French / German regional variants. English variants
  // are lighter on code-switching (English IS the source language)
  // and emphasise spelling, regional brand references, and register.
  // French and German variants follow tier1 depth.

  "en-IN":
    "Indian English (en-IN; covers also Pakistan, Bangladesh, Sri Lanka B2B): Standard register is more formal than en-US, less than en-GB. B2B register: 'Mr. / Ms. {LastName}' for first contact; first names acceptable once warm. " +
    "KEY VOCABULARY DIFFERENCES from en-US: lakh / crore (NOT million for amounts under 100M INR; one crore = 10,000,000), prepone (advance / move earlier), do the needful (acceptable in formal email but DO NOT overuse on WhatsApp), revert (used as 'I will revert tomorrow' meaning 'I will reply'), out of station (= traveling), kindly (more common as polite softener than US use), sir / madam (still common in cold outreach to senior contacts). " +
    "ADTECH VOCABULARY: India keeps almost all adtech terms in English; no localization needed. Standard terms: CPI, CPA, ROAS, DSP, MMP, LTV, KPI, lookalike, retention, cohort, fraud filtering, in-app, attribution, churn, ARPU, D7. Spelling follows en-GB for ambiguous words: optimisation (NOT optimization), centre (NOT center), colour (NOT color), behaviour (NOT behavior), licence (noun) / license (verb). " +
    "CITY/MARKET REFERENCES: Mumbai, Bengaluru / Bangalore, Delhi-NCR (Delhi, Gurugram / Gurgaon, Noida), Hyderabad, Chennai, Pune, Kolkata, Ahmedabad. Currency INR (Rs / ₹); use 'lakh' (1,00,000 with Indian comma grouping) and 'crore' (1,00,00,000) for INR amounts in the lakh-to-crore range. Indian peer brands (Flipkart, Reliance Retail / JioMart, Tata Digital, Paytm, PhonePe, Zomato, Swiggy, Ola, OYO, Nykaa, Meesho, Dream11, Hotstar / Disney+ Hotstar, Jio, Airtel, ICICI Bank, HDFC Bank, SBI, Bajaj Finserv). Bangladesh: bKash, Pathao, Daraz Bangladesh. Sri Lanka: Daraz Sri Lanka, Dialog. Pakistan: Daraz Pakistan, JazzCash, Easypaisa. " +
    "TONE: B2B Indian English is more formal than American or UK B2B. Use 'Hello' or 'Hi' on WhatsApp; 'Dear Mr. {LastName}' on email. Avoid US slang (ballpark, low-hanging fruit, slam dunk) since these read as Western and slightly out of place. 'Do the needful' and 'kindly revert' are formal email register; do not use on WhatsApp.",

  "en-GB":
    "British English (en-GB; covers also Ireland, Australia, New Zealand, South Africa B2B): More formal than en-US, less idiomatic. B2B WhatsApp register: 'Hi {NAME},' is fine; cold email defaults to 'Hello {NAME},' or 'Dear {NAME},'. " +
    "SPELLING (en-GB orthography only, never en-US): optimisation, organisation, prioritise, analyse, behaviour, colour, centre, theatre, metre, defence, licence (noun) / license (verb), enquiry (more British) and inquiry (both used), travelled (double-l), towards (NOT toward), amongst (both work, amongst more British). Use 'whilst' sparingly. " +
    "ADTECH VOCABULARY: standard English terms, all kept (no localization needed). British market often refers to 'media planning' rather than 'media buying' for the strategic side; both terms understood. UK programmatic talk uses 'inventory' and 'demand' the same as US. " +
    "CITY/MARKET REFERENCES: London, Manchester, Birmingham, Edinburgh, Glasgow, Bristol, Leeds, Belfast, Cardiff; Dublin (RoI). Currency GBP (£), EUR (€) for Ireland, AUD (A$) for Australia, NZD (NZ$) for New Zealand, ZAR (R) for South Africa. UK peer brands (Tesco, Sainsbury's, Asda, Morrisons, M&S / Marks and Spencer, John Lewis, Boots, Argos, Sky, BT, Virgin Media O2, Vodafone UK, Three UK, Just Eat, Deliveroo, Ocado, ASOS, Boohoo, Burberry, Lloyds, Barclays, NatWest, HSBC UK, Nationwide, Monzo, Revolut UK, Wise). Irish brands (SuperValu, Centra, Three Ireland, Eir, AIB, Bank of Ireland). Australian brands (Woolworths, Coles, JB Hi-Fi, Telstra, Optus, Commonwealth Bank, ANZ, Westpac, NAB, Afterpay, Zip). " +
    "TONE: more reserved than en-US. Avoid Americanisms: 'reach out' is acceptable; 'circle back' is borderline; 'touch base' is borderline. Understatement is preferred over hype: 'quite useful' often means 'very useful'; 'not bad' is positive; 'interesting' can be polite for 'I disagree'. Avoid 'gotten' (use 'got'), 'I'll go ahead and...' (over-soft), 'awesome' / 'super' (too casual for B2B).",

  "en-US":
    "American English (en-US; covers also English-Canada B2B; Quebec uses fr-CA): Default English variant for most LLMs. B2B WhatsApp register: 'Hi {NAME},' direct and warm. " +
    "SPELLING (en-US orthography only): optimization, organization, prioritize, analyze, behavior, color, center, theater, meter, defense, license (both noun and verb), inquiry, traveled (single-l), toward (NOT towards), among. " +
    "ADTECH VOCABULARY: standard English terms, all kept. US market is the canonical English-language adtech vocabulary; no special considerations beyond the standard term list. Common phrasing: 'media buy', 'incrementality', 'attribution windows', 'D7 ROAS'. " +
    "CITY/MARKET REFERENCES: New York, Los Angeles, San Francisco / Bay Area, Chicago, Boston, Seattle, Austin, Atlanta, Miami, Denver, Dallas, Houston, Washington D.C. Currency USD ($). US peer brands (Amazon, Walmart, Target, Best Buy, Costco, Home Depot, Lowe's; Apple, Google / Alphabet, Meta, Microsoft, Netflix; DoorDash, Uber, Lyft, Instacart, Airbnb, Robinhood, Chime, Cash App, Venmo, PayPal; Disney+, Hulu, HBO Max, Peacock; Bank of America, JPMorgan Chase, Wells Fargo, Citi, Capital One; AT&T, Verizon, T-Mobile US). Canada-en peer brands (Loblaws, Shoppers Drug Mart, Rogers, Telus, Bell, RBC, TD Bank, Tim Hortons, Lululemon). " +
    "TONE: warm-direct. 'Reach out', 'circle back', 'touch base', 'quick chat' are all standard. Avoid over-formality ('Dear Sir/Madam' reads as outdated for tech B2B). Mild hype is acceptable ('great', 'awesome' OK in casual B2B); avoid 'amazing' / 'incredible' / 'world-class' which trend too far into marketing-speak.",

  "fr-FR":
    "Metropolitan French (fr-FR; covers also Belgium-fr, Switzerland-fr, Luxembourg-fr, French-language Maghreb B2B): Standard French register for cold B2B. Use 'vous' for ALL cold outreach. 'Tu' is not acceptable for first contact even in modern tech B2B. " +
    "KEY VOCABULARY: courriel and email both used (email more modern in tech B2B), portable / mobile (NOT cellulaire which is fr-CA), week-end (with hyphen), parking (loanword OK), shopping (loanword OK in fr-FR though purists prefer 'achats'), e-commerce (kept English). Numbers use space as thousands separator and comma as decimal: '1 234,56 €'. " +
    "ADTECH VOCABULARY: fr-FR is moderately English-tolerant. Keep in English: CPI, CPA, ROAS, DSP, MMP, LTV, KPI, A/B, SDK, OEM, lookalike, cohort, in-app, fraud filtering, ROI (sometimes RSI but ROI more common), churn (or attrition). Translate: conversion, ciblage, segmentation, audience, trafic, créatifs / créations, retargeting>reciblage (or kept English in tech B2B), retention>rétention, bid>enchère, dashboard>tableau de bord (or kept English). Use 'la' (feminine) for English borrowings as default ('la conversion', 'la performance', 'la data'); some are masculine ('le tracking', 'le ROI', 'le funnel'). " +
    "CITY/MARKET REFERENCES: Paris (Île-de-France), Lyon, Marseille, Toulouse, Bordeaux, Lille, Nantes, Strasbourg, Nice, Rennes; Bruxelles / Brussels, Anvers / Antwerpen, Liège, Luxembourg-Ville. Currency EUR (€). French peer brands (Carrefour, Leclerc, Auchan, Casino, Monoprix, Fnac, Darty, La Redoute, Cdiscount, Vinted FR, BlaBlaCar, Doctolib, Veepee / Showroomprivé, Sarenza, ManoMano, Orange France, SFR, Bouygues Telecom, Free Mobile, BNP Paribas, Société Générale, Crédit Agricole, La Banque Postale, Boursorama). Belgian brands (Colruyt, Delhaize, Carrefour Belgium, Proximus, Telenet, Orange Belgium, KBC, Belfius, ING Belgium). " +
    "TONE: courteous-formal. Standard openers: 'Bonjour {NAME},' on WhatsApp; 'Bonjour Madame / Monsieur {LastName},' for cold email. Sign-offs trend formal: 'Cordialement,' is the standard, 'Bien cordialement,' is more polite, 'Sincères salutations,' for very formal contexts. Avoid Americanisms transliterated ('Faisons cela' for 'let's do it' reads stiff; 'Rebondissons sur ce point' for 'circle back' is awkward).",

  "fr-CA":
    "Canadian / Quebec French (fr-CA): Stronger anti-anglicisme tradition than fr-FR. Quebec professionals deliberately use French equivalents where fr-FR speakers tolerate English borrowings. Use 'vous' for cold outreach (same as fr-FR). " +
    "KEY VOCABULARY DIFFERENCES from fr-FR: courriel (NOT email — Quebec defaults to courriel even in tech B2B), magasinage (NOT shopping), fin de semaine (NOT week-end), stationnement (NOT parking), arrêt (NOT stop), char (informal for car, NOT voiture in casual register), bienvenue (= 'you are welcome', the Québécois marker; 'de rien' also accepted in modern Quebec but bienvenue is the regionalism), dépanneur (= corner store, untranslatable Quebec term), traversier (NOT ferry), clavarder (= chat online, archaic-but-recognized OQLF coinage). Telephone: cellulaire (NOT mobile, NOT portable). " +
    "ADTECH VOCABULARY: more localized than fr-FR. Translate where possible: conversion (kept), ciblage, audience, trafic, créatifs, attribution, recibrage / reciblage (NOT retargeting), enchère (NOT bid), tableau de bord (NOT dashboard), apprentissage automatique (NOT machine learning, though ML acronym fine), entonnoir de conversion (NOT funnel). Keep ONLY: CPI, CPA, ROAS, DSP, LTV, MMP, KPI, A/B, SDK. The Office Québécois de la Langue Française (OQLF) actively coins French equivalents and tech B2B respects this; over-using English borrowings reads as careless. " +
    "CITY/MARKET REFERENCES: Montréal, Québec (city), Laval, Gatineau, Sherbrooke, Trois-Rivières, Saguenay; English-Canada cities (Toronto, Vancouver, Calgary, Edmonton, Ottawa) referenced in English even in fr-CA messages. Currency CAD ($ CA or simply $). Quebec peer brands (Couche-Tard, Jean Coutu, Metro QC, IGA, Provigo, Maxi, Familiprix, Uniprix, La Capitale, Desjardins, Banque Nationale, BMO Québec, RBC Québec, Vidéotron, Bell Canada, Telus Québec, Air Canada, Cirque du Soleil, BRP / Bombardier Recreational Products, Cascades). " +
    "TONE: warm-formal. 'Bonjour {NAME},' on WhatsApp; 'Bonjour Madame / Monsieur,' or simply 'Bonjour,' on email cold outreach. Sign-off: 'Cordialement,' or the more Québécois 'Salutations distinguées,'. Quebec B2B is direct but not as informal as US English; avoid hype words and avoid English-derived phrasing.",

  "de-DE":
    "Standard German (de-DE; covers German Federal Republic and Luxembourg-de B2B): Default German register. B2B uses 'Sie' (formal) for ALL cold outreach. 'Du' only after explicit invitation, never in first contact even in modern tech B2B (Berlin startup culture is the rare exception). " +
    "ORTHOGRAPHY: standard German post-1996 reform. Uses ß (eszett) for sharp s where rules require: groß, Straße, Fußball, weiß, Maß, Schloß. Note 'dass' (post-reform) replaces older 'daß'. Capitalize ALL nouns. Numbers use period as thousands separator and comma as decimal: '1.234,56 €'. " +
    "ADTECH VOCABULARY: German B2B is heavily English-tolerant. Keep in English: CPI, CPA, ROAS, DSP, MMP, LTV, KPI, lookalike, retention, cohort, in-app, fraud filtering, churn, ARPU, programmatic, attribution, A/B-Test, ROI. Mix English nouns into German sentences with German articles: 'das Targeting', 'die Performance', 'der Funnel', 'das Tracking', 'die Conversion-Rate', 'der ROAS'. Localize ONLY when there is a well-established German term: Werbeanzeige (ad), Zielgruppe (audience), Kampagne (campaign), Reichweite (reach), Datenschutz (privacy / data protection), Einwilligung (consent). " +
    "CITY/MARKET REFERENCES: Berlin, München (Munich), Hamburg, Frankfurt am Main, Köln (Cologne), Stuttgart, Düsseldorf, Leipzig, Hannover, Nürnberg, Dresden, Bremen. Currency EUR (€). German peer brands (Lidl, Aldi Süd / Aldi Nord, Edeka, Rewe, Kaufland, Penny, Netto, dm-drogerie markt, Rossmann, Otto, Zalando, MediaMarkt, Saturn, About You, Flixbus, FlixTrain, N26, Trade Republic, Comdirect, ING-DiBa, Deutsche Bank, Commerzbank, Sparkasse, Volkswagen, Mercedes-Benz, BMW, Audi, Allianz, Munich Re, Telekom Deutschland / Deutsche Telekom, Vodafone Germany, O2 / Telefónica Germany, 1&1). " +
    "TONE: formal-direct. Standard openers: 'Hallo {NAME},' on WhatsApp (softer); 'Sehr geehrte Frau / Sehr geehrter Herr {LastName},' on cold email; 'Sehr geehrte Damen und Herren,' if no name known. Sign-off: 'Mit freundlichen Grüßen,' (formal standard) or 'Viele Grüße,' / 'Beste Grüße,' (modern professional). Avoid hype; understated competence is the cultural register. Numbers and concrete deliverables matter more than narrative.",

  "de-AT":
    "Austrian German (de-AT): Mostly identical to de-DE but with Austrian-specific vocabulary and slightly softer formality. Use 'Sie' for cold outreach (same as de-DE). " +
    "KEY VOCABULARY DIFFERENCES from de-DE: Jänner (NOT Januar — Austrian word for January), Feber (older form of Februar, recognized but Februar more common in modern Austrian B2B), heuer (= 'this year', NOT 'dieses Jahr' — though both work), Sackerl (NOT Tüte, for shopping bag), Erdäpfel (NOT Kartoffeln, regional/older — Kartoffel is universal), Paradeiser (NOT Tomate, regional/older — Tomate is universal in B2B), Spital (used alongside Krankenhaus). Greetings: 'Servus' is informal Austrian (do NOT use for B2B cold); 'Grüß Gott' is traditional and used in spoken business but feels dated on WhatsApp; default to 'Hallo' or 'Guten Tag'. " +
    "ORTHOGRAPHY: same as de-DE (post-1996 reform, uses ß). " +
    "ADTECH VOCABULARY: same as de-DE. Austrian B2B is similarly English-tolerant; same article patterns ('das Targeting', 'die Performance'). No Austrian-specific adtech localization. " +
    "CITY/MARKET REFERENCES: Wien (Vienna), Graz, Linz, Salzburg, Innsbruck, Klagenfurt, Villach, Wels. Currency EUR (€). Austrian peer brands (Spar Austria, Billa, Hofer / Aldi Austria, Penny Austria, Merkur, Interspar, Müller Austria, BIPA, Libro, Thalia Austria, ÖBB / Austrian Federal Railways, A1 Telekom Austria, Magenta Telekom, Drei Austria / 3 Austria, Erste Bank, Raiffeisen, BAWAG P.S.K., Bank Austria, Wien Energie, OMV, Red Bull, Magna Steyr, voestalpine, Andritz). " +
    "TONE: slightly softer than de-DE. Standard openers: 'Hallo {NAME},' on WhatsApp; 'Sehr geehrte Frau / Sehr geehrter Herr,' on email. Sign-off: 'Mit freundlichen Grüßen,' or 'Beste Grüße,'. Austrian B2B values relationship-building more than the German direct register; allow a touch more warmth.",

  "de-CH":
    "Swiss High German (de-CH; the WRITTEN B2B register; spoken Swiss German / Schwyzerdütsch is dialectal and is NOT used in business writing). Use 'Sie' for cold outreach. Switzerland is multilingual; use de-CH only for German-speaking cantons (Zürich, Bern, Basel, Luzern, Aargau, Thurgau, etc.). " +
    "ORTHOGRAPHY: NO ß. Swiss orthography replaces ß with ss in ALL cases: gross (NOT groß), Strasse (NOT Straße), Fussball, weiss, dass, Mass, Schloss, Grüsse (NOT Grüße). This is the most visible Swiss-German marker; getting it wrong signals foreign authorship immediately. " +
    "KEY VOCABULARY DIFFERENCES from de-DE: Velo (NOT Fahrrad for bike), Trottoir (NOT Bürgersteig for sidewalk), parkieren (NOT parken), Tram (universal but Swiss prefers it over Strassenbahn), Natel (somewhat archaic for mobile phone, Handy more modern), Coiffeur (NOT Friseur), Lehrling / Lehrtochter (apprentice, gendered Swiss form), Spital (universal in CH for hospital, NOT Krankenhaus), Glace (NOT Eis for ice cream), Billett (NOT Fahrkarte / Ticket — though Ticket also used). " +
    "ADTECH VOCABULARY: same as de-DE; heavily English-tolerant. Same article patterns, same English-borrowing list. No Swiss-specific adtech localization. " +
    "CITY/MARKET REFERENCES: Zürich, Genève / Geneva (French-speaking), Basel, Bern, Lausanne (French-speaking), Winterthur, Luzern, St. Gallen, Lugano (Italian-speaking), Biel/Bienne (bilingual). Currency CHF (Swiss Franc, written 'CHF' or 'Fr.', NOT €; use the period as thousands separator and the period or comma as decimal: 'CHF 1'234.56' or 'CHF 1\u2019234.56' with apostrophe). Swiss peer brands (Migros, Coop, Denner, Aldi Suisse, Lidl Schweiz, Manor, Globus, Volg, Spar Schweiz, Swisscom, Sunrise, Salt Mobile, UBS, Credit Suisse / now part of UBS, Raiffeisen Schweiz, ZKB / Zürcher Kantonalbank, Postfinance, Nestlé, Roche, Novartis, ABB, Holcim, SBB / Swiss Federal Railways, Swiss / Swiss International Air Lines). " +
    "TONE: most formal of the German variants. Swiss B2B values precision and understatement; avoid hype, avoid superlatives, avoid casual softeners. Standard openers: 'Guten Tag {NAME},' on WhatsApp (Hallo also acceptable but Guten Tag is the safer Swiss default); 'Sehr geehrte Damen und Herren,' or 'Sehr geehrte Frau / Sehr geehrter Herr {LastName},' on email. Sign-off: 'Freundliche Grüsse,' (NOT Grüße — ss only). Cultural note: Swiss B2B may take longer to warm up than German or Austrian counterparts; do not push pace.",

  // ── REGIONAL LOCALES (B-locale-tier3) ──────────────────────────
  // Hindi (hi-IN) and Bengali (bn-BD, bn-IN) script-aware entries.
  // Hindi has one regional bucket because India is the only major
  // Hindi B2B adtech market. Bengali has two regional buckets
  // because Bangladesh and India / West Bengal differ materially
  // in vocabulary, peer brands, currency, and English code-mixing
  // intensity. All three share the formal verb form for cold B2B:
  // आप for Hindi, আপনি for Bengali.

  "hi-IN":
    "Hindi-India (hi-IN): Indian adtech is conducted primarily in English even when writing in Hindi. Keep ALL technical vocabulary in English; structural and connective sentences in Hindi. Use आप (formal) form throughout for cold B2B outreach; never tu / तू. " +
    "SCRIPT: Devanagari script is acceptable; Latin-script transliteration of Hindi structural words (Namaste, dhanyavaad) is also normal on WhatsApp / Telegram / Slack between professionals exchanging messages on phones. For Teams (enterprise context) prefer Devanagari for greeting words. Hinglish (Hindi in Latin script with English code-mixing) is the actual working register for most Indian B2B chat. " +
    "ADTECH VOCABULARY: keep in English: retention, install, conversion, targeting, traffic, creatives, publisher, pre-bid, post-attribution, lookalike, in-app, cohort, geo-targeting, fraud filtering, CPI, CPA, ROAS, DSP, MMP, LTV, ARPU, D7, KPI, A/B test, SDK, attribution, churn, funnel, programmatic, retargeting. Localize ONLY: अभियान (campaign) when natural; ग्राहक (customer) for non-technical references; भुगतान (payment); उपयोगकर्ता (user) only when emphasizing the human side. " +
    "CITY/MARKET REFERENCES: Bengaluru (NOT Bangalore; current official name), Mumbai (NOT Bombay), Delhi NCR, Hyderabad, Pune, Chennai, Kolkata, Ahmedabad, Gurugram (NOT Gurgaon for official register), Noida. Currency INR (₹ or Rs.), with lakh (1,00,000) and crore (1,00,00,000) for amounts under 100M. Indian numbering uses '2,00,000' (lakh notation) not '200,000'. " +
    "PEER BRANDS: Flipkart, Myntra, Meesho, Reliance JioMart, Tata Neu, Amazon India, Nykaa, BigBasket, Blinkit, Zepto, Swiggy, Zomato, Ola, Uber India, Rapido, RedBus, MakeMyTrip, EaseMyTrip, BookMyShow, Hotstar / Disney+ Hotstar, JioCinema, Sony LIV, ZEE5, Paytm, PhonePe, Google Pay India, BharatPe, CRED, Razorpay, Cashfree, RuPay (NOT just Visa / Mastercard), HDFC Bank, ICICI Bank, SBI, Kotak Mahindra, Axis Bank, IndusInd, Bandhan Bank, Bajaj Finserv, LIC. Avoid US-only brand references (Amazon US, Walmart, Target) which read as a mismatched template. " +
    "TONE: formal-warm. Indian B2B chat register is more polite than en-US but allows direct asks. Sign-offs: 'धन्यवाद' or 'Thanks and regards,' both acceptable. Avoid US slang (ballpark, low-hanging fruit, deep dive, circle back). Use INR amounts always with lakh / crore convention.",

  "bn-BD":
    "Bengali-Bangladesh (bn-BD): Bangladesh adtech mixes Bengali grammar with English technical terminology. Use আপনি (formal) form for cold B2B outreach; never তুই / তুমি in first contact. Bangladesh Bengali differs from India Bengali in vocabulary, peer brands, and English-code-mixing intensity; they are distinct B2B markets and references should not cross over. " +
    "SCRIPT: Bengali script (Bangla script) is standard for greeting and structural words. Latin-script transliteration is acceptable on WhatsApp / Telegram / Slack but Bengali script reads as more professional. For Teams (enterprise) prefer Bengali script throughout. " +
    "ADTECH VOCABULARY: keep in English: retention, install, conversion, targeting, traffic, creatives, publisher, pre-bid, post-attribution, lookalike, in-app, cohort, geo-targeting, fraud filtering, CPI, CPA, ROAS, DSP, MMP, LTV, ARPU, D7, KPI, A/B test, SDK, attribution, churn, funnel, retargeting. Localize ONLY: ক্যাম্পেইন (campaign) when natural; গ্রাহক (customer) for non-technical references; পেমেন্ট is fine in either script. " +
    "CITY/MARKET REFERENCES: Dhaka (capital), Chittagong / Chattogram (current official spelling), Sylhet, Khulna, Rajshahi, Barisal / Barishal, Rangpur, Mymensingh. Currency BDT (Bangladeshi Taka, ৳ or Tk.), with lakh (1,00,000) and crore (1,00,00,000) for amounts under 100M; Bangladesh uses Indian-style numbering '2,00,000 টাকা'. " +
    "PEER BRANDS: bKash (dominant mobile money), Nagad (state-backed mobile money), Rocket (DBBL mobile), Pathao (ride / delivery), Uber Bangladesh, Foodpanda Bangladesh, HungryNaki, Daraz Bangladesh (Alibaba), Chaldal (groceries), Shohoz (transport / payments), Robi, Grameenphone (GP), Banglalink, Teletalk (state operator), Brac Bank, Eastern Bank, Dhaka Bank, City Bank, IFIC Bank, Pran-RFL Group, Walton (electronics), Akij Group, Square Group. AVOID Indian peer references (Flipkart, Paytm, Jio, Swiggy, Zomato) which signal wrong market; Bangladesh has its own adtech ecosystem and Bangladeshi operators read Indian references as a foreign-template mistake. " +
    "TONE: formal-warm. Bangladesh B2B is relationship-oriented; polite phrasing matters. Sign-offs: 'ধন্যবাদ' (dhonnobad) standard; 'Thanks and regards,' acceptable in English-heavy messages. Religious greetings: 'আসসালামু আলাইকুম' is appropriate when prospect's name is visibly Muslim-coded and context is more formal; default to neutral 'নমস্কার' or English 'Hello' otherwise. Avoid US slang.",

  "bn-IN":
    "Bengali-India (bn-IN): India Bengali, primarily West Bengal (Kolkata and diaspora). Heavier English code-mixing than bn-BD; in B2B chat, structural sentences regularly switch between Bengali and English mid-paragraph, which is natural register and not a fault. Use আপনি (formal) form for cold B2B outreach. " +
    "SCRIPT: Bengali script for greeting and structural words; Latin-script transliteration also normal in fast-typed chat. Adtech terms in English (Latin script). " +
    "ADTECH VOCABULARY: keep in English: retention, install, conversion, targeting, traffic, creatives, publisher, pre-bid, post-attribution, lookalike, in-app, cohort, geo-targeting, fraud filtering, CPI, CPA, ROAS, DSP, MMP, LTV, ARPU, D7, KPI, A/B test, SDK, attribution, churn, funnel, retargeting. Localize ONLY: ক্যাম্পেইন (campaign) when natural; গ্রাহক (customer) for non-technical references. " +
    "CITY/MARKET REFERENCES: Kolkata (NOT Calcutta; current official name), Howrah, Durgapur, Asansol, Siliguri, Darjeeling, Kharagpur, Bardhaman / Burdwan. Currency INR (₹), with lakh / crore for amounts under 100M; same Indian numbering convention as hi-IN ('2,00,000'). " +
    "PEER BRANDS: India-wide brands dominate (Flipkart, Myntra, Amazon India, Reliance JioMart, Tata Neu, Swiggy, Zomato, Ola, Paytm, PhonePe, HDFC Bank, ICICI Bank, SBI). Kolkata-regional brands where relevant: Spencer's Retail, Bandhan Bank (headquartered in Kolkata), UCO Bank (headquartered in Kolkata), Tata Steel (Jamshedpur, regional anchor), CESC (Kolkata electricity). AVOID Bangladesh peer references (bKash, Pathao, Daraz Bangladesh) which signal wrong market. " +
    "TONE: warm-formal. Indian Bengali B2B respects intellectual references and a slightly more literary register than other Indian markets; addressing Kolkata professionals with respect to their reading and writing tradition lands well. Avoid US slang. Sign-offs: 'ধন্যবাদ' or 'Thanks and regards,' both acceptable.",

  "ja-JP":
    "Japanese-Japan (ja-JP): Japan is the only major Japanese B2B adtech market. The base Japanese (ja) guide covers HEAVY katakana / Japanese localization with mandatory term conversions and the FORBIDDEN script-mixing rule; that all still applies. This regional entry adds Japan-specific city, currency, peer-brand, and register depth on top of the base ja guide. " +
    "REGISTER LAYERS: Japanese B2B uses three register layers. Default is teineigo (丁寧語, the です/ます forms): polite-neutral, the working register for cold B2B chat. Escalate to sonkeigo (尊敬語, exalting language) when referring to the prospect's company actions, executives, or decisions — e.g. 御社 (your company), ご検討いただく (your kind consideration). Use kenjougo (謙譲語, humbling language) when referring to MobUpps' actions toward the prospect — e.g. 弊社 (our humble company), 申し上げる (humbly say), ご提案させていただく (humbly propose). Mixing these incorrectly is a register fault that Japanese B2B readers notice immediately. Cold outreach should default teineigo throughout, with sonkeigo for the prospect's actions and kenjougo for MobUpps' actions in any sentence where both appear. NEVER use plain form (だ/である) in B2B cold contact. " +
    "ORTHOGRAPHY: Mixed kanji + hiragana + katakana is standard. Adtech loanwords in katakana per the base ja guide (リテンション, インストール, etc.). Numbers in half-width Arabic digits with commas for thousands: 1,000 / 10,000 / 1,000,000. Percentages use the half-width % symbol (12%), never the full-width ％ for B2B body. " +
    "CURRENCY: JPY (¥). No decimal points (the yen has no fractional unit in practice). Comma thousands: ¥1,234,567. For larger amounts the unit 万 (10,000) is standard in spoken / written business contexts: 100万円 (1 million yen), 1,000万円 (10 million yen), 1億円 (100 million yen). Both '¥1,000,000' and '100万円' are correct; Japanese B2B documents tend to use 万 / 億 for amounts above 1M for readability. Match the convention the prospect's company uses in its own materials when known. " +
    "CITY/MARKET REFERENCES: 東京 (Tokyo, prefer the kanji), 大阪 (Osaka), 名古屋 (Nagoya), 福岡 (Fukuoka), 横浜 (Yokohama), 札幌 (Sapporo), 神戸 (Kobe), 京都 (Kyoto), 仙台 (Sendai), 広島 (Hiroshima). For Tokyo region, sub-areas matter: 渋谷 (Shibuya, tech / startup), 六本木 (Roppongi, foreign / finance / enterprise tech), 大手町 (Otemachi, major Japanese enterprise HQ), 新宿 (Shinjuku, mixed enterprise), 品川 (Shinagawa, gateway). Latin transliterations (Tokyo, Osaka) are acceptable on WhatsApp / Telegram / Slack / Teams when the rest of the message reads naturally, but kanji is more professional. " +
    "PEER BRANDS by tier: " +
    "Enterprise / shosha (general trading) tier: 三井 (Mitsui), 三菱 (Mitsubishi UFJ / Mitsubishi Corporation), 住友 (Sumitomo), 伊藤忠 (Itochu), 丸紅 (Marubeni), 双日 (Sojitz). " +
    "Mega-cap consumer / tech: Sony, Nintendo, Panasonic, Sharp, Toyota, Honda, SoftBank, NTT DoCoMo, KDDI au, 楽天 (Rakuten), LINE Yahoo (post-2024 merger of LINE and Yahoo Japan), Mercari, ZOZO, Recruit. " +
    "Mobile gaming / digital: Bandai Namco, Sega, Square Enix, Capcom, Konami, GREE, DeNA, CyberAgent, mixi (operates Monster Strike), Colopl, Cygames. " +
    "Finance: 三菱UFJ銀行 (MUFG), 三井住友銀行 (SMBC), みずほ銀行 (Mizuho), りそな銀行 (Resona), 楽天銀行 (Rakuten Bank), 住信SBIネット銀行 (SBI Sumishin), Japan Post Bank (ゆうちょ). " +
    "Travel / hospitality: JTB, HIS, Rakuten Travel, 一休 (Ikyu), じゃらん (Jalan), 楽天トラベル. " +
    "Match peer references to prospect's tier: enterprise prospects expect shosha / mega-cap references; mobile gaming prospects expect the gaming-tier list; SaaS prospects expect tech-tier and finance-tech references. " +
    "TONE: most formal of the major B2B markets. Japanese B2B chat values: clarity, brevity, precise commitments (avoid wishy-washy modifiers), and acknowledgment of the prospect's perspective before asserting a claim. Avoid hype words and avoid superlatives ('best', 'leading', 'top-tier' all read as foreign-template). 'お忙しいところ恐れ入りますが' is appropriate as a one-time softener in a cold message; do not overuse softeners. Sign-offs: 'よろしくお願いいたします' (standard) or 'ご検討のほど何卒よろしくお願い申し上げます' (formal). Match seasonal greetings only in email contexts, not in chat.",

  "ko-KR":
    "Korean-South Korea (ko-KR): South Korea is the only major Korean B2B adtech market. The base Korean (ko) guide covers moderate adaptation with established adtech terms (리텐션, 설치, 전환, 트래픽, 크리에이티브, 타겟팅, 오디언스) and retained English compound terms (lookalike modeling, A/B test); that all still applies. This regional entry adds South Korea-specific city, currency, peer-brand, and register depth on top of the base ko guide. " +
    "REGISTER LAYERS: Korean B2B uses two main formal registers. Default for cold B2B is 합쇼체 (the -ㅂ니다/-습니다 forms): formal, the standard register for first contact, presentations, and any context where rank-deference matters. Escalate from 합쇼체 to honorific forms (높임말) when referring to the prospect's company actions: 귀사 (your company), 검토해 주시기 바랍니다 (we kindly ask that you review). Use 해요체 (the -아요/-어요 forms) only after the relationship has warmed up; never in cold outreach. NEVER use 해체 (-아/-어 plain forms) or 해라체 (-다 plain forms) in B2B — those are casual / declarative registers used only with close colleagues or subordinates. Korean B2B readers register-tag the message in the first sentence; opening in 해요체 cold is a signal of unfamiliarity with Korean B2B norms. " +
    "ORTHOGRAPHY: Hangul throughout for structural text. English loanwords (CPI, ROAS, A/B test) stay in Latin script; Korean adtech terms in Hangul per the base ko guide. Numbers in half-width Arabic digits with commas: 1,000 / 10,000. Percentages use % (12%), no Korean equivalent symbol needed. " +
    "CURRENCY: KRW (원). The won has no fractional unit in practice; no decimals. For larger amounts the units 만 (10,000) and 억 (100,000,000) are essential: '1,000원' for small, '5만원' for 50K, '500만원' for 5M, '5천만원' for 50M, '1억원' for 100M, '10억원' for 1B. Korean B2B documents almost always use 만 / 억 above 1M for readability; writing '50,000,000원' instead of '5천만원' reads as foreign-template. The Korean unit 천 (1,000) is used in spoken context but rare in formal written B2B (use Arabic '5,000' instead of '오천'). " +
    "CITY/MARKET REFERENCES: 서울 (Seoul, often subdivided by district for B2B context), 부산 (Busan), 인천 (Incheon, port + tech), 대구 (Daegu), 광주 (Gwangju), 대전 (Daejeon, R&D / Daedeok), 수원 (Suwon, Samsung HQ region), 성남 (Seongnam, includes 판교 (Pangyo) tech cluster — the Korean Silicon Valley equivalent), 용인 (Yongin), 고양 (Goyang). Seoul districts that matter for B2B: 강남 (Gangnam, finance / enterprise / luxury retail), 여의도 (Yeouido, finance / broadcasting / National Assembly), 마포 (Mapo, media / startups), 종로 (Jongno, traditional enterprise / government). Latin transliterations (Seoul, Pangyo, Gangnam) are acceptable on chat channels. " +
    "PEER BRANDS by tier: " +
    "Chaebol / mega-enterprise tier: Samsung (삼성), Hyundai (현대 — Hyundai Motor / Hyundai Department Store / Hyundai E&C are different group companies), LG (엘지), SK (에스케이), Lotte (롯데), Hanwha (한화), POSCO (포스코), KT (케이티), Doosan (두산), CJ (씨제이 — CJ ENM / CJ CheilJedang for FMCG and entertainment), Hyosung (효성), Kumho (금호), Shinsegae (신세계). " +
    "Korean tech / digital-native tier: Coupang (쿠팡, e-commerce + fintech + delivery), Kakao (카카오 — KakaoTalk for messaging, KakaoPay for payments, KakaoBank for banking, KakaoMobility for ride / nav, KakaoGames for gaming), Naver (네이버 — search + Webtoon + Naver Pay + Line as subsidiary), Toss (토스, fintech super-app), Karrot Market (당근마켓, hyperlocal commerce), Yanolja (야놀자, travel super-app), Baemin / Woowa Brothers (배달의민족, food delivery), Market Kurly (마켓컬리, premium e-commerce), Musinsa (무신사, fashion). " +
    "Gaming tier: Krafton (크래프톤, PUBG), NCSoft (엔씨소프트, Lineage), Netmarble (넷마블), Nexon (넥슨), Smilegate (스마일게이트, Crossfire / Lost Ark), Pearl Abyss (펄어비스, Black Desert), Com2uS (컴투스). " +
    "Finance: 신한 (Shinhan), KB 국민 (KB Kookmin), 우리 (Woori), 하나 (Hana), 농협 (NongHyup), IBK 기업, KEB 외환. Insurance: 삼성생명, 한화생명, 교보생명. " +
    "Match peer references to prospect's tier: chaebol references for enterprise / industrial / finance prospects; tech-tier references for SaaS / mobile gaming / fintech / e-commerce prospects. Mixing tiers incorrectly (referencing Samsung when pitching a fintech startup) reads as foreign-template. " +
    "TONE: formal, structured, hierarchy-aware. Korean B2B values: explicit acknowledgment of the prospect's company / role before any pitch content, clear logical structure (first / second / third), and concrete numbers over qualitative claims. Avoid hype words (최고, 최상, 1위 without source — these read as advertising rather than B2B). 'Bali / quickly / soon (빨리, 신속히, 조속히)' suggests urgency; use only when contextually justified. Sign-offs: '감사합니다' (standard) or '잘 부탁드립니다' (more formal, kindly-asking register). 'OO 님께' as a written-address form is for letters, not chat.",

  "he-IL":
    "Hebrew-Israel (he-IL): Israel is the only major Hebrew B2B adtech market. The base Hebrew (he) guide covers moderate adaptation with established Hebrew adtech terms (שימור, התקנה, המרה) and many transliterated English terms (טירגוט, טראפיק, קריאייטיבים, פאבלישר, פרה-ביד); that all still applies. This regional entry adds Israel-specific city, currency, peer-brand, and tech-vs-traditional register depth on top of the base he guide. " +
    "SECTOR SPLIT (CRITICAL): Israeli B2B has two distinct sectors with different register and code-mixing norms. Tech sector (Tel Aviv / Herzliya / Raanana startups and scaleups) is heavily English-code-mixed; messages often contain entire English sentences embedded in Hebrew structure, and product / metric names stay in English without transliteration. Traditional sector (banking, insurance, telco, retail, defense / government) uses more Hebrew, transliterates English terms into Hebrew script (טירגוט, ניהול קמפיינים), and prefers a more formal register. Identify the prospect's sector from their company and adjust register accordingly. " +
    "SCRIPT: Hebrew script (RTL) for all structural text. English acronyms (CPI, CPA, ROAS, DSP, LTV, MMP, KPI) stay in Latin script and are embedded inline; Hebrew sentence flow accommodates them naturally. For tech-sector prospects, product names, company names, and many compound adtech terms remain in English (e.g., 'lookalike modeling', 'A/B test', 'attribution window'). For traditional-sector prospects, transliterate more aggressively (לוקאלייק במקום lookalike, אטריביושן במקום attribution). " +
    "ORTHOGRAPHY: Standard Hebrew script. Use modern academic orthography (כתיב מלא): include ו and י as vowel markers (אינטליגנציה not אנטליגנציה). Numbers in half-width Arabic digits left-to-right within RTL flow: 12% / ₪1,500 / 24 שעות. Percentages use % symbol. Mixed Hebrew-English sentences are natural for tech-sector and should not be flagged. " +
    "REGISTER LAYERS: Cold B2B default is informal-but-respectful: שלום to open, second-person addressing with the prospect's first name (Hebrew has no T/V distinction like Sie/du or vous/tu; everyone uses אתה / את). Do NOT use לכבוד (Lichvod) for chat — it is the official-letter opening, reads as stiff and over-formal. אדוני / גברתי (Adoni / Gveret) are also too formal for B2B chat in Israeli norms. Modern Israeli B2B is direct; getting to the point quickly is respected. " +
    "CURRENCY: NIS / ILS (₪, also Shekel / שקל). No decimals for B2B amounts: ₪1,234,567. For amounts above 1M, '1.2 מיליון ₪' or 'מיליון ₪' (million NIS) is standard. For amounts above 1B, 'מיליארד ₪' (billion NIS). USD is also referenced often in Israeli tech contexts (especially for export revenue, fundraising); '$5M ARR' is natural Israeli-tech vocabulary, not a foreign-template error. " +
    "CITY/MARKET REFERENCES: " +
    "Tel Aviv (תל אביב, the commercial center; Rothschild Boulevard for startups, Sarona Tower for enterprise tech, Levinstein Tower for finance) — the heart of Israeli tech. " +
    "Herzliya (הרצליה, Pituach area; major fintech and enterprise tech HQs: Microsoft IL, Apple IL, Amazon IL, Google IL, eBay IL, PayPal IL). " +
    "Raanana (רעננה, mid-size tech HQs and engineering centers). " +
    "Petah Tikva (פתח תקווה, traditional manufacturing turned multinational tech and pharma — Teva, Intel, IBM Israel HQ). " +
    "Jerusalem (ירושלים, government, academic, defense — Mobileye originated there). " +
    "Haifa (חיפה, traditional industry, Intel's first non-US fab, Technion University, Matam tech park). " +
    "Beer Sheva (באר שבע, defense / cyber cluster — Cyber Spark, IDF C4I, Ben-Gurion University). " +
    "Caesarea / Yokneam (קיסריה / יוקנעם, smaller tech parks for hardware / semiconductor companies). " +
    "PEER BRANDS by sector: " +
    "Tech tier (Israeli tech / startup / scaleup): Wix, Monday.com, Lemonade, Riskified, JFrog, ironSource (now part of Unity), Playtika, Fiverr, Lightricks (Facetune), Outbrain, Taboola, AppsFlyer, Vungle (now Liftoff), Gett, Via, SimilarWeb, Sisense, WalkMe, BigPanda. " +
    "Cyber-security tier: Check Point, CyberArk, Imperva, Varonis, Wiz, Snyk, Cybereason, Armis, Claroty, SentinelOne (founded in Israel). " +
    "Mobility / autonomous: Mobileye (Intel), Innoviz, Otonomo, Argus Cyber Security (Continental). " +
    "Energy / cleantech: SolarEdge, Tigo, ZOOZ Power. " +
    "Traditional / sector tier (for non-tech B2B prospects): Bank Hapoalim (בנק הפועלים), Bank Leumi (בנק לאומי), Bank Discount (בנק דיסקונט), Mizrahi Tefahot (מזרחי טפחות), First International (הבנק הבינלאומי), Bank Yahav. Insurance: Migdal, Clal, Phoenix, Harel, Menorah Mivtachim. Telco: Bezeq (בזק), Cellcom (סלקום), Partner Communications (פרטנר, formerly Orange), Pelephone (פלאפון), Hot (הוט). Retail / FMCG: Strauss Group, Tnuva, Osem (Nestle), Super-Sol (שופרסל / Shufersal), Rami Levy (רמי לוי), Tiv Taam, Hetzi Hinam. " +
    "Match peer references to prospect's sector: tech-tier references for SaaS / mobile / fintech prospects; traditional / sector-tier references for banking / insurance / telco / retail prospects. Mixing tiers (referencing Wix when pitching Bank Hapoalim) reads as foreign-template. " +
    "TONE: direct, informal, get-to-the-point. Israeli B2B values: efficiency over politeness rituals, technical accuracy, willingness to challenge assumptions in a debate, and concrete numbers over qualitative claims. Avoid over-formal Hebrew (לכבוד, אדוני, התרשמתי לטובה) which reads as foreign or AI-generated. Avoid hype words (מהפכני, פורץ דרך, מהשורה הראשונה without source) which read as marketing rather than B2B. Sign-offs: 'תודה' (Toda — standard, casual-professional), 'בברכה' (Be'vracha — more formal, traditional sector). 'תודה רבה' is over-effusive for B2B sign-off. The Israeli B2B norm is brevity; long polite preambles read as time-wasting.",

  "tr-TR":
    "Turkish-Turkey (tr-TR): Turkey is the primary Turkish B2B adtech market. The base Turkish (tr) guide covers moderate adaptation with localized adtech terms (hedefleme, dönüşüm, kreatifler); that all still applies. This regional entry adds Turkey-specific city, currency, peer-brand, and Istanbul-tech-vs-Anatolian-conservative cultural depth on top of the base tr guide. " +
    "REGIONAL CULTURAL SPLIT: Turkish B2B has a meaningful Istanbul-tech vs Anatolian-conservative split. Istanbul (especially Levent / Maslak / Etiler finance districts, and Cihangir / Beyoğlu media / startup districts) is internationalized, English-tolerant, faster-paced, and uses more English code-mixing. Ankara is government / defense, more formal, less English-tolerant. Bursa / Konya / Gaziantep / Kayseri (Anatolian manufacturing centers) are more conservative, prefer fully-Turkish content, and value relationship-building before business. Identify the prospect's city / company HQ and adjust register accordingly. " +
    "REGISTER LAYERS: Turkish has formal Siz vs informal Sen distinction (analogous to Spanish usted/tu or French vous/tu). Cold B2B always uses Siz; never Sen for first contact, regardless of channel. 'Sayın {LastName} Bey / Hanım' is the formal email-equivalent register; 'Merhaba {FirstName} Bey / Hanım' is the standard chat opening for cold B2B; 'Merhaba {FirstName},' (first-name-only, no honorific) is acceptable on WhatsApp / Telegram once the relationship has warmed up but reads as too informal for cold. The honorifics 'Bey' (Mr.) and 'Hanım' (Ms.) follow the first name, not the last name (so 'Ahmet Bey' not 'Bey Ahmet'). " +
    "ORTHOGRAPHY: Turkish uses Latin script with diacritics: ç, ğ, ı (dotless i), İ (dotted capital I), ö, ş, ü. Get these right; missing diacritics read as foreign-template. Note the dotted/dotless i distinction: 'İstanbul' starts with dotted İ (uppercase form), not 'Istanbul'. Numbers use European convention: period as thousands separator, comma as decimal: '₺1.234.567,89'. Percentages use % symbol (12%); never spell out 'yüzde'. " +
    "CURRENCY: TRY (₺, Turkish lira). Significant inflation context: the lira has experienced rapid devaluation, so amounts in lira require care — large lira figures (₺100.000.000) may sound impressive but represent moderate USD value. Many Turkish B2B contexts dual-quote in USD or EUR alongside lira, especially for software / SaaS pricing. 'bin' (thousand) and 'milyon' (million) are informal-context units; '₺5 milyon' is natural in business chat. For formal B2B documents, full numerals with European separators. " +
    "CITY/MARKET REFERENCES: " +
    "İstanbul (the commercial center; ~16M population; finance and enterprise tech concentrated on Avrupa Yakası (European side) — Maslak (banking and corporate HQs), Levent (finance and consulting), Etiler (premium retail and tech), Şişli (mixed enterprise). Media and startups concentrate around Cihangir / Beyoğlu / Karaköy. Asya Yakası (Asian side) is more residential with some manufacturing). " +
    "Ankara (the capital; ~5.7M; government, defense industry — TUSAŞ / Turkish Aerospace, Aselsan, Roketsan, HAVELSAN; ODTÜ / METU university tech transfer). " +
    "İzmir (~4.4M, port and export hub, manufacturing). " +
    "Bursa (~3M, automotive manufacturing — Renault, Tofaş, Karsan). " +
    "Antalya (~2.5M, tourism economy). " +
    "Gaziantep (~2M, food / textile / regional B2B; the largest Turkish city near the Syrian border). " +
    "Kayseri / Konya / Adana (~1-2M each, Anatolian manufacturing). " +
    "PEER BRANDS by tier: " +
    "Tech / digital-native tier: Trendyol (Alibaba-backed, the dominant Turkish e-commerce platform), Hepsiburada (publicly listed e-commerce, founded in Turkey), Getir (quick-commerce pioneer, founded in Istanbul, expanded internationally then retrenched), Yemeksepeti (food delivery, owned by Delivery Hero), Migros Sanal (online grocery, part of Migros Ticaret), Papara (fintech / prepaid cards), İninal (prepaid), BiP (Türkcell's messaging app, the Turkish-internal WhatsApp alternative), Akakçe (price comparison), Sahibinden.com (classifieds, the dominant Turkish marketplace), N11 (e-commerce), Çiçeksepeti (flowers / gifts). " +
    "Traditional / holding-group tier: Koç Holding (the largest Turkish conglomerate — Arçelik, Tofaş, Tüpraş, Yapı Kredi Bank), Sabancı Holding (Akbank, Brisa, Carrefoursa, Enerjisa), Doğuş Holding (Garanti BBVA, Doğuş Otomotiv), Eczacıbaşı Holding (Vitra, İpek Kağıt), Anadolu Group (Anadolu Efes, McDonald's Turkey, Migros). Banking: Türkiye İş Bankası (the largest private bank, often called just 'İş Bankası'), Garanti BBVA, Akbank, Yapı Kredi, Ziraat Bankası (state-owned, largest by assets), VakıfBank (state), Halkbank (state), DenizBank (Emirates NBD), QNB Finansbank, TEB. Telco: Turkcell (largest), Vodafone Turkey (Vodafone TR), Türk Telekom (state). Aviation: Türk Hava Yolları / THY (Turkish Airlines), Pegasus Airlines (low-cost). Retail: Migros, BİM (discount), A101 (discount), ŞOK (discount). Industrial: Arçelik (white goods, Koç), Vestel (electronics), Tüpraş (refining, Koç), Ford Otosan (automotive, Koç). " +
    "Match peer references to prospect's tier: holding-group references for enterprise / banking / industrial; tech-tier references for SaaS / e-commerce / fintech / mobile gaming. Mixing tiers (referencing Trendyol when pitching İş Bankası) reads as foreign-template. " +
    "TONE: respectful-but-direct. Turkish B2B values: explicit recognition of seniority and titles in first contact (using Bey / Hanım), clear logical structure, and tangible business outcomes over abstract claims. Anatolian / conservative prospects expect more relationship-building preamble before the pitch; Istanbul tech / startup prospects expect faster, more direct outreach. Avoid hype words ('benzersiz', 'sektör lideri' without source, 'devrim') which read as advertising. Sign-offs: 'Saygılarımla' (most formal, traditional / Anatolian appropriate), 'İyi çalışmalar' (cordial, the standard B2B sign-off — literally 'good work'), 'Teşekkürler' (more casual, Istanbul tech appropriate). Choose sign-off to match the opening register and the prospect's sector.",
};

/**
 * Build the nativeness rule block that gets injected into LLM prompts
 * for non-English emails. Returns empty string for English/unknown/empty.
 */
export function buildNativenessBlock(languageTag: string | null | undefined): string {
  // B-locale-plumbing: full tag first, fall back to primary subtag.
  const tag = (languageTag ?? "").trim();
  if (!tag) return "";
  const lang = normalizeLanguageCode(tag);
  if (!lang) return "";

  const fullTagGuide = GUIDES[tag];
  if (fullTagGuide === undefined && lang === "en") return "";

  const guide = fullTagGuide || GUIDES[lang] ||
    `Language tag ${languageTag}: No specific code-switching guide ` +
    "available. Default rules: keep English acronyms (CPI, CPA, ROAS, " +
    "DSP, LTV, MMP, D7) and translate only terms that have " +
    "well-established local equivalents in this language's " +
    "adtech/marketing industry. When in doubt, keep the English term — " +
    "over-translation sounds worse than under-translation.";

  return (
    `LANGUAGE NATIVENESS RULES for tag ${languageTag}:\n` +
    "You are writing AS a native speaker of this language who works in " +
    "adtech, NOT translating from English.\n" +
    "\n" +
    "CODE-SWITCHING GUIDE:\n" +
    `* ${guide}\n` +
    "\n" +
    "GLOBAL RULES (apply to ALL non-English emails — these override any " +
    "ambiguity in the language-specific guide above):\n" +
    "\n" +
    "* CONSISTENCY: once you choose to translate or keep a term, use that " +
    "same form EVERY time it appears in the email. Switching between the " +
    "English and translated form of the same concept is a critical error.\n" +
    "\n" +
    "* SCRIPT-MIXING IS FORBIDDEN (severity: critical). This is the single " +
    "most common and detectable sign of a non-native email. If the target " +
    "language uses a non-Latin script (Cyrillic, CJK, Arabic, Hebrew, Greek, " +
    "Devanagari, Thai, Korean, etc.), then EVERY English compound term must " +
    "be either:\n" +
    "  (a) Fully transliterated into the target script, OR\n" +
    "  (b) Kept fully in Latin/English as a standalone term.\n" +
    "  NEVER place a Latin/English word directly adjacent to non-Latin " +
    "characters. The ONLY exception is pure 2-4 letter acronyms (CPI, ROAS, " +
    "DSP, LTV, D7, MMP, KPI, IAP, ML, SDK, OEM) which may be hyphenated " +
    "to non-Latin words.\n" +
    "  Violations by script:\n" +
    "  - Cyrillic: 'pre-bid скрининг' 'in-app сеть' 'programmatic-платформа' " +
    "'look-alike аудитории' → transliterate to пре-бид, инапп, программатик, лукэлайк\n" +
    "  - Japanese: 'pre-bid審査' 'fraud対策' 'anomaly detection' 'geo targeting' " +
    "→ convert to プレビッド審査, フラウド対策, アノマリー検知, ジオターゲティング\n" +
    "  - Chinese: 'pre-bid筛选' 'cohort异常' 'lookalike定向' " +
    "→ convert to 竞价前筛选, 群组异常, 相似受众定向\n" +
    "  - Korean: 'pre-bid입찰' 'lookalike타겟팅' → convert to 프리비드 입찰, " +
    "룩어라이크 타겟팅\n" +
    "  - Arabic: 'pre-bid مزايدة' → convert to ما قبل المزايدة\n" +
    "  - Hebrew: 'pre-bid סינון' → convert to פרה-ביד סינון or סינון מוקדם\n" +
    "  - Greek: 'pre-bid προσφορά' → convert to προ-προσφοράς\n" +
    "  Apply this rule to EVERY non-Latin-script language, even if not " +
    "listed above.\n" +
    "\n" +
    "* FOR LATIN-SCRIPT LANGUAGES (Spanish, Portuguese, French, Italian, " +
    "Polish, Czech, Romanian, Hungarian, Turkish, Finnish, etc.): script-mixing " +
    "is not visually jarring, but CONSISTENCY still applies. If your guide says " +
    "to translate a term, translate it every time. Do not leave untranslated " +
    "English compound terms scattered through otherwise localized prose.\n" +
    "\n" +
    "* NATURAL CONNECTORS: use the target language's natural sentence " +
    "connectors and transition phrases, not translated English ones.\n" +
    "\n" +
    "CRITICAL: The code-switching guide for your language specifies which " +
    "terms to translate and which to keep. Follow it exactly. When it says " +
    "MANDATORY or lists a translation with '>', that term MUST be translated. " +
    "Do NOT leave it in English."
  );
}

/**
 * Concise check rules for the critic. Returns a short block listing the
 * language-specific nativeness violations to flag — shorter than the full
 * generator block since the critic just needs to score, not generate.
 */
export function buildCriticNativenessBlock(languageTag: string | null | undefined): string {
  // B-locale-plumbing: full tag first, fall back to primary subtag.
  const tag = (languageTag ?? "").trim();
  if (!tag) return "";
  const lang = normalizeLanguageCode(tag);
  if (!lang) return "";

  const fullTagGuide = GUIDES[tag];
  if (fullTagGuide === undefined && lang === "en") return "";

  const guide = fullTagGuide || GUIDES[lang];
  if (!guide) {
    return (
      `Language ${languageTag}: no specific guide on file. Still flag: ` +
      "(a) inconsistent code-switching where the same concept appears " +
      "both translated and in English within the same email, " +
      "(b) Latin script directly adjacent to non-Latin characters in a " +
      "compound term, (c) over- or under-translation relative to how " +
      "native adtech professionals in this market actually write."
    );
  }

  return (
    `LANGUAGE-SPECIFIC CHECKS for ${languageTag}:\n` +
    `The email should follow this code-switching pattern: ${guide}\n` +
    "\n" +
    "Flag as language_naturalness violations:\n" +
    "- Any English compound term this guide says to translate but which " +
    "appears in English in the draft.\n" +
    "- Any term this guide says to keep in English but which appears " +
    "awkwardly over-translated.\n" +
    "- Any inconsistency where the same concept appears in both forms.\n" +
    "- (For non-Latin-script languages) any Latin/English word directly " +
    "adjacent to non-Latin characters in a compound term (e.g. " +
    "'pre-bid скрининг', 'fraud対策', 'lookalike定向', 'pre-bid筛选'). " +
    "Acronyms (CPI, ROAS, DSP, LTV, D7, MMP) hyphenated to non-Latin " +
    "words are acceptable (e.g. 'D7-удержание', 'ROAS-оптимизация')."
  );
}
