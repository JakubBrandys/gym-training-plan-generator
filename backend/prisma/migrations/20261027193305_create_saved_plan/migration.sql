-- CreateTable
CREATE TABLE "SavedPlan" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "sourceJobId" UUID NOT NULL,
    "form" JSONB NOT NULL,
    "plan" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedPlan_ownerId_createdAt_idx" ON "SavedPlan"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedPlan_ownerId_sourceJobId_key" ON "SavedPlan"("ownerId", "sourceJobId");

-- AddForeignKey
ALTER TABLE "SavedPlan" ADD CONSTRAINT "SavedPlan_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EnableRowLevelSecurity (hand-written; Prisma cannot express RLS)
-- Repeat for every future table.
ALTER TABLE "SavedPlan" ENABLE ROW LEVEL SECURITY;
