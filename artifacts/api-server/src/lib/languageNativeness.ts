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

  "en-BE":
    "Belgian English (en-BE; covers Belgium B2B in mobile adtech, tech, and most international-enterprise contexts): Belgian B2B in mobile adtech and tech-enterprise contexts defaults to English as the neutral lingua franca between Flemish-speaking north (~60% of population, including Antwerp / Ghent / Bruges / Leuven and the Flanders region) and French-speaking south (~40%, Liege / Charleroi / Mons / Namur and the Wallonia region), with Brussels officially bilingual (French + Dutch) plus a small German-speaking eastern community. International firms operating in Belgium and the EU institutions in Brussels overwhelmingly default to English. If a buyer is explicitly Flemish-only (e.g., domestic SME in West Flanders, Brugge), use nl; if Walloon-only, use fr or fr-BE. The default for cross-Belgium B2B is en-BE. " +
    "B2B WhatsApp register: 'Hi {NAME},' direct and warm; 'Hello {NAME},' for cold email; 'Dear {NAME},' for the most formal contexts. " +
    "SPELLING: Use en-GB spelling (organisation, optimisation, behaviour, centre, prioritise, analyse, defence, licence/license, travelled). Belgian English follows European-English conventions, NOT American. Avoid Americanisms ('gotten', 'awesome', 'super'). " +
    "ADTECH VOCABULARY: standard English terms; Belgian B2B vocabulary aligns with European-English mobile adtech conventions. No localisation needed. " +
    "CURRENCY: EUR (€), European separators: '€1.234.567,89' (period thousands, comma decimal). 'mln' (million) and 'mld' (miljard / billion) abbreviations are sometimes used; full numerals safer for formal B2B. " +
    "CITY/MARKET REFERENCES: " +
    "Brussels (Bruxelles / Brussel, the capital region, ~1.2M; the political and EU institutions HQ — European Commission, European Parliament, European Council, NATO HQ; the dominant Belgian B2B destination especially for tech / multinationals / consultancies / EU-adjacent business; Avenue Louise / Louizalaan and the European Quarter / Schuman for premium and EU-lobbying business, North Quarter for finance and corporate HQs, Etterbeek / Ixelles for tech and creative). " +
    "Antwerp (Antwerpen, ~520K; Belgium's largest port and one of Europe's largest by tonnage; diamond trade global hub; second-largest Flemish business hub; logistics, chemicals, fashion). " +
    "Ghent (Gent, ~265K; the secondary Flemish tech and life-sciences hub — Universiteit Gent / UGent, VIB biotech cluster, Showpad HQ, growing IT). " +
    "Liege (Liege, ~195K; the largest Walloon city; traditional industrial / steel heritage transitioning to logistics + emerging tech; Universite de Liege). " +
    "Charleroi (~200K; Walloon industrial city; BSCA airport — major Ryanair hub). " +
    "Leuven (Louvain, ~100K; KU Leuven — one of the oldest European universities; IMEC — world-leading semiconductor research institute, major tech-transfer source; biotech cluster). " +
    "Bruges (Brugge, ~120K; West Flanders tourism + traditional industry). " +
    "Mons (~95K; Walloon city; SHAPE NATO HQ). " +
    "PEER BRANDS by tier: " +
    "Banking tier (Belgian banking is now largely consolidated and partly foreign-owned): KBC Group (Belgian-listed BVB, the largest Belgian bank by retail metric, KBC Bank Belgium + ČSOB Czech / KBC Slovakia / K&H Hungary regional reach — KBC is a regionally significant Central European bank; Belgian B2B reflexively knows KBC), BNP Paribas Fortis (Belgian operation of BNP Paribas France, the largest by various corporate metrics — formed from the 2008 Fortis Bank breakup), ING Belgium (Dutch ING Group, third-largest), Belfius (state-owned post-2011 nationalisation of Dexia Belgium, retail + corporate), Argenta (Belgian-owned cooperative, retail focus), Crelan, Beobank, Deutsche Bank Belgium. " +
    "Pharma / Chemicals tier (Belgium is a European pharma manufacturing hub): UCB (Union Chimique Belge, biopharma BVB-listed, epilepsy and immunology focus), Janssen Pharmaceutica (part of Johnson & Johnson, Beerse Belgium HQ — one of the largest J&J global research centers; HIV antiretrovirals + schizophrenia + oncology), Solvay (chemicals BVB-listed, recently split into Solvay + Syensqo 2023), Tessenderlo Group (specialty chemicals BVB-listed), GSK Belgium / Wavre (the largest vaccine production site in the world by some metrics — GSK Vaccines), Pfizer Belgium / Puurs (mRNA COVID vaccine production site). " +
    "Industrial tier: Umicore (recycling, battery materials, catalysts; BVB-listed, the most internationally referenced Belgian industrial), Bekaert (steel wire, BVB-listed), Agfa-Gevaert (imaging, BVB-listed), Sioen Industries (technical textiles), Recticel (foams), Etex (building materials), Aliaxis (plastic piping). " +
    "Beer / FMCG: AB InBev (Anheuser-Busch InBev, the largest beer company globally by volume, Leuven HQ Belgium — Belgian B2B reflexively knows AB InBev; brands include Budweiser, Stella Artois, Corona, Hoegaarden, Leffe — Stella Artois and Leffe are Belgian-heritage), Lotus Bakeries (Biscoff cookies, BVB-listed), Spadel (water, owns Spa brand). " +
    "Retail / FMCG: Colruyt Group (the largest Belgian-owned retail group — Colruyt + Okay + Bio-Planet + Dreamland; the Belgian retail-cost-leader reference), Delhaize (Belgian heritage, now part of Ahold Delhaize global), Carrefour Belgium, Lidl Belgium, Aldi Belgium, Spar Belgium. " +
    "Telco: Proximus (the incumbent telco, state-owned-majority via Belgian Federal Holding, BVB-listed; the dominant Belgian fixed + mobile), Orange Belgium (formerly Mobistar, Orange France subsidiary), Telenet (cable + mobile, part of Liberty Global's BASE / Telenet operations — recently delisted post-Liberty Global private offer). " +
    "Tech / digital tier: Odoo (Belgian-founded ERP / business apps, Louvain-la-Neuve HQ; open-source + commercial; the most internationally successful Belgian tech company, Belgian B2B reflexively cites it as the local tech success story), Showpad (sales enablement, Ghent + Chicago dual HQ; one of the most internationally visible Belgian SaaS), Collibra (data intelligence / data governance, US HQ now but Belgian-founded, Brussels major office), Teamleader (CRM / project management / quoting), Tobania (IT services), Ontoforce (life-sciences data search), iText (PDF library, Ghent + US). " +
    "E-commerce: Bol.com (Dutch but huge Belgian presence — the dominant Benelux marketplace), Coolblue Belgium, Amazon.com.be (recently launched Belgian Amazon operation), Wehkamp Belgium, Vente-Exclusive (private sales). " +
    "Mobility / delivery: Wolt Belgium (Finnish DoorDash-owned), Deliveroo Belgium, Bolt Belgium, Uber Belgium. " +
    "TONE: formal-warm. Belgian business culture sits between Dutch directness and French politeness — more polite than Netherlands (no abrupt openers), less ceremonial than France (get to the point within 2-3 sentences). Belgian B2B values: clear professional respect, explicit acknowledgment of the prospect's context, concrete deliverables, and a slightly slower / more consensus-oriented pace than Anglo-Saxon norms. Where relevant (e.g., partnership across Flanders / Wallonia / Brussels), acknowledging the linguistic-region complexity reads as Belgian-aware. Avoid hype words ('revolutionary', 'best-in-class', 'unique' without justification) which read as foreign-template. Brussels EU-adjacent business has its own register — more formal, more regulatory-aware. Match peer tier to prospect's company sector: banking for finance, UCB / Janssen / Solvay for pharma / chemicals, AB InBev / Colruyt for FMCG / retail, Proximus / Orange / Telenet for telco, Odoo / Showpad / Collibra for tech / SaaS.",

  "en-NL":
    "Dutch B2B in English (en-NL; covers Netherlands B2B in mobile adtech, tech, SaaS, and most international-enterprise contexts): Netherlands B2B in mobile adtech and tech-enterprise overwhelmingly uses English internally and externally. Approximately one in four Dutch enterprises uses English as the primary working language, and the share is much higher in tech / SaaS / international B2B / startup contexts. Use bare nl for explicitly Dutch-language requests; en-NL is the default for Dutch tech B2B. Amsterdam tech / Eindhoven semiconductor / Rotterdam logistics-tech all operate primarily in English. " +
    "B2B WhatsApp register: 'Hi {NAME},' is the chat default; 'Hello {NAME},' for cold email; 'Dear {NAME},' for the most formal contexts. " +
    "SPELLING: Use en-GB spelling (organisation, optimisation, behaviour, centre, prioritise, analyse, defence, licence/license, travelled). Dutch English follows European-English conventions, NOT American. Avoid Americanisms ('gotten', 'awesome', 'super'). " +
    "ADTECH VOCABULARY: standard English terms; Dutch B2B aligns with European-English mobile adtech conventions. No localisation needed. " +
    "CURRENCY: EUR (€), European separators: '€1.234.567,89' (period thousands, comma decimal). 'mln' (million) and 'mld' (miljard / billion) abbreviations are common; full numerals for formal B2B contexts. " +
    "CITY/MARKET REFERENCES: " +
    "Amsterdam (the commercial / political center; ~880K city + ~2.5M Amsterdam Metropolitan Area; THE dominant Dutch tech hub by every B2B metric. Zuidas business district for finance, corporate HQs, and law firms — comparable to Frankfurt's banking district or London's Canary Wharf; Centrum / Jordaan / De Pijp for traditional business, agencies, and creative; Houthavens / NDSM / Amsterdam Noord for tech / startup; Schiphol airport area for logistics + tech offices). " +
    "Rotterdam (~660K; the largest European port by tonnage and the second-largest Dutch city; manufacturing + logistics + maritime tech; Erasmus University Rotterdam; recent tech and architecture growth). " +
    "The Hague (Den Haag, ~560K; government + international institutions including the International Court of Justice / ICJ, International Criminal Court / ICC, OPCW, Europol, Eurojust; growing tech and impact-investing scene). " +
    "Utrecht (~360K; central transport hub; healthcare and retail HQs — Rabobank HQ; Utrecht University; central Netherlands science park). " +
    "Eindhoven (~245K; THE Dutch high-tech / deep-tech hub — ASML in nearby Veldhoven, Philips global HQ, NXP Semiconductors, Brainport Eindhoven region; TU/e Eindhoven University of Technology; the Dutch Silicon Valley equivalent and a critical European semiconductor cluster). " +
    "Groningen (~235K; northern Netherlands; energy historically — Groningen gas field, now winding down — and growing tech). " +
    "Tilburg (~225K, southern Netherlands; logistics + manufacturing). " +
    "Breda (~185K, southern Netherlands; food + logistics). " +
    "PEER BRANDS by tier: " +
    "Tech / digital tier (Netherlands is one of the most internationally tech-successful European countries per capita): Booking.com (the dominant Dutch tech success — Amsterdam HQ, Nasdaq-listed BKNG, owned by Booking Holdings; Dutch B2B reflexively knows Booking as the local tech reference), ASML (Veldhoven HQ near Eindhoven; the global EUV lithography monopoly — produces the only machines capable of advanced semiconductor production; the most valuable Dutch company by market cap; a critical reference for any deep-tech or semiconductor-adjacent B2B), Adyen (Amsterdam HQ, payments unicorn, AEX-listed — the Dutch Stripe; serves Uber, Spotify, Netflix, Microsoft, McDonald's globally), Mollie (Amsterdam HQ, payments unicorn — SMB-focused vs Adyen's enterprise), TomTom (Amsterdam HQ, navigation / mapping / automotive software, AEX-listed), Just Eat Takeaway.com (Amsterdam HQ post-merger; food delivery), Coolblue (e-commerce + electronics retail; Rotterdam HQ), Bol.com (Benelux marketplace dominant; private), WeTransfer (Amsterdam, file sharing — recently sold to Bending Spoons Italy), Mendix (Rotterdam, low-code platform — Siemens-acquired 2018), Backbase (Amsterdam, banking software platform), Mews (originally Czech but Amsterdam HQ now, hospitality software), Picnic (Dutch online grocery, founded Amsterdam, expanded to Germany / France), Channable (Utrecht, e-commerce feed management), Bynder (Amsterdam, digital asset management), Messagebird / Bird (Amsterdam, CPaaS — communications platform). " +
    "Banking tier: ING Group (the largest Dutch bank, AEX-listed; also major in Belgium / Germany / Poland — ING Group is regionally significant in Western Europe), Rabobank (cooperative; food / agriculture global focus — the dominant agri-finance bank globally), ABN AMRO (AEX-listed; retail + corporate; partially state-owned post-2008 bailout), Triodos Bank (ethical / sustainable banking, Dutch-founded). " +
    "Industrial tier (Netherlands has a strong industrial / chemicals / consumer goods base): Philips (Eindhoven HQ; healthcare technology focus post-divestment of consumer electronics and lighting; AEX-listed PHIA), DSM-Firmenich (nutrition / health / specialty chemicals; merged 2023 with Swiss Firmenich; AEX-listed), Akzo Nobel (paints / coatings; AEX-listed), Unilever (Anglo-Dutch consumer goods historically; the Dutch part of the dual HQ unified to UK in 2020 but Dutch heritage references remain valid), Heineken (the largest Dutch brewer and second-largest globally; AEX-listed HEIA — the global Dutch beer reference), Shell (formerly Dutch HQ; moved primary listing to London 2021 but Dutch industrial heritage still cited). " +
    "Telco: KPN (incumbent former state, AEX-listed; the dominant Dutch fixed + mobile), VodafoneZiggo (joint venture between Vodafone UK and Liberty Global's Ziggo cable; mobile + cable bundled), Odido (the new brand combining T-Mobile Netherlands post-2024 acquisition by Apax Partners and Warburg Pincus from Deutsche Telekom — replacing the T-Mobile brand for Dutch operations), Tele2 Netherlands (smaller). " +
    "Retail / FMCG: Albert Heijn (Ahold Delhaize; the dominant Dutch supermarket chain, ~35% market share — the Dutch retail reference), Jumbo (second-largest Dutch supermarket, family-owned), Lidl Netherlands, Aldi Netherlands, Plus (cooperative), Dirk (discount), HEMA (department stores, Dutch heritage retail brand), Bijenkorf (premium department store), Action (discount retail — Dutch-founded, expanded internationally to ~15 European countries; private). " +
    "Mobility / delivery: Wolt Netherlands (Finnish DoorDash-owned), Bolt Netherlands (Estonian), Uber Netherlands, Flink (Dutch quick-commerce groceries), Picnic (Dutch online grocery — both retail and tech reference), Thuisbezorgd (Just Eat Takeaway Dutch operation). " +
    "TONE: extremely direct, low-context, Calvinist-pragmatic. Dutch business culture is famously THE most direct in Europe. Specific Dutch B2B norms worth respecting: " +
    "1. No small talk — get to the point in the first sentence; American-style 'Hope you're having a great week!' reads as foreign-template. " +
    "2. No hedging — Dutch readers expect concrete claims with concrete numbers. 'Should improve' beats 'will transform'; '12 hours saved per week' beats 'productivity unlocked'. " +
    "3. No hype — avoid 'revolutionary', 'best-in-class', 'unique', 'unlock value', 'game-changing', 'no-brainer', 'cutting-edge'. These trigger immediate skepticism and read as American-template. Concrete numbers + qualified claims beat hype every time. " +
    "4. Counter-questions are normal — expect pushback on claims; Dutch buyers will challenge data, ask for proof, ask for failure cases. This is engagement, not hostility. " +
    "5. 'No' means 'no' — Dutch buyers don't soften rejections with 'let's circle back' or 'not at this time'. A 'no' is final; respect it and move on. " +
    "6. Transparency about limitations is a positive signal — admitting 'our product doesn't yet support X' builds more trust than glossing over gaps. " +
    "7. The Dutch B2B reader generally has a high degree of skepticism toward outbound sales contact; messages that lead with 'I noticed' or 'I researched' often read as scripted. Lead with concrete and relevant context (a recent company event, a specific job-spec match, a measurable outcome). " +
    "Match peer tier to prospect's company sector: ING / Rabobank / ABN AMRO for finance, Philips / DSM / ASML for industrial / deep-tech, Booking / Adyen / Mollie / TomTom for tech / SaaS, KPN / Odido / VodafoneZiggo for telco, Albert Heijn / Jumbo / HEMA for retail, Action / Picnic / Coolblue for value-tech-retail.",

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

  "it-IT":
    "Italian-Italy (it-IT): Italy is the primary Italian B2B adtech market. The base Italian (it) guide covers moderate localization with established adtech terms (conversione, targeting [kept], installazione, retention or fidelizzazione, traffico, creatività, audience [kept], pre-bid [kept, standard], lookalike [or 'pubblico simile'], cohort, geo-targeting); that all still applies. This regional entry adds Italy-specific city, currency, peer-brand, and register depth on top of the base it guide. " +
    "REGIONAL CULTURAL SPLIT: Italian B2B has a meaningful North vs Center vs South split. Industrial-North (Milano, Torino, Genova, Bologna, Brescia, Verona) is the commercial / industrial / financial heart; faster-paced, more international, English-tolerant in tech contexts. Bureaucratic-Center (Roma) is government / state-owned-enterprise / institutional; slower, more formal, prefers Italian over English borrowings. South / Mezzogiorno (Napoli, Bari, Palermo, Catania, Salerno) has smaller but growing B2B; values relationship-building, family / personal connections. Identify the prospect's HQ city and adjust pace and register accordingly. " +
    "REGISTER LAYERS: Italian B2B uses formal Lei register for cold outreach; never tu for first contact. 'Lei' is the third-person singular polite form (analogous to Spanish usted or German Sie). Verbs conjugate to third-person singular even though the recipient is being addressed directly: 'Vorrei proporLe una collaborazione' (I would like to propose a collaboration TO YOU, using the Le clitic). The plural polite form 'Loro' (third-person plural) is archaic and not used in modern B2B; use Lei for single recipients, voi for plural informal contexts only. The polite imperative uses the subjunctive: 'Mi faccia sapere' (Let me know), not 'Fammi sapere' (which would be tu register). " +
    "ORTHOGRAPHY: Standard Italian orthography. Apostrophes for elision (l'azienda, dell'industria, un'opportunità — feminine un' with apostrophe, masculine un without). Accented vowels matter: è (is, with grave) vs e (and, no accent); è / é distinction (perché has acute, caffè has grave). Numbers use European convention: period as thousands separator, comma as decimal — '€1.234.567,89'. Percentages use % symbol (12%), never 'per cento' spelled out in B2B writing. " +
    "CURRENCY: EUR (€). Standard European separators: period thousands, comma decimal. '€1.234.567,89' for formal documents; '€1,2 milioni' or '1,2 milioni di euro' for amounts above 1M in body text. For very large figures: 'miliardo' (billion) — '€1 miliardo'. Italian writes the currency symbol after the amount in formal contexts ('1.500,00 €') but the prefix form '€1.500,00' is universally accepted on chat and modern B2B. " +
    "CITY/MARKET REFERENCES: " +
    "Milano (Milan, the commercial and financial capital; Borsa Italiana / FTSE MIB stock exchange; Porta Nuova for finance HQs; Brera and Quadrilatero della Moda for fashion; Bicocca / Lambrate for tech / startup; Linate / Malpensa airports). " +
    "Torino (Turin, the industrial capital; Stellantis / Fiat headquarters; aerospace / Leonardo). " +
    "Roma (the capital; government, state-owned enterprises — Eni, Enel, Leonardo, Poste Italiane, RAI). " +
    "Bologna (food / packaging / mechanical engineering — Ducati nearby). " +
    "Genova (shipping / Banca Carige / port — the largest Italian port). " +
    "Firenze (Florence; fashion, leather, banking — Gucci, Salvatore Ferragamo, Monte dei Paschi historically). " +
    "Venezia / Padova / Verona (Veneto industrial corridor; fashion, mechanical, glass). " +
    "Napoli (Naples; growing SME hub, food / Mezzogiorno tech). " +
    "Bari / Palermo / Catania (Southern hubs; smaller B2B but expanding). " +
    "PEER BRANDS by tier: " +
    "Enterprise / state and finance tier: Eni (energy major), Enel (utilities), Generali (insurance, the largest Italian insurer), UniCredit (banking, the largest Italian bank), Intesa Sanpaolo (banking), Banco BPM, Mediobanca (investment banking), Poste Italiane (post + bank + insurance + telco), Telecom Italia / TIM (telco), Mediaset (private broadcaster), Sky Italia, RAI (public broadcaster), Leonardo (defense / aerospace). " +
    "Industrial tier: Fiat / Stellantis (automotive, multinational after PSA merger), Ferrari (luxury automotive), Lamborghini (luxury automotive, VW Group), Lavazza (coffee), illy (coffee, Trieste), Barilla (pasta), Ferrero (Nutella, Kinder, Tic Tac), Campari Group (Aperol, Negroni vermouth), Pirelli (tyres), Luxottica (now EssilorLuxottica, eyewear), Prada, Armani, Versace, Gucci (Kering), Bottega Veneta, Salvatore Ferragamo, Moncler, Brunello Cucinelli. " +
    "Tech / digital-native tier: Subito.it (classifieds), Immobiliare.it (real estate), Telepass (electronic tolling / mobility), Satispay (fintech / payments), Nexi (the dominant Italian payments group, includes Nets and SIA), Esselunga (online grocery), DoveConviene / ShopFully (retail tech), Bending Spoons (mobile apps, IPO 2024), Musixmatch (lyrics tech), Octo Telematics (telematics / insurance tech), Tinaba (mobile banking). " +
    "Match peer references to prospect's company tier: enterprise / industrial references for traditional sectors, tech-tier references for SaaS / e-commerce / fintech / mobile. " +
    "TONE: formal-warm, structured. Italian B2B values: explicit professional respect in opening, clear logical progression, concrete examples, and avoiding direct sales-y hype. Avoid hype words ('rivoluzionario' without source, 'unico nel suo genere', 'leader di settore' without numbers) which read as advertising. Sign-offs: 'Cordiali saluti' (formal standard, most common B2B), 'Distinti saluti' (most formal, very respectful), 'Un cordiale saluto' (slightly warmer, modern B2B), 'A presto' (casual / warm thread, NOT cold). Choose sign-off to match opening: 'Salve' / 'Buongiorno' opening pairs with 'Cordiali saluti' close; 'Gentile' opening pairs with 'Distinti saluti' close.",

  "pl-PL":
    "Polish-Poland (pl-PL): Poland is the only major Polish B2B adtech market. The base Polish (pl) guide covers heavy localization with established adtech terms (retencja, instalacja, konwersja, targetowanie, atrybucja, lookalike or 'podobni użytkownicy', cohort or 'kohorta', publisher or 'wydawca'); that all still applies. This regional entry adds Poland-specific city, currency, peer-brand, and Pan/Pani register depth on top of the base pl guide. " +
    "REGISTER LAYERS: Polish B2B uses the formal Pan (Mr.) / Pani (Ms.) register for cold outreach. The polite address pattern is third-person singular with Pan / Pani: 'czy mógłby Pan zarezerwować czas' (would you Mr. reserve time) — the verb conjugates to third-person (mógłby) and Pan / Pani functions as the formal pronoun. NEVER use second-person ty (you-informal) for cold B2B; it's the equivalent of using 'du' in a German first contact, immediately tags the writer as unfamiliar with Polish business norms. Once warm, ty is acceptable but only after the prospect signals it (mutual transition signals: 'Mówmy sobie po imieniu' — let's call each other by first names). " +
    "GREETING REGISTERS: " +
    "'Dzień dobry, {NAME},' — standard chat opening, works through the day. " +
    "'Witam Pana {LastName},' / 'Witam Panią {LastName},' — slightly more formal, email-equivalent. " +
    "'Szanowny Panie {LastName},' / 'Szanowna Pani {LastName},' — most formal, used in serious business letters; rare on WhatsApp / Telegram / Slack. " +
    "'Cześć' — informal / young-tech register, NEVER for cold B2B regardless of channel. " +
    "ORTHOGRAPHY: Polish Latin script with diacritics: ą, ć, ę, ł, ń, ó, ś, ź, ż. Get these right; missing diacritics read as foreign-template (e.g., 'Dzień dobry' not 'Dzien dobry'). Numbers use space as thousands separator and comma as decimal: '1 234 567,89' (NOT period, NOT comma for thousands). Percentages use % symbol (12%), never 'procent' spelled out in B2B. " +
    "CURRENCY: PLN (złoty, symbol zł). Currency follows the amount with a space: '1 234 567,89 zł'. The abbreviation 'tys.' (tysięcy / thousands) is informal-context: '5 tys. zł' means 5,000 PLN. 'mln' (milionów) is widely used: '1,2 mln zł' means 1.2 million PLN. For formal B2B, use full numerals with space separators. Some Polish B2B contexts also quote in EUR (€) for multinational dealings; both are normal. " +
    "CITY/MARKET REFERENCES: " +
    "Warszawa (Warsaw, the capital and enterprise / finance / multinational HQ hub — banking, insurance, big tech offices; Mokotów, Wola, Śródmieście for office districts; Warsaw Stock Exchange / GPW). " +
    "Kraków (Cracow, the tech-startup capital — Aleja 29 Listopada / Zabłocie / Kazimierz tech parks; large international engineering hubs from EPAM, Akamai, Cisco, IBM, Capgemini, ABB). " +
    "Wrocław (Breslau, major tech / R&D — IBM Wrocław, Volvo IT, Nokia, Capgemini, large student population from Wrocław University and Wrocław University of Science and Technology). " +
    "Trójmiasto (Tricity: Gdańsk + Sopot + Gdynia; maritime / shipping / SaaS — Gdańsk has Allegro engineering, IHS Markit, Lufthansa Systems). " +
    "Poznań (manufacturing / trade fairs — Międzynarodowe Targi Poznańskie / Poznań International Fair; Volkswagen, GlaxoSmithKline). " +
    "Łódź (logistics / BPO / textile; cheap office space, large outsourcing centers). " +
    "Katowice (industrial Silesia / Górnośląski Okręg Przemysłowy; mining, energy, ArcelorMittal Poland). " +
    "Rzeszów (south-east, Aviation Valley / Dolina Lotnicza — aerospace cluster including Pratt & Whitney Rzeszów, Lockheed Martin). " +
    "PEER BRANDS by tier: " +
    "Enterprise / state and finance tier: PKO Bank Polski (largest, state-controlled), Bank Pekao, mBank, ING Bank Śląski, Santander Bank Polska, BNP Paribas Polska, Alior Bank, PZU (insurance, the dominant Polish insurer with state ownership), Orlen (oil / petrochemical / convenience retail after Lotos merger, state-controlled), KGHM (copper / mining, state), JSW (coking coal, state), PGE / Tauron / Enea / Energa (utilities — first three state-controlled, Energa absorbed into Orlen), Orange Polska (telco, formerly TP S.A.), Play (now P4, part of iliad), T-Mobile Polska, Plus / Polkomtel. " +
    "Retail / FMCG tier: Biedronka (the dominant discount retailer, owned by Portuguese Jerónimo Martins — typically considered the largest food retailer by revenue in Poland), Lidl Polska, Kaufland, Carrefour Polska, Auchan Polska, Netto, Żabka (the dominant convenience chain, formerly Czech CVC), Empik (books / media / e-commerce), CCC (footwear, also operates eobuwie.pl), LPP (Polish fashion holding — Reserved, Cropp, House, Mohito, Sinsay), Pepco (discount). " +
    "Tech / digital-native tier: Allegro (the dominant Polish e-commerce platform — has roughly the market position Amazon holds in the US; publicly listed), InPost (parcel lockers / Paczkomaty — the Polish e-commerce delivery standard, internationally expanding), DocPlanner (znanylekarz.pl — Polish doctor-booking platform that expanded internationally), Brainly (Q&A / education), Booksy (beauty bookings, international expansion), Vinted (Lithuanian-founded but heavy PL presence), Tpay / Przelewy24 (payments; Przelewy24 acquired by PayPro), DataWalk (analytics / law-enforcement tools, publicly listed), Asseco Poland (enterprise software, dominant in Polish public-sector IT — banking, government, healthcare), Comarch (enterprise software, ERP), Ten Square Games (mobile gaming), CD Projekt (gaming, Witcher / Cyberpunk 2077 — Warsaw HQ). " +
    "Match peer references to prospect's company tier: enterprise / state-finance references for traditional sectors, tech / digital-native references for SaaS / e-commerce / fintech / mobile gaming. Mixing tiers (referencing CD Projekt when pitching PKO BP) reads as foreign-template. " +
    "TONE: formal-respectful, structured. Polish B2B values: explicit respect via Pan / Pani throughout the message, clear logical structure (Polish business writing often uses explicit 'Po pierwsze... Po drugie... Po trzecie' enumeration), and concrete deliverables with hard numbers over abstract claims. Avoid hype words ('rewolucyjny' without source, 'wiodący' without numbers, 'jedyny w swoim rodzaju') which read as advertising. Sign-offs: 'Z poważaniem' (formal standard, most common B2B), 'Z wyrazami szacunku' (most formal, very respectful — for serious correspondence), 'Pozdrawiam' (cordial, modern professional default for warm-but-respectful tone), 'Pozdrawiam serdecznie' (warmer, but still B2B-appropriate). Match sign-off to opening: 'Szanowny Panie' pairs with 'Z wyrazami szacunku'; 'Dzień dobry' pairs with 'Pozdrawiam' or 'Z poważaniem'.",

  "ru-RU":
    "Russian-Russia (ru-RU): Russia is the primary Russian B2B adtech market. The base Russian (ru) guide covers HEAVY Cyrillic localization with mandatory term conversions (retention>удержание, install>установка, conversion>конверсия, targeting>таргетинг, traffic>трафик, fraud>фрод, creatives>креативы) and the FORBIDDEN script-mixing rule; that all still applies. This regional entry adds Russia-specific city, currency, peer-brand, and register depth on top of the base ru guide. " +
    "REGISTER LAYERS: Russian B2B uses formal вы (lowercase in modern usage) for cold outreach; never ты for first contact. The capitalized Вы (as in 'sincerely Yours' style) is a dated formality, acceptable in very formal correspondence but reads as old-fashioned in modern B2B; lowercase вы is the modern default. Verbs conjugate to second-person plural: 'Хотел бы предложить Вам' / 'хотел бы предложить вам' (I would like to offer you). Cold B2B should default to вы throughout the message; transition to ты only after the prospect explicitly invites it (very rare in formal B2B). Russian business culture has clearer status / seniority hierarchy than Anglo-Saxon norms; over-familiarity in first contact reads as foreign-template. " +
    "GREETING REGISTERS: " +
    "'Здравствуйте, {NAME},' — standard formal opener, the safe default for cold chat. " +
    "'Добрый день, {NAME},' — slightly softer formal alternative ('Good day'); also fine for cold. " +
    "'Уважаемый {LastName}, / Уважаемая {LastName},' — most formal, email-equivalent register; gendered form (Уважаемый for male, Уважаемая for female). " +
    "'Привет' — informal-young register; NEVER for cold B2B regardless of channel. " +
    "ORTHOGRAPHY: Cyrillic script for all structural text. Latin acronyms (CPI, CPA, ROAS, DSP, LTV, MMP, KPI) embed inline within Cyrillic sentences and read naturally. Numbers use space as thousands separator and comma as decimal: '1 234 567,89' (European-style, NOT comma thousands NOT period thousands). Percentages use % symbol (12%); '12 процентов' spelled out is acceptable in formal contexts but '%' is universal in B2B. " +
    "CURRENCY: RUB (₽, ruble). Currency symbol follows the amount with a space: '1 234 567,89 ₽' (modern Unicode ruble glyph ₽ is universally accepted post-2014; the legacy 'руб.' suffix is also acceptable but ₽ is more modern). For larger amounts: 'млн' (million) and 'млрд' (billion) are standard ('1,5 млн ₽', '2,3 млрд ₽'). 'тыс.' (thousand) is informal-context only; full numerals for formal B2B. Some Russian B2B contexts dual-quote in USD (US dollars) or EUR; depending on whether the prospect's company is import / export-oriented this can be natural. " +
    "CITY/MARKET REFERENCES: " +
    "Москва (Moscow, the commercial / political center; ~13M; finance, enterprise, government, tech all concentrated here; Moskva-City international business district for finance towers — VTB, Sberbank, IQ-Quarter; Tverskaya / Arbat / Patriarshiye for older business HQs). " +
    "Санкт-Петербург / СПб (St. Petersburg, ~5.5M; tech / culture / federal-level companies relocated here including Gazprom HQ post-2015). " +
    "Екатеринбург (Yekaterinburg, ~1.5M; Urals industrial / metals capital). " +
    "Новосибирск (Novosibirsk, ~1.6M; Siberian tech / Akademgorodok scientific cluster). " +
    "Казань (Kazan, ~1.3M; Tatarstan capital; Innopolis tech city nearby — Russian Silicon Valley equivalent). " +
    "Нижний Новгород (Nizhny Novgorod, ~1.2M; automotive / Volga industrial). " +
    "Краснодар (Krasnodar, ~1M; growing southern tech / IT hub, fastest-growing Russian city by some metrics). " +
    "Other million-plus: Челябинск (Chelyabinsk), Самара (Samara), Уфа (Ufa), Ростов-на-Дону (Rostov-on-Don), Омск (Omsk), Волгоград (Volgograd), Воронеж (Voronezh), Пермь (Perm), Красноярск (Krasnoyarsk), Тюмень (Tyumen, oil capital). " +
    "PEER BRANDS by tier: " +
    "Enterprise / state and resource tier: Газпром (Gazprom, gas major, partially state-owned), Роснефть (Rosneft, oil, state), Лукойл (LUKOIL, private oil), Сургутнефтегаз (Surgutneftegaz), Татнефть (Tatneft), Новатэк (Novatek, LNG), Норильский никель / Норникель (Nornickel, metals — palladium, nickel), Северсталь (Severstal, steel), НЛМК (NLMK, steel), Магнитка / ММК (MMK, steel), РУСАЛ (RUSAL, aluminum), Полюс (Polyus, gold), РЖД (Russian Railways, state). " +
    "Banking / finance tier: Сбер / Сбербанк (Sberbank — the dominant bank; also the SberMarket / SberMobile / SberDevices / SberCloud / SberAuto super-app ecosystem), ВТБ (VTB, state), Газпромбанк (Gazprombank), Альфа-Банк (Alfa-Bank, private), Россельхозбанк (Rosselkhozbank, state-agricultural), Открытие (Otkritie), Совкомбанк (Sovcombank), Тинькофф / Т-Банк (T-Bank, rebranded 2024 — was Tinkoff Bank, now neobank flagship). " +
    "Retail / FMCG tier: Магнит (Magnit, the largest retailer by store count), X5 Retail Group (Pyaterochka / Перекрёсток Perekrestok / Карусель Karusel — the largest by GMV), Лента (Lenta, hypermarket), Дикси (Dixy), Светофор (Svetofor, hard-discount), М.Видео-Эльдорадо (M.Video-Eldorado, electronics), DNS (electronics), ВкусВилл (VkusVill, premium / organic), Окей (O'Key). " +
    "Telco / mobile: Билайн / VEON (Beeline), МТС (MTS, AFK Sistema-affiliated), МегаФон (MegaFon, owned by USM Holdings), Tele2 Россия (T2 Mobile, Rostelecom-affiliated), Ростелеком (Rostelecom, state, fixed-line + Tele2 mobile). " +
    "Tech / digital-native tier: Яндекс (Yandex — the dominant Russian tech ecosystem: search, Yandex Taxi / Yandex Go, Yandex Eats / Yandex Lavka quick commerce, Yandex Market e-commerce, Yandex Music / KinoPoisk streaming, Yandex Maps / Navigator, Yandex Cloud, Yandex Plus subscription — comparable in domestic dominance to Google + Amazon + Uber + Spotify combined), VK / ВКонтакте (VK Group, post-Mail.Ru merger — VK social, VK Music, VK Combo, OK.ru / Одноклассники, VK Games, Mail.ru email + cloud), Ozon (e-commerce, Nasdaq-listed via OZON), Wildberries (the largest Russian e-commerce platform by GMV, private), Авито (Avito, classifieds — Russian Craigslist + OLX equivalent), Циан / CIAN (real estate), HeadHunter / hh.ru (jobs, publicly listed), Skyeng (edtech / English language), Skypro (edtech / IT retraining), Делимобиль (Delimobil, carsharing), Самокат (Samokat, quick commerce — Sber-owned post-acquisition), Яндекс.Лавка (Yandex Lavka, quick commerce), Aviasales (flight aggregation), Booking.com replacement after exit: Островок (Ostrovok). " +
    "Aerospace / defense (less likely B2B adtech but worth noting): Аэрофлот (Aeroflot, airline), Победа (Pobeda, low-cost), S7 Airlines, Уралкалий (Uralkali, potash). " +
    "Match peer tier to prospect's company: enterprise / state / resource references for traditional sectors and natural-resource industries, banking-tier for financial-services prospects, tech / digital-native for SaaS / e-commerce / fintech / mobile gaming / classifieds. Mixing tiers (referencing Yandex when pitching Gazprom) reads as foreign-template. " +
    "TONE: formal, direct, hierarchy-aware. Russian B2B values: explicit acknowledgment of seniority in first contact, clear logical structure, concrete numbers and proofs over qualitative claims, willingness to be precise about commitments and deadlines. Russian business culture is more direct than Anglo-Saxon (less indirection, less softening) but also more formal in register (вы, full names, Уважаемый openings). Avoid hype words ('революционный' without source, 'лидер рынка' without numbers, 'уникальный') which read as advertising. Sign-offs: 'С уважением,' (formal standard, the most common B2B sign-off — literally 'With respect'), 'С наилучшими пожеланиями,' (warmer, 'Best wishes', acceptable for warm-but-formal threads). 'Всего доброго,' is casual / closing-final; avoid in cold. Match sign-off to opening: 'Уважаемый/Уважаемая' opening pairs with 'С уважением'; 'Здравствуйте' / 'Добрый день' opening also pairs with 'С уважением' as the safe default.",

  "id-ID":
    "Indonesian-Indonesia (id-ID): Indonesia is the only major Indonesian B2B adtech market. The base Indonesian (id) guide notes that Indonesian B2B is VERY English-heavy and structural grammar should be in Indonesian with adtech compound terms in English; that all still applies. This regional entry adds Indonesia-specific city, currency, peer-brand, and Bapak/Ibu register depth on top of the base id guide. " +
    "REGISTER LAYERS: Indonesian B2B uses formal Bapak (Mr.) / Ibu (Ms.) honorifics for cold outreach. These honorifics precede the FIRST name (not last), reflecting Indonesian naming conventions where many people have only one name or use first-name primarily: 'Bapak Budi' / 'Ibu Sari' is correct; 'Bapak Setiawan' (using last name) is also correct when the person uses a Western-style two-part name. The abbreviated 'Pak' / 'Bu' forms are acceptable in semi-formal chat once the relationship has warmed up but cold B2B should use full 'Bapak' / 'Ibu'. NEVER use first name alone for cold outreach; that's the equivalent of using 'du' / 'ты' / 'tu' in other formal-register languages. " +
    "GREETING REGISTERS: " +
    "Time-of-day greetings rotate by clock: " +
    "  Selamat pagi — morning (~05:00-11:00) " +
    "  Selamat siang — midday (~11:00-15:00) " +
    "  Selamat sore — late afternoon (~15:00-19:00) " +
    "  Selamat malam — evening / night (~19:00 onwards) " +
    "Use the form matching the time the prospect will read the message; on chat platforms with high probability of immediate read (WhatsApp / Telegram), this matters. If timing is uncertain, 'Selamat pagi' is the safest default for B2B (mornings start early in Indonesia and the form is broadly accepted as the standard professional opener). 'Halo Pak/Bu {NAME},' is acceptable on WhatsApp for less formal contexts. 'Yth. Bapak/Ibu {LastName},' (Yang terhormat / 'The respected') is the most formal email-equivalent register, less common on chat. " +
    "ORTHOGRAPHY: Standard Indonesian Latin script (no diacritics needed for native Indonesian words; Latin alphabet with no accents). Numbers use period as thousands separator and comma as decimal: '1.234.567,89' (European-style, NOT Anglo-American comma thousands). Percentages use % symbol (12%), never 'persen' spelled out in B2B writing. Indonesian B2B writing freely mixes English adtech vocabulary inline with Indonesian grammar; this is natural register, not a fault. " +
    "CURRENCY: IDR (Rp). Symbol prefix without space: 'Rp1.234.567,89' (note: NOT comma thousands; European-style separators). The 'IDR' three-letter code is rare in body text; use 'Rp' prefix. For larger amounts the informal abbreviations are universal: " +
    "  'rb' (ribu / thousand): 'Rp50rb' = Rp50,000 (~$3 USD) " +
    "  'jt' (juta / million): 'Rp5jt' = Rp5,000,000 (~$320 USD) " +
    "  'M' (miliar / billion): 'Rp1M' = Rp1,000,000,000 (~$64,000 USD) " +
    "Note that 'M' = miliar = 10^9 in Indonesian, NOT mega / 10^6 as in English. For formal B2B documents, use full numerals 'Rp1.000.000.000' rather than 'Rp1M' to avoid ambiguity. Indonesia has high nominal rupiah figures due to historical inflation; large numbers are expected and not impressive in themselves — dual-quoting in USD is sometimes useful for international B2B contexts. " +
    "CITY/MARKET REFERENCES: " +
    "Jakarta (the commercial capital; ~10M city + 30M+ Jabodetabek metro — Jakarta + Bogor + Depok + Tangerang + Bekasi; the Indonesian CBD: Sudirman / Kuningan / Thamrin for finance and enterprise HQs, SCBD (Sudirman Central Business District) for tech and modern offices, Mega Kuningan and Pondok Indah for foreign and embassy presence; Cikarang and Bekasi for manufacturing outskirts). " +
    "Surabaya (~3M, second-largest; East Java capital; manufacturing, port, second business center after Jakarta). " +
    "Bandung (~2.5M; West Java; tech / textile / education / Institut Teknologi Bandung / ITB the leading Indonesian tech university; 2-3 hour drive from Jakarta makes it a tech satellite). " +
    "Medan (~2.4M; North Sumatra commercial hub, palm oil, mining gateway). " +
    "Semarang (~1.6M; Central Java port and manufacturing). " +
    "Makassar (~1.5M; South Sulawesi; eastern Indonesia gateway, fish / logistics). " +
    "Bali / Denpasar (~1M; tourism economy but growing remote-work tech / digital nomad presence). " +
    "Yogyakarta / Jogja (~400K but cultural / education hub; UGM Universitas Gadjah Mada). " +
    "PEER BRANDS by tier: " +
    "Enterprise / state and finance tier: Bank Mandiri (the largest state bank by assets), BCA (Bank Central Asia, the dominant private bank — Indonesian B2B reflex is BCA for daily banking, Mandiri for state contracts), BNI (Bank Negara Indonesia, state), BRI (Bank Rakyat Indonesia, state, the microfinance / rural / Pasar champion), CIMB Niaga (Malaysian-owned), Bank Danamon, Maybank Indonesia, Bank Permata, Bank Mega, Bank BTPN (Sumitomo Mitsui-affiliated), Astra International (the dominant Indonesian conglomerate — automotive Toyota / Daihatsu / Isuzu / Honda / BMW / Peugeot dealerships, agribusiness, mining, financial services, infrastructure, IT — Astra is to Indonesia what Tata is to India), Pertamina (state oil and gas, the largest Indonesian company by revenue), PLN (state electricity utility), Telkom Indonesia (state telco; includes Telkomsel the dominant mobile operator, IndiHome fixed broadband), Indosat Ooredoo Hutchison (telco, merger of Indosat and Hutchison 3 Indonesia), XL Axiata (telco, Malaysian Axiata-owned, recently merged with Smartfren as XLSmart), Garuda Indonesia (state airline), Lion Air (private airline). " +
    "Conglomerate tier: Salim Group (Indofood — the dominant noodle / FMCG, BCA-affiliated historically), Sinar Mas (Asia Pulp & Paper, palm oil), Lippo Group (real estate, retail, healthcare), Djarum Group (Blibli e-commerce, BCA stake, tobacco), Bakrie Group, Mayora Indah (FMCG), Indofood (CBP / Sukses Makmur — Indomie maker, the dominant instant noodle globally). " +
    "Retail / FMCG (high-relevance): Indomaret (the dominant convenience-store chain, Salim Group), Alfamart (the other dominant convenience chain, PT Sumber Alfaria Trijaya), Hypermart / Foodmart (Lippo), Carrefour Transmart, Lotte Mart (Korean), Ranch Market / Farmers Market (premium). " +
    "Tech / digital-native tier: GoTo Group (the largest Indonesian tech holding, NYSE / IDX dual-listed; Gojek for ride-hailing / food / payments / GoPay digital wallet + Tokopedia for e-commerce, post-2021 merger), Grab Indonesia (Singapore HQ but dominant Indonesian player in ride-hailing / food / payments / GrabPay), Bukalapak (e-commerce, IDX-listed; smaller than Tokopedia but significant), Traveloka (online travel agent, regional SEA expansion), tiket.com (travel, Djarum / Blibli affiliated), OVO (digital wallet, Grab + Lippo + Tokopedia consortium), DANA (digital wallet, Ant Group + Emtek joint), LinkAja (digital wallet, state-backed via Telkomsel / Pertamina / BRI / BNI / Mandiri consortium), Blibli (e-commerce, Djarum), Akulaku (BNPL / fintech, Ant-affiliated), Kredivo (BNPL, FinAccel), Ajaib (investment app), Ruangguru (edtech, the dominant Indonesian edtech), Halodoc (telemedicine / healthtech), Alodokter (telemedicine competitor), Sociolla (beauty e-commerce), Tiket / Mister Aladin (travel niches), Tokopedia (subsumed into GoTo but brand persists for e-commerce). " +
    "Mobile gaming / digital content: Garena (Sea Group / Free Fire developer — Singapore HQ but massive Indonesian market presence), Moonton (Mobile Legends: Bang Bang publisher, ByteDance-owned, large Indonesian DAU). " +
    "Match peer tier to prospect's company: enterprise / state for traditional banking / energy / telco, conglomerate for diversified holdings, tech / digital-native for SaaS / e-commerce / fintech / mobile gaming. Indomaret / Alfamart are the universal Indonesian retail-density reference points; mentioning them shows Indonesia-specific market awareness. " +
    "TONE: formal-warm, relationship-aware. Indonesian B2B values: explicit honorific (Bapak / Ibu) throughout the message in first contact, slightly slower / more relational pace than Anglo-Saxon norms, acknowledgment of the prospect's seniority and company context before the pitch. Indonesian business culture rewards patience and politeness; aggressive direct outreach without honorifics reads as foreign-template. Avoid hype words ('revolusioner' without source, 'terbaik di industri' without numbers, 'satu-satunya') which read as advertising. Sign-offs: 'Terima kasih,' (Thank you — the standard B2B closing), 'Hormat saya,' (My respect — more formal), 'Salam,' (Regards — casual but acceptable in modern B2B chat), 'Salam hormat,' (Respectful regards — warmer-formal). Match sign-off to opening: 'Yth. Bapak/Ibu' pairs with 'Hormat saya'; 'Selamat pagi, Bapak/Ibu' pairs with 'Terima kasih' or 'Salam hormat'.",

  "uk-UA":
    "Ukrainian-Ukraine (uk-UA): Ukraine is the only major Ukrainian B2B adtech market. The base Ukrainian (uk) guide covers HEAVY Cyrillic localization with mandatory term conversions (retention>утримання, install>встановлення, conversion>конверсія, targeting>таргетинг, traffic>трафік, fraud>фрод, creatives>креативи, bid>ставка, publisher>видавець/паблішер, lookalike>схожі аудиторії); that all still applies. This regional entry adds Ukraine-specific city, currency, peer-brand, register, and post-2022 linguistic-sensitivity depth on top of the base uk guide. " +
    "CRITICAL POST-2022 LANGUAGE NOTE: Ukrainian B2B writing post-2022 is highly attuned to Russian linguistic influence. Use Ukrainian-specific term equivalents throughout: Київ (NOT Киев), Львів (NOT Львов), Харків (NOT Харьков), Дніпро (NOT Днепр), Одеса (NOT Одесса). Avoid surzhik (mixed Russian-Ukrainian vocabulary common in older / eastern speakers); modern Ukrainian B2B uses purified Ukrainian. Term-level: use 'будь ласка' (please) not Russian-loan 'пожалуйста'; 'дякую' (thank you) not 'спасибі'; 'добре' (good / fine) not 'хорошо'. Recognizing Ukrainian-distinct vocabulary signals market awareness; using Russian-loan equivalents signals foreign-template. " +
    "REGISTER LAYERS: Ukrainian B2B uses formal Ви (capitalized in formal correspondence; lowercase ви acceptable in modern chat) for cold outreach; never ти for first contact. Verbs conjugate to second-person plural: 'хотів би / хотіла би запропонувати Вам' (I would like to offer you — verb gendered based on writer). The capitalized Ви is the more formal / respectful form, common in written correspondence; lowercase ви is acceptable in WhatsApp / Telegram / Slack chat contexts. " +
    "GREETING REGISTERS: " +
    "'Вітаю, {NAME},' — modern professional opener (literally 'I greet'); the standard chat default. " +
    "'Доброго дня, {NAME},' — slightly more traditional alternative ('Good day'); also fine for cold. " +
    "'Шановний {LastName}, / Шановна {LastName},' — most formal, email-equivalent register; gendered (Шановний for male, Шановна for female). " +
    "'Привіт' — informal-young register; NEVER for cold B2B regardless of channel. " +
    "ORTHOGRAPHY: Cyrillic script with Ukrainian-specific letters: і (Ukrainian і, NOT Russian и), ї (yi), є (ye), ґ (g — historical letter, used in some words). Get these right; using Russian и where Ukrainian і belongs signals foreign-template. Latin acronyms (CPI, CPA, ROAS, DSP, LTV, MMP) embed inline within Ukrainian sentences and read naturally. Numbers use space as thousands separator and comma as decimal: '1 234 567,89' (European-style). Percentages use % symbol. " +
    "CURRENCY: UAH (₴, hryvnia). Currency symbol follows the amount with a space: '1 234 567,89 ₴'. For larger amounts: 'млн' (million) and 'млрд' (billion) are standard. Ukrainian B2B contexts also frequently dual-quote in USD or EUR due to export orientation and inflation context; this is normal, not a fault. " +
    "CITY/MARKET REFERENCES: " +
    "Київ (Kyiv, the commercial / political center; ~3M; finance, enterprise, government, tech all concentrated; Podil for traditional business and creative agencies, Pechersk for finance and embassies, Solomyanka and Lukianivska for tech offices). " +
    "Львів (Lviv, ~720K; THE Ukrainian IT-export capital — home to SoftServe, EPAM Ukraine major office, Sigma Software, GlobalLogic Ukraine, Eleks; the cultural and IT-cluster face of Ukrainian B2B abroad; closer to Polish / EU labor markets). " +
    "Дніпро (Dnipro, ~960K; industrial / metals / steel; PrivatBank originated here; growing fintech / IT). " +
    "Харків (Kharkiv, ~1.4M pre-2022; traditional industrial / aviation / IT — Kharkiv was a major IT-outsourcing hub; war-affected post-2022 with many companies relocated to Lviv or abroad, but the talent base remains). " +
    "Одеса (Odesa, ~1M; port / agricultural / IT; trading hub). " +
    "Івано-Франківськ (~230K) and Ужгород (Uzhhorod, western IT-cluster satellites near Polish / Slovak borders). " +
    "Many Ukrainian IT companies post-2022 operate distributed teams across Lviv, Warsaw, Krakow, Wrocław (Polish cities), and US / EU offices. " +
    "PEER BRANDS by tier: " +
    "Banking tier: Monobank (the most successful Ukrainian neobank, branchless, Universal Bank parent — comparable in domestic disruption to Revolut elsewhere or T-Bank in Russia; THE reference for fintech in Ukraine), PrivatBank (largest by retail customers, state-nationalized in 2016 from Kolomoisky), Oschadbank (state savings bank, traditional), Raiffeisen Bank Aval (Raiffeisen Austria subsidiary, second-largest by retail metric), UkrSibbank (BNP Paribas), Universal Bank, PUMB (First Ukrainian International Bank / FUIB, owned by Akhmetov's SCM), Ukreximbank (state, export-import). " +
    "Industrial / state tier: Metinvest (Akhmetov's metals, Mariupol's Azovstal pre-war), DTEK (Akhmetov's energy), Ferrexpo (UK-listed iron ore, Kostyantyn Zhevago — though the owner is post-2022 contested), Kernel (agribusiness, Andriy Verevskyi), MHP (poultry, Yuriy Kosyuk), Roshen (confectionery, Poroshenko-related), Naftogaz (state gas), Ukrenergo (state grid), Ukrzaliznytsia / UZ (state railways), Antonov (state aerospace). " +
    "Retail / e-commerce tier: Rozetka (THE dominant Ukrainian e-commerce platform, comparable in domestic dominance to Allegro in PL or Wildberries in RU; private), Prom.ua (marketplace, EVO group), Comfy (electronics retail), Eldorado / Foxtrot (electronics retail). Logistics: Nova Poshta (THE Ukrainian parcel-delivery standard — every Ukrainian B2B and consumer uses it; private, founded by Hryhorov / Klymov; the brand is universally recognized and a strong peer reference), Ukrposhta (state post), Meest (international logistics). " +
    "Telco / mobile: Kyivstar (largest mobile, owned by VEON — same group as Beeline in RU; the dominant Ukrainian telco), Vodafone Ukraine (formerly MTS Ukraine, rebranded post-2017), lifecell (Turkcell subsidiary). " +
    "Tech / outsourcing tier: SoftServe (the largest Ukrainian software outsourcer, US HQ now Austin TX, large engineering presence in Lviv and other Ukrainian cities), EPAM Ukraine (NYSE-listed EPAM, originally Belarusian-Ukrainian roots, large Ukraine presence pre and post-2022), Sigma Software, GlobalLogic (Hitachi-owned), Ciklum, Luxoft (DXC-owned), Eleks, Infopulse. " +
    "Tech / product tier: GitLab (Ukrainian-founded by Dmitriy Zaporozhets, now US-public on Nasdaq), Grammarly (Ukrainian-founded by Lytvyn / Shevchenko / Maximenko, US HQ, $13B valuation pre-IPO context), MacPaw (CleanMyMac X, Setapp), Reface (face-swap AI, viral 2020), Preply (edtech / language tutoring), Petcube (smart pet products), Ajax Systems (security alarms, has emerged as a security-product B2B reference), Genesis (mobile apps, Headway / Promova / Obrio brands), Allset, Restream (live streaming), People.ai. " +
    "Match peer references to prospect's company: banking-tier for finance, e-commerce / logistics for retail / D2C, IT-outsourcer for software services, tech-product-tier for SaaS / mobile / consumer. " +
    "TONE: pragmatic, direct, increasingly Western-oriented in B2B. Ukrainian B2B post-2022 has accelerated toward EU / US business norms (faster pace, more direct, more English-tolerant in tech). Ukrainian business culture values clarity, getting to the point quickly, and concrete deliverables. Avoid hype words ('революційний' without source, 'лідер ринку' without numbers, 'унікальний') which read as advertising. Sign-offs: 'З повагою,' (formal standard, 'With respect' — the most common B2B sign-off), 'З найкращими побажаннями,' ('Best wishes', warmer-formal), 'Дякую,' ('Thank you', casual-professional, very common). Match sign-off to opening: 'Шановний / Шановна' opening pairs with 'З повагою,'; 'Вітаю' or 'Доброго дня' pairs with 'З повагою,' or 'Дякую,'.",

  "cs-CZ":
    "Czech-Czech Republic (cs-CZ): The Czech Republic / Czechia is the only major Czech B2B adtech market. The base Czech (cs) guide covers HEAVY localization with mandatory term conversions (retention>retence, install>instalace, conversion>konverze, targeting>cílení, traffic>provoz/návštěvnost, creatives>kreativy, lookalike>podobná publika); that all still applies. This regional entry adds Czech Republic-specific city, currency, peer-brand, register, and pragmatic-tone depth on top of the base cs guide. " +
    "REGISTER LAYERS: Czech B2B uses formal Vy (capitalized in correspondence; lowercase vy acceptable on chat) for cold outreach; never ty for first contact. Verbs conjugate to second-person plural: 'rád bych Vám / rád bych vám nabídl' (I would like to offer you — verb gendered based on writer: rád for male, ráda for female). The capitalized Vy is the more formal / respectful form, common in written correspondence; lowercase vy is acceptable on WhatsApp / Telegram / Slack chat. The plural-formal 'tykáme si' / 'vykáme si' (using ty / vy reciprocally) is a culturally important distinction — proposing 'tykáme si' (let's use ty / informal) is a meaningful relationship-warming step in Czech business culture, typically initiated by the senior party. " +
    "GREETING REGISTERS: " +
    "'Dobrý den, {NAME},' — standard chat opening, the safe default; works through the day. " +
    "'Vážený pane {LastName},' / 'Vážená paní {LastName},' — most formal, email-equivalent (gendered: pane for male, paní for female). " +
    "'Vážený pane inženýre / Vážený pane doktore' — using academic titles is more common in Czech B2B than in Anglo-Saxon norms; if the prospect's title is known (Ing., Mgr., Dr., Ph.D., MUDr. for doctors), Czech B2B convention is to acknowledge it in the opening. " +
    "'Ahoj' / 'Čau' — informal-young register; NEVER for cold B2B regardless of channel. " +
    "ORTHOGRAPHY: Czech Latin script with diacritics: á, č, ď, é, ě, í, ň, ó, ř, š, ť, ú, ů, ý, ž (15+ diacritic letters, plus uppercase variants). Get these right; missing or wrong diacritics read as foreign-template. The ř is uniquely Czech (rolled-fricative-r); ů (u with kroužek / ring) vs ú (u with čárka / acute) is meaningful (different etymology). Numbers use space as thousands separator and comma as decimal: '1 234 567,89' (European-style; non-breaking space ideally, regular space acceptable). Percentages use % symbol (12%); never spell out 'procent' in B2B. " +
    "CURRENCY: CZK (Kč, koruna česká). Currency symbol follows the amount with a space: '1 234 567,89 Kč'. Common abbreviations: 'mil.' (milion / million) and 'mld.' (miliarda / billion); 'tis.' (tisíc / thousand) in informal contexts only. The Czech Republic uses CZK, NOT EUR — this is meaningful (resisted euro adoption); avoid quoting in EUR alone unless the prospect's company is multinational. " +
    "CITY/MARKET REFERENCES: " +
    "Praha (Prague, the commercial / political center; ~1.3M city + ~2.7M metro; finance, enterprise, multinational HQs, government, tech all concentrated. Karlín for tech and modern offices, Smíchov for new business HQs, Pankrác for finance towers, Holešovice for creative / co-working. Old Town and Vinohrady for traditional business addresses. Prague's office market is the dominant CEE multinational HQ destination after Warsaw). " +
    "Brno (~380K, second-largest; the secondary tech / R&D hub — Red Hat Brno is the largest Red Hat office globally, IBM Brno, Avast / AVG originated here / Gen Digital now, Honeywell, NXP, Masaryk University tech transfer; Brno is to Prague what Krakow is to Warsaw or Lyon to Paris). " +
    "Ostrava (~280K, third-largest; industrial / mining / heavy industry; Moravian-Silesian Region, historical coal / steel center; Tieto, Tatra Trucks, OKD historically). " +
    "Plzeň (~170K, automotive / Škoda Transportation HQ — separate from Škoda Auto — and the Pilsner Urquell brewery — global beer reference). " +
    "Olomouc (~100K, R&D / pharma / Palacký University — second-oldest Czech university). " +
    "Liberec (~100K, traditional textile, now automotive supplier base for VW group). " +
    "České Budějovice (~94K, Budweiser Budvar brewery, food and beverage). " +
    "PEER BRANDS by tier: " +
    "Banking tier: Česká spořitelna (the largest retail bank by branches, Erste Group Austria subsidiary), ČSOB (KBC Bank Belgium subsidiary, second-largest), Komerční banka / KB (Société Générale subsidiary), Moneta Money Bank, UniCredit Bank Czech Republic and Slovakia, Raiffeisenbank ČR (Raiffeisen Austria), Air Bank (PPF group neobank), Fio banka (Czech-owned), J&T Banka (private banking). Note: most major Czech banks are owned by Western European banking groups (Erste, KBC, Société Générale, Raiffeisen, UniCredit); domestic ownership is rarer at scale (Air Bank / PPF and Fio are exceptions). " +
    "Industrial / state tier: Škoda Auto (VW Group, automotive — the largest Czech industrial company by revenue and a national-pride brand), Škoda Transportation (separate company, trains / trams / public transport vehicles), ČEZ Group (state-controlled electricity utility, the dominant Czech utility, regional player), Innogy / Net4Gas (gas distribution), O2 Czech Republic (telco, fixed and mobile — formerly state Český Telecom), T-Mobile Czech Republic (Deutsche Telekom), Vodafone Czech Republic, Tatra Trucks (heavy vehicles, Kopřivnice), Doosan Škoda Power (turbines, Korean ownership). " +
    "Retail / FMCG tier: Albert (Ahold Delhaize, the largest supermarket chain), Tesco Stores ČR, Kaufland (Schwarz Group), Lidl ČR (also Schwarz Group), Penny Market (REWE Group), Globus (German), Billa (REWE), Coop (Czech cooperative), dm drogerie (Austrian drugstore), Rossmann. " +
    "E-commerce / digital tier: Alza.cz (THE dominant Czech e-commerce platform, comparable to Allegro in PL or Rozetka in UA; private; expanded to Slovakia, Hungary, Austria, Germany, UK), Mall.cz (acquired by Allegro group 2022, integrating), Rohlík.cz (THE dominant Czech online grocery — Rohlík is a Czech tech success story, expanded to DACH / Italy / Hungary as Rohlík Group; reference for Czech tech founders), Heureka.cz (price comparison, regional CEE leader), Slevomat (deals / experiences), AAA Auto (used car platform). " +
    "Tech / software tier: Avast (security, originally Czech, merged with NortonLifeLock as Gen Digital — Nasdaq-listed, founded in Prague), AVG (now Avast / Gen Digital), Kiwi.com (travel meta-search, Brno-founded by Oliver Dlouhý, the most internationally successful Czech tech startup), Productboard (US HQ but Czech roots), Mews (hospitality software, Prague-founded), Memsource / Phrase (translation tech, now Phrase brand), GoodData (analytics, Roman Stanek), Y Soft (print management, Brno). Food delivery: Dáme jídlo (the dominant Czech food-delivery, Delivery Hero), Wolt Czechia (Finnish but heavy CZ presence), Bolt Food. " +
    "Match peer tier to prospect's company: banking-tier (Erste / KBC subsidiaries) for finance, industrial / Škoda for traditional manufacturing, Alza / Mall / Rohlík for e-commerce, Avast / Kiwi for tech-product / SaaS. " +
    "TONE: reserved, pragmatic, understated. Czech B2B values: precise language, concrete numbers, technical accuracy, and avoiding over-enthusiasm. Czech business culture is closer to German / Austrian norms than to Mediterranean or Anglo-Saxon — directness without American-style hype, respect for expertise and titles, slight skepticism toward marketing claims. Avoid hype words ('revoluční' without source, 'jedinečný' / 'unikátní' without justification, 'lídr trhu' without numbers) which read as advertising. Czech B2B writers often signal qualifications (e.g., 'do určité míry' / 'to some extent') where Anglo-Saxon writers would use stronger claims; matching this register reads as Czech-native. Sign-offs: 'S pozdravem,' (formal standard, the most common B2B sign-off — literally 'With greeting'), 'S úctou,' (more formal, 'With respect' — for very serious correspondence), 'Pěkný den,' ('Have a nice day', warm but professional, common in modern B2B chat). Match sign-off to opening: 'Vážený pane / Vážená paní' pairs with 'S pozdravem,' or 'S úctou,'; 'Dobrý den' pairs with 'S pozdravem,' or 'Pěkný den,'.",

  "ro-RO":
    "Romanian-Romania (ro-RO): Romania is the primary Romanian B2B adtech market. The base Romanian (ro) guide covers HEAVY localization with term conversions (retention>retenție, install>instalare, conversion>conversie, targeting>direcționare/targetare, traffic>trafic, fraud>fraudă, creatives>creativuri/reclame, lookalike>publicuri similare, cohort>cohortă); that all still applies. This regional entry adds Romania-specific city, currency, peer-brand, register, and tone depth on top of the base ro guide. " +
    "REGISTER LAYERS: Romanian B2B uses formal dumneavoastră (literally 'your lordship', the Romanian polite second-person address — analogous to French vous or Spanish usted but more layered); often abbreviated dvs. in writing. Never tu for cold B2B. Verbs conjugate to second-person plural even when addressing a single person: 'aș dori să vă propun' (I would like to propose to you). The dumneata register (intermediate between dumneavoastră formal and tu informal) exists but is uncommon in modern B2B; dumneavoastră is the safe formal default. " +
    "GREETING REGISTERS: " +
    "'Bună ziua, {NAME},' — standard chat opening, 'Good day'; works through the day. " +
    "'Bună dimineața, {NAME},' — morning specifically (~05:00-11:00). " +
    "'Bună seara, {NAME},' — evening (~18:00 onwards). " +
    "'Stimate domnule {LastName},' / 'Stimată doamnă {LastName},' — most formal, email-equivalent (gendered). " +
    "'Salut' / 'Bună' — informal-young; NEVER for cold B2B. " +
    "ORTHOGRAPHY: Romanian Latin script with five diacritic letters: ă (a-breve, e.g., 'tânără'), â (a-circumflex, only in specific positions, e.g., 'român'), î (i-circumflex, e.g., 'începe'), ș (s-comma-below — NOT s-cedilla; Romanian uses the comma-below diacritic specifically, distinct from Turkish ş with cedilla), ț (t-comma-below — also NOT t-cedilla; same comma-below diacritic as ș). Get these right; using Turkish ş/ţ-cedilla instead of Romanian ș/ț-comma is a common foreign-template error. Numbers use European convention: period as thousands separator, comma as decimal: '1.234.567,89'. Percentages use % symbol (12%). " +
    "CURRENCY: RON (lei is plural; 1 leu, 2-19 lei, then 20+ de lei with prepositional 'de'; symbol is 'lei' as suffix — no widely-adopted glyph): '1.234.567,89 lei' for formal documents. 'mil. lei' (million lei) and 'mld. lei' (billion lei) for larger amounts. Some Romanian B2B contexts dual-quote in EUR due to EU integration; both are normal. " +
    "CITY/MARKET REFERENCES: " +
    "București (Bucharest, the commercial / political center; ~2M city + ~2.4M metro; finance, enterprise, multinational HQs, government. Calea Victoriei for historical finance, Aviatorilor / Charles de Gaulle area for embassies and premium offices, Floreasca for finance towers, Pipera tech park for tech / outsourcing — comparable to Brno or Krakow as a tech-cluster destination). " +
    "Cluj-Napoca (~325K, THE dominant Romanian tech hub — Universitatea Babeș-Bolyai / UBB tech transfer; large UiPath engineering presence, Bitdefender Cluj, Endava, Bosch, Emerson; the Romanian Silicon Valley equivalent). " +
    "Timișoara (~320K, western Banat; manufacturing — Continental Automotive, Hella, Flex / Flextronics; also growing IT). " +
    "Iași (~290K, eastern Moldavia region; academic — Universitatea Alexandru Ioan Cuza; large Amazon center, Continental, NTT). " +
    "Constanța (~280K, Black Sea port / logistics; Lukoil refinery historically). " +
    "Brașov (~250K, Transylvania; manufacturing — auto suppliers, IAR-Brașov aerospace, tourism). " +
    "Sibiu (~150K, Saxon-heritage manufacturing — Continental, NSG, Marquardt). " +
    "Oradea (~200K, Hungarian-adjacent western border; logistics + manufacturing). " +
    "PEER BRANDS by tier: " +
    "Banking tier: Banca Transilvania (BT, the largest Romanian bank by assets and the dominant domestic-owned bank; BVB-listed; Cluj-headquartered), BCR (Banca Comercială Română, Erste Group Austria — second-largest by assets), BRD (BRD-Groupe Société Générale, third-largest), Raiffeisen Bank România, ING Bank România, UniCredit Bank România, CEC Bank (state, traditional retail), EximBank (state, export). Most Romanian banks except BT are foreign-European-owned. " +
    "Industrial / state tier: OMV Petrom (the largest Romanian company by revenue — OMV Austria controls; integrated oil/gas), Hidroelectrica (state hydropower, IPO 2023 — second-largest BVB listing), Romgaz (state gas, BVB-listed), Nuclearelectrica (state nuclear / Cernavodă), Electrica (electricity distribution), Engie Romania (gas distribution), Transgaz, Transelectrica (state transmission). Steel: ArcelorMittal Galați (formerly Sidex), Alro (aluminum). " +
    "Telco / mobile: Orange Romania (the dominant mobile operator post-2024 Telekom Romania acquisition — Orange now controls both Orange and former Telekom infrastructure), Vodafone Romania, Digi / RCS&RDS (DIGI Communications, BVB and BVB-listed; the dominant cable + internet provider, expanded to Italy, Spain, Portugal under Digi Mobil brand). " +
    "Retail / FMCG tier: Kaufland Romania (Schwarz Group, the largest by store revenue), Lidl Romania, Carrefour Romania, Auchan Romania, Mega Image (Ahold Delhaize, mainly Bucharest), Profi (now Mid Europa-acquired then Ahold), Penny Romania. " +
    "E-commerce / tech tier: eMAG (THE dominant Romanian e-commerce platform — Naspers / Prosus owned, also operates in Hungary, Bulgaria, Poland; the Amazon-equivalent of Romania), OLX Romania (classifieds, Prosus), Cărturești (books/lifestyle retail), Glovo Romania (delivery), Bolt Romania (mobility), FAN Courier (logistics, dominant Romanian parcel-delivery). " +
    "Romanian tech success stories (the international wins): UiPath (Romanian-founded by Daniel Dines / Marius Tîrcă, NYSE-listed PATH, the RPA market leader and the most internationally successful Romanian tech company — every Romanian B2B reflexively knows this), Bitdefender (cybersecurity, Romanian-founded by Florin Talpeș, private), Endava (NYSE-listed DAVA, software engineering, large Romania presence), Druid (conversational AI), FintechOS, Typing DNA, Frisbo. " +
    "Match peer tier to prospect's company: banking for finance, OMV Petrom / state for traditional industrial, eMAG / Digi for retail / telecom, UiPath / Bitdefender / Endava for tech / SaaS. " +
    "TONE: warm-formal, slightly more relational than Czech / German but more formal than Italian. Romanian B2B values: clear professional respect via dumneavoastră throughout, explicit acknowledgment of the prospect's company / role, concrete deliverables, and avoiding both American-style hype and excessive bureaucratic formality. The Romanian language has stronger inflection than its Latin-cousin neighbors; precise grammar matters. Avoid hype words ('revoluționar' without source, 'lider de piață' without numbers, 'unic') which read as advertising. Sign-offs: 'Cu stimă,' (formal standard, the most common B2B sign-off — literally 'With esteem'), 'Cu respect,' (more formal alternative), 'Cu considerație,' (very formal — 'With consideration'), 'O zi bună,' ('Have a good day', warmer modern B2B chat). Match sign-off to opening: 'Stimate domnule / Stimată doamnă' opening pairs with 'Cu stimă,' or 'Cu considerație,'; 'Bună ziua' pairs with 'Cu stimă,' or 'O zi bună,'.",

  "hu-HU":
    "Hungarian-Hungary (hu-HU): Hungary is the only major Hungarian B2B adtech market. The base Hungarian (hu) guide covers HEAVY localization (Hungarian is a Finno-Ugric language unrelated to Indo-European neighbors, with extensive agglutination and case marking that affects how loanwords integrate); that still applies. This regional entry adds Hungary-specific city, currency, peer-brand, register, and Hungarian-name-order awareness on top of the base hu guide. " +
    "CRITICAL HUNGARIAN NAME-ORDER NOTE: Hungarian convention puts the FAMILY NAME BEFORE the given name in Hungarian-language contexts. 'Nagy János' is the Hungarian-order form of 'János Nagy' (literally 'Nagy John' in English ordering). When writing to Hungarian prospects in Hungarian, use Hungarian-order if known: 'Tisztelt Nagy Úr,' (Mr. Nagy) with Nagy as the family name. When writing in English to the same person, the convention reverses: 'Dear Mr. Nagy,'. Most CRM data stores Hungarian names in Western order; flagging the family name correctly matters. Many Hungarians use Western order externally for business cards, email signatures, and LinkedIn (e.g., 'János Nagy'), so the source of the name matters: if from a Hungarian-language source, family name is first; if from a Western context, given name is first. " +
    "REGISTER LAYERS: Hungarian B2B uses formal Ön (polite third-person singular pronoun, capitalized in correspondence). The verb conjugates to third-person singular even though Ön refers to the recipient directly: 'Ön szeretne találkozni?' (Would you [Ön] like [3rd-person verb] to meet?). This is structurally similar to Spanish usted or German Sie but with third-person agreement. NEVER use Te (informal you) for cold B2B; it's the equivalent of using 'du' or 'ты'. The Maga form (an older middle-register, lower respect than Ön but more formal than Te) is now archaic in B2B; use Ön for cold, Te only after explicit relationship-warming. " +
    "GREETING REGISTERS: " +
    "'Üdvözlöm, {NAME},' — formal-respectful, literally 'I greet (you)'; the standard B2B chat opening. " +
    "'Jó napot kívánok, {NAME},' — formal 'Good day I wish'; works through the day. " +
    "'Tisztelt {LastName} Úr, / Tisztelt {LastName} Asszony,' — most formal email-equivalent (Tisztelt = 'respected'; Úr = Mr. / Asszony = Mrs. or married woman). Hungarian convention puts family name before Úr / Asszony, in Hungarian name-order. " +
    "'Szia' / 'Helló' — informal-young; NEVER for cold B2B. " +
    "ORTHOGRAPHY: Hungarian Latin script with diacritics: á (a-acute), é (e-acute), í (i-acute), ó (o-acute), ö (o-umlaut), ő (o-double-acute — THIS IS HUNGARIAN-SPECIFIC, distinct from ö; sometimes called 'O with hungarumlaut'), ú (u-acute), ü (u-umlaut), ű (u-double-acute — also Hungarian-specific, distinct from ü). Get ő and ű right; substituting ö/ü or o/u reads as foreign-template. Hungarian uses agglutinative suffixes (ban/ben for 'in', nak/nek for dative, etc.) — these change based on vowel harmony. Numbers use space thousands separator: '1 234 567' (some sources use period like German, both seen; space is more universal in modern B2B). " +
    "CURRENCY: HUF (Ft, forint). The forint has effectively no fractional unit in B2B (filler subunit exists historically but is unused); no decimals: '1 234 567 Ft' (Ft as suffix with space). For larger amounts: 'M Ft' (millió forint / million Ft, e.g., '50 M Ft'), 'Mrd Ft' (milliárd / billion Ft, e.g., '1 Mrd Ft'). Hungarian B2B figures are nominally large due to the weak forint vs EUR (~390-400 HUF/EUR); '1 million Ft' is roughly EUR 2,500. Many Hungarian B2B contexts dual-quote in EUR (especially for multinationals and software). Hungary has not adopted the euro despite EU membership. " +
    "CITY/MARKET REFERENCES: " +
    "Budapest (the commercial / political center; ~1.7M city + ~3M metro Budapest agglomeration; the dominant Hungarian city by every B2B metric. District V Belváros / Lipótváros for traditional finance and government, District VI Terézváros for diverse business, District XIII Újlipótváros and the Váci út / Váci úti irodakorridor (Váci Road Office Corridor) for modern corporate HQs and tech offices, District IX Ferencváros for startups and creative agencies, District II / III in Buda hills for residential and consulting, Andrássy út for premium retail and embassies, MOM Park and BudaPart for newer business districts). " +
    "Debrecen (~200K, eastern Hungary, the second-largest city; Universitatea Debrecenului / DE; pharma — Richter Gedeon; BMW factory under construction with planned operations starting mid-decade, attracting suppliers; growing tech). " +
    "Szeged (~160K, southern Hungary, ELI-ALPS research / laser; pharma; Szegedi Tudományegyetem). " +
    "Miskolc (~150K, northern industrial, traditional metallurgy and machinery). " +
    "Pécs (~140K, southern Hungary; university town). " +
    "Győr (~130K, western Hungary near Austrian border; Audi Hungaria Motor Kft engine and assembly plant — the largest engine factory in the world by some measures; Suzuki Hungaria nearby in Esztergom). " +
    "Kecskemét (~110K, Bács-Kiskun; Mercedes-Benz manufacturing). " +
    "Székesfehérvár (~95K, near Budapest; ALCOA, Denso, Grundfos). " +
    "PEER BRANDS by tier: " +
    "Banking tier: OTP Bank (THE dominant Hungarian bank; the largest by assets and the most internationally expanded Hungarian financial institution — regional CEE presence in Bulgaria, Romania, Croatia, Serbia, Slovenia, Albania, Moldova; BUX-listed; founded 1949 as the savings bank monopoly), MBH Bank (post-2023 merger of MKB, Budapest Bank, and Takarékbank — now the second-largest by various metrics, state-influenced), K&H Bank (KBC Belgium subsidiary), Erste Bank Hungary, Raiffeisen Bank Hungary, UniCredit Bank Hungary, CIB Bank (Intesa Sanpaolo). " +
    "Industrial / state tier: MOL Group (oil and gas, BUX-listed — the largest Hungarian industrial company by revenue, with operations across Hungary, Slovakia (Slovnaft), Croatia (INA), Romania (MOL Romania), Italy, Czech Republic; international supply chain reach), MVM Group (state energy holding — includes Paks nuclear power plant operations, hydropower, gas trading), Magyar Telekom (telco, Deutsche Telekom-controlled — the dominant Hungarian fixed and mobile operator), Yettel Hungary (formerly Telenor Hungary, now PPF Group; second mobile operator), Vodafone Hungary (third mobile), Digi Hungary (DIGI Communications), Magyar Posta (state post / banking via Magyar Posta Bank). " +
    "Manufacturing / automotive (Hungary is heavily automotive-industrial — automotive employs ~6% of Hungarian workforce): Audi Hungaria Győr (engines + Q3 / TT model assembly), Mercedes-Benz Manufacturing Hungary Kecskemét (CLA / GLA / B-Class), BMW Debrecen (under construction, scheduled production mid-decade), Suzuki Magyarország Esztergom (Vitara / S-Cross), Stellantis Szentgotthárd (engines), Continental Hungary, Bosch Hungary (sensors, automotive electronics), Knorr-Bremse Budapest (brake systems), Schaeffler. " +
    "Pharma: Richter Gedeon (BUX-listed, the largest Hungarian pharma, gynecology focus, regional CEE), Egis (CVC-owned), TEVA Hungary, sanofi-aventis Magyarország. " +
    "E-commerce / tech: eMAG Hungary (the Romanian eMAG's Hungarian operation, large Hungarian e-commerce presence), Vatera (older Hungarian classifieds, AukciósHáz-owned), Jófogás (classifieds, Schibsted-owned), Bookline (books / culture), Edigital (electronics), GLS Hungary / Magyar Posta Logisztika (logistics). Mobility / delivery: Wolt Hungary (Finnish DoorDash-owned), Bolt Hungary (Estonian), Foodpanda Hungary (Delivery Hero). Hungarian tech: LogMeIn / GoTo (originally Hungarian-founded by Marton Anka, now US-public), Prezi (Hungarian-founded by Adam Somlai-Fischer, the presentation platform — internationally famous Hungarian tech success), Ustream (acquired by IBM), NNG (in-car navigation, AppNexus-acquired then IDG / SoftBank context), Tresorit (encrypted cloud storage, Swiss-Hungarian, Swiss Post-acquired). " +
    "Match peer tier to prospect's company: banking-tier for finance (OTP especially well-recognized for regional comparisons), MOL / MVM for traditional industrial / energy, automotive-tier (Audi / Mercedes / BMW / Suzuki) for manufacturing, eMAG / Wolt / Bolt for consumer-tech, Prezi / LogMeIn / Tresorit for Hungarian tech-product references. " +
    "TONE: formal, structured, slightly reserved in Hungarian-language B2B; warmer when English is used (Hungarian B2B often switches to English for tech / startup contexts, especially in Budapest). Hungarian business culture values: explicit respect via Ön and Tisztelt openings, clear hierarchical acknowledgment, precise language (Hungarian is precise about case and tense), and avoidance of marketing-speak. Hungarian readers are sensitive to grammatical correctness; agglutinative errors signal foreign-template immediately. Avoid hype words ('forradalmi' without source, 'piacvezető' without numbers, 'egyedülálló') which read as advertising. Sign-offs: 'Tisztelettel,' (formal standard, the most common B2B sign-off — literally 'With respect'), 'Üdvözlettel,' ('With greetings', slightly warmer-formal, the second-most-common), 'Köszönettel,' ('With thanks', for messages with a specific ask), 'Szép napot,' ('Have a nice day', casual-warm, modern Budapest tech-style). Match sign-off to opening: 'Tisztelt {LastName} Úr / Asszony' pairs with 'Tisztelettel,' or 'Üdvözlettel,'; 'Üdvözlöm' pairs with 'Üdvözlettel,' or 'Köszönettel,'.",

  "bg-BG":
    "Bulgarian-Bulgaria (bg-BG): Bulgaria is the only major Bulgarian B2B adtech market. The base Bulgarian (bg) guide covers HEAVY Cyrillic localization with mandatory term conversions (retention>задържане, install>инсталация, conversion>конверсия, targeting>таргетиране, traffic>трафик, fraud>фрод, creatives>криейтиви, lookalike>подобна аудитория); that all still applies. This regional entry adds Bulgaria-specific city, currency, peer-brand, and register depth on top of the base bg guide. " +
    "REGISTER LAYERS: Bulgarian B2B uses formal Вие (capitalized in formal correspondence; lowercase вие acceptable on chat) for cold outreach. Вие is the polite second-person plural form used as singular-formal (like Russian вы / French vous). Never ти (singular informal) for cold B2B. Verbs conjugate to second-person plural: 'бихте искали' (would you like). The relationship-warming transition to ти is more relaxed in Bulgarian B2B than in Russian or Ukrainian; younger Bulgarian tech / startup contexts shift to ти faster, but cold outreach always opens with Вие. " +
    "GREETING REGISTERS: " +
    "'Здравейте, {NAME},' — standard chat opening, the safe default. " +
    "'Добър ден, {NAME},' — slightly more traditional alternative ('Good day'). " +
    "'Уважаеми г-н {LastName}, / Уважаема г-жо {LastName},' — most formal email-equivalent (gendered: г-н = gospodin Mr. / г-жо = gospozho vocative of Ms.). " +
    "'Здрасти' / 'Чао' — informal-young; NEVER for cold B2B. " +
    "ORTHOGRAPHY: Cyrillic script. Bulgarian uses fewer letters than Russian (no ы, no э, no ь as a soft sign with the same functions; the letter й is used). Latin acronyms (CPI, CPA, ROAS, DSP, LTV, MMP) embed inline within Cyrillic sentences and read naturally. Numbers use space as thousands separator and comma as decimal: '1 234 567,89' (European-style). Percentages use % symbol. " +
    "CURRENCY: BGN (лв., the lev / leva plural). Currency suffix follows the amount with a space: '1 234 567,89 лв.' For larger amounts: 'млн.' (million) and 'млрд.' (billion). The Bulgarian lev has been pegged to the euro at ~1.95583 BGN/EUR since 1999 (currency board arrangement), so euro-quoted figures are common in Bulgarian B2B even pre-adoption. Bulgaria is preparing for euro adoption with a target of January 2026 / 2027; some B2B contexts already dual-quote in EUR or use EUR primarily. After euro adoption the lev will be retired. " +
    "CITY/MARKET REFERENCES: " +
    "София (Sofia, capital and commercial center; ~1.2M city + ~1.7M metro; the dominant Bulgarian B2B destination by every metric. Mladost area / Tsarigradsko shose / Bulgaria Boulevard for tech parks and corporate office buildings — comparable in cluster density to Brno or Cluj as a CEE tech-cluster destination. Lozenets and Iztok for premium business addresses. Sofia Tech Park as a state-organized tech hub). " +
    "Пловдив (Plovdiv, ~340K, the second-largest city; mixed manufacturing + IT outsourcing; Trakia Economic Zone is one of the largest industrial zones in southeast Europe; growing tech sector). " +
    "Варна (Varna, ~330K, Black Sea port and tourism; growing IT and shared-services). " +
    "Бургас (Burgas, ~200K, Black Sea port and petrochemical — Lukoil Neftohim Burgas refinery is one of the largest in the Balkans). " +
    "Русе (Ruse, ~150K, Danube port, traditionally industrial). " +
    "Стара Загора (Stara Zagora, ~140K, industrial / energy / Maritsa East coal complex). " +
    "PEER BRANDS by tier: " +
    "Banking tier: UniCredit Bulbank (UniCredit Italy subsidiary, the largest Bulgarian bank by assets and the dominant corporate bank), DSK Bank (OTP Group Hungary, second-largest — Bulgarian B2B reflexively knows DSK as the leading retail bank), Postbank / Eurobank Bulgaria (Eurobank Greece-owned), Raiffeisenbank Bulgaria, KBC Bank Bulgaria (formerly CIBANK then UBB-CIBANK merger; KBC Belgium-owned), Allianz Bank Bulgaria, Investbank, ProCredit Bank Bulgaria, First Investment Bank / Fibank (one of the few Bulgarian-owned banks at scale, BSE-listed), TBI Bank. Most Bulgarian banks are foreign-European-owned; domestic ownership is rarer at scale. " +
    "Industrial / state tier: Bulgargaz (state gas trading), Bulgartransgaz (state gas transmission, IPO discussed), NEK / Natsionalna Elektricheska Kompaniya (state electricity), Kozloduy NPP (state nuclear power plant, the largest Bulgarian electricity producer), Lukoil Neftohim Burgas (Russian Lukoil-owned refinery — one of the largest in the Balkans), Aurubis Bulgaria (formerly KCM, copper, German Aurubis-owned), Solvay Sodi (chemicals, Belgian Solvay), Zlatna Panega Cement, Devnya Cement. Heavy industry remains a significant Bulgarian export sector. " +
    "Telco / mobile: A1 Bulgaria (formerly Mtel, A1 Telekom Austria-owned; the dominant Bulgarian mobile operator by subscribers), Yettel Bulgaria (formerly Telenor Bulgaria, PPF Group-owned post Telenor CEE divestment), Vivacom (Bulgaria's national telco; fixed + mobile + TV; United Group / BC Partners ownership). " +
    "Retail / FMCG tier: Lidl Bulgaria (Schwarz Group), Kaufland Bulgaria (also Schwarz Group), Billa Bulgaria (REWE Group), Fantastico (Bulgarian-owned grocery chain), T Market, Gloria, Carrefour Bulgaria (exited 2013 but brand persists in some contexts), Metro Bulgaria (Cash&Carry), Praktiker (DIY, German). " +
    "E-commerce / digital tier: eMAG Bulgaria (the Romanian eMAG's Bulgarian operation; the dominant Bulgarian e-commerce platform by margin), OLX.bg (classifieds, Prosus), Bazar.bg (older classifieds), Auto.bg (car listings), Imot.bg (real estate), eBag (online grocery, Sofia-focused), eShop (electronics). Logistics: Speedy AD (the dominant Bulgarian parcel courier, BSE-listed — every Bulgarian B2B uses Speedy for B2B and B2C delivery), Econt Express (the second dominant courier; private). " +
    "Tech / software tier: VMware Bulgaria (Sofia is a major VMware engineering center, one of the largest VMware sites globally; now part of Broadcom post-2023 acquisition), HP Bulgaria, IBM Bulgaria, SAP Labs Bulgaria, Software Group (Sofia-based fintech / banking software), Telerik / Progress (Bulgarian-founded by Svetozar Georgiev and Vassil Terziev as Telerik in 2002, acquired by Progress Software in 2014 for $262.5M — the most internationally successful Bulgarian tech company and the reference Bulgarian tech success story; the Telerik Academy training program is also widely known), Bulpros Consulting, ScaleFocus (Sofia-headquartered, expanded internationally), Modis Bulgaria (Adecco-owned), Coca-Cola HBC IT Services (Sofia), Telerik Academy. Mobility / delivery: Wolt Bulgaria (Finnish DoorDash-owned), Bolt Bulgaria (Estonian), Foodpanda Bulgaria (Delivery Hero, may be wound down regionally), Glovo Bulgaria (Spanish Delivery Hero-acquired). " +
    "Match peer tier to prospect's company: banking-tier (UniCredit Bulbank / DSK) for finance, state-industrial (NEK / Bulgargaz / Lukoil) for traditional, A1 / Yettel / Vivacom for telco, eMAG for e-commerce, Telerik / VMware / SAP Labs for tech, Speedy / Econt for logistics. " +
    "TONE: pragmatic, mid-formal. Bulgarian B2B values: clear respect via Вие throughout, concrete deliverables with numbers, slightly more directness than Greek but slightly less than Czech or German. Bulgarian business culture is broadly similar to Romanian / Hungarian / Russian in formality conventions; Sofia tech is becoming more Anglo-influenced (English-tolerant, faster pace) similar to Cluj / Krakow. Avoid hype words ('революционен' without source, 'пазарен лидер' without numbers, 'единствен в своя род') which read as advertising. Sign-offs: 'С уважение,' (formal standard, the most common B2B sign-off — literally 'With respect'), 'Поздрави,' ('Regards', casual-professional, modern B2B chat default), 'С най-добри пожелания,' ('With best wishes', warmer-formal). Match sign-off to opening: 'Уважаеми г-н / Уважаема г-жо' opening pairs with 'С уважение,'; 'Здравейте' pairs with 'Поздрави,' or 'С уважение,'.",

  "el-GR":
    "Greek-Greece (el-GR): Greece is the primary Greek B2B adtech market. The base Greek (el) guide covers HEAVY localization with term conversions (retention>διατήρηση, install>εγκατάσταση, conversion>μετατροπή, targeting>στόχευση, traffic>επισκεψιμότητα, creatives>δημιουργικά, lookalike>παρόμοιο κοινό); that all still applies. This regional entry adds Greece-specific city, currency, peer-brand, register, and unique-to-Greek-B2B shipping-industry depth on top of the base el guide. " +
    "REGISTER LAYERS: Greek B2B uses formal εσείς (esis, the plural-formal second-person, parallel to French vous or Spanish ustedes used as polite singular). Never εσύ (esy, informal singular) for cold outreach. Verbs conjugate to second-person plural even when addressing a single person: 'θα θέλατε' (would you like, plural form used as polite singular). The transition to εσύ is a meaningful relationship-warming step in Greek business culture, typically initiated by the senior party or after explicit invitation. " +
    "GREETING REGISTERS: " +
    "'Γεια σας, {NAME},' — standard chat opening, literally 'health to you (plural-formal)'; the safe default. " +
    "'Καλημέρα, {NAME},' — morning specifically (~05:00-12:00). " +
    "'Καλησπέρα, {NAME},' — afternoon / evening (~17:00 onwards). " +
    "'Αξιότιμε κύριε {LastName},' / 'Αξιότιμη κυρία {LastName},' — most formal email-equivalent (gendered: κύριε is vocative Mr. / κυρία is Mrs.; Αξιότιμε / Αξιότιμη is 'esteemed'). " +
    "'Γεια σου' (singular-informal) and bare 'Γεια!' or 'Χαίρετε' — informal or archaic; NEVER for cold B2B. " +
    "ORTHOGRAPHY: Greek alphabet for all structural text. The polytonic system (multiple accent marks) was officially replaced by monotonic (single acute accent only) in 1982; modern B2B uses monotonic exclusively. Vowels with acute accent (ά, έ, ή, ί, ό, ύ, ώ) for stressed syllables. Latin acronyms (CPI, CPA, ROAS, DSP, LTV, MMP) embed inline within Greek sentences and read naturally. Numbers use European convention: period as thousands separator, comma as decimal: '1.234.567,89'. Percentages use % symbol. " +
    "CURRENCY: EUR (€). Greece adopted the euro in 2002 (one of the original euro-zone members; the drachma was retired). Standard European separators: '€1.234.567,89'. 'εκ.' (ekatommyria / millions, abbreviation common) and 'δισ.' (disekatommyria / billions) for larger amounts. " +
    "CITY/MARKET REFERENCES: " +
    "Αθήνα (Athens, the commercial / political center; ~3.1M Attica metro; the dominant Greek city by every B2B metric and home to the headquarters of essentially all major Greek companies. Syntagma Square area for traditional finance and government, Kolonaki for premium business addresses, Vouliagmenis Avenue corridor for tech / multinational offices, Marousi for tech parks and corporate HQs — comparable to Brno or Bucharest as a tech-cluster destination, Glyfada and the southern suburbs for newer business addresses, Piraeus port area for shipping and logistics HQs). " +
    "Θεσσαλονίκη (Thessaloniki, the second-largest city; ~325K city + ~1M metro; northern Greece / Macedonia commercial hub; Aristotle University as a tech-transfer source; growing tech sector; OK Thessaloniki tech park). " +
    "Πάτρα (Patras, ~210K, western Peloponnese port; University of Patras). " +
    "Ηράκλειο (Heraklion, ~140K, Crete's capital; tourism + Foundation for Research and Technology / FORTH). " +
    "Λάρισα (Larissa, ~150K, Thessaly agricultural center). " +
    "Βόλος (Volos, ~110K, central Greek port). " +
    "PEER BRANDS by tier: " +
    "Banking tier (THE four 'systemic' Greek banks post-crisis consolidation, all Greek-listed): Eurobank Holdings (the largest by various metrics; international footprint includes Postbank Bulgaria, Eurobank Cyprus), National Bank of Greece / NBG (the most historic Greek bank, founded 1841, state-influenced via HFSF residual ownership), Alpha Bank (Greek-listed, also operates in Romania, Cyprus), Piraeus Bank / Piraeus Financial Holdings (Greek-listed, the largest by assets post some reclassifications). These four are the only Greek banks of B2B reference scale; Greek banking is highly consolidated post-2010s crisis. " +
    "Industrial / state tier: Public Power Corporation / PPC / ΔΕΗ (Dimosia Epicheirisi Ilektrismou; state-controlled electricity utility — the dominant Greek utility, also expanded to Romania, Bulgaria, Croatia via 2024 Enel Romania acquisition), DESFA (state gas transmission), Hellenic Petroleum / ELPE / HELLENiQ ENERGY (the dominant Greek refiner, Greek-listed), Motor Oil Hellas (the second Greek refiner, Vardinogiannis-family-controlled). " +
    "Mytilineos Energy & Metals (BVB-listed conglomerate; aluminum + energy + concessions + EPC contracting — one of the most internationally successful Greek industrial groups, headquartered in Athens). " +
    "GEK Terna (engineering + concessions). " +
    "Titan Cement Group (Greek-founded cement, internationally listed and operating). " +
    "Telco: OTE / Cosmote (Hellenic Telecommunications Organization; Deutsche Telekom-controlled; the dominant Greek fixed and mobile operator — Cosmote is the mobile brand, OTE is the fixed-line brand, both under OTE Group; also operates in Romania via Telekom Romania historically, now divested post-Orange 2024), Vodafone Greece (acquired Wind Hellas 2024 — Vodafone is now the second mobile operator), Nova Greece (formerly Wind, United Group / BC Partners ownership). " +
    "Shipping (UNIQUELY important for Greek B2B; the Greek-owned merchant fleet is the largest in the world by tonnage, ~21% of global tonnage; family-owned shipping companies are major Greek B2B references and represent enormous wealth concentration. Names worth knowing for Greek peer context): Angelicoussis Shipping Group (Anangel Bulk Carriers + Maran Tankers + Maran Gas Maritime — one of the largest), Tsakos Energy Navigation (NYSE-listed TNP), Star Bulk Carriers (Nasdaq-listed SBLK, Hamburg-headquartered now but Greek-founded), Diana Shipping (NYSE-listed DSX), Costamare (NYSE-listed CMRE), Navios Maritime, GasLog (LNG), Capital Maritime, Dynacom Tankers, Polembros Shipping, Restis-family, Vafias-family. The Piraeus Cluster and the Hellenic Chamber of Shipping are major B2B contexts. " +
    "Retail / FMCG: Sklavenitis Group (the largest Greek-owned supermarket chain, expanded via 2017 Marinopoulos acquisition), AB Vassilopoulos (Ahold Delhaize), Lidl Hellas (Schwarz Group), My Market (Metro AEBE), Galaxias, Masoutis. " +
    "E-commerce / tech: Skroutz (THE dominant Greek price-comparison and marketplace platform — the Amazon-equivalent reflex for Greek B2B; private but central to Greek e-commerce), e-shop.gr (electronics e-commerce, Public-group related), Public.gr (Public Group — electronics / books / lifestyle retail, MIG Telecom heritage), Plaisio (electronics), efood (food delivery, OTE-acquired then Delivery Hero context), Wolt Greece (Finnish), Box Now (parcel lockers, Greek expanding regionally). Tourism platforms: Discover Greece, Trivago Hellas. " +
    "Tourism / hospitality (~25% of Greek GDP including indirect, so worth noting for any tourism-adjacent B2B): Astir Palace, Costa Navarino, Sani Resort (Halkidiki), Grecotel, Aldemar, Mitsis Hotels, TUI Greece, Aegean Airlines (Greek-listed AEGN — the largest Greek airline), Sky Express. " +
    "Match peer tier to prospect's company: banking-tier (the four systemic banks) for finance, state-industrial (PPC / ELPE) for traditional, OTE / Vodafone for telco, shipping families for maritime, Skroutz / Public for retail-tech, tourism brands for hospitality. " +
    "TONE: warm-formal, slightly more relational than CEE; Greek B2B sits between Italian/Spanish Mediterranean warmth and Northern European formality. Greek business culture values: explicit respect via εσείς and αξιότιμε / αξιότιμη openings, personal-relationship acknowledgment (Greek B2B often references mutual contacts, past meetings, family or background context — relationship capital matters more than in Anglo-Saxon norms), and concrete numbers paired with relational warmth. Greek business is often family-owned (especially shipping, retail, tourism, traditional industrial) — acknowledging family heritage in peer references is appropriate context. Avoid hype words ('επαναστατικός' without source, 'ηγέτης της αγοράς' without numbers, 'μοναδικός') which read as advertising. Sign-offs: 'Με εκτίμηση,' (formal standard, the most common B2B sign-off — literally 'With esteem'), 'Με σεβασμό,' (more formal alternative, 'With respect'), 'Φιλικά,' ('Cordially', warmer-formal, modern), 'Καλή συνέχεια,' ('Have a good continuation', semi-formal closing-warm). Match sign-off to opening: 'Αξιότιμε κύριε / Αξιότιμη κυρία' pairs with 'Με εκτίμηση,' or 'Με σεβασμό,'; 'Γεια σας' pairs with 'Με εκτίμηση,' or 'Φιλικά,'.",

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
    "Sign-offs: 'Trân trọng,' (the most formal B2B email close, literally 'with respect / sincerely' — the standard Vietnamese B2B email close, used universally), 'Kính thư,' (very formal, archaic — for ceremonial contexts), 'Cảm ơn anh/chị,' (thank you brother/sister, warmer-casual for chat), 'Chúc anh/chị một ngày tốt lành,' (have a good day, warm closing). Match sign-off to opening: 'Kính gửi anh/chị' pairs with 'Trân trọng'; 'Chào anh/chị' pairs with 'Trân trọng' or 'Cảm ơn anh/chị'.",
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
