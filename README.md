# TripSphere API

Backend for a travel experience social platform. The central object is a **Trip**
— a structured record of who went where, when, how, how much it cost, what they
thought and what they showed — not a review.

```
User
 └── Trip
      ├── Places (canonical, not free text)
      ├── Days → Activities
      ├── Expenses
      ├── Stays
      ├── Photos
      ├── Ratings
      ├── Reality checks
      └── Experience

Trip → Post → Likes / Comments / Saves / Shares
```

That separation is what makes "trips under ₹30k", "August experiences at Cola
Beach" and "people like me" ordinary queries instead of features.

**Stack:** NestJS 11 · TypeScript · PostgreSQL 16 · Prisma 6 · JWT · Swagger

---

## Quick start

```bash
nvm use                      # Node 22.16.0 (see .nvmrc)
npm install
cp .env.example .env         # then set the two JWT secrets

docker compose up -d         # Postgres on :5434
npm run prisma:migrate       # create the schema
npm run seed                 # demo users, trips, places

npm run start:dev
```

| What | Where |
|---|---|
| API | http://localhost:3000/api/v1 |
| Swagger UI | http://localhost:3000/docs |
| OpenAPI JSON | [`swagger.json`](./swagger.json) (committed) |
| Health | http://localhost:3000/health |

**Seeded logins** — `sreyanse@example.com` … `neha@example.com`, password
`Password123`. `sreyanse` has the worked example from the spec: a ₹50,000 South
Goa trip with expenses, stays, ratings, reality checks and a 4-day itinerary.

Generate the two JWT secrets with:

```bash
openssl rand -base64 48
```

---

## The API contract

Agree on this once and neither side has to guess.

### Response envelope

Every success looks like this:

```json
{ "success": true, "data": { }, "timestamp": "2026-08-14T10:12:00.000Z" }
```

Every paginated list looks like this:

```json
{
  "success": true,
  "data": [],
  "meta": { "nextCursor": "eyJpZCI6…", "hasMore": true, "limit": 20, "total": 137 },
  "timestamp": "2026-08-14T10:12:00.000Z"
}
```

Every error looks like this:

```json
{
  "success": false,
  "statusCode": 400,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": ["endDate must be on or after startDate"]
  },
  "path": "/api/v1/trips",
  "timestamp": "2026-08-14T10:12:00.000Z"
}
```

`error.code` is stable and safe to branch on. `error.message` is human-readable
and may change. Codes in use: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`,
`NOT_FOUND`, `ALREADY_EXISTS`, `INVALID_REFERENCE`, `RATE_LIMITED`,
`TRIP_INCOMPLETE`, `INTERNAL_ERROR`.

`/health` is the one endpoint that is **not** wrapped, so uptime monitors can
match on it directly.

### Pagination

Two styles, deliberately:

- **Cursor** — feeds, trips, comments, followers. Pass `meta.nextCursor` back as
  `?cursor=`. Stable while new rows arrive mid-scroll. `limit` max 50.
- **Offset** — search only, where a total count is meaningful. `?page=&limit=`,
  and `meta.total` is populated.

Cursors are opaque. Do not parse them.

### Auth

```
Authorization: Bearer <accessToken>
```

Access tokens last 15 minutes. Refresh with `POST /auth/refresh`.

**Refresh tokens are single-use.** Each call revokes the token you presented and
returns a new pair — store the new one. Replaying a refresh token returns 401,
which is the expected signal to send the user back to login. `POST /auth/logout`
revokes one token; `/auth/logout-all` revokes every session.

### Dates and money

- Dates: `YYYY-MM-DD` (`startDate`, `endDate`, `visitDate`, `checkIn`…).
- Timestamps: ISO-8601 UTC.
- Money: a plain number in the trip's `currency` (ISO-4217). **No minor units** —
  `50000` means ₹50,000, not ₹500.
- Duration is derived server-side and never accepted from the client:
  `nights = endDate − startDate`, `days = nights + 1`. 12→15 Aug is **3 nights /
  4 days**.
- `season` is derived from `startDate` (August → `MONSOON`).

### Visibility — read this before building the trip screen

Every trip carries **two** independent settings:

| Field | Controls |
|---|---|
| `visibility` | Who can see the trip at all |
| `expenseVisibility` | Who can see the money |

Both accept `PUBLIC`, `FOLLOWERS`, `FRIENDS` (= mutual follow) or `PRIVATE`.

So a trip can be public while its spending is private. When the viewer may not
see the money, the fields are **present and `null`** rather than omitted:

```json
{ "totalExpense": null, "perPerson": null, "expenses": null, "stays": [{ "amount": null }] }
```

Render "hidden by the author", not "₹0". Budget filters (`minBudget`/`maxBudget`)
only ever match trips whose expenses are public, so a hidden number is not
searchable either.

A trip the viewer may not see returns **404, not 403** — existence is itself
private. Drafts are visible only to their author, whatever `visibility` says.

### Enums

Do not hardcode enum strings. `GET /trips/meta/enums` returns the expense
subcategory map and the rating-criteria matrix (which criteria are valid for a
`PLACE` vs a `HOTEL`), and every enum is in `swagger.json`.

---

## swagger.json

`swagger.json` is committed at the repo root and is the contract of record. FE
can feed it straight into a mock server, a client generator or Postman.

```bash
npm run swagger:generate     # rewrite swagger.json
```

**Regenerate and commit it in the same PR as any controller or DTO change.** Its
diff is the API change log — a reviewer should be able to read it and see exactly
what changed for the client. `operationId`s are stable (`Trips_create`,
`Places_findOne`), so generated client method names stay put across releases.

Current surface: 73 paths, 92 operations, 66 schemas.

---

## Endpoints

### Auth
| | |
|---|---|
| `POST /auth/register` | Create an account |
| `POST /auth/login` | Email **or** username + password |
| `POST /auth/google` | Google ID token; 501 until `GOOGLE_CLIENT_ID` is set |
| `POST /auth/refresh` | Rotate the token pair |
| `POST /auth/logout` · `/auth/logout-all` | Revoke one / all sessions |
| `GET /auth/me` | Current profile |
| `POST /auth/change-password` | Revokes all sessions |

### Users
| | |
|---|---|
| `GET /users/:idOrUsername` | Profile; accepts a uuid **or** a username |
| `PATCH /users/me` · `DELETE /users/me` | Update / deactivate |
| `POST · DELETE /users/:id/follow` | Follow, unfollow (idempotent) |
| `GET /users/:id/followers` · `/following` | Social graph |
| `GET /users/:id/travel-map` | Country/state pins for the profile map |

### Trips — the wizard
| | |
|---|---|
| `POST /trips` | Steps 1–3. Saves a **DRAFT** |
| `PATCH /trips/:id` | One call per wizard step; send only what changed |
| `POST /trips/:id/places` · `PATCH` · `DELETE` · `PUT /places/order` | Step 4 + route order |
| `PUT /trips/:id/expenses` | Step 5, bulk replace (what the expense screen submits) |
| `POST · PATCH · DELETE /trips/:id/expenses/:expenseId` | Single line items |
| `POST · PATCH · DELETE /trips/:id/stays/:stayId` | Step 6 |
| `POST /trips/:id/photos` · `DELETE /photos/:photoId` | Step 7 |
| `PUT /trips/:id/ratings` | Step 9, upsert per rating group |
| `POST /trips/:id/reality-checks` | Warnings for the next traveler |
| `POST /trips/:id/publish` | Step 11 — validates completeness |
| `POST /trips/:id/unpublish` · `DELETE /trips/:id` | Back to draft / soft delete |
| `GET /trips/me?status=DRAFT` | "Continue your draft" |
| `GET /trips/:idOrSlug` | Full experience in one response |
| `GET /trips/meta/enums` | Subcategory + rating-criteria maps |

`POST /trips/:id/publish` refuses an incomplete trip with `TRIP_INCOMPLETE` and
lists what is missing — render `error.details.problems` directly:

```json
{ "code": "TRIP_INCOMPLETE",
  "details": { "problems": ["Add at least one place you visited"] } }
```

### Discovery
`GET /trips` is the workhorse behind Explore, the Budget Explorer and
similar-trip lists:

```
?countryCode=IN &state=Goa &placeId=<uuid> &destinationId=<uuid>
&minBudget=20000 &maxBudget=30000
&minDays=3 &maxDays=5 &travelerCount=2
&travelStyles=COUPLE,BEACH
&month=8 &season=MONSOON
&sort=recent|popular|budget_low|budget_high|oldest
```

### Places
| | |
|---|---|
| `GET /places/search?q=` | Type-ahead for the wizard |
| `POST /places` | Find-or-create a canonical place |
| `GET /places/:idOrSlug` | Place page + aggregates |
| `GET /places/:idOrSlug/experiences?month=8` | Everyone who went, optionally by month |
| `GET /places/popular` · `/places/destinations` | Explore + filter dropdowns |

### Itinerary
`GET /trips/:id/itinerary` · `PUT …/days` · `POST …/days/:n/activities` ·
`PUT …/days/:n/activities/order` · `PATCH · DELETE …/activities/:id`

### Social
`POST /posts` · `GET /feed?type=for-you|following|friends` ·
`POST · DELETE /posts/:id/like` · `/save` · `POST /posts/:id/share` ·
`GET · POST /posts/:id/comments` · `GET /posts/comments/:id/replies`

### Saved, search, media, moderation
`GET · POST /collections` · `GET /saved/trips` · `POST · DELETE /trips/:id/save`
`GET /search?q=` · `/search/places` · `/search/trips` · `/search/users`
`POST /media/upload` (multipart, field `files`, max 20)
`POST /reports` · `POST · DELETE /users/:id/block` · `GET /admin/reports`

---

## Aggregate statistics — the honesty rule

`GET /places/:id` returns averages over every public experience at that place:
rating breakdown by criterion, average visit duration, average spend per person,
popular travel styles, month-by-month distribution and the places most often
combined with it.

**Averages are withheld below `MIN_SAMPLE_SIZE` (default 3).** Under the
threshold, `hasEnoughData` is `false` and every average is `null` — so two
enthusiastic reviews can never render as "4.9 ★ average". Check
`hasEnoughData` before showing any aggregate as a trend.

Only `PUBLIC` + `PUBLISHED` trips feed the statistics, and spend figures
additionally require `expenseVisibility: PUBLIC`.

---

## Project layout

```
src/
  common/          envelope, error filter, pagination, visibility rules, domain constants
  config/          configuration + fail-fast env validation
  prisma/          PrismaService
  modules/
    auth/          register, login, Google, refresh rotation, guards
    users/         profiles, follow graph, travel map
    places/        canonical places + aggregate engine
    trips/         trips, expenses, sections, itinerary  ← the core
    posts/         posts, likes, comments, feed
    collections/   saved trips and collections
    media/         uploads
    search/        cross-entity search
    moderation/    reports, blocks, admin
prisma/            schema.prisma, migrations, seed.ts
scripts/           generate-swagger.ts
swagger.json       committed API contract
```

Auth is global: every route requires a token unless marked `@Public()`. Public
routes still decode a token when one is present, so they can personalise the
response (`isLiked`, `isSaved`, follower-only trips).

---

## Scripts

```bash
npm run start:dev          # watch mode
npm run build              # compile
npm run lint               # eslint --fix
npm test                   # unit tests
npm run prisma:migrate     # create/apply a migration
npm run prisma:studio      # browse the data
npm run seed               # reset to demo data
npm run swagger:generate   # rewrite swagger.json
```

---

## Deploying to Render

`render.yaml` is a blueprint: push the repo, then **New → Blueprint** in the
Render dashboard. It provisions Postgres, generates the JWT secrets, runs
`prisma migrate deploy` on each build and health-checks `/health`.

Set `CORS_ORIGINS` to the deployed FE origin and `MEDIA_BASE_URL` to the API's
public URL after the first deploy.

**One caveat for launch:** `MEDIA_DRIVER=local` writes to the container disk,
which Render wipes on every deploy. Fine for FE integration, not for real users.
Swap in S3/R2 before launch — only `persist()` and `remove()` in
`media.service.ts` need to change; everything downstream works off the `Media`
row.

---

## What is built

**MVP (spec §45) — complete.** Auth and profiles, the follow graph, the full trip
wizard (destination → dates → travelers → places → expenses → stays → photos →
experience → ratings → publish), expense intelligence, canonical places with
aggregates, the social layer, collections, search, privacy and moderation.

Also included ahead of schedule, because the data model made them cheap:
day-by-day itinerary with drag-and-drop ordering, reality checks, the travel map,
seasonal filtering and blocking.

**Not built — deliberately.** "Plan Like This" trip cloning, similar-traveler
matching, notification delivery, and the whole AI layer. The spec puts these in
V2/V3, and the recommendation to build V1 without AI is a good one: the structured
data has to be right first, or the AI is just decorating guesses. The schema
already carries what they need — `Notification` is modelled, `verificationLevel`
is on every trip, and trip cloning is a read of `GET /trips/:id` plus a write of
`POST /trips`.

Search uses `ILIKE`. That is the right amount of machinery for launch volumes;
the upgrade is a `tsvector` column with a GIN index, and it changes one file.
