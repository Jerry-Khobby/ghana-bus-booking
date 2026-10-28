-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "groupId" UUID,
ADD COLUMN     "refundRequestedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "Booking_groupId_idx" ON "Booking"("groupId");

-- Refund requests were recorded on the payment; they now live on each booking
UPDATE "Booking" b
SET "refundRequestedAt" = (p."providerPayload"->>'refundRequestedAt')::timestamptz
FROM "Payment" p
WHERE p."bookingId" = b."id"
  AND p."providerPayload" ? 'refundRequestedAt';
