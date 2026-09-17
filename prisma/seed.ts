/**
 * Seed data for local development and FE integration.
 *
 * Builds the worked example from the spec (Sreyanse's ₹50,000 South Goa trip)
 * plus enough surrounding trips that place aggregates clear MIN_SAMPLE_SIZE and
 * the feed, search and budget filters all return something.
 *
 * Idempotent: re-running wipes and rebuilds. Never run against production.
 */
import {
  CrowdLevel,
  ExpenseCategory,
  ExpenseMode,
  PlaceCategory,
  PrismaClient,
  RatingCriteria,
  RatingType,
  RealityCheckSeverity,
  TravelStyle,
  TripStatus,
  Visibility,
  Weather,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { calculateDuration, deriveSeason } from '../src/common/utils/date.util';
import { toSlug } from '../src/common/utils/slug.util';

const prisma = new PrismaClient();
const PASSWORD = 'Password123';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database');
  }

  console.log('Clearing existing data...');
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "reports", "notifications", "saves", "collections", "comments", "likes",
      "post_media", "posts", "trip_activities", "trip_days", "reality_checks",
      "trip_ratings", "trip_photos", "trip_stays", "trip_expenses",
      "trip_places", "trips", "media", "places", "blocks", "follows",
      "refresh_tokens", "users"
    RESTART IDENTITY CASCADE;
  `);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // --- Users ---------------------------------------------------------------
  console.log('Creating users...');
  const users = await Promise.all(
    [
      { username: 'sreyanse', name: 'Sreyanse Pradhan', homeCity: 'Bengaluru', bio: 'Beach person. Documenting every rupee.' },
      { username: 'rahul', name: 'Rahul Menon', homeCity: 'Mumbai', bio: 'Road trips and street food.' },
      { username: 'priya', name: 'Priya Sharma', homeCity: 'Delhi', bio: 'Budget travel, solo mostly.' },
      { username: 'amit', name: 'Amit Verma', homeCity: 'Pune', bio: 'Mountains > beaches. Usually.' },
      { username: 'neha', name: 'Neha Iyer', homeCity: 'Chennai', bio: 'Photographer. Monsoon chaser.' },
    ].map((u) =>
      prisma.user.create({
        data: {
          ...u,
          email: `${u.username}@example.com`,
          passwordHash,
          homeCountry: 'IN',
          emailVerified: true,
        },
      }),
    ),
  );

  const [sreyanse, rahul, priya, amit, neha] = users;

  // --- Follow graph --------------------------------------------------------
  const follows = [
    [rahul.id, sreyanse.id],
    [priya.id, sreyanse.id],
    [amit.id, sreyanse.id],
    [neha.id, sreyanse.id],
    [sreyanse.id, rahul.id], // mutual with rahul -> FRIENDS visibility works
    [sreyanse.id, neha.id],
    [priya.id, rahul.id],
  ];

  for (const [followerId, followingId] of follows) {
    await prisma.follow.create({ data: { followerId, followingId } });
    await prisma.user.update({ where: { id: followerId }, data: { followingCount: { increment: 1 } } });
    await prisma.user.update({ where: { id: followingId }, data: { followerCount: { increment: 1 } } });
  }

  // --- Places --------------------------------------------------------------
  console.log('Creating canonical places...');

  const goa = await createPlace({
    name: 'Goa',
    state: 'Goa',
    category: PlaceCategory.CITY,
    isDestination: true,
    latitude: 15.2993,
    longitude: 74.124,
  });

  const southGoa = await createPlace({
    name: 'South Goa',
    state: 'Goa',
    region: 'South Goa',
    category: PlaceCategory.CITY,
    isDestination: true,
    parentId: goa.id,
    latitude: 15.1,
    longitude: 74.0,
  });

  const northGoa = await createPlace({
    name: 'North Goa',
    state: 'Goa',
    region: 'North Goa',
    category: PlaceCategory.CITY,
    isDestination: true,
    parentId: goa.id,
    latitude: 15.55,
    longitude: 73.75,
  });

  const cola = await createPlace({
    name: 'Cola Beach',
    state: 'Goa',
    region: 'South Goa',
    city: 'Canacona',
    category: PlaceCategory.BEACH,
    parentId: southGoa.id,
    latitude: 15.0439,
    longitude: 74.0186,
    description: 'Secluded beach with a freshwater lagoon behind the sand.',
  });

  const agonda = await createPlace({
    name: 'Agonda Beach',
    state: 'Goa',
    region: 'South Goa',
    city: 'Canacona',
    category: PlaceCategory.BEACH,
    parentId: southGoa.id,
    latitude: 15.0435,
    longitude: 73.9868,
  });

  const palolem = await createPlace({
    name: 'Palolem Beach',
    state: 'Goa',
    region: 'South Goa',
    city: 'Canacona',
    category: PlaceCategory.BEACH,
    parentId: southGoa.id,
    latitude: 15.0099,
    longitude: 74.0233,
  });

  const caboDeRama = await createPlace({
    name: 'Cabo de Rama Fort',
    state: 'Goa',
    region: 'South Goa',
    category: PlaceCategory.FORT,
    parentId: southGoa.id,
    latitude: 15.0893,
    longitude: 73.9203,
  });

  const butterfly = await createPlace({
    name: 'Butterfly Beach',
    state: 'Goa',
    region: 'South Goa',
    category: PlaceCategory.BEACH,
    parentId: southGoa.id,
    latitude: 15.0233,
    longitude: 74.0322,
  });

  const anjuna = await createPlace({
    name: 'Anjuna Beach',
    state: 'Goa',
    region: 'North Goa',
    category: PlaceCategory.BEACH,
    parentId: northGoa.id,
    latitude: 15.5752,
    longitude: 73.7407,
  });

  const manali = await createPlace({
    name: 'Manali',
    state: 'Himachal Pradesh',
    category: PlaceCategory.MOUNTAIN,
    isDestination: true,
    latitude: 32.2396,
    longitude: 77.1887,
  });

  const solangValley = await createPlace({
    name: 'Solang Valley',
    state: 'Himachal Pradesh',
    category: PlaceCategory.MOUNTAIN,
    parentId: manali.id,
    latitude: 32.3167,
    longitude: 77.1567,
  });

  // --- Trips ---------------------------------------------------------------
  console.log('Creating trips...');

  // The spec's worked example (§2, §47).
  await createTrip({
    user: sreyanse,
    title: 'My South Goa Experience',
    state: 'Goa',
    destination: 'South Goa',
    destinationId: southGoa.id,
    startDate: '2026-08-12',
    endDate: '2026-08-15',
    adults: 2,
    expenseMode: ExpenseMode.DETAILED,
    travelStyles: [TravelStyle.COUPLE, TravelStyle.BEACH, TravelStyle.RELAXATION, TravelStyle.PHOTOGRAPHY],
    weather: Weather.RAINY,
    crowdLevel: CrowdLevel.LOW,
    experience:
      'South Goa was much quieter than North Goa. Cola was beautiful but reaching there was slightly difficult — the last stretch is a steep dirt track. Agonda was the best base: calm, walkable, good food.',
    enjoyedMost: 'The lagoon behind Cola beach, and having Agonda almost to ourselves in monsoon.',
    surprisedBy: 'How empty everything was. We expected some crowd even in August.',
    wentWrong: 'Took a sedan to Cola. Should not have.',
    wouldDoDifferently: 'Stay one extra night and skip the Palolem day trip.',
    adviceForTravelers: 'Rent a scooter in Agonda. Carry cash — card machines are unreliable.',
    places: [
      { place: agonda, sequence: 0, visitDate: '2026-08-12', durationMinutes: 300 },
      { place: cola, sequence: 1, visitDate: '2026-08-13', durationMinutes: 240 },
      { place: palolem, sequence: 2, visitDate: '2026-08-14', durationMinutes: 300 },
      { place: caboDeRama, sequence: 3, visitDate: '2026-08-14', durationMinutes: 120 },
    ],
    expenses: [
      { category: ExpenseCategory.TRANSPORTATION, subcategory: 'FLIGHT', amount: 16000 },
      { category: ExpenseCategory.TRANSPORTATION, subcategory: 'TAXI', amount: 4000 },
      { category: ExpenseCategory.FOOD, subcategory: 'RESTAURANT', amount: 7000 },
      { category: ExpenseCategory.FOOD, subcategory: 'STREET_FOOD', amount: 3000 },
      { category: ExpenseCategory.STAY, subcategory: 'HOTEL', amount: 6000 },
      { category: ExpenseCategory.ACTIVITIES, subcategory: 'WATER_SPORTS', amount: 4000 },
      { category: ExpenseCategory.SHOPPING, subcategory: 'SOUVENIRS', amount: 5000 },
      { category: ExpenseCategory.OTHER, subcategory: 'TIPS', amount: 5000 },
    ],
    stays: [
      {
        hotelName: 'Monsoon Agonda',
        placeId: agonda.id,
        location: 'Agonda Beach, Canacona',
        checkIn: '2026-08-12',
        checkOut: '2026-08-15',
        amount: 6000,
        roomType: 'Sea view cottage',
        rating: 4.5,
        bookingPlatform: 'Booking.com',
      },
    ],
    ratings: [
      {
        type: RatingType.PLACE,
        placeId: cola.id,
        scores: {
          [RatingCriteria.SCENERY]: 5,
          [RatingCriteria.CROWD]: 4,
          [RatingCriteria.CLEANLINESS]: 4,
          [RatingCriteria.ACCESSIBILITY]: 3,
          [RatingCriteria.VALUE]: 4,
          [RatingCriteria.PHOTOGRAPHY]: 5,
          [RatingCriteria.COUPLE_FRIENDLY]: 5,
        },
      },
      {
        type: RatingType.PLACE,
        placeId: agonda.id,
        scores: {
          [RatingCriteria.SCENERY]: 5,
          [RatingCriteria.CROWD]: 5,
          [RatingCriteria.CLEANLINESS]: 4,
          [RatingCriteria.ACCESSIBILITY]: 4,
          [RatingCriteria.FOOD]: 4,
        },
      },
      {
        type: RatingType.TRIP,
        scores: { [RatingCriteria.OVERALL]: 5, [RatingCriteria.VALUE]: 4 },
      },
    ],
    realityChecks: [
      {
        text: 'The road to Cola Beach is a steep dirt track. Do not take a sedan, especially in monsoon.',
        severity: RealityCheckSeverity.DANGER,
        placeId: cola.id,
      },
      {
        text: 'Swimming is not recommended at Cola in August — strong undertow.',
        severity: RealityCheckSeverity.WARNING,
        placeId: cola.id,
      },
      {
        text: 'Limited food options near Cabo de Rama. Eat before you go.',
        severity: RealityCheckSeverity.INFO,
        placeId: caboDeRama.id,
      },
    ],
    itinerary: [
      { dayNumber: 1, title: 'Arrival and Agonda sunset', activities: ['Arrival at Goa Airport', 'Hotel check-in', 'Agonda beach walk'] },
      { dayNumber: 2, title: 'Cola Beach day', activities: ['Drive to Cola Beach', 'Lagoon swim', 'Sunset at Agonda'] },
      { dayNumber: 3, title: 'Palolem and the fort', activities: ['Palolem Beach', 'Cabo de Rama Fort', 'Seafood dinner'] },
      { dayNumber: 4, title: 'Return', activities: ['Check-out', 'Flight home'] },
    ],
    post: 'Four days in South Goa in peak monsoon. Quieter than we imagined, and half the price of December. Full breakdown in the trip.',
  });

  await createTrip({
    user: rahul,
    title: 'North Goa on a budget',
    state: 'Goa',
    destination: 'North Goa',
    destinationId: northGoa.id,
    startDate: '2026-01-10',
    endDate: '2026-01-13',
    adults: 2,
    expenseMode: ExpenseMode.TOTAL,
    totalExpense: 32000,
    travelStyles: [TravelStyle.COUPLE, TravelStyle.BEACH, TravelStyle.NIGHTLIFE, TravelStyle.BUDGET],
    weather: Weather.SUNNY,
    crowdLevel: CrowdLevel.HIGH,
    experience: 'Peak season North Goa. Loud, crowded, and genuinely fun if that is what you want.',
    adviceForTravelers: 'Book the scooter in advance in January — prices double at the shacks.',
    places: [
      { place: anjuna, sequence: 0, durationMinutes: 300 },
      { place: northGoa, sequence: 1, durationMinutes: 600 },
    ],
    stays: [{ hotelName: 'Anjuna Beach Rooms', placeId: anjuna.id, amount: 9000, rating: 3.5 }],
    ratings: [
      {
        type: RatingType.PLACE,
        placeId: anjuna.id,
        scores: {
          [RatingCriteria.SCENERY]: 4,
          [RatingCriteria.CROWD]: 2,
          [RatingCriteria.CLEANLINESS]: 3,
          [RatingCriteria.VALUE]: 4,
        },
      },
    ],
    post: 'North Goa in January: ₹32k for two, four days. Worth it for the nightlife alone.',
  });

  await createTrip({
    user: priya,
    title: 'Solo South Goa on ₹18k',
    state: 'Goa',
    destination: 'South Goa',
    destinationId: southGoa.id,
    startDate: '2025-12-05',
    endDate: '2025-12-09',
    adults: 1,
    expenseMode: ExpenseMode.TOTAL,
    totalExpense: 18000,
    travelStyles: [TravelStyle.SOLO, TravelStyle.BUDGET, TravelStyle.BACKPACKING, TravelStyle.BEACH],
    weather: Weather.SUNNY,
    crowdLevel: CrowdLevel.MODERATE,
    experience: 'Hostels in Palolem, sleeper bus in and out. December is busier but the sea is calm.',
    adviceForTravelers: 'Sleeper bus from Bengaluru is ₹1,200 and saves a night of accommodation.',
    places: [
      { place: palolem, sequence: 0, durationMinutes: 480 },
      { place: butterfly, sequence: 1, durationMinutes: 180 },
      { place: cola, sequence: 2, durationMinutes: 200 },
    ],
    stays: [{ hotelName: 'Palolem Beach Hostel', placeId: palolem.id, amount: 4000, rating: 4 }],
    ratings: [
      {
        type: RatingType.PLACE,
        placeId: cola.id,
        scores: {
          [RatingCriteria.SCENERY]: 5,
          [RatingCriteria.CROWD]: 4,
          [RatingCriteria.ACCESSIBILITY]: 2,
          [RatingCriteria.SOLO_FRIENDLY]: 4,
          [RatingCriteria.VALUE]: 5,
        },
      },
      {
        type: RatingType.PLACE,
        placeId: palolem.id,
        scores: { [RatingCriteria.SCENERY]: 4, [RatingCriteria.CROWD]: 3, [RatingCriteria.VALUE]: 5 },
      },
    ],
    realityChecks: [
      {
        text: 'Butterfly Beach is only reachable by boat or a 40-minute walk. Boatmen quote ₹1,500 — negotiate.',
        severity: RealityCheckSeverity.WARNING,
        placeId: butterfly.id,
      },
    ],
    post: '5 days in South Goa, solo, ₹18,000 all in. Breakdown in the trip — the bus is the whole trick.',
  });

  await createTrip({
    user: neha,
    title: 'Monsoon photography run, South Goa',
    state: 'Goa',
    destination: 'South Goa',
    destinationId: southGoa.id,
    startDate: '2026-08-20',
    endDate: '2026-08-24',
    adults: 2,
    expenseMode: ExpenseMode.TOTAL,
    totalExpense: 44000,
    // Public trip, private numbers — exercises the expenseVisibility rule.
    expenseVisibility: Visibility.PRIVATE,
    travelStyles: [TravelStyle.PHOTOGRAPHY, TravelStyle.BEACH, TravelStyle.FRIENDS],
    weather: Weather.RAINY,
    crowdLevel: CrowdLevel.VERY_LOW,
    experience: 'Went for the storm light. Got four days of it. Cola in the rain is unreal.',
    places: [
      { place: cola, sequence: 0, durationMinutes: 420 },
      { place: agonda, sequence: 1, durationMinutes: 360 },
      { place: caboDeRama, sequence: 2, durationMinutes: 180 },
    ],
    stays: [{ hotelName: 'Agonda Villas', placeId: agonda.id, amount: 12000, rating: 4.5 }],
    ratings: [
      {
        type: RatingType.PLACE,
        placeId: cola.id,
        scores: {
          [RatingCriteria.SCENERY]: 5,
          [RatingCriteria.PHOTOGRAPHY]: 5,
          [RatingCriteria.CROWD]: 5,
          [RatingCriteria.ACCESSIBILITY]: 2,
          [RatingCriteria.CLEANLINESS]: 4,
        },
      },
    ],
    post: 'Four days chasing monsoon light in South Goa. Cola Beach in a storm is the best thing I have shot this year.',
  });

  await createTrip({
    user: amit,
    title: 'Manali in the snow',
    state: 'Himachal Pradesh',
    destination: 'Manali',
    destinationId: manali.id,
    startDate: '2026-01-20',
    endDate: '2026-01-25',
    adults: 4,
    expenseMode: ExpenseMode.TOTAL,
    totalExpense: 96000,
    travelStyles: [TravelStyle.ADVENTURE, TravelStyle.FRIENDS, TravelStyle.ROAD_TRIP],
    weather: Weather.SNOWY,
    crowdLevel: CrowdLevel.MODERATE,
    experience: 'Drove up from Delhi. Solang was packed but the drive itself was the trip.',
    places: [
      { place: manali, sequence: 0, durationMinutes: 900 },
      { place: solangValley, sequence: 1, durationMinutes: 300 },
    ],
    stays: [{ hotelName: 'Old Manali Homestay', placeId: manali.id, amount: 24000, rating: 4 }],
    ratings: [
      {
        type: RatingType.PLACE,
        placeId: solangValley.id,
        scores: { [RatingCriteria.SCENERY]: 5, [RatingCriteria.CROWD]: 2, [RatingCriteria.VALUE]: 3 },
      },
    ],
    realityChecks: [
      {
        text: 'Chains are mandatory past Solang in January. Rentals at the checkpoint are overpriced.',
        severity: RealityCheckSeverity.WARNING,
        placeId: solangValley.id,
      },
    ],
    post: 'Delhi to Manali by road in January with four people. ₹96k total, and worth every rupee for that drive.',
  });

  // A draft, so FE has something for the "continue your draft" state.
  await createTrip({
    user: sreyanse,
    title: 'Gokarna (planning)',
    state: 'Karnataka',
    destination: 'Gokarna',
    startDate: '2026-11-05',
    endDate: '2026-11-08',
    adults: 2,
    expenseMode: ExpenseMode.TOTAL,
    totalExpense: 22000,
    travelStyles: [TravelStyle.BEACH, TravelStyle.COUPLE],
    places: [],
    draft: true,
  });

  // --- Collections ---------------------------------------------------------
  console.log('Creating collections and saves...');

  const goaPlans = await prisma.collection.create({
    data: { userId: rahul.id, name: 'Goa Plans', emoji: '🏖️' },
  });

  const sreyanseTrip = await prisma.trip.findFirstOrThrow({
    where: { userId: sreyanse.id, status: TripStatus.PUBLISHED },
  });
  const priyaTrip = await prisma.trip.findFirstOrThrow({ where: { userId: priya.id } });

  for (const [userId, tripId, collectionId] of [
    [rahul.id, sreyanseTrip.id, goaPlans.id],
    [rahul.id, priyaTrip.id, goaPlans.id],
    [amit.id, sreyanseTrip.id, null],
  ] as const) {
    await prisma.save.create({ data: { userId, tripId, collectionId } });
    await prisma.trip.update({ where: { id: tripId }, data: { saveCount: { increment: 1 } } });
    if (collectionId) {
      await prisma.collection.update({
        where: { id: collectionId },
        data: { itemCount: { increment: 1 } },
      });
    }
  }

  // --- Engagement ----------------------------------------------------------
  const posts = await prisma.post.findMany({ select: { id: true, userId: true } });

  for (const post of posts) {
    const likers = users.filter((u) => u.id !== post.userId).slice(0, 3);
    for (const liker of likers) {
      await prisma.like.create({ data: { postId: post.id, userId: liker.id } });
    }
    await prisma.post.update({
      where: { id: post.id },
      data: { likeCount: likers.length },
    });
  }

  const goaPost = await prisma.post.findFirstOrThrow({ where: { userId: sreyanse.id } });
  const comment = await prisma.comment.create({
    data: { postId: goaPost.id, userId: rahul.id, body: 'How was the road to Cola in August?' },
  });
  await prisma.comment.create({
    data: {
      postId: goaPost.id,
      userId: sreyanse.id,
      parentId: comment.id,
      body: 'Rough. Take a scooter or an SUV — we regretted the sedan.',
    },
  });
  await prisma.comment.update({ where: { id: comment.id }, data: { replyCount: 1 } });
  await prisma.post.update({ where: { id: goaPost.id }, data: { commentCount: 2 } });

  // --- Place aggregate cache ----------------------------------------------
  console.log('Refreshing place aggregates...');
  await refreshAllPlaceAggregates();

  const counts = {
    users: await prisma.user.count(),
    places: await prisma.place.count(),
    trips: await prisma.trip.count(),
    posts: await prisma.post.count(),
    expenses: await prisma.tripExpense.count(),
    ratings: await prisma.tripRating.count(),
  };

  console.log('\nSeed complete:', counts);
  console.log(`\nSign in with any of: ${users.map((u) => u.email).join(', ')}`);
  console.log(`Password: ${PASSWORD}\n`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createPlace(input: {
  name: string;
  state?: string;
  region?: string;
  city?: string;
  category: PlaceCategory;
  parentId?: string;
  isDestination?: boolean;
  latitude?: number;
  longitude?: number;
  description?: string;
}) {
  return prisma.place.create({
    data: {
      name: input.name,
      slug: toSlug(`${input.name}-${input.state ?? 'india'}`),
      countryCode: 'IN',
      country: 'India',
      state: input.state,
      region: input.region,
      city: input.city,
      category: input.category,
      parentId: input.parentId,
      isDestination: input.isDestination ?? false,
      isVerified: true,
      latitude: input.latitude,
      longitude: input.longitude,
      description: input.description,
    },
  });
}

interface TripInput {
  user: { id: string };
  title: string;
  state: string;
  destination: string;
  destinationId?: string;
  startDate: string;
  endDate: string;
  adults: number;
  expenseMode: ExpenseMode;
  totalExpense?: number;
  expenseVisibility?: Visibility;
  travelStyles: TravelStyle[];
  weather?: Weather;
  crowdLevel?: CrowdLevel;
  experience?: string;
  enjoyedMost?: string;
  surprisedBy?: string;
  wentWrong?: string;
  wouldDoDifferently?: string;
  adviceForTravelers?: string;
  places: { place: { id: string }; sequence: number; visitDate?: string; durationMinutes?: number }[];
  expenses?: { category: ExpenseCategory; subcategory: string; amount: number }[];
  stays?: {
    hotelName: string;
    placeId?: string;
    location?: string;
    checkIn?: string;
    checkOut?: string;
    amount: number;
    roomType?: string;
    rating: number;
    bookingPlatform?: string;
  }[];
  ratings?: { type: RatingType; placeId?: string; scores: Record<string, number> }[];
  realityChecks?: { text: string; severity: RealityCheckSeverity; placeId?: string }[];
  itinerary?: { dayNumber: number; title: string; activities: string[] }[];
  post?: string;
  draft?: boolean;
}

async function createTrip(input: TripInput) {
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  const { nights, days } = calculateDuration(startDate, endDate);

  const lineTotal = (input.expenses ?? []).reduce((sum, e) => sum + e.amount, 0);
  const total = input.expenseMode === ExpenseMode.DETAILED ? lineTotal : (input.totalExpense ?? 0);

  const trip = await prisma.trip.create({
    data: {
      userId: input.user.id,
      title: input.title,
      slug: toSlug(input.title),
      countryCode: 'IN',
      country: 'India',
      state: input.state,
      destination: input.destination,
      destinationId: input.destinationId,
      startDate,
      endDate,
      nights,
      days,
      startMonth: startDate.getUTCMonth() + 1,
      startYear: startDate.getUTCFullYear(),
      adults: input.adults,
      travelerCount: input.adults,
      expenseMode: input.expenseMode,
      totalExpense: total,
      currency: 'INR',
      travelStyles: input.travelStyles,
      weather: input.weather,
      crowdLevel: input.crowdLevel,
      season: deriveSeason(startDate, 'IN'),
      visibility: Visibility.PUBLIC,
      expenseVisibility: input.expenseVisibility ?? Visibility.PUBLIC,
      experience: input.experience,
      enjoyedMost: input.enjoyedMost,
      surprisedBy: input.surprisedBy,
      wentWrong: input.wentWrong,
      wouldDoDifferently: input.wouldDoDifferently,
      adviceForTravelers: input.adviceForTravelers,
      status: input.draft ? TripStatus.DRAFT : TripStatus.PUBLISHED,
      publishedAt: input.draft ? null : new Date(),
      placeCount: input.places.length,
    },
  });

  for (const p of input.places) {
    await prisma.tripPlace.create({
      data: {
        tripId: trip.id,
        placeId: p.place.id,
        sequence: p.sequence,
        visitDate: p.visitDate ? new Date(p.visitDate) : undefined,
        durationMinutes: p.durationMinutes,
      },
    });
  }

  for (const e of input.expenses ?? []) {
    await prisma.tripExpense.create({
      data: { tripId: trip.id, category: e.category, subcategory: e.subcategory, amount: e.amount },
    });
  }

  for (const s of input.stays ?? []) {
    await prisma.tripStay.create({
      data: {
        tripId: trip.id,
        hotelName: s.hotelName,
        placeId: s.placeId,
        location: s.location,
        checkIn: s.checkIn ? new Date(s.checkIn) : undefined,
        checkOut: s.checkOut ? new Date(s.checkOut) : undefined,
        nights: s.checkIn && s.checkOut ? calculateDuration(new Date(s.checkIn), new Date(s.checkOut)).nights : undefined,
        amount: s.amount,
        roomType: s.roomType,
        rating: s.rating,
        bookingPlatform: s.bookingPlatform,
      },
    });
  }

  for (const r of input.ratings ?? []) {
    for (const [criteria, score] of Object.entries(r.scores)) {
      await prisma.tripRating.create({
        data: {
          tripId: trip.id,
          ratingType: r.type,
          placeId: r.placeId,
          criteria: criteria as RatingCriteria,
          score,
        },
      });
    }
  }

  for (const rc of input.realityChecks ?? []) {
    await prisma.realityCheck.create({
      data: { tripId: trip.id, placeId: rc.placeId, severity: rc.severity, text: rc.text },
    });
  }

  for (const day of input.itinerary ?? []) {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + day.dayNumber - 1);

    const created = await prisma.tripDay.create({
      data: { tripId: trip.id, dayNumber: day.dayNumber, date, title: day.title },
    });

    for (const [i, title] of day.activities.entries()) {
      await prisma.tripActivity.create({
        data: { dayId: created.id, title, sequence: i },
      });
    }
  }

  if (!input.draft) {
    await prisma.user.update({
      where: { id: input.user.id },
      data: { tripCount: { increment: 1 } },
    });
  }

  if (input.post) {
    await prisma.post.create({
      data: {
        userId: input.user.id,
        tripId: trip.id,
        caption: input.post,
        visibility: Visibility.PUBLIC,
      },
    });
    await prisma.user.update({
      where: { id: input.user.id },
      data: { postCount: { increment: 1 } },
    });
  }

  return trip;
}

/** Mirrors PlaceAggregatesService.refreshCache, kept simple for the seed. */
async function refreshAllPlaceAggregates(): Promise<void> {
  const places = await prisma.place.findMany({ select: { id: true } });

  for (const place of places) {
    const trips = await prisma.trip.findMany({
      where: {
        status: TripStatus.PUBLISHED,
        visibility: Visibility.PUBLIC,
        deletedAt: null,
        places: { some: { placeId: place.id } },
      },
      select: { userId: true, totalExpense: true, travelerCount: true, expenseVisibility: true },
    });

    const ratings = await prisma.tripRating.aggregate({
      where: { placeId: place.id },
      _avg: { score: true },
    });

    const visits = await prisma.tripPlace.aggregate({
      where: { placeId: place.id, durationMinutes: { not: null } },
      _avg: { durationMinutes: true },
    });

    const spends = trips
      .filter((t) => t.expenseVisibility === Visibility.PUBLIC && t.totalExpense)
      .map((t) => Number(t.totalExpense) / Math.max(t.travelerCount, 1));

    await prisma.place.update({
      where: { id: place.id },
      data: {
        experienceCount: trips.length,
        travelerCount: new Set(trips.map((t) => t.userId)).size,
        avgRating: ratings._avg.score,
        avgVisitMinutes: visits._avg.durationMinutes ? Math.round(visits._avg.durationMinutes) : null,
        avgSpendPerPerson: spends.length
          ? spends.reduce((a, b) => a + b, 0) / spends.length
          : null,
        aggregatesAt: new Date(),
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
