import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CollegeProfile } from "@/components/college-profile";

export const dynamic = "force-dynamic";

export default async function CollegePage({ params }: { params: { id: string } }) {
  const college = await prisma.college.findUnique({
    where: { id: params.id },
    include: { state: true },
  });
  if (!college) notFound();

  const cuts = await prisma.cutoffSummary.findMany({
    where: { collegeId: params.id },
    include: { course: true },
    orderBy: [{ year: "asc" }],
  });

  const fee = await prisma.feeStructure.findFirst({
    where: { collegeId: params.id },
    orderBy: [{ year: "desc" }],
  });

  const seatRows = await prisma.seatMatrix.findMany({
    where: { collegeId: params.id },
    include: { course: true },
    orderBy: [{ year: "desc" }],
  });

  return (
    <CollegeProfile
      college={{
        name: college.name, type: college.type, code: college.code,
        city: college.city, state: college.state?.code, stateName: college.state?.name,
        isDeemed: college.isDeemed, isCentral: college.isCentral, isMinority: college.isMinority,
        feeBand: college.feeBandDefault,
      }}
      cutoffs={cuts.map((c) => ({
        year: c.year, round: c.round, course: c.course?.name ?? "MBBS",
        quota: c.quota, category: c.category, opening: c.openingRank, closing: c.closingRank,
        allotmentCount: c.allotmentCount,
      }))}
      fee={fee ? {
        course: fee.course, tuitionAnnual: fee.tuitionAnnual, hostelAnnual: fee.hostelAnnual, otherAnnual: fee.otherAnnual,
        nriTuition: fee.nriTuition, isIndicative: fee.isIndicative, sourceUrl: fee.sourceUrl, note: fee.note,
      } : null}
      seatMatrix={seatRows.map((s) => ({
        year: s.year, round: s.round, course: s.course?.name ?? "MBBS",
        quota: s.quota, category: s.category, seats: s.seats, source: s.sourceFile,
      }))}
    />
  );
}
