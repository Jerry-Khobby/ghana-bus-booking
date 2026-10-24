-- CreateEnum
CREATE TYPE "OperatorStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('AGENT', 'OPERATOR_ADMIN', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "BusType" AS ENUM ('AC_COACH', 'STANDARD', 'MINIBUS');

-- CreateEnum
CREATE TYPE "BusStatus" AS ENUM ('ACTIVE', 'IN_WORKSHOP', 'RETIRED');

-- CreateEnum
CREATE TYPE "CellType" AS ENUM ('SEAT', 'AISLE', 'DRIVER', 'DOOR', 'EMPTY');

-- CreateEnum
CREATE TYPE "DepartureMode" AS ENUM ('FIXED_TIME', 'WHEN_FULL');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('SCHEDULED', 'LOADING', 'FULL', 'DEPARTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SeatStatus" AS ENUM ('AVAILABLE', 'HELD', 'SOLD', 'BLOCKED');

-- CreateEnum
CREATE TYPE "BookingChannel" AS ENUM ('ONLINE', 'WALK_IN');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('HELD', 'PENDING_PAYMENT', 'CONFIRMED', 'BOARDED', 'NO_SHOW', 'EXPIRED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MOMO', 'CARD', 'CASH');

-- CreateEnum
CREATE TYPE "MomoNetwork" AS ENUM ('MTN', 'TELECEL', 'AIRTELTIGO');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('PAYSTACK', 'FAKE', 'CASH');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ScanResult" AS ENUM ('VALID', 'BOARDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ScanRejectReason" AS ENUM ('BAD_SIGNATURE', 'NOT_FOUND', 'WRONG_TRIP', 'NOT_PAID', 'ALREADY_BOARDED', 'TRIP_DEPARTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('INVITE', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('PASSENGER', 'STAFF');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Operator" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "serviceFeePesewas" INTEGER NOT NULL DEFAULT 100,
    "holdMinutes" INTEGER NOT NULL DEFAULT 5,
    "status" "OperatorStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Station" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bay" (
    "id" UUID NOT NULL,
    "operatorId" UUID NOT NULL,
    "stationId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Bay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" UUID NOT NULL,
    "operatorId" UUID NOT NULL,
    "originStationId" UUID NOT NULL,
    "destinationStationId" UUID NOT NULL,
    "baseFarePesewas" INTEGER NOT NULL,
    "durationMinutes" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatLayout" (
    "id" UUID NOT NULL,
    "operatorId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "rows" INTEGER NOT NULL,
    "cols" INTEGER NOT NULL,
    "cells" JSONB NOT NULL,
    "seatCount" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SeatLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bus" (
    "id" UUID NOT NULL,
    "operatorId" UUID NOT NULL,
    "plate" TEXT NOT NULL,
    "type" "BusType" NOT NULL,
    "layoutId" UUID NOT NULL,
    "status" "BusStatus" NOT NULL DEFAULT 'ACTIVE',
    "backInServiceOn" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Bus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" UUID NOT NULL,
    "operatorId" UUID NOT NULL,
    "routeId" UUID NOT NULL,
    "busId" UUID NOT NULL,
    "bayId" UUID NOT NULL,
    "mode" "DepartureMode" NOT NULL,
    "departureAt" TIMESTAMPTZ(3),
    "loadingStartsAt" TIMESTAMPTZ(3),
    "leaveBy" TIMESTAMPTZ(3),
    "farePesewas" INTEGER NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'SCHEDULED',
    "onlineBookingOpen" BOOLEAN NOT NULL DEFAULT true,
    "seatsTotal" INTEGER NOT NULL,
    "seatsSold" INTEGER NOT NULL DEFAULT 0,
    "layoutSnapshot" JSONB NOT NULL,
    "departedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripSeat" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "status" "SeatStatus" NOT NULL DEFAULT 'AVAILABLE',
    "holdExpiresAt" TIMESTAMPTZ(3),
    "bookingId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TripSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Passenger" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Passenger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffUser" (
    "id" UUID NOT NULL,
    "operatorId" UUID,
    "role" "StaffRole" NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "StaffStatus" NOT NULL DEFAULT 'INVITED',
    "stationId" UUID,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastActiveAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentBay" (
    "staffUserId" UUID NOT NULL,
    "bayId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentBay_pkey" PRIMARY KEY ("staffUserId","bayId")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMPTZ(3),
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "subjectType" "SubjectType" NOT NULL,
    "subjectId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffToken" (
    "id" UUID NOT NULL,
    "staffUserId" UUID NOT NULL,
    "type" "TokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StaffToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "operatorId" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "tripSeatId" UUID NOT NULL,
    "seatLabel" TEXT NOT NULL,
    "passengerId" UUID,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "passengerName" TEXT,
    "channel" "BookingChannel" NOT NULL,
    "soldById" UUID,
    "status" "BookingStatus" NOT NULL DEFAULT 'HELD',
    "farePesewas" INTEGER NOT NULL,
    "feePesewas" INTEGER NOT NULL,
    "totalPesewas" INTEGER NOT NULL,
    "holdExpiresAt" TIMESTAMPTZ(3),
    "holdTokenHash" TEXT,
    "confirmedAt" TIMESTAMPTZ(3),
    "boardedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "boardedById" UUID,
    "qrNonce" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "network" "MomoNetwork",
    "payerPhone" TEXT,
    "amountPesewas" INTEGER NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerRef" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "providerPayload" JSONB,
    "initiatedById" UUID,
    "paidAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashEntry" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "operatorId" UUID NOT NULL,
    "amountPesewas" INTEGER NOT NULL,
    "settledAt" TIMESTAMPTZ(3),
    "settledById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CashEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanLog" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "bookingId" UUID,
    "result" "ScanResult" NOT NULL,
    "reason" "ScanRejectReason",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ScanLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" UUID NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "to" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "bookingId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMPTZ(3),
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "operatorId" UUID,
    "actorType" TEXT NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Operator_slug_key" ON "Operator"("slug");

-- CreateIndex
CREATE INDEX "Station_city_idx" ON "Station"("city");

-- CreateIndex
CREATE UNIQUE INDEX "Station_city_name_key" ON "Station"("city", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Bay_operatorId_stationId_number_key" ON "Bay"("operatorId", "stationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Route_operatorId_originStationId_destinationStationId_key" ON "Route"("operatorId", "originStationId", "destinationStationId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatLayout_operatorId_name_version_key" ON "SeatLayout"("operatorId", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Bus_plate_key" ON "Bus"("plate");

-- CreateIndex
CREATE INDEX "Trip_routeId_departureAt_idx" ON "Trip"("routeId", "departureAt");

-- CreateIndex
CREATE INDEX "Trip_bayId_status_idx" ON "Trip"("bayId", "status");

-- CreateIndex
CREATE INDEX "Trip_operatorId_status_departureAt_idx" ON "Trip"("operatorId", "status", "departureAt");

-- CreateIndex
CREATE UNIQUE INDEX "TripSeat_bookingId_key" ON "TripSeat"("bookingId");

-- CreateIndex
CREATE INDEX "TripSeat_tripId_status_idx" ON "TripSeat"("tripId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TripSeat_tripId_label_key" ON "TripSeat"("tripId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "Passenger_email_key" ON "Passenger"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");

-- CreateIndex
CREATE INDEX "OtpCode_email_createdAt_idx" ON "OtpCode"("email", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_subjectType_subjectId_idx" ON "RefreshToken"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffToken_tokenHash_key" ON "StaffToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_code_key" ON "Booking"("code");

-- CreateIndex
CREATE INDEX "Booking_passengerId_createdAt_idx" ON "Booking"("passengerId", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_contactEmail_idx" ON "Booking"("contactEmail");

-- CreateIndex
CREATE INDEX "Booking_tripId_status_idx" ON "Booking"("tripId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerRef_key" ON "Payment"("providerRef");

-- CreateIndex
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashEntry_bookingId_key" ON "CashEntry"("bookingId");

-- CreateIndex
CREATE INDEX "CashEntry_operatorId_agentId_settledAt_idx" ON "CashEntry"("operatorId", "agentId", "settledAt");

-- CreateIndex
CREATE INDEX "ScanLog_tripId_createdAt_idx" ON "ScanLog"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundMessage_status_createdAt_idx" ON "OutboundMessage"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_eventId_key" ON "WebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_operatorId_createdAt_idx" ON "AuditLog"("operatorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Bay" ADD CONSTRAINT "Bay_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bay" ADD CONSTRAINT "Bay_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_originStationId_fkey" FOREIGN KEY ("originStationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_destinationStationId_fkey" FOREIGN KEY ("destinationStationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatLayout" ADD CONSTRAINT "SeatLayout_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bus" ADD CONSTRAINT "Bus_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bus" ADD CONSTRAINT "Bus_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "SeatLayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_bayId_fkey" FOREIGN KEY ("bayId") REFERENCES "Bay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripSeat" ADD CONSTRAINT "TripSeat_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripSeat" ADD CONSTRAINT "TripSeat_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffUser" ADD CONSTRAINT "StaffUser_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffUser" ADD CONSTRAINT "StaffUser_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentBay" ADD CONSTRAINT "AgentBay_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentBay" ADD CONSTRAINT "AgentBay_bayId_fkey" FOREIGN KEY ("bayId") REFERENCES "Bay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffToken" ADD CONSTRAINT "StaffToken_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tripSeatId_fkey" FOREIGN KEY ("tripSeatId") REFERENCES "TripSeat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "Passenger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_soldById_fkey" FOREIGN KEY ("soldById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_boardedById_fkey" FOREIGN KEY ("boardedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanLog" ADD CONSTRAINT "ScanLog_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanLog" ADD CONSTRAINT "ScanLog_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanLog" ADD CONSTRAINT "ScanLog_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Not expressible in schema.prisma: a route can't start and end at the same station
ALTER TABLE "Route" ADD CONSTRAINT "Route_origin_ne_destination" CHECK ("originStationId" <> "destinationStationId");
