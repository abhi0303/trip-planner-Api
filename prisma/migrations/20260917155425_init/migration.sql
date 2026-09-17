-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'GOOGLE', 'APPLE');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'FOLLOWERS', 'FRIENDS', 'PRIVATE');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExpenseMode" AS ENUM ('TOTAL', 'DETAILED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('TRANSPORTATION', 'STAY', 'FOOD', 'ACTIVITIES', 'SHOPPING', 'OTHER');

-- CreateEnum
CREATE TYPE "PlaceCategory" AS ENUM ('BEACH', 'MOUNTAIN', 'CITY', 'TOWN', 'VILLAGE', 'LAKE', 'WATERFALL', 'FOREST', 'DESERT', 'ISLAND', 'TEMPLE', 'CHURCH', 'MOSQUE', 'MONUMENT', 'MUSEUM', 'FORT', 'PARK', 'WILDLIFE', 'VIEWPOINT', 'TREK', 'RESTAURANT', 'CAFE', 'BAR', 'HOTEL', 'AIRPORT', 'STATION', 'MARKET', 'ACTIVITY', 'OTHER');

-- CreateEnum
CREATE TYPE "TravelStyle" AS ENUM ('BEACH', 'ADVENTURE', 'COUPLE', 'FAMILY', 'BACKPACKING', 'RELAXATION', 'CULTURE', 'FOOD', 'NIGHTLIFE', 'PHOTOGRAPHY', 'ROAD_TRIP', 'BUDGET', 'LUXURY', 'SOLO', 'FRIENDS', 'WORKATION', 'PILGRIMAGE', 'WILDLIFE');

-- CreateEnum
CREATE TYPE "RatingType" AS ENUM ('TRIP', 'PLACE', 'HOTEL', 'RESTAURANT', 'ACTIVITY');

-- CreateEnum
CREATE TYPE "RatingCriteria" AS ENUM ('OVERALL', 'SCENERY', 'CROWD', 'CLEANLINESS', 'ACCESSIBILITY', 'SAFETY', 'VALUE', 'PHOTOGRAPHY', 'FOOD', 'ACTIVITIES', 'FAMILY_FRIENDLY', 'COUPLE_FRIENDLY', 'SOLO_FRIENDLY', 'SERVICE', 'LOCATION', 'COMFORT');

-- CreateEnum
CREATE TYPE "Weather" AS ENUM ('SUNNY', 'CLOUDY', 'RAINY', 'SNOWY', 'WINDY', 'FOGGY', 'MIXED');

-- CreateEnum
CREATE TYPE "CrowdLevel" AS ENUM ('VERY_LOW', 'LOW', 'MODERATE', 'HIGH', 'VERY_HIGH');

-- CreateEnum
CREATE TYPE "Season" AS ENUM ('WINTER', 'SPRING', 'SUMMER', 'MONSOON', 'AUTUMN');

-- CreateEnum
CREATE TYPE "RealityCheckSeverity" AS ENUM ('INFO', 'WARNING', 'DANGER');

-- CreateEnum
CREATE TYPE "VerificationLevel" AS ENUM ('UNVERIFIED', 'PHOTO_EVIDENCE', 'BOOKING_EVIDENCE', 'LOCATION_EVIDENCE', 'MANUALLY_VERIFIED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LIKE', 'COMMENT', 'FOLLOW', 'SAVE', 'MENTION', 'TRIP_TRENDING', 'NEW_PLACE_EXPERIENCE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('USER', 'TRIP', 'POST', 'COMMENT', 'PLACE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'REVIEWING', 'ACTIONED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'OFFENSIVE', 'MISLEADING', 'FAKE_EXPERIENCE', 'HARASSMENT', 'NUDITY', 'COPYRIGHT', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('TRAVEL', 'CHECK_IN', 'CHECK_OUT', 'SIGHTSEEING', 'FOOD', 'ACTIVITY', 'REST', 'SHOPPING', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "provider" "AuthProvider" NOT NULL DEFAULT 'EMAIL',
    "googleId" TEXT,
    "appleId" TEXT,
    "profileImage" TEXT,
    "coverImage" TEXT,
    "bio" TEXT,
    "homeCountry" TEXT,
    "homeCity" TEXT,
    "websiteUrl" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "followerCount" INTEGER NOT NULL DEFAULT 0,
    "followingCount" INTEGER NOT NULL DEFAULT 0,
    "tripCount" INTEGER NOT NULL DEFAULT 0,
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follows" (
    "followerId" UUID NOT NULL,
    "followingId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("followerId","followingId")
);

-- CreateTable
CREATE TABLE "blocks" (
    "blockerId" UUID NOT NULL,
    "blockedId" UUID NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateTable
CREATE TABLE "places" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "country" TEXT NOT NULL,
    "state" TEXT,
    "region" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "category" "PlaceCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "coverImage" TEXT,
    "metadata" JSONB,
    "externalSource" TEXT,
    "externalId" TEXT,
    "parentId" UUID,
    "isDestination" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "experienceCount" INTEGER NOT NULL DEFAULT 0,
    "travelerCount" INTEGER NOT NULL DEFAULT 0,
    "avgRating" DOUBLE PRECISION,
    "avgVisitMinutes" INTEGER,
    "avgSpendPerPerson" DECIMAL(12,2),
    "aggregatesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "country" TEXT NOT NULL,
    "state" TEXT,
    "destination" TEXT NOT NULL,
    "destinationId" UUID,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "nights" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    "startMonth" INTEGER NOT NULL,
    "startYear" INTEGER NOT NULL,
    "travelerCount" INTEGER NOT NULL DEFAULT 1,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "infants" INTEGER NOT NULL DEFAULT 0,
    "expenseMode" "ExpenseMode" NOT NULL DEFAULT 'TOTAL',
    "totalExpense" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "experience" TEXT,
    "enjoyedMost" TEXT,
    "surprisedBy" TEXT,
    "wentWrong" TEXT,
    "wouldDoDifferently" TEXT,
    "adviceForTravelers" TEXT,
    "travelStyles" "TravelStyle"[],
    "weather" "Weather",
    "crowdLevel" "CrowdLevel",
    "season" "Season",
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "expenseVisibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "status" "TripStatus" NOT NULL DEFAULT 'DRAFT',
    "verificationLevel" "VerificationLevel" NOT NULL DEFAULT 'UNVERIFIED',
    "coverMediaId" UUID,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "saveCount" INTEGER NOT NULL DEFAULT 0,
    "placeCount" INTEGER NOT NULL DEFAULT 0,
    "photoCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_places" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "visitDate" DATE,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_expenses" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "subcategory" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "expenseDate" DATE,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_stays" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "hotelName" TEXT NOT NULL,
    "placeId" UUID,
    "location" TEXT,
    "checkIn" DATE,
    "checkOut" DATE,
    "nights" INTEGER,
    "amount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "roomType" TEXT,
    "rating" DOUBLE PRECISION,
    "bookingPlatform" TEXT,
    "websiteUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_stays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "MediaType" NOT NULL DEFAULT 'IMAGE',
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "blurhash" TEXT,
    "capturedAt" TIMESTAMP(3),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_photos" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "placeId" UUID,
    "caption" TEXT,
    "takenAt" TIMESTAMP(3),
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_ratings" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "ratingType" "RatingType" NOT NULL,
    "placeId" UUID,
    "stayId" UUID,
    "criteria" "RatingCriteria" NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reality_checks" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "placeId" UUID,
    "severity" "RealityCheckSeverity" NOT NULL DEFAULT 'WARNING',
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reality_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_days" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "date" DATE,
    "title" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_activities" (
    "id" UUID NOT NULL,
    "dayId" UUID NOT NULL,
    "kind" "ActivityKind" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "placeId" UUID,
    "startTime" TEXT,
    "endTime" TEXT,
    "notes" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tripId" UUID,
    "placeId" UUID,
    "caption" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "saveCount" INTEGER NOT NULL DEFAULT 0,
    "shareCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_media" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "post_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "likes" (
    "postId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "likes_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "parentId" UUID,
    "body" TEXT NOT NULL,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saves" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tripId" UUID,
    "postId" UUID,
    "collectionId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "actorId" UUID,
    "type" "NotificationType" NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "message" TEXT,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedById" UUID,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_appleId_key" ON "users"("appleId");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_revokedAt_idx" ON "refresh_tokens"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "follows_followingId_createdAt_idx" ON "follows"("followingId", "createdAt");

-- CreateIndex
CREATE INDEX "follows_followerId_createdAt_idx" ON "follows"("followerId", "createdAt");

-- CreateIndex
CREATE INDEX "blocks_blockedId_idx" ON "blocks"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "places_slug_key" ON "places"("slug");

-- CreateIndex
CREATE INDEX "places_countryCode_state_idx" ON "places"("countryCode", "state");

-- CreateIndex
CREATE INDEX "places_category_idx" ON "places"("category");

-- CreateIndex
CREATE INDEX "places_parentId_idx" ON "places"("parentId");

-- CreateIndex
CREATE INDEX "places_name_idx" ON "places"("name");

-- CreateIndex
CREATE INDEX "places_experienceCount_idx" ON "places"("experienceCount");

-- CreateIndex
CREATE UNIQUE INDEX "trips_slug_key" ON "trips"("slug");

-- CreateIndex
CREATE INDEX "trips_userId_status_startDate_idx" ON "trips"("userId", "status", "startDate");

-- CreateIndex
CREATE INDEX "trips_countryCode_state_status_idx" ON "trips"("countryCode", "state", "status");

-- CreateIndex
CREATE INDEX "trips_destinationId_status_idx" ON "trips"("destinationId", "status");

-- CreateIndex
CREATE INDEX "trips_status_publishedAt_idx" ON "trips"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "trips_totalExpense_idx" ON "trips"("totalExpense");

-- CreateIndex
CREATE INDEX "trips_startDate_idx" ON "trips"("startDate");

-- CreateIndex
CREATE INDEX "trips_startMonth_status_idx" ON "trips"("startMonth", "status");

-- CreateIndex
CREATE INDEX "trip_places_placeId_idx" ON "trip_places"("placeId");

-- CreateIndex
CREATE INDEX "trip_places_tripId_sequence_idx" ON "trip_places"("tripId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "trip_places_tripId_placeId_key" ON "trip_places"("tripId", "placeId");

-- CreateIndex
CREATE INDEX "trip_expenses_tripId_category_idx" ON "trip_expenses"("tripId", "category");

-- CreateIndex
CREATE INDEX "trip_stays_tripId_idx" ON "trip_stays"("tripId");

-- CreateIndex
CREATE INDEX "trip_stays_placeId_idx" ON "trip_stays"("placeId");

-- CreateIndex
CREATE INDEX "media_userId_createdAt_idx" ON "media"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "trip_photos_placeId_idx" ON "trip_photos"("placeId");

-- CreateIndex
CREATE INDEX "trip_photos_tripId_sequence_idx" ON "trip_photos"("tripId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "trip_photos_tripId_mediaId_key" ON "trip_photos"("tripId", "mediaId");

-- CreateIndex
CREATE INDEX "trip_ratings_tripId_ratingType_placeId_stayId_idx" ON "trip_ratings"("tripId", "ratingType", "placeId", "stayId");

-- CreateIndex
CREATE INDEX "trip_ratings_placeId_criteria_idx" ON "trip_ratings"("placeId", "criteria");

-- CreateIndex
CREATE INDEX "reality_checks_tripId_idx" ON "reality_checks"("tripId");

-- CreateIndex
CREATE INDEX "reality_checks_placeId_idx" ON "reality_checks"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "trip_days_tripId_dayNumber_key" ON "trip_days"("tripId", "dayNumber");

-- CreateIndex
CREATE INDEX "trip_activities_dayId_sequence_idx" ON "trip_activities"("dayId", "sequence");

-- CreateIndex
CREATE INDEX "posts_userId_createdAt_idx" ON "posts"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "posts_visibility_createdAt_idx" ON "posts"("visibility", "createdAt");

-- CreateIndex
CREATE INDEX "posts_tripId_idx" ON "posts"("tripId");

-- CreateIndex
CREATE INDEX "posts_placeId_createdAt_idx" ON "posts"("placeId", "createdAt");

-- CreateIndex
CREATE INDEX "post_media_postId_sequence_idx" ON "post_media"("postId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "post_media_postId_mediaId_key" ON "post_media"("postId", "mediaId");

-- CreateIndex
CREATE INDEX "likes_userId_createdAt_idx" ON "likes"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "comments_postId_createdAt_idx" ON "comments"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "comments_parentId_createdAt_idx" ON "comments"("parentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "collections_userId_name_key" ON "collections"("userId", "name");

-- CreateIndex
CREATE INDEX "saves_userId_createdAt_idx" ON "saves"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "saves_collectionId_createdAt_idx" ON "saves"("collectionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "saves_userId_tripId_key" ON "saves"("userId", "tripId");

-- CreateIndex
CREATE UNIQUE INDEX "saves_userId_postId_key" ON "saves"("userId", "postId");

-- CreateIndex
CREATE INDEX "notifications_recipientId_readAt_createdAt_idx" ON "notifications"("recipientId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "reports_reporterId_targetType_targetId_key" ON "reports"("reporterId", "targetType", "targetId");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_places" ADD CONSTRAINT "trip_places_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_places" ADD CONSTRAINT "trip_places_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stays" ADD CONSTRAINT "trip_stays_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stays" ADD CONSTRAINT "trip_stays_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_photos" ADD CONSTRAINT "trip_photos_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_photos" ADD CONSTRAINT "trip_photos_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_photos" ADD CONSTRAINT "trip_photos_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_ratings" ADD CONSTRAINT "trip_ratings_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_ratings" ADD CONSTRAINT "trip_ratings_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reality_checks" ADD CONSTRAINT "reality_checks_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reality_checks" ADD CONSTRAINT "reality_checks_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_days" ADD CONSTRAINT "trip_days_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_activities" ADD CONSTRAINT "trip_activities_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "trip_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_activities" ADD CONSTRAINT "trip_activities_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saves" ADD CONSTRAINT "saves_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saves" ADD CONSTRAINT "saves_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saves" ADD CONSTRAINT "saves_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saves" ADD CONSTRAINT "saves_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
