import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../components/AppLoadingScreen';
import { QueryStateView } from '../../components/QueryStateView';
import { BRAND_COLORS } from '../../config/brand';
import { getStandardPagePadding } from '../../lib/ui/pageLayout';
import { createHtmlPreviewEntry } from '../../lib/viewer/htmlPreviewStore';
import { academicYearApi } from '../academicYear/academicYearApi';
import { useAuth } from '../auth/AuthProvider';
import { examApi } from '../exams/examApi';
import type { ExamSittingDetail } from '../exams/types';
import { resolveStaffDivision } from './staffRole';
import { staffApi } from './staffApi';

type ExamCardEntry = {
  sittingId: number;
  examType: string;
  roomName: string;
  sessionLabel?: string | null;
  startTime?: string | null;
  endTime?: string | null;
};

type ExamCardRow = {
  studentId: number;
  studentName: string;
  username: string;
  nis?: string | null;
  nisn?: string | null;
  className: string;
  examCount: number;
  entries: ExamCardEntry[];
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

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildExamCardRows(details: ExamSittingDetail[]): ExamCardRow[] {
  const grouped = new Map<number, ExamCardRow>();

  details.forEach((sitting) => {
    const resolvedSessionLabel = String(sitting.sessionLabel || '').trim() || null;
    const resolvedExamType = String(sitting.examType || '').trim() || 'UJIAN';

    (sitting.students || []).forEach((student) => {
      if (!student?.id) return;
      if (!grouped.has(student.id)) {
        grouped.set(student.id, {
          studentId: student.id,
          studentName: student.name,
          username: student.username || '-',
          nis: null,
          nisn: null,
          className: student.studentClass?.name || student.class?.name || student.class_name || '-',
          examCount: 0,
          entries: [],
        });
      }

      const row = grouped.get(student.id)!;
      row.entries.push({
        sittingId: sitting.id,
        examType: resolvedExamType,
        roomName: sitting.roomName || '-',
        sessionLabel: resolvedSessionLabel,
        startTime: sitting.startTime || null,
        endTime: sitting.endTime || null,
      });
      row.examCount = row.entries.length;
    });
  });

  return Array.from(grouped.values()).sort((a, b) =>
    a.studentName.localeCompare(b.studentName, 'id-ID', { sensitivity: 'base' }),
  );
}

function buildExamCardsHtml(options: {
  activeYearName: string;
  principalName: string;
  headTuName: string;
  rows: ExamCardRow[];
}) {
  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 18px; background: #f8fafc; color: #0f172a; }
        .page-title { margin-bottom: 18px; }
        .card { background: #fff; border: 1px solid #dbe7fb; border-radius: 18px; padding: 18px; margin-bottom: 16px; }
        .meta { display: grid; gap: 8px; margin-top: 12px; }
        .meta-row { display: grid; grid-template-columns: 70px 12px 1fr; gap: 8px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; }
        th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 13px; }
        th { background: #eff6ff; }
        .signature { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 22px; }
        .signature-box { border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px; min-height: 148px; }
        .spacer { height: 56px; }
      </style>
    </head>
    <body>
      <div class="page-title">
        <h2>SMKS Karya Guna Bhakti 2</h2>
        <p style="color: #64748b; margin-top: 4px;">Tata Usaha • ${escapeHtml(options.activeYearName)}</p>
        <h1 style="margin-top: 12px;">Kartu Ujian</h1>
      </div>
      ${options.rows
        .map(
          (row) => `
          <div class="card">
            <h3>${escapeHtml(row.studentName)}</h3>
            <div class="meta">
              <div class="meta-row"><strong>NIS</strong><span>:</span><span>${escapeHtml(row.nis || '-')}</span></div>
              <div class="meta-row"><strong>NISN</strong><span>:</span><span>${escapeHtml(row.nisn || '-')}</span></div>
              <div class="meta-row"><strong>Kelas</strong><span>:</span><span>${escapeHtml(row.className)}</span></div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Jenis Ujian</th>
                  <th>Ruang</th>
                  <th>Sesi</th>
                  <th>Mulai</th>
                  <th>Selesai</th>
                </tr>
              </thead>
              <tbody>
                ${row.entries
                  .map(
                    (entry) => `
                    <tr>
                      <td>${escapeHtml(entry.examType)}</td>
                      <td>${escapeHtml(entry.roomName)}</td>
                      <td>${escapeHtml(entry.sessionLabel || '-')}</td>
                      <td>${escapeHtml(formatDateTime(entry.startTime))}</td>
                      <td>${escapeHtml(formatDateTime(entry.endTime))}</td>
                    </tr>
                  `,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `,
        )
        .join('')}
      <div class="signature">
        <div class="signature-box">
          <p>Mengetahui,</p>
          <p><strong>Kepala Sekolah</strong></p>
          <div class="spacer"></div>
          <p><strong>${escapeHtml(options.principalName || '-')}</strong></p>
        </div>
        <div class="signature-box">
          <p>Bekasi, ${escapeHtml(formatDate(new Date().toISOString()))}</p>
          <p><strong>Kepala Tata Usaha</strong></p>
          <div class="spacer"></div>
          <p><strong>${escapeHtml(options.headTuName || '-')}</strong></p>
        </div>
      </div>
    </body>
  </html>`;
}

function SectionCard({
  title,
  helper,
  children,
}: {
  title: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#d6e0f2',
        borderRadius: 18,
        padding: 14,
        marginBottom: 14,
      }}
    >
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 16 }}>{title}</Text>
      {helper ? <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>{helper}</Text> : null}
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
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
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
        backgroundColor: active ? '#e9f1ff' : '#fff',
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontSize: 12, fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryCard({
  title,
  value,
  helper,
  tone,
  icon,
}: {
  title: string;
  value: string;
  helper: string;
  tone: { bg: string; border: string; iconBg: string; iconColor: string };
  icon: keyof typeof Feather.glyphMap;
}) {
  return (
    <View
      style={{
        flexBasis: '48%',
        flexGrow: 1,
        backgroundColor: tone.bg,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: tone.border,
        padding: 14,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#64748b', fontSize: 12 }}>{title}</Text>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 24, marginTop: 6 }}>{value}</Text>
        </View>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: tone.iconBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name={icon} size={18} color={tone.iconColor} />
        </View>
      </View>
      <Text style={{ color: '#64748b', fontSize: 11, marginTop: 8 }}>{helper}</Text>
    </View>
  );
}

function OutlineButton({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#bfdbfe',
        backgroundColor: disabled ? '#f8fafc' : '#eff6ff',
        paddingVertical: 11,
        paddingHorizontal: 14,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <Feather name={icon} size={16} color="#1d4ed8" />
      <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 14,
        backgroundColor: '#f8fafc',
        padding: 14,
      }}
    >
      <Text style={{ color: BRAND_COLORS.textMuted }}>{message}</Text>
    </View>
  );
}

export function StaffHeadTuExamCardsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const division = resolveStaffDivision(user);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [examTypeFilter, setExamTypeFilter] = useState('ALL');

  const activeYearQuery = useQuery({
    queryKey: ['mobile-head-tu-exam-cards-active-year', user?.id],
    enabled: isAuthenticated && user?.role === 'STAFF' && division === 'HEAD_TU',
    queryFn: () => academicYearApi.getActive({ allowStaleOnError: true }),
    staleTime: 5 * 60 * 1000,
  });

  const principalsQuery = useQuery({
    queryKey: ['mobile-head-tu-exam-cards-principals'],
    enabled: isAuthenticated && user?.role === 'STAFF' && division === 'HEAD_TU',
    queryFn: () => staffApi.listPrincipals(),
    staleTime: 5 * 60 * 1000,
  });

  const examCardsQuery = useQuery({
    queryKey: ['mobile-head-tu-exam-cards', activeYearQuery.data?.id || 'none'],
    enabled: Boolean(activeYearQuery.data?.id) && isAuthenticated && user?.role === 'STAFF' && division === 'HEAD_TU',
    staleTime: 60 * 1000,
    queryFn: async () => {
      const list = await examApi.getExamSittings({
        academicYearId: activeYearQuery.data?.id,
      });
      const details = await Promise.all(list.map((row) => examApi.getExamSittingDetail(Number(row.id))));
      return details;
    },
  });

  const principalName = principalsQuery.data?.[0]?.name || '-';
  const examRows = useMemo(() => buildExamCardRows(examCardsQuery.data || []), [examCardsQuery.data]);
  const classOptions = useMemo(
    () =>
      Array.from(new Set(examRows.map((row) => row.className).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'id-ID', { sensitivity: 'base' }),
      ),
    [examRows],
  );
  const examTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          examRows.flatMap((row) => row.entries.map((entry) => entry.examType).filter(Boolean)),
        ),
      ).sort((a, b) => a.localeCompare(b, 'id-ID', { sensitivity: 'base' })),
    [examRows],
  );

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return examRows.filter((row) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          row.studentName,
          row.username,
          row.nis,
          row.nisn,
          row.className,
          ...row.entries.map((entry) => `${entry.examType} ${entry.roomName} ${entry.sessionLabel || ''}`),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));

      const matchesClass = classFilter === 'ALL' || row.className === classFilter;
      const matchesExamType =
        examTypeFilter === 'ALL' || row.entries.some((entry) => entry.examType === examTypeFilter);

      return matchesSearch && matchesClass && matchesExamType;
    });
  }, [classFilter, examRows, examTypeFilter, search]);

  const onRefresh = async () => {
    await Promise.all([activeYearQuery.refetch(), examCardsQuery.refetch()]);
  };

  const openPreview = (rows: ExamCardRow[], title: string) => {
    const previewId = createHtmlPreviewEntry({
      title,
      helper: 'Pratinjau kartu ujian tetap di dalam aplikasi.',
      html: buildExamCardsHtml({
        activeYearName: activeYearQuery.data?.name || '-',
        principalName,
        headTuName: user?.name || '-',
        rows,
      }),
    });
    router.push(`/viewer/html/${previewId}` as never);
  };

  if (isLoading) return <AppLoadingScreen message="Memuat kartu ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (!user) return <Redirect href="/welcome" />;
  if (user.role !== 'STAFF' || division !== 'HEAD_TU') return <Redirect href="/home" />;
  if (activeYearQuery.isLoading && !activeYearQuery.data) return <AppLoadingScreen message="Menyiapkan data ujian..." />;

  if (activeYearQuery.isError || !activeYearQuery.data) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8, color: BRAND_COLORS.textDark }}>
          Kartu Ujian
        </Text>
        <QueryStateView type="error" message="Tahun ajaran aktif tidak ditemukan." onRetry={() => activeYearQuery.refetch()} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void onRefresh()} tintColor={BRAND_COLORS.blue} />}
    >
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: BRAND_COLORS.textDark }}>Kartu Ujian</Text>
        <Text style={{ marginTop: 6, color: BRAND_COLORS.textMuted }}>
          Filter peserta dan buka pratinjau kartu ujian siswa berdasarkan ruang, sesi, dan data ujian aktif.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <SummaryCard
          title="Total Siswa"
          value={String(examRows.length)}
          helper="Data kartu ujian yang terbentuk"
          tone={{ bg: '#eff6ff', border: '#bfdbfe', iconBg: '#dbeafe', iconColor: '#1d4ed8' }}
          icon="users"
        />
        <SummaryCard
          title="Kelas Aktif"
          value={String(classOptions.length)}
          helper="Kelas yang memiliki peserta ujian"
          tone={{ bg: '#ecfdf5', border: '#a7f3d0', iconBg: '#d1fae5', iconColor: '#047857' }}
          icon="grid"
        />
        <SummaryCard
          title="Jenis Ujian"
          value={String(examTypeOptions.length)}
          helper="Program ujian pada data aktif"
          tone={{ bg: '#fff7ed', border: '#fdba74', iconBg: '#ffedd5', iconColor: '#c2410c' }}
          icon="clipboard"
        />
      </View>

      <SectionCard title="Filter Kartu Ujian" helper={`Tahun ajaran aktif: ${activeYearQuery.data.name}`}>
        <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>Cari siswa / ruang / jenis ujian</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari nama siswa, username, kelas, ruang, atau jenis ujian..."
          placeholderTextColor="#94a3b8"
          style={{
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: '#0f172a',
            backgroundColor: '#fff',
          }}
        />

        <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4, marginTop: 12 }}>Filter kelas</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
          <FilterChip active={classFilter === 'ALL'} label="Semua kelas" onPress={() => setClassFilter('ALL')} />
          {classOptions.map((item) => (
            <FilterChip key={item} active={classFilter === item} label={item} onPress={() => setClassFilter(item)} />
          ))}
        </ScrollView>

        <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4, marginTop: 8 }}>Filter jenis ujian</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
          <FilterChip active={examTypeFilter === 'ALL'} label="Semua jenis" onPress={() => setExamTypeFilter('ALL')} />
          {examTypeOptions.map((item) => (
            <FilterChip key={item} active={examTypeFilter === item} label={item} onPress={() => setExamTypeFilter(item)} />
          ))}
        </ScrollView>

        <View style={{ marginTop: 12 }}>
          <OutlineButton
            icon="printer"
            label="Buka Pratinjau Semua Kartu"
            onPress={() => openPreview(filteredRows, 'Pratinjau Semua Kartu Ujian')}
            disabled={!filteredRows.length}
          />
        </View>
      </SectionCard>

      <SectionCard title="Daftar Kartu Ujian" helper={`${filteredRows.length} siswa • ${examRows.length} total data kartu`}>
        {examCardsQuery.isLoading ? (
          <AppLoadingScreen message="Memuat daftar kartu ujian..." />
        ) : examCardsQuery.isError ? (
          <QueryStateView type="error" message="Gagal memuat data kartu ujian." onRetry={() => examCardsQuery.refetch()} />
        ) : !filteredRows.length ? (
          <EmptyState message="Belum ada data kartu ujian yang bisa ditampilkan." />
        ) : (
          <View style={{ gap: 10 }}>
            {filteredRows.map((row) => (
              <View
                key={row.studentId}
                style={{
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 14,
                  backgroundColor: '#fff',
                  padding: 12,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.studentName}</Text>
                    <Text style={{ marginTop: 4, color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                      @{row.username} • {row.className}
                    </Text>
                    <Text style={{ marginTop: 4, color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                      {row.examCount} jadwal ujian
                    </Text>
                  </View>
                  <View
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: '#bfdbfe',
                      backgroundColor: '#eff6ff',
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      alignSelf: 'flex-start',
                    }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>{row.examCount} sesi</Text>
                  </View>
                </View>

                <View style={{ gap: 8, marginTop: 10 }}>
                  {row.entries.map((entry) => (
                    <View
                      key={`${row.studentId}-${entry.sittingId}`}
                      style={{
                        borderWidth: 1,
                        borderColor: '#e2e8f0',
                        borderRadius: 12,
                        backgroundColor: '#f8fafc',
                        padding: 10,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{entry.examType}</Text>
                      <Text style={{ marginTop: 4, color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        Ruang {entry.roomName}{entry.sessionLabel ? ` • ${entry.sessionLabel}` : ''}
                      </Text>
                      <Text style={{ marginTop: 4, color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        {formatDateTime(entry.startTime)} - {formatDateTime(entry.endTime)}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={{ marginTop: 10 }}>
                  <OutlineButton
                    icon="eye"
                    label="Buka Pratinjau Kartu"
                    onPress={() => openPreview([row], `Kartu Ujian - ${row.studentName}`)}
                  />
                </View>
              </View>
            ))}
          </View>
        )}
      </SectionCard>
    </ScrollView>
  );
}
