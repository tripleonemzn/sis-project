import { useEffect, useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { adminApi } from '../../../src/features/admin/adminApi';
import { attendanceApi } from '../../../src/features/attendance/attendanceApi';
import {
  DailyAttendanceEntry,
  DailyAttendanceStudent,
  DailyLateSummaryRow,
  TeacherAttendanceStatus,
} from '../../../src/features/attendance/types';
import { attendanceRecapApi } from '../../../src/features/attendanceRecap/attendanceRecapApi';
import { AttendanceRecapRow } from '../../../src/features/attendanceRecap/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';

type TabKey = 'DAILY' | 'RECAP' | 'LATE';
type Semester = 'ODD' | 'EVEN';

type StatusConfig = {
  value: TeacherAttendanceStatus;
  label: string;
  shortLabel: string;
  bg: string;
  border: string;
  text: string;
};

type DraftRecord = {
  status: TeacherAttendanceStatus;
  note: string;
};

const STATUS_OPTIONS: StatusConfig[] = [
  { value: 'PRESENT', label: 'Hadir', shortLabel: 'H', bg: '#dcfce7', border: '#86efac', text: '#166534' },
  { value: 'SICK', label: 'Sakit', shortLabel: 'S', bg: '#dbeafe', border: '#93c5fd', text: '#1d4ed8' },
  { value: 'PERMISSION', label: 'Izin', shortLabel: 'I', bg: '#ffedd5', border: '#fdba74', text: '#9a3412' },
  { value: 'ABSENT', label: 'Alpha', shortLabel: 'A', bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' },
  { value: 'LATE', label: 'Telat', shortLabel: 'T', bg: '#fef3c7', border: '#fcd34d', text: '#92400e' },
];

function defaultSemesterByDate(): Semester {
  const month = new Date().getMonth() + 1;
  return month >= 7 ? 'ODD' : 'EVEN';
}

function toIsoDateLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function matchesStudentQuery(
  student: Pick<DailyAttendanceStudent, 'name'> & {
    nis?: string | null;
    nisn?: string | null;
  },
  search: string,
) {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  const haystacks = [student.name || '', student.nis || '', student.nisn || ''];
  return haystacks.some((value) => value.toLowerCase().includes(query));
}

export default function TeacherHomeroomAttendanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const [tab, setTab] = useState<TabKey>('DAILY');
  const [semester, setSemester] = useState<Semester>(defaultSemesterByDate());
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<number, DraftRecord>>({});

  const selectedDateIso = toIsoDateLocal(selectedDate);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-homeroom-active-year'],
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
    queryKey: ['mobile-homeroom-classes', user?.id, activeYearQuery.data?.id],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!user?.id && !!activeYearQuery.data?.id,
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
  const selectedAcademicYearId = selectedClass?.academicYear?.id || activeYearQuery.data?.id || null;

  useEffect(() => {
    if (selectedClassId || classItems.length === 0) return;
    setSelectedClassId(classItems[0].id);
  }, [selectedClassId, classItems]);

  const dailyQuery = useQuery({
    queryKey: ['mobile-homeroom-daily', selectedClassId, selectedAcademicYearId, selectedDateIso],
    enabled:
      isAuthenticated &&
      user?.role === 'TEACHER' &&
      tab === 'DAILY' &&
      !!selectedClassId &&
      !!selectedAcademicYearId,
    queryFn: async () =>
      attendanceApi.getDailyAttendance({
        date: selectedDateIso,
        classId: Number(selectedClassId),
        academicYearId: Number(selectedAcademicYearId),
      }),
  });

  const recapQuery = useQuery({
    queryKey: ['mobile-homeroom-recap', selectedClassId, selectedAcademicYearId, semester],
    enabled:
      isAuthenticated &&
      user?.role === 'TEACHER' &&
      tab === 'RECAP' &&
      !!selectedClassId &&
      !!selectedAcademicYearId,
    queryFn: async () =>
      attendanceRecapApi.getDailyRecap({
        classId: Number(selectedClassId),
        academicYearId: Number(selectedAcademicYearId),
        semester,
      }),
  });

  const lateQuery = useQuery({
    queryKey: ['mobile-homeroom-late', selectedClassId, selectedAcademicYearId],
    enabled:
      isAuthenticated &&
      user?.role === 'TEACHER' &&
      tab === 'LATE' &&
      !!selectedClassId &&
      !!selectedAcademicYearId,
    queryFn: async () =>
      attendanceApi.getLateSummaryByClass({
        classId: Number(selectedClassId),
        academicYearId: Number(selectedAcademicYearId),
      }),
  });

  useEffect(() => {
    if (tab !== 'DAILY') return;
    if (!dailyQuery.data || dailyQuery.data.length === 0) return;
    const nextDraft: Record<number, DraftRecord> = {};
    for (const row of dailyQuery.data) {
      nextDraft[row.student.id] = {
        status: row.status || 'PRESENT',
        note: row.note || '',
      };
    }
    setDraft(nextDraft);
  }, [tab, dailyQuery.data, selectedDateIso]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClassId || !selectedAcademicYearId) {
        throw new Error('Kelas atau tahun ajaran belum dipilih.');
      }
      const dailyRows = dailyQuery.data || [];
      const records = dailyRows.map((row) => {
        const rowDraft = draft[row.student.id];
        return {
          studentId: row.student.id,
          status: rowDraft?.status || 'PRESENT',
          note: rowDraft?.note?.trim() ? rowDraft.note.trim() : null,
        };
      });
      return attendanceApi.saveDailyAttendance({
        date: selectedDateIso,
        classId: Number(selectedClassId),
        academicYearId: Number(selectedAcademicYearId),
        records,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-homeroom-daily'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-homeroom-recap'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-homeroom-late'] }),
      ]);
      notifySuccess('Presensi wali kelas berhasil disimpan.');
    },
    onError: (error: any) => {
      notifyApiError(error, 'Gagal menyimpan presensi.');
    },
  });

  const dailyRows = dailyQuery.data || [];
  const recapRows = recapQuery.data?.recap || [];
  const lateRows = lateQuery.data?.recap || [];

  const filteredDailyRows = useMemo(
    () => dailyRows.filter((item) => matchesStudentQuery(item.student, search)),
    [dailyRows, search],
  );
  const filteredRecapRows = useMemo(
    () => recapRows.filter((item) => matchesStudentQuery(item.student, search)),
    [recapRows, search],
  );
  const filteredLateRows = useMemo(
    () => lateRows.filter((item) => matchesStudentQuery(item.student, search)),
    [lateRows, search],
  );

  const dailyStats = useMemo(() => {
    const result = { present: 0, sick: 0, permission: 0, absent: 0, late: 0, total: filteredDailyRows.length };
    for (const row of filteredDailyRows) {
      const status = draft[row.student.id]?.status || row.status || 'PRESENT';
      if (status === 'PRESENT') result.present += 1;
      if (status === 'SICK') result.sick += 1;
      if (status === 'PERMISSION') result.permission += 1;
      if (status === 'ABSENT') result.absent += 1;
      if (status === 'LATE') result.late += 1;
    }
    return result;
  }, [filteredDailyRows, draft]);

  const recapSummary = useMemo(() => {
    if (!filteredRecapRows.length) return { avgAttendance: 0, totalAbsent: 0, totalLate: 0 };
    const avgAttendance =
      filteredRecapRows.reduce((sum, row) => sum + Number(row.percentage || 0), 0) / filteredRecapRows.length;
    const totalAbsent = filteredRecapRows.reduce((sum, row) => sum + Number(row.absent || 0), 0);
    const totalLate = filteredRecapRows.reduce((sum, row) => sum + Number(row.late || 0), 0);
    return { avgAttendance, totalAbsent, totalLate };
  }, [filteredRecapRows]);

  const lateSummary = useMemo(() => {
    const totals = filteredLateRows.reduce(
      (acc, row) => {
        acc.semester1 += Number(row.semester1Late || 0);
        acc.semester2 += Number(row.semester2Late || 0);
        acc.total += Number(row.totalLate || 0);
        return acc;
      },
      { semester1: 0, semester2: 0, total: 0 },
    );
    return totals;
  }, [filteredLateRows]);

  const shiftDate = (offset: number) => {
    setSelectedDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + offset));
  };

  const handleStatusChange = (studentId: number, status: TeacherAttendanceStatus) => {
    setDraft((prev) => ({
      ...prev,
      [studentId]: {
        status,
        note: prev[studentId]?.note || '',
      },
    }));
  };

  const handleNoteChange = (studentId: number, note: string) => {
    setDraft((prev) => ({
      ...prev,
      [studentId]: {
        status: prev[studentId]?.status || 'PRESENT',
        note,
      },
    }));
  };

  const markAllDailyStatus = (status: TeacherAttendanceStatus) => {
    if (!dailyRows.length) return;
    setDraft((prev) => {
      const next = { ...prev };
      for (const row of dailyRows) {
        next[row.student.id] = {
          status,
          note: prev[row.student.id]?.note || '',
        };
      }
      return next;
    });
  };

  if (isLoading) return <AppLoadingScreen message="Memuat presensi wali kelas..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Wali Kelas Presensi</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            paddingVertical: 12,
            borderRadius: 10,
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
            dailyQuery.isFetching ||
            recapQuery.isFetching ||
            lateQuery.isFetching
          }
          onRefresh={async () => {
            await Promise.all([
              activeYearQuery.refetch(),
              classesQuery.refetch(),
              dailyQuery.refetch(),
              recapQuery.refetch(),
              lateQuery.refetch(),
            ]);
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
        Wali Kelas Presensi
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Kelola presensi harian, rekap semester, dan statistik keterlambatan siswa.
      </Text>

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
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginTop: 2 }}>
            {activeYearQuery.data.name}
          </Text>
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
                      onPress={() => setSelectedClassId(classItem.id)}
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
          <View
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              borderRadius: 10,
              padding: 16,
              backgroundColor: '#fff',
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>
              Tidak ada kelas wali
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              Anda belum terdaftar sebagai wali kelas di tahun ajaran aktif.
            </Text>
          </View>
        )
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
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Mode Tampilan</Text>
        <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
          {[
            { key: 'DAILY' as TabKey, label: 'Harian' },
            { key: 'RECAP' as TabKey, label: 'Rekap' },
            { key: 'LATE' as TabKey, label: 'Telat' },
          ].map((item) => {
            const selected = tab === item.key;
            return (
              <View key={item.key} style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => setTab(item.key)}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? BRAND_COLORS.blue : '#d5e1f5',
                    backgroundColor: selected ? '#e9f1ff' : '#fff',
                    borderRadius: 9,
                    alignItems: 'center',
                    paddingVertical: 10,
                  }}
                >
                  <Text style={{ color: selected ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700' }}>
                    {item.label}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>

      {tab === 'RECAP' ? (
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
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Semester Rekap</Text>
          <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => setSemester('ODD')}
                style={{
                  borderWidth: 1,
                  borderColor: semester === 'ODD' ? BRAND_COLORS.blue : '#d5e1f5',
                  backgroundColor: semester === 'ODD' ? '#e9f1ff' : '#fff',
                  borderRadius: 9,
                  alignItems: 'center',
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: semester === 'ODD' ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700' }}>
                  Ganjil
                </Text>
              </Pressable>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => setSemester('EVEN')}
                style={{
                  borderWidth: 1,
                  borderColor: semester === 'EVEN' ? BRAND_COLORS.blue : '#d5e1f5',
                  backgroundColor: semester === 'EVEN' ? '#e9f1ff' : '#fff',
                  borderRadius: 9,
                  alignItems: 'center',
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: semester === 'EVEN' ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700' }}>
                  Genap
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {(tab === 'DAILY' || tab === 'RECAP' || tab === 'LATE') && (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 999,
            paddingHorizontal: 12,
            marginBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cari nama siswa / NIS / NISN"
            placeholderTextColor="#95a3be"
            style={{
              flex: 1,
              paddingVertical: 10,
              color: BRAND_COLORS.textDark,
            }}
          />
        </View>
      )}

      {tab === 'DAILY' ? (
        <>
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Tanggal Presensi</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 8 }}>{formatLongDate(selectedDate)}</Text>
            <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => shiftDate(-1)}
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 8,
                    paddingVertical: 9,
                    alignItems: 'center',
                    backgroundColor: '#fff',
                  }}
                >
                  <Text style={{ color: '#334155', fontWeight: '600' }}>-1 Hari</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => setSelectedDate(new Date())}
                  style={{
                    borderWidth: 1,
                    borderColor: '#bfdbfe',
                    borderRadius: 8,
                    paddingVertical: 9,
                    alignItems: 'center',
                    backgroundColor: '#eff6ff',
                  }}
                >
                  <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Hari Ini</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => shiftDate(1)}
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 8,
                    paddingVertical: 9,
                    alignItems: 'center',
                    backgroundColor: '#fff',
                  }}
                >
                  <Text style={{ color: '#334155', fontWeight: '600' }}>+1 Hari</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
            {[
              { label: 'Hadir', value: dailyStats.present },
              { label: 'Sakit', value: dailyStats.sick },
              { label: 'Izin', value: dailyStats.permission },
              { label: 'Alpha', value: dailyStats.absent },
              { label: 'Telat', value: dailyStats.late },
            ].map((item) => (
              <View key={item.label} style={{ width: '33.3333%', paddingHorizontal: 4, marginBottom: 8 }}>
                <View
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 2 }}>{item.label}</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.value}</Text>
                </View>
              </View>
            ))}
          </View>

          {dailyQuery.isLoading ? <QueryStateView type="loading" message="Mengambil presensi harian..." /> : null}
          {dailyQuery.isError ? (
            <QueryStateView type="error" message="Gagal memuat presensi harian." onRetry={() => dailyQuery.refetch()} />
          ) : null}

          {!dailyQuery.isLoading && !dailyQuery.isError ? (
            filteredDailyRows.length > 0 ? (
              <View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 10 }}>
                  {STATUS_OPTIONS.map((statusItem) => (
                    <View key={statusItem.value} style={{ width: '33.3333%', paddingHorizontal: 4, marginBottom: 8 }}>
                      <Pressable
                        onPress={() => markAllDailyStatus(statusItem.value)}
                        style={{
                          backgroundColor: statusItem.bg,
                          borderWidth: 1,
                          borderColor: statusItem.border,
                          borderRadius: 8,
                          paddingVertical: 8,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: statusItem.text, fontWeight: '700', fontSize: 12 }}>
                          Semua {statusItem.label}
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>

                <View
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 10,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      backgroundColor: '#eef4ff',
                      borderBottomWidth: 1,
                      borderBottomColor: '#dbe7fb',
                      paddingHorizontal: 10,
                      paddingVertical: 9,
                    }}
                  >
                    <Text style={{ color: '#334155', fontSize: 12, fontWeight: '700' }}>
                      Daftar Presensi Harian ({filteredDailyRows.length}/{dailyRows.length})
                    </Text>
                  </View>

                  {filteredDailyRows.map((row: DailyAttendanceEntry, index) => {
                    const currentStatus = draft[row.student.id]?.status || row.status || 'PRESENT';
                    const currentNote = draft[row.student.id]?.note || '';
                    return (
                      <View
                        key={row.student.id}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 9,
                          borderBottomWidth: index === filteredDailyRows.length - 1 ? 0 : 1,
                          borderBottomColor: '#eef2ff',
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7 }}>
                          <View
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 999,
                              backgroundColor: '#e2e8f0',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginRight: 8,
                            }}
                          >
                            <Text style={{ color: '#334155', fontSize: 11, fontWeight: '700' }}>{index + 1}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }} numberOfLines={1}>
                              {row.student.name}
                            </Text>
                            <Text style={{ color: '#64748b', fontSize: 11 }} numberOfLines={1}>
                              NIS: {row.student.nis || '-'} • NISN: {row.student.nisn || '-'}
                            </Text>
                          </View>
                        </View>

                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 7 }}>
                          <View style={{ flexDirection: 'row' }}>
                            {STATUS_OPTIONS.map((statusItem) => {
                              const selected = currentStatus === statusItem.value;
                              return (
                                <Pressable
                                  key={statusItem.value}
                                  onPress={() => handleStatusChange(row.student.id, statusItem.value)}
                                  style={{
                                    marginRight: 6,
                                    borderWidth: 1,
                                    borderColor: selected ? statusItem.border : '#d5e1f5',
                                    backgroundColor: selected ? statusItem.bg : '#fff',
                                    borderRadius: 999,
                                    paddingHorizontal: 10,
                                    paddingVertical: 6,
                                    minWidth: 64,
                                    alignItems: 'center',
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: selected ? statusItem.text : BRAND_COLORS.textMuted,
                                      fontWeight: '700',
                                      fontSize: 11,
                                    }}
                                  >
                                    {statusItem.shortLabel} • {statusItem.label}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </ScrollView>

                        <TextInput
                          value={currentNote}
                          onChangeText={(value) => handleNoteChange(row.student.id, value)}
                          placeholder="Catatan (opsional)"
                          placeholderTextColor="#94a3b8"
                          style={{
                            borderWidth: 1,
                            borderColor: '#dbe7fb',
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 9,
                            color: BRAND_COLORS.textDark,
                            backgroundColor: '#f8fbff',
                          }}
                        />
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderStyle: 'dashed',
                  borderRadius: 10,
                  padding: 16,
                  backgroundColor: '#fff',
                }}
              >
                <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada data siswa sesuai filter.</Text>
              </View>
            )
          ) : null}

          {!dailyQuery.isLoading && !dailyQuery.isError && filteredDailyRows.length > 0 ? (
            <Pressable
              disabled={saveMutation.isPending}
              onPress={() => saveMutation.mutate()}
              style={{
                marginTop: 10,
                backgroundColor: saveMutation.isPending ? '#93c5fd' : BRAND_COLORS.blue,
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Presensi Harian'}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {tab === 'RECAP' ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
            <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Rata-rata Kehadiran</Text>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18 }}>
                  {recapSummary.avgAttendance.toFixed(1)}%
                </Text>
              </View>
            </View>
            <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Total Alpha</Text>
                <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 18 }}>{recapSummary.totalAbsent}</Text>
              </View>
            </View>
            <View style={{ width: '100%', paddingHorizontal: 4, marginBottom: 8 }}>
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Total Terlambat</Text>
                <Text style={{ color: '#92400e', fontWeight: '700', fontSize: 18 }}>{recapSummary.totalLate}</Text>
              </View>
            </View>
          </View>

          {recapQuery.isLoading ? <QueryStateView type="loading" message="Mengambil rekap presensi..." /> : null}
          {recapQuery.isError ? (
            <QueryStateView type="error" message="Gagal memuat rekap presensi." onRetry={() => recapQuery.refetch()} />
          ) : null}

          {!recapQuery.isLoading && !recapQuery.isError ? (
            filteredRecapRows.length > 0 ? (
              <View>
                {filteredRecapRows.map((row: AttendanceRecapRow) => (
                  <View
                    key={row.student.id}
                    style={{
                      backgroundColor: '#fff',
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 3 }}>
                      {row.student.name}
                    </Text>
                    <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                      NIS: {row.student.nis || '-'} • NISN: {row.student.nisn || '-'}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 }}>
                      {[
                        { label: 'Hadir', value: row.present, color: '#166534' },
                        { label: 'Telat', value: row.late, color: '#92400e' },
                        { label: 'Sakit', value: row.sick, color: '#1d4ed8' },
                        { label: 'Izin', value: row.permission, color: '#a16207' },
                        { label: 'Alpha', value: row.absent, color: '#b91c1c' },
                      ].map((item) => (
                        <View key={item.label} style={{ width: '20%', paddingHorizontal: 3 }}>
                          <View
                            style={{
                              backgroundColor: '#f8fbff',
                              borderWidth: 1,
                              borderColor: '#dbe7fb',
                              borderRadius: 8,
                              paddingVertical: 6,
                              alignItems: 'center',
                            }}
                          >
                            <Text style={{ color: '#64748b', fontSize: 10 }}>{item.label}</Text>
                            <Text style={{ color: item.color, fontWeight: '700' }}>{item.value}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                    <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', marginTop: 8 }}>
                      Persentase Kehadiran: {row.percentage}%
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderStyle: 'dashed',
                  borderRadius: 10,
                  padding: 16,
                  backgroundColor: '#fff',
                }}
              >
                <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada data siswa sesuai filter.</Text>
              </View>
            )
          ) : null}
        </>
      ) : null}

      {tab === 'LATE' ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
            <View style={{ width: '33.3333%', paddingHorizontal: 4, marginBottom: 8 }}>
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 10,
                  padding: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Sem. Ganjil</Text>
                <Text style={{ color: '#92400e', fontWeight: '700', fontSize: 18 }}>{lateSummary.semester1}</Text>
              </View>
            </View>
            <View style={{ width: '33.3333%', paddingHorizontal: 4, marginBottom: 8 }}>
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 10,
                  padding: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Sem. Genap</Text>
                <Text style={{ color: '#92400e', fontWeight: '700', fontSize: 18 }}>{lateSummary.semester2}</Text>
              </View>
            </View>
            <View style={{ width: '33.3333%', paddingHorizontal: 4, marginBottom: 8 }}>
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 10,
                  padding: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Total Telat</Text>
                <Text style={{ color: '#92400e', fontWeight: '700', fontSize: 18 }}>{lateSummary.total}</Text>
              </View>
            </View>
          </View>

          {lateQuery.isLoading ? <QueryStateView type="loading" message="Mengambil statistik keterlambatan..." /> : null}
          {lateQuery.isError ? (
            <QueryStateView type="error" message="Gagal memuat statistik keterlambatan." onRetry={() => lateQuery.refetch()} />
          ) : null}

          {!lateQuery.isLoading && !lateQuery.isError ? (
            filteredLateRows.length > 0 ? (
              <View>
                {filteredLateRows.map((row: DailyLateSummaryRow) => (
                  <View
                    key={row.student.id}
                    style={{
                      backgroundColor: '#fff',
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 3 }}>
                      {row.student.name}
                    </Text>
                    <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                      NIS: {row.student.nis || '-'} • NISN: {row.student.nisn || '-'}
                    </Text>
                    <View style={{ flexDirection: 'row', marginHorizontal: -3 }}>
                      {[
                        { label: 'Ganjil', value: row.semester1Late },
                        { label: 'Genap', value: row.semester2Late },
                        { label: 'Total', value: row.totalLate },
                      ].map((item) => (
                        <View key={item.label} style={{ width: '33.3333%', paddingHorizontal: 3 }}>
                          <View
                            style={{
                              backgroundColor: '#f8fbff',
                              borderWidth: 1,
                              borderColor: '#dbe7fb',
                              borderRadius: 8,
                              paddingVertical: 8,
                              alignItems: 'center',
                            }}
                          >
                            <Text style={{ color: '#64748b', fontSize: 11 }}>{item.label}</Text>
                            <Text style={{ color: '#92400e', fontWeight: '700' }}>{item.value}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderStyle: 'dashed',
                  borderRadius: 10,
                  padding: 16,
                  backgroundColor: '#fff',
                }}
              >
                <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada data keterlambatan sesuai filter.</Text>
              </View>
            )
          ) : null}
        </>
      ) : null}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          marginTop: 14,
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
