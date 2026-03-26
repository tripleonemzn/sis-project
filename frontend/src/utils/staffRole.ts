type StaffRoleProfile = {
  role?: string | null;
  ptkType?: string | null;
  additionalDuties?: string[] | null;
};

export type StaffDivision = 'FINANCE' | 'ADMINISTRATION' | 'HEAD_TU' | 'GENERAL';

function normalizeCode(value?: string | null) {
  return String(value || '').trim().replace(/\s+/g, '_').toUpperCase();
}

function normalizeDutyList(duties?: string[] | null) {
  return (duties || []).map((item) => normalizeCode(item));
}

export function resolveStaffDivision(profile?: StaffRoleProfile | null): StaffDivision {
  const ptkType = normalizeCode(profile?.ptkType);
  const duties = normalizeDutyList(profile?.additionalDuties);

  if (ptkType === 'KEPALA_TU' || ptkType === 'KEPALA_TATA_USAHA') {
    return 'HEAD_TU';
  }

  if (ptkType === 'STAFF_ADMINISTRASI') {
    return 'ADMINISTRATION';
  }

  if (ptkType === 'STAFF_KEUANGAN' || ptkType === 'BENDAHARA' || duties.includes('BENDAHARA')) {
    return 'FINANCE';
  }

  return 'GENERAL';
}

export function isFinanceStaffProfile(
  profile?: StaffRoleProfile | null,
  options?: { allowAdmin?: boolean },
) {
  const role = normalizeCode(profile?.role);
  if (options?.allowAdmin && role === 'ADMIN') {
    return true;
  }

  const division = resolveStaffDivision(profile);
  return division === 'FINANCE' || division === 'GENERAL';
}

export function getStaffDivisionLabel(profile?: StaffRoleProfile | null) {
  const division = resolveStaffDivision(profile);
  if (division === 'HEAD_TU') return 'Kepala TU';
  if (division === 'ADMINISTRATION') return 'Staff Administrasi';
  if (division === 'FINANCE') return 'Bendahara';
  return 'Staff';
}

export function getStaffDefaultPath(profile?: StaffRoleProfile | null) {
  const division = resolveStaffDivision(profile);
  if (division === 'HEAD_TU') return '/staff/head-tu';
  if (division === 'ADMINISTRATION') return '/staff/administration';
  return '/staff/finance';
}

export function getStaffFinanceNotificationPath(profile?: StaffRoleProfile | null) {
  const division = resolveStaffDivision(profile);
  if (division === 'HEAD_TU') return '/staff/head-tu/finance';
  if (division === 'ADMINISTRATION') return '/staff/administration';
  return '/staff/finance';
}
