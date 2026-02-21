import { useEffect, useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../components/AppLoadingScreen';
import { QueryStateView } from '../../components/QueryStateView';
import { BRAND_COLORS } from '../../config/brand';
import { academicYearApi } from '../academicYear/academicYearApi';
import { adminApi } from '../admin/adminApi';
import { useAuth } from '../auth/AuthProvider';
import { getStandardPagePadding } from '../../lib/ui/pageLayout';
import { homeroomReportApi } from './homeroomReportApi';
import {
  HomeroomExtracurricularStudent,
  HomeroomRankingData,
  HomeroomReportType,
  HomeroomSemester,
  HomeroomStudentReportSubjectRow,
} from './types';

type TabKey = 'RAPOR' | 'LEDGER' | 'EXTRACURRICULAR' | 'RANKING';

type ModuleConfig = {
  title: string;
  subtitle: string;
  defaultSemester: HomeroomSemester;
  allowSemesterSwitch: boolean;
};

const MODULE_CONFIG: Record<HomeroomReportType, ModuleConfig> = {
  SBTS: {
    title: 'Wali Kelas Rapor SBTS',
    subtitle: 'Monitoring rapor tengah semester, leger, ekstrakurikuler, dan peringkat kelas.',
    defaultSemester: 'ODD',
    allowSemesterSwitch: true,
  },
  SAS: {
    title: 'Wali Kelas Rapor SAS',
    subtitle: 'Monitoring rapor semester ganjil, leger, ekstrakurikuler, dan peringkat kelas.',
    defaultSemester: 'ODD',
    allowSemesterSwitch: false,
  },
  SAT: {
    title: 'Wali Kelas Rapor SAT',
    subtitle: 'Monitoring rapor semester genap, leger, ekstrakurikuler, dan peringkat kelas.',
    defaultSemester: 'EVEN',
    allowSemesterSwitch: false,
  },
};

function isHomeroomTeacher(duties?: string[], classesCount?: number) {
  if ((classesCount || 0) > 0) return true;
  const normalized = (duties || []).map((item) => item.trim().toUpperCase());
  return normalized.includes('WALI_KELAS');
}

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  const num = Number(value);
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  const num = Number(value);
  return num.toLocaleString('id-ID', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function safeText(value: string | null | undefined, fallback = '-') {
  const normalized = (value || '').trim();
  return normalized.length > 0 ? normalized : fallback;
}

function averageFrom(values: Array<number | null | undefined>) {
  const valid = values.filter((item): item is number => item !== null && item !== undefined && Number.isFinite(item));
  if (!valid.length) return null;
  return valid.reduce((acc, item) => acc + item, 0) / valid.length;
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

function SummaryCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
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

function TabButton({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: '50%',
        paddingHorizontal: 4,
        marginBottom: 8,
      }}
    >
      <View
        style={{
          borderWidth: 1,
          borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
          backgroundColor: active ? '#e9f1ff' : '#fff',
          borderRadius: 10,
          paddingVertical: 10,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <Feather name={icon} size={14} color={active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted} />
        <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderStyle: 'dashed',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 14,
      }}
    >
      <Text style={{ color: '#64748b' }}>{message}</Text>
    </View>
  );
}

function SubjectRow({
  row,
  mode,
}: {
  row: HomeroomStudentReportSubjectRow;
  mode: HomeroomReportType;
}) {
  if (row.isHeader) {
    return (
      <View
        style={{
          backgroundColor: '#eff6ff',
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 7,
          marginBottom: 8,
        }}
      >
        <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', fontSize: 12 }}>{safeText(row.name)}</Text>
      </View>
    );
  }

  const formatifScore = row.formatif?.score ?? row.col1?.score ?? null;
  const examScore = row.sbts?.score ?? row.col2?.score ?? null;
  const finalScore = row.final?.score ?? null;

  const finalPredicate = row.final?.predicate ?? row.col2?.predicate ?? null;
  const description = safeText(row.description || row.col2?.description || '');

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#e2e8f0',
        backgroundColor: '#fff',
        borderRadius: 10,
        padding: 10,
        marginBottom: 8,
      }}
    >
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{safeText(row.name)}</Text>
      <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
        KKTP: {formatScore(row.kkm ?? null)} • Guru: {safeText(row.teacherName)}
      </Text>

      {mode === 'SBTS' ? (
        <View style={{ flexDirection: 'row', marginHorizontal: -4, marginTop: 8 }}>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 8,
                paddingVertical: 7,
                alignItems: 'center',
                backgroundColor: '#f8fbff',
              }}
            >
              <Text style={{ color: '#64748b', fontSize: 10 }}>Formatif</Text>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{formatScore(formatifScore)}</Text>
            </View>
          </View>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 8,
                paddingVertical: 7,
                alignItems: 'center',
                backgroundColor: '#f8fbff',
              }}
            >
              <Text style={{ color: '#64748b', fontSize: 10 }}>SBTS</Text>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{formatScore(examScore)}</Text>
            </View>
          </View>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 8,
                paddingVertical: 7,
                alignItems: 'center',
                backgroundColor: '#f8fbff',
              }}
            >
              <Text style={{ color: '#64748b', fontSize: 10 }}>Nilai Akhir</Text>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{formatScore(finalScore)}</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', marginHorizontal: -4, marginTop: 8 }}>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 8,
                paddingVertical: 7,
                alignItems: 'center',
                backgroundColor: '#f8fbff',
              }}
            >
              <Text style={{ color: '#64748b', fontSize: 10 }}>Nilai Akhir</Text>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{formatScore(row.col1?.score ?? finalScore)}</Text>
            </View>
          </View>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 8,
                paddingVertical: 7,
                alignItems: 'center',
                backgroundColor: '#f8fbff',
              }}
            >
              <Text style={{ color: '#64748b', fontSize: 10 }}>Predikat</Text>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{safeText(finalPredicate)}</Text>
            </View>
          </View>
        </View>
      )}

      <Text style={{ color: '#475569', fontSize: 12, marginTop: 8 }}>
        Capaian: {mode === 'SBTS' ? safeText(description, '-') : safeText(description)}
      </Text>
    </View>
  );
}

export function HomeroomReportModuleScreen({ mode }: { mode: HomeroomReportType }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const moduleConfig = MODULE_CONFIG[mode];

  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('RAPOR');
  const [semester, setSemester] = useState<HomeroomSemester>(moduleConfig.defaultSemester);
  const [search, setSearch] = useState('');

  const isAllowed = user?.role === 'TEACHER' && isHomeroomTeacher(user?.additionalDuties, user?.teacherClasses?.length);

  useEffect(() => {
    setSemester(moduleConfig.defaultSemester);
  }, [moduleConfig.defaultSemester]);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-homeroom-report-active-year', mode],
    enabled: isAuthenticated && user?.role === 'TEACHER',
    queryFn: async () => {
      try {
        return await academicYearApi.getActive();
      } catch {
        return null;
      }
    },
  });

  const classesQuery = useQuery({
    queryKey: ['mobile-homeroom-report-classes', mode, user?.id, activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed && !!user?.id && !!activeYearQuery.data?.id,
    queryFn: async () => {
      const result = await adminApi.listClasses({
        page: 1,
        limit: 300,
        academicYearId: activeYearQuery.data?.id,
        teacherId: user?.id,
      });
      return result.items;
    },
  });

  const classItems = classesQuery.data || [];
  const selectedClass = classItems.find((item) => item.id === selectedClassId) || null;

  useEffect(() => {
    if (!classItems.length) return;
    if (selectedClassId && classItems.some((item) => item.id === selectedClassId)) return;
    setSelectedClassId(classItems[0].id);
  }, [selectedClassId, classItems]);

  const classDetailQuery = useQuery({
    queryKey: ['mobile-homeroom-report-class-detail', mode, selectedClassId],
    enabled: isAuthenticated && !!isAllowed && !!selectedClassId,
    queryFn: async () => adminApi.getClassById(Number(selectedClassId)),
  });

  const students = classDetailQuery.data?.students || [];

  useEffect(() => {
    if (!students.length) {
      setSelectedStudentId(null);
      return;
    }
    if (selectedStudentId && students.some((item) => item.id === selectedStudentId)) return;
    setSelectedStudentId(students[0].id);
  }, [students, selectedStudentId]);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredStudents = useMemo(() => {
    if (!normalizedSearch) return students;
    return students.filter((item) => {
      const name = (item.name || '').toLowerCase();
      const nis = (item.nis || '').toLowerCase();
      const nisn = (item.nisn || '').toLowerCase();
      return name.includes(normalizedSearch) || nis.includes(normalizedSearch) || nisn.includes(normalizedSearch);
    });
  }, [students, normalizedSearch]);

  const selectedStudent = students.find((item) => item.id === selectedStudentId) || null;

  const ledgerQuery = useQuery({
    queryKey: ['mobile-homeroom-report-ledger', mode, selectedClassId, semester],
    enabled: isAuthenticated && !!isAllowed && !!selectedClassId && activeTab === 'LEDGER',
    queryFn: async () =>
      homeroomReportApi.getClassLedger({
        classId: Number(selectedClassId),
        semester,
      }),
  });

  const extracurricularQuery = useQuery({
    queryKey: ['mobile-homeroom-report-extracurricular', mode, selectedClassId, semester],
    enabled: isAuthenticated && !!isAllowed && !!selectedClassId && activeTab === 'EXTRACURRICULAR',
    queryFn: async () =>
      homeroomReportApi.getClassExtracurricular({
        classId: Number(selectedClassId),
        semester,
        reportType: mode,
      }),
  });

  const rankingQuery = useQuery({
    queryKey: ['mobile-homeroom-report-ranking', mode, selectedClassId, semester, activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed && !!selectedClassId && activeTab === 'RANKING',
    queryFn: async () =>
      homeroomReportApi.getClassRankings({
        classId: Number(selectedClassId),
        semester,
        academicYearId: activeYearQuery.data?.id,
      }),
  });

  const studentReportQuery = useQuery({
    queryKey: ['mobile-homeroom-report-student', mode, selectedStudentId, semester],
    enabled: isAuthenticated && !!isAllowed && !!selectedStudentId && activeTab === 'RAPOR',
    queryFn: async () =>
      homeroomReportApi.getStudentReport({
        studentId: Number(selectedStudentId),
        semester,
        type: mode,
      }),
  });

  const onRefresh = async () => {
    await Promise.all([
      activeYearQuery.refetch(),
      classesQuery.refetch(),
      classDetailQuery.refetch(),
      studentReportQuery.refetch(),
      ledgerQuery.refetch(),
      extracurricularQuery.refetch(),
      rankingQuery.refetch(),
    ]);
  };

  const renderRaporTab = () => {
    if (!students.length && !classDetailQuery.isLoading) {
      return <EmptyState message="Belum ada siswa aktif pada kelas terpilih." />;
    }

    return (
      <View>
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Pilih Siswa</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
            {filteredStudents.length > 0 ? (
              filteredStudents.map((student) => {
                const selected = student.id === selectedStudentId;
                return (
                  <View key={student.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                    <Pressable
                      onPress={() => setSelectedStudentId(student.id)}
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? BRAND_COLORS.blue : '#d5e1f5',
                        backgroundColor: selected ? '#e9f1ff' : '#fff',
                        borderRadius: 10,
                        paddingVertical: 9,
                        paddingHorizontal: 10,
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{ color: selected ? BRAND_COLORS.navy : BRAND_COLORS.textDark, fontWeight: '700' }}
                      >
                        {safeText(student.name)}
                      </Text>
                      <Text numberOfLines={1} style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                        NIS: {safeText(student.nis)}
                      </Text>
                    </Pressable>
                  </View>
                );
              })
            ) : (
              <View style={{ width: '100%', paddingHorizontal: 4 }}>
                <EmptyState message="Siswa tidak ditemukan untuk pencarian ini." />
              </View>
            )}
          </View>
        </View>

        {selectedStudent ? (
          <View
            style={{
              backgroundColor: '#1e3a8a',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#bfdbfe', fontSize: 12 }}>Siswa Terpilih</Text>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 3 }}>{safeText(selectedStudent.name)}</Text>
            <Text style={{ color: '#dbeafe', fontSize: 12, marginTop: 3 }}>
              NIS: {safeText(selectedStudent.nis)} • NISN: {safeText(selectedStudent.nisn)}
            </Text>
          </View>
        ) : null}

        {studentReportQuery.isLoading ? <QueryStateView type="loading" message="Memuat rapor siswa..." /> : null}
        {studentReportQuery.isError ? (
          <QueryStateView type="error" message="Gagal memuat rapor siswa." onRetry={() => studentReportQuery.refetch()} />
        ) : null}

        {!studentReportQuery.isLoading && !studentReportQuery.isError && studentReportQuery.data ? (
          <View>
            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 12 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <SummaryCard
                  title="Semester"
                  value={studentReportQuery.data.header.semester}
                  subtitle={studentReportQuery.data.header.academicYear}
                />
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <SummaryCard
                  title="Kelas"
                  value={safeText(studentReportQuery.data.header.class)}
                  subtitle={safeText(studentReportQuery.data.header.major)}
                />
              </View>
            </View>

            <View style={{ marginBottom: 12 }}>
              {(['A', 'B', 'C'] as const).map((groupKey) => {
                const rows = studentReportQuery.data?.body?.groups?.[groupKey] || [];
                if (!rows.length) return null;
                const title =
                  groupKey === 'A'
                    ? 'Kelompok Umum'
                    : groupKey === 'B'
                      ? 'Kelompok Kejuruan'
                      : 'Kelompok Muatan Lokal';
                return (
                  <View
                    key={groupKey}
                    style={{
                      backgroundColor: '#fff',
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>{title}</Text>
                    {rows.map((row, index) => (
                      <SubjectRow key={`${groupKey}-${row.id ?? row.name}-${index}`} row={row} mode={mode} />
                    ))}
                  </View>
                );
              })}
            </View>

            {studentReportQuery.data.body?.attendance ? (
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Rekap Kehadiran</Text>
                <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Sakit"
                      value={formatNumber(studentReportQuery.data.body.attendance.sick)}
                      subtitle="Total siswa"
                    />
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Izin"
                      value={formatNumber(studentReportQuery.data.body.attendance.permission)}
                      subtitle="Total siswa"
                    />
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Alpa"
                      value={formatNumber(studentReportQuery.data.body.attendance.absent)}
                      subtitle="Total siswa"
                    />
                  </View>
                </View>
              </View>
            ) : null}

            {studentReportQuery.data.body?.extracurriculars?.length ? (
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Ekstrakurikuler</Text>
                {studentReportQuery.data.body.extracurriculars.slice(0, 5).map((item, idx) => (
                  <View key={`${item.name}-${idx}`} style={{ marginBottom: idx === 4 ? 0 : 8 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 13 }}>{safeText(item.name)}</Text>
                    <Text style={{ color: '#64748b', fontSize: 12 }}>
                      Predikat: {safeText(item.grade)} • {safeText(item.description)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {studentReportQuery.data.body?.homeroomNote ? (
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Catatan Wali Kelas</Text>
                <Text style={{ color: '#334155' }}>{safeText(studentReportQuery.data.body.homeroomNote)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const renderLedgerTab = () => {
    if (ledgerQuery.isLoading) return <QueryStateView type="loading" message="Memuat data leger nilai..." />;
    if (ledgerQuery.isError) {
      return <QueryStateView type="error" message="Gagal memuat data leger." onRetry={() => ledgerQuery.refetch()} />;
    }

    const ledgerData = ledgerQuery.data;
    if (!ledgerData || !ledgerData.students.length) {
      return <EmptyState message="Belum ada data leger untuk filter terpilih." />;
    }

    const rows = ledgerData.students.filter((item) => {
      if (!normalizedSearch) return true;
      const name = (item.name || '').toLowerCase();
      const nis = (item.nis || '').toLowerCase();
      const nisn = (item.nisn || '').toLowerCase();
      return name.includes(normalizedSearch) || nis.includes(normalizedSearch) || nisn.includes(normalizedSearch);
    });

    const classAverage = averageFrom(
      rows.map((item) => {
        const grades = Object.values(item.grades || {});
        return averageFrom(grades.map((grade) => grade.finalScore));
      }),
    );

    const classFormatif = averageFrom(
      rows.map((item) => {
        const grades = Object.values(item.grades || {});
        return averageFrom(grades.map((grade) => grade.formatif));
      }),
    );

    return (
      <View>
        <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 12 }}>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <SummaryCard
              title="Jumlah Siswa"
              value={formatNumber(rows.length)}
              subtitle={`${formatNumber(ledgerData.subjects.length)} mata pelajaran`}
            />
          </View>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <SummaryCard
              title="Rata-rata Akhir"
              value={formatNumber(classAverage, 1)}
              subtitle={`Formatif ${formatNumber(classFormatif, 1)}`}
            />
          </View>
        </View>

        {rows.length > 0 ? (
          rows.map((item) => {
            const gradeValues = Object.values(item.grades || {});
            const avgFormatif = averageFrom(gradeValues.map((g) => g.formatif));
            const avgExam = averageFrom(gradeValues.map((g) => g.sbts));
            const avgFinal = averageFrom(gradeValues.map((g) => g.finalScore));
            const predicateCount = gradeValues.reduce<Record<string, number>>((acc, grade) => {
              const key = (grade.predicate || '-').toUpperCase();
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            }, {});
            const dominantPredicate = Object.entries(predicateCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{safeText(item.name)}</Text>
                <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                  NIS: {safeText(item.nis)} • NISN: {safeText(item.nisn)}
                </Text>

                <View style={{ flexDirection: 'row', marginHorizontal: -4, marginTop: 8 }}>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Formatif"
                      value={formatNumber(avgFormatif, 1)}
                      subtitle="Rata-rata"
                    />
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title={mode === 'SBTS' ? 'SBTS' : mode}
                      value={formatNumber(avgExam, 1)}
                      subtitle="Rata-rata"
                    />
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Nilai Akhir"
                      value={formatNumber(avgFinal, 1)}
                      subtitle={`Predikat dominan ${safeText(dominantPredicate)}`}
                    />
                  </View>
                </View>
              </View>
            );
          })
        ) : (
          <EmptyState message="Siswa tidak ditemukan untuk pencarian ini." />
        )}
      </View>
    );
  };

  const renderExtracurricularTab = () => {
    if (extracurricularQuery.isLoading) return <QueryStateView type="loading" message="Memuat data ekstrakurikuler..." />;
    if (extracurricularQuery.isError) {
      return (
        <QueryStateView
          type="error"
          message="Gagal memuat data ekstrakurikuler."
          onRetry={() => extracurricularQuery.refetch()}
        />
      );
    }

    const rows = (extracurricularQuery.data || []).filter((item) => {
      if (!normalizedSearch) return true;
      const name = (item.name || '').toLowerCase();
      const nis = (item.nis || '').toLowerCase();
      const nisn = (item.nisn || '').toLowerCase();
      return name.includes(normalizedSearch) || nis.includes(normalizedSearch) || nisn.includes(normalizedSearch);
    });

    if (!rows.length) {
      return <EmptyState message="Belum ada data ekstrakurikuler untuk filter terpilih." />;
    }

    const totalEkskul = rows.reduce((acc, item) => acc + item.extracurriculars.length, 0);
    const totalAchievements = rows.reduce((acc, item) => acc + item.achievements.length, 0);

    return (
      <View>
        <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 12 }}>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <SummaryCard title="Total Siswa" value={formatNumber(rows.length)} subtitle="Data ekstrakurikuler" />
          </View>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <SummaryCard
              title="Item Ekskul"
              value={formatNumber(totalEkskul)}
              subtitle={`Prestasi ${formatNumber(totalAchievements)}`}
            />
          </View>
        </View>

        {rows.map((item: HomeroomExtracurricularStudent) => (
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{safeText(item.name)}</Text>
            <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
              NIS: {safeText(item.nis)} • NISN: {safeText(item.nisn)}
            </Text>

            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginTop: 8 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <SummaryCard title="S" value={formatNumber(item.attendance.s)} subtitle="Sakit" />
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <SummaryCard title="I" value={formatNumber(item.attendance.i)} subtitle="Izin" />
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <SummaryCard title="A" value={formatNumber(item.attendance.a)} subtitle="Alpa" />
              </View>
            </View>

            <View style={{ marginTop: 10 }}>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Ekstrakurikuler</Text>
              {item.extracurriculars.length > 0 ? (
                item.extracurriculars.map((ekskul) => (
                  <View key={ekskul.id} style={{ marginBottom: 6 }}>
                    <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 13 }}>{safeText(ekskul.ekskulName)}</Text>
                    <Text style={{ color: '#64748b', fontSize: 12 }}>
                      Predikat: {safeText(ekskul.grade)} • {safeText(ekskul.description)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={{ color: '#64748b' }}>Belum ada data ekstrakurikuler.</Text>
              )}
            </View>

            {item.achievements.length > 0 ? (
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Prestasi</Text>
                {item.achievements.slice(0, 4).map((achievement) => (
                  <Text key={achievement.id} style={{ color: '#475569', fontSize: 12, marginBottom: 4 }}>
                    • {safeText(achievement.name)} ({safeText(achievement.rank)} - {safeText(achievement.level)})
                  </Text>
                ))}
              </View>
            ) : null}

            <View style={{ marginTop: 8 }}>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Catatan Wali Kelas</Text>
              <Text style={{ color: '#475569' }}>{safeText(item.catatan, 'Belum ada catatan.')}</Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderRankingTab = () => {
    if (rankingQuery.isLoading) return <QueryStateView type="loading" message="Memuat data peringkat..." />;
    if (rankingQuery.isError) {
      return <QueryStateView type="error" message="Gagal memuat data peringkat." onRetry={() => rankingQuery.refetch()} />;
    }

    const rankingData = rankingQuery.data as HomeroomRankingData | undefined;
    const rankingRows = [...(rankingData?.rankings || [])]
      .sort((a, b) => a.rank - b.rank)
      .filter((item) => {
        if (!normalizedSearch) return true;
        const name = (item.student?.name || '').toLowerCase();
        const nis = (item.student?.nis || '').toLowerCase();
        const nisn = (item.student?.nisn || '').toLowerCase();
        return name.includes(normalizedSearch) || nis.includes(normalizedSearch) || nisn.includes(normalizedSearch);
      });

    if (!rankingRows.length) {
      return <EmptyState message="Belum ada data peringkat untuk filter terpilih." />;
    }

    const topThree = rankingRows.filter((item) => item.rank <= 3);

    return (
      <View>
        <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 12 }}>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <SummaryCard title="Jumlah Siswa" value={formatNumber(rankingRows.length)} subtitle="Data peringkat" />
          </View>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <SummaryCard
              title="Top 1"
              value={safeText(topThree[0]?.student?.name || '-', '-')}
              subtitle={`Skor ${formatNumber(topThree[0]?.totalScore ?? null, 2)}`}
            />
          </View>
        </View>

        {rankingRows.map((item) => (
          <View
            key={item.student.id}
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: item.rank <= 3 ? '#fef3c7' : '#e2e8f0',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
              }}
            >
              <Text style={{ color: '#0f172a', fontWeight: '700' }}>#{item.rank}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{safeText(item.student.name)}</Text>
              <Text style={{ color: '#64748b', fontSize: 12 }}>
                NIS: {safeText(item.student.nis)} • NISN: {safeText(item.student.nisn)}
              </Text>
              <Text style={{ color: '#334155', fontSize: 12, marginTop: 3 }}>
                Skor total: {formatNumber(item.totalScore, 2)} • Rata-rata: {formatNumber(item.averageScore, 2)} • Mapel:{' '}
                {formatNumber(item.subjectCount)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  if (isLoading) return <AppLoadingScreen message="Memuat modul rapor wali kelas..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>{moduleConfig.title}</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!isAllowed) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
          {moduleConfig.title}
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
          Modul ini tersedia untuk wali kelas yang memiliki kelas aktif.
        </Text>
        <QueryStateView type="error" message="Anda tidak memiliki hak akses untuk modul ini." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={
            activeYearQuery.isFetching ||
            classesQuery.isFetching ||
            classDetailQuery.isFetching ||
            studentReportQuery.isFetching ||
            ledgerQuery.isFetching ||
            extracurricularQuery.isFetching ||
            rankingQuery.isFetching
          }
          onRefresh={() => {
            void onRefresh();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>{moduleConfig.title}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>{moduleConfig.subtitle}</Text>

      {activeYearQuery.data?.name ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: '#64748b', fontSize: 12 }}>Tahun Ajaran Aktif</Text>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginTop: 2 }}>{activeYearQuery.data.name}</Text>
        </View>
      ) : null}

      {classesQuery.isLoading ? <QueryStateView type="loading" message="Memuat kelas wali..." /> : null}
      {classesQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat kelas wali." onRetry={() => classesQuery.refetch()} />
      ) : null}

      {!classesQuery.isLoading && !classesQuery.isError ? (
        classItems.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Pilih Kelas</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
              {classItems.map((classItem) => {
                const selected = selectedClassId === classItem.id;
                return (
                  <View key={classItem.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                    <Pressable
                      onPress={() => {
                        setSelectedClassId(classItem.id);
                        setSelectedStudentId(null);
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? BRAND_COLORS.blue : '#d5e1f5',
                        backgroundColor: selected ? '#e9f1ff' : '#fff',
                        borderRadius: 10,
                        paddingVertical: 10,
                        paddingHorizontal: 10,
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{ color: selected ? BRAND_COLORS.navy : BRAND_COLORS.textDark, fontWeight: '700' }}
                      >
                        {classItem.name}
                      </Text>
                      <Text numberOfLines={1} style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                        {classItem.major?.code || classItem.major?.name || '-'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <EmptyState message="Anda belum memiliki kelas wali pada tahun ajaran aktif." />
        )
      ) : null}

      {selectedClass ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: '#64748b', fontSize: 12 }}>Kelas Aktif</Text>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginTop: 2 }}>{selectedClass.name}</Text>
          <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
            {selectedClass.major?.name || '-'} • {selectedClass.academicYear?.name || activeYearQuery.data?.name || '-'}
          </Text>
        </View>
      ) : null}

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#dbe7fb',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Semester</Text>
        {moduleConfig.allowSemesterSwitch ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <FilterChip active={semester === 'ODD'} label="Ganjil" onPress={() => setSemester('ODD')} />
            <FilterChip active={semester === 'EVEN'} label="Genap" onPress={() => setSemester('EVEN')} />
          </View>
        ) : (
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#cfe0fb',
              backgroundColor: '#eff6ff',
              paddingHorizontal: 12,
              paddingVertical: 8,
              alignSelf: 'flex-start',
            }}
          >
            <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>
              {semester === 'ODD' ? 'Ganjil' : 'Genap'}
            </Text>
          </View>
        )}
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
          marginBottom: 12,
        }}
      >
        <Feather name="search" size={16} color="#64748b" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari siswa / NIS / NISN..."
          style={{ flex: 1, marginLeft: 8, color: '#0f172a' }}
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
        />
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#dbe7fb',
          borderRadius: 12,
          padding: 8,
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
          <TabButton active={activeTab === 'RAPOR'} label="Rapor Siswa" icon="file-text" onPress={() => setActiveTab('RAPOR')} />
          <TabButton active={activeTab === 'LEDGER'} label="Leger Nilai" icon="layers" onPress={() => setActiveTab('LEDGER')} />
          <TabButton
            active={activeTab === 'EXTRACURRICULAR'}
            label="Ekstrakurikuler"
            icon="activity"
            onPress={() => setActiveTab('EXTRACURRICULAR')}
          />
          <TabButton active={activeTab === 'RANKING'} label="Peringkat" icon="bar-chart-2" onPress={() => setActiveTab('RANKING')} />
        </View>
      </View>

      {classDetailQuery.isLoading && activeTab === 'RAPOR' ? <QueryStateView type="loading" message="Memuat data siswa..." /> : null}
      {classDetailQuery.isError && activeTab === 'RAPOR' ? (
        <QueryStateView type="error" message="Gagal memuat data siswa kelas." onRetry={() => classDetailQuery.refetch()} />
      ) : null}

      {activeTab === 'RAPOR' ? renderRaporTab() : null}
      {activeTab === 'LEDGER' ? renderLedgerTab() : null}
      {activeTab === 'EXTRACURRICULAR' ? renderExtracurricularTab() : null}
      {activeTab === 'RANKING' ? renderRankingTab() : null}
    </ScrollView>
  );
}
