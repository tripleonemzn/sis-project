export type AcademicYearDateWindow = {
  id: number;
  name?: string | null;
  semester1Start: Date;
  semester1End?: Date | null;
  semester2Start?: Date | null;
  semester2End: Date;
};

export type StudentAcademicDateMembership = {
  studentId?: number;
  academicYearId: number;
  isCurrent?: boolean;
  startedAt: Date | null;
  endedAt: Date | null;
};

export type AcademicYearDateResolutionMethod =
  | 'MEMBERSHIP_WINDOW'
  | 'MEMBERSHIP_ACADEMIC_YEAR_RANGE'
  | 'ACADEMIC_YEAR_RANGE_ONLY'
  | 'SKIP_AMBIGUOUS'
  | 'SKIP_NO_MATCH';

export type AcademicYearDateResolution = {
  academicYearId: number | null;
  method: AcademicYearDateResolutionMethod;
  details: string;
};

function uniquePositiveIds(values: number[]) {
  return Array.from(
    new Set(values.filter((item) => Number.isFinite(item) && item > 0)),
  );
}

export function isDateWithinAcademicYearWindow(
  academicYear: AcademicYearDateWindow,
  value: Date,
) {
  const timestamp = value.getTime();
  return (
    timestamp >= academicYear.semester1Start.getTime() &&
    timestamp <= academicYear.semester2End.getTime()
  );
}

export function isDateWithinMembershipWindow(
  membership: StudentAcademicDateMembership,
  value: Date,
) {
  const timestamp = value.getTime();
  const startedAt = membership.startedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const endedAt = membership.endedAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return timestamp >= startedAt && timestamp <= endedAt;
}

export function resolveAcademicYearIdFromDate(params: {
  eventAt: Date;
  memberships: StudentAcademicDateMembership[];
  academicYears: AcademicYearDateWindow[];
  strictMembershipOnly?: boolean;
}): AcademicYearDateResolution {
  const { eventAt, memberships, academicYears, strictMembershipOnly = false } = params;

  const membershipWindowMatches = uniquePositiveIds(
    memberships
      .filter((membership) => isDateWithinMembershipWindow(membership, eventAt))
      .map((membership) => membership.academicYearId),
  );
  if (membershipWindowMatches.length === 1) {
    return {
      academicYearId: membershipWindowMatches[0],
      method: 'MEMBERSHIP_WINDOW',
      details: 'resolved_by_membership_window',
    };
  }
  if (membershipWindowMatches.length > 1) {
    return {
      academicYearId: null,
      method: 'SKIP_AMBIGUOUS',
      details: `multiple_membership_windows:${membershipWindowMatches.join(',')}`,
    };
  }

  const membershipAcademicYearRangeMatches = uniquePositiveIds(
    memberships
      .filter((membership) => {
        const academicYear = academicYears.find((row) => row.id === membership.academicYearId);
        return academicYear
          ? isDateWithinAcademicYearWindow(academicYear, eventAt)
          : false;
      })
      .map((membership) => membership.academicYearId),
  );
  if (membershipAcademicYearRangeMatches.length === 1) {
    return {
      academicYearId: membershipAcademicYearRangeMatches[0],
      method: 'MEMBERSHIP_ACADEMIC_YEAR_RANGE',
      details: 'resolved_by_membership_academic_year_range',
    };
  }
  if (membershipAcademicYearRangeMatches.length > 1) {
    return {
      academicYearId: null,
      method: 'SKIP_AMBIGUOUS',
      details: `multiple_membership_academic_year_ranges:${membershipAcademicYearRangeMatches.join(',')}`,
    };
  }

  if (strictMembershipOnly) {
    return {
      academicYearId: null,
      method: 'SKIP_NO_MATCH',
      details: 'strict_membership_only_no_match',
    };
  }

  const academicYearRangeMatches = uniquePositiveIds(
    academicYears
      .filter((academicYear) => isDateWithinAcademicYearWindow(academicYear, eventAt))
      .map((academicYear) => academicYear.id),
  );
  if (academicYearRangeMatches.length === 1) {
    return {
      academicYearId: academicYearRangeMatches[0],
      method: 'ACADEMIC_YEAR_RANGE_ONLY',
      details: 'resolved_by_academic_year_date_range_only',
    };
  }
  if (academicYearRangeMatches.length > 1) {
    return {
      academicYearId: null,
      method: 'SKIP_AMBIGUOUS',
      details: `multiple_academic_year_ranges:${academicYearRangeMatches.join(',')}`,
    };
  }

  return {
    academicYearId: null,
    method: 'SKIP_NO_MATCH',
    details: 'no_matching_academic_year_range',
  };
}
