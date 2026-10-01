# Admin & moderation — requirements

**Status:** spec, backend in progress
**Audience:** backend and frontend
**Last updated:** 2026-10-01

---

## 1. Why

Three things are impossible today.

**Nobody can be an admin.** `UserRole` has `USER`, `MODERATOR` and `ADMIN`, the
`RolesGuard` enforces them, and four `/admin/*` endpoints already exist — but no
endpoint, script or seed ever sets a role above `USER`. Those endpoints are
unreachable in production.

**The place catalogue cannot be repaired.** Anyone signed in can create a
canonical place, and nothing can edit or remove one afterwards. Production
already carries rows like:

```
"palelem, cola beach and butter fly beach"   category OTHER, no coordinates
"agonda beach"                               category OTHER, no coordinates
```

Three beaches in one row, a misspelling, and a lowercase duplicate of a place
that already exists. Every trip recorded against these is invisible to
`GET /trips?destinationId=`, and the rows are permanent.

**There is no operational view.** No way to see who signed up, what they
published, or what the platform contains — including the private and draft trips
that never appear in any public list.

## 2. Roles

Three roles, already in the schema. `MODERATOR` handles content; `ADMIN` handles
everything including people and the catalogue.

| Capability | USER | MODERATOR | ADMIN |
|---|:--:|:--:|:--:|
| Own trips, posts, profile | ✓ | ✓ | ✓ |
| Report content, block users | ✓ | ✓ | ✓ |
| Moderation queue, resolve reports | | ✓ | ✓ |
| Take content down | | ✓ | ✓ |
| Browse all users | | ✓ | ✓ |
| Browse all trips incl. private & drafts | | ✓ | ✓ |
| Browse & edit the place catalogue | | ✓ | ✓ |
| Delete or merge places | | | ✓ |
| Suspend / reinstate users | | | ✓ |
| Change someone's role | | | ✓ |
| Platform statistics | | | ✓ |

**Rule of thumb:** a moderator can hide bad content; only an admin can change
who someone *is* or destroy a catalogue row.

## 3. Bootstrapping the first admin

Deliberately **not** an endpoint. An API that grants admin is an attack surface
whose only purpose is a one-time setup step, so the first admin comes from
someone with database access:

```bash
npm run admin:grant -- someone@example.com            # promote to ADMIN
npm run admin:grant -- someone@example.com MODERATOR  # or moderator
```

After that, admins promote others through the API.

## 4. Backend

### 4.1 Guardrails that apply to every admin route

- `@Roles(...)` on each handler. The global `RolesGuard` already enforces it.
- Admin routes never widen a normal endpoint. `GET /trips` stays public and
  visibility-filtered; admins see everything through `GET /admin/trips`.
- **No self-targeting.** An admin cannot change their own role or suspend
  themselves — the only way to lock every admin out of the system.
- **Destructive actions are recorded.** Role changes, suspensions, takedowns,
  place deletions and merges write an `AdminAction` row: who, what, which
  target, when, and a free-text reason.

### 4.2 Statistics

```
GET /admin/stats                                     ADMIN
```

Users (total, active, suspended, new in 7/30 days), trips (total, published,
draft), posts, places (total, missing coordinates, unverified, orphaned),
pending reports.

### 4.3 Users

```
GET   /admin/users?q=&role=&status=&page=&limit=     MODERATOR, ADMIN
GET   /admin/users/:id                               MODERATOR, ADMIN
PATCH /admin/users/:id/role      { role, reason? }   ADMIN
PATCH /admin/users/:userId/status { status }         ADMIN   (exists)
```

List returns email, role, status, counts and last login — `q` matches username,
name or email. Changing a role revokes that user's refresh tokens, so the new
permissions apply on their next request rather than whenever their token
happens to expire.

### 4.4 Trips

```
GET /admin/trips?q=&status=&visibility=&userId=&page=&limit=   MODERATOR, ADMIN
```

Every trip, including `PRIVATE` ones and unpublished drafts, which no public
endpoint will ever return. Takedown already exists:
`DELETE /admin/content/TRIP/:id`.

### 4.5 Places — the catalogue repair tools

```
GET    /admin/places?q=&missingCoordinates=&unverified=&orphaned=&page=&limit=
                                                     MODERATOR, ADMIN
PATCH  /admin/places/:id                             MODERATOR, ADMIN
DELETE /admin/places/:id                             ADMIN
POST   /admin/places/:id/merge   { targetId }        ADMIN
```

`PATCH` fixes what users typed: name, category, state, region, city,
coordinates, `isDestination`, `isVerified`.

`DELETE` refuses while anything still points at the place, answering `409` with
the counts, so a delete can never orphan a trip. Merge first, or detach.

`POST /admin/places/:id/merge` is the one that fixes the rows in §1. Everything
referencing the source place — trip destinations, visited places, stays, photos,
ratings, reality checks, activities, posts and child places — is repointed at
`targetId`, then the source row is deleted. In one transaction. Duplicate links
that would collide (the same trip already visiting both places) collapse instead
of failing.

### 4.6 Data model

One new table. No changes to existing ones.

```prisma
model AdminAction {
  id         String   @id @default(uuid()) @db.Uuid
  actorId    String   @db.Uuid          // the admin
  action     String                     // USER_ROLE_CHANGED, PLACE_MERGED, …
  targetType String                     // USER | TRIP | POST | COMMENT | PLACE
  targetId   String
  reason     String?
  metadata   Json?                      // before/after for a role change, etc.
  createdAt  DateTime @default(now())
}
```

## 5. Frontend

An admin area behind its own route, reachable only when the signed-in user's
`role` is not `USER`. `role` is already on `GET /auth/me`, so no new call is
needed to decide.

| Screen | Contents |
|---|---|
| **Dashboard** | The `/admin/stats` counters. Pending reports and places missing coordinates are the two numbers worth making clickable |
| **Users** | Search and filter by role/status. Row actions: suspend, reinstate, change role. Show email, join date, trip and post counts |
| **Trips** | Search, filter by status and visibility. A `PRIVATE`/`DRAFT` badge matters here — these are trips the author never published, so treat them accordingly |
| **Places** | The repair screen. Filters for *missing coordinates*, *unverified* and *orphaned*. Row actions: edit, merge into another place, delete |
| **Reports** | The existing moderation queue: resolve or dismiss, with a takedown action |

Notes for the client:

- Hide admin navigation entirely for `USER`; do not merely disable it.
- A `403` from any `/admin/*` route means the role changed underneath the
  session — send them back to the app rather than showing an error page.
- Merge needs a place picker for the target, and should state plainly what it
  does: *"Everything pointing at A will point at B, and A will be deleted."*
- Deleting a place can answer `409` with reference counts. Show them and offer
  merge as the way out.

## 6. Out of scope

- Impersonating a user
- Editing someone else's trip content field by field — takedown is the lever
- Bulk user actions
- Analytics beyond the counters in §4.2 (DAU/MAU needs event tracking that does
  not exist yet)

## 7. Verification

1. `npm run admin:grant -- <email>` promotes, and the next login returns `ADMIN`.
2. A `USER` gets `403` on every `/admin/*` route.
3. An admin cannot demote or suspend themselves.
4. `GET /admin/trips` returns a private trip and a draft that `GET /trips` does not.
5. `DELETE` on a place a trip references answers `409` with counts, not a broken trip.
6. Merging the three-beaches row into Palolem moves its references and deletes it,
   leaving no trip pointing at a missing place.
7. A role change writes an `AdminAction` row and revokes that user's sessions.
