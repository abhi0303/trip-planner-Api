/**
 * Fills in latitude/longitude for canonical places that have none.
 *
 * Places created through POST /places before the client started sending
 * coordinates have null lat/lng, so they cannot appear on a map or drive any
 * distance-based feature. This looks each one up in OpenStreetMap (Nominatim)
 * and reports what it would set.
 *
 *   npm run places:coords            # dry run — prints, writes nothing
 *   npm run places:coords -- --apply # writes the confident matches
 *
 * Reports first and writes only on --apply, because a wrong coordinate is worse
 * than a missing one: a missing pin shows nothing, a wrong pin puts a beach in
 * the wrong state and nobody notices until a user does.
 *
 * Only ever fills nulls. Existing coordinates are never touched.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
/** Nominatim asks for max 1 request/second and a real User-Agent. */
const REQUEST_INTERVAL_MS = 1100;
const USER_AGENT = 'TripSphere/0.1 (place coordinate backfill; contact: admin@tripsphere.app)';

interface Candidate {
  latitude: number;
  longitude: number;
  displayName: string;
  osmCategory: string;
  osmType: string;
  score: number;
}

type Verdict = 'confident' | 'unsure' | 'none';

interface Outcome {
  place: { id: string; name: string; state: string | null; countryCode: string };
  candidate: Candidate | null;
  verdict: Verdict;
  reason: string;
}

/**
 * What OpenStreetMap calls the thing we call a BEACH, a FORT and so on.
 * Without this the first result wins, and the first result for "Cola Beach" is
 * a beach resort several kilometres from the beach.
 */
const PREFERRED_OSM: Record<string, string[]> = {
  BEACH: ['natural:beach', 'natural:bay', 'place:locality'],
  MOUNTAIN: ['natural:peak', 'natural:ridge', 'natural:valley', 'place:locality'],
  LAKE: ['natural:water', 'water:lake'],
  WATERFALL: ['waterway:waterfall', 'natural:waterfall'],
  FOREST: ['natural:wood', 'landuse:forest'],
  ISLAND: ['place:island', 'place:islet'],
  DESERT: ['natural:desert', 'place:locality'],
  VIEWPOINT: ['tourism:viewpoint'],
  FORT: ['historic:fort', 'historic:castle', 'historic:ruins', 'historic:archaeological_site'],
  MONUMENT: ['historic:monument', 'historic:memorial', 'tourism:attraction'],
  MUSEUM: ['tourism:museum'],
  TEMPLE: ['amenity:place_of_worship', 'historic:temple'],
  CHURCH: ['amenity:place_of_worship'],
  MOSQUE: ['amenity:place_of_worship'],
  PARK: ['leisure:park', 'boundary:national_park'],
  WILDLIFE: ['boundary:national_park', 'leisure:nature_reserve'],
  TREK: ['natural:peak', 'highway:path', 'place:locality'],
  CITY: ['place:city', 'place:town', 'place:suburb', 'place:state_district', 'place:county'],
  TOWN: ['place:town', 'place:village', 'place:suburb'],
  VILLAGE: ['place:village', 'place:hamlet', 'place:suburb'],
  MARKET: ['amenity:marketplace', 'shop:*'],
  AIRPORT: ['aeroway:aerodrome'],
  STATION: ['railway:station', 'amenity:bus_station'],
  HOTEL: ['tourism:hotel', 'tourism:resort', 'tourism:guest_house'],
  RESTAURANT: ['amenity:restaurant'],
  CAFE: ['amenity:cafe'],
  BAR: ['amenity:bar', 'amenity:pub'],
};

/** Businesses that borrow a landmark's name and outrank it in search. */
const COMMERCIAL = [
  'tourism:hotel',
  'tourism:guest_house',
  'tourism:apartment',
  'tourism:resort',
  'amenity:restaurant',
  'amenity:cafe',
  'amenity:bar',
  'shop',
  'office',
];

const HOSPITALITY_CATEGORIES = new Set(['HOTEL', 'RESTAURANT', 'CAFE', 'BAR']);

async function search(query: string, countryCode: string) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '10');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('countrycodes', countryCode.toLowerCase());

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim returned ${res.status}`);

  return (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
    name?: string;
    category?: string;
    type?: string;
  }>;
}

/**
 * Ranks results so the landform beats the business named after it, and a match
 * in the wrong state loses to one in the right state.
 */
function rank(
  place: { name: string; state: string | null; category: string },
  hits: Awaited<ReturnType<typeof search>>,
): Candidate | null {
  const preferred = PREFERRED_OSM[place.category] ?? [];
  const wantsBusiness = HOSPITALITY_CATEGORIES.has(place.category);
  const bareName = place.name
    .toLowerCase()
    .replace(/\b(beach|fort|valley|temple|island)\b/g, '')
    .trim();

  const scored = hits
    .map((hit) => {
      const latitude = Number(hit.lat);
      const longitude = Number(hit.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

      const kind = `${hit.category}:${hit.type}`;
      const haystack = hit.display_name.toLowerCase();
      let score = 0;

      if (preferred.includes(kind)) score += 5;
      else if (preferred.some((p) => p.endsWith(':*') && kind.startsWith(p.slice(0, -1))))
        score += 4;

      if (!wantsBusiness && COMMERCIAL.some((c) => kind.startsWith(c))) score -= 6;

      if (place.state && haystack.includes(place.state.toLowerCase())) score += 2;
      if (bareName && (hit.name ?? '').toLowerCase().includes(bareName)) score += 2;
      if (bareName && haystack.startsWith(bareName)) score += 1;

      return {
        latitude,
        longitude,
        displayName: hit.display_name,
        osmCategory: hit.category ?? '',
        osmType: hit.type ?? '',
        score,
      };
    })
    .filter((c): c is Candidate => c !== null)
    .sort((a, b) => b.score - a.score);

  return scored[0] ?? null;
}

/**
 * A single result is not evidence it is the right one. Anything that does not
 * clear the bar is reported but not written, so a human decides.
 */
function judge(
  place: { name: string; state: string | null; category: string },
  candidate: Candidate | null,
): { verdict: Verdict; reason: string } {
  if (!candidate) return { verdict: 'none', reason: 'no match in OpenStreetMap' };

  // A name typed as a list ("palolem, cola beach and butterfly beach") is not a
  // place. Whatever matched first would be misleading.
  if (/\band\b|,/.test(place.name)) {
    return { verdict: 'unsure', reason: 'name looks like several places in one row' };
  }

  if (candidate.score < 4) {
    const kind = `${candidate.osmCategory}:${candidate.osmType}`;
    return {
      verdict: 'unsure',
      reason: `best match is a ${kind}, not confidently the right place`,
    };
  }

  if (place.state && !candidate.displayName.toLowerCase().includes(place.state.toLowerCase())) {
    return { verdict: 'unsure', reason: `match is not in ${place.state}` };
  }

  return {
    verdict: 'confident',
    reason: `${candidate.osmCategory}:${candidate.osmType} · ${candidate.displayName
      .split(',')
      .slice(0, 2)
      .join(',')}`,
  };
}

async function main(): Promise<void> {
  const places = await prisma.place.findMany({
    where: { OR: [{ latitude: null }, { longitude: null }] },
    select: {
      id: true,
      name: true,
      city: true,
      region: true,
      state: true,
      country: true,
      countryCode: true,
      category: true,
    },
    orderBy: [{ countryCode: 'asc' }, { name: 'asc' }],
  });

  if (!places.length) {
    console.log('Every place already has coordinates. Nothing to do.');
    return;
  }

  console.log(
    `${places.length} place${places.length === 1 ? '' : 's'} without coordinates` +
      `${APPLY ? '' : '  (dry run — nothing will be written)'}\n`,
  );

  const outcomes: Outcome[] = [];

  for (const [index, place] of places.entries()) {
    // Narrowest query first; widen only if it found nothing worth having. Over-
    // constraining with city and region is what made well-known beaches miss.
    const queries = [
      [place.name, place.city, place.state, place.country].filter(Boolean).join(', '),
      [place.name, place.state, place.country].filter(Boolean).join(', '),
      [place.name, place.country].filter(Boolean).join(', '),
    ].filter((q, i, all) => all.indexOf(q) === i);

    let candidate: Candidate | null = null;
    let failure: string | null = null;

    for (const query of queries) {
      try {
        const hit = rank(place, await search(query, place.countryCode));
        if (hit && (!candidate || hit.score > candidate.score)) candidate = hit;
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
      if (candidate && candidate.score >= 7) break;
      await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS));
    }

    const { verdict, reason } = failure
      ? { verdict: 'none' as Verdict, reason: `lookup failed: ${failure}` }
      : judge(place, candidate);

    outcomes.push({ place, candidate, verdict, reason });

    const mark = verdict === 'confident' ? 'ok  ' : verdict === 'unsure' ? 'SKIP' : '--  ';
    const coords =
      candidate && verdict === 'confident'
        ? `${candidate.latitude.toFixed(5)}, ${candidate.longitude.toFixed(5)}`
        : '';
    console.log(`  ${mark} ${place.name.slice(0, 34).padEnd(36)} ${coords.padEnd(22)} ${reason}`);

    if (index < places.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS));
    }
  }

  const confident = outcomes.filter((o) => o.verdict === 'confident');
  const unsure = outcomes.filter((o) => o.verdict === 'unsure');
  const none = outcomes.filter((o) => o.verdict === 'none');

  console.log(
    `\n${confident.length} confident, ${unsure.length} needs a human, ${none.length} no match`,
  );

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write the confident matches.');
    if (unsure.length) {
      console.log('The skipped ones need their coordinates set by hand — check the reasons above.');
    }
    return;
  }

  for (const outcome of confident) {
    await prisma.place.update({
      where: { id: outcome.place.id },
      data: {
        latitude: outcome.candidate!.latitude,
        longitude: outcome.candidate!.longitude,
      },
    });
  }

  console.log(`\nUpdated ${confident.length} place${confident.length === 1 ? '' : 's'}.`);
  if (unsure.length || none.length) {
    console.log(`${unsure.length + none.length} left untouched for someone to set by hand.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
