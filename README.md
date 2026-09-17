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

**Stack:** NestJS 11 · TypeScript · Prisma 6 · JWT · Swagger
**Infrastructure:** Neon (Postgres + Object Storage) · Render (web service only)

Render runs the stateless API. Everything that holds state — the database and
every uploaded photo — lives in Neon, so a Render instance can be destroyed and
recreated without losing anything.

---

## Quick start

```bash
nvm use                      # Node 22.16.0 (see .nvmrc)
npm install
cp .env.example .env         # fill in Neon URLs + JWT secrets (below)

npm run prisma:migrate       # create the schema
npm run seed                 # demo users, trips, places
npm run start:dev
```

### Filling in `.env`

**1. Neon Postgres.** In the Neon console → *Connect*, copy both connection
strings. Neon exposes two endpoints for the same database and you need both:

```ini
# pooled — host contains "-pooler". Used by the app.
DATABASE_URL=postgresql://user:pass@ep-xxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
# direct — no "-pooler". Used by Prisma Migrate.
DIRECT_URL=postgresql://user:pass@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```

Prisma Migrate needs a real session, which PgBouncer cannot give it, so
migrations go through `DIRECT_URL` while the app pools through `DATABASE_URL`.
Point both at the same string only when using local Postgres.

**2. Neon Object Storage.** Create a bucket and a storage credential:

```bash
neon buckets create tripsphere-media --access-level public_read
neon credentials create --scope storage:read --scope storage:write
```

The credential is shown **once** — `token_id` is the access key id and
`s3_secret_access_key` is the secret. The endpoint is branch-scoped and looks
like `https://br-xxxx.storage.c-2.us-east-2.aws.neon.tech`.

```ini
MEDIA_DRIVER=neon
NEON_STORAGE_ENDPOINT=https://br-xxxx.storage.c-2.us-east-2.aws.neon.tech
NEON_STORAGE_REGION=us-east-2
NEON_STORAGE_BUCKET=tripsphere-media
NEON_STORAGE_ACCESS_KEY_ID=<token_id>
NEON_STORAGE_SECRET_ACCESS_KEY=<s3_secret_access_key>
```

**3. JWT secrets.** Generate each with `openssl rand -base64 48`.

The app refuses to boot if any of these are missing or wrong, and names what to
fix — it will not start and fail later on a user's first upload.

### Working offline

```bash
docker compose up -d                     # Postgres on :5434
docker compose --profile storage up -d   # + MinIO on :9000, an S3 stand-in
```

Then point `DATABASE_URL`/`DIRECT_URL` at localhost and
`NEON_STORAGE_ENDPOINT` at `http://localhost:9000`. Neon Object Storage and
MinIO are both S3-compatible, so the same driver and the same variables drive
either one.

| What | Where |
|---|---|
| API | http://localhost:3000/api/v1 |
| Swagger UI | http://localhost:3000/docs |
| OpenAPI JSON | [`swagger.json`](./swagger.json) (committed) |
| Health | http://localhost:3000/health |

**Seeded logins** — `sreyanse@example.com` … `neha@example.com`, password
`Password123`. `sreyanse` has the worked example from the spec: a ₹50,000 South
Goa trip with expenses, stays, ratings, reality checks and a 4-day itinerary.

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
    media/         uploads + storage drivers (Neon Object Storage, local)
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
npm run swagger:check      # fail if swagger.json has drifted from the code
```

---

## Architecture

```
        Render                         Neon
  ┌──────────────────┐        ┌─────────────────────┐
  │  tripsphere-api  │──SQL──▶│  Postgres (pooled)  │
  │  (stateless)     │        ├─────────────────────┤
  │                  │──S3───▶│  Object Storage     │
  └──────────────────┘        └─────────────────────┘
         ▲                              ▲
         │ JSON                         │ photo URLs
      Frontend ─────────────────────────┘
```

Render holds no state. It runs the Node process and nothing else: no database,
no disk. Photos are uploaded through the API to Neon Object Storage and then
served to browsers directly from Neon, so image traffic never touches the
Render instance.

### Storage

`MEDIA_DRIVER` selects the driver:

| Driver | Used for | Behaviour |
|---|---|---|
| `neon` | production, and normal development | Neon Object Storage over the S3 API |
| `local` | offline work only | writes to `./uploads` |

Everything outside `src/modules/media/storage/` works off the `Media` row, which
holds the key and the resolved URL — so changing provider means writing one
class, not touching trips, posts or photos.

Two details are load-bearing when talking to any non-AWS S3 implementation, and
are set in `neon-storage.driver.ts`: `forcePathStyle` (Neon addresses buckets by
path, not subdomain) and `requestChecksumCalculation: 'WHEN_REQUIRED'` (the AWS
SDK v3 otherwise sends CRC32 headers that S3-compatible stores reject).

Object keys are `<userId>/<uuid><ext>` — random, so they never collide and are
served with a one-year immutable `Cache-Control`.

**The privacy trade-off, stated plainly.** The bucket is `public_read`, and the
resolved URL is stored on the `Media` row rather than signed per request. That
is what makes a feed of 20 photo cards one database read instead of 20 signing
operations, and it lets the browser and any CDN cache the images. The cost: a
photo on a `PRIVATE` trip is protected by its unguessable URL, not by an
authorization check — anyone holding the link can open it. This is what
Instagram and every other photo feed does, and for trip photos it is the right
trade. If that is not acceptable for your launch, switch the bucket to `private`
and resolve URLs through `NeonStorageDriver.signedUrl()` at read time; the
method is already there, and the change is confined to how `MediaDto.url` is
produced.

---

## Deploying to Render

Render runs the web service only — there is no `databases:` block in
`render.yaml` and nothing on Render survives a deploy, by design.

1. **Neon** — create the project, then the bucket and credential:
   ```bash
   neon buckets create tripsphere-media --access-level public_read
   neon credentials create --scope storage:read --scope storage:write
   ```
2. **Render** — push the repo, then **New → Blueprint**. It reads `render.yaml`,
   generates the JWT secrets, runs `prisma migrate deploy` on every build and
   health-checks `/health`.
3. **Fill in the prompted variables** (everything marked `sync: false`):
   `DATABASE_URL`, `DIRECT_URL`, the four `NEON_STORAGE_*` values, and
   `CORS_ORIGINS` (your frontend origin).

Put the Render region and the Neon region in the same part of the world — the
blueprint defaults to Render `singapore`, and every request makes at least one
database round trip.

`GET /health` reports which storage driver is live, so you can confirm a deploy
picked up `MEDIA_DRIVER=neon`:

```json
{ "status": "ok", "database": "up", "storage": "neon" }
```

Two things worth knowing about the free tiers: Render free instances sleep after
inactivity, so the first request after a pause is slow, and Neon Object Storage
is in beta (AWS `us-east-2` and `eu-central-1` only) and free subject to usage
limits.

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
