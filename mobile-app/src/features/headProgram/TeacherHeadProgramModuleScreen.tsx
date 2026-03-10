import { useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../components/AppLoadingScreen';
import { QueryStateView } from '../../components/QueryStateView';
import { BRAND_COLORS } from '../../config/brand';
import { getApiErrorMessage } from '../../lib/api/errorMessage';
import { mobileLiveQueryOptions } from '../../lib/query/liveQuery';
import { getStandardPagePadding } from '../../lib/ui/pageLayout';
import { academicYearApi } from '../academicYear/academicYearApi';
import { useAuth } from '../auth/AuthProvider';
import { headProgramApi } from './headProgramApi';
import { HeadProgramClassRow, HeadProgramInternshipRow, IndustryPartnerRow, JobVacancyRow } from './types';

type ModuleMode = 'CLASSES' | 'PKL' | 'PARTNERS';
type InternshipStatusFilter = 'ALL' | 'PENDING' | 'ONGOING' | 'DONE';
type PartnerTab = 'PARTNERS' | 'VACANCIES';
type PartnerStatus = 'AKTIF' | 'NON_AKTIF' | 'PROSES';

type PartnerFormState = {
  name: string;
  address: string;
  city: string;
  sector: string;
  contactPerson: string;
  phone: string;
  email: string;
  website: string;
  cooperationStatus: PartnerStatus;
};

type VacancyFormState = {
  title: string;
  companyName: string;
  industryPartnerId: string;
  description: string;
  requirements: string;
  registrationLink: string;
  deadline: string;
  isOpen: boolean;
};

const DEFAULT_PARTNER_FORM: PartnerFormState = {
  name: '',
  address: '',
  city: '',
  sector: '',
  contactPerson: '',
  phone: '',
  email: '',
  website: '',
  cooperationStatus: 'PROSES',
};

const DEFAULT_VACANCY_FORM: VacancyFormState = {
  title: '',
  companyName: '',
  industryPartnerId: '',
  description: '',
  requirements: '',
  registrationLink: '',
  deadline: '',
  isOpen: true,
};

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toText(value?: string | null) {
  if (!value) return '-';
  return String(value);
}

function normalizeDuty(value?: string) {
  return String(value || '').trim().toUpperCase();
}

function hasKakomDuty(duties?: string[]) {
  if (!Array.isArray(duties)) return false;
  return duties.some((duty) => {
    const normalized = normalizeDuty(duty);
    return normalized === 'KAPROG' || normalized === 'KEPALA_KOMPETENSI';
  });
}

function statusInfo(status: InternshipStatusFilter) {
  if (status === 'ONGOING') return { label: 'Berjalan', text: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd' };
  if (status === 'DONE') return { label: 'Selesai', text: '#166534', bg: '#dcfce7', border: '#86efac' };
  if (status === 'PENDING') return { label: 'Menunggu', text: '#92400e', bg: '#fef3c7', border: '#fcd34d' };
  return { label: 'Semua', text: '#334155', bg: '#f1f5f9', border: '#cbd5e1' };
}

function resolveInternshipStatus(item: HeadProgramInternshipRow): InternshipStatusFilter {
  const raw = String(item.status || '').toUpperCase();

  if (item.finalGrade !== null && typeof item.finalGrade !== 'undefined') {
    return 'DONE';
  }

  if (['DONE', 'COMPLETED', 'FINISHED', 'SELESAI', 'LULUS'].includes(raw)) {
    return 'DONE';
  }

  if (['APPROVED', 'ACTIVE', 'ONGOING', 'IN_PROGRESS', 'BERJALAN'].includes(raw)) {
    return 'ONGOING';
  }

  if (['REJECTED', 'CANCELLED', 'DITOLAK'].includes(raw)) {
    return 'DONE';
  }

  if (item.endDate) return 'DONE';
  if (item.startDate) return 'ONGOING';
  return 'PENDING';
}

function modeIcon(mode: ModuleMode): keyof typeof Feather.glyphMap {
  if (mode === 'CLASSES') return 'book-open';
  if (mode === 'PKL') return 'briefcase';
  return 'users';
}

function FilterChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
        backgroundColor: active ? '#e9f1ff' : '#fff',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 7,
      }}
    >
      <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 12,
        padding: 12,
        flex: 1,
      }}
    >
      <Text style={{ color: '#64748b', fontSize: 11 }}>{title}</Text>
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 20, marginTop: 4 }}>{value}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }}>{subtitle}</Text>
    </View>
  );
}

function EmptyStateCard({ message }: { message: string }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderStyle: 'dashed',
        borderRadius: 10,
        backgroundColor: '#fff',
        padding: 14,
      }}
    >
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Belum ada data</Text>
      <Text style={{ color: '#64748b' }}>{message}</Text>
    </View>
  );
}

function ClassListCard({ item }: { item: HeadProgramClassRow }) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{toText(item.name)}</Text>
      <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>
        Level {toText(item.level)} • {toText(item.major?.code || item.major?.name)}
      </Text>
      <Text style={{ color: '#334155', marginTop: 6, fontSize: 12 }}>
        Jumlah siswa: {item._count?.students || 0}
      </Text>
      <Text style={{ color: '#334155', marginTop: 2, fontSize: 12 }}>Wali kelas: {toText(item.teacher?.name)}</Text>
    </View>
  );
}

function InternshipListCard({ item }: { item: HeadProgramInternshipRow }) {
  const status = resolveInternshipStatus(item);
  const badge = statusInfo(status);

  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{toText(item.student?.name)}</Text>
          <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>
            {toText(item.student?.studentClass?.name)} • {toText(item.student?.studentClass?.major?.code || item.student?.studentClass?.major?.name)}
          </Text>
        </View>
        <View
          style={{
            borderWidth: 1,
            borderColor: badge.border,
            backgroundColor: badge.bg,
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <Text style={{ color: badge.text, fontWeight: '700', fontSize: 11 }}>{badge.label}</Text>
        </View>
      </View>

      <Text style={{ color: '#334155', fontSize: 12, marginTop: 8 }}>Perusahaan: {toText(item.companyName)}</Text>
      <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>Pembimbing: {toText(item.teacher?.name)}</Text>
      <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>
        Mulai: {formatDateTime(item.startDate)}
      </Text>
      <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>
        Selesai: {formatDateTime(item.endDate)}
      </Text>
      <Text style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
        Nilai akhir: {typeof item.finalGrade === 'number' ? item.finalGrade.toFixed(2) : '-'}
      </Text>
    </View>
  );
}

function PartnerListCard({
  item,
  onEdit,
  onDelete,
  deletePending,
}: {
  item: IndustryPartnerRow;
  onEdit: (item: IndustryPartnerRow) => void;
  onDelete: (item: IndustryPartnerRow) => void;
  deletePending: boolean;
}) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{toText(item.name)}</Text>
      <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>
        Bidang: {toText(item.sector || item.field)} • Status: {toText(item.cooperationStatus)}
      </Text>
      <Text style={{ color: '#334155', fontSize: 12, marginTop: 6 }}>Alamat: {toText(item.address)}</Text>
      <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>
        PIC: {toText(item.contactPerson || item.picName)}
      </Text>
      <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>
        Kontak: {toText(item.phone || item.email || item.picPhone || item.picEmail)}
      </Text>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Pressable
          onPress={() => onEdit(item)}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: '#93c5fd',
            borderRadius: 8,
            paddingVertical: 8,
            alignItems: 'center',
            backgroundColor: '#eff6ff',
          }}
        >
          <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Edit</Text>
        </Pressable>
        <Pressable
          onPress={() => onDelete(item)}
          disabled={deletePending}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: '#fca5a5',
            borderRadius: 8,
            paddingVertical: 8,
            alignItems: 'center',
            backgroundColor: '#fff',
            opacity: deletePending ? 0.7 : 1,
          }}
        >
          <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Hapus</Text>
        </Pressable>
      </View>
    </View>
  );
}

function VacancyListCard({
  item,
  onEdit,
  onDelete,
  deletePending,
}: {
  item: JobVacancyRow;
  onEdit: (item: JobVacancyRow) => void;
  onDelete: (item: JobVacancyRow) => void;
  deletePending: boolean;
}) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{toText(item.title)}</Text>
      <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>
        Mitra: {toText(item.industryPartner?.name || item.companyName)} • Status: {item.isOpen ? 'Aktif' : 'Tutup'}
      </Text>
      <Text style={{ color: '#334155', fontSize: 12, marginTop: 6 }}>{toText(item.description)}</Text>
      <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>
        Batas akhir: {formatDateTime(item.deadline || item.closingDate)}
      </Text>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Pressable
          onPress={() => onEdit(item)}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: '#93c5fd',
            borderRadius: 8,
            paddingVertical: 8,
            alignItems: 'center',
            backgroundColor: '#eff6ff',
          }}
        >
          <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Edit</Text>
        </Pressable>
        <Pressable
          onPress={() => onDelete(item)}
          disabled={deletePending}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: '#fca5a5',
            borderRadius: 8,
            paddingVertical: 8,
            alignItems: 'center',
            backgroundColor: '#fff',
            opacity: deletePending ? 0.7 : 1,
          }}
        >
          <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Hapus</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function TeacherHeadProgramModuleScreen({
  mode,
  title,
  subtitle,
}: {
  mode: ModuleMode;
  title: string;
  subtitle: string;
}) {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InternshipStatusFilter>('ALL');
  const [partnerTab, setPartnerTab] = useState<PartnerTab>('PARTNERS');
  const [editingPartnerId, setEditingPartnerId] = useState<number | null>(null);
  const [partnerForm, setPartnerForm] = useState<PartnerFormState>(DEFAULT_PARTNER_FORM);
  const [editingVacancyId, setEditingVacancyId] = useState<number | null>(null);
  const [vacancyForm, setVacancyForm] = useState<VacancyFormState>(DEFAULT_VACANCY_FORM);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-head-program-active-year'],
    enabled: isAuthenticated && user?.role === 'TEACHER',
    queryFn: async () => {
      try {
        return await academicYearApi.getActive();
      } catch {
        return null;
      }
    },
  });

  const managedMajors = useMemo(
    () =>
      Array.isArray(user?.managedMajors) && user.managedMajors.length > 0
        ? user.managedMajors
        : user?.managedMajor
          ? [user.managedMajor]
          : [],
    [user],
  );

  const managedMajorIds = useMemo(() => managedMajors.map((major) => Number(major.id)).filter(Boolean), [managedMajors]);
  const managedMajorIdsKey = managedMajorIds.join(',');
  const isAllowedRole = user?.role === 'TEACHER' && hasKakomDuty(user?.additionalDuties);

  const classesQuery = useQuery({
    queryKey: ['mobile-head-program-classes', managedMajorIdsKey, activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowedRole && managedMajorIds.length > 0,
    queryFn: async () =>
      headProgramApi.listClassesByMajors({
        majorIds: managedMajorIds,
        academicYearId: activeYearQuery.data?.id,
      }),
  });

  const internshipQuery = useQuery({
    queryKey: ['mobile-head-program-pkl', activeYearQuery.data?.id, managedMajorIdsKey],
    enabled: isAuthenticated && !!isAllowedRole && mode === 'PKL',
    queryFn: async () =>
      headProgramApi.listInternships({
        academicYearId: activeYearQuery.data?.id,
      }),
    ...mobileLiveQueryOptions,
  });

  const partnersQuery = useQuery({
    queryKey: ['mobile-head-program-partners'],
    enabled: isAuthenticated && !!isAllowedRole && mode === 'PARTNERS',
    queryFn: async () => headProgramApi.listPartners(),
  });

  const vacanciesQuery = useQuery({
    queryKey: ['mobile-head-program-vacancies'],
    enabled: isAuthenticated && !!isAllowedRole && mode === 'PARTNERS',
    queryFn: async () => headProgramApi.listVacancies(),
  });

  const savePartnerMutation = useMutation({
    mutationFn: async () => {
      if (!partnerForm.name.trim()) throw new Error('Nama perusahaan wajib diisi.');
      if (!partnerForm.address.trim()) throw new Error('Alamat perusahaan wajib diisi.');

      const payload = {
        name: partnerForm.name.trim(),
        address: partnerForm.address.trim(),
        city: partnerForm.city.trim() || undefined,
        sector: partnerForm.sector.trim() || undefined,
        contactPerson: partnerForm.contactPerson.trim() || undefined,
        phone: partnerForm.phone.trim() || undefined,
        email: partnerForm.email.trim() || undefined,
        website: partnerForm.website.trim() || undefined,
        cooperationStatus: partnerForm.cooperationStatus,
      };

      if (editingPartnerId) {
        return headProgramApi.updatePartner(editingPartnerId, payload);
      }

      return headProgramApi.createPartner(payload);
    },
    onSuccess: () => {
      Alert.alert('Berhasil', editingPartnerId ? 'Mitra berhasil diperbarui.' : 'Mitra berhasil ditambahkan.');
      setEditingPartnerId(null);
      setPartnerForm(DEFAULT_PARTNER_FORM);
      void partnersQuery.refetch();
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getApiErrorMessage(error, 'Tidak dapat menyimpan data mitra.'));
    },
  });

  const deletePartnerMutation = useMutation({
    mutationFn: async (partnerId: number) => headProgramApi.removePartner(partnerId),
    onSuccess: () => {
      Alert.alert('Berhasil', 'Mitra berhasil dihapus.');
      if (editingPartnerId) {
        setEditingPartnerId(null);
        setPartnerForm(DEFAULT_PARTNER_FORM);
      }
      void partnersQuery.refetch();
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getApiErrorMessage(error, 'Tidak dapat menghapus data mitra.'));
    },
  });

  const saveVacancyMutation = useMutation({
    mutationFn: async () => {
      if (!vacancyForm.title.trim()) throw new Error('Judul lowongan wajib diisi.');
      if (!vacancyForm.industryPartnerId && !vacancyForm.companyName.trim()) {
        throw new Error('Pilih mitra industri atau isi nama perusahaan.');
      }

      let deadlineIso: string | undefined;
      if (vacancyForm.deadline) {
        const parsed = new Date(`${vacancyForm.deadline}T00:00:00.000Z`);
        if (Number.isNaN(parsed.getTime())) {
          throw new Error('Format tanggal batas harus YYYY-MM-DD.');
        }
        deadlineIso = parsed.toISOString();
      }

      const payload = {
        title: vacancyForm.title.trim(),
        companyName: vacancyForm.companyName.trim() || undefined,
        industryPartnerId: vacancyForm.industryPartnerId ? Number(vacancyForm.industryPartnerId) : undefined,
        description: vacancyForm.description.trim() || undefined,
        requirements: vacancyForm.requirements.trim() || undefined,
        registrationLink: vacancyForm.registrationLink.trim() || undefined,
        deadline: deadlineIso,
        isOpen: vacancyForm.isOpen,
      };

      if (editingVacancyId) {
        return headProgramApi.updateVacancy(editingVacancyId, payload);
      }

      return headProgramApi.createVacancy(payload);
    },
    onSuccess: () => {
      Alert.alert('Berhasil', editingVacancyId ? 'Lowongan berhasil diperbarui.' : 'Lowongan berhasil ditambahkan.');
      setEditingVacancyId(null);
      setVacancyForm(DEFAULT_VACANCY_FORM);
      void vacanciesQuery.refetch();
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getApiErrorMessage(error, 'Tidak dapat menyimpan data lowongan.'));
    },
  });

  const deleteVacancyMutation = useMutation({
    mutationFn: async (vacancyId: number) => headProgramApi.removeVacancy(vacancyId),
    onSuccess: () => {
      Alert.alert('Berhasil', 'Lowongan berhasil dihapus.');
      if (editingVacancyId) {
        setEditingVacancyId(null);
        setVacancyForm(DEFAULT_VACANCY_FORM);
      }
      void vacanciesQuery.refetch();
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getApiErrorMessage(error, 'Tidak dapat menghapus data lowongan.'));
    },
  });

  const classRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = classesQuery.data || [];
    if (!term) return rows;
    return rows.filter((item) => {
      const values = [
        item.name || '',
        item.level || '',
        item.major?.name || '',
        item.major?.code || '',
        item.teacher?.name || '',
      ];
      return values.some((value) => value.toLowerCase().includes(term));
    });
  }, [classesQuery.data, search]);

  const internshipRows = useMemo(() => {
    const majorSet = new Set(managedMajorIds);
    const baseRows = (internshipQuery.data || []).filter((item) => {
      const majorId = Number(item.student?.studentClass?.majorId || item.student?.studentClass?.major?.id || 0);
      if (!majorSet.size) return true;
      return majorSet.has(majorId);
    });

    const term = search.trim().toLowerCase();
    return baseRows
      .filter((item) => {
        if (statusFilter === 'ALL') return true;
        return resolveInternshipStatus(item) === statusFilter;
      })
      .filter((item) => {
        if (!term) return true;
        const values = [
          item.student?.name || '',
          item.student?.studentClass?.name || '',
          item.companyName || '',
          item.teacher?.name || '',
          item.status || '',
        ];
        return values.some((value) => value.toLowerCase().includes(term));
      });
  }, [internshipQuery.data, managedMajorIds, search, statusFilter]);

  const partnerRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = partnersQuery.data || [];
    if (!term) return rows;
    return rows.filter((item) => {
      const values = [
        item.name || '',
        item.sector || item.field || '',
        item.address || '',
        item.cooperationStatus || '',
        item.contactPerson || item.picName || '',
      ];
      return values.some((value) => value.toLowerCase().includes(term));
    });
  }, [partnersQuery.data, search]);

  const vacancyRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = vacanciesQuery.data || [];
    if (!term) return rows;
    return rows.filter((item) => {
      const values = [
        item.title || '',
        item.companyName || '',
        item.description || '',
        item.industryPartner?.name || '',
      ];
      return values.some((value) => value.toLowerCase().includes(term));
    });
  }, [vacanciesQuery.data, search]);

  const activePartnerOptions = useMemo(() => {
    const rows = partnersQuery.data || [];
    return rows.filter((item) => String(item.cooperationStatus || '').toUpperCase() === 'AKTIF');
  }, [partnersQuery.data]);

  const editPartner = (item: IndustryPartnerRow) => {
    setEditingPartnerId(item.id);
    setPartnerForm({
      name: String(item.name || ''),
      address: String(item.address || ''),
      city: String(item.city || ''),
      sector: String(item.sector || item.field || ''),
      contactPerson: String(item.contactPerson || item.picName || ''),
      phone: String(item.phone || item.picPhone || ''),
      email: String(item.email || item.picEmail || ''),
      website: String(item.website || ''),
      cooperationStatus:
        String(item.cooperationStatus || '').toUpperCase() === 'AKTIF'
          ? 'AKTIF'
          : String(item.cooperationStatus || '').toUpperCase() === 'NON_AKTIF'
            ? 'NON_AKTIF'
            : 'PROSES',
    });
  };

  const askDeletePartner = (item: IndustryPartnerRow) => {
    Alert.alert('Hapus Mitra', `Hapus mitra "${item.name}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => deletePartnerMutation.mutate(item.id),
      },
    ]);
  };

  const editVacancy = (item: JobVacancyRow) => {
    setEditingVacancyId(item.id);
    const rawDate = item.deadline || item.closingDate || null;
    const parsed = rawDate ? new Date(rawDate) : null;
    const parsedDeadline =
      parsed && !Number.isNaN(parsed.getTime())
        ? `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(
            parsed.getUTCDate(),
          ).padStart(2, '0')}`
        : '';

    setVacancyForm({
      title: String(item.title || ''),
      companyName: String(item.companyName || ''),
      industryPartnerId: item.industryPartnerId ? String(item.industryPartnerId) : '',
      description: String(item.description || ''),
      requirements: String(item.requirements || ''),
      registrationLink: String(item.registrationLink || ''),
      deadline: parsedDeadline,
      isOpen: !!item.isOpen,
    });
  };

  const askDeleteVacancy = (item: JobVacancyRow) => {
    Alert.alert('Hapus Lowongan', `Hapus lowongan "${item.title}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => deleteVacancyMutation.mutate(item.id),
      },
    ]);
  };

  const summary = useMemo(() => {
    const totalClasses = (classesQuery.data || []).length;
    const totalStudents = (classesQuery.data || []).reduce((acc, item) => acc + Number(item._count?.students || 0), 0);

    const internships = internshipRows;
    const pklTotal = internships.length;
    const pklOngoing = internships.filter((item) => resolveInternshipStatus(item) === 'ONGOING').length;
    const pklDone = internships.filter((item) => resolveInternshipStatus(item) === 'DONE').length;

    const totalPartners = (partnersQuery.data || []).length;
    const totalVacancies = (vacanciesQuery.data || []).length;
    const openVacancies = (vacanciesQuery.data || []).filter((item) => item.isOpen).length;

    return {
      totalClasses,
      totalStudents,
      pklTotal,
      pklOngoing,
      pklDone,
      totalPartners,
      totalVacancies,
      openVacancies,
    };
  }, [classesQuery.data, internshipRows, partnersQuery.data, vacanciesQuery.data]);

  const anyLoading =
    activeYearQuery.isLoading ||
    classesQuery.isLoading ||
    internshipQuery.isLoading ||
    partnersQuery.isLoading ||
    vacanciesQuery.isLoading;

  const anyError =
    classesQuery.isError || internshipQuery.isError || partnersQuery.isError || vacanciesQuery.isError;

  const refreshAll = () => {
    void activeYearQuery.refetch();
    void classesQuery.refetch();
    void internshipQuery.refetch();
    void partnersQuery.refetch();
    void vacanciesQuery.refetch();
  };

  if (isLoading) return <AppLoadingScreen message={`Memuat ${title.toLowerCase()}...`} />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>{title}</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  if (!isAllowedRole) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>{title}</Text>
        <QueryStateView type="error" message="Akses modul ini membutuhkan tugas tambahan kepala kompetensi." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={<RefreshControl refreshing={anyLoading} onRefresh={refreshAll} />}
    >
      <View
        style={{
          backgroundColor: '#1e3a8a',
          borderRadius: 12,
          padding: 12,
          marginBottom: 10,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.4)',
            backgroundColor: 'rgba(255,255,255,0.15)',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
          }}
        >
          <Feather name={modeIcon(mode)} size={18} color="#e2e8f0" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>{title}</Text>
          <Text style={{ color: '#dbeafe', marginTop: 2 }}>{subtitle}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 10 }}>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <SummaryCard
            title={mode === 'PARTNERS' ? 'Mitra' : 'Kelas'}
            value={String(mode === 'PARTNERS' ? summary.totalPartners : summary.totalClasses)}
            subtitle={mode === 'PARTNERS' ? 'Total perusahaan' : 'Data kompetensi'}
          />
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <SummaryCard
            title={mode === 'PKL' ? 'PKL Berjalan' : mode === 'PARTNERS' ? 'Lowongan Aktif' : 'Total Siswa'}
            value={
              mode === 'PKL'
                ? String(summary.pklOngoing)
                : mode === 'PARTNERS'
                  ? String(summary.openVacancies)
                  : String(summary.totalStudents)
            }
            subtitle={
              mode === 'PKL' ? 'Status ongoing' : mode === 'PARTNERS' ? 'BKK masih buka' : 'Akumulasi siswa'
            }
          />
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <SummaryCard
            title={mode === 'PKL' ? 'PKL Selesai' : mode === 'PARTNERS' ? 'Total Lowongan' : 'Jurusan Dikelola'}
            value={
              mode === 'PKL'
                ? String(summary.pklDone)
                : mode === 'PARTNERS'
                  ? String(summary.totalVacancies)
                  : String(managedMajors.length)
            }
            subtitle={mode === 'PKL' ? `Dari ${summary.pklTotal} data` : mode === 'PARTNERS' ? 'Semua data BKK' : 'Sesuai akun'}
          />
        </View>
      </View>

      {managedMajors.length > 0 ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Jurusan Dikelola</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {managedMajors.map((major) => (
              <View
                key={major.id}
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e1f5',
                  backgroundColor: '#fff',
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                }}
              >
                <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', fontSize: 12 }}>
                  {major.code ? `${major.code} - ` : ''}
                  {major.name}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderStyle: 'dashed',
            borderRadius: 10,
            backgroundColor: '#fff',
            padding: 14,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Belum ada jurusan kelolaan</Text>
          <Text style={{ color: '#64748b' }}>Hubungi admin untuk assign jurusan pada akun Anda.</Text>
        </View>
      )}

      <View
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          backgroundColor: '#fff',
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 10,
          paddingVertical: 10,
          marginBottom: 10,
        }}
      >
        <Feather name="search" size={16} color="#64748b" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={
            mode === 'CLASSES'
              ? 'Cari kelas, jurusan, wali kelas...'
              : mode === 'PKL'
                ? 'Cari siswa, kelas, perusahaan...'
                : 'Cari mitra atau lowongan...'
          }
          style={{ flex: 1, marginLeft: 8, color: '#0f172a' }}
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
        />
      </View>

      {mode === 'PKL' ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Filter Status PKL</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <FilterChip active={statusFilter === 'ALL'} label="Semua" onPress={() => setStatusFilter('ALL')} />
            <FilterChip active={statusFilter === 'PENDING'} label="Menunggu" onPress={() => setStatusFilter('PENDING')} />
            <FilterChip active={statusFilter === 'ONGOING'} label="Berjalan" onPress={() => setStatusFilter('ONGOING')} />
            <FilterChip active={statusFilter === 'DONE'} label="Selesai" onPress={() => setStatusFilter('DONE')} />
          </View>
        </View>
      ) : null}

      {mode === 'PARTNERS' ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Tipe Data</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <FilterChip active={partnerTab === 'PARTNERS'} label="Mitra Industri" onPress={() => setPartnerTab('PARTNERS')} />
            <FilterChip active={partnerTab === 'VACANCIES'} label="Informasi BKK" onPress={() => setPartnerTab('VACANCIES')} />
          </View>
        </View>
      ) : null}

      {mode === 'PARTNERS' ? (
        partnerTab === 'PARTNERS' ? (
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
              {editingPartnerId ? 'Edit Mitra Industri' : 'Tambah Mitra Industri'}
            </Text>

            <TextInput
              value={partnerForm.name}
              onChangeText={(value) => setPartnerForm((prev) => ({ ...prev, name: value }))}
              placeholder="Nama perusahaan *"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 10,
                color: '#0f172a',
                marginBottom: 8,
              }}
              placeholderTextColor="#94a3b8"
            />

            <TextInput
              value={partnerForm.address}
              onChangeText={(value) => setPartnerForm((prev) => ({ ...prev, address: value }))}
              placeholder="Alamat *"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 10,
                color: '#0f172a',
                marginBottom: 8,
              }}
              placeholderTextColor="#94a3b8"
              multiline
            />

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <TextInput
                value={partnerForm.city}
                onChangeText={(value) => setPartnerForm((prev) => ({ ...prev, city: value }))}
                placeholder="Kota/Kabupaten"
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 10,
                  color: '#0f172a',
                }}
                placeholderTextColor="#94a3b8"
              />
              <TextInput
                value={partnerForm.sector}
                onChangeText={(value) => setPartnerForm((prev) => ({ ...prev, sector: value }))}
                placeholder="Bidang usaha"
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 10,
                  color: '#0f172a',
                }}
                placeholderTextColor="#94a3b8"
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <TextInput
                value={partnerForm.contactPerson}
                onChangeText={(value) => setPartnerForm((prev) => ({ ...prev, contactPerson: value }))}
                placeholder="Contact person"
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 10,
                  color: '#0f172a',
                }}
                placeholderTextColor="#94a3b8"
              />
              <TextInput
                value={partnerForm.phone}
                onChangeText={(value) => setPartnerForm((prev) => ({ ...prev, phone: value }))}
                placeholder="No telepon"
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 10,
                  color: '#0f172a',
                }}
                placeholderTextColor="#94a3b8"
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <TextInput
                value={partnerForm.email}
                onChangeText={(value) => setPartnerForm((prev) => ({ ...prev, email: value }))}
                placeholder="Email"
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 10,
                  color: '#0f172a',
                }}
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
              />
              <TextInput
                value={partnerForm.website}
                onChangeText={(value) => setPartnerForm((prev) => ({ ...prev, website: value }))}
                placeholder="Website"
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 10,
                  color: '#0f172a',
                }}
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
              />
            </View>

            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6, marginTop: 2 }}>
              Status Kerja Sama
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <FilterChip
                active={partnerForm.cooperationStatus === 'AKTIF'}
                label="Aktif"
                onPress={() => setPartnerForm((prev) => ({ ...prev, cooperationStatus: 'AKTIF' }))}
              />
              <FilterChip
                active={partnerForm.cooperationStatus === 'NON_AKTIF'}
                label="Non Aktif"
                onPress={() => setPartnerForm((prev) => ({ ...prev, cooperationStatus: 'NON_AKTIF' }))}
              />
              <FilterChip
                active={partnerForm.cooperationStatus === 'PROSES'}
                label="Proses"
                onPress={() => setPartnerForm((prev) => ({ ...prev, cooperationStatus: 'PROSES' }))}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => savePartnerMutation.mutate()}
                disabled={savePartnerMutation.isPending}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  paddingVertical: 11,
                  alignItems: 'center',
                  backgroundColor: BRAND_COLORS.blue,
                  opacity: savePartnerMutation.isPending ? 0.7 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {savePartnerMutation.isPending ? 'Menyimpan...' : editingPartnerId ? 'Simpan Perubahan' : 'Tambah Mitra'}
                </Text>
              </Pressable>
              {editingPartnerId ? (
                <Pressable
                  onPress={() => {
                    setEditingPartnerId(null);
                    setPartnerForm(DEFAULT_PARTNER_FORM);
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingVertical: 11,
                    paddingHorizontal: 14,
                    alignItems: 'center',
                    backgroundColor: '#fff',
                  }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : (
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
              {editingVacancyId ? 'Edit Lowongan BKK' : 'Tambah Lowongan BKK'}
            </Text>

            <TextInput
              value={vacancyForm.title}
              onChangeText={(value) => setVacancyForm((prev) => ({ ...prev, title: value }))}
              placeholder="Judul lowongan *"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 10,
                color: '#0f172a',
                marginBottom: 8,
              }}
              placeholderTextColor="#94a3b8"
            />

            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
              Mitra Industri (opsional)
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <FilterChip
                  active={!vacancyForm.industryPartnerId}
                  label="Perusahaan Umum"
                  onPress={() => setVacancyForm((prev) => ({ ...prev, industryPartnerId: '' }))}
                />
                {activePartnerOptions.map((partner) => (
                  <FilterChip
                    key={partner.id}
                    active={vacancyForm.industryPartnerId === String(partner.id)}
                    label={partner.name}
                    onPress={() =>
                      setVacancyForm((prev) => ({
                        ...prev,
                        industryPartnerId: prev.industryPartnerId === String(partner.id) ? '' : String(partner.id),
                      }))
                    }
                  />
                ))}
              </View>
            </ScrollView>

            {!vacancyForm.industryPartnerId ? (
              <TextInput
                value={vacancyForm.companyName}
                onChangeText={(value) => setVacancyForm((prev) => ({ ...prev, companyName: value }))}
                placeholder="Nama perusahaan *"
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 10,
                  color: '#0f172a',
                  marginBottom: 8,
                }}
                placeholderTextColor="#94a3b8"
              />
            ) : null}

            <TextInput
              value={vacancyForm.description}
              onChangeText={(value) => setVacancyForm((prev) => ({ ...prev, description: value }))}
              placeholder="Deskripsi lowongan"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 10,
                color: '#0f172a',
                marginBottom: 8,
              }}
              placeholderTextColor="#94a3b8"
              multiline
            />

            <TextInput
              value={vacancyForm.requirements}
              onChangeText={(value) => setVacancyForm((prev) => ({ ...prev, requirements: value }))}
              placeholder="Persyaratan"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 10,
                color: '#0f172a',
                marginBottom: 8,
              }}
              placeholderTextColor="#94a3b8"
              multiline
            />

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <TextInput
                value={vacancyForm.deadline}
                onChangeText={(value) => setVacancyForm((prev) => ({ ...prev, deadline: value }))}
                placeholder="Batas (YYYY-MM-DD)"
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 10,
                  color: '#0f172a',
                }}
                placeholderTextColor="#94a3b8"
              />
              <TextInput
                value={vacancyForm.registrationLink}
                onChangeText={(value) => setVacancyForm((prev) => ({ ...prev, registrationLink: value }))}
                placeholder="Link pendaftaran"
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 10,
                  color: '#0f172a',
                }}
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <FilterChip
                active={vacancyForm.isOpen}
                label="Status Dibuka"
                onPress={() => setVacancyForm((prev) => ({ ...prev, isOpen: true }))}
              />
              <FilterChip
                active={!vacancyForm.isOpen}
                label="Status Ditutup"
                onPress={() => setVacancyForm((prev) => ({ ...prev, isOpen: false }))}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => saveVacancyMutation.mutate()}
                disabled={saveVacancyMutation.isPending}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  paddingVertical: 11,
                  alignItems: 'center',
                  backgroundColor: BRAND_COLORS.blue,
                  opacity: saveVacancyMutation.isPending ? 0.7 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {saveVacancyMutation.isPending ? 'Menyimpan...' : editingVacancyId ? 'Simpan Perubahan' : 'Tambah Lowongan'}
                </Text>
              </Pressable>
              {editingVacancyId ? (
                <Pressable
                  onPress={() => {
                    setEditingVacancyId(null);
                    setVacancyForm(DEFAULT_VACANCY_FORM);
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingVertical: 11,
                    paddingHorizontal: 14,
                    alignItems: 'center',
                    backgroundColor: '#fff',
                  }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )
      ) : null}

      {anyLoading ? <QueryStateView type="loading" message="Memuat data modul..." /> : null}
      {anyError ? <QueryStateView type="error" message="Gagal memuat data modul." onRetry={refreshAll} /> : null}

      {!anyLoading && !anyError ? (
        <>
          {mode === 'CLASSES'
            ? classRows.length > 0
              ? classRows.map((item) => <ClassListCard key={item.id} item={item} />)
              : (
                <EmptyStateCard message="Belum ada data kelas kompetensi untuk filter saat ini." />
              )
            : null}

          {mode === 'PKL'
            ? internshipRows.length > 0
              ? internshipRows.map((item) => <InternshipListCard key={item.id} item={item} />)
              : (
                <EmptyStateCard message="Belum ada data monitoring PKL untuk filter saat ini." />
              )
            : null}

          {mode === 'PARTNERS'
            ? partnerTab === 'PARTNERS'
              ? partnerRows.length > 0
                ? partnerRows.map((item) => (
                    <PartnerListCard
                      key={item.id}
                      item={item}
                      onEdit={editPartner}
                      onDelete={askDeletePartner}
                      deletePending={deletePartnerMutation.isPending}
                    />
                  ))
                : <EmptyStateCard message="Belum ada data mitra industri." />
              : vacancyRows.length > 0
                ? vacancyRows.map((item) => (
                    <VacancyListCard
                      key={item.id}
                      item={item}
                      onEdit={editVacancy}
                      onDelete={askDeleteVacancy}
                      deletePending={deleteVacancyMutation.isPending}
                    />
                  ))
                : <EmptyStateCard message="Belum ada data lowongan BKK." />
            : null}
        </>
      ) : null}

    </ScrollView>
  );
}
