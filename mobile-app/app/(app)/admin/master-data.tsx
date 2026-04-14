import { type ReactNode, useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileDetailModal } from '../../../src/components/MobileDetailModal';
import { MobileMenuTabBar } from '../../../src/components/MobileMenuTabBar';
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { MobileSummaryCard } from '../../../src/components/MobileSummaryCard';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { type AdminClass, type AdminExtracurricular, type AdminMajor, type AdminSubject, type AdminSubjectCategory, type AdminTrainingClass, adminApi } from '../../../src/features/admin/adminApi';
import {
  EXTRACURRICULAR_CATEGORY_OPTIONS,
  getExtracurricularCategoryLabel,
  type ExtracurricularCategory,
} from '../../../src/features/extracurricular/category';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { notifyApiError, notifyInfo, notifySuccess } from '../../../src/lib/ui/feedback';

type MasterDataSection =
  | 'overview'
  | 'majors'
  | 'classes'
  | 'training-classes'
  | 'subjects'
  | 'subject-categories'
  | 'extracurriculars';
type MasterDataSummaryId = 'majors' | 'subjects' | 'classes' | 'categories';

const MASTER_DATA_SECTIONS: Array<{
  key: MasterDataSection;
  label: string;
  description: string;
}> = [
  { key: 'overview', label: 'Ringkasan', description: 'Ringkasan semua master data inti.' },
  { key: 'majors', label: 'Jurusan', description: 'Kelola kompetensi keahlian/jurusan.' },
  { key: 'classes', label: 'Kelas', description: 'Kelola data kelas aktif per tahun ajaran.' },
  { key: 'training-classes', label: 'Kelas Training', description: 'Kelola data kelas training sekolah.' },
  { key: 'subjects', label: 'Mapel', description: 'Kelola mata pelajaran dan relasinya.' },
  { key: 'subject-categories', label: 'Kategori', description: 'Kelola kategori mata pelajaran.' },
  { key: 'extracurriculars', label: 'Ekskul', description: 'Kelola data ekstrakurikuler dan organisasi siswa.' },
];

const MASTER_DATA_SECTION_BY_KEY = new Map(MASTER_DATA_SECTIONS.map((item) => [item.key, item] as const));
const getSingleParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function hasAnyDuty(userDuties: string[] | undefined, expected: string[]) {
  const owned = new Set((userDuties || []).map((item) => String(item || '').trim().toUpperCase()));
  return expected.some((item) => owned.has(String(item || '').trim().toUpperCase()));
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: BRAND_COLORS.white,
        borderWidth: 1,
        borderColor: '#d6e0f2',
        borderRadius: 16,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <Text style={{ color: BRAND_COLORS.textDark, fontSize: 16, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2, marginBottom: 10 }}>{subtitle}</Text>
      {children}
    </View>
  );
}

const toNullableNumber = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const subjectKkmDisplay = (item: AdminSubject, classLevel: 'X' | 'XI' | 'XII') =>
  item.kkms?.find((kkm) => kkm.classLevel === classLevel)?.kkm ?? '-';

export default function AdminMasterDataScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets);
  const [search, setSearch] = useState('');
  const [activeSummaryId, setActiveSummaryId] = useState<MasterDataSummaryId | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const [majorForm, setMajorForm] = useState({ code: '', name: '', description: '' });
  const [editingMajorId, setEditingMajorId] = useState<number | null>(null);

  const [categoryForm, setCategoryForm] = useState({ code: '', name: '', description: '' });
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);

  const [subjectForm, setSubjectForm] = useState({
    code: '',
    name: '',
    description: '',
    subjectCategoryId: '',
    kkmX: '',
    kkmXI: '',
    kkmXII: '',
  });
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);

  const [classForm, setClassForm] = useState({
    level: 'X',
    majorId: '',
    academicYearId: '',
    baseName: '',
    rombelCount: '1',
    teacherId: '',
  });
  const [classTeacherSearch, setClassTeacherSearch] = useState('');
  const [editingClassId, setEditingClassId] = useState<number | null>(null);

  const [trainingForm, setTrainingForm] = useState({
    name: '',
    description: '',
    academicYearId: '',
    instructorId: '',
    maxCapacity: '',
    isActive: true,
  });
  const [trainingInstructorSearch, setTrainingInstructorSearch] = useState('');
  const [editingTrainingClassId, setEditingTrainingClassId] = useState<number | null>(null);

  const [extracurricularForm, setExtracurricularForm] = useState<{
    name: string;
    description: string;
    category: ExtracurricularCategory;
  }>({
    name: '',
    description: '',
    category: 'EXTRACURRICULAR',
  });
  const [editingExtracurricularId, setEditingExtracurricularId] = useState<number | null>(null);

  const isAdmin = user?.role === 'ADMIN';
  const isCurriculumTeacher =
    user?.role === 'TEACHER' &&
    hasAnyDuty(user?.additionalDuties, ['WAKASEK_KURIKULUM', 'SEKRETARIS_KURIKULUM']);
  const isStudentAffairsTeacher =
    user?.role === 'TEACHER' &&
    hasAnyDuty(user?.additionalDuties, ['WAKASEK_KESISWAAN', 'SEKRETARIS_KESISWAAN']);
  const canAccess = isAdmin || isCurriculumTeacher || isStudentAffairsTeacher;

  const allowedSections = useMemo<MasterDataSection[]>(() => {
    if (isAdmin) return MASTER_DATA_SECTIONS.map((item) => item.key);

    const next = new Set<MasterDataSection>(['overview']);
    if (isCurriculumTeacher) {
      next.add('subjects');
      next.add('subject-categories');
    }
    if (isStudentAffairsTeacher) {
      next.add('extracurriculars');
    }
    return Array.from(next);
  }, [isAdmin, isCurriculumTeacher, isStudentAffairsTeacher]);
  const allowedSectionSet = useMemo(() => new Set(allowedSections), [allowedSections]);

  const sectionParam = String(getSingleParam(params.section) || '').trim().toLowerCase();
  const requestedSection: MasterDataSection = MASTER_DATA_SECTION_BY_KEY.has(sectionParam as MasterDataSection)
    ? (sectionParam as MasterDataSection)
    : 'overview';
  const defaultSection: MasterDataSection = allowedSectionSet.has('overview')
    ? 'overview'
    : allowedSections[0] || 'overview';
  const activeSection: MasterDataSection = allowedSectionSet.has(requestedSection)
    ? requestedSection
    : defaultSection;
  const sectionMeta = MASTER_DATA_SECTION_BY_KEY.get(activeSection) || MASTER_DATA_SECTIONS[0];

  const openSection = (section: MasterDataSection) => {
    const target = section === 'overview' ? '/admin/master-data' : `/admin/master-data?section=${section}`;
    router.replace(target as never);
  };

  const masterDataQuery = useQuery({
    queryKey: ['mobile-admin-master-data-v2', activeSection],
    queryFn: async () => {
      const [majors, subjects, classes, categories, extracurriculars, years, teachers, trainingClasses] = await Promise.all([
        adminApi.listMajors({ page: 1, limit: 300 }),
        adminApi.listSubjects({ page: 1, limit: 400 }),
        adminApi.listClasses({ page: 1, limit: 300 }),
        adminApi.listSubjectCategories(),
        adminApi.listExtracurriculars({ page: 1, limit: 200 }).catch(() => null),
        adminApi.listAcademicYears({ page: 1, limit: 100 }),
        adminApi.listUsers({ role: 'TEACHER' }).catch(() => []),
        adminApi.listTrainingClasses({ page: 1, limit: 200 }).catch(() => null),
      ]);
      return { majors, subjects, classes, categories, extracurriculars, years, teachers, trainingClasses };
    },
  });

  const runAction = async (actionKey: string, fn: () => Promise<void>, successMessage?: string) => {
    if (pendingAction) return;
    setPendingAction(actionKey);
    try {
      await fn();
      if (successMessage) notifySuccess(successMessage);
      await masterDataQuery.refetch();
    } catch (error: unknown) {
      notifyApiError(error, 'Operasi gagal dijalankan.');
    } finally {
      setPendingAction(null);
    }
  };

  const majors = useMemo(() => masterDataQuery.data?.majors.items || [], [masterDataQuery.data?.majors.items]);
  const subjects = useMemo(() => masterDataQuery.data?.subjects.items || [], [masterDataQuery.data?.subjects.items]);
  const classes = useMemo(() => masterDataQuery.data?.classes.items || [], [masterDataQuery.data?.classes.items]);
  const categories = useMemo(() => masterDataQuery.data?.categories || [], [masterDataQuery.data?.categories]);
  const extracurricularsResult = masterDataQuery.data?.extracurriculars || null;
  const extracurriculars = useMemo(
    () => extracurricularsResult?.items || [],
    [extracurricularsResult?.items],
  );
  const academicYears = useMemo(() => masterDataQuery.data?.years.items || [], [masterDataQuery.data?.years.items]);
  const teachers = useMemo(
    () => (masterDataQuery.data?.teachers || []).filter((item) => item.role === 'TEACHER'),
    [masterDataQuery.data?.teachers],
  );
  const trainingClassesResult = masterDataQuery.data?.trainingClasses || null;
  const trainingClasses = useMemo(
    () => trainingClassesResult?.items || [],
    [trainingClassesResult?.items],
  );

  const query = search.trim().toLowerCase();
  const filteredMajors = useMemo(() => {
    if (!query) return majors;
    return majors.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.code.toLowerCase().includes(query) ||
        (item.description || '').toLowerCase().includes(query),
    );
  }, [majors, query]);

  const filteredCategories = useMemo(() => {
    if (!query) return categories;
    return categories.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.code.toLowerCase().includes(query) ||
        (item.description || '').toLowerCase().includes(query),
    );
  }, [categories, query]);

  const filteredSubjects = useMemo(() => {
    if (!query) return subjects;
    return subjects.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.code.toLowerCase().includes(query) ||
        (item.category?.name || '').toLowerCase().includes(query),
    );
  }, [subjects, query]);

  const filteredClasses = useMemo(() => {
    if (!query) return classes;
    return classes.filter((item) => {
      const haystack = `${item.name} ${item.level} ${item.major?.name || ''} ${item.major?.code || ''} ${item.teacher?.name || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [classes, query]);

  const filteredTrainingClasses = useMemo(() => {
    if (!query) return trainingClasses;
    return trainingClasses.filter((item) => {
      const haystack = `${item.name} ${item.description || ''} ${item.instructor?.name || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [trainingClasses, query]);

  const filteredExtracurriculars = useMemo(() => {
    if (!query) return extracurriculars;
    return extracurriculars.filter((item) => {
      const haystack = `${item.name} ${item.description || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [extracurriculars, query]);

  const filteredTeachersForClass = useMemo(() => {
    const q = classTeacherSearch.trim().toLowerCase();
    if (!q) return teachers.slice(0, 24);
    return teachers
      .filter((item) => `${item.name} ${item.username}`.toLowerCase().includes(q))
      .slice(0, 32);
  }, [teachers, classTeacherSearch]);

  const filteredTeachersForTraining = useMemo(() => {
    const q = trainingInstructorSearch.trim().toLowerCase();
    if (!q) return teachers.slice(0, 24);
    return teachers
      .filter((item) => `${item.name} ${item.username}`.toLowerCase().includes(q))
      .slice(0, 32);
  }, [teachers, trainingInstructorSearch]);

  const selectedClassTeacher = teachers.find((item) => String(item.id) === classForm.teacherId) || null;
  const selectedTrainingInstructor = teachers.find((item) => String(item.id) === trainingForm.instructorId) || null;
  const selectedSubjectCategory = categories.find((item) => String(item.id) === subjectForm.subjectCategoryId) || null;
  const sectionItems = useMemo(
    () =>
      MASTER_DATA_SECTIONS.filter((item) => allowedSectionSet.has(item.key)).map((item) => ({
        key: item.key,
        label: item.label,
      })),
    [allowedSectionSet],
  );
  const summaryCards = useMemo<
    Array<{
      id: MasterDataSummaryId;
      title: string;
      value: string;
      subtitle: string;
      iconName: React.ComponentProps<typeof Feather>['name'];
      accentColor: string;
    }>
  >(
    () => [
      {
        id: 'majors',
        title: 'Total Jurusan',
        value: String(majors.length),
        subtitle: 'Kompetensi aktif',
        iconName: 'briefcase',
        accentColor: '#7c3aed',
      },
      {
        id: 'subjects',
        title: 'Total Mapel',
        value: String(subjects.length),
        subtitle: 'Mapel tersusun',
        iconName: 'book-open',
        accentColor: '#0f766e',
      },
      {
        id: 'classes',
        title: 'Total Kelas',
        value: String(classes.length),
        subtitle: 'Kelas aktif',
        iconName: 'layout',
        accentColor: '#2563eb',
      },
      {
        id: 'categories',
        title: 'Kategori Mapel',
        value: String(categories.length),
        subtitle: 'Kategori kurikulum',
        iconName: 'layers',
        accentColor: '#f59e0b',
      },
    ],
    [categories.length, classes.length, majors.length, subjects.length],
  );
  const activeSummaryMeta = summaryCards.find((item) => item.id === activeSummaryId) || null;
  const subjectCategoryOptions = useMemo(
    () => categories.map((item) => ({ label: item.name, value: String(item.id) })),
    [categories],
  );
  const classLevelOptions = useMemo(
    () => ['X', 'XI', 'XII'].map((level) => ({ label: level, value: level })),
    [],
  );
  const academicYearOptions = useMemo(
    () => academicYears.map((item) => ({ label: item.name, value: String(item.id) })),
    [academicYears],
  );
  const majorOptions = useMemo(
    () => majors.map((item) => ({ label: `${item.code} - ${item.name}`, value: String(item.id) })),
    [majors],
  );
  const classTeacherOptions = useMemo(
    () => [
      { label: 'Tanpa wali kelas', value: '' },
      ...filteredTeachersForClass.map((item) => ({
        label: `${item.name} (@${item.username})`,
        value: String(item.id),
      })),
    ],
    [filteredTeachersForClass],
  );
  const trainingInstructorOptions = useMemo(
    () => [
      { label: 'Tanpa instruktur', value: '' },
      ...filteredTeachersForTraining.map((item) => ({
        label: `${item.name} (@${item.username})`,
        value: String(item.id),
      })),
    ],
    [filteredTeachersForTraining],
  );
  const trainingStatusOptions = useMemo(
    () => [
      { label: 'Aktif', value: 'ACTIVE' },
      { label: 'Nonaktif', value: 'INACTIVE' },
    ],
    [],
  );
  const extracurricularCategoryOptions = useMemo(
    () => EXTRACURRICULAR_CATEGORY_OPTIONS.map((item) => ({ label: item.label, value: item.value })),
    [],
  );
  const shouldShow = (section: MasterDataSection) =>
    allowedSectionSet.has(section) && (activeSection === 'overview' || activeSection === section);

  const resetMajorForm = () => {
    setMajorForm({ code: '', name: '', description: '' });
    setEditingMajorId(null);
  };

  const submitMajor = async () => {
    const payload = {
      code: majorForm.code.trim(),
      name: majorForm.name.trim(),
      description: majorForm.description.trim() || null,
    };
    if (!payload.code || !payload.name) {
      notifyInfo('Kode dan nama jurusan wajib diisi.');
      return;
    }
    if (editingMajorId) {
      await runAction(
        `major-update-${editingMajorId}`,
        async () => {
          await adminApi.updateMajor(editingMajorId, payload);
          resetMajorForm();
        },
        'Jurusan berhasil diperbarui.',
      );
      return;
    }
    await runAction(
      'major-create',
      async () => {
        await adminApi.createMajor(payload);
        resetMajorForm();
      },
      'Jurusan berhasil dibuat.',
    );
  };

  const editMajor = (item: AdminMajor) => {
    setEditingMajorId(item.id);
    setMajorForm({
      code: item.code || '',
      name: item.name || '',
      description: item.description || '',
    });
    openSection('majors');
  };

  const confirmDeleteMajor = (item: AdminMajor) => {
    Alert.alert('Hapus Jurusan', `Hapus jurusan "${item.code} - ${item.name}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          void runAction(`major-delete-${item.id}`, async () => {
            await adminApi.deleteMajor(item.id);
            if (editingMajorId === item.id) resetMajorForm();
          }, 'Jurusan berhasil dihapus.');
        },
      },
    ]);
  };

  const resetCategoryForm = () => {
    setCategoryForm({ code: '', name: '', description: '' });
    setEditingCategoryId(null);
  };

  const submitCategory = async () => {
    const payload = {
      code: categoryForm.code.trim(),
      name: categoryForm.name.trim(),
      description: categoryForm.description.trim() || null,
    };
    if (!payload.code || !payload.name) {
      notifyInfo('Kode dan nama kategori wajib diisi.');
      return;
    }
    if (editingCategoryId) {
      await runAction(
        `category-update-${editingCategoryId}`,
        async () => {
          await adminApi.updateSubjectCategory(editingCategoryId, payload);
          resetCategoryForm();
        },
        'Kategori mapel berhasil diperbarui.',
      );
      return;
    }
    await runAction(
      'category-create',
      async () => {
        await adminApi.createSubjectCategory(payload);
        resetCategoryForm();
      },
      'Kategori mapel berhasil dibuat.',
    );
  };

  const editCategory = (item: AdminSubjectCategory) => {
    setEditingCategoryId(item.id);
    setCategoryForm({
      code: item.code || '',
      name: item.name || '',
      description: item.description || '',
    });
    openSection('subject-categories');
  };

  const confirmDeleteCategory = (item: AdminSubjectCategory) => {
    Alert.alert('Hapus Kategori', `Hapus kategori "${item.code} - ${item.name}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          void runAction(`category-delete-${item.id}`, async () => {
            await adminApi.deleteSubjectCategory(item.id);
            if (editingCategoryId === item.id) resetCategoryForm();
          }, 'Kategori mapel berhasil dihapus.');
        },
      },
    ]);
  };

  const resetSubjectForm = () => {
    setSubjectForm({
      code: '',
      name: '',
      description: '',
      subjectCategoryId: '',
      kkmX: '',
      kkmXI: '',
      kkmXII: '',
    });
    setEditingSubjectId(null);
  };

  const submitSubject = async () => {
    const payload = {
      code: subjectForm.code.trim(),
      name: subjectForm.name.trim(),
      description: subjectForm.description.trim() || null,
      subjectCategoryId: Number(subjectForm.subjectCategoryId),
      kkmX: toNullableNumber(subjectForm.kkmX),
      kkmXI: toNullableNumber(subjectForm.kkmXI),
      kkmXII: toNullableNumber(subjectForm.kkmXII),
    };
    if (!payload.code || !payload.name || !payload.subjectCategoryId) {
      notifyInfo('Kode, nama mapel, dan kategori wajib diisi.');
      return;
    }
    if (editingSubjectId) {
      await runAction(
        `subject-update-${editingSubjectId}`,
        async () => {
          await adminApi.updateSubject(editingSubjectId, payload);
          resetSubjectForm();
        },
        'Mata pelajaran berhasil diperbarui.',
      );
      return;
    }
    await runAction(
      'subject-create',
      async () => {
        await adminApi.createSubject(payload);
        resetSubjectForm();
      },
      'Mata pelajaran berhasil dibuat.',
    );
  };

  const editSubject = (item: AdminSubject) => {
    setEditingSubjectId(item.id);
    setSubjectForm({
      code: item.code || '',
      name: item.name || '',
      description: '',
      subjectCategoryId: String(item.category?.id || ''),
      kkmX: String(subjectKkmDisplay(item, 'X') === '-' ? '' : subjectKkmDisplay(item, 'X')),
      kkmXI: String(subjectKkmDisplay(item, 'XI') === '-' ? '' : subjectKkmDisplay(item, 'XI')),
      kkmXII: String(subjectKkmDisplay(item, 'XII') === '-' ? '' : subjectKkmDisplay(item, 'XII')),
    });
    openSection('subjects');
  };

  const confirmDeleteSubject = (item: AdminSubject) => {
    Alert.alert('Hapus Mata Pelajaran', `Hapus mapel "${item.code} - ${item.name}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          void runAction(`subject-delete-${item.id}`, async () => {
            await adminApi.deleteSubject(item.id);
            if (editingSubjectId === item.id) resetSubjectForm();
          }, 'Mata pelajaran berhasil dihapus.');
        },
      },
    ]);
  };

  const resetClassForm = () => {
    setClassForm({
      level: 'X',
      majorId: '',
      academicYearId: '',
      baseName: '',
      rombelCount: '1',
      teacherId: '',
    });
    setClassTeacherSearch('');
    setEditingClassId(null);
  };

  const submitClass = async () => {
    const level = classForm.level.trim();
    const majorId = Number(classForm.majorId);
    const academicYearId = Number(classForm.academicYearId);
    const baseName = classForm.baseName.trim();
    const teacherId = toNullableNumber(classForm.teacherId);
    const rombelCount = Math.max(1, Math.min(50, Number(classForm.rombelCount) || 1));

    if (!level || !majorId || !academicYearId || !baseName) {
      notifyInfo('Level, jurusan, tahun ajaran, dan nama dasar kelas wajib diisi.');
      return;
    }

    if (editingClassId) {
      await runAction(
        `class-update-${editingClassId}`,
        async () => {
          await adminApi.updateClass(editingClassId, {
            name: `${level} ${baseName}`.trim(),
            level,
            majorId,
            academicYearId,
            teacherId,
          });
          resetClassForm();
        },
        'Kelas berhasil diperbarui.',
      );
      return;
    }

    await runAction(
      'class-create',
      async () => {
        for (let index = 1; index <= rombelCount; index += 1) {
          await adminApi.createClass({
            name: `${level} ${baseName} ${index}`.trim(),
            level,
            majorId,
            academicYearId,
            teacherId,
          });
        }
        resetClassForm();
      },
      rombelCount > 1 ? `${rombelCount} kelas berhasil dibuat.` : 'Kelas berhasil dibuat.',
    );
  };

  const editClass = (item: AdminClass) => {
    setEditingClassId(item.id);
    setClassForm({
      level: item.level || 'X',
      majorId: String(item.major?.id || ''),
      academicYearId: String(item.academicYear?.id || ''),
      baseName: (item.name || '').replace(item.level || '', '').trim(),
      rombelCount: '1',
      teacherId: String(item.teacher?.id || ''),
    });
    setClassTeacherSearch('');
    openSection('classes');
  };

  const confirmDeleteClass = (item: AdminClass) => {
    Alert.alert('Hapus Kelas', `Hapus kelas "${item.name}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          void runAction(`class-delete-${item.id}`, async () => {
            await adminApi.deleteClass(item.id);
            if (editingClassId === item.id) resetClassForm();
          }, 'Kelas berhasil dihapus.');
        },
      },
    ]);
  };

  const resetTrainingForm = () => {
    setTrainingForm({
      name: '',
      description: '',
      academicYearId: '',
      instructorId: '',
      maxCapacity: '',
      isActive: true,
    });
    setTrainingInstructorSearch('');
    setEditingTrainingClassId(null);
  };

  const submitTrainingClass = async () => {
    const payload = {
      name: trainingForm.name.trim(),
      description: trainingForm.description.trim() || null,
      academicYearId: Number(trainingForm.academicYearId),
      instructorId: toNullableNumber(trainingForm.instructorId),
      maxCapacity: toNullableNumber(trainingForm.maxCapacity),
      isActive: trainingForm.isActive,
    };
    if (!payload.name || !payload.academicYearId) {
      notifyInfo('Nama kelas training dan tahun ajaran wajib diisi.');
      return;
    }
    if (editingTrainingClassId) {
      await runAction(
        `training-update-${editingTrainingClassId}`,
        async () => {
          await adminApi.updateTrainingClass(editingTrainingClassId, payload);
          resetTrainingForm();
        },
        'Kelas training berhasil diperbarui.',
      );
      return;
    }
    await runAction(
      'training-create',
      async () => {
        await adminApi.createTrainingClass(payload);
        resetTrainingForm();
      },
      'Kelas training berhasil dibuat.',
    );
  };

  const editTrainingClass = (item: AdminTrainingClass) => {
    setEditingTrainingClassId(item.id);
    setTrainingForm({
      name: item.name || '',
      description: item.description || '',
      academicYearId: String(item.academicYearId || item.academicYear?.id || ''),
      instructorId: String(item.instructorId || item.instructor?.id || ''),
      maxCapacity: String(item.maxCapacity || ''),
      isActive: item.isActive !== false,
    });
    setTrainingInstructorSearch('');
    openSection('training-classes');
  };

  const confirmDeleteTrainingClass = (item: AdminTrainingClass) => {
    Alert.alert('Hapus Kelas Training', `Hapus kelas training "${item.name}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          void runAction(`training-delete-${item.id}`, async () => {
            await adminApi.deleteTrainingClass(item.id);
            if (editingTrainingClassId === item.id) resetTrainingForm();
          }, 'Kelas training berhasil dihapus.');
        },
      },
    ]);
  };

  const resetExtracurricularForm = () => {
    setExtracurricularForm({ name: '', description: '', category: 'EXTRACURRICULAR' });
    setEditingExtracurricularId(null);
  };

  const submitExtracurricular = async () => {
    const payload = {
      name: extracurricularForm.name.trim(),
      description: extracurricularForm.description.trim() || null,
      category: extracurricularForm.category,
    };
    if (!payload.name) {
      notifyInfo('Nama ekstrakurikuler wajib diisi.');
      return;
    }
    if (editingExtracurricularId) {
      await runAction(
        `ekskul-update-${editingExtracurricularId}`,
        async () => {
          await adminApi.updateExtracurricular(editingExtracurricularId, payload);
          resetExtracurricularForm();
        },
        'Ekstrakurikuler berhasil diperbarui.',
      );
      return;
    }
    await runAction(
      'ekskul-create',
      async () => {
        await adminApi.createExtracurricular(payload);
        resetExtracurricularForm();
      },
      'Ekstrakurikuler berhasil dibuat.',
    );
  };

  const editExtracurricular = (item: AdminExtracurricular) => {
    setEditingExtracurricularId(item.id);
    setExtracurricularForm({
      name: item.name || '',
      description: item.description || '',
      category: item.category || 'EXTRACURRICULAR',
    });
    openSection('extracurriculars');
  };

  const confirmDeleteExtracurricular = (item: AdminExtracurricular) => {
    Alert.alert('Hapus Ekstrakurikuler', `Hapus ekstrakurikuler "${item.name}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          void runAction(`ekskul-delete-${item.id}`, async () => {
            await adminApi.deleteExtracurricular(item.id);
            if (editingExtracurricularId === item.id) resetExtracurricularForm();
          }, 'Ekstrakurikuler berhasil dihapus.');
        },
      },
    ]);
  };

  if (isLoading) return <AppLoadingScreen message="Memuat modul admin..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (!canAccess) return <Redirect href="/home" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#e9eefb' }}
      contentContainerStyle={{
        ...pageContentPadding,
        paddingHorizontal: 16,
        paddingBottom: 24,
      }}
      refreshControl={
        <RefreshControl
          refreshing={masterDataQuery.isFetching && !masterDataQuery.isLoading}
          onRefresh={() => masterDataQuery.refetch()}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: BRAND_COLORS.white,
            borderWidth: 1,
            borderColor: '#d6e0f2',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="arrow-left" size={18} color={BRAND_COLORS.textDark} />
        </Pressable>
        <Text style={{ marginLeft: 10, color: BRAND_COLORS.textDark, fontSize: 20, fontWeight: '700' }}>Master Data</Text>
      </View>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>{sectionMeta.description}</Text>

      <MobileMenuTabBar
        items={sectionItems}
        activeKey={activeSection}
        onChange={(key) => openSection(key as MasterDataSection)}
        style={{ marginBottom: 12 }}
        contentContainerStyle={{ paddingRight: 8 }}
        minTabWidth={74}
        maxTabWidth={108}
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: BRAND_COLORS.white,
          borderWidth: 1,
          borderColor: '#d5e0f5',
          borderRadius: 999,
          paddingHorizontal: 12,
          marginBottom: 12,
        }}
      >
        <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari data di section aktif"
          placeholderTextColor="#94a3b8"
          style={{ flex: 1, color: BRAND_COLORS.textDark, paddingVertical: 10, paddingHorizontal: 10 }}
        />
      </View>

      {masterDataQuery.isLoading ? <QueryStateView type="loading" message="Memuat data master..." /> : null}
      {masterDataQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat master data admin." onRetry={() => masterDataQuery.refetch()} />
      ) : null}

      {!masterDataQuery.isLoading && !masterDataQuery.isError ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 12 }}>
            {summaryCards.map((item) => (
              <View key={item.id} style={{ width: '48.5%', marginBottom: 8 }}>
                <MobileSummaryCard
                  title={item.title}
                  value={item.value}
                  subtitle={item.subtitle}
                  iconName={item.iconName}
                  accentColor={item.accentColor}
                  onPress={() => setActiveSummaryId(item.id)}
                />
              </View>
            ))}
          </View>

          {shouldShow('majors') ? (
            <SectionCard
              title={editingMajorId ? 'Edit Jurusan' : 'Tambah Jurusan'}
              subtitle="Setara modul web: create, update, delete jurusan."
            >
              <TextInput
                value={majorForm.code}
                onChangeText={(value) => setMajorForm((prev) => ({ ...prev, code: value.toUpperCase() }))}
                placeholder="Kode jurusan"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 8,
                }}
              />
              <TextInput
                value={majorForm.name}
                onChangeText={(value) => setMajorForm((prev) => ({ ...prev, name: value }))}
                placeholder="Nama jurusan"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 8,
                }}
              />
              <TextInput
                value={majorForm.description}
                onChangeText={(value) => setMajorForm((prev) => ({ ...prev, description: value }))}
                placeholder="Deskripsi (opsional)"
                placeholderTextColor="#94a3b8"
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  minHeight: 70,
                  marginBottom: 8,
                }}
              />
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                <Pressable
                  onPress={() => {
                    void submitMajor();
                  }}
                  disabled={!!pendingAction}
                  style={{
                    flex: 1,
                    backgroundColor: BRAND_COLORS.blue,
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    opacity: pendingAction ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{editingMajorId ? 'Update' : 'Simpan'}</Text>
                </Pressable>
                <Pressable
                  onPress={resetMajorForm}
                  disabled={!!pendingAction}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    backgroundColor: '#fff',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    opacity: pendingAction ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>Bersihkan</Text>
                </Pressable>
              </View>
              {filteredMajors.slice(0, 30).map((item) => (
                <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                    {item.code} - {item.name}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>
                    {item._count?.classes || 0} kelas terhubung
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={() => editMajor(item)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#bfdbfe',
                        backgroundColor: '#eff6ff',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Edit</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmDeleteMajor(item)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        backgroundColor: '#fef2f2',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 12 }}>Hapus</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              {filteredMajors.length === 0 ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                  Data jurusan tidak ditemukan.
                </Text>
              ) : null}
            </SectionCard>
          ) : null}

          {shouldShow('subject-categories') ? (
            <SectionCard
              title={editingCategoryId ? 'Edit Kategori Mapel' : 'Tambah Kategori Mapel'}
              subtitle="Setara modul web: create, update, delete kategori."
            >
              <TextInput
                value={categoryForm.code}
                onChangeText={(value) => setCategoryForm((prev) => ({ ...prev, code: value.toUpperCase() }))}
                placeholder="Kode kategori"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 8,
                }}
              />
              <TextInput
                value={categoryForm.name}
                onChangeText={(value) => setCategoryForm((prev) => ({ ...prev, name: value }))}
                placeholder="Nama kategori"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 8,
                }}
              />
              <TextInput
                value={categoryForm.description}
                onChangeText={(value) => setCategoryForm((prev) => ({ ...prev, description: value }))}
                placeholder="Deskripsi (opsional)"
                placeholderTextColor="#94a3b8"
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  minHeight: 70,
                  marginBottom: 8,
                }}
              />
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                <Pressable
                  onPress={() => {
                    void submitCategory();
                  }}
                  disabled={!!pendingAction}
                  style={{
                    flex: 1,
                    backgroundColor: BRAND_COLORS.blue,
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    opacity: pendingAction ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{editingCategoryId ? 'Update' : 'Simpan'}</Text>
                </Pressable>
                <Pressable
                  onPress={resetCategoryForm}
                  disabled={!!pendingAction}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    backgroundColor: '#fff',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    opacity: pendingAction ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>Bersihkan</Text>
                </Pressable>
              </View>
              {filteredCategories.slice(0, 30).map((item) => (
                <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                    {item.code} - {item.name}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>
                    Jumlah mapel: {item._count?.subjects || 0}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={() => editCategory(item)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#bfdbfe',
                        backgroundColor: '#eff6ff',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Edit</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmDeleteCategory(item)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        backgroundColor: '#fef2f2',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 12 }}>Hapus</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              {filteredCategories.length === 0 ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                  Data kategori mapel tidak ditemukan.
                </Text>
              ) : null}
            </SectionCard>
          ) : null}

          {shouldShow('subjects') ? (
            <SectionCard
              title={editingSubjectId ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran'}
              subtitle="Setara modul web: create, update, delete mapel + KKM per level."
            >
              <TextInput
                value={subjectForm.code}
                onChangeText={(value) => setSubjectForm((prev) => ({ ...prev, code: value.toUpperCase() }))}
                placeholder="Kode mapel"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 8,
                }}
              />
              <TextInput
                value={subjectForm.name}
                onChangeText={(value) => setSubjectForm((prev) => ({ ...prev, name: value }))}
                placeholder="Nama mapel"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 8,
                }}
              />
              <MobileSelectField
                label="Kategori Mapel"
                value={subjectForm.subjectCategoryId}
                options={subjectCategoryOptions}
                onChange={(value) => setSubjectForm((prev) => ({ ...prev, subjectCategoryId: value }))}
                placeholder="Pilih kategori mapel"
                helperText={`Kategori terpilih: ${selectedSubjectCategory?.name || '-'}`}
              />
              <TextInput
                value={subjectForm.description}
                onChangeText={(value) => setSubjectForm((prev) => ({ ...prev, description: value }))}
                placeholder="Deskripsi (opsional)"
                placeholderTextColor="#94a3b8"
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  minHeight: 65,
                  marginBottom: 8,
                }}
              />
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <TextInput
                  value={subjectForm.kkmX}
                  onChangeText={(value) => setSubjectForm((prev) => ({ ...prev, kkmX: value.replace(/[^0-9]/g, '') }))}
                  placeholder="KKM X"
                  keyboardType="number-pad"
                  placeholderTextColor="#94a3b8"
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#d5e0f5',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    color: BRAND_COLORS.textDark,
                  }}
                />
                <TextInput
                  value={subjectForm.kkmXI}
                  onChangeText={(value) => setSubjectForm((prev) => ({ ...prev, kkmXI: value.replace(/[^0-9]/g, '') }))}
                  placeholder="KKM XI"
                  keyboardType="number-pad"
                  placeholderTextColor="#94a3b8"
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#d5e0f5',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    color: BRAND_COLORS.textDark,
                  }}
                />
                <TextInput
                  value={subjectForm.kkmXII}
                  onChangeText={(value) => setSubjectForm((prev) => ({ ...prev, kkmXII: value.replace(/[^0-9]/g, '') }))}
                  placeholder="KKM XII"
                  keyboardType="number-pad"
                  placeholderTextColor="#94a3b8"
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#d5e0f5',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    color: BRAND_COLORS.textDark,
                  }}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                <Pressable
                  onPress={() => {
                    void submitSubject();
                  }}
                  disabled={!!pendingAction}
                  style={{
                    flex: 1,
                    backgroundColor: BRAND_COLORS.blue,
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    opacity: pendingAction ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{editingSubjectId ? 'Update' : 'Simpan'}</Text>
                </Pressable>
                <Pressable
                  onPress={resetSubjectForm}
                  disabled={!!pendingAction}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    backgroundColor: '#fff',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    opacity: pendingAction ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>Bersihkan</Text>
                </Pressable>
              </View>
              {filteredSubjects.slice(0, 40).map((item) => (
                <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                    {item.code} - {item.name}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                    Kategori: {item.category?.name || '-'} | KKM X/XI/XII: {subjectKkmDisplay(item, 'X')} / {subjectKkmDisplay(item, 'XI')} / {subjectKkmDisplay(item, 'XII')}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                    <Pressable
                      onPress={() => editSubject(item)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#bfdbfe',
                        backgroundColor: '#eff6ff',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Edit</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmDeleteSubject(item)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        backgroundColor: '#fef2f2',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 12 }}>Hapus</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              {filteredSubjects.length === 0 ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                  Data mata pelajaran tidak ditemukan.
                </Text>
              ) : null}
            </SectionCard>
          ) : null}

          {shouldShow('classes') ? (
            <SectionCard
              title={editingClassId ? 'Edit Kelas' : 'Tambah Kelas'}
              subtitle="Setara modul web: create (multi-rombel), update, delete kelas."
            >
              <MobileSelectField
                label="Level"
                value={classForm.level}
                options={classLevelOptions}
                onChange={(value) => setClassForm((prev) => ({ ...prev, level: value }))}
                placeholder="Pilih level"
              />

              <MobileSelectField
                label="Tahun Ajaran"
                value={classForm.academicYearId}
                options={academicYearOptions}
                onChange={(value) => setClassForm((prev) => ({ ...prev, academicYearId: value }))}
                placeholder="Pilih tahun ajaran"
                maxHeight={260}
              />

              <MobileSelectField
                label="Jurusan"
                value={classForm.majorId}
                options={majorOptions}
                onChange={(value) => setClassForm((prev) => ({ ...prev, majorId: value }))}
                placeholder="Pilih jurusan"
                maxHeight={260}
              />

              <TextInput
                value={classForm.baseName}
                onChangeText={(value) => setClassForm((prev) => ({ ...prev, baseName: value }))}
                placeholder="Nama dasar kelas (contoh: TKJ)"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 8,
                }}
              />
              {!editingClassId ? (
                <TextInput
                  value={classForm.rombelCount}
                  onChangeText={(value) => setClassForm((prev) => ({ ...prev, rombelCount: value.replace(/[^0-9]/g, '') }))}
                  placeholder="Jumlah rombel (default 1)"
                  keyboardType="number-pad"
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#d5e0f5',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    color: BRAND_COLORS.textDark,
                    marginBottom: 8,
                  }}
                />
              ) : null}

              <TextInput
                value={classTeacherSearch}
                onChangeText={setClassTeacherSearch}
                placeholder="Cari guru wali kelas (opsional)"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 6,
                }}
              />
              <MobileSelectField
                label="Wali Kelas"
                value={classForm.teacherId}
                options={classTeacherOptions}
                onChange={(value) => setClassForm((prev) => ({ ...prev, teacherId: value }))}
                placeholder="Pilih wali kelas"
                helperText={`Wali kelas terpilih: ${selectedClassTeacher?.name || 'Tidak dipilih'}`}
                maxHeight={260}
              />

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                <Pressable
                  onPress={() => {
                    void submitClass();
                  }}
                  disabled={!!pendingAction}
                  style={{
                    flex: 1,
                    backgroundColor: BRAND_COLORS.blue,
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    opacity: pendingAction ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{editingClassId ? 'Update' : 'Simpan'}</Text>
                </Pressable>
                <Pressable
                  onPress={resetClassForm}
                  disabled={!!pendingAction}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    backgroundColor: '#fff',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    opacity: pendingAction ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>Bersihkan</Text>
                </Pressable>
              </View>
              {filteredClasses.slice(0, 40).map((item) => (
                <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                    {item.name} ({item.level})
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                    Jurusan: {item.major?.name || '-'} | Wali kelas: {item.teacher?.name || '-'} | Siswa: {item._count?.students || 0}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                    <Pressable
                      onPress={() => editClass(item)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#bfdbfe',
                        backgroundColor: '#eff6ff',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Edit</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmDeleteClass(item)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        backgroundColor: '#fef2f2',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 12 }}>Hapus</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              {filteredClasses.length === 0 ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                  Data kelas tidak ditemukan.
                </Text>
              ) : null}
            </SectionCard>
          ) : null}

          {shouldShow('training-classes') ? (
            <SectionCard
              title={editingTrainingClassId ? 'Edit Kelas Training' : 'Tambah Kelas Training'}
              subtitle="Setara modul web: create, update, delete kelas training."
            >
              {trainingClassesResult === null ? (
                <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 10 }}>
                  Data kelas training belum tersedia pada sesi ini.
                </Text>
              ) : null}

              <TextInput
                value={trainingForm.name}
                onChangeText={(value) => setTrainingForm((prev) => ({ ...prev, name: value }))}
                placeholder="Nama kelas training"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 8,
                }}
              />
              <MobileSelectField
                label="Tahun Ajaran"
                value={trainingForm.academicYearId}
                options={academicYearOptions}
                onChange={(value) => setTrainingForm((prev) => ({ ...prev, academicYearId: value }))}
                placeholder="Pilih tahun ajaran"
                maxHeight={260}
              />
              <TextInput
                value={trainingInstructorSearch}
                onChangeText={setTrainingInstructorSearch}
                placeholder="Cari instruktur (opsional)"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 6,
                }}
              />
              <MobileSelectField
                label="Instruktur"
                value={trainingForm.instructorId}
                options={trainingInstructorOptions}
                onChange={(value) => setTrainingForm((prev) => ({ ...prev, instructorId: value }))}
                placeholder="Pilih instruktur"
                helperText={`Instruktur terpilih: ${selectedTrainingInstructor?.name || 'Tidak dipilih'}`}
                maxHeight={260}
              />
              <TextInput
                value={trainingForm.maxCapacity}
                onChangeText={(value) => setTrainingForm((prev) => ({ ...prev, maxCapacity: value.replace(/[^0-9]/g, '') }))}
                placeholder="Kapasitas maksimal (opsional)"
                keyboardType="number-pad"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 8,
                }}
              />
              <TextInput
                value={trainingForm.description}
                onChangeText={(value) => setTrainingForm((prev) => ({ ...prev, description: value }))}
                placeholder="Deskripsi (opsional)"
                placeholderTextColor="#94a3b8"
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  minHeight: 70,
                  marginBottom: 8,
                }}
              />
              <MobileSelectField
                label="Status Kelas Training"
                value={trainingForm.isActive ? 'ACTIVE' : 'INACTIVE'}
                options={trainingStatusOptions}
                onChange={(value) => setTrainingForm((prev) => ({ ...prev, isActive: value === 'ACTIVE' }))}
                placeholder="Pilih status"
              />
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                <Pressable
                  onPress={() => {
                    void submitTrainingClass();
                  }}
                  disabled={!!pendingAction}
                  style={{
                    flex: 1,
                    backgroundColor: BRAND_COLORS.blue,
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    opacity: pendingAction ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{editingTrainingClassId ? 'Update' : 'Simpan'}</Text>
                </Pressable>
                <Pressable
                  onPress={resetTrainingForm}
                  disabled={!!pendingAction}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    backgroundColor: '#fff',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    opacity: pendingAction ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>Bersihkan</Text>
                </Pressable>
              </View>
              {filteredTrainingClasses.slice(0, 40).map((item) => (
                <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.name}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                    Tahun: {item.academicYear?.name || '-'} | Instruktur: {item.instructor?.name || '-'} | Peserta: {item._count?.enrollments || 0}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                    <Pressable
                      onPress={() => editTrainingClass(item)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#bfdbfe',
                        backgroundColor: '#eff6ff',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Edit</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmDeleteTrainingClass(item)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        backgroundColor: '#fef2f2',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 12 }}>Hapus</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              {filteredTrainingClasses.length === 0 ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                  Data kelas training tidak ditemukan.
                </Text>
              ) : null}
            </SectionCard>
          ) : null}

          {shouldShow('extracurriculars') ? (
            <SectionCard
              title={editingExtracurricularId ? 'Edit Ekstrakurikuler' : 'Tambah Ekstrakurikuler'}
              subtitle="Setara modul web: create, update, delete ekstrakurikuler dan organisasi siswa."
            >
              {extracurricularsResult === null ? (
                <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 10 }}>
                  Data ekstrakurikuler belum dapat dimuat pada akun ini.
                </Text>
              ) : null}
              <TextInput
                value={extracurricularForm.name}
                onChangeText={(value) => setExtracurricularForm((prev) => ({ ...prev, name: value }))}
                placeholder="Nama ekstrakurikuler"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 8,
                }}
              />
              <TextInput
                value={extracurricularForm.description}
                onChangeText={(value) => setExtracurricularForm((prev) => ({ ...prev, description: value }))}
                placeholder="Deskripsi (opsional)"
                placeholderTextColor="#94a3b8"
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  minHeight: 70,
                  marginBottom: 8,
                }}
              />
              <MobileSelectField
                label="Kategori"
                value={extracurricularForm.category}
                options={extracurricularCategoryOptions}
                onChange={(value) =>
                  setExtracurricularForm((prev) => ({ ...prev, category: value as ExtracurricularCategory }))
                }
                placeholder="Pilih kategori"
              />
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                <Pressable
                  onPress={() => {
                    void submitExtracurricular();
                  }}
                  disabled={!!pendingAction}
                  style={{
                    flex: 1,
                    backgroundColor: BRAND_COLORS.blue,
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    opacity: pendingAction ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{editingExtracurricularId ? 'Update' : 'Simpan'}</Text>
                </Pressable>
                <Pressable
                  onPress={resetExtracurricularForm}
                  disabled={!!pendingAction}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    backgroundColor: '#fff',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    opacity: pendingAction ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>Bersihkan</Text>
                </Pressable>
              </View>
              {filteredExtracurriculars.slice(0, 40).map((item) => (
                <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.name}</Text>
                  <Text style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>
                    Kategori: {getExtracurricularCategoryLabel(item.category)}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                    Pembina aktif: {item.tutorAssignments?.length || 0}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                    <Pressable
                      onPress={() => editExtracurricular(item)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#bfdbfe',
                        backgroundColor: '#eff6ff',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Edit</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmDeleteExtracurricular(item)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        backgroundColor: '#fef2f2',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 12 }}>Hapus</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              {extracurricularsResult !== null && filteredExtracurriculars.length === 0 ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                  Data ekstrakurikuler tidak ditemukan.
                </Text>
              ) : null}
            </SectionCard>
          ) : null}
        </>
      ) : null}

      <MobileDetailModal
        visible={Boolean(activeSummaryId && activeSummaryMeta)}
        title={activeSummaryMeta?.title || 'Ringkasan Master Data'}
        subtitle="Detail dipindahkan ke popup agar halaman utama mobile tetap ringkas dan mudah dipindai."
        iconName={activeSummaryMeta?.iconName || 'bar-chart-2'}
        accentColor={activeSummaryMeta?.accentColor || BRAND_COLORS.blue}
        onClose={() => setActiveSummaryId(null)}
      >
        {activeSummaryId === 'majors' ? (
          <>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
              Total jurusan: {majors.length}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, lineHeight: 20, marginBottom: 12 }}>
              Gunakan daftar ini untuk memeriksa jurusan yang sudah aktif di master data.
            </Text>
            {majors.slice(0, 8).map((item) => (
              <View
                key={item.id}
                style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 10, marginBottom: 8 }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                  {item.code} - {item.name}
                </Text>
              </View>
            ))}
          </>
        ) : null}

        {activeSummaryId === 'subjects' ? (
          <>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
              Total mata pelajaran: {subjects.length}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, lineHeight: 20, marginBottom: 12 }}>
              Ringkasan ini menampilkan beberapa mapel awal yang sudah tersusun pada master data.
            </Text>
            {subjects.slice(0, 8).map((item) => (
              <View
                key={item.id}
                style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 10, marginBottom: 8 }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                  {item.code} - {item.name}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                  Kategori: {item.category?.name || '-'}
                </Text>
              </View>
            ))}
          </>
        ) : null}

        {activeSummaryId === 'classes' ? (
          <>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
              Total kelas aktif: {classes.length}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, lineHeight: 20, marginBottom: 12 }}>
              Detail ini membantu memeriksa kelas yang sudah tersedia pada tahun ajaran aktif.
            </Text>
            {classes.slice(0, 8).map((item) => (
              <View
                key={item.id}
                style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 10, marginBottom: 8 }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.name}</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                  {item.level} • {item.major?.name || '-'}
                </Text>
              </View>
            ))}
          </>
        ) : null}

        {activeSummaryId === 'categories' ? (
          <>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
              Total kategori mapel: {categories.length}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, lineHeight: 20, marginBottom: 12 }}>
              Kategori ini dipakai untuk mengelompokkan mapel dan mendukung struktur kurikulum.
            </Text>
            {categories.slice(0, 8).map((item) => (
              <View
                key={item.id}
                style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 10, marginBottom: 8 }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                  {item.code} - {item.name}
                </Text>
              </View>
            ))}
          </>
        ) : null}
      </MobileDetailModal>
    </ScrollView>
  );
}
