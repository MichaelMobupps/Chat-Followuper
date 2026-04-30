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
};

/**
 * Build the nativeness rule block that gets injected into LLM prompts
 * for non-English emails. Returns empty string for English/unknown/empty.
 */
export function buildNativenessBlock(languageTag: string | null | undefined): string {
  const lang = normalizeLanguageCode(languageTag);
  if (!lang || lang === "en") return "";

  const guide = GUIDES[lang] ||
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
  const lang = normalizeLanguageCode(languageTag);
  if (!lang || lang === "en") return "";

  const guide = GUIDES[lang];
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
