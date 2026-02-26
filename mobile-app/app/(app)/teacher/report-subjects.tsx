import { useEffect, useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { useTeacherAssignmentsQuery } from '../../../src/features/teacherAssignments/useTeacherAssignmentsQuery';
import { TeacherSubjectReportItem, teacherReportApi } from '../../../src/features/teacherReports/teacherReportApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';

type Semester = 'ODD' | 'EVEN';

function roundScore(value: number | null) {
  if (value === null || value === undefined) return '-';
  return String(Math.round(value));
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

export default function TeacherSubjectReportScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets);
  const assignmentsQuery = useTeacherAssignmentsQuery({ enabled: isAuthenticated, user });
  const assignments = assignmentsQuery.data?.assignments || [];
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  const [semester, setSemester] = useState<Semester>('ODD');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingRow, setEditingRow] = useState<TeacherSubjectReportItem | null>(null);
  const [editingFormatif, setEditingFormatif] = useState('');
  const [editingSbts, setEditingSbts] = useState('');
  const [editingSas, setEditingSas] = useState('');
  const [editingDescription, setEditingDescription] = useState('');

  useEffect(() => {
    if (!selectedAssignmentId && assignments.length > 0) {
      setSelectedAssignmentId(assignments[0].id);
    }
  }, [selectedAssignmentId, assignments]);

  const selectedAssignment = assignments.find((item) => item.id === selectedAssignmentId) || null;

  const reportQuery = useQuery({
    queryKey: ['mobile-teacher-subject-report', user?.id, selectedAssignmentId, semester],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!selectedAssignment,
    queryFn: () =>
      teacherReportApi.getSubjectReport({
        classId: selectedAssignment!.class.id,
        subjectId: selectedAssignment!.subject.id,
        academicYearId: selectedAssignment!.academicYear.id,
        semester,
      }),
  });

  const filteredRows = useMemo(() => {
    const rows = reportQuery.data || [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((item) => {
      const name = item.student?.name?.toLowerCase() || '';
      const nis = item.student?.nis?.toLowerCase() || '';
      const nisn = item.student?.nisn?.toLowerCase() || '';
      return name.includes(q) || nis.includes(q) || nisn.includes(q);
    });
  }, [reportQuery.data, searchQuery]);

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
    setEditingFormatif(row.formatifScore !== null && row.formatifScore !== undefined ? String(row.formatifScore) : '');
    setEditingSbts(row.sbtsScore !== null && row.sbtsScore !== undefined ? String(row.sbtsScore) : '');
    setEditingSas(row.sasScore !== null && row.sasScore !== undefined ? String(row.sasScore) : '');
    setEditingDescription(row.description || '');
  };

  const saveEditMutation = useMutation({
    mutationFn: async () => {
      if (!editingRow) throw new Error('Data rapor tidak ditemukan.');
      const formatifParsed = parseOptionalScore(editingFormatif);
      const sbtsParsed = parseOptionalScore(editingSbts);
      const sasParsed = parseOptionalScore(editingSas);

      if (formatifParsed.invalid || sbtsParsed.invalid || sasParsed.invalid) {
        throw new Error('Nilai harus berupa angka.');
      }

      for (const score of [formatifParsed.value, sbtsParsed.value, sasParsed.value]) {
        if (score !== null && (score < 0 || score > 100)) {
          throw new Error('Nilai harus dalam rentang 0 - 100.');
        }
      }

      return teacherReportApi.updateReportGrade(editingRow.id, {
        formatifScore: formatifParsed.value,
        sbtsScore: sbtsParsed.value,
        sasScore: sasParsed.value,
        description: editingDescription.trim(),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['mobile-teacher-subject-report', user?.id, selectedAssignmentId, semester],
      });
      setEditingRow(null);
      notifySuccess('Data rapor berhasil diperbarui.');
    },
    onError: (error: any) => {
      notifyApiError(error, 'Gagal menyimpan perubahan rapor.');
    },
  });

  if (isLoading) return <AppLoadingScreen message="Memuat rapor mapel..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>Rapor Mapel</Text>
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
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6 }}>Rapor Mapel</Text>
      <Text style={{ color: '#64748b', marginBottom: 12 }}>
        Rekap nilai akhir per mata pelajaran dan kelas.
      </Text>

      {assignmentsQuery.isLoading ? <QueryStateView type="loading" message="Memuat assignment..." /> : null}
      {assignmentsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat assignment guru." onRetry={() => assignmentsQuery.refetch()} />
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
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Pilih Kelas & Mapel</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                {assignments.map((item) => {
                  const selected = selectedAssignmentId === item.id;
                  return (
                    <View key={item.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                      <Pressable
                        onPress={() => setSelectedAssignmentId(item.id)}
                        style={{
                          borderWidth: 1,
                          borderColor: selected ? '#1d4ed8' : '#cbd5e1',
                          backgroundColor: selected ? '#eff6ff' : '#fff',
                          borderRadius: 8,
                          padding: 9,
                        }}
                        >
                          <Text style={{ color: selected ? '#1d4ed8' : '#0f172a', fontWeight: '700', fontSize: 12 }}>
                          {item.class.name}
                          </Text>
                          <Text style={{ color: '#334155', fontSize: 12 }} numberOfLines={2}>
                          {item.subject.name}
                          </Text>
                        </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 10 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => setSemester('ODD')}
                  style={{
                    borderWidth: 1,
                    borderColor: semester === 'ODD' ? '#1d4ed8' : '#cbd5e1',
                    backgroundColor: semester === 'ODD' ? '#eff6ff' : '#fff',
                    borderRadius: 8,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: semester === 'ODD' ? '#1d4ed8' : '#334155', fontWeight: '700' }}>Ganjil</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => setSemester('EVEN')}
                  style={{
                    borderWidth: 1,
                    borderColor: semester === 'EVEN' ? '#1d4ed8' : '#cbd5e1',
                    backgroundColor: semester === 'EVEN' ? '#eff6ff' : '#fff',
                    borderRadius: 8,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: semester === 'EVEN' ? '#1d4ed8' : '#334155', fontWeight: '700' }}>Genap</Text>
                </Pressable>
              </View>
            </View>

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
                  <Text style={{ color: '#bfdbfe', fontSize: 12, marginBottom: 4 }}>
                    {selectedAssignment?.subject.name} • {selectedAssignment?.class.name}
                  </Text>
                  <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
                    <View style={{ flex: 1, paddingHorizontal: 4 }}>
                      <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: 8 }}>
                        <Text style={{ color: '#bfdbfe', fontSize: 11 }}>Siswa</Text>
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{summary.students}</Text>
                      </View>
                    </View>
                    <View style={{ flex: 1, paddingHorizontal: 4 }}>
                      <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: 8 }}>
                        <Text style={{ color: '#bfdbfe', fontSize: 11 }}>Rata-rata Akhir</Text>
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{summary.avgFinal}</Text>
                      </View>
                    </View>
                    <View style={{ flex: 1, paddingHorizontal: 4 }}>
                      <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: 8 }}>
                        <Text style={{ color: '#bfdbfe', fontSize: 11 }}>Tuntas</Text>
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{summary.passed}</Text>
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
                              <Text style={{ color: '#64748b', fontSize: 11 }}>
                                NIS: {item.student?.nis || '-'} | NISN: {item.student?.nisn || '-'}
                              </Text>
                            </View>
                            <Text
                              style={{
                                fontSize: 11,
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
                              { label: 'NF', value: roundScore(item.formatifScore) },
                              { label: 'SBTS', value: roundScore(item.sbtsScore) },
                              { label: 'SAS', value: roundScore(item.sasScore) },
                              { label: 'Akhir', value: roundScore(item.finalScore) },
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
                                  <Text style={{ color: '#64748b', fontSize: 10 }}>{score.label}</Text>
                                  <Text style={{ color: '#0f172a', fontWeight: '700' }}>{score.value}</Text>
                                </View>
                              </View>
                            ))}
                          </View>
                          <Text style={{ color: '#334155', fontSize: 12, marginBottom: 8 }}>
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
                            <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Edit Rapor</Text>
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
                    <Text style={{ fontWeight: '700', marginBottom: 4, color: '#0f172a' }}>Data kosong</Text>
                    <Text style={{ color: '#64748b' }}>Belum ada data rapor untuk filter terpilih.</Text>
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
            <Text style={{ fontWeight: '700', marginBottom: 4, color: '#0f172a' }}>Belum ada assignment</Text>
            <Text style={{ color: '#64748b' }}>Guru belum memiliki assignment mapel aktif.</Text>
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
        <Text style={{ color: '#fff', fontWeight: '600' }}>Kembali ke Home</Text>
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
            <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 18, marginBottom: 4 }}>Edit Rapor</Text>
            <Text style={{ color: '#334155', fontSize: 13, marginBottom: 10 }}>
              {editingRow?.student?.name || '-'}
            </Text>

            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>NF</Text>
                <TextInput
                  value={editingFormatif}
                  onChangeText={setEditingFormatif}
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
                  }}
                />
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>SBTS</Text>
                <TextInput
                  value={editingSbts}
                  onChangeText={setEditingSbts}
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
                  }}
                />
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>SAS</Text>
                <TextInput
                  value={editingSas}
                  onChangeText={setEditingSas}
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
                  }}
                />
              </View>
            </View>

            <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>Capaian Kompetensi</Text>
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
                  <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
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
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
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
