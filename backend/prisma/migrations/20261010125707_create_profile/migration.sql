-- CreateEnum
CREATE TYPE "ProfileRole" AS ENUM ('MEMBER', 'ADMIN');

-- CreateTable
CREATE TABLE "Profile" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "ProfileRole" NOT NULL DEFAULT 'MEMBER',
    "blockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- EnableRowLevelSecurity (hand-written; Prisma cannot express RLS)
-- Repeat for every future table.
ALTER TABLE "Profile" ENABLE ROW LEVEL SECURITY;
