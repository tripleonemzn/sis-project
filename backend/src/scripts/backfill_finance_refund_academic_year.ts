import {
  AcademicYearDateResolutionMethod,
  resolveAcademicYearIdFromDate,
} from '../utils/academicYearDateResolution';
import prisma from '../utils/prisma';

type CliArgs = {
  apply: boolean;
  refundId: number | null;
  limit: number | null;
  verbose: boolean;
  strictMembershipOnly: boolean;
};

type AcademicYearRow = {
  id: number;
  name: string;
  semester1Start: Date;
  semester1End: Date;
  semester2Start: Date;
  semester2End: Date;
};

type RefundRow = {
  id: number;
  studentId: number;
  academicYearId: number | null;
  refundNo: string;
  refundedAt: Date;
  createdAt: Date;
  student: {
    id: number;
    name: string;
    username: string;
    nis: string | null;
    nisn: string | null;
  };
};

type MembershipRow = {
  studentId: number;
  academicYearId: number;
  isCurrent: boolean;
  startedAt: Date | null;
  endedAt: Date | null;
};

type Resolution = {
  academicYearId: number | null;
  method: AcademicYearDateResolutionMethod;
  details: string;
};

function printUsage() {
  console.log(`
Usage:
  npm run finance:refund-backfill-academic-year -- [options]

Options:
  --apply                     Tulis hasil backfill ke database. Default: dry-run.
  --refund-id <id>            Batasi ke satu refund tertentu.
  --limit <n>                 Batasi jumlah refund yang diproses.
  --verbose                   Tampilkan detail refund yang di-resolve / di-skip.
  --strict-membership-only    Hanya resolve jika ada bukti membership siswa.
  -h, --help                  Tampilkan bantuan.

Examples:
  npm run finance:refund-backfill-academic-year --
  npm run finance:refund-backfill-academic-year -- --apply
  npm run finance:refund-backfill-academic-year -- --refund-id 15 --verbose
  npm run finance:refund-backfill-academic-year -- --apply --limit 100
`);
}

function parseArgs(argv: string[]): CliArgs {
  let apply = false;
  let refundId: number | null = null;
  let limit: number | null = null;
  let verbose = false;
  let strictMembershipOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--refund-id' && next) {
      refundId = Number(next);
      index += 1;
      continue;
    }
    if (arg === '--limit' && next) {
      limit = Number(next);
      index += 1;
      continue;
    }
    if (arg === '--verbose') {
      verbose = true;
      continue;
    }
    if (arg === '--strict-membership-only') {
      strictMembershipOnly = true;
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      printUsage();
      process.exit(0);
    }
  }

  if (refundId !== null && (!Number.isFinite(refundId) || refundId <= 0)) {
    throw new Error('Nilai --refund-id tidak valid.');
  }

  if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) {
    throw new Error('Nilai --limit tidak valid.');
  }

  return {
    apply,
    refundId,
    limit,
    verbose,
    strictMembershipOnly,
  };
}

function uniqueIds(values: number[]) {
  return Array.from(
    new Set(values.filter((item) => Number.isFinite(item) && item > 0)),
  );
}

function formatRefundLabel(refund: RefundRow) {
  return `#${refund.id} ${refund.refundNo} | ${refund.student.name} (${refund.student.username})`;
}

function resolveRefundAcademicYear(params: {
  refund: RefundRow;
  memberships: MembershipRow[];
  academicYears: AcademicYearRow[];
  strictMembershipOnly: boolean;
}): Resolution {
  const { refund, memberships, academicYears, strictMembershipOnly } = params;
  const refundedAt = refund.refundedAt || refund.createdAt;
  return resolveAcademicYearIdFromDate({
    eventAt: refundedAt,
    memberships,
    academicYears,
    strictMembershipOnly,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const academicYears = await prisma.academicYear.findMany({
    select: {
      id: true,
      name: true,
      semester1Start: true,
      semester1End: true,
      semester2Start: true,
      semester2End: true,
    },
    orderBy: [{ semester1Start: 'asc' }, { id: 'asc' }],
  });

  const refunds = await prisma.financeRefund.findMany({
    where: {
      academicYearId: null,
      ...(args.refundId ? { id: args.refundId } : {}),
    },
    select: {
      id: true,
      studentId: true,
      academicYearId: true,
      refundNo: true,
      refundedAt: true,
      createdAt: true,
      student: {
        select: {
          id: true,
          name: true,
          username: true,
          nis: true,
          nisn: true,
        },
      },
    },
    orderBy: [{ refundedAt: 'asc' }, { id: 'asc' }],
    ...(args.limit ? { take: args.limit } : {}),
  });

  const studentIds = uniqueIds(refunds.map((refund) => refund.studentId));
  const memberships = studentIds.length
    ? await prisma.studentAcademicMembership.findMany({
        where: {
          studentId: { in: studentIds },
        },
        select: {
          studentId: true,
          academicYearId: true,
          isCurrent: true,
          startedAt: true,
          endedAt: true,
        },
        orderBy: [{ studentId: 'asc' }, { academicYearId: 'asc' }],
      })
    : [];

  const membershipsByStudent = new Map<number, MembershipRow[]>();
  memberships.forEach((membership) => {
    const bucket = membershipsByStudent.get(membership.studentId) || [];
    bucket.push(membership);
    membershipsByStudent.set(membership.studentId, bucket);
  });

  const methodCounts = new Map<AcademicYearDateResolutionMethod, number>();
  const resolutionRows = refunds.map((refund) => {
    const resolution = resolveRefundAcademicYear({
      refund,
      memberships: membershipsByStudent.get(refund.studentId) || [],
      academicYears,
      strictMembershipOnly: args.strictMembershipOnly,
    });
    methodCounts.set(resolution.method, (methodCounts.get(resolution.method) || 0) + 1);
    return {
      refund,
      resolution,
    };
  });

  const resolvedRows = resolutionRows.filter((row) => row.resolution.academicYearId);
  const skippedRows = resolutionRows.filter((row) => !row.resolution.academicYearId);

  let updatedCount = 0;
  if (args.apply && resolvedRows.length > 0) {
    for (const row of resolvedRows) {
      await prisma.financeRefund.update({
        where: { id: row.refund.id },
        data: {
          academicYearId: row.resolution.academicYearId,
        },
      });
      updatedCount += 1;
    }
  }

  console.log('Finance Refund Academic Year Backfill');
  console.log(`Mode          : ${args.apply ? 'APPLY' : 'DRY_RUN'}`);
  console.log(`Strict        : ${args.strictMembershipOnly ? 'YES' : 'NO'}`);
  console.log(`Target rows   : ${refunds.length}`);
  console.log(`Resolved      : ${resolvedRows.length}`);
  console.log(`Skipped       : ${skippedRows.length}`);
  console.log(`Updated       : ${updatedCount}`);

  console.log('');
  console.log('== Method Summary ==');
  ([
    'MEMBERSHIP_WINDOW',
    'MEMBERSHIP_ACADEMIC_YEAR_RANGE',
    'ACADEMIC_YEAR_RANGE_ONLY',
    'SKIP_AMBIGUOUS',
    'SKIP_NO_MATCH',
  ] satisfies AcademicYearDateResolutionMethod[]).forEach((method) => {
    console.log(`- ${method}: ${methodCounts.get(method) || 0}`);
  });

  if (args.verbose) {
    if (resolvedRows.length > 0) {
      console.log('');
      console.log('== Resolved Rows ==');
      resolvedRows.forEach((row) => {
        const academicYear = academicYears.find((item) => item.id === row.resolution.academicYearId);
        console.log(
          `- ${formatRefundLabel(row.refund)} -> ${academicYear?.name || row.resolution.academicYearId} [${row.resolution.method}]`,
        );
      });
    }

    if (skippedRows.length > 0) {
      console.log('');
      console.log('== Skipped Rows ==');
      skippedRows.forEach((row) => {
        console.log(
          `- ${formatRefundLabel(row.refund)} -> SKIP [${row.resolution.method}] ${row.resolution.details}`,
        );
      });
    }
  } else if (skippedRows.length > 0) {
    console.log('');
    console.log('== Sample Skipped Rows ==');
    skippedRows.slice(0, 10).forEach((row) => {
      console.log(
        `- ${formatRefundLabel(row.refund)} -> ${row.resolution.method} (${row.resolution.details})`,
      );
    });
    if (skippedRows.length > 10) {
      console.log(`- ... ${skippedRows.length - 10} baris lainnya`);
    }
  }
}

main()
  .catch((error) => {
    console.error('[finance-refund-backfill] fatal error', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
