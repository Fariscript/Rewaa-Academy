-- AlterEnum
ALTER TYPE "AttemptStatus" ADD VALUE 'PENDING_MANUAL_GRADE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuestionType" ADD VALUE 'SCENARIO';
ALTER TYPE "QuestionType" ADD VALUE 'FREE_TEXT';
ALTER TYPE "QuestionType" ADD VALUE 'MOCK_CALL';

-- AlterTable
ALTER TABLE "attempt_answers" ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "gradedAt" TIMESTAMP(3),
ADD COLUMN     "gradedById" TEXT,
ADD COLUMN     "textAnswer" TEXT,
ALTER COLUMN "options" DROP NOT NULL,
ALTER COLUMN "correctOption" DROP NOT NULL;

-- AlterTable
ALTER TABLE "question_revisions" ALTER COLUMN "options" DROP NOT NULL,
ALTER COLUMN "correctOption" DROP NOT NULL;

-- AlterTable
ALTER TABLE "questions" ALTER COLUMN "options" DROP NOT NULL,
ALTER COLUMN "correctOption" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
