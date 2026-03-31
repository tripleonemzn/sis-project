type StaffProfile = {
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

export function resolveStaffDivision(user?: StaffProfile | null): StaffDivision {
  const ptkType = normalizeCode(user?.ptkType);
  const duties = normalizeDutyList(user?.additionalDuties);

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

export function canAccessStaffPayments(user?: StaffProfile | null) {
  const division = resolveStaffDivision(user);
  return division === 'FINANCE';
}

export function getStaffHomeSubtitle(user?: StaffProfile | null) {
  const division = resolveStaffDivision(user);
  if (division === 'HEAD_TU') {
    return 'Pantau operasional TU, surat sekolah, dan monitoring layanan administrasi.';
  }
  if (division === 'ADMINISTRATION') {
    return 'Kelola administrasi siswa, guru, dan perizinan secara terpusat.';
  }
  if (division === 'FINANCE') {
    return 'Pantau tagihan siswa, kolektibilitas pembayaran, dan prioritas operasional keuangan.';
  }
  return 'Pantau layanan siswa, pembayaran, dan operasional staff secara terpusat.';
}

export function getStaffSectionTitle(user?: StaffProfile | null) {
  const division = resolveStaffDivision(user);
  if (division === 'HEAD_TU') return 'Statistik Kepala TU';
  if (division === 'ADMINISTRATION') return 'Statistik Administrasi';
  if (division === 'FINANCE') return 'Statistik Bendahara';
  return 'Statistik Staff';
}

export function getStaffPreferredMenuKeys(user?: StaffProfile | null) {
  const division = resolveStaffDivision(user);
  if (division === 'HEAD_TU') {
    return ['staff-admin', 'staff-students'];
  }
  if (division === 'ADMINISTRATION') {
    return ['staff-admin', 'staff-students'];
  }
  return ['staff-payments', 'staff-students', 'staff-admin'];
}

export function getStaffStudentsSubtitle(user?: StaffProfile | null) {
  const division = resolveStaffDivision(user);
  if (division === 'HEAD_TU') {
    return 'Data siswa untuk kontrol layanan TU, verifikasi, dan administrasi sekolah.';
  }
  if (division === 'ADMINISTRATION') {
    return 'Daftar siswa untuk kebutuhan administrasi, kelengkapan data, dan verifikasi.';
  }
  return 'Daftar siswa untuk kebutuhan administrasi dan verifikasi staff.';
}

export function getStaffPaymentsBlockedMessage(user?: StaffProfile | null) {
  const division = resolveStaffDivision(user);
  if (division === 'HEAD_TU') {
    return 'Modul pembayaran native khusus bendahara. Gunakan workspace Kepala TU untuk monitoring keuangan.';
  }
  if (division === 'ADMINISTRATION') {
    return 'Modul pembayaran hanya tersedia untuk bendahara. Staff administrasi menggunakan workspace administrasi.';
  }
  return 'Halaman ini khusus untuk staff keuangan / bendahara.';
}

export function getStaffFinanceNotificationTarget(user?: StaffProfile | null) {
  const division = resolveStaffDivision(user);
  if (division === 'HEAD_TU') return '/staff/admin';
  if (division === 'ADMINISTRATION') return '/staff/admin';
  return '/staff/payments';
}
