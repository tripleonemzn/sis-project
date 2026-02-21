import { useEffect, useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import {
  type AdminUser,
  type AdminUserCreatePayload,
  type AdminUserWritePayload,
  adminApi,
} from '../../../src/features/admin/adminApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { notifyApiError, notifyInfo, notifySuccess } from '../../../src/lib/ui/feedback';

const ROLE_OPTIONS = [
  'ALL',
  'ADMIN',
  'TEACHER',
  'STUDENT',
  'EXAMINER',
  'PRINCIPAL',
  'STAFF',
  'PARENT',
  'CALON_SISWA',
  'UMUM',
  'EXTRACURRICULAR_TUTOR',
] as const;

const MANAGEABLE_ROLE_OPTIONS: AdminUser['role'][] = [
  'ADMIN',
  'TEACHER',
  'STUDENT',
  'EXAMINER',
  'PRINCIPAL',
  'STAFF',
  'PARENT',
  'CALON_SISWA',
  'UMUM',
  'EXTRACURRICULAR_TUTOR',
];

const VERIFICATION_OPTIONS = ['ALL', 'PENDING', 'VERIFIED', 'REJECTED'] as const;
const STUDENT_STATUS_OPTIONS = ['ACTIVE', 'GRADUATED', 'MOVED', 'DROPPED_OUT'] as const;
const GENDER_OPTIONS = ['MALE', 'FEMALE'] as const;
const TEACHER_KESISWAAN_ROLES = ['STUDENT', 'PARENT', 'EXTRACURRICULAR_TUTOR'] as const;
const ADDITIONAL_DUTY_OPTIONS = [
  'WAKASEK_KURIKULUM',
  'WAKASEK_KESISWAAN',
  'WAKASEK_SARPRAS',
  'WAKASEK_HUMAS',
  'KAPROG',
  'WALI_KELAS',
  'PEMBINA_OSIS',
  'PEMBINA_EKSKUL',
  'KEPALA_LAB',
  'KEPALA_PERPUSTAKAAN',
  'TIM_BOS',
  'BENDAHARA',
  'BP_BK',
  'SEKRETARIS_KURIKULUM',
  'SEKRETARIS_KESISWAAN',
  'SEKRETARIS_SARPRAS',
  'SEKRETARIS_HUMAS',
  'IT_CENTER',
] as const;

type RoleFilterValue = (typeof ROLE_OPTIONS)[number];
type VerificationFilterValue = (typeof VERIFICATION_OPTIONS)[number];
type StudentStatusValue = (typeof STUDENT_STATUS_OPTIONS)[number];
type GenderValue = (typeof GENDER_OPTIONS)[number];

type UserFormState = {
  role: AdminUser['role'];
  username: string;
  name: string;
  password: string;
  nip: string;
  nis: string;
  nisn: string;
  classId: string;
  studentStatus: StudentStatusValue;
  gender: '' | GenderValue;
  birthPlace: string;
  birthDate: string;
  email: string;
  phone: string;
  address: string;
  additionalDuties: string[];
  managedMajorIds: number[];
  examinerMajorId: string;
  childNisns: string[];
  verificationStatus: '' | 'PENDING' | 'VERIFIED' | 'REJECTED';
};

const USER_MANAGEMENT_SECTION_TEXT: Record<string, string> = {
  'import-export':
    'Mode import/export data user: upload file Excel untuk sinkronisasi massal dari mobile.',
};

const getSingleParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const hasAnyDuty = (userDuties: string[] | undefined, expected: string[]) => {
  const owned = new Set((userDuties || []).map((item) => String(item || '').trim().toUpperCase()));
  return expected.some((item) => owned.has(String(item || '').trim().toUpperCase()));
};

const sanitizeRoleFilter = (value: string | undefined): RoleFilterValue => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  if (ROLE_OPTIONS.includes(normalized as RoleFilterValue)) {
    return normalized as RoleFilterValue;
  }
  return 'ALL';
};

const sanitizeTeacherKesiswaanRoleFilter = (value: string | undefined): RoleFilterValue => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  if (TEACHER_KESISWAAN_ROLES.includes(normalized as (typeof TEACHER_KESISWAAN_ROLES)[number])) {
    return normalized as RoleFilterValue;
  }
  return 'STUDENT';
};

const sanitizeVerificationFilter = (value: string | undefined): VerificationFilterValue => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  if (VERIFICATION_OPTIONS.includes(normalized as VerificationFilterValue)) {
    return normalized as VerificationFilterValue;
  }
  return 'ALL';
};

const toNullableString = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toNullableNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const createEmptyUserForm = (role: AdminUser['role']): UserFormState => ({
  role,
  username: '',
  name: '',
  password: '',
  nip: '',
  nis: '',
  nisn: '',
  classId: '',
  studentStatus: 'ACTIVE',
  gender: '',
  birthPlace: '',
  birthDate: '',
  email: '',
  phone: '',
  address: '',
  additionalDuties: [],
  managedMajorIds: [],
  examinerMajorId: '',
  childNisns: [],
  verificationStatus: '',
});

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
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? BRAND_COLORS.blue : '#cbd5e1',
        backgroundColor: active ? '#dbeafe' : BRAND_COLORS.white,
      }}
    >
      <Text style={{ color: active ? BRAND_COLORS.blue : BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  editable,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric';
  editable?: boolean;
}) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable ?? true}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        multiline={multiline}
        keyboardType={keyboardType || 'default'}
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          paddingHorizontal: 10,
          paddingVertical: multiline ? 10 : 9,
          minHeight: multiline ? 84 : undefined,
          backgroundColor: editable === false ? '#f1f5f9' : '#fff',
          color: BRAND_COLORS.textDark,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

function UserCard({
  item,
  onApprove,
  onReject,
  onEdit,
  onDelete,
  canDelete,
  isApproving,
  isRejecting,
  isDeleting,
}: {
  item: AdminUser;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canDelete: boolean;
  isApproving: boolean;
  isRejecting: boolean;
  isDeleting: boolean;
}) {
  const isPending = item.verificationStatus === 'PENDING';

  return (
    <View
      style={{
        backgroundColor: BRAND_COLORS.white,
        borderWidth: 1,
        borderColor: '#d6e0f2',
        borderRadius: 14,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 15 }}>{item.name}</Text>
          <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>@{item.username}</Text>
          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 6 }}>
            Role: {item.role} | Verifikasi: {item.verificationStatus || '-'}
          </Text>
          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
            Kelas: {item.studentClass?.name || '-'} {item.studentClass?.major?.code ? `(${item.studentClass.major.code})` : ''}
          </Text>
          {item.nisn ? <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>NISN: {item.nisn}</Text> : null}
          {item.nip ? <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>NIP: {item.nip}</Text> : null}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Pressable
          onPress={onEdit}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 10,
            paddingVertical: 8,
            alignItems: 'center',
            backgroundColor: '#fff',
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Edit</Text>
        </Pressable>
        {canDelete ? (
          <Pressable
            onPress={onDelete}
            disabled={isDeleting}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: '#fecaca',
              borderRadius: 10,
              paddingVertical: 8,
              alignItems: 'center',
              backgroundColor: '#fff1f2',
              opacity: isDeleting ? 0.6 : 1,
            }}
          >
            <Text style={{ color: '#b91c1c', fontWeight: '700' }}>{isDeleting ? 'Memproses...' : 'Hapus'}</Text>
          </Pressable>
        ) : null}
      </View>

      {isPending ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Pressable
            onPress={onApprove}
            disabled={isApproving || isRejecting}
            style={{
              flex: 1,
              backgroundColor: '#16a34a',
              borderRadius: 10,
              paddingVertical: 8,
              alignItems: 'center',
              opacity: isApproving || isRejecting ? 0.7 : 1,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>{isApproving ? 'Memproses...' : 'Setujui'}</Text>
          </Pressable>
          <Pressable
            onPress={onReject}
            disabled={isApproving || isRejecting}
            style={{
              flex: 1,
              backgroundColor: '#dc2626',
              borderRadius: 10,
              paddingVertical: 8,
              alignItems: 'center',
              opacity: isApproving || isRejecting ? 0.7 : 1,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>{isRejecting ? 'Memproses...' : 'Tolak'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export default function AdminUserManagementScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    role?: string | string[];
    verification?: string | string[];
    section?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets);

  const [search, setSearch] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [form, setForm] = useState<UserFormState>(() => createEmptyUserForm('TEACHER'));
  const [parentStudentSearch, setParentStudentSearch] = useState('');
  const [classSearch, setClassSearch] = useState('');
  const [majorSearch, setMajorSearch] = useState('');

  const isAdmin = user?.role === 'ADMIN';
  const isTeacherKesiswaan =
    user?.role === 'TEACHER' &&
    hasAnyDuty(user?.additionalDuties, ['WAKASEK_KESISWAAN', 'SEKRETARIS_KESISWAAN']);
  const canAccess = isAdmin || isTeacherKesiswaan;
  const canUseImportExport = isAdmin;

  const roleParam = getSingleParam(params.role);
  const verificationParam = getSingleParam(params.verification);
  const sectionParam = String(getSingleParam(params.section) || '')
    .trim()
    .toLowerCase();
  const [roleFilter, setRoleFilter] = useState<RoleFilterValue>(() =>
    isAdmin ? sanitizeRoleFilter(roleParam) : sanitizeTeacherKesiswaanRoleFilter(roleParam),
  );
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilterValue>(() =>
    sanitizeVerificationFilter(verificationParam),
  );

  useEffect(() => {
    setRoleFilter(isAdmin ? sanitizeRoleFilter(roleParam) : sanitizeTeacherKesiswaanRoleFilter(roleParam));
  }, [roleParam, isAdmin]);

  useEffect(() => {
    setVerificationFilter(sanitizeVerificationFilter(verificationParam));
  }, [verificationParam]);

  const usersQuery = useQuery({
    queryKey: ['mobile-admin-users', roleFilter, verificationFilter],
    queryFn: async () =>
      adminApi.listUsers({
        role: roleFilter === 'ALL' ? undefined : roleFilter,
        verificationStatus: verificationFilter === 'ALL' ? undefined : verificationFilter,
      }),
  });

  const supportingDataQuery = useQuery({
    queryKey: ['mobile-admin-users-support-data'],
    enabled: formVisible || (canUseImportExport && sectionParam === 'import-export'),
    queryFn: async () => {
      const [classes, majors, students] = await Promise.all([
        adminApi.listClasses({ page: 1, limit: 300 }).catch(() => ({
          items: [],
          pagination: { page: 1, limit: 300, total: 0, totalPages: 1 },
        })),
        adminApi.listMajors({ page: 1, limit: 300 }).catch(() => ({
          items: [],
          pagination: { page: 1, limit: 300, total: 0, totalPages: 1 },
        })),
        adminApi.listUsers({ role: 'STUDENT' }).catch(() => []),
      ]);
      return {
        classes: classes.items,
        majors: majors.items,
        students,
      };
    },
  });

  const updateVerificationMutation = useMutation({
    mutationFn: async (payload: { userId: number; status: 'VERIFIED' | 'REJECTED' }) =>
      adminApi.updateUser(payload.userId, { verificationStatus: payload.status }),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-users'] });
      notifySuccess(
        variables.status === 'VERIFIED'
          ? 'Akun berhasil diverifikasi.'
          : 'Status akun berhasil diubah menjadi ditolak.',
      );
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal memperbarui status verifikasi user.');
    },
  });

  const bulkVerifyMutation = useMutation({
    mutationFn: async (userIds: number[]) => adminApi.verifyUsersBulk(userIds),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-users'] });
      notifySuccess(`Berhasil memverifikasi ${result?.updatedCount || 0} akun.`);
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal memproses verifikasi massal.');
    },
  });

  const saveUserMutation = useMutation({
    mutationFn: async (payload: { mode: 'create' | 'update'; userId?: number; data: AdminUserCreatePayload | AdminUserWritePayload }) => {
      if (payload.mode === 'create') {
        return adminApi.createUser(payload.data as AdminUserCreatePayload);
      }
      if (!payload.userId) throw new Error('ID user tidak valid untuk proses update.');
      return adminApi.updateUser(payload.userId, payload.data as AdminUserWritePayload);
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-admin-users'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-admin-users-support-data'] }),
      ]);
      setForm(createEmptyUserForm(defaultRoleForForm));
      setEditingUserId(null);
      setFormVisible(false);
      setParentStudentSearch('');
      setClassSearch('');
      setMajorSearch('');
      notifySuccess(variables.mode === 'create' ? 'User berhasil dibuat.' : 'Data user berhasil diperbarui.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menyimpan data user.');
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => adminApi.deleteUser(userId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-admin-users'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-admin-users-support-data'] }),
      ]);
      notifySuccess('User berhasil dihapus.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menghapus user.');
    },
  });

  const importMutation = useMutation({
    mutationFn: async (payload: {
      target: 'teachers' | 'students' | 'parents';
      file: { uri: string; name?: string; type?: string };
    }) => {
      if (payload.target === 'teachers') {
        return adminApi.importTeachers(payload.file);
      }
      if (payload.target === 'students') {
        return adminApi.importStudents(payload.file);
      }
      return adminApi.importParents(payload.file);
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-admin-users'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-admin-users-support-data'] }),
      ]);
      const label =
        variables.target === 'teachers'
          ? 'guru'
          : variables.target === 'students'
            ? 'siswa'
            : 'orang tua';
      notifySuccess(`Import data ${label} berhasil diproses.`);
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal memproses import data.');
    },
  });

  const query = search.trim().toLowerCase();
  const filteredByAccessUsers = useMemo(() => {
    const rows = usersQuery.data || [];
    if (isAdmin) return rows;
    if (!isTeacherKesiswaan) return [];
    const allowedRoleSet = new Set<string>(TEACHER_KESISWAAN_ROLES);
    return rows.filter((item) => allowedRoleSet.has(item.role));
  }, [isAdmin, isTeacherKesiswaan, usersQuery.data]);

  const filteredUsers = useMemo(() => {
    const items = filteredByAccessUsers;
    if (!query) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.username.toLowerCase().includes(query) ||
        item.role.toLowerCase().includes(query) ||
        (item.nisn || '').toLowerCase().includes(query) ||
        (item.nip || '').toLowerCase().includes(query) ||
        (item.studentClass?.name || '').toLowerCase().includes(query),
    );
  }, [filteredByAccessUsers, query]);

  const roleSummary = useMemo(() => {
    const summary = new Map<string, number>();
    filteredUsers.forEach((item) => {
      summary.set(item.role, (summary.get(item.role) || 0) + 1);
    });
    return Array.from(summary.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredUsers]);

  const pendingUsers = useMemo(
    () => filteredUsers.filter((item) => item.verificationStatus === 'PENDING'),
    [filteredUsers],
  );

  const classOptions = supportingDataQuery.data?.classes || [];
  const majorOptions = supportingDataQuery.data?.majors || [];
  const studentOptions = useMemo(
    () =>
      (supportingDataQuery.data?.students || []).filter(
        (item) => item.role === 'STUDENT' && typeof item.nisn === 'string' && item.nisn.trim().length > 0,
      ),
    [supportingDataQuery.data?.students],
  );

  const filteredClassOptions = useMemo(() => {
    const q = classSearch.trim().toLowerCase();
    if (!q) return classOptions;
    return classOptions.filter((item) => `${item.name} ${item.level} ${item.major?.code || ''}`.toLowerCase().includes(q));
  }, [classOptions, classSearch]);

  const filteredMajorOptions = useMemo(() => {
    const q = majorSearch.trim().toLowerCase();
    if (!q) return majorOptions;
    return majorOptions.filter((item) => `${item.code} ${item.name}`.toLowerCase().includes(q));
  }, [majorOptions, majorSearch]);

  const filteredParentStudentOptions = useMemo(() => {
    const q = parentStudentSearch.trim().toLowerCase();
    if (!q) return studentOptions;
    return studentOptions.filter((item) => {
      return `${item.name} ${item.nisn || ''} ${item.username}`.toLowerCase().includes(q);
    });
  }, [studentOptions, parentStudentSearch]);

  const selectedClass = classOptions.find((item) => String(item.id) === form.classId) || null;

  const screenSubtitle =
    (canUseImportExport ? USER_MANAGEMENT_SECTION_TEXT[sectionParam] : undefined) ||
    'Monitoring dan operasional user (create/edit/delete/verify) berdasarkan role dan status verifikasi.';

  const visibleRoleOptions: RoleFilterValue[] = isAdmin
    ? [...ROLE_OPTIONS]
    : (TEACHER_KESISWAAN_ROLES as unknown as RoleFilterValue[]);
  const manageableRoleOptions: AdminUser['role'][] = isAdmin
    ? [...MANAGEABLE_ROLE_OPTIONS]
    : [...TEACHER_KESISWAAN_ROLES];
  const defaultRoleForForm: AdminUser['role'] =
    roleFilter === 'ALL' ? (isAdmin ? 'TEACHER' : 'STUDENT') : roleFilter;

  const openCreateForm = () => {
    setForm(createEmptyUserForm(defaultRoleForForm));
    setEditingUserId(null);
    setFormVisible(true);
    setParentStudentSearch('');
    setClassSearch('');
    setMajorSearch('');
  };

  const openEditForm = (item: AdminUser) => {
    setFormVisible(true);
    setEditingUserId(item.id);
    setForm({
      role: item.role,
      username: item.username || '',
      name: item.name || '',
      password: '',
      nip: item.nip || '',
      nis: item.nis || '',
      nisn: item.nisn || '',
      classId: String(item.classId || item.studentClass?.id || ''),
      studentStatus: (item.studentStatus || 'ACTIVE') as StudentStatusValue,
      gender: item.gender || '',
      birthPlace: item.birthPlace || '',
      birthDate: item.birthDate ? String(item.birthDate).slice(0, 10) : '',
      email: item.email || '',
      phone: item.phone || '',
      address: item.address || '',
      additionalDuties: item.additionalDuties ? [...item.additionalDuties] : [],
      managedMajorIds:
        item.managedMajors && item.managedMajors.length > 0
          ? item.managedMajors.map((major) => major.id)
          : item.managedMajorId
            ? [item.managedMajorId]
            : [],
      examinerMajorId: String(item.examinerMajorId || item.examinerMajor?.id || ''),
      childNisns: (item.children || [])
        .map((child) => child.nisn || '')
        .filter((value) => value.length > 0),
      verificationStatus:
        item.verificationStatus === 'PENDING' || item.verificationStatus === 'VERIFIED' || item.verificationStatus === 'REJECTED'
          ? item.verificationStatus
          : '',
    });
    setParentStudentSearch('');
    setClassSearch('');
    setMajorSearch('');
  };

  const closeForm = () => {
    setFormVisible(false);
    setEditingUserId(null);
    setForm(createEmptyUserForm(defaultRoleForForm));
    setParentStudentSearch('');
    setClassSearch('');
    setMajorSearch('');
  };

  const toggleDuty = (duty: string) => {
    setForm((prev) => {
      const exists = prev.additionalDuties.includes(duty);
      const nextDuties = exists
        ? prev.additionalDuties.filter((item) => item !== duty)
        : [...prev.additionalDuties, duty];
      const nextManagedMajorIds =
        duty === 'KAPROG' && exists
          ? []
          : prev.managedMajorIds;
      return {
        ...prev,
        additionalDuties: nextDuties,
        managedMajorIds: nextManagedMajorIds,
      };
    });
  };

  const toggleManagedMajorId = (majorId: number) => {
    setForm((prev) => {
      const exists = prev.managedMajorIds.includes(majorId);
      return {
        ...prev,
        managedMajorIds: exists
          ? prev.managedMajorIds.filter((item) => item !== majorId)
          : [...prev.managedMajorIds, majorId],
      };
    });
  };

  const toggleParentChildNisn = (nisn: string) => {
    setForm((prev) => {
      const exists = prev.childNisns.includes(nisn);
      return {
        ...prev,
        childNisns: exists ? prev.childNisns.filter((item) => item !== nisn) : [...prev.childNisns, nisn],
      };
    });
  };

  const buildWritePayload = (): AdminUserWritePayload => {
    const username = form.role === 'STUDENT' ? form.nisn.trim() : form.username.trim();

    const payload: AdminUserWritePayload = {
      username: username || undefined,
      name: form.name.trim() || undefined,
      role: form.role,
      nip: toNullableString(form.nip),
      nis: toNullableString(form.nis),
      nisn: toNullableString(form.nisn),
      gender: form.gender || null,
      birthPlace: toNullableString(form.birthPlace),
      birthDate: toNullableString(form.birthDate),
      email: toNullableString(form.email),
      phone: toNullableString(form.phone),
      address: toNullableString(form.address),
      classId: form.role === 'STUDENT' ? toNullableNumber(form.classId) : null,
      studentStatus: form.role === 'STUDENT' ? form.studentStatus : undefined,
      additionalDuties: form.role === 'TEACHER' || form.role === 'STAFF' ? form.additionalDuties : [],
      managedMajorIds: form.role === 'TEACHER' ? form.managedMajorIds : [],
      examinerMajorId: form.role === 'EXAMINER' ? toNullableNumber(form.examinerMajorId) : null,
      childNisns: form.role === 'PARENT' ? form.childNisns : [],
    };

    if (form.verificationStatus) {
      payload.verificationStatus = form.verificationStatus;
    }

    return payload;
  };

  const handleSubmitForm = () => {
    const normalizedName = form.name.trim();
    const normalizedUsername = form.role === 'STUDENT' ? form.nisn.trim() : form.username.trim();

    if (!normalizedName) {
      notifyInfo('Nama user wajib diisi.');
      return;
    }

    if (form.role === 'STUDENT' && !form.nisn.trim()) {
      notifyInfo('NISN wajib diisi untuk role siswa.');
      return;
    }

    if (form.role === 'STUDENT' && form.nisn.trim().length < 3) {
      notifyInfo('NISN minimal 3 karakter.');
      return;
    }

    if (form.role !== 'STUDENT' && normalizedUsername.length < 3) {
      notifyInfo('Username minimal 3 karakter.');
      return;
    }

    const writePayload = buildWritePayload();

    if (!editingUserId) {
      const createPayload: AdminUserCreatePayload = {
        ...writePayload,
        username: normalizedUsername,
        name: normalizedName,
        role: form.role,
        password: form.password.trim() || 'smkskgb2',
      };
      saveUserMutation.mutate({ mode: 'create', data: createPayload });
      return;
    }

    const updatePayload: AdminUserWritePayload = {
      ...writePayload,
      username: normalizedUsername,
      name: normalizedName,
    };

    if (form.password.trim()) {
      updatePayload.password = form.password.trim();
    }

    saveUserMutation.mutate({ mode: 'update', userId: editingUserId, data: updatePayload });
  };

  const handleUpdateVerification = (item: AdminUser, status: 'VERIFIED' | 'REJECTED') => {
    const actionLabel = status === 'VERIFIED' ? 'menyetujui' : 'menolak';
    Alert.alert('Konfirmasi', `Yakin ingin ${actionLabel} akun ${item.username}?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Ya',
        style: status === 'VERIFIED' ? 'default' : 'destructive',
        onPress: () => {
          updateVerificationMutation.mutate({ userId: item.id, status });
        },
      },
    ]);
  };

  const handleDeleteUser = (item: AdminUser) => {
    Alert.alert('Hapus User', `Hapus akun ${item.username} (${item.role})?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          deleteUserMutation.mutate(item.id);
        },
      },
    ]);
  };

  const handleBulkVerify = () => {
    if (pendingUsers.length === 0) {
      notifyInfo('Tidak ada akun PENDING pada filter saat ini.');
      return;
    }

    Alert.alert('Konfirmasi', `Verifikasi semua akun PENDING pada daftar ini (${pendingUsers.length} akun)?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Verifikasi',
        style: 'default',
        onPress: () => {
          bulkVerifyMutation.mutate(pendingUsers.map((item) => item.id));
        },
      },
    ]);
  };

  const handlePickImportFile = async (target: 'teachers' | 'students' | 'parents') => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return;
    }

    const asset = result.assets[0];
    importMutation.mutate({
      target,
      file: {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    });
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
          refreshing={usersQuery.isFetching && !usersQuery.isLoading}
          onRefresh={() => usersQuery.refetch()}
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
        <Text style={{ marginLeft: 10, color: BRAND_COLORS.textDark, fontSize: 22, fontWeight: '700' }}>Manajemen User</Text>
      </View>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>{screenSubtitle}</Text>

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
          placeholder="Cari nama, username, role, NISN, NIP, atau kelas"
          placeholderTextColor="#94a3b8"
          style={{ flex: 1, color: BRAND_COLORS.textDark, paddingVertical: 10, paddingHorizontal: 10 }}
        />
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Filter Role</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {visibleRoleOptions.map((item) => (
          <FilterChip key={item} label={item} active={roleFilter === item} onPress={() => setRoleFilter(item)} />
        ))}
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Filter Verifikasi</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {VERIFICATION_OPTIONS.map((item) => (
          <FilterChip
            key={item}
            label={item}
            active={verificationFilter === item}
            onPress={() => setVerificationFilter(item)}
          />
        ))}
      </View>

      {sectionParam === 'import-export' && canUseImportExport ? (
        <View
          style={{
            backgroundColor: BRAND_COLORS.white,
            borderWidth: 1,
            borderColor: '#d6e0f2',
            borderRadius: 14,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Import Data Excel</Text>
          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 10 }}>
            Pilih file `.xlsx` dari perangkat. Ekspor template tetap disarankan lewat web admin.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <Pressable
              onPress={() => handlePickImportFile('teachers')}
              disabled={importMutation.isPending}
              style={{
                flex: 1,
                backgroundColor: '#2563eb',
                borderRadius: 10,
                paddingVertical: 9,
                alignItems: 'center',
                opacity: importMutation.isPending ? 0.65 : 1,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Import Guru</Text>
            </Pressable>
            <Pressable
              onPress={() => handlePickImportFile('students')}
              disabled={importMutation.isPending}
              style={{
                flex: 1,
                backgroundColor: '#059669',
                borderRadius: 10,
                paddingVertical: 9,
                alignItems: 'center',
                opacity: importMutation.isPending ? 0.65 : 1,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Import Siswa</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => handlePickImportFile('parents')}
            disabled={importMutation.isPending}
            style={{
              backgroundColor: '#d97706',
              borderRadius: 10,
              paddingVertical: 9,
              alignItems: 'center',
              opacity: importMutation.isPending ? 0.65 : 1,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
              {importMutation.isPending ? 'Memproses...' : 'Import Orang Tua'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {usersQuery.isLoading ? <QueryStateView type="loading" message="Memuat data user..." /> : null}
      {usersQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data user admin." onRetry={() => usersQuery.refetch()} />
      ) : null}

      {!usersQuery.isLoading && !usersQuery.isError ? (
        <>
          <View
            style={{
              backgroundColor: BRAND_COLORS.white,
              borderWidth: 1,
              borderColor: '#d6e0f2',
              borderRadius: 14,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Ringkasan</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>
              Total user terfilter: {filteredUsers.length}
            </Text>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                Total PENDING: {pendingUsers.length}
              </Text>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                {isAdmin ? (
                  <>
                    <Pressable
                      onPress={openCreateForm}
                      style={{
                        flex: 1,
                        backgroundColor: BRAND_COLORS.blue,
                        borderRadius: 10,
                        paddingVertical: 9,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Tambah User</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleBulkVerify}
                      disabled={bulkVerifyMutation.isPending || pendingUsers.length === 0}
                      style={{
                        flex: 1,
                        backgroundColor: '#16a34a',
                        borderRadius: 10,
                        paddingVertical: 9,
                        alignItems: 'center',
                        opacity: bulkVerifyMutation.isPending || pendingUsers.length === 0 ? 0.6 : 1,
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                        {bulkVerifyMutation.isPending ? 'Memproses...' : 'Verifikasi Semua'}
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <View
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      paddingVertical: 10,
                      paddingHorizontal: 10,
                      backgroundColor: '#fff',
                    }}
                  >
                    <Text style={{ color: '#475569', fontSize: 12, textAlign: 'center' }}>
                      Mode Wakasis: edit & verifikasi data user yang sudah ada.
                    </Text>
                  </View>
                )}
              </View>

            {roleSummary.slice(0, 8).map(([role, count]) => (
              <Text key={role} style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                {role}: {count}
              </Text>
            ))}
          </View>

          {formVisible ? (
            <View
              style={{
                backgroundColor: BRAND_COLORS.white,
                borderWidth: 1,
                borderColor: '#d6e0f2',
                borderRadius: 14,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
                {editingUserId ? `Edit User #${editingUserId}` : 'Tambah User Baru'}
              </Text>

              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Role</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {manageableRoleOptions.map((item) => (
                  <FilterChip
                    key={`role-form-${item}`}
                    label={item}
                    active={form.role === item}
                    onPress={() =>
                      setForm((prev) => ({
                        ...prev,
                        role: item,
                        classId: item === 'STUDENT' ? prev.classId : '',
                        studentStatus: item === 'STUDENT' ? prev.studentStatus : 'ACTIVE',
                        examinerMajorId: item === 'EXAMINER' ? prev.examinerMajorId : '',
                        additionalDuties:
                          item === 'TEACHER' || item === 'STAFF'
                            ? prev.additionalDuties
                            : [],
                        managedMajorIds: item === 'TEACHER' ? prev.managedMajorIds : [],
                        childNisns: item === 'PARENT' ? prev.childNisns : [],
                      }))
                    }
                  />
                ))}
              </View>

              <FormInput
                label="Nama"
                value={form.name}
                onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))}
                placeholder="Nama lengkap"
              />

              {form.role === 'STUDENT' ? (
                <>
                  <FormInput
                    label="NISN"
                    value={form.nisn}
                    onChangeText={(value) => setForm((prev) => ({ ...prev, nisn: value }))}
                    placeholder="NISN siswa"
                  />
                  <FormInput
                    label="NIS"
                    value={form.nis}
                    onChangeText={(value) => setForm((prev) => ({ ...prev, nis: value }))}
                    placeholder="NIS (opsional)"
                  />

                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Cari Kelas</Text>
                  <TextInput
                    value={classSearch}
                    onChangeText={setClassSearch}
                    placeholder="Cari kelas..."
                    placeholderTextColor="#94a3b8"
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 9,
                      backgroundColor: '#fff',
                      color: BRAND_COLORS.textDark,
                      marginBottom: 8,
                    }}
                  />

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    <FilterChip
                      label="Tanpa Kelas"
                      active={form.classId === ''}
                      onPress={() => setForm((prev) => ({ ...prev, classId: '' }))}
                    />
                    {filteredClassOptions.slice(0, 40).map((item) => (
                      <FilterChip
                        key={`class-${item.id}`}
                        label={`${item.name}${item.major?.code ? ` (${item.major.code})` : ''}`}
                        active={form.classId === String(item.id)}
                        onPress={() => setForm((prev) => ({ ...prev, classId: String(item.id) }))}
                      />
                    ))}
                  </View>

                  {selectedClass ? (
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                      Kelas terpilih: {selectedClass.name}
                    </Text>
                  ) : null}

                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Status Siswa</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {STUDENT_STATUS_OPTIONS.map((item) => (
                      <FilterChip
                        key={`student-status-${item}`}
                        label={item}
                        active={form.studentStatus === item}
                        onPress={() => setForm((prev) => ({ ...prev, studentStatus: item }))}
                      />
                    ))}
                  </View>
                </>
              ) : null}

              {form.role !== 'STUDENT' ? (
                <FormInput
                  label="Username"
                  value={form.username}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, username: value }))}
                  placeholder="Username login"
                />
              ) : null}

              <FormInput
                label={editingUserId ? 'Password Baru (opsional)' : 'Password (kosong = smkskgb2)'}
                value={form.password}
                onChangeText={(value) => setForm((prev) => ({ ...prev, password: value }))}
                placeholder="******"
              />

              <FormInput
                label="NIP"
                value={form.nip}
                onChangeText={(value) => setForm((prev) => ({ ...prev, nip: value }))}
                placeholder="NIP (opsional)"
              />

              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Gender</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <FilterChip
                  label="Tidak Diisi"
                  active={form.gender === ''}
                  onPress={() => setForm((prev) => ({ ...prev, gender: '' }))}
                />
                {GENDER_OPTIONS.map((item) => (
                  <FilterChip
                    key={`gender-${item}`}
                    label={item}
                    active={form.gender === item}
                    onPress={() => setForm((prev) => ({ ...prev, gender: item }))}
                  />
                ))}
              </View>

              <FormInput
                label="Tempat Lahir"
                value={form.birthPlace}
                onChangeText={(value) => setForm((prev) => ({ ...prev, birthPlace: value }))}
                placeholder="Tempat lahir"
              />
              <FormInput
                label="Tanggal Lahir (YYYY-MM-DD)"
                value={form.birthDate}
                onChangeText={(value) => setForm((prev) => ({ ...prev, birthDate: value }))}
                placeholder="2008-01-25"
              />

              <FormInput
                label="Email"
                value={form.email}
                onChangeText={(value) => setForm((prev) => ({ ...prev, email: value }))}
                placeholder="email@sekolah.sch.id"
                keyboardType="email-address"
              />
              <FormInput
                label="No. HP"
                value={form.phone}
                onChangeText={(value) => setForm((prev) => ({ ...prev, phone: value }))}
                placeholder="08xxxxxxxxxx"
              />
              <FormInput
                label="Alamat"
                value={form.address}
                onChangeText={(value) => setForm((prev) => ({ ...prev, address: value }))}
                placeholder="Alamat lengkap"
                multiline
              />

              {form.role === 'TEACHER' || form.role === 'STAFF' ? (
                <>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Additional Duties</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    {ADDITIONAL_DUTY_OPTIONS.map((item) => (
                      <FilterChip
                        key={`duty-${item}`}
                        label={item}
                        active={form.additionalDuties.includes(item)}
                        onPress={() => toggleDuty(item)}
                      />
                    ))}
                  </View>

                  {form.role === 'TEACHER' && form.additionalDuties.includes('KAPROG') ? (
                    <>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>
                        Managed Major (untuk duty KAPROG)
                      </Text>
                      <TextInput
                        value={majorSearch}
                        onChangeText={setMajorSearch}
                        placeholder="Cari jurusan..."
                        placeholderTextColor="#94a3b8"
                        style={{
                          borderWidth: 1,
                          borderColor: '#cbd5e1',
                          borderRadius: 10,
                          paddingHorizontal: 10,
                          paddingVertical: 9,
                          backgroundColor: '#fff',
                          color: BRAND_COLORS.textDark,
                          marginBottom: 8,
                        }}
                      />
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                        {filteredMajorOptions.slice(0, 40).map((item) => (
                          <FilterChip
                            key={`managed-major-${item.id}`}
                            label={`${item.code} - ${item.name}`}
                            active={form.managedMajorIds.includes(item.id)}
                            onPress={() => toggleManagedMajorId(item.id)}
                          />
                        ))}
                      </View>
                    </>
                  ) : null}
                </>
              ) : null}

              {form.role === 'EXAMINER' ? (
                <>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Jurusan Penguji</Text>
                  <TextInput
                    value={majorSearch}
                    onChangeText={setMajorSearch}
                    placeholder="Cari jurusan..."
                    placeholderTextColor="#94a3b8"
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 9,
                      backgroundColor: '#fff',
                      color: BRAND_COLORS.textDark,
                      marginBottom: 8,
                    }}
                  />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    <FilterChip
                      label="Tidak Diisi"
                      active={form.examinerMajorId === ''}
                      onPress={() => setForm((prev) => ({ ...prev, examinerMajorId: '' }))}
                    />
                    {filteredMajorOptions.slice(0, 40).map((item) => (
                      <FilterChip
                        key={`examiner-major-${item.id}`}
                        label={`${item.code} - ${item.name}`}
                        active={form.examinerMajorId === String(item.id)}
                        onPress={() => setForm((prev) => ({ ...prev, examinerMajorId: String(item.id) }))}
                      />
                    ))}
                  </View>
                </>
              ) : null}

              {form.role === 'PARENT' ? (
                <>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Cari Siswa Anak</Text>
                  <TextInput
                    value={parentStudentSearch}
                    onChangeText={setParentStudentSearch}
                    placeholder="Cari nama / NISN / username siswa"
                    placeholderTextColor="#94a3b8"
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 9,
                      backgroundColor: '#fff',
                      color: BRAND_COLORS.textDark,
                      marginBottom: 8,
                    }}
                  />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    {filteredParentStudentOptions.slice(0, 60).map((item) => (
                      <FilterChip
                        key={`parent-child-${item.id}`}
                        label={`${item.name} (${item.nisn || '-'})`}
                        active={form.childNisns.includes(item.nisn || '')}
                        onPress={() => {
                          if (!item.nisn) return;
                          toggleParentChildNisn(item.nisn);
                        }}
                      />
                    ))}
                  </View>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                    Total siswa terpilih: {form.childNisns.length}
                  </Text>
                </>
              ) : null}

              {editingUserId ? (
                <>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Status Verifikasi</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    <FilterChip
                      label="Tidak Ubah"
                      active={form.verificationStatus === ''}
                      onPress={() => setForm((prev) => ({ ...prev, verificationStatus: '' }))}
                    />
                    {(['PENDING', 'VERIFIED', 'REJECTED'] as const).map((item) => (
                      <FilterChip
                        key={`verification-${item}`}
                        label={item}
                        active={form.verificationStatus === item}
                        onPress={() => setForm((prev) => ({ ...prev, verificationStatus: item }))}
                      />
                    ))}
                  </View>
                </>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <Pressable
                  onPress={handleSubmitForm}
                  disabled={saveUserMutation.isPending}
                  style={{
                    flex: 1,
                    backgroundColor: BRAND_COLORS.blue,
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    opacity: saveUserMutation.isPending ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {saveUserMutation.isPending ? 'Memproses...' : editingUserId ? 'Simpan Perubahan' : 'Buat User'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={closeForm}
                  disabled={saveUserMutation.isPending}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    backgroundColor: '#fff',
                    opacity: saveUserMutation.isPending ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Batal</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {filteredUsers.slice(0, 120).map((item) => (
            <UserCard
              key={item.id}
              item={item}
              onApprove={() => handleUpdateVerification(item, 'VERIFIED')}
              onReject={() => handleUpdateVerification(item, 'REJECTED')}
              onEdit={() => openEditForm(item)}
              onDelete={() => handleDeleteUser(item)}
              canDelete={isAdmin}
              isApproving={
                updateVerificationMutation.isPending &&
                updateVerificationMutation.variables?.userId === item.id &&
                updateVerificationMutation.variables?.status === 'VERIFIED'
              }
              isRejecting={
                updateVerificationMutation.isPending &&
                updateVerificationMutation.variables?.userId === item.id &&
                updateVerificationMutation.variables?.status === 'REJECTED'
              }
              isDeleting={isAdmin && deleteUserMutation.isPending && deleteUserMutation.variables === item.id}
            />
          ))}

          {filteredUsers.length === 0 ? (
            <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 10 }}>
              Tidak ada user yang sesuai filter.
            </Text>
          ) : null}

          {filteredUsers.length > 120 ? (
            <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', fontSize: 12, marginTop: 2 }}>
              Menampilkan 120 user pertama dari {filteredUsers.length} data.
            </Text>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}
