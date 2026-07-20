-- CreateTable
CREATE TABLE "attempt_cap_overrides" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "extraAttempts" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_cap_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attempt_cap_overrides_userId_quizId_idx" ON "attempt_cap_overrides"("userId", "quizId");

-- AddForeignKey
ALTER TABLE "attempt_cap_overrides" ADD CONSTRAINT "attempt_cap_overrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_cap_overrides" ADD CONSTRAINT "attempt_cap_overrides_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_cap_overrides" ADD CONSTRAINT "attempt_cap_overrides_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
