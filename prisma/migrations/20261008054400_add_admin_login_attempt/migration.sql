-- CreateTable
CREATE TABLE "admin_login_attempt" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_login_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_login_attempt_created_at_idx" ON "admin_login_attempt"("created_at");

-- CreateIndex
CREATE INDEX "admin_login_attempt_ip_created_at_idx" ON "admin_login_attempt"("ip", "created_at");
