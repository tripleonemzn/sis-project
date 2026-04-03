import { useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../components/AppLoadingScreen';
import { MobileMenuTabBar } from '../../components/MobileMenuTabBar';
import { MobileSelectField } from '../../components/MobileSelectField';
import { MobileSummaryCard as SummaryCard } from '../../components/MobileSummaryCard';
import { QueryStateView } from '../../components/QueryStateView';
import { BRAND_COLORS } from '../../config/brand';
import { mobileLiveQueryOptions } from '../../lib/query/liveQuery';
import { getStandardPagePadding } from '../../lib/ui/pageLayout';
import { useAuth } from '../auth/AuthProvider';
import { humasApi } from './humasApi';
import {
  HumasInternshipRow,
  HumasJournalRow,
  HumasPartnerRow,
  HumasVacancyRow,
  InternshipAssessmentComponentRow,
  PklEligibleGrades,
} from './types';

type ModuleMode = 'SETTINGS' | 'APPROVAL' | 'COMPONENTS' | 'JOURNALS' | 'PARTNERS' | 'REPORTS';
type ApprovalStatusFilter =
  | 'ALL'
  | 'PROPOSED'
  | 'WAITING_ACCEPTANCE_LETTER'
  | 'APPROVED'
  | 'ACTIVE'
  | 'REPORT_SUBMITTED'
  | 'DEFENSE_SCHEDULED'
  | 'DEFENSE_COMPLETED'
  | 'REJECTED';
type PartnerTab = 'PARTNERS' | 'VACANCIES';
type JournalStatusFilter = 'ALL' | 'VERIFIED' | 'REJECTED' | 'PENDING';
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

const APPROVAL_STATUS_OPTIONS: Array<{ value: ApprovalStatusFilter; label: string }> = [
  { value: 'ALL', label: 'Semua Status' },
  { value: 'PROPOSED', label: 'Diajukan' },
  { value: 'WAITING_ACCEPTANCE_LETTER', label: 'Menunggu Surat' },
  { value: 'APPROVED', label: 'Disetujui' },
  { value: 'ACTIVE', label: 'Aktif PKL' },
  { value: 'REJECTED', label: 'Ditolak' },
];

const JOURNAL_STATUS_OPTIONS: Array<{ value: JournalStatusFilter; label: string }> = [
  { value: 'ALL', label: 'Semua Status' },
  { value: 'PENDING', label: 'Menunggu Verifikasi' },
  { value: 'VERIFIED', label: 'Terverifikasi' },
  { value: 'REJECTED', label: 'Ditolak' },
];

const PARTNER_TAB_ITEMS = [
  { key: 'PARTNERS', label: 'Mitra Industri', iconName: 'users' as const },
  { key: 'VACANCIES', label: 'Lowongan BKK', iconName: 'briefcase' as const },
];

const PKL_GRADE_OPTIONS: Array<{ value: PklEligibleGrades; label: string }> = [
  { value: 'XI', label: 'Kelas XI' },
  { value: 'XII', label: 'Kelas XII' },
  { value: 'XI, XII', label: 'XI & XII' },
];

const COOPERATION_STATUS_OPTIONS: Array<{ value: PartnerStatus; label: string }> = [
  { value: 'AKTIF', label: 'Aktif' },
  { value: 'NON_AKTIF', label: 'Non Aktif' },
  { value: 'PROSES', label: 'Proses' },
];

const VACANCY_STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Dibuka' },
  { value: 'CLOSED', label: 'Ditutup' },
] as const;

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

function hasHumasDuty(duties?: string[]) {
  if (!Array.isArray(duties)) return false;
  return duties.some((duty) => {
    const normalized = normalizeDuty(duty);
    return normalized === 'WAKASEK_HUMAS' || normalized === 'SEKRETARIS_HUMAS';
  });
}

const getActionErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null) {
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    return err.response?.data?.message || err.message || fallback;
  }
  return fallback;
};

function resolveInternshipStatusLabel(status?: string | null) {
  const value = String(status || '').toUpperCase();
  if (!value) return 'Unknown';
  if (value === 'PROPOSED') return 'Diajukan';
  if (value === 'WAITING_ACCEPTANCE_LETTER') return 'Menunggu Surat';
  if (value === 'APPROVED') return 'Disetujui';
  if (value === 'ACTIVE') return 'Aktif PKL';
  if (value === 'REPORT_SUBMITTED') return 'Laporan Masuk';
  if (value === 'DEFENSE_SCHEDULED') return 'Sidang Dijadwalkan';
  if (value === 'DEFENSE_COMPLETED') return 'Sidang Selesai';
  if (value === 'COMPLETED') return 'Selesai';
  if (value === 'REJECTED') return 'Ditolak';
  return value;
}

function resolveInternshipStatusStyle(status?: string | null) {
  const value = String(status || '').toUpperCase();
  if (['APPROVED', 'ACTIVE', 'REPORT_SUBMITTED', 'DEFENSE_SCHEDULED'].includes(value)) {
    return { text: '#1d4ed8', border: '#93c5fd', bg: '#dbeafe' };
  }
  if (['DEFENSE_COMPLETED', 'COMPLETED'].includes(value)) {
    return { text: '#166534', border: '#86efac', bg: '#dcfce7' };
  }
  if (value === 'REJECTED') {
    return { text: '#991b1b', border: '#fca5a5', bg: '#fee2e2' };
  }
  return { text: '#92400e', border: '#fcd34d', bg: '#fef3c7' };
}

function resolveJournalStatus(status?: string | null): JournalStatusFilter {
  const value = String(status || '').toUpperCase();
  if (value === 'VERIFIED') return 'VERIFIED';
  if (value === 'REJECTED') return 'REJECTED';
  return 'PENDING';
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

function modeIcon(mode: ModuleMode): keyof typeof Feather.glyphMap {
  if (mode === 'SETTINGS') return 'settings';
  if (mode === 'APPROVAL') return 'check-square';
  if (mode === 'COMPONENTS') return 'sliders';
  if (mode === 'JOURNALS') return 'book-open';
  if (mode === 'PARTNERS') return 'users';
  return 'bar-chart-2';
}

export function TeacherHumasModuleScreen({
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
  const [approvalFilter, setApprovalFilter] = useState<ApprovalStatusFilter>('ALL');
  const [selectedPklGrade, setSelectedPklGrade] = useState<PklEligibleGrades>('XI');
  const [componentName, setComponentName] = useState('');
  const [componentWeight, setComponentWeight] = useState('');
  const [componentDescription, setComponentDescription] = useState('');
  const [partnerTab, setPartnerTab] = useState<PartnerTab>('PARTNERS');
  const [editingPartnerId, setEditingPartnerId] = useState<number | null>(null);
  const [partnerForm, setPartnerForm] = useState<PartnerFormState>(DEFAULT_PARTNER_FORM);
  const [editingVacancyId, setEditingVacancyId] = useState<number | null>(null);
  const [vacancyForm, setVacancyForm] = useState<VacancyFormState>(DEFAULT_VACANCY_FORM);
  const [selectedInternshipId, setSelectedInternshipId] = useState<number | null>(null);
  const [journalStatusFilter, setJournalStatusFilter] = useState<JournalStatusFilter>('ALL');

  const isAllowedRole = user?.role === 'TEACHER' && hasHumasDuty(user?.additionalDuties);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-humas-active-year'],
    enabled: isAuthenticated && !!isAllowedRole,
    queryFn: async () => humasApi.getActiveAcademicYear(),
  });

  const internshipQuery = useQuery({
    queryKey: ['mobile-humas-internships', activeYearQuery.data?.id],
    enabled:
      isAuthenticated &&
      !!isAllowedRole &&
      ['APPROVAL', 'JOURNALS', 'REPORTS'].includes(mode),
    queryFn: async () =>
      humasApi.listInternships({
        page: 1,
        limit: 300,
        academicYearId: activeYearQuery.data?.id,
      }),
    ...mobileLiveQueryOptions,
  });

  const componentsQuery = useQuery({
    queryKey: ['mobile-humas-components'],
    enabled: isAuthenticated && !!isAllowedRole && ['COMPONENTS', 'REPORTS'].includes(mode),
    queryFn: async () => humasApi.listAssessmentComponents(),
  });

  const partnersQuery = useQuery({
    queryKey: ['mobile-humas-partners'],
    enabled: isAuthenticated && !!isAllowedRole && ['PARTNERS', 'REPORTS'].includes(mode),
    queryFn: async () => humasApi.listPartners(),
  });

  const vacanciesQuery = useQuery({
    queryKey: ['mobile-humas-vacancies'],
    enabled: isAuthenticated && !!isAllowedRole && ['PARTNERS', 'REPORTS'].includes(mode),
    queryFn: async () => humasApi.listVacancies(),
  });

  const journalsQuery = useQuery({
    queryKey: ['mobile-humas-journals', selectedInternshipId],
    enabled: isAuthenticated && !!isAllowedRole && mode === 'JOURNALS' && !!selectedInternshipId,
    queryFn: async () => humasApi.listJournals(Number(selectedInternshipId)),
    ...mobileLiveQueryOptions,
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (grade: PklEligibleGrades) => humasApi.updatePklConfig(grade),
    onSuccess: () => {
      Alert.alert('Berhasil', 'Konfigurasi PKL berhasil diperbarui.');
      void activeYearQuery.refetch();
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getActionErrorMessage(error, 'Tidak dapat menyimpan konfigurasi PKL.'));
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (payload: { id: number; status: 'APPROVED' | 'REJECTED'; rejectionReason?: string }) =>
      humasApi.updateInternshipStatus(payload.id, payload),
    onSuccess: () => {
      Alert.alert('Berhasil', 'Status PKL berhasil diperbarui.');
      void internshipQuery.refetch();
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getActionErrorMessage(error, 'Tidak dapat memperbarui status PKL.'));
    },
  });

  const createComponentMutation = useMutation({
    mutationFn: async () => {
      const weight = Number(componentWeight);
      if (!componentName.trim()) throw new Error('Nama komponen wajib diisi.');
      if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
        throw new Error('Bobot harus angka 1-100.');
      }

      return humasApi.createAssessmentComponent({
        name: componentName.trim(),
        description: componentDescription.trim() || undefined,
        weight,
        isActive: true,
      });
    },
    onSuccess: () => {
      Alert.alert('Berhasil', 'Komponen penilaian berhasil ditambahkan.');
      setComponentName('');
      setComponentWeight('');
      setComponentDescription('');
      void componentsQuery.refetch();
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getActionErrorMessage(error, 'Tidak dapat menambah komponen.'));
    },
  });

  const toggleComponentMutation = useMutation({
    mutationFn: async (component: InternshipAssessmentComponentRow) =>
      humasApi.updateAssessmentComponent(component.id, {
        isActive: !component.isActive,
      }),
    onSuccess: () => {
      void componentsQuery.refetch();
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getActionErrorMessage(error, 'Tidak dapat mengubah status komponen.'));
    },
  });

  const updateJournalMutation = useMutation({
    mutationFn: async (payload: { id: number; status: 'VERIFIED' | 'REJECTED' }) =>
      humasApi.updateJournalStatus(payload.id, {
        status: payload.status,
        feedback: payload.status === 'REJECTED' ? 'Perlu revisi jurnal dari aplikasi mobile.' : undefined,
      }),
    onSuccess: () => {
      void journalsQuery.refetch();
      Alert.alert('Berhasil', 'Status jurnal berhasil diperbarui.');
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getActionErrorMessage(error, 'Tidak dapat memperbarui status jurnal.'));
    },
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
        return humasApi.updatePartner(editingPartnerId, payload);
      }

      return humasApi.createPartner(payload);
    },
    onSuccess: () => {
      Alert.alert('Berhasil', editingPartnerId ? 'Mitra berhasil diperbarui.' : 'Mitra berhasil ditambahkan.');
      setEditingPartnerId(null);
      setPartnerForm(DEFAULT_PARTNER_FORM);
      void partnersQuery.refetch();
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getActionErrorMessage(error, 'Tidak dapat menyimpan data mitra.'));
    },
  });

  const deletePartnerMutation = useMutation({
    mutationFn: async (partnerId: number) => humasApi.removePartner(partnerId),
    onSuccess: () => {
      Alert.alert('Berhasil', 'Mitra berhasil dihapus.');
      if (editingPartnerId) {
        setEditingPartnerId(null);
        setPartnerForm(DEFAULT_PARTNER_FORM);
      }
      void partnersQuery.refetch();
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getActionErrorMessage(error, 'Tidak dapat menghapus data mitra.'));
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
        return humasApi.updateVacancy(editingVacancyId, payload);
      }

      return humasApi.createVacancy(payload);
    },
    onSuccess: () => {
      Alert.alert('Berhasil', editingVacancyId ? 'Lowongan berhasil diperbarui.' : 'Lowongan berhasil ditambahkan.');
      setEditingVacancyId(null);
      setVacancyForm(DEFAULT_VACANCY_FORM);
      void vacanciesQuery.refetch();
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getActionErrorMessage(error, 'Tidak dapat menyimpan data lowongan.'));
    },
  });

  const deleteVacancyMutation = useMutation({
    mutationFn: async (vacancyId: number) => humasApi.removeVacancy(vacancyId),
    onSuccess: () => {
      Alert.alert('Berhasil', 'Lowongan berhasil dihapus.');
      if (editingVacancyId) {
        setEditingVacancyId(null);
        setVacancyForm(DEFAULT_VACANCY_FORM);
      }
      void vacanciesQuery.refetch();
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getActionErrorMessage(error, 'Tidak dapat menghapus data lowongan.'));
    },
  });

  const internshipRows = useMemo(() => {
    const rows = internshipQuery.data || [];
    const term = search.trim().toLowerCase();

    return rows
      .filter((item) => {
        if (approvalFilter === 'ALL') return true;
        return String(item.status || '').toUpperCase() === approvalFilter;
      })
      .filter((item) => {
        if (!term) return true;
        const values = [
          item.student?.name || '',
          item.student?.studentClass?.name || '',
          item.companyName || '',
          item.status || '',
        ];
        return values.some((value) => value.toLowerCase().includes(term));
      })
      .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
  }, [internshipQuery.data, search, approvalFilter]);

  const internshipCandidatesForJournal = useMemo(() => {
    const rows = internshipQuery.data || [];
    const term = search.trim().toLowerCase();

    return rows
      .filter((item) => ['APPROVED', 'ACTIVE', 'REPORT_SUBMITTED', 'DEFENSE_SCHEDULED'].includes(String(item.status || '').toUpperCase()))
      .filter((item) => {
        if (!term) return true;
        const values = [item.student?.name || '', item.companyName || '', item.student?.studentClass?.name || ''];
        return values.some((value) => value.toLowerCase().includes(term));
      })
      .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
  }, [internshipQuery.data, search]);

  const journals = useMemo(() => {
    const rows = journalsQuery.data || [];
    return rows.filter((item) => {
      if (journalStatusFilter === 'ALL') return true;
      return resolveJournalStatus(item.status) === journalStatusFilter;
    });
  }, [journalsQuery.data, journalStatusFilter]);

  const partners = useMemo(() => {
    const rows = partnersQuery.data || [];
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((item) => {
      const values = [item.name || '', item.address || '', item.city || '', item.sector || '', item.cooperationStatus || ''];
      return values.some((value) => value.toLowerCase().includes(term));
    });
  }, [partnersQuery.data, search]);

  const vacancies = useMemo(() => {
    const rows = vacanciesQuery.data || [];
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((item) => {
      const values = [item.title || '', item.companyName || '', item.industryPartner?.name || '', item.description || ''];
      return values.some((value) => value.toLowerCase().includes(term));
    });
  }, [vacanciesQuery.data, search]);

  const activePartnerOptions = useMemo(() => {
    const rows = partnersQuery.data || [];
    return rows.filter((item) => String(item.cooperationStatus || '').toUpperCase() === 'AKTIF');
  }, [partnersQuery.data]);

  const activePartnerSelectOptions = useMemo(
    () => [
      { value: '', label: 'Perusahaan Umum' },
      ...activePartnerOptions.map((partner) => ({
        value: String(partner.id),
        label: partner.name,
      })),
    ],
    [activePartnerOptions],
  );

  const editPartner = (item: HumasPartnerRow) => {
    setEditingPartnerId(item.id);
    setPartnerForm({
      name: String(item.name || ''),
      address: String(item.address || ''),
      city: String(item.city || ''),
      sector: String(item.sector || ''),
      contactPerson: String(item.contactPerson || ''),
      phone: String(item.phone || ''),
      email: String(item.email || ''),
      website: String(item.website || ''),
      cooperationStatus:
        String(item.cooperationStatus || '').toUpperCase() === 'AKTIF'
          ? 'AKTIF'
          : String(item.cooperationStatus || '').toUpperCase() === 'NON_AKTIF'
            ? 'NON_AKTIF'
            : 'PROSES',
    });
  };

  const askDeletePartner = (item: HumasPartnerRow) => {
    Alert.alert('Hapus Mitra', `Hapus mitra "${item.name}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => deletePartnerMutation.mutate(item.id),
      },
    ]);
  };

  const editVacancy = (item: HumasVacancyRow) => {
    setEditingVacancyId(item.id);
    const isoDeadline = item.deadline ? new Date(item.deadline) : null;
    const parsedDeadline =
      isoDeadline && !Number.isNaN(isoDeadline.getTime())
        ? `${isoDeadline.getUTCFullYear()}-${String(isoDeadline.getUTCMonth() + 1).padStart(2, '0')}-${String(
            isoDeadline.getUTCDate(),
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

  const askDeleteVacancy = (item: HumasVacancyRow) => {
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
    const internshipAll = internshipQuery.data || [];
    const components = componentsQuery.data || [];
    const partnersRows = partnersQuery.data || [];
    const vacanciesRows = vacanciesQuery.data || [];

    const internshipPending = internshipAll.filter((item) => {
      const status = String(item.status || '').toUpperCase();
      return status === 'PROPOSED' || status === 'WAITING_ACCEPTANCE_LETTER';
    }).length;

    const internshipRejected = internshipAll.filter((item) => String(item.status || '').toUpperCase() === 'REJECTED').length;
    const internshipApproved = internshipAll.filter((item) => {
      const status = String(item.status || '').toUpperCase();
      return ['APPROVED', 'ACTIVE', 'REPORT_SUBMITTED', 'DEFENSE_SCHEDULED', 'DEFENSE_COMPLETED', 'COMPLETED'].includes(status);
    }).length;

    const activeComponents = components.filter((item) => item.isActive);
    const activeWeight = activeComponents.reduce((acc, item) => acc + Number(item.weight || 0), 0);

    const openVacancies = vacanciesRows.filter((item) => item.isOpen).length;

    return {
      internshipTotal: internshipAll.length,
      internshipPending,
      internshipApproved,
      internshipRejected,
      componentsTotal: components.length,
      activeComponents: activeComponents.length,
      activeWeight,
      partnersTotal: partnersRows.length,
      vacanciesTotal: vacanciesRows.length,
      openVacancies,
    };
  }, [internshipQuery.data, componentsQuery.data, partnersQuery.data, vacanciesQuery.data]);

  const anyLoading =
    activeYearQuery.isLoading ||
    internshipQuery.isLoading ||
    componentsQuery.isLoading ||
    partnersQuery.isLoading ||
    vacanciesQuery.isLoading;

  const anyError =
    activeYearQuery.isError ||
    internshipQuery.isError ||
    componentsQuery.isError ||
    partnersQuery.isError ||
    vacanciesQuery.isError;

  const refreshAll = () => {
    void activeYearQuery.refetch();
    void internshipQuery.refetch();
    void componentsQuery.refetch();
    void partnersQuery.refetch();
    void vacanciesQuery.refetch();
    if (selectedInternshipId) void journalsQuery.refetch();
  };

  const requestUpdateStatus = (item: HumasInternshipRow, status: 'APPROVED' | 'REJECTED') => {
    const actionLabel = status === 'APPROVED' ? 'setujui' : 'tolak';
    Alert.alert('Konfirmasi', `Anda yakin ingin ${actionLabel} pengajuan PKL ini?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: status === 'APPROVED' ? 'Setujui' : 'Tolak',
        style: status === 'APPROVED' ? 'default' : 'destructive',
        onPress: () => {
          void updateStatusMutation.mutateAsync({
            id: item.id,
            status,
            rejectionReason: status === 'REJECTED' ? 'Ditolak melalui aplikasi mobile.' : undefined,
          });
        },
      },
    ]);
  };

  const requestJournalStatus = (item: HumasJournalRow, status: 'VERIFIED' | 'REJECTED') => {
    Alert.alert('Konfirmasi', `Ubah status jurnal menjadi ${status === 'VERIFIED' ? 'VERIFIED' : 'REJECTED'}?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Lanjut',
        onPress: () => {
          void updateJournalMutation.mutateAsync({ id: item.id, status });
        },
      },
    ]);
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
        <QueryStateView type="error" message="Akses modul ini membutuhkan tugas tambahan Wakasek Humas." />
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

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <View style={{ flexBasis: '31%', flexGrow: 1 }}>
          <SummaryCard
            title={mode === 'COMPONENTS' ? 'Komponen Aktif' : mode === 'PARTNERS' ? 'Mitra Industri' : 'Total PKL'}
            value={
              mode === 'COMPONENTS'
                ? String(summary.activeComponents)
                : mode === 'PARTNERS'
                  ? String(summary.partnersTotal)
                : String(summary.internshipTotal)
            }
            subtitle={
              mode === 'COMPONENTS'
                ? `Bobot aktif ${summary.activeWeight}%`
                : mode === 'PARTNERS'
                  ? 'Data kemitraan'
                  : 'Data lintas status'
            }
            iconName={mode === 'COMPONENTS' ? 'sliders' : mode === 'PARTNERS' ? 'users' : 'briefcase'}
            accentColor={mode === 'COMPONENTS' ? '#7c3aed' : mode === 'PARTNERS' ? '#0f766e' : '#2563eb'}
          />
        </View>
        <View style={{ flexBasis: '31%', flexGrow: 1 }}>
          <SummaryCard
            title={mode === 'PARTNERS' ? 'Lowongan Aktif' : mode === 'COMPONENTS' ? 'Total Komponen' : 'Menunggu'}
            value={
              mode === 'PARTNERS'
                ? String(summary.openVacancies)
                : mode === 'COMPONENTS'
                ? String(summary.componentsTotal)
                  : String(summary.internshipPending)
            }
            subtitle={mode === 'PARTNERS' ? 'BKK terbuka' : mode === 'COMPONENTS' ? 'Komponen tersimpan' : 'Perlu tindak lanjut'}
            iconName={mode === 'PARTNERS' ? 'briefcase' : mode === 'COMPONENTS' ? 'layers' : 'clock'}
            accentColor={mode === 'PARTNERS' ? '#ea580c' : mode === 'COMPONENTS' ? '#7c3aed' : '#2563eb'}
          />
        </View>
        <View style={{ flexBasis: '31%', flexGrow: 1 }}>
          <SummaryCard
            title={mode === 'PARTNERS' ? 'Total Lowongan' : 'Ditolak'}
            value={mode === 'PARTNERS' ? String(summary.vacanciesTotal) : String(summary.internshipRejected)}
            subtitle={mode === 'PARTNERS' ? 'Data lowongan' : 'Pengajuan ditolak'}
            iconName={mode === 'PARTNERS' ? 'archive' : 'x-circle'}
            accentColor={mode === 'PARTNERS' ? '#9333ea' : '#dc2626'}
          />
        </View>
      </View>

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
          placeholder="Cari data modul..."
          style={{ flex: 1, marginLeft: 8, color: '#0f172a' }}
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
        />
      </View>

      {mode === 'APPROVAL' ? (
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
          <MobileSelectField
            label="Filter Status Pengajuan"
            value={approvalFilter}
            options={APPROVAL_STATUS_OPTIONS}
            onChange={(value) => setApprovalFilter(value as ApprovalStatusFilter)}
            placeholder="Pilih status pengajuan"
          />
        </View>
      ) : null}

      {mode === 'JOURNALS' ? (
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
          <MobileSelectField
            label="Filter Status Jurnal"
            value={journalStatusFilter}
            options={JOURNAL_STATUS_OPTIONS}
            onChange={(value) => setJournalStatusFilter(value as JournalStatusFilter)}
            placeholder="Pilih status jurnal"
          />
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
          <MobileMenuTabBar
            items={PARTNER_TAB_ITEMS}
            activeKey={partnerTab}
            onChange={(key) => setPartnerTab(key as PartnerTab)}
            minTabWidth={112}
            maxTabWidth={136}
          />
        </View>
      ) : null}

      {anyLoading ? <QueryStateView type="loading" message="Memuat data modul..." /> : null}
      {anyError ? <QueryStateView type="error" message="Gagal memuat data modul." onRetry={refreshAll} /> : null}

      {!anyLoading && !anyError ? (
        <>
          {mode === 'SETTINGS' ? (
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
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Konfigurasi PKL</Text>
              <Text style={{ color: '#64748b', marginTop: 2, marginBottom: 10 }}>
                Kelas PKL berjalan: {activeYearQuery.data?.pklEligibleGrades || '-'}
              </Text>

              <MobileSelectField
                label="Kelas PKL Aktif"
                value={selectedPklGrade}
                options={PKL_GRADE_OPTIONS}
                onChange={(value) => setSelectedPklGrade(value as PklEligibleGrades)}
                placeholder="Pilih kelas PKL"
              />

              <Pressable
                onPress={() => {
                  void updateConfigMutation.mutateAsync(selectedPklGrade);
                }}
                disabled={updateConfigMutation.isPending}
                style={{
                  backgroundColor: BRAND_COLORS.blue,
                  borderRadius: 10,
                  paddingVertical: 11,
                  alignItems: 'center',
                  opacity: updateConfigMutation.isPending ? 0.7 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {updateConfigMutation.isPending ? 'Menyimpan...' : 'Simpan Konfigurasi'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {mode === 'APPROVAL' ? (
            internshipRows.length > 0 ? (
              internshipRows.map((item) => {
                const badge = resolveInternshipStatusStyle(item.status);
                const statusLabel = resolveInternshipStatusLabel(item.status);
                const upperStatus = String(item.status || '').toUpperCase();
                const canApprove = ['PROPOSED', 'WAITING_ACCEPTANCE_LETTER', 'REJECTED'].includes(upperStatus);
                const canReject = ['PROPOSED', 'WAITING_ACCEPTANCE_LETTER', 'APPROVED', 'ACTIVE'].includes(upperStatus);

                return (
                  <View
                    key={item.id}
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
                          {toText(item.student?.studentClass?.name)} • {toText(item.companyName)}
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
                        <Text style={{ color: badge.text, fontWeight: '700', fontSize: 11 }}>{statusLabel}</Text>
                      </View>
                    </View>

                    <Text style={{ color: '#334155', fontSize: 12, marginTop: 8 }}>
                      Mentor: {toText(item.mentorName)} • Pembimbing: {toText(item.teacher?.name)}
                    </Text>
                    <Text style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                      Diajukan: {formatDateTime(item.createdAt)}
                    </Text>
                    {item.rejectionReason ? (
                      <Text style={{ color: '#991b1b', fontSize: 11, marginTop: 4 }}>Alasan tolak: {item.rejectionReason}</Text>
                    ) : null}

                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <Pressable
                        onPress={() => requestUpdateStatus(item, 'APPROVED')}
                        disabled={!canApprove || updateStatusMutation.isPending}
                        style={{
                          flex: 1,
                          borderRadius: 8,
                          paddingVertical: 10,
                          alignItems: 'center',
                          backgroundColor: canApprove ? BRAND_COLORS.blue : '#cbd5e1',
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>Setujui</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => requestUpdateStatus(item, 'REJECTED')}
                        disabled={!canReject || updateStatusMutation.isPending}
                        style={{
                          flex: 1,
                          borderRadius: 8,
                          paddingVertical: 10,
                          alignItems: 'center',
                          borderWidth: 1,
                          borderColor: canReject ? '#fca5a5' : '#cbd5e1',
                          backgroundColor: '#fff',
                        }}
                      >
                        <Text style={{ color: canReject ? '#b91c1c' : '#94a3b8', fontWeight: '700' }}>Tolak</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            ) : (
              <EmptyStateCard message="Belum ada data pengajuan PKL untuk filter saat ini." />
            )
          ) : null}

          {mode === 'COMPONENTS' ? (
            <>
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Tambah Komponen Penilaian</Text>

                <TextInput
                  value={componentName}
                  onChangeText={setComponentName}
                  placeholder="Nama komponen"
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
                  value={componentWeight}
                  onChangeText={setComponentWeight}
                  placeholder="Bobot (1-100)"
                  keyboardType="numeric"
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
                  value={componentDescription}
                  onChangeText={setComponentDescription}
                  placeholder="Deskripsi (opsional)"
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                    color: '#0f172a',
                    marginBottom: 10,
                  }}
                  placeholderTextColor="#94a3b8"
                />

                <Pressable
                  onPress={() => {
                    void createComponentMutation.mutateAsync();
                  }}
                  disabled={createComponentMutation.isPending}
                  style={{
                    backgroundColor: BRAND_COLORS.blue,
                    borderRadius: 10,
                    paddingVertical: 11,
                    alignItems: 'center',
                    opacity: createComponentMutation.isPending ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {createComponentMutation.isPending ? 'Menyimpan...' : 'Tambah Komponen'}
                  </Text>
                </Pressable>
              </View>

              {(componentsQuery.data || []).length > 0 ? (
                (componentsQuery.data || []).map((component) => (
                  <View
                    key={component.id}
                    style={{
                      backgroundColor: '#fff',
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{toText(component.name)}</Text>
                    <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>
                      Bobot: {component.weight}% • Status: {component.isActive ? 'Aktif' : 'Nonaktif'}
                    </Text>
                    {component.description ? (
                      <Text style={{ color: '#334155', marginTop: 6, fontSize: 12 }}>{component.description}</Text>
                    ) : null}

                    <Pressable
                      onPress={() => {
                        void toggleComponentMutation.mutateAsync(component);
                      }}
                      disabled={toggleComponentMutation.isPending}
                      style={{
                        marginTop: 10,
                        borderWidth: 1,
                        borderColor: component.isActive ? '#fca5a5' : '#93c5fd',
                        borderRadius: 8,
                        paddingVertical: 9,
                        alignItems: 'center',
                        backgroundColor: '#fff',
                      }}
                    >
                      <Text
                        style={{
                          color: component.isActive ? '#b91c1c' : '#1d4ed8',
                          fontWeight: '700',
                        }}
                      >
                        {component.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      </Text>
                    </Pressable>
                  </View>
                ))
              ) : (
                <EmptyStateCard message="Belum ada komponen penilaian PKL." />
              )}
            </>
          ) : null}

          {mode === 'JOURNALS' ? (
            <>
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Pilih Siswa PKL</Text>
                {internshipCandidatesForJournal.length > 0 ? (
                  internshipCandidatesForJournal.slice(0, 30).map((row) => {
                    const selected = selectedInternshipId === row.id;
                    return (
                      <Pressable
                        key={row.id}
                        onPress={() => setSelectedInternshipId(row.id)}
                        style={{
                          borderWidth: 1,
                          borderColor: selected ? BRAND_COLORS.blue : '#d5e1f5',
                          backgroundColor: selected ? '#e9f1ff' : '#fff',
                          borderRadius: 10,
                          padding: 10,
                          marginBottom: 8,
                        }}
                      >
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{toText(row.student?.name)}</Text>
                        <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>
                          {toText(row.student?.studentClass?.name)} • {toText(row.companyName)}
                        </Text>
                      </Pressable>
                    );
                  })
                ) : (
                  <EmptyStateCard message="Belum ada siswa PKL aktif untuk monitoring jurnal." />
                )}
              </View>

              {selectedInternshipId ? (
                journalsQuery.isLoading ? (
                  <QueryStateView type="loading" message="Memuat jurnal PKL..." />
                ) : journals.length > 0 ? (
                  journals.map((journal) => {
                    const journalStatus = resolveJournalStatus(journal.status);
                    const canApprove = journalStatus !== 'VERIFIED';
                    const canReject = journalStatus !== 'REJECTED';

                    return (
                      <View
                        key={journal.id}
                        style={{
                          backgroundColor: '#fff',
                          borderWidth: 1,
                          borderColor: '#dbe7fb',
                          borderRadius: 12,
                          padding: 12,
                          marginBottom: 10,
                        }}
                      >
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{formatDateTime(journal.date)}</Text>
                        <Text style={{ color: '#334155', marginTop: 6, fontSize: 12 }}>{toText(journal.activity)}</Text>
                        <Text style={{ color: '#64748b', fontSize: 11, marginTop: 6 }}>
                          Status: {journalStatus} {journal.feedback ? `• Catatan: ${journal.feedback}` : ''}
                        </Text>

                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                          <Pressable
                            onPress={() => requestJournalStatus(journal, 'VERIFIED')}
                            disabled={!canApprove || updateJournalMutation.isPending}
                            style={{
                              flex: 1,
                              borderRadius: 8,
                              paddingVertical: 9,
                              alignItems: 'center',
                              backgroundColor: canApprove ? BRAND_COLORS.blue : '#cbd5e1',
                            }}
                          >
                            <Text style={{ color: '#fff', fontWeight: '700' }}>Set Verified</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => requestJournalStatus(journal, 'REJECTED')}
                            disabled={!canReject || updateJournalMutation.isPending}
                            style={{
                              flex: 1,
                              borderRadius: 8,
                              paddingVertical: 9,
                              alignItems: 'center',
                              borderWidth: 1,
                              borderColor: canReject ? '#fca5a5' : '#cbd5e1',
                              backgroundColor: '#fff',
                            }}
                          >
                            <Text style={{ color: canReject ? '#b91c1c' : '#94a3b8', fontWeight: '700' }}>Set Rejected</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <EmptyStateCard message="Belum ada data jurnal PKL pada siswa yang dipilih." />
                )
              ) : null}
            </>
          ) : null}

          {mode === 'PARTNERS' ? (
            <>
              {partnerTab === 'PARTNERS' ? (
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
                  <MobileSelectField
                    label="Status Kerja Sama"
                    value={partnerForm.cooperationStatus}
                    options={COOPERATION_STATUS_OPTIONS}
                    onChange={(value) => setPartnerForm((prev) => ({ ...prev, cooperationStatus: value as PartnerStatus }))}
                    placeholder="Pilih status kerja sama"
                  />

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
                  <MobileSelectField
                    label="Mitra Industri"
                    value={vacancyForm.industryPartnerId}
                    options={activePartnerSelectOptions}
                    onChange={(value) => setVacancyForm((prev) => ({ ...prev, industryPartnerId: value }))}
                    placeholder="Pilih mitra industri"
                    helperText="Pilih Perusahaan Umum bila lowongan tidak terikat ke mitra aktif."
                  />

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

                  <MobileSelectField
                    label="Status Lowongan"
                    value={vacancyForm.isOpen ? 'OPEN' : 'CLOSED'}
                    options={VACANCY_STATUS_OPTIONS.map((option) => ({ ...option }))}
                    onChange={(value) => setVacancyForm((prev) => ({ ...prev, isOpen: value === 'OPEN' }))}
                    placeholder="Pilih status lowongan"
                  />

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
              )}

              {partnerTab === 'PARTNERS'
                ? partners.length > 0
                  ? partners.map((item: HumasPartnerRow) => (
                      <View
                        key={item.id}
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
                          {toText(item.city)} • {toText(item.sector)} • {toText(item.cooperationStatus)}
                        </Text>
                        <Text style={{ color: '#334155', marginTop: 6, fontSize: 12 }}>PIC: {toText(item.contactPerson)}</Text>
                        <Text style={{ color: '#334155', marginTop: 2, fontSize: 12 }}>
                          Kontak: {toText(item.phone || item.email)}
                        </Text>

                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                          <Pressable
                            onPress={() => editPartner(item)}
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
                            onPress={() => askDeletePartner(item)}
                            disabled={deletePartnerMutation.isPending}
                            style={{
                              flex: 1,
                              borderWidth: 1,
                              borderColor: '#fca5a5',
                              borderRadius: 8,
                              paddingVertical: 8,
                              alignItems: 'center',
                              backgroundColor: '#fff',
                              opacity: deletePartnerMutation.isPending ? 0.7 : 1,
                            }}
                          >
                            <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Hapus</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))
                  : <EmptyStateCard message="Belum ada data mitra industri." />
                : vacancies.length > 0
                  ? vacancies.map((item: HumasVacancyRow) => (
                      <View
                        key={item.id}
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
                          {toText(item.companyName || item.industryPartner?.name)} • {item.isOpen ? 'Aktif' : 'Tutup'}
                        </Text>
                        <Text style={{ color: '#334155', marginTop: 6, fontSize: 12 }}>{toText(item.description)}</Text>
                        <Text style={{ color: '#64748b', marginTop: 4, fontSize: 11 }}>
                          Batas: {formatDateTime(item.deadline)}
                        </Text>

                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                          <Pressable
                            onPress={() => editVacancy(item)}
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
                            onPress={() => askDeleteVacancy(item)}
                            disabled={deleteVacancyMutation.isPending}
                            style={{
                              flex: 1,
                              borderWidth: 1,
                              borderColor: '#fca5a5',
                              borderRadius: 8,
                              paddingVertical: 8,
                              alignItems: 'center',
                              backgroundColor: '#fff',
                              opacity: deleteVacancyMutation.isPending ? 0.7 : 1,
                            }}
                          >
                            <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Hapus</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))
                  : <EmptyStateCard message="Belum ada data lowongan BKK." />}
            </>
          ) : null}

          {mode === 'REPORTS' ? (
            <>
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Ringkasan PKL</Text>
                <Text style={{ color: '#334155', fontSize: 12 }}>Total data PKL: {summary.internshipTotal}</Text>
                <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>Menunggu approval: {summary.internshipPending}</Text>
                <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>Disetujui/berjalan: {summary.internshipApproved}</Text>
                <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>Ditolak: {summary.internshipRejected}</Text>
              </View>

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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Ringkasan Kemitraan</Text>
                <Text style={{ color: '#334155', fontSize: 12 }}>Mitra industri: {summary.partnersTotal}</Text>
                <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>Lowongan BKK: {summary.vacanciesTotal}</Text>
                <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>Lowongan aktif: {summary.openVacancies}</Text>
              </View>

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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Ringkasan Komponen Nilai PKL</Text>
                <Text style={{ color: '#334155', fontSize: 12 }}>Total komponen: {summary.componentsTotal}</Text>
                <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>Komponen aktif: {summary.activeComponents}</Text>
                <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>Total bobot aktif: {summary.activeWeight}%</Text>
              </View>
            </>
          ) : null}
        </>
      ) : null}

    </ScrollView>
  );
}
