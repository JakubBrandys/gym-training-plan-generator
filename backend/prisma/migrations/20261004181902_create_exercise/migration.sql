-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ExerciseLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'EXPERT');

-- CreateTable
CREATE TABLE "Exercise" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "primaryMuscles" TEXT[],
    "equipment" TEXT NOT NULL,
    "level" "ExerciseLevel" NOT NULL,
    "category" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("slug")
);

-- EnableRowLevelSecurity (hand-written; Prisma cannot express RLS)
-- Repeat for every future table.
ALTER TABLE "Exercise" ENABLE ROW LEVEL SECURITY;
