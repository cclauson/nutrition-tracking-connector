-- CreateEnum
CREATE TYPE "Resolution" AS ENUM ('daily', 'timestamped');

-- CreateEnum
CREATE TYPE "MetricType" AS ENUM ('numeric', 'checkin');

-- CreateTable
CREATE TABLE "Metric" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "resolution" "Resolution" NOT NULL,
    "type" "MetricType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricEntry" (
    "id" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "date" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetricEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Metric_userId_idx" ON "Metric"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Metric_userId_name_key" ON "Metric"("userId", "name");

-- CreateIndex
CREATE INDEX "MetricEntry_metricId_date_idx" ON "MetricEntry"("metricId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MetricEntry_metricId_date_key" ON "MetricEntry"("metricId", "date");

-- AddForeignKey
ALTER TABLE "MetricEntry" ADD CONSTRAINT "MetricEntry_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "Metric"("id") ON DELETE CASCADE ON UPDATE CASCADE;
