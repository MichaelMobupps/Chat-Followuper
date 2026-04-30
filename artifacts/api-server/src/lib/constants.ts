export const TEST_MODE_LABEL = "followup app test";

export const DEFAULT_DOCTRINE_LABEL = "Doctrine SDR";

export const VERTICAL_LABELS: Record<string, string> = {
  gaming_ua: "Doctrine SDR/gaming-ua",
  non_gaming_ua: "Doctrine SDR/non-gaming-ua",
  cps: "Doctrine SDR/cps",
  retargeting: "Doctrine SDR/retargeting",
};

export const ALL_DOCTRINE_LABELS = [
  DEFAULT_DOCTRINE_LABEL,
  ...Object.values(VERTICAL_LABELS),
];
