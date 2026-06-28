/**
 * Mirror of /etl/normalize_categories.py so UI inputs (e.g. "GN", "BC-A") can be
 * normalized client-side before hitting the API. Source of truth is still the
 * Python ETL — this file should be re-generated whenever mappings change.
 */
type Rule = { match: RegExp; normalized: string };

const CAT_RULES: Rule[] = [
  [/^(open|ur|gn|gen|general|oc)$/i, "OPEN"],
  [/^(ews|gen[- ]?ews|ew|general[- ]?ews)$/i, "EWS"],
  [/^(obc|obc[- ]?ncl|bc|bcl)$/i, "OBC"],
  [/^sc$/i, "SC"], [/^st$/i, "ST"],
  [/^(pwd|pwbd|ph|divyang|divyangjan)$/i, "PwD"],
  [/^mbc$/i, "MBC"], [/^bcm$/i, "BCM"], [/^sca$/i, "SCA"], [/^sebc$/i, "SEBC"],
  [/^bc[- ]?a$/i, "BC-A"], [/^bc[- ]?b$/i, "BC-B"],
  [/^bc[- ]?c$/i, "BC-C"], [/^bc[- ]?d$/i, "BC-D"], [/^bc[- ]?e$/i, "BC-E"],
  [/^(nt|nt[- ]?b|nt[- ]?c|nt[- ]?d|vj|vj[- ]?a)$/i, "NT"],
  [/^gm$/i, "GM"], [/^1g$/i, "1G"],
  [/^2a$/i, "2A"], [/^2b$/i, "2B"], [/^3a$/i, "3A"], [/^3b$/i, "3B"],
  [/^(sm|state[- ]?merit)$/i, "SM"],
  [/^ez$/i, "EZ"], [/^mu$/i, "MU"], [/^bh$/i, "BH"], [/^la$/i, "LA"],
  [/^dv$/i, "DV"], [/^vk$/i, "VK"], [/^kn$/i, "KN"], [/^ku$/i, "KU"],
].map(([m, n]) => ({ match: m as RegExp, normalized: n as string }));

const QUOTA_RULES: Rule[] = [
  [/^aiq$|all india quota/i, "AIQ"],
  [/^state$|^state quota$|^sq$/i, "STATE"],
  [/^management$|^mgmt$|^mq$/i, "MANAGEMENT"],
  [/^nri$|non[- ]?resident/i, "NRI"],
  [/^deemed$|deemed[- ]?university/i, "DEEMED"],
  [/central[- ]?(institute|inst)|^cic$/i, "CENTRAL"],
  [/esic|insured[- ]?person|ip[- ]?quota/i, "ESIC_IP"],
  [/^afmc$/i, "AFMC"], [/^aiims$/i, "AIIMS"], [/^jipmer$/i, "JIPMER"],
  [/^bhu$|banaras[- ]?hindu/i, "BHU"], [/^amu$|aligarh[- ]?muslim/i, "AMU"],
  [/^du$|delhi[- ]?university/i, "DU"], [/^jamia$|jamia[- ]?millia/i, "JAMIA"],
  [/^minority$|muslim[- ]?minority|christian[- ]?minority/i, "MINORITY"],
  [/^govt$|government/i, "GOVT"], [/^private$/i, "PRIVATE"],
].map(([m, n]) => ({ match: m as RegExp, normalized: n as string }));

export function normalizeCategory(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = String(raw).trim();
  for (const r of CAT_RULES) if (r.match.test(v)) return r.normalized;
  return null;
}
export function normalizeQuota(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = String(raw).trim();
  for (const r of QUOTA_RULES) if (r.match.test(v)) return r.normalized;
  return null;
}

export const CATEGORY_OPTIONS = ["OPEN","EWS","OBC","SC","ST","PwD","MBC","BC-A","BC-B","BC-C","BC-D","BC-E","BCM","SCA","SEBC","NT","GM","1G","2A","2B","3A","3B","SM","EZ","MU","BH","LA","DV","VK","KN","KU"];
export const QUOTA_OPTIONS    = ["AIQ","STATE","MANAGEMENT","NRI","DEEMED","CENTRAL","ESIC_IP","AFMC","AIIMS","JIPMER","BHU","AMU","DU","JAMIA","MINORITY","GOVT","PRIVATE"];
export const STATE_OPTIONS    = ["AP","TG","TN","KA","KL","MH","DL","UP","WB","RJ","GJ","PY","HR","PB","BR","JH","OD","CG","MP","AS","UK","HP","JK","CH","DN","DD","LA","GA","ML","TR","MZ","NL","MN","AR","SK","AN"];
