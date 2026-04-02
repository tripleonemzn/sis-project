import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileMenuTab } from '../../../src/components/MobileMenuTab';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { AdminTeacherAssignment, AdminTeachingLoadTeacher, adminApi } from '../../../src/features/admin/adminApi';
import { examApi } from '../../../src/features/exams/examApi';
import { TeacherExamSchedule } from '../../../src/features/exams/types';
import { teachingResourceProgramApi } from '../../../src/features/learningResources/teachingResourceProgramApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

type PerformanceSection = 'RINGKASAN' | 'GURU' | 'UJIAN';

type TeacherKpiRow = {
  teacherId: number;
  teacherName: string;
  teacherUsername: string;
  assignmentCount: number;
  classCount: number;
  subjectCount: number;
  totalHours: number;
  totalSessions: number;
};

type ClassExamKpiRow = {
  classId: number;
  className: string;
  totalSchedules: number;
  readySchedules: number;
  noProctorCount: number;
  noRoomCount: number;
  noPacketCount: number;
};

type TeachingResourceSummary = {
  total: number;
  submitted: number;
  approved: number;
  rejected: number;
  draft: number;
};

function hasCurriculumDuty(userDuties?: string[]) {
  const duties = (userDuties || []).map((item) => item.trim().toUpperCase());
  return duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');
}

function formatNumber(value: number) {
  return value.toLocaleString('id-ID');
}

function formatPercent(value: number) {
  return `${value.toFixed(1).replace('.', ',')}%`;
}

function toPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

const SectionChip = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => (
  <MobileMenuTab active={active} label={label} onPress={onPress} minWidth={94} />
);

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
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 22, marginTop: 4 }}>{value}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }}>{subtitle}</Text>
    </View>
  );
}

function ProgressRow({
  label,
  valueText,
  percent,
}: {
  label: string;
  valueText: string;
  percent: number;
}) {
  const safePercent = Math.max(0, Math.min(100, percent));

  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>{valueText}</Text>
      </View>
      <View style={{ height: 8, borderRadius: 999, backgroundColor: '#dde7fa', overflow: 'hidden' }}>
        <View
          style={{
            width: `${safePercent}%`,
            height: 8,
            borderRadius: 999,
            backgroundColor: BRAND_COLORS.blue,
          }}
        />
      </View>
    </View>
  );
}

function isReadySchedule(schedule: TeacherExamSchedule) {
  return !!schedule.proctorId && !!schedule.packetId && !!(schedule.room || '').trim();
}

export default function TeacherWakakurPerformanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [section, setSection] = useState<PerformanceSection>('RINGKASAN');
  const [search, setSearch] = useState('');

  const isAllowed = user?.role === 'TEACHER' && hasCurriculumDuty(user?.additionalDuties);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-wakakur-performance-active-year'],
    enabled: isAuthenticated && user?.role === 'TEACHER',
    queryFn: async () => {
      try {
        return await academicYearApi.getActive();
      } catch {
        return null;
      }
    },
  });

  const performanceQuery = useQuery({
    queryKey: ['mobile-wakakur-performance-data', activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed && !!activeYearQuery.data?.id,
    queryFn: async () => {
      const academicYearId = Number(activeYearQuery.data?.id);
      const [assignmentsResult, teachingLoad, schedules, classesResult, subjectsResult, teachingResourceSummary] = await Promise.all([
        adminApi.listTeacherAssignments({
          academicYearId,
          page: 1,
          limit: 800,
        }),
        adminApi.getTeachingLoadSummary({ academicYearId }),
        examApi.getTeacherSchedules({ academicYearId }),
        adminApi.listClasses({
          academicYearId,
          page: 1,
          limit: 400,
        }),
        adminApi.listSubjects({
          page: 1,
          limit: 400,
        }),
        teachingResourceProgramApi.getEntriesSummary({ academicYearId }).catch(() => null),
      ]);

      const byStatus = Array.isArray(teachingResourceSummary?.byStatus) ? teachingResourceSummary.byStatus : [];
      const countStatus = (status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED') =>
        byStatus.find((item) => item.status === status)?.total || 0;

      return {
        assignments: assignmentsResult.items,
        assignmentTotal: assignmentsResult.pagination.total,
        teachingLoad,
        schedules,
        classes: classesResult.items,
        classTotal: classesResult.pagination.total,
        subjectTotal: subjectsResult.pagination.total,
        teachingResourceSummary: {
          total: Number(teachingResourceSummary?.total || 0),
          submitted: countStatus('SUBMITTED'),
          approved: countStatus('APPROVED'),
          rejected: countStatus('REJECTED'),
          draft: countStatus('DRAFT'),
        } as TeachingResourceSummary,
      };
    },
  });

  const assignments = useMemo(
    () => performanceQuery.data?.assignments || [],
    [performanceQuery.data?.assignments],
  );
  const teachingLoad = useMemo(
    () => performanceQuery.data?.teachingLoad || [],
    [performanceQuery.data?.teachingLoad],
  );
  const schedules = useMemo(() => performanceQuery.data?.schedules || [], [performanceQuery.data?.schedules]);
  const classTotal = performanceQuery.data?.classTotal || 0;
  const assignmentTotal = performanceQuery.data?.assignmentTotal || assignments.length;
  const subjectTotal = performanceQuery.data?.subjectTotal || 0;
  const teachingResourceSummary = performanceQuery.data?.teachingResourceSummary || {
    total: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
    draft: 0,
  };
  const normalizedSearch = search.trim().toLowerCase();

  const teacherRows = useMemo(() => {
    const map = new Map<number, {
      teacherId: number;
      teacherName: string;
      teacherUsername: string;
      assignmentCount: number;
      classSet: Set<string>;
      subjectSet: Set<string>;
      totalHours: number;
      totalSessions: number;
      totalClasses: number;
      totalSubjects: number;
    }>();

    const ensureTeacherRow = (teacherId: number, teacherName: string, teacherUsername: string) => {
      if (!map.has(teacherId)) {
        map.set(teacherId, {
          teacherId,
          teacherName: teacherName || '-',
          teacherUsername: teacherUsername || '-',
          assignmentCount: 0,
          classSet: new Set<string>(),
          subjectSet: new Set<string>(),
          totalHours: 0,
          totalSessions: 0,
          totalClasses: 0,
          totalSubjects: 0,
        });
      }
      return map.get(teacherId)!;
    };

    for (const assignment of assignments) {
      const teacher = assignment.teacher;
      if (!teacher?.id) continue;
      const row = ensureTeacherRow(teacher.id, teacher.name, teacher.username);
      row.assignmentCount += 1;
      if (assignment.class?.name) row.classSet.add(assignment.class.name);
      if (assignment.subject?.code) row.subjectSet.add(assignment.subject.code);
    }

    for (const load of teachingLoad) {
      if (!load.teacherId) continue;
      const row = ensureTeacherRow(load.teacherId, load.teacherName, load.teacherUsername);
      row.totalHours = load.totalHours || 0;
      row.totalSessions = load.totalSessions || 0;
      row.totalClasses = load.totalClasses || 0;
      row.totalSubjects = load.totalSubjects || 0;
    }

    const rows: TeacherKpiRow[] = [];
    for (const row of map.values()) {
      rows.push({
        teacherId: row.teacherId,
        teacherName: row.teacherName,
        teacherUsername: row.teacherUsername,
        assignmentCount: row.assignmentCount,
        classCount: Math.max(row.classSet.size, row.totalClasses),
        subjectCount: Math.max(row.subjectSet.size, row.totalSubjects),
        totalHours: row.totalHours,
        totalSessions: row.totalSessions,
      });
    }

    return rows.sort((a, b) => {
      if (b.totalHours !== a.totalHours) return b.totalHours - a.totalHours;
      return b.assignmentCount - a.assignmentCount;
    });
  }, [assignments, teachingLoad]);

  const filteredTeacherRows = useMemo(() => {
    if (!normalizedSearch) return teacherRows;
    return teacherRows.filter((item) => {
      const haystacks = [
        item.teacherName || '',
        item.teacherUsername || '',
        String(item.totalHours),
        String(item.assignmentCount),
      ];
      return haystacks.some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [teacherRows, normalizedSearch]);

  const classExamRows = useMemo(() => {
    const map = new Map<number, ClassExamKpiRow>();

    for (const schedule of schedules) {
      const classId = schedule.classId || schedule.class?.id;
      if (!classId) continue;

      if (!map.has(classId)) {
        map.set(classId, {
          classId,
          className: schedule.class?.name || `Kelas ${classId}`,
          totalSchedules: 0,
          readySchedules: 0,
          noProctorCount: 0,
          noRoomCount: 0,
          noPacketCount: 0,
        });
      }

      const row = map.get(classId)!;
      row.totalSchedules += 1;
      if (isReadySchedule(schedule)) row.readySchedules += 1;
      if (!schedule.proctorId) row.noProctorCount += 1;
      if (!(schedule.room || '').trim()) row.noRoomCount += 1;
      if (!schedule.packetId) row.noPacketCount += 1;
    }

    return Array.from(map.values()).sort((a, b) => b.totalSchedules - a.totalSchedules);
  }, [schedules]);

  const filteredClassExamRows = useMemo(() => {
    if (!normalizedSearch) return classExamRows;
    return classExamRows.filter((item) => item.className.toLowerCase().includes(normalizedSearch));
  }, [classExamRows, normalizedSearch]);

  const summary = useMemo(() => {
    const assignmentClassIds = new Set<number>();
    const assignmentSubjectIds = new Set<number>();
    for (const assignment of assignments as AdminTeacherAssignment[]) {
      if (assignment.class?.id) assignmentClassIds.add(assignment.class.id);
      if (assignment.subject?.id) assignmentSubjectIds.add(assignment.subject.id);
    }

    const scheduleReadyCount = schedules.filter((item) => isReadySchedule(item)).length;
    const scheduleNoProctorCount = schedules.filter((item) => !item.proctorId).length;
    const scheduleNoRoomCount = schedules.filter((item) => !(item.room || '').trim()).length;
    const scheduleNoPacketCount = schedules.filter((item) => !item.packetId).length;
    const teachingTeacherCount = teachingLoad.length;
    const totalHours = teachingLoad.reduce((acc: number, item: AdminTeachingLoadTeacher) => acc + (item.totalHours || 0), 0);
    const averageHours = teachingTeacherCount > 0 ? totalHours / teachingTeacherCount : 0;
    const highLoadTeacherCount = teacherRows.filter((item) => item.totalHours >= 30).length;
    const zeroHoursTeacherCount = teacherRows.filter((item) => item.totalHours <= 0).length;

    return {
      teacherCount: teacherRows.length,
      teachingTeacherCount,
      assignmentTotal,
      classCovered: assignmentClassIds.size,
      subjectCovered: assignmentSubjectIds.size,
      classCoveragePercent: toPercent(assignmentClassIds.size, classTotal),
      subjectCoveragePercent: toPercent(assignmentSubjectIds.size, subjectTotal),
      scheduleTotal: schedules.length,
      scheduleReadyCount,
      scheduleReadyPercent: toPercent(scheduleReadyCount, schedules.length),
      scheduleNoProctorCount,
      scheduleNoRoomCount,
      scheduleNoPacketCount,
      averageHours,
      highLoadTeacherCount,
      zeroHoursTeacherCount,
    };
  }, [assignments, assignmentTotal, schedules, teachingLoad, teacherRows, classTotal, subjectTotal]);

  if (isLoading) return <AppLoadingScreen message="Memuat monitoring kinerja..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Monitoring Kinerja</Text>
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
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8, color: BRAND_COLORS.textDark }}>
          Monitoring Kinerja
        </Text>
        <QueryStateView
          type="error"
          message="Akses modul ini membutuhkan tugas tambahan Wakasek Kurikulum atau Sekretaris Kurikulum."
        />
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
          refreshing={activeYearQuery.isFetching || performanceQuery.isFetching}
          onRefresh={() => {
            void activeYearQuery.refetch();
            void performanceQuery.refetch();
          }}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#d6e0f2',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="arrow-left" size={18} color={BRAND_COLORS.textDark} />
        </Pressable>
        <Text style={{ marginLeft: 10, color: BRAND_COLORS.textDark, fontSize: 22, fontWeight: '700' }}>
          Monitoring Kinerja
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 10 }}>
        Pantau beban mengajar, cakupan assignment, dan kesiapan pelaksanaan ujian.
      </Text>

      {activeYearQuery.isLoading ? <QueryStateView type="loading" message="Memuat tahun ajaran aktif..." /> : null}

      {!activeYearQuery.isLoading && !activeYearQuery.data ? (
        <View style={{ marginBottom: 12 }}>
          <QueryStateView type="error" message="Tahun ajaran aktif tidak ditemukan." />
        </View>
      ) : null}

      {performanceQuery.isLoading ? <QueryStateView type="loading" message="Menghitung ringkasan kinerja..." /> : null}

      {performanceQuery.isError ? (
        <View style={{ marginBottom: 12 }}>
          <QueryStateView
            type="error"
            message="Gagal memuat data monitoring kinerja."
            onRetry={() => performanceQuery.refetch()}
          />
        </View>
      ) : null}

      {performanceQuery.data ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <SectionChip active={section === 'RINGKASAN'} label="Ringkasan" onPress={() => setSection('RINGKASAN')} />
            <SectionChip active={section === 'GURU'} label="Per Guru" onPress={() => setSection('GURU')} />
            <SectionChip active={section === 'UJIAN'} label="Per Ujian" onPress={() => setSection('UJIAN')} />
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#fff',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#d6e0f2',
              paddingHorizontal: 12,
              marginBottom: 12,
            }}
          >
            <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={section === 'GURU' ? 'Cari guru (nama/username)' : 'Cari kelas atau kata kunci'}
              placeholderTextColor="#94a3b8"
              style={{
                flex: 1,
                paddingHorizontal: 8,
                paddingVertical: 10,
                color: BRAND_COLORS.textDark,
              }}
            />
          </View>

          {section === 'RINGKASAN' ? (
            <>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <SummaryCard
                  title="Guru Aktif"
                  value={formatNumber(summary.teacherCount)}
                  subtitle={`${formatNumber(summary.teachingTeacherCount)} guru punya jam mengajar`}
                />
                <SummaryCard
                  title="Total Assignment"
                  value={formatNumber(summary.assignmentTotal)}
                  subtitle={`${formatNumber(summary.classCovered)} kelas tercakup`}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <SummaryCard
                  title="Rata-rata Jam"
                  value={summary.averageHours.toFixed(1).replace('.', ',')}
                  subtitle="Jam per guru (teaching load)"
                />
                <SummaryCard
                  title="Kesiapan Ujian"
                  value={formatPercent(summary.scheduleReadyPercent)}
                  subtitle={`${formatNumber(summary.scheduleReadyCount)} dari ${formatNumber(summary.scheduleTotal)} jadwal siap`}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <SummaryCard
                  title="Perangkat Ajar Pending Review"
                  value={formatNumber(teachingResourceSummary.submitted)}
                  subtitle={`${formatNumber(teachingResourceSummary.approved)} disetujui`}
                />
                <SummaryCard
                  title="Perlu Revisi Perangkat"
                  value={formatNumber(teachingResourceSummary.rejected)}
                  subtitle={`${formatNumber(teachingResourceSummary.draft)} draft tersisa`}
                />
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
                <ProgressRow
                  label="Cakupan Mata Pelajaran"
                  valueText={`${formatNumber(summary.subjectCovered)} / ${formatNumber(subjectTotal)}`}
                  percent={summary.subjectCoveragePercent}
                />
                <ProgressRow
                  label="Cakupan Kelas"
                  valueText={`${formatNumber(summary.classCovered)} / ${formatNumber(classTotal)}`}
                  percent={summary.classCoveragePercent}
                />
                <ProgressRow
                  label="Jadwal Siap Ujian"
                  valueText={`${formatNumber(summary.scheduleReadyCount)} / ${formatNumber(summary.scheduleTotal)}`}
                  percent={summary.scheduleReadyPercent}
                />
              </View>

              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Catatan Cepat</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>
                  • Guru beban tinggi (≥ 30 jam): {formatNumber(summary.highLoadTeacherCount)}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>
                  • Guru tanpa jam mengajar: {formatNumber(summary.zeroHoursTeacherCount)}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>
                  • Jadwal tanpa pengawas: {formatNumber(summary.scheduleNoProctorCount)}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>
                  • Jadwal tanpa ruang: {formatNumber(summary.scheduleNoRoomCount)}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted }}>
                  • Jadwal tanpa paket soal: {formatNumber(summary.scheduleNoPacketCount)}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                  • Perangkat ajar menunggu review: {formatNumber(teachingResourceSummary.submitted)}
                </Text>
              </View>
            </>
          ) : null}

          {section === 'GURU' ? (
            <View style={{ gap: 10 }}>
              {filteredTeacherRows.length === 0 ? (
                <QueryStateView type="error" message="Data guru tidak ditemukan untuk filter saat ini." />
              ) : (
                filteredTeacherRows.map((item) => {
                  const hourPercent = Math.max(0, Math.min(100, (item.totalHours / 40) * 100));
                  return (
                    <View
                      key={item.teacherId}
                      style={{
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        borderRadius: 12,
                        padding: 12,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.teacherName}</Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>{item.teacherUsername}</Text>
                        </View>
                        <View
                          style={{
                            borderRadius: 999,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            backgroundColor: '#eff6ff',
                            borderWidth: 1,
                            borderColor: '#bfdbfe',
                          }}
                        >
                          <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', fontSize: 12 }}>
                            {item.totalHours} jam
                          </Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                          Assignment: {formatNumber(item.assignmentCount)}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                          Kelas: {formatNumber(item.classCount)}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                          Sesi: {formatNumber(item.totalSessions)}
                        </Text>
                      </View>

                      <View
                        style={{
                          height: 7,
                          borderRadius: 999,
                          backgroundColor: '#e2e8f0',
                          marginTop: 10,
                          overflow: 'hidden',
                        }}
                      >
                        <View
                          style={{
                            width: `${hourPercent}%`,
                            height: 7,
                            backgroundColor: BRAND_COLORS.blue,
                            borderRadius: 999,
                          }}
                        />
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          ) : null}

          {section === 'UJIAN' ? (
            <>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <SummaryCard
                  title="Total Jadwal"
                  value={formatNumber(summary.scheduleTotal)}
                  subtitle={`${formatNumber(summary.scheduleReadyCount)} jadwal siap`}
                />
                <SummaryCard
                  title="Tanpa Pengawas"
                  value={formatNumber(summary.scheduleNoProctorCount)}
                  subtitle="Perlu assignment pengawas"
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                <SummaryCard
                  title="Tanpa Ruang"
                  value={formatNumber(summary.scheduleNoRoomCount)}
                  subtitle="Perlu penetapan ruang"
                />
                <SummaryCard
                  title="Tanpa Paket"
                  value={formatNumber(summary.scheduleNoPacketCount)}
                  subtitle="Perlu paket soal"
                />
              </View>

              <View style={{ gap: 10 }}>
                {filteredClassExamRows.length === 0 ? (
                  <QueryStateView type="error" message="Data kelas ujian tidak ditemukan untuk filter saat ini." />
                ) : (
                  filteredClassExamRows.map((item) => {
                    const readinessPercent = toPercent(item.readySchedules, item.totalSchedules);
                    return (
                      <View
                        key={item.classId}
                        style={{
                          backgroundColor: '#fff',
                          borderWidth: 1,
                          borderColor: '#dbe7fb',
                          borderRadius: 12,
                          padding: 12,
                        }}
                      >
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.className}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                          Siap: {formatNumber(item.readySchedules)} / {formatNumber(item.totalSchedules)} (
                          {formatPercent(readinessPercent)})
                        </Text>

                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                            Tanpa Pengawas: {formatNumber(item.noProctorCount)}
                          </Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                            Tanpa Ruang: {formatNumber(item.noRoomCount)}
                          </Text>
                        </View>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                          Tanpa Paket: {formatNumber(item.noPacketCount)}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            </>
          ) : null}

        </>
      ) : null}
    </ScrollView>
  );
}
