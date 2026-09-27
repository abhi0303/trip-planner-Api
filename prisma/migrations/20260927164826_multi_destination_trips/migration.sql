-- CreateTable
CREATE TABLE "trip_destinations" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_destinations_placeId_idx" ON "trip_destinations"("placeId");

-- CreateIndex
CREATE INDEX "trip_destinations_tripId_sequence_idx" ON "trip_destinations"("tripId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "trip_destinations_tripId_placeId_key" ON "trip_destinations"("tripId", "placeId");

-- AddForeignKey
ALTER TABLE "trip_destinations" ADD CONSTRAINT "trip_destinations_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_destinations" ADD CONSTRAINT "trip_destinations_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every trip that already has a single destinationId becomes a
-- one-row destination set. Without this, changing GET /trips?destinationId=
-- into a join would make every existing trip unfindable by destination.
INSERT INTO "trip_destinations" ("id", "tripId", "placeId", "sequence", "createdAt")
SELECT gen_random_uuid(), t."id", t."destinationId", 0, now()
FROM "trips" t
WHERE t."destinationId" IS NOT NULL
ON CONFLICT ("tripId", "placeId") DO NOTHING;
