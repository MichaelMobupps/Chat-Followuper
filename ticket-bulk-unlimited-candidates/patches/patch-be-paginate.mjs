#!/usr/bin/env node
/**
 * Ticket bulk-unlimited-candidates — BE pagination
 *
 * artifacts/api-server/src/services/apollo.ts
 *
 * Replace the single-page (per_page=25) searchPeople with paginated
 * fetch:
 *   - per_page bumped 25 → 100 (Apollo's max single-page)
 *   - paginate up to 5 pages = 500 candidates max safety cap
 *   - stop early when Apollo returns < per_page (last page reached)
 *
 * Single anchored edit. Idempotent (marker = new constant name).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/apollo.ts",
);

const EDIT_OLD = `/**
 * Search Apollo people inside a specific organization, filtered by titles.
 * Returns up to 25 people.
 */
export async function searchPeople(
  orgId: string,
  titles: string[],
): Promise<ApolloPersonSummary[]> {
  if (!orgId || orgId.trim().length === 0) {
    return [];
  }

  const titleList =
    titles.length > 0 ? titles : Array.from(DEFAULT_SDR_TITLES);

  const body = {
    organization_ids: [orgId],
    person_titles: titleList,
    page: 1,
    per_page: 25,
  };

  const response = await apolloFetch<PeopleSearchResponse>(
    "/mixed_people/api_search",
    { method: "POST", body },
  );

  const people = response.people ?? [];
  return people.map(mapPerson).filter((p) => p.id.length > 0);
}`;

const EDIT_NEW = `/**
 * Search Apollo people inside a specific organization, filtered by titles.
 *
 * Paginates Apollo's people-search endpoint with per_page=100 (Apollo's
 * max for single-page) and a hard 5-page (500-candidate) safety cap.
 * Stops early when Apollo returns fewer than per_page (= last page
 * reached). For typical companies this fetches all candidates in 1 call;
 * large orgs (>500 marketing/UA-titled people) hit the cap and SDR can
 * re-run with stricter title filters.
 *
 * Removed in Ticket bulk-unlimited-candidates: the prior fixed cap of
 * 25 was hiding most candidates from larger orgs.
 */
const SEARCH_PEOPLE_PER_PAGE = 100;
const SEARCH_PEOPLE_MAX_PAGES = 5;

export async function searchPeople(
  orgId: string,
  titles: string[],
): Promise<ApolloPersonSummary[]> {
  if (!orgId || orgId.trim().length === 0) {
    return [];
  }

  const titleList =
    titles.length > 0 ? titles : Array.from(DEFAULT_SDR_TITLES);

  const allPeople: ApolloPersonSummary[] = [];
  for (let page = 1; page <= SEARCH_PEOPLE_MAX_PAGES; page++) {
    const body = {
      organization_ids: [orgId],
      person_titles: titleList,
      page,
      per_page: SEARCH_PEOPLE_PER_PAGE,
    };

    const response = await apolloFetch<PeopleSearchResponse>(
      "/mixed_people/api_search",
      { method: "POST", body },
    );

    const pagePeople = (response.people ?? [])
      .map(mapPerson)
      .filter((p) => p.id.length > 0);
    allPeople.push(...pagePeople);

    // Stop when Apollo returns fewer than per_page (= last page reached)
    if (pagePeople.length < SEARCH_PEOPLE_PER_PAGE) {
      break;
    }
  }

  return allPeople;
}`;

const EDIT_MARKER = `SEARCH_PEOPLE_PER_PAGE = 100`;

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
  return count;
}

let source;
try {
  source = readFileSync(FILE, "utf8");
} catch (err) {
  console.error(`[FATAL] cannot read ${FILE}: ${err.message}`);
  process.exit(2);
}

const m = countOccurrences(source, EDIT_MARKER);
const o = countOccurrences(source, EDIT_OLD);

if (m > 0) {
  console.log("[searchPeople-paginate] SKIP — already applied");
  process.exit(0);
}
if (o === 0) {
  console.log("[searchPeople-paginate] NOOP — anchor not found");
  process.exit(3);
}
if (o > 1) {
  console.log(`[searchPeople-paginate] FAIL — anchor matched ${o} times`);
  process.exit(3);
}

writeFileSync(FILE, source.replace(EDIT_OLD, EDIT_NEW), "utf8");
const next = readFileSync(FILE, "utf8");

const evidence = {
  perPageConst: countOccurrences(next, "SEARCH_PEOPLE_PER_PAGE = 100") === 1,
  maxPagesConst: countOccurrences(next, "SEARCH_PEOPLE_MAX_PAGES = 5") === 1,
  paginationLoop: countOccurrences(next, "for (let page = 1; page <= SEARCH_PEOPLE_MAX_PAGES; page++)") === 1,
  oldHardcoded25Gone: countOccurrences(next, "per_page: 25,\n  };") === 0,
  oldComment25Gone: countOccurrences(next, "Returns up to 25 people.") === 0,
};
console.log("[searchPeople-paginate] APPLY");
console.log("[searchPeople-paginate] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[searchPeople-paginate] FAIL — evidence check failed");
  process.exit(4);
}
process.exit(0);
