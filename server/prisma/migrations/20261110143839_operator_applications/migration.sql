-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateTable
CREATE TABLE "OperatorApplication" (
    "id" UUID NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "fleetSize" INTEGER,
    "message" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "operatorId" UUID,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "declineReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OperatorApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperatorApplication_status_createdAt_idx" ON "OperatorApplication"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OperatorApplication_email_idx" ON "OperatorApplication"("email");

-- AddForeignKey
ALTER TABLE "OperatorApplication" ADD CONSTRAINT "OperatorApplication_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
