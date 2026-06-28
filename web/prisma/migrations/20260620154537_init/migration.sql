-- CreateEnum
CREATE TYPE "CollegeType" AS ENUM ('AIIMS', 'JIPMER', 'ESIC', 'CENTRAL', 'GOVT', 'PRIVATE', 'DEEMED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FeeBand" AS ENUM ('LOW', 'MID', 'HIGH', 'VERY_HIGH', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('M', 'F', 'O');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('PENDING_REVIEW', 'PUBLISHED', 'REJECTED');

-- CreateTable
CREATE TABLE "CounsellingAuthority" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT,
    "urlCurrent" TEXT,
    "urlArchive" TEXT,
    "stateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CounsellingAuthority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "State" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "State_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "College" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" "CollegeType" NOT NULL DEFAULT 'UNKNOWN',
    "city" TEXT,
    "stateId" TEXT,
    "feeBandDefault" "FeeBand" NOT NULL DEFAULT 'UNKNOWN',
    "isMinority" BOOLEAN NOT NULL DEFAULT false,
    "isDeemed" BOOLEAN NOT NULL DEFAULT false,
    "isCentral" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "College_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationYrs" INTEGER NOT NULL DEFAULT 5,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryMap" (
    "id" TEXT NOT NULL,
    "rawCode" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "state" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotaMap" (
    "id" TEXT NOT NULL,
    "rawCode" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotaMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allotment" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "round" TEXT NOT NULL,
    "authorityId" TEXT,
    "authorityCode" TEXT NOT NULL,
    "state" TEXT,
    "collegeId" TEXT,
    "courseId" TEXT,
    "rawInstituteName" TEXT,
    "rawCourse" TEXT,
    "rawSeatCategory" TEXT,
    "rawCandidateCategory" TEXT,
    "rawQuota" TEXT,
    "normalizedCategory" TEXT,
    "normalizedQuota" TEXT,
    "candidateRank" INTEGER,
    "neetMarks" INTEGER,
    "gender" "Gender",
    "pwd" BOOLEAN,
    "collegeType" "CollegeType" NOT NULL DEFAULT 'UNKNOWN',
    "feeBand" "FeeBand" NOT NULL DEFAULT 'UNKNOWN',
    "sourceUrl" TEXT,
    "sourceFile" TEXT,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawRowHash" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Allotment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatMatrix" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "round" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "quota" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "sourceFile" TEXT,

    CONSTRAINT "SeatMatrix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CutoffSummary" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "round" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quota" TEXT NOT NULL,
    "openingRank" INTEGER,
    "closingRank" INTEGER NOT NULL,
    "allotmentCount" INTEGER NOT NULL,
    "sourceFiles" TEXT[],

    CONSTRAINT "CutoffSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inputRank" INTEGER NOT NULL,
    "inputCategory" TEXT NOT NULL,
    "inputQuota" TEXT NOT NULL,
    "inputState" TEXT,
    "inputGender" "Gender",
    "inputPwd" BOOLEAN,
    "inputCollegeType" TEXT,
    "inputBudget" TEXT,
    "resultCount" INTEGER NOT NULL,
    "topResults" JSONB NOT NULL,
    "appVersion" TEXT,

    CONSTRAINT "PredictionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUpload" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "authority" TEXT,
    "year" INTEGER,
    "round" TEXT,
    "rowsParsed" INTEGER NOT NULL DEFAULT 0,
    "rowsLoaded" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "status" "RecordStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CounsellingAuthority_code_key" ON "CounsellingAuthority"("code");

-- CreateIndex
CREATE UNIQUE INDEX "State_code_key" ON "State"("code");

-- CreateIndex
CREATE INDEX "College_type_idx" ON "College"("type");

-- CreateIndex
CREATE INDEX "College_stateId_idx" ON "College"("stateId");

-- CreateIndex
CREATE UNIQUE INDEX "College_name_stateId_key" ON "College"("name", "stateId");

-- CreateIndex
CREATE UNIQUE INDEX "Course_name_key" ON "Course"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryMap_rawCode_key" ON "CategoryMap"("rawCode");

-- CreateIndex
CREATE UNIQUE INDEX "QuotaMap_rawCode_key" ON "QuotaMap"("rawCode");

-- CreateIndex
CREATE UNIQUE INDEX "Allotment_rawRowHash_key" ON "Allotment"("rawRowHash");

-- CreateIndex
CREATE INDEX "Allotment_year_round_idx" ON "Allotment"("year", "round");

-- CreateIndex
CREATE INDEX "Allotment_normalizedCategory_idx" ON "Allotment"("normalizedCategory");

-- CreateIndex
CREATE INDEX "Allotment_normalizedQuota_idx" ON "Allotment"("normalizedQuota");

-- CreateIndex
CREATE INDEX "Allotment_state_idx" ON "Allotment"("state");

-- CreateIndex
CREATE INDEX "Allotment_collegeId_courseId_year_round_idx" ON "Allotment"("collegeId", "courseId", "year", "round");

-- CreateIndex
CREATE INDEX "SeatMatrix_year_round_idx" ON "SeatMatrix"("year", "round");

-- CreateIndex
CREATE UNIQUE INDEX "SeatMatrix_year_round_collegeId_courseId_quota_category_key" ON "SeatMatrix"("year", "round", "collegeId", "courseId", "quota", "category");

-- CreateIndex
CREATE INDEX "CutoffSummary_category_quota_year_idx" ON "CutoffSummary"("category", "quota", "year");

-- CreateIndex
CREATE INDEX "CutoffSummary_collegeId_courseId_idx" ON "CutoffSummary"("collegeId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CutoffSummary_year_round_collegeId_courseId_category_quota_key" ON "CutoffSummary"("year", "round", "collegeId", "courseId", "category", "quota");

-- CreateIndex
CREATE INDEX "PredictionLog_createdAt_idx" ON "PredictionLog"("createdAt");

-- AddForeignKey
ALTER TABLE "CounsellingAuthority" ADD CONSTRAINT "CounsellingAuthority_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "College" ADD CONSTRAINT "College_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allotment" ADD CONSTRAINT "Allotment_authorityId_fkey" FOREIGN KEY ("authorityId") REFERENCES "CounsellingAuthority"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allotment" ADD CONSTRAINT "Allotment_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allotment" ADD CONSTRAINT "Allotment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatMatrix" ADD CONSTRAINT "SeatMatrix_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatMatrix" ADD CONSTRAINT "SeatMatrix_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutoffSummary" ADD CONSTRAINT "CutoffSummary_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutoffSummary" ADD CONSTRAINT "CutoffSummary_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
