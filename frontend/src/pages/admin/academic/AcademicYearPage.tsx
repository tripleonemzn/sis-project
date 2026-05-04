import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { academicYearService } from '../../../services/academicYear.service';
import type {
  AcademicFeatureFlags,
  AcademicPromotionRollbackResult,
  AcademicPromotionWorkspace,
  AcademicPromotionWorkspaceClass,
  AcademicYearRolloverApplyResult,
  AcademicYearRolloverComponentSelection,
  AcademicYearRolloverTargetResult,
  AcademicYearRolloverWorkspace,
  AcademicYear,
} from '../../../services/academicYear.service';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarDays, Loader2, Plus, CheckCircle2, Trash2, Edit, Search, ChevronLeft, ChevronRight, GraduationCap, History } from 'lucide-react';
import toast from 'react-hot-toast';
import UnderlineTabBar from '../../../components/navigation/UnderlineTabBar';

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const anyErr = error as {
      response?: {
        data?: {
          message?: string;
          errors?: string[];
        };
      };
    };
    if (Array.isArray(anyErr.response?.data?.errors) && anyErr.response?.data?.errors?.length) {
      return anyErr.response?.data?.errors?.[0] || anyErr.response?.data?.message || 'Terjadi kesalahan';
    }
    return anyErr.response?.data?.message || 'Terjadi kesalahan';
  }
  return 'Terjadi kesalahan';
};

const schema = z.object({
  name: z.string().min(1, 'Nama tahun ajaran wajib diisi'),
  semester1Start: z.string().min(1, 'Tanggal mulai Semester 1 wajib diisi'),
  semester1End: z.string().min(1, 'Tanggal akhir Semester 1 wajib diisi'),
  semester2Start: z.string().min(1, 'Tanggal mulai Semester 2 wajib diisi'),
  semester2End: z.string().min(1, 'Tanggal akhir Semester 2 wajib diisi'),
  isActive: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;
type MappingDrafts = Record<number, number | null>;
type AcademicYearPageTab = 'years' | 'new-year' | 'history';
type PromotionPreflightStatus = 'ready' | 'warning' | 'blocked' | 'info';
type PromotionPreflightRow = {
  key: string;
  area: string;
  status: PromotionPreflightStatus;
  impact: string;
  detail: string;
  nextAction: string;
};

type PreflightComponentLike = {
  ready: boolean;
  errors: string[];
  warnings: string[];
};

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

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

function getResolvedTargetClassId(row: AcademicPromotionWorkspaceClass, drafts: MappingDrafts) {
  if (Object.prototype.hasOwnProperty.call(drafts, row.sourceClassId)) {
    return drafts[row.sourceClassId] ?? null;
  }
  return row.targetClassId ?? null;
}

function getPromotionRunStatusLabel(status: string) {
  if (status === 'ROLLED_BACK') return 'Dibatalkan';
  if (status === 'COMMITTED') return 'Selesai';
  return status;
}

function getPreflightStatusMeta(status: PromotionPreflightStatus) {
  if (status === 'blocked') {
    return {
      label: 'Harus Diperbaiki',
      className: 'bg-red-100 text-red-700 ring-red-200',
    };
  }
  if (status === 'warning') {
    return {
      label: 'Perlu Dicek',
      className: 'bg-amber-100 text-amber-700 ring-amber-200',
    };
  }
  if (status === 'ready') {
    return {
      label: 'Siap',
      className: 'bg-green-100 text-green-700 ring-green-200',
    };
  }
  return {
    label: 'Informasi',
    className: 'bg-blue-100 text-blue-700 ring-blue-200',
  };
}

function getComponentStatus(component?: PreflightComponentLike | null, hasOperationalWarning = false): PromotionPreflightStatus {
  if (!component) return 'warning';
  if (!component.ready || component.errors.length > 0) return 'blocked';
  if (component.warnings.length > 0 || hasOperationalWarning) return 'warning';
  return 'ready';
}

function getRolloverPreviewItemLabel(item: unknown) {
  if (!item || typeof item !== 'object') return '-';
  const row = item as Record<string, unknown>;

  if ('sourceClassName' in row && 'targetClassName' in row && 'action' in row) {
    const sourceHomeroomTeacher = typeof row.sourceHomeroomTeacher === 'object' && row.sourceHomeroomTeacher !== null ? (row.sourceHomeroomTeacher as { name?: string }) : null;
    const targetHomeroomTeacher = typeof row.targetHomeroomTeacher === 'object' && row.targetHomeroomTeacher !== null ? (row.targetHomeroomTeacher as { name?: string }) : null;
    const homeroomAction = String(row.homeroomAction || '');
    const homeroomLabel =
      homeroomAction === 'CARRY_FORWARD_ON_CREATE'
        ? `Wali ikut: ${String(sourceHomeroomTeacher?.name || '-')}`
        : homeroomAction === 'FILL_EXISTING_EMPTY'
          ? `Isi wali kelas baru: ${String(sourceHomeroomTeacher?.name || '-')}`
          : homeroomAction === 'KEEP_EXISTING'
            ? `Wali kelas baru tetap: ${String(targetHomeroomTeacher?.name || '-')}`
            : 'Kelas sumber tanpa wali kelas';
    return `${String(row.sourceClassName || '-')} ke ${String(row.targetClassName || '-')} • ${homeroomLabel} (${String(row.action || '-')})`;
  }
  if ('sourceAssignmentId' in row && 'subject' in row && 'sourceClassName' in row && 'action' in row) {
    const subject = row.subject as { code?: string; name?: string } | undefined;
    return `${String(row.sourceClassName || '-')} • ${String(subject?.code || subject?.name || '-')} (${String(row.action || '-')})`;
  }
  if ('sourceEventId' in row && 'title' in row && 'action' in row) {
    return `${String(row.title || '-')} (${String(row.action || '-')})`;
  }
  if ('sourceSubjectKkmId' in row && 'subject' in row && 'classLevel' in row && 'sourceKkm' in row && 'action' in row) {
    const subject = row.subject as { code?: string; name?: string } | undefined;
    return `${String(subject?.code || subject?.name || '-')} ${String(row.classLevel || '-')} • ${String(row.sourceKkm || '-')} (${String(row.action || '-')})`;
  }
  if ('sourceComponentId' in row && 'code' in row && 'label' in row && 'action' in row) {
    return `${String(row.code || '-')} • ${String(row.label || '-')} (${String(row.action || '-')})`;
  }
  if ('sourceProgramId' in row && 'code' in row && 'displayLabel' in row && 'action' in row) {
    return `${String(row.code || '-')} • ${String(row.displayLabel || '-')} (${String(row.action || '-')})`;
  }
  if ('sourceSessionId' in row && 'programCode' in row && 'label' in row && 'action' in row) {
    return `${String(row.programCode || '-')} • ${String(row.label || '-')} (${String(row.action || '-')})`;
  }

  return '-';
}

export const AcademicYearPage = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<AcademicYearPageTab>('years');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [promotionSourceAcademicYearId, setPromotionSourceAcademicYearId] = useState('');
  const [promotionTargetAcademicYearId, setPromotionTargetAcademicYearId] = useState('');
  const [activateTargetYearAfterCommit, setActivateTargetYearAfterCommit] = useState(true);
  const [mappingDrafts, setMappingDrafts] = useState<MappingDrafts>({});
  const [rolloverSelectedComponents, setRolloverSelectedComponents] = useState<AcademicYearRolloverComponentSelection>({
    classPreparation: true,
    teacherAssignments: true,
    scheduleTimeConfig: true,
    academicEvents: true,
    reportDates: true,
    subjectKkms: true,
    examGradeComponents: true,
    examProgramConfigs: true,
    examProgramSessions: true,
  });

  const pageTabs = useMemo(
    () => [
      { id: 'years', label: 'Daftar Tahun Ajaran', icon: CalendarDays },
      { id: 'new-year', label: 'Tahun Ajaran Baru', icon: GraduationCap },
      { id: 'history', label: 'Riwayat Proses', icon: History },
    ],
    [],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['academic-years', page, limit, debouncedSearch],
    queryFn: () => academicYearService.list({ page, limit, search: debouncedSearch }),
  });

  const { data: academicYearsOptionsData } = useQuery({
    queryKey: ['academic-years-options-all'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
  });

  const academicYearOptions = useMemo<AcademicYear[]>(() => academicYearsOptionsData?.data?.academicYears || academicYearsOptionsData?.academicYears || [], [academicYearsOptionsData]);

  const promotionFeatureFlagsQuery = useQuery({
    queryKey: ['academic-feature-flags'],
    queryFn: () => academicYearService.getFeatureFlags(),
  });

  const promotionFeatureFlags: AcademicFeatureFlags | undefined = promotionFeatureFlagsQuery.data?.data;
  const isPromotionFeatureEnabled = promotionFeatureFlags?.academicPromotionV2Enabled === true;
  const isRolloverFeatureEnabled = promotionFeatureFlags?.academicYearRolloverEnabled === true;

  useEffect(() => {
    if (academicYearOptions.length === 0) return;

    const activeYear = academicYearOptions.find((item) => item.isActive) || academicYearOptions[0];
    if (!promotionSourceAcademicYearId) {
      setPromotionSourceAcademicYearId(String(activeYear.id));
    }
    if (!promotionTargetAcademicYearId) {
      const fallbackTarget = academicYearOptions.find((item) => item.id !== activeYear.id) || academicYearOptions[0];
      if (fallbackTarget) {
        setPromotionTargetAcademicYearId(String(fallbackTarget.id));
      }
    }
  }, [academicYearOptions, promotionSourceAcademicYearId, promotionTargetAcademicYearId]);

  const selectedSourceAcademicYearId = Number(promotionSourceAcademicYearId);
  const selectedTargetAcademicYearId = Number(promotionTargetAcademicYearId);
  const isPromotionSelectionValid =
    Number.isFinite(selectedSourceAcademicYearId) && selectedSourceAcademicYearId > 0 && Number.isFinite(selectedTargetAcademicYearId) && selectedTargetAcademicYearId > 0 && selectedSourceAcademicYearId !== selectedTargetAcademicYearId;

  const promotionWorkspaceQuery = useQuery({
    queryKey: ['academic-promotion-workspace', selectedSourceAcademicYearId, selectedTargetAcademicYearId],
    enabled: isPromotionFeatureEnabled && isPromotionSelectionValid,
    queryFn: () => academicYearService.getPromotionWorkspace(selectedSourceAcademicYearId, selectedTargetAcademicYearId),
  });
  const rolloverWorkspaceQuery = useQuery({
    queryKey: ['academic-rollover-workspace', selectedSourceAcademicYearId, selectedTargetAcademicYearId],
    enabled: isRolloverFeatureEnabled && isPromotionSelectionValid,
    queryFn: () => academicYearService.getRolloverWorkspace(selectedSourceAcademicYearId, selectedTargetAcademicYearId),
  });

  const promotionWorkspace: AcademicPromotionWorkspace | undefined = promotionWorkspaceQuery.data?.data;
  const rolloverWorkspace: AcademicYearRolloverWorkspace | undefined = rolloverWorkspaceQuery.data?.data;

  useEffect(() => {
    if (!promotionWorkspace) return;
    const nextDrafts: MappingDrafts = {};
    promotionWorkspace.classes.forEach((item) => {
      nextDrafts[item.sourceClassId] = item.targetClassId ?? null;
    });
    setMappingDrafts(nextDrafts);
  }, [promotionWorkspace]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      semester1Start: '',
      semester1End: '',
      semester2Start: '',
      semester2End: '',
      isActive: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: academicYearService.create,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['academic-years'] }),
        queryClient.invalidateQueries({
          queryKey: ['academic-years-options-all'],
        }),
      ]);
      toast.success('Tahun ajaran berhasil dibuat');
      setShowForm(false);
      reset();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal membuat tahun ajaran');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data: payload }: { id: number; data: Partial<FormValues> }) => academicYearService.update(id, payload as unknown as Partial<AcademicYear>),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['academic-years'] }),
        queryClient.invalidateQueries({
          queryKey: ['academic-years-options-all'],
        }),
      ]);
      toast.success('Tahun ajaran berhasil diperbarui');
      setShowForm(false);
      setEditingId(null);
      reset();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal memperbarui tahun ajaran');
    },
  });

  const activateMutation = useMutation({
    mutationFn: (id: number) => academicYearService.activate(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['academic-years'] }),
        queryClient.invalidateQueries({
          queryKey: ['academic-years-options-all'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['academic-promotion-workspace'],
        }),
      ]);
      toast.success('Tahun ajaran diaktifkan');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal mengaktifkan tahun ajaran');
    },
  });

  const createRolloverTargetMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSourceAcademicYearId) {
        throw new Error('Tahun ajaran sumber belum valid.');
      }
      return academicYearService.createRolloverTarget(selectedSourceAcademicYearId);
    },
    onSuccess: async (response: { data: AcademicYearRolloverTargetResult }) => {
      setPromotionTargetAcademicYearId(String(response.data.targetAcademicYear.id));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['academic-years'] }),
        queryClient.invalidateQueries({
          queryKey: ['academic-years-options-all'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['academic-rollover-workspace'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['academic-promotion-workspace'],
        }),
      ]);
      toast.success(response.data.created ? `Draft tahun ajaran ${response.data.targetAcademicYear.name} berhasil dibuat` : `Draft tahun ajaran ${response.data.targetAcademicYear.name} sudah tersedia`);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal menyiapkan draft tahun ajaran baru');
    },
  });

  const applyRolloverMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSourceAcademicYearId || !selectedTargetAcademicYearId) {
        throw new Error('Tahun ajaran sumber/baru belum valid.');
      }
      return academicYearService.applyRollover(selectedSourceAcademicYearId, {
        targetAcademicYearId: selectedTargetAcademicYearId,
        components: rolloverSelectedComponents,
      });
    },
    onSuccess: async (response: { data: AcademicYearRolloverApplyResult }) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['academic-rollover-workspace'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['academic-promotion-workspace'],
        }),
      ]);
      toast.success(
        `Data tahun ajaran baru berhasil disalin. Kelas: ${response.data.applied.classPreparation.created}, wali kelas ikut: ${response.data.applied.classPreparation.homeroomCarriedOnCreate}, target kosong diisi: ${response.data.applied.classPreparation.homeroomFilledExisting}, guru mapel: ${response.data.applied.teacherAssignments.created}, tanggal rapor: ${response.data.applied.reportDates.created}, KKM: ${response.data.applied.subjectKkms.created}, program ujian: ${response.data.applied.examProgramConfigs.created}.`,
      );
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal menyalin data tahun ajaran baru');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => academicYearService.remove(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['academic-years'] }),
        queryClient.invalidateQueries({
          queryKey: ['academic-years-options-all'],
        }),
      ]);
      toast.success('Tahun ajaran dihapus');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal menghapus tahun ajaran');
    },
  });

  const savePromotionMappingsMutation = useMutation({
    mutationFn: async () => {
      if (!promotionWorkspace) {
        throw new Error('Data kenaikan belum tersedia.');
      }
      return academicYearService.savePromotionMappings(selectedSourceAcademicYearId, {
        targetAcademicYearId: selectedTargetAcademicYearId,
        mappings: promotionWorkspace.classes.map((item) => ({
          sourceClassId: item.sourceClassId,
          targetClassId: item.action === 'GRADUATE' ? null : getResolvedTargetClassId(item, mappingDrafts),
        })),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['academic-promotion-workspace', selectedSourceAcademicYearId, selectedTargetAcademicYearId],
      });
      toast.success('Tujuan kelas berhasil disimpan');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal menyimpan tujuan kelas');
    },
  });

  const commitPromotionMutation = useMutation({
    mutationFn: () =>
      academicYearService.commitPromotion(selectedSourceAcademicYearId, {
        targetAcademicYearId: selectedTargetAcademicYearId,
        activateTargetYear: activateTargetYearAfterCommit,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['academic-years'] }),
        queryClient.invalidateQueries({
          queryKey: ['academic-years-options-all'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['academic-promotion-workspace'],
        }),
      ]);
      toast.success('Kenaikan dan kelulusan berhasil diproses');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal memproses kenaikan dan kelulusan');
    },
  });

  const rollbackPromotionMutation = useMutation({
    mutationFn: async (runId: number) => {
      if (!selectedSourceAcademicYearId) {
        throw new Error('Tahun ajaran sumber belum valid.');
      }
      return academicYearService.rollbackPromotionRun(selectedSourceAcademicYearId, runId);
    },
    onSuccess: async (response: { data: AcademicPromotionRollbackResult }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['academic-years'] }),
        queryClient.invalidateQueries({
          queryKey: ['academic-years-options-all'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['academic-promotion-workspace'],
        }),
      ]);
      toast.success(`Proses #${response.data.run.id} berhasil dibatalkan`);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal membatalkan proses kenaikan');
    },
  });

  const onSubmit = (values: FormValues) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: values });
      return;
    }
    createMutation.mutate(values);
  };

  const handleEdit = (item: AcademicYear) => {
    setEditingId(item.id);
    setValue('name', item.name);
    setValue('semester1Start', item.semester1Start.split('T')[0]);
    setValue('semester1End', item.semester1End.split('T')[0]);
    setValue('semester2Start', item.semester2Start.split('T')[0]);
    setValue('semester2End', item.semester2End.split('T')[0]);
    setValue('isActive', item.isActive);
    setShowForm(true);
  };

  const resetPromotionDraftsToSuggested = () => {
    if (!promotionWorkspace) return;
    const nextDrafts: MappingDrafts = {};
    promotionWorkspace.classes.forEach((item) => {
      nextDrafts[item.sourceClassId] = item.action === 'GRADUATE' ? null : (item.suggestedTargetClassId ?? null);
    });
    setMappingDrafts(nextDrafts);
  };

  const toggleRolloverComponent = (key: keyof AcademicYearRolloverComponentSelection) => {
    setRolloverSelectedComponents((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const handleApplyRollover = () => {
    if (!rolloverWorkspace) {
      toast.error('Data salin tahun sebelumnya belum tersedia.');
      return;
    }
    if (!rolloverWorkspace.validation.readyToApply) {
      toast.error('Masih ada data yang harus diperbaiki sebelum salin data.');
      return;
    }
    if (!Object.values(rolloverSelectedComponents).some(Boolean)) {
      toast.error('Pilih minimal satu data yang akan disalin.');
      return;
    }
    if (!window.confirm('Sistem akan menyalin data yang belum ada ke tahun ajaran baru tanpa menimpa data yang sudah disusun manual. Lanjutkan?')) {
      return;
    }
    applyRolloverMutation.mutate();
  };

  const list: AcademicYear[] = data?.data?.academicYears || [];
  const pagination = data?.data?.pagination || {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  };
  const rolloverComponentEntries = rolloverWorkspace
    ? ([
        ['classPreparation', rolloverWorkspace.components.classPreparation],
        ['teacherAssignments', rolloverWorkspace.components.teacherAssignments],
        ['scheduleTimeConfig', rolloverWorkspace.components.scheduleTimeConfig],
        ['academicEvents', rolloverWorkspace.components.academicEvents],
        ['reportDates', rolloverWorkspace.components.reportDates],
        ['subjectKkms', rolloverWorkspace.components.subjectKkms],
        ['examGradeComponents', rolloverWorkspace.components.examGradeComponents],
        ['examProgramConfigs', rolloverWorkspace.components.examProgramConfigs],
        ['examProgramSessions', rolloverWorkspace.components.examProgramSessions],
      ] as const)
    : [];
  const rolloverStatCards = rolloverWorkspace
    ? [
        {
          key: 'stat-classPreparation',
          title: 'Kelas Baru',
          value: rolloverWorkspace.components.classPreparation.summary.createCount,
          subtitle: 'Kelas XI/XII yang perlu dibuat.',
        },
        {
          key: 'stat-teacherAssignments',
          title: 'Guru Mapel',
          value: rolloverWorkspace.components.teacherAssignments.summary.createCount,
          subtitle: 'Penugasan mengajar yang bisa disalin.',
        },
        {
          key: 'stat-reportDates',
          title: 'Tanggal Rapor',
          value: rolloverWorkspace.components.reportDates.summary.createCount,
          subtitle: 'Tanggal rapor tahunan yang perlu dibuat.',
        },
        {
          key: 'stat-subjectKkms',
          title: 'KKM Tahunan',
          value: rolloverWorkspace.components.subjectKkms.summary.createCount,
          subtitle: 'KKM tahun ajaran baru yang perlu dibuat.',
        },
        {
          key: 'stat-examGradeComponents',
          title: 'Komponen Nilai',
          value: rolloverWorkspace.components.examGradeComponents.summary.createCount,
          subtitle: 'Komponen nilai ujian baru.',
        },
        {
          key: 'stat-examProgramConfigs',
          title: 'Program Ujian',
          value: rolloverWorkspace.components.examProgramConfigs.summary.createCount,
          subtitle: 'Program ujian yang bisa disalin.',
        },
        {
          key: 'stat-examProgramSessions',
          title: 'Sesi Program',
          value: rolloverWorkspace.components.examProgramSessions.summary.createCount,
          subtitle: 'Sesi ujian terjadwal baru.',
        },
        {
          key: 'stat-scheduleTimeConfig',
          title: 'Jam Pelajaran',
          value: rolloverWorkspace.components.scheduleTimeConfig.summary.createCount,
          subtitle: 'Buat baru jika tahun ajaran baru belum punya.',
        },
        {
          key: 'stat-academicEvents',
          title: 'Kalender Akademik',
          value: rolloverWorkspace.components.academicEvents.summary.createCount,
          subtitle: 'Kegiatan yang bisa disalin ke tahun baru.',
        },
      ]
    : [];
  const hasPromotionMappingDraftChanges = useMemo(() => {
    if (!promotionWorkspace) return false;
    return promotionWorkspace.classes.some((item) => {
      const savedTargetClassId = item.action === 'GRADUATE' ? null : (item.targetClassId ?? null);
      return getResolvedTargetClassId(item, mappingDrafts) !== savedTargetClassId;
    });
  }, [mappingDrafts, promotionWorkspace]);
  const promotionPreflightRows = useMemo<PromotionPreflightRow[]>(() => {
    if (!promotionWorkspace) return [];

    const classPreparation = rolloverWorkspace?.components.classPreparation;
    const teacherAssignments = rolloverWorkspace?.components.teacherAssignments;
    const academicSetupComponents = rolloverWorkspace
      ? [
          rolloverWorkspace.components.scheduleTimeConfig,
          rolloverWorkspace.components.academicEvents,
          rolloverWorkspace.components.reportDates,
          rolloverWorkspace.components.subjectKkms,
          rolloverWorkspace.components.examGradeComponents,
          rolloverWorkspace.components.examProgramConfigs,
          rolloverWorkspace.components.examProgramSessions,
        ]
      : [];
    const academicSetupHasErrors = academicSetupComponents.some((component) => !component.ready || component.errors.length > 0);
    const academicSetupHasWarnings = academicSetupComponents.some((component) => component.warnings.length > 0);
    const academicSetupPendingCreate = academicSetupComponents.some(
      (component) => 'createCount' in component.summary && Number(component.summary.createCount || 0) > 0,
    );
    const academicSetupStatus: PromotionPreflightStatus = !rolloverWorkspace
      ? 'warning'
      : academicSetupHasErrors
        ? 'blocked'
        : academicSetupHasWarnings || academicSetupPendingCreate
          ? 'warning'
          : 'ready';
    const teacherSummary = teacherAssignments?.summary;
    const teacherHasMissingTarget = Number(teacherSummary?.skipNoTargetClassCount || 0) > 0;
    const promotionHasErrors = promotionWorkspace.validation.errors.length > 0;
    const promotionHasWarnings = promotionWorkspace.validation.warnings.length > 0;
    const destinationStatus: PromotionPreflightStatus = hasPromotionMappingDraftChanges
      ? 'blocked'
      : promotionHasErrors
        ? 'blocked'
        : promotionHasWarnings
          ? 'warning'
          : 'ready';

    return [
      {
        key: 'classes',
        area: 'Kelas & Wali Kelas',
        status: getComponentStatus(classPreparation, Number(classPreparation?.summary.homeroomMissingSourceCount || 0) > 0),
        impact: 'Menyiapkan kelas XI/XII di tahun ajaran baru dan menjaga wali kelas tetap ikut bila belum diganti.',
        detail: classPreparation
          ? `${classPreparation.summary.sourceItems} kelas sumber, ${classPreparation.summary.createCount} kelas akan dibuat, ${classPreparation.summary.existingCount} sudah ada. Wali ikut ${classPreparation.summary.homeroomCarryCount}, isi wali kosong ${classPreparation.summary.homeroomExistingFillCount}, tanpa wali ${classPreparation.summary.homeroomMissingSourceCount}.`
          : 'Data salin tahun sebelumnya belum terbaca.',
        nextAction: classPreparation?.ready ? 'Lanjutkan jika daftar wali kelas sudah sesuai.' : 'Cek tab Salin Data Tahun Sebelumnya dan perbaiki kelas/wali yang bermasalah.',
      },
      {
        key: 'teacher-assignments',
        area: 'Guru Mapel',
        status: getComponentStatus(teacherAssignments, teacherHasMissingTarget),
        impact: 'Menyalin penugasan guru mapel agar guru tetap mengajar mapel/kelas yang sama di tahun ajaran baru.',
        detail: teacherAssignments
          ? `${teacherAssignments.summary.sourceItems} penugasan sumber, ${teacherAssignments.summary.createCount} akan disalin, ${teacherAssignments.summary.existingCount} sudah ada, ${teacherAssignments.summary.skipNoTargetClassCount} menunggu kelas tujuan.`
          : 'Data penugasan guru mapel belum terbaca.',
        nextAction: teacherHasMissingTarget ? 'Lengkapi kelas tujuan dulu agar penugasan guru mapel bisa ikut.' : 'Cek hanya jika ada perubahan guru/mapel/assignment.',
      },
      {
        key: 'academic-setup',
        area: 'Jadwal, KKM, Rapor & Ujian',
        status: academicSetupStatus,
        impact: 'Membawa konfigurasi pendukung seperti jam pelajaran, kalender, tanggal rapor, KKM, komponen nilai, program ujian, dan sesi ujian.',
        detail: rolloverWorkspace
          ? `Sisa data yang akan disalin: jam pelajaran ${rolloverWorkspace.components.scheduleTimeConfig.summary.createCount}, kalender ${rolloverWorkspace.components.academicEvents.summary.createCount}, tanggal rapor ${rolloverWorkspace.components.reportDates.summary.createCount}, KKM ${rolloverWorkspace.components.subjectKkms.summary.createCount}, komponen nilai ${rolloverWorkspace.components.examGradeComponents.summary.createCount}, program ujian ${rolloverWorkspace.components.examProgramConfigs.summary.createCount}, sesi ujian ${rolloverWorkspace.components.examProgramSessions.summary.createCount}.`
          : 'Data konfigurasi pendukung belum terbaca.',
        nextAction: academicSetupPendingCreate ? 'Klik Salin Data ke Tahun Baru sebelum proses kenaikan jika data ini masih berlanjut.' : 'Konfigurasi pendukung sudah terlihat aman untuk dilanjutkan.',
      },
      {
        key: 'student-destination',
        area: 'Tujuan Kelas Siswa',
        status: destinationStatus,
        impact: 'Memastikan siswa kelas X/XI pindah ke kelas tujuan yang benar dan tidak masuk ke kelas yang sudah berisi siswa aktif.',
        detail: `${promotionWorkspace.summary.configuredPromoteClasses}/${promotionWorkspace.summary.promotableClasses} kelas naik sudah punya tujuan. ${promotionWorkspace.summary.promotedStudents} siswa akan naik kelas.`,
        nextAction: hasPromotionMappingDraftChanges
          ? 'Klik Simpan Tujuan Kelas dulu sebelum memproses kenaikan.'
          : promotionWorkspace.validation.readyToCommit
            ? 'Tujuan kelas sudah siap diproses.'
            : 'Perbaiki kelas tujuan yang masih bermasalah.',
      },
      {
        key: 'graduation',
        area: 'Kelulusan Kelas XII',
        status: promotionWorkspace.summary.graduatingClasses > 0 ? 'ready' : 'info',
        impact: 'Siswa kelas XII aktif akan dilepas dari kelas aktif dan berubah menjadi alumni.',
        detail: `${promotionWorkspace.summary.graduatingClasses} kelas XII, ${promotionWorkspace.summary.graduatedStudents} siswa akan menjadi alumni.`,
        nextAction: promotionWorkspace.summary.graduatingClasses > 0 ? 'Pastikan data kelas XII sudah final sebelum proses.' : 'Tidak ada kelas XII aktif pada tahun sumber.',
      },
      {
        key: 'duties',
        area: 'Duty/Jabatan Guru',
        status: 'info',
        impact: 'Duty guru melekat pada data guru dan tetap berjalan, kecuali admin menggantinya dari pengelolaan guru/duty.',
        detail: 'Proses tahun ajaran baru tidak menghapus duty guru. Pergantian wakasek, wali kelas khusus, pembina, atau jabatan lain tetap dilakukan dari source of truth data guru.',
        nextAction: 'Jika ada pergantian jabatan, ubah datanya sebelum tahun ajaran baru dipakai massal.',
      },
      {
        key: 'active-year',
        area: 'Aktivasi & Arsip',
        status: activateTargetYearAfterCommit ? 'warning' : 'info',
        impact: 'Menentukan kapan tahun ajaran baru menjadi operasional aktif dan tahun lama menjadi arsip/historis.',
        detail: activateTargetYearAfterCommit ? 'Tahun ajaran baru akan langsung diaktifkan setelah proses selesai.' : 'Tahun ajaran baru tidak otomatis diaktifkan setelah proses selesai.',
        nextAction: activateTargetYearAfterCommit ? 'Pastikan semua user siap berpindah ke tahun ajaran baru.' : 'Aktifkan manual dari Daftar Tahun Ajaran saat sudah siap.',
      },
    ];
  }, [activateTargetYearAfterCommit, hasPromotionMappingDraftChanges, promotionWorkspace, rolloverWorkspace]);
  const promotionPreflightBlockedCount = promotionPreflightRows.filter((item) => item.status === 'blocked').length;
  const promotionPreflightWarningCount = promotionPreflightRows.filter((item) => item.status === 'warning').length;
  const promotionPreflightReadyCount = promotionPreflightRows.filter((item) => item.status === 'ready').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tahun Ajaran</h1>
          <p className="text-gray-500">Kelola daftar tahun ajaran dan lanjutkan data sekolah ke tahun ajaran baru.</p>
        </div>
        {activeTab === 'years' && !showForm && (
          <button
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
              reset();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 sm:w-auto"
          >
            <Plus size={18} />
            Tambah Tahun Ajaran
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white px-4 shadow-sm">
        <UnderlineTabBar items={pageTabs} activeId={activeTab} onChange={(id) => setActiveTab(id as AcademicYearPageTab)} ariaLabel="Menu Tahun Ajaran" />
      </div>

      {activeTab === 'years' &&
        (showForm ? (
          <div className="space-y-4 rounded-xl border-0 bg-white p-6 shadow-md">
            <h2 className="mb-4 border-b border-gray-100 pb-3 text-lg font-semibold text-gray-800">{editingId ? 'Edit Tahun Ajaran' : 'Tambah Tahun Ajaran Baru'}</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
                  Nama Tahun Ajaran
                </label>
                <input id="name" {...register('name')} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500" placeholder="2026/2027" autoComplete="off" />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
              </div>

              <div>
                <label htmlFor="semester1Start" className="mb-1 block text-sm font-medium text-gray-700">
                  Semester Ganjil Mulai
                </label>
                <input id="semester1Start" type="date" {...register('semester1Start')} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500" autoComplete="off" />
                {errors.semester1Start && <p className="mt-1 text-xs text-red-500">{errors.semester1Start.message}</p>}
              </div>

              <div>
                <label htmlFor="semester1End" className="mb-1 block text-sm font-medium text-gray-700">
                  Semester Ganjil Akhir
                </label>
                <input id="semester1End" type="date" {...register('semester1End')} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500" autoComplete="off" />
                {errors.semester1End && <p className="mt-1 text-xs text-red-500">{errors.semester1End.message}</p>}
              </div>

              <div>
                <label htmlFor="semester2Start" className="mb-1 block text-sm font-medium text-gray-700">
                  Semester Genap Mulai
                </label>
                <input id="semester2Start" type="date" {...register('semester2Start')} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500" autoComplete="off" />
                {errors.semester2Start && <p className="mt-1 text-xs text-red-500">{errors.semester2Start.message}</p>}
              </div>

              <div>
                <label htmlFor="semester2End" className="mb-1 block text-sm font-medium text-gray-700">
                  Semester Genap Akhir
                </label>
                <input id="semester2End" type="date" {...register('semester2End')} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500" autoComplete="off" />
                {errors.semester2End && <p className="mt-1 text-xs text-red-500">{errors.semester2End.message}</p>}
              </div>

              <div className="md:col-span-2 flex items-center gap-3">
                <input type="checkbox" id="isActive" {...register('isActive')} className="rounded border-gray-300" />
                <label htmlFor="isActive" className="text-sm text-gray-700">
                  Set sebagai Tahun Ajaran Aktif
                </label>
              </div>

              <div className="mt-4 flex justify-end gap-3 md:col-span-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    reset();
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  Batal
                </button>
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={16} className="animate-spin" />}
                  {editingId ? 'Update' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border-0 bg-white shadow-md">
            <div className="flex flex-col items-center justify-between gap-4 border-b border-gray-100 bg-gray-50/50 p-4 sm:flex-row">
              <div className="relative w-full sm:w-72">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Search size={18} className="text-gray-400" />
                </div>
                <input
                  type="text"
                  id="search-academic-year"
                  name="search-academic-year"
                  placeholder="Cari tahun ajaran..."
                  className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm leading-5 transition duration-150 ease-in-out placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="limit-academic-year" className="text-sm text-gray-600">
                  Tampilkan:
                </label>
                <select
                  id="limit-academic-year"
                  name="limit-academic-year"
                  value={limit}
                  onChange={(event) => {
                    setLimit(Number(event.target.value));
                    setPage(1);
                  }}
                  className="w-24 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={35}>35</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
            {isLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-6 py-3">
                  <div className="text-sm text-gray-600">
                    Total: <span className="font-medium">{pagination.total}</span> tahun ajaran
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 font-medium text-gray-600">
                      <tr>
                        <th className="px-6 py-4">TAHUN AJARAN</th>
                        <th className="px-6 py-4">SEMESTER GANJIL</th>
                        <th className="px-6 py-4">SEMESTER GENAP</th>
                        <th className="px-6 py-4 text-center">STATUS</th>
                        <th className="px-6 py-4 text-center">AKSI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {list.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                            {search ? 'Tidak ada data yang cocok dengan pencarian' : 'Belum ada tahun ajaran'}
                          </td>
                        </tr>
                      ) : (
                        list.map((item) => (
                          <tr key={item.id} className="transition-colors hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium text-gray-900">{item.name}</td>
                            <td className="px-6 py-4 text-gray-600">
                              {formatDate(item.semester1Start)} - {formatDate(item.semester1End)}
                            </td>
                            <td className="px-6 py-4 text-gray-600">
                              {formatDate(item.semester2Start)} - {formatDate(item.semester2End)}
                            </td>
                            <td className="px-6 py-4 text-center">
                              {item.isActive ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                                  <CheckCircle2 size={14} /> Aktif
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">Arsip</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                {!item.isActive && (
                                  <button onClick={() => activateMutation.mutate(item.id)} className="rounded-lg p-1.5 text-blue-600 transition-colors hover:bg-blue-50" title="Aktifkan">
                                    <CheckCircle2 size={18} />
                                  </button>
                                )}
                                <button onClick={() => handleEdit(item)} className="rounded-lg p-1.5 text-yellow-600 transition-colors hover:bg-yellow-50" title="Edit">
                                  <Edit size={18} />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Hapus tahun ajaran ini?')) {
                                      deleteMutation.mutate(item.id);
                                    }
                                  }}
                                  className="rounded-lg p-1.5 text-red-600 transition-colors hover:bg-red-50"
                                  title="Hapus"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-6 py-4">
                  <div className="text-sm text-gray-500">
                    Menampilkan <span className="font-medium">{pagination.total === 0 ? 0 : (page - 1) * limit + 1}</span> sampai <span className="font-medium">{Math.min(page * limit, pagination.total)}</span> dari{' '}
                    <span className="font-medium">{pagination.total}</span> data
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="rounded-lg border p-2 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50">
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                      disabled={page === pagination.totalPages}
                      className="rounded-lg border p-2 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}

      {activeTab === 'new-year' && (
        <div className="space-y-5">
          <div className="space-y-5 rounded-2xl border border-slate-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-6 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Salin Data Tahun Sebelumnya</h2>
                <p className="text-sm text-slate-600">Siapkan tahun ajaran baru dengan menyalin data operasional yang masih berlanjut. Sistem hanya membuat data yang belum ada dan tidak menimpa data tahun ajaran baru.</p>
              </div>
              <div className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">Aman: tidak menimpa data</div>
            </div>

            {promotionFeatureFlagsQuery.isLoading ? (
              <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-12">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : promotionFeatureFlagsQuery.isError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">{getErrorMessage(promotionFeatureFlagsQuery.error) || 'Gagal memuat pengaturan salin data.'}</div>
            ) : !isRolloverFeatureEnabled ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-800">
                Fitur salin data tahun sebelumnya sedang dimatikan di server. Nyalakan env <code>ACADEMIC_YEAR_ROLLOVER_ENABLED=true</code> saat siap uji.
              </div>
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Tahun Ajaran Sumber</label>
                    <select
                      value={promotionSourceAcademicYearId}
                      onChange={(event) => setPromotionSourceAcademicYearId(event.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">Pilih tahun ajaran sumber</option>
                      {academicYearOptions.map((item) => (
                        <option key={`rollover-source-${item.id}`} value={item.id}>
                          {item.name} {item.isActive ? '(Aktif)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Tahun Ajaran Baru</label>
                    <select
                      value={promotionTargetAcademicYearId}
                      onChange={(event) => setPromotionTargetAcademicYearId(event.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">Pilih tahun ajaran baru</option>
                      {academicYearOptions.map((item) => (
                        <option key={`rollover-target-${item.id}`} value={item.id}>
                          {item.name} {item.isActive ? '(Aktif)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => createRolloverTargetMutation.mutate()}
                    disabled={!selectedSourceAcademicYearId || createRolloverTargetMutation.isPending}
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {createRolloverTargetMutation.isPending ? 'Menyiapkan...' : 'Buat Draft Tahun Ajaran Baru'}
                  </button>
                </div>

                {!promotionSourceAcademicYearId ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-4 py-5 text-sm text-slate-600">
                    Pilih tahun ajaran sumber terlebih dahulu. Jika tahun ajaran baru belum ada, sistem bisa membuat draft otomatis.
                  </div>
                ) : !promotionTargetAcademicYearId ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-4 py-5 text-sm text-slate-600">
                    Pilih tahun ajaran baru yang sudah ada atau klik <strong>Buat Draft Tahun Ajaran Baru</strong> untuk membuat draft nonaktif.
                  </div>
                ) : !isPromotionSelectionValid ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-800">Tahun ajaran sumber dan tahun ajaran baru harus berbeda.</div>
                ) : rolloverWorkspaceQuery.isLoading ? (
                  <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                  </div>
                ) : rolloverWorkspaceQuery.isError || !rolloverWorkspace ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">{getErrorMessage(rolloverWorkspaceQuery.error) || 'Gagal memuat data salin tahun sebelumnya.'}</div>
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-4">
                      {rolloverStatCards.map((item) => (
                        <div key={item.key} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                          <p className="text-xs uppercase tracking-wide text-slate-500">{item.title}</p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</p>
                          <p className="mt-1 text-xs text-slate-500">{item.subtitle}</p>
                        </div>
                      ))}
                    </div>

                    {rolloverWorkspace.validation.errors.length > 0 && (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                        <h3 className="text-sm font-semibold text-red-800">Data yang Harus Diperbaiki</h3>
                        <ul className="mt-2 space-y-1 text-sm text-red-700">
                          {rolloverWorkspace.validation.errors.map((item) => (
                            <li key={`rollover-error-${item}`}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {rolloverWorkspace.validation.warnings.length > 0 && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <h3 className="text-sm font-semibold text-amber-800">Catatan Perlu Dicek</h3>
                        <ul className="mt-2 space-y-1 text-sm text-amber-700">
                          {rolloverWorkspace.validation.warnings.map((item) => (
                            <li key={`rollover-warning-${item}`}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="grid gap-4 lg:grid-cols-2">
                      {rolloverComponentEntries.map(([key, component]) => (
                        <div key={key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <label className="flex items-start gap-3">
                            <input type="checkbox" checked={rolloverSelectedComponents[key]} onChange={() => toggleRolloverComponent(key)} className="mt-1 rounded border-slate-300" />
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-slate-900">{component.label}</p>
                              <p className="text-sm text-slate-600">{component.description}</p>
                            </div>
                          </label>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                            <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
                              <p className="font-semibold">{component.summary.sourceItems}</p>
                              <p>Sumber</p>
                            </div>
                            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">
                              <p className="font-semibold">{'createCount' in component.summary ? component.summary.createCount : 0}</p>
                              <p>Akan disalin</p>
                            </div>
                            <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
                              <p className="font-semibold">{'existingCount' in component.summary ? component.summary.existingCount : 0}</p>
                              <p>Sudah ada</p>
                            </div>
                          </div>
                          {'globalFallbackCount' in component.summary && component.summary.globalFallbackCount > 0 && <p className="mt-2 text-xs text-amber-700">Menggunakan data umum: {component.summary.globalFallbackCount}</p>}
                          {'missingGradeComponentCount' in component.summary && component.summary.missingGradeComponentCount > 0 && (
                            <p className="mt-2 text-xs text-amber-700">Menunggu komponen nilai: {component.summary.missingGradeComponentCount}</p>
                          )}
                          {'skipNoTargetProgramCount' in component.summary && component.summary.skipNoTargetProgramCount > 0 && (
                            <p className="mt-2 text-xs text-amber-700">Menunggu program tahun baru: {component.summary.skipNoTargetProgramCount}</p>
                          )}
                          {'skipNoTargetClassCount' in component.summary && component.summary.skipNoTargetClassCount > 0 && (
                            <p className="mt-2 text-xs text-amber-700">Menunggu kelas tahun baru: {component.summary.skipNoTargetClassCount}</p>
                          )}
                          {'skipNoSourceCount' in component.summary && component.summary.skipNoSourceCount > 0 && <p className="mt-2 text-xs text-amber-700">Tidak ada data sumber: {component.summary.skipNoSourceCount}</p>}
                          {'skipOutsideTargetRangeCount' in component.summary && component.summary.skipOutsideTargetRangeCount > 0 && (
                            <p className="mt-2 text-xs text-amber-700">Di luar rentang tahun baru: {component.summary.skipOutsideTargetRangeCount}</p>
                          )}
                          {'homeroomCarryCount' in component.summary && (
                            <div className="mt-2 space-y-1 text-xs text-slate-600">
                              <p>Wali kelas ikut pada kelas baru: {component.summary.homeroomCarryCount}</p>
                              <p>Wali kelas kosong akan diisi: {component.summary.homeroomExistingFillCount}</p>
                              <p>Kelas baru sudah punya wali: {component.summary.homeroomKeepExistingCount}</p>
                              <p>Kelas sumber tanpa wali: {component.summary.homeroomMissingSourceCount}</p>
                            </div>
                          )}
                          {component.errors.length > 0 && (
                            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                              {component.errors.slice(0, 3).map((item) => (
                                <p key={`${key}-error-${item}`}>• {item}</p>
                              ))}
                            </div>
                          )}
                          {component.warnings.length > 0 && (
                            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                              {component.warnings.slice(0, 2).map((item) => (
                                <p key={`${key}-warning-${item}`}>• {item}</p>
                              ))}
                            </div>
                          )}
                          {'items' in component && component.items.length > 0 && (
                            <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <summary className="cursor-pointer text-sm font-medium text-slate-700">Lihat rencana {component.label.toLowerCase()}</summary>
                              <div className="mt-3 space-y-2 text-xs text-slate-600">
                                {component.items.slice(0, 8).map((item, index) => (
                                  <div key={`${key}-${index}`}>
                                    <span>{getRolloverPreviewItemLabel(item)}</span>
                                  </div>
                                ))}
                                {component.items.length > 8 && <p className="text-slate-500">+ {component.items.length - 8} item lainnya</p>}
                              </div>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <p className="text-sm font-semibold text-slate-900">Catatan Operasional</p>
                      <ul className="mt-2 space-y-1 text-sm text-slate-600">
                        {rolloverWorkspace.notes.map((item) => (
                          <li key={`rollover-note-${item}`}>• {item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-slate-600">
                        Tahun ajaran baru: <span className="font-medium text-slate-900">{rolloverWorkspace.targetAcademicYear.name}</span>
                      </p>
                      <button
                        type="button"
                        onClick={handleApplyRollover}
                        disabled={applyRolloverMutation.isPending}
                        className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {applyRolloverMutation.isPending ? 'Menyalin...' : 'Salin Data ke Tahun Baru'}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <div className="space-y-5 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Kenaikan & Kelulusan</h2>
                <p className="text-sm text-slate-600">Cek tujuan kelas siswa, simpan tujuan kelas, lalu proses kenaikan dan kelulusan dengan aman.</p>
              </div>
              <div className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">Preview dulu sebelum proses</div>
            </div>

            {promotionFeatureFlagsQuery.isLoading ? (
              <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-12">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : promotionFeatureFlagsQuery.isError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">{getErrorMessage(promotionFeatureFlagsQuery.error) || 'Gagal memuat pengaturan kenaikan.'}</div>
            ) : !isPromotionFeatureEnabled ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-800">
                Fitur kenaikan dan kelulusan sedang dimatikan di server. Nyalakan env <code>ACADEMIC_PROMOTION_V2_ENABLED=true</code> saat siap uji.
              </div>
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Tahun Ajaran Sumber</label>
                    <select
                      value={promotionSourceAcademicYearId}
                      onChange={(event) => setPromotionSourceAcademicYearId(event.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">Pilih tahun ajaran sumber</option>
                      {academicYearOptions.map((item) => (
                        <option key={`source-${item.id}`} value={item.id}>
                          {item.name} {item.isActive ? '(Aktif)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Tahun Ajaran Baru</label>
                    <select
                      value={promotionTargetAcademicYearId}
                      onChange={(event) => setPromotionTargetAcademicYearId(event.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">Pilih tahun ajaran baru</option>
                      {academicYearOptions.map((item) => (
                        <option key={`target-${item.id}`} value={item.id}>
                          {item.name} {item.isActive ? '(Aktif)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                    <input type="checkbox" checked={activateTargetYearAfterCommit} onChange={(event) => setActivateTargetYearAfterCommit(event.target.checked)} className="rounded border-slate-300" />
                    Aktifkan tahun ajaran baru setelah proses selesai
                  </label>
                </div>

                {!promotionSourceAcademicYearId || !promotionTargetAcademicYearId ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-4 py-5 text-sm text-slate-600">Pilih tahun ajaran sumber dan tahun ajaran baru untuk memuat data kenaikan.</div>
                ) : !isPromotionSelectionValid ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-800">Tahun ajaran sumber dan tahun ajaran baru harus berbeda.</div>
                ) : promotionWorkspaceQuery.isLoading ? (
                  <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                  </div>
                ) : promotionWorkspaceQuery.isError || !promotionWorkspace ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">{getErrorMessage(promotionWorkspaceQuery.error) || 'Gagal memuat data kenaikan.'}</div>
                ) : (
                  <>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <h3 className="text-base font-semibold text-slate-900">Checklist Kesiapan Sebelum Proses</h3>
                          <p className="mt-1 text-sm text-slate-600">Ringkasan ini membantu admin memastikan data tahun ajaran baru aman sebelum siswa benar-benar dipindahkan.</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs font-semibold">
                          <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">{promotionPreflightReadyCount} siap</span>
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">{promotionPreflightWarningCount} perlu dicek</span>
                          <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">{promotionPreflightBlockedCount} harus diperbaiki</span>
                        </div>
                      </div>
                      <div className={`border-b px-4 py-3 text-sm ${promotionPreflightBlockedCount > 0 ? 'border-red-100 bg-red-50 text-red-700' : promotionPreflightWarningCount > 0 ? 'border-amber-100 bg-amber-50 text-amber-800' : 'border-green-100 bg-green-50 text-green-700'}`}>
                        {promotionPreflightBlockedCount > 0
                          ? 'Belum aman diproses. Selesaikan item berstatus Harus Diperbaiki terlebih dahulu.'
                          : promotionPreflightWarningCount > 0
                            ? 'Secara teknis bisa dilanjutkan jika tidak ada error, tetapi item Perlu Dicek sebaiknya dikonfirmasi dulu.'
                            : 'Preflight terlihat siap. Tetap pastikan data sumber sudah final sebelum menekan proses.'}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-4 py-3 font-semibold">Area</th>
                              <th className="px-4 py-3 font-semibold">Status</th>
                              <th className="px-4 py-3 font-semibold">Dampak</th>
                              <th className="px-4 py-3 font-semibold">Ringkasan Data</th>
                              <th className="px-4 py-3 font-semibold">Langkah Aman</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {promotionPreflightRows.map((item) => {
                              const statusMeta = getPreflightStatusMeta(item.status);
                              return (
                                <tr key={item.key} className="align-top">
                                  <td className="px-4 py-4 font-semibold text-slate-900">{item.area}</td>
                                  <td className="px-4 py-4">
                                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusMeta.className}`}>{statusMeta.label}</span>
                                  </td>
                                  <td className="px-4 py-4 text-slate-600">{item.impact}</td>
                                  <td className="px-4 py-4 text-slate-600">{item.detail}</td>
                                  <td className="px-4 py-4 text-slate-700">{item.nextAction}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Total Siswa Aktif</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{promotionWorkspace.summary.totalStudents}</p>
                        <p className="mt-1 text-xs text-slate-500">Seluruh siswa yang akan diproses.</p>
                      </div>
                      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Naik Kelas</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{promotionWorkspace.summary.promotedStudents}</p>
                        <p className="mt-1 text-xs text-slate-500">Siswa X dan XI yang naik otomatis.</p>
                      </div>
                      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Menjadi Alumni</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{promotionWorkspace.summary.graduatedStudents}</p>
                        <p className="mt-1 text-xs text-slate-500">Siswa XII aktif yang diluluskan.</p>
                      </div>
                      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Tujuan Kelas Siap</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">
                          {promotionWorkspace.summary.configuredPromoteClasses}/{promotionWorkspace.summary.promotableClasses}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">Tujuan kelas sumber ke tahun baru.</p>
                      </div>
                    </div>

                    {promotionWorkspace.validation.errors.length > 0 && (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                        <h3 className="text-sm font-semibold text-red-800">Data yang Harus Diperbaiki</h3>
                        <ul className="mt-2 space-y-1 text-sm text-red-700">
                          {promotionWorkspace.validation.errors.map((item) => (
                            <li key={`promotion-error-${item}`}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {promotionWorkspace.validation.warnings.length > 0 && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <h3 className="text-sm font-semibold text-amber-800">Peringatan</h3>
                        <ul className="mt-2 space-y-1 text-sm text-amber-700">
                          {promotionWorkspace.validation.warnings.map((item) => (
                            <li key={`promotion-warning-${item}`}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">Tujuan Kelas</h3>
                        <p className="text-sm text-slate-600">Simpan tujuan kelas dulu sebelum proses. Kelas tujuan wajib kosong agar data siswa tidak tercampur.</p>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <button type="button" onClick={resetPromotionDraftsToSuggested} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                          Gunakan Saran Otomatis
                        </button>
                        <button
                          type="button"
                          onClick={() => savePromotionMappingsMutation.mutate()}
                          disabled={savePromotionMappingsMutation.isPending}
                          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
                        >
                          {savePromotionMappingsMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                          Simpan Tujuan Kelas
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (hasPromotionMappingDraftChanges) {
                              toast.error('Ada perubahan tujuan kelas yang belum disimpan. Klik Simpan Tujuan Kelas dulu sebelum proses.');
                              return;
                            }
                            if (promotionWorkspace.validation.readyToCommit === false) {
                              toast.error('Masih ada data yang harus diperbaiki sebelum proses.');
                              return;
                            }
                            if (promotionPreflightBlockedCount > 0) {
                              toast.error('Checklist preflight masih memiliki item yang harus diperbaiki.');
                              return;
                            }
                            if (!confirm('Proses kenaikan dan kelulusan sekarang? Data siswa aktif akan berpindah ke tahun ajaran baru.')) {
                              return;
                            }
                            commitPromotionMutation.mutate();
                          }}
                          disabled={commitPromotionMutation.isPending}
                          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                        >
                          {commitPromotionMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                          Proses Kenaikan & Kelulusan
                        </button>
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-slate-50 text-slate-600">
                            <tr>
                              <th className="px-4 py-3 font-medium">Kelas Sumber</th>
                              <th className="px-4 py-3 font-medium">Siswa Aktif</th>
                              <th className="px-4 py-3 font-medium">Aksi</th>
                              <th className="px-4 py-3 font-medium">Kelas Tujuan</th>
                              <th className="px-4 py-3 font-medium">Validasi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {promotionWorkspace.classes.map((item) => {
                              const selectedTargetClassId = getResolvedTargetClassId(item, mappingDrafts);
                              const savedTargetClassId = item.action === 'GRADUATE' ? null : (item.targetClassId ?? null);
                              const hasUnsavedTargetChange = selectedTargetClassId !== savedTargetClassId;
                              return (
                                <tr key={item.sourceClassId} className="align-top">
                                  <td className="px-4 py-4">
                                    <p className="font-semibold text-slate-900">{item.sourceClassName}</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {item.major.code} • Tingkat {item.sourceLevel}
                                    </p>
                                  </td>
                                  <td className="px-4 py-4">
                                    <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{item.studentCount} siswa</div>
                                  </td>
                                  <td className="px-4 py-4">
                                    {item.action === 'GRADUATE' ? (
                                      <div>
                                        <p className="font-medium text-slate-900">Lulus jadi alumni</p>
                                        <p className="mt-1 text-xs text-slate-500">Tidak memerlukan kelas tujuan.</p>
                                      </div>
                                    ) : (
                                      <div>
                                        <p className="font-medium text-slate-900">Naik ke {item.expectedTargetLevel}</p>
                                        <p className="mt-1 text-xs text-slate-500">Sumber {item.mappingSource === 'SAVED' ? 'tujuan tersimpan' : item.mappingSource === 'SUGGESTED' ? 'saran otomatis' : 'belum dipilih'}</p>
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-4">
                                    {item.action === 'GRADUATE' ? (
                                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Alumni</div>
                                    ) : (
                                      <div className="space-y-2">
                                        <select
                                          value={selectedTargetClassId ?? ''}
                                          onChange={(event) =>
                                            setMappingDrafts((current) => ({
                                              ...current,
                                              [item.sourceClassId]: event.target.value ? Number(event.target.value) : null,
                                            }))
                                          }
                                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                        >
                                          <option value="">Pilih kelas tujuan</option>
                                          {item.targetOptions.map((option) => (
                                            <option key={option.id} value={option.id}>
                                              {option.name} ({option.currentStudentCount} siswa aktif)
                                            </option>
                                          ))}
                                        </select>
                                        <p className="text-xs text-slate-500">Saran: {item.suggestedTargetClassId ? item.targetOptions.find((option) => option.id === item.suggestedTargetClassId)?.name || '-' : 'Belum ada'}</p>
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-4">
                                    {hasUnsavedTargetChange ? (
                                      <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Perubahan tujuan kelas belum disimpan.</div>
                                    ) : item.validation.errors.length === 0 && item.validation.warnings.length === 0 ? (
                                      <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">Siap</span>
                                    ) : (
                                      <div className="space-y-2">
                                        {item.validation.errors.map((entry) => (
                                          <div key={`${item.sourceClassId}-error-${entry}`} className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                                            {entry}
                                          </div>
                                        ))}
                                        {item.validation.warnings.map((entry) => (
                                          <div key={`${item.sourceClassId}-warning-${entry}`} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                            {entry}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Riwayat Proses Tahun Ajaran</h2>
              <p className="text-sm text-slate-600">Pantau proses kenaikan, kelulusan, dan pembatalan untuk kombinasi tahun ajaran yang dipilih.</p>
            </div>
            <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Tahun Ajaran Sumber</label>
                <select
                  value={promotionSourceAcademicYearId}
                  onChange={(event) => setPromotionSourceAcademicYearId(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:w-56"
                >
                  <option value="">Pilih tahun ajaran sumber</option>
                  {academicYearOptions.map((item) => (
                    <option key={`history-source-${item.id}`} value={item.id}>
                      {item.name} {item.isActive ? '(Aktif)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Tahun Ajaran Baru</label>
                <select
                  value={promotionTargetAcademicYearId}
                  onChange={(event) => setPromotionTargetAcademicYearId(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:w-56"
                >
                  <option value="">Pilih tahun ajaran baru</option>
                  {academicYearOptions.map((item) => (
                    <option key={`history-target-${item.id}`} value={item.id}>
                      {item.name} {item.isActive ? '(Aktif)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {promotionFeatureFlagsQuery.isLoading ? (
            <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-12">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : promotionFeatureFlagsQuery.isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">{getErrorMessage(promotionFeatureFlagsQuery.error) || 'Gagal memuat pengaturan kenaikan.'}</div>
          ) : !isPromotionFeatureEnabled ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-800">Fitur kenaikan dan kelulusan sedang dimatikan di server.</div>
          ) : !promotionSourceAcademicYearId || !promotionTargetAcademicYearId ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">Pilih tahun ajaran sumber dan tahun ajaran baru untuk melihat riwayat proses.</div>
          ) : !isPromotionSelectionValid ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-800">Tahun ajaran sumber dan tahun ajaran baru harus berbeda.</div>
          ) : promotionWorkspaceQuery.isLoading ? (
            <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-12">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : promotionWorkspaceQuery.isError || !promotionWorkspace ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">{getErrorMessage(promotionWorkspaceQuery.error) || 'Gagal memuat riwayat proses.'}</div>
          ) : promotionWorkspace.recentRuns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Belum ada proses kenaikan untuk kombinasi tahun ini.</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Proses</th>
                      <th className="px-4 py-3 font-semibold">Tanggal</th>
                      <th className="px-4 py-3 font-semibold">Siswa Naik</th>
                      <th className="px-4 py-3 font-semibold">Alumni</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {promotionWorkspace.recentRuns.map((run) => (
                      <tr key={`history-run-${run.id}`} className="align-top">
                        <td className="px-4 py-4 font-semibold text-slate-900">Proses #{run.id}</td>
                        <td className="px-4 py-4 text-slate-600">
                          <p>{formatDateTime(run.committedAt || run.createdAt)}</p>
                          {run.createdBy?.name && <p className="mt-1 text-xs text-slate-500">Oleh {run.createdBy.name}</p>}
                          {run.rolledBackAt && (
                            <p className="mt-1 text-xs text-amber-700">
                              Dibatalkan {formatDateTime(run.rolledBackAt)}
                              {run.rolledBackBy?.name ? ` oleh ${run.rolledBackBy.name}` : ''}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4 text-slate-700">{run.promotedStudents}</td>
                        <td className="px-4 py-4 text-slate-700">{run.graduatedStudents}</td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              run.status === 'ROLLED_BACK' ? 'bg-amber-100 text-amber-800' : run.status === 'COMMITTED' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {getPromotionRunStatusLabel(run.status)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button
                            type="button"
                            disabled={!run.canRollback || rollbackPromotionMutation.isPending}
                            onClick={() => {
                              if (!run.canRollback) {
                                toast.error(run.rollbackBlockedReason || 'Proses ini belum bisa dibatalkan.');
                                return;
                              }
                              if (!confirm(`Batalkan proses #${run.id}? Data siswa akan dikembalikan ke kondisi sebelum proses ini.`)) {
                                return;
                              }
                              rollbackPromotionMutation.mutate(run.id);
                            }}
                            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                            title={run.rollbackBlockedReason || 'Batalkan proses ini'}
                          >
                            {rollbackPromotionMutation.isPending ? 'Membatalkan...' : 'Batalkan'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
