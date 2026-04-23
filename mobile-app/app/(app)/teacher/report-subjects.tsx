import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { useTeacherAssignmentsQuery } from '../../../src/features/teacherAssignments/useTeacherAssignmentsQuery';
import {
  buildTeacherAssignmentOptionLabel,
  filterRegularTeacherAssignments,
} from '../../../src/features/teacherAssignments/utils';
import {
  TeacherSubjectReportItem,
  TeacherSubjectReportMeta,
  teacherReportApi,
} from '../../../src/features/teacherReports/teacherReportApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';
import { useAppTextScale } from '../../../src/theme/AppTextScaleProvider';

type Semester = 'ODD' | 'EVEN';

function roundScore(value: number | null) {
  if (value === null || value === undefined) return '-';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '-';
  return parsed.toFixed(2);
}

function formatFinalScore(value: number | null) {
  if (value === null || value === undefined) return '-';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '-';
  return parsed.toFixed(2);
}

function predicateStyle(predicate: string | null) {
  if (predicate === 'A') return { bg: '#dcfce7', border: '#86efac', text: '#166534' };
  if (predicate === 'B') return { bg: '#dbeafe', border: '#93c5fd', text: '#1d4ed8' };
  if (predicate === 'C') return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
  if (predicate === 'D') return { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' };
  return { bg: '#f1f5f9', border: '#cbd5e1', text: '#334155' };
}

function parseOptionalScore(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null as number | null, invalid: false };
  const value = Number(trimmed);
  if (Number.isNaN(value)) return { value: null as number | null, invalid: true };
  return { value, invalid: false };
}

function normalizeSlotCode(raw: string | null | undefined) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolvePrimarySlots(meta: TeacherSubjectReportMeta | null | undefined) {
  const includeSlots = Array.isArray(meta?.includeSlots)
    ? meta.includeSlots.map((slot) => normalizeSlotCode(slot)).filter(Boolean)
    : [];
  const firstSlot = includeSlots[0] || 'FORMATIF';
  const secondSlot = includeSlots[1] || firstSlot;
  const lastSlot = includeSlots[includeSlots.length - 1] || secondSlot;

  return {
    formative: normalizeSlotCode(meta?.primarySlots?.formative) || firstSlot,
    midterm: normalizeSlotCode(meta?.primarySlots?.midterm) || secondSlot,
    final: normalizeSlotCode(meta?.primarySlots?.final) || lastSlot,
  };
}

function readRowSlotScore(
  row: TeacherSubjectReportItem,
  slotCode: string,
  fallback: number | null | undefined,
) {
  const normalizedSlotCode = normalizeSlotCode(slotCode);
  if (
    normalizedSlotCode &&
    row.slotScores &&
    typeof row.slotScores === 'object' &&
    Object.prototype.hasOwnProperty.call(row.slotScores, normalizedSlotCode)
  ) {
    return row.slotScores[normalizedSlotCode] ?? null;
  }
  return fallback ?? null;
}

export default function TeacherSubjectReportScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets);
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const assignmentsQuery = useTeacherAssignmentsQuery({ enabled: isAuthenticated, user });
  const headingTextStyle = useMemo(
    () => ({ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28) }),
    [scaleFont, scaleLineHeight],
  );
  const sectionTitleTextStyle = useMemo(
    () => ({ fontSize: scaleFont(16), lineHeight: scaleLineHeight(24) }),
    [scaleFont, scaleLineHeight],
  );
  const bodyTextStyle = useMemo(
    () => ({ fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }),
    [scaleFont, scaleLineHeight],
  );
  const helperTextStyle = useMemo(
    () => ({ fontSize: scaleFont(11), lineHeight: scaleLineHeight(16) }),
    [scaleFont, scaleLineHeight],
  );
  const inputTextStyle = useMemo(
    () => ({ fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }),
    [scaleFont, scaleLineHeight],
  );
  const assignments = useMemo(
    () => filterRegularTeacherAssignments(assignmentsQuery.data?.assignments || []),
    [assignmentsQuery.data?.assignments],
  );
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  const [semester, setSemester] = useState<Semester>('ODD');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingRow, setEditingRow] = useState<TeacherSubjectReportItem | null>(null);
  const [editingSlotValues, setEditingSlotValues] = useState<Record<string, string>>({});
  const [editingDescription, setEditingDescription] = useState('');
  const effectiveSelectedAssignmentId = selectedAssignmentId ?? assignments[0]?.id ?? null;
  const selectedAssignment = assignments.find((item) => item.id === effectiveSelectedAssignmentId) || null;
  const assignmentOptions = useMemo(
    () =>
      assignments.map((item) => ({
        value: String(item.id),
        label: buildTeacherAssignmentOptionLabel(item),
      })),
    [assignments],
  );
  const semesterOptions = useMemo(
    () => [
      { value: 'ODD', label: 'Semester Ganjil' },
      { value: 'EVEN', label: 'Semester Genap' },
    ],
    [],
  );

  const reportQuery = useQuery({
    queryKey: ['mobile-teacher-subject-report', user?.id, effectiveSelectedAssignmentId, semester],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!selectedAssignment,
    queryFn: () =>
      teacherReportApi.getSubjectReport({
        classId: selectedAssignment!.class.id,
        subjectId: selectedAssignment!.subject.id,
        academicYearId: selectedAssignment!.academicYear.id,
        semester,
      }),
  });
  const reportRows = useMemo(() => reportQuery.data?.rows || [], [reportQuery.data?.rows]);
  const reportMeta = reportQuery.data?.meta || null;
  const primarySlots = useMemo(() => resolvePrimarySlots(reportMeta), [reportMeta]);
  const slotEditOrder = useMemo(
    () =>
      Array.from(
        new Set(
          [primarySlots.formative, primarySlots.midterm, primarySlots.final]
            .map((slot) => normalizeSlotCode(slot))
            .filter(Boolean),
        ),
      ),
    [primarySlots.formative, primarySlots.midterm, primarySlots.final],
  );
  const slotLabelsByCode = useMemo(() => {
    const labels = reportMeta?.slotLabels || {};
    const getLabel = (slot: string, fallback: string) =>
      String(labels[slot]?.label || fallback).trim() || fallback;
    return {
      [primarySlots.formative]: getLabel(primarySlots.formative, 'Formatif'),
      [primarySlots.midterm]: getLabel(primarySlots.midterm, 'Midterm'),
      [primarySlots.final]: getLabel(primarySlots.final, 'Final'),
    } as Record<string, string>;
  }, [reportMeta, primarySlots.formative, primarySlots.midterm, primarySlots.final]);
  const slotInputWidth = `${100 / Math.max(slotEditOrder.length, 1)}%` as `${number}%`;

  const filteredRows = useMemo(() => {
    const rows = reportRows;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((item) => {
      const name = item.student?.name?.toLowerCase() || '';
      const nis = item.student?.nis?.toLowerCase() || '';
      const nisn = item.student?.nisn?.toLowerCase() || '';
      return name.includes(q) || nis.includes(q) || nisn.includes(q);
    });
  }, [reportRows, searchQuery]);

  const summary = useMemo(() => {
    const rows = filteredRows;
    if (rows.length === 0) {
      return { students: 0, avgFinal: '-', passed: 0 };
    }
    const scored = rows.filter((item) => item.finalScore !== null);
    const avgFinal =
      scored.length > 0
        ? (scored.reduce((acc, item) => acc + (item.finalScore || 0), 0) / scored.length).toFixed(1)
        : '-';
    const passed = rows.filter((item) => {
      const p = (item.predicate || '').toUpperCase();
      return p === 'A' || p === 'B' || p === 'C';
    }).length;
    return { students: rows.length, avgFinal, passed };
  }, [filteredRows]);

  const openEditModal = (row: TeacherSubjectReportItem) => {
    setEditingRow(row);
    const nextValues: Record<string, string> = {};
    slotEditOrder.forEach((slotCode) => {
      const fallback =
        slotCode === primarySlots.formative
          ? row.formatifScore
          : slotCode === primarySlots.midterm
            ? row.sbtsScore
            : slotCode === primarySlots.final
              ? row.sasScore
              : null;
      const score = readRowSlotScore(row, slotCode, fallback);
      nextValues[slotCode] = score !== null && score !== undefined ? String(score) : '';
    });
    setEditingSlotValues(nextValues);
    setEditingDescription(row.description || '');
  };

  const saveEditMutation = useMutation({
    mutationFn: async () => {
      if (!editingRow) throw new Error('Data rapor tidak ditemukan.');
      const slotScoresPayload: Record<string, number | null> = {};
      for (const slotCode of slotEditOrder) {
        const parsed = parseOptionalScore(editingSlotValues[slotCode] || '');
        if (parsed.invalid) {
          throw new Error('Nilai harus berupa angka.');
        }
        if (parsed.value !== null && (parsed.value < 0 || parsed.value > 100)) {
          throw new Error('Nilai harus dalam rentang 0 - 100.');
        }
        slotScoresPayload[slotCode] = parsed.value;
      }

      return teacherReportApi.updateReportGrade(editingRow.id, {
        formatifScore: slotScoresPayload[primarySlots.formative] ?? null,
        sbtsScore: slotScoresPayload[primarySlots.midterm] ?? null,
        sasScore: slotScoresPayload[primarySlots.final] ?? null,
        slotScores: slotScoresPayload,
        description: editingDescription.trim(),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['mobile-teacher-subject-report', user?.id, effectiveSelectedAssignmentId, semester],
      });
      setEditingRow(null);
      notifySuccess('Data rapor berhasil diperbarui.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menyimpan perubahan rapor.');
    },
  });

  if (isLoading) return <AppLoadingScreen message="Memuat rapor mapel..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ ...headingTextStyle, fontWeight: '700', marginBottom: 8 }}>Rapor Mapel</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#f8fafc' }}
        contentContainerStyle={pageContentPadding}
        refreshControl={
          <RefreshControl
            refreshing={assignmentsQuery.isFetching || (reportQuery.isFetching && !reportQuery.isLoading)}
            onRefresh={async () => {
              await Promise.all([assignmentsQuery.refetch(), reportQuery.refetch()]);
            }}
          />
        }
      >
      <Text style={{ ...headingTextStyle, fontWeight: '700', marginBottom: 6 }}>Rapor Mapel</Text>
      <Text style={{ color: '#64748b', ...inputTextStyle, marginBottom: 12 }}>
        Rekap nilai akhir per mata pelajaran dan kelas.
      </Text>

      {assignmentsQuery.isLoading ? <QueryStateView type="loading" message="Memuat assignment..." /> : null}
      {assignmentsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat assignment guru." onRetry={() => assignmentsQuery.refetch()} />
      ) : null}
      {!assignmentsQuery.isLoading && !assignmentsQuery.isError && !assignmentsQuery.data?.activeYear?.id ? (
        <View
          style={{
            backgroundColor: '#fffbeb',
            borderWidth: 1,
            borderColor: '#fde68a',
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: '#92400e', fontWeight: '700', ...bodyTextStyle, marginBottom: 4 }}>Tahun ajaran aktif belum tersedia</Text>
          <Text style={{ color: '#b45309', ...bodyTextStyle }}>
            Aktifkan tahun ajaran terlebih dahulu agar rapor mapel tidak ambigu.
          </Text>
        </View>
      ) : null}

      {!assignmentsQuery.isLoading && !assignmentsQuery.isError ? (
        assignments.length > 0 ? (
          <>
            <View
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                borderRadius: 10,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: '#0f172a', fontWeight: '700', ...sectionTitleTextStyle, marginBottom: 8 }}>Pilih Kelas & Mapel</Text>
              <MobileSelectField
                value={effectiveSelectedAssignmentId ? String(effectiveSelectedAssignmentId) : ''}
                options={assignmentOptions}
                onChange={(next) => setSelectedAssignmentId(next ? Number(next) : null)}
                placeholder="Pilih kelas & mapel"
              />
            </View>

            <MobileSelectField
              label="Semester"
              value={semester}
              options={semesterOptions}
              onChange={(next) => {
                if (next === 'ODD' || next === 'EVEN') {
                  setSemester(next);
                }
              }}
              placeholder="Pilih semester"
            />

            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Cari siswa / NIS / NISN..."
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: '#fff',
                marginBottom: 10,
                ...inputTextStyle,
              }}
            />

            {reportQuery.isLoading ? <QueryStateView type="loading" message="Memuat data rapor..." /> : null}
            {reportQuery.isError ? (
              <QueryStateView type="error" message="Gagal memuat data rapor mapel." onRetry={() => reportQuery.refetch()} />
            ) : null}

            {!reportQuery.isLoading && !reportQuery.isError ? (
              <>
                <View
                  style={{
                    backgroundColor: '#1e3a8a',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: '#bfdbfe', ...bodyTextStyle, marginBottom: 4 }}>
                    {selectedAssignment?.subject.name} • {selectedAssignment?.class.name}
                  </Text>
                  <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
                    <View style={{ flex: 1, paddingHorizontal: 4 }}>
                      <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: 8 }}>
                        <Text style={{ color: '#bfdbfe', ...helperTextStyle }}>Siswa</Text>
                        <Text style={{ color: '#fff', fontWeight: '700', ...sectionTitleTextStyle }}>{summary.students}</Text>
                      </View>
                    </View>
                    <View style={{ flex: 1, paddingHorizontal: 4 }}>
                      <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: 8 }}>
                        <Text style={{ color: '#bfdbfe', ...helperTextStyle }}>Rata-rata Akhir</Text>
                        <Text style={{ color: '#fff', fontWeight: '700', ...sectionTitleTextStyle }}>{summary.avgFinal}</Text>
                      </View>
                    </View>
                    <View style={{ flex: 1, paddingHorizontal: 4 }}>
                      <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: 8 }}>
                        <Text style={{ color: '#bfdbfe', ...helperTextStyle }}>Tuntas</Text>
                        <Text style={{ color: '#fff', fontWeight: '700', ...sectionTitleTextStyle }}>{summary.passed}</Text>
                      </View>
                    </View>
                  </View>
                </View>

                {filteredRows.length > 0 ? (
                  <View>
                    {filteredRows.map((item) => {
                      const style = predicateStyle(item.predicate);
                      return (
                        <View
                          key={item.id}
                          style={{
                            backgroundColor: '#fff',
                            borderWidth: 1,
                            borderColor: '#e2e8f0',
                            borderRadius: 10,
                            padding: 12,
                            marginBottom: 8,
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <Text style={{ color: '#0f172a', fontWeight: '700' }}>{item.student?.name || '-'}</Text>
                              <Text style={{ color: '#64748b', ...helperTextStyle }}>
                                NIS: {item.student?.nis || '-'} | NISN: {item.student?.nisn || '-'}
                              </Text>
                            </View>
                            <Text
                              style={{
                                ...helperTextStyle,
                                fontWeight: '700',
                                color: style.text,
                                backgroundColor: style.bg,
                                borderWidth: 1,
                                borderColor: style.border,
                                borderRadius: 999,
                                paddingHorizontal: 8,
                                paddingVertical: 2,
                              }}
                            >
                              {item.predicate || '-'}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                            {[
                              {
                                label: slotLabelsByCode[primarySlots.formative] || primarySlots.formative,
                                value: roundScore(
                                  readRowSlotScore(item, primarySlots.formative, item.formatifScore),
                                ),
                              },
                              {
                                label: slotLabelsByCode[primarySlots.midterm] || primarySlots.midterm,
                                value: roundScore(readRowSlotScore(item, primarySlots.midterm, item.sbtsScore)),
                              },
                              {
                                label: slotLabelsByCode[primarySlots.final] || primarySlots.final,
                                value: roundScore(readRowSlotScore(item, primarySlots.final, item.sasScore)),
                              },
                              { label: 'Akhir', value: formatFinalScore(item.finalScore) },
                            ].map((score) => (
                              <View key={score.label} style={{ width: '25%', paddingHorizontal: 4, marginBottom: 6 }}>
                                <View
                                  style={{
                                    backgroundColor: '#f8fafc',
                                    borderWidth: 1,
                                    borderColor: '#e2e8f0',
                                    borderRadius: 8,
                                    paddingVertical: 8,
                                    alignItems: 'center',
                                  }}
                                >
                                  <Text style={{ color: '#64748b', ...helperTextStyle }}>{score.label}</Text>
                                  <Text style={{ color: '#0f172a', fontWeight: '700', ...bodyTextStyle }}>{score.value}</Text>
                                </View>
                              </View>
                            ))}
                          </View>
                          <Text style={{ color: '#334155', ...bodyTextStyle, marginBottom: 8 }}>
                            Capaian: {item.description || '-'}
                          </Text>
                          <Pressable
                            onPress={() => openEditModal(item)}
                            style={{
                              borderWidth: 1,
                              borderColor: '#bfdbfe',
                              borderRadius: 8,
                              paddingVertical: 8,
                              alignItems: 'center',
                              backgroundColor: '#eff6ff',
                            }}
                          >
                            <Text style={{ color: '#1d4ed8', fontWeight: '700', ...bodyTextStyle }}>Edit Rapor</Text>
                          </Pressable>
                        </View>
                      );
                    })}
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
                    <Text style={{ fontWeight: '700', marginBottom: 4, color: '#0f172a', ...bodyTextStyle }}>Data kosong</Text>
                    <Text style={{ color: '#64748b', ...bodyTextStyle }}>Belum ada data rapor untuk filter terpilih.</Text>
                  </View>
                )}
              </>
            ) : null}
          </>
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
            <Text style={{ fontWeight: '700', marginBottom: 4, color: '#0f172a', ...bodyTextStyle }}>Belum ada assignment</Text>
            <Text style={{ color: '#64748b', ...bodyTextStyle }}>Guru belum memiliki assignment mapel aktif.</Text>
          </View>
        )
      ) : null}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          marginTop: 18,
          backgroundColor: '#1d4ed8',
          paddingVertical: 12,
          borderRadius: 10,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600', ...bodyTextStyle }}>Kembali ke Home</Text>
      </Pressable>
      </ScrollView>

      <Modal
        visible={!!editingRow}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (saveEditMutation.isPending) return;
          setEditingRow(null);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            justifyContent: 'center',
            paddingHorizontal: 18,
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#dbeafe',
              padding: 14,
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: scaleFont(18), lineHeight: scaleLineHeight(26), marginBottom: 4 }}>Edit Rapor</Text>
            <Text style={{ color: '#334155', ...inputTextStyle, marginBottom: 10 }}>
              {editingRow?.student?.name || '-'}
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 }}>
              {slotEditOrder.map((slotCode) => (
                <View key={slotCode} style={{ width: slotInputWidth, paddingHorizontal: 4, marginBottom: 8 }}>
                  <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>
                    {slotLabelsByCode[slotCode] || slotCode}
                  </Text>
                  <TextInput
                    value={editingSlotValues[slotCode] || ''}
                    onChangeText={(value) =>
                      setEditingSlotValues((prev) => ({
                        ...prev,
                        [slotCode]: value,
                      }))
                    }
                    keyboardType="numeric"
                    placeholder="0-100"
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      color: '#0f172a',
                      backgroundColor: '#fff',
                      ...inputTextStyle,
                    }}
                  />
                </View>
              ))}
            </View>

            <Text style={{ color: '#64748b', ...bodyTextStyle, marginBottom: 4 }}>Capaian Kompetensi</Text>
            <TextInput
              value={editingDescription}
              onChangeText={setEditingDescription}
              placeholder="Isi deskripsi capaian..."
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 9,
                color: '#0f172a',
                backgroundColor: '#fff',
                minHeight: 88,
                ...inputTextStyle,
              }}
            />

            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginTop: 12 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => {
                    if (saveEditMutation.isPending) return;
                    setEditingRow(null);
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 9,
                    paddingVertical: 10,
                    alignItems: 'center',
                    backgroundColor: '#fff',
                  }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700', ...bodyTextStyle }}>Batal</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => saveEditMutation.mutate()}
                  disabled={saveEditMutation.isPending}
                  style={{
                    borderWidth: 1,
                    borderColor: '#1d4ed8',
                    borderRadius: 9,
                    paddingVertical: 10,
                    alignItems: 'center',
                    backgroundColor: saveEditMutation.isPending ? '#93c5fd' : '#1d4ed8',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', ...bodyTextStyle }}>
                    {saveEditMutation.isPending ? 'Menyimpan...' : 'Simpan'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
