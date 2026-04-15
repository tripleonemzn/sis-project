import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  createEmptyEducationHistory,
  getAllowedDocumentKindsForLevel,
  getEducationDocumentLabel,
  getEducationInstitutionLabel,
  getEducationLevelLabel,
  getEducationLevelsForTrackWithOptions,
  hasEducationHistoryContent,
  levelUsesCertificationFields,
  levelUsesHigherEducationFields,
  type ProfileEducationDocument,
  type ProfileEducationDocumentKind,
  type ProfileEducationHistory,
  type ProfileEducationLevel,
  type ProfileEducationTrack,
} from './profileEducation';

type EditableEducationField = 'institutionName' | 'faculty' | 'studyProgram' | 'gpa' | 'degree' | 'nrg';

type ProfileEducationEditorProps = {
  track: ProfileEducationTrack;
  histories: ProfileEducationHistory[];
  includeCertification?: boolean;
  onSaveHistory: (history: ProfileEducationHistory) => Promise<void> | void;
  onRemoveHistory: (level: ProfileEducationLevel) => Promise<void> | void;
  onPickDocument: () => Promise<ProfileEducationDocument | null>;
  onViewDocument?: (document: ProfileEducationDocument) => void;
};

function cloneHistory(history: ProfileEducationHistory): ProfileEducationHistory {
  return {
    ...history,
    documents: history.documents.map((document) => ({ ...document })),
  };
}

function normalizeDraftForLevel(
  history: ProfileEducationHistory,
  level: ProfileEducationLevel,
  track: ProfileEducationTrack,
): ProfileEducationHistory {
  const nextHistory = cloneHistory(history);
  const higherEducation = levelUsesHigherEducationFields(level);
  const certification = levelUsesCertificationFields(level);
  const allowedKinds = new Set(getAllowedDocumentKindsForLevel(track, level));

  return {
    ...nextHistory,
    level,
    faculty: higherEducation && !certification ? nextHistory.faculty : '',
    studyProgram:
      higherEducation || certification ? nextHistory.studyProgram : track === 'STUDENT' ? nextHistory.studyProgram : '',
    gpa: higherEducation && !certification ? nextHistory.gpa : '',
    degree: higherEducation || certification ? nextHistory.degree : '',
    nrg: certification ? nextHistory.nrg : '',
    documents: nextHistory.documents.filter((document) => allowedKinds.has(document.kind)),
  };
}

function countUploadedDocuments(history: ProfileEducationHistory) {
  return history.documents.filter((document) => String(document.fileUrl || '').trim()).length;
}

function getDocumentActionLabel(kind: ProfileEducationDocumentKind, hasDocument: boolean) {
  if (kind === 'SERTIFIKAT') {
    return hasDocument ? 'Ganti Sertifikat' : 'Upload Sertifikat';
  }
  if (kind === 'TRANSKRIP') {
    return hasDocument ? 'Ganti Transkrip Nilai' : 'Upload Transkrip Nilai';
  }
  return hasDocument ? 'Ganti File' : 'Upload File';
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText?: (value: string) => void;
  placeholder?: string;
}) {
  const editable = typeof onChangeText === 'function';
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 11,
          color: '#0f172a',
          backgroundColor: editable ? '#fff' : '#f8fafc',
        }}
      />
    </View>
  );
}

export function ProfileEducationEditor({
  track,
  histories,
  includeCertification = false,
  onSaveHistory,
  onRemoveHistory,
  onPickDocument,
  onViewDocument,
}: ProfileEducationEditorProps) {
  const allLevels = useMemo(
    () => getEducationLevelsForTrackWithOptions(track, { includeCertification }),
    [includeCertification, track],
  );
  const activeHistories = useMemo(
    () => histories.filter((history) => hasEducationHistoryContent(history)),
    [histories],
  );
  const availableLevels = useMemo(
    () => allLevels.filter((level) => !activeHistories.some((history) => history.level === level)),
    [activeHistories, allLevels],
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [draftHistory, setDraftHistory] = useState<ProfileEducationHistory | null>(null);
  const [uploadingKind, setUploadingKind] = useState<ProfileEducationDocumentKind | null>(null);
  const [draftError, setDraftError] = useState('');
  const [isPersisting, setIsPersisting] = useState(false);
  const [removingLevel, setRemovingLevel] = useState<ProfileEducationLevel | null>(null);

  useEffect(() => {
    if (!isModalOpen) return;
    if (!draftHistory) {
      if (modalMode === 'create' && availableLevels.length === 0) {
        setIsModalOpen(false);
      }
      return;
    }

    if (modalMode === 'create' && !availableLevels.includes(draftHistory.level)) {
      if (availableLevels[0]) {
        setDraftHistory((prev) => (prev ? normalizeDraftForLevel(prev, availableLevels[0], track) : prev));
      } else {
        setIsModalOpen(false);
      }
    }
  }, [availableLevels, draftHistory, isModalOpen, modalMode, track]);

  const openCreateModal = () => {
    if (!availableLevels[0]) return;
    setDraftError('');
    setUploadingKind(null);
    setModalMode('create');
    setDraftHistory(createEmptyEducationHistory(availableLevels[0]));
    setIsModalOpen(true);
  };

  const openEditModal = (history: ProfileEducationHistory) => {
    setDraftError('');
    setUploadingKind(null);
    setModalMode('edit');
    setDraftHistory(cloneHistory(history));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isPersisting) return;
    setIsModalOpen(false);
    setModalMode('create');
    setDraftHistory(null);
    setUploadingKind(null);
    setDraftError('');
  };

  const handleLevelSelect = (level: ProfileEducationLevel) => {
    setDraftError('');
    setDraftHistory((prev) => (prev ? normalizeDraftForLevel(prev, level, track) : createEmptyEducationHistory(level)));
  };

  const handleFieldChange = (field: EditableEducationField, value: string) => {
    setDraftError('');
    setDraftHistory((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleDocumentPick = async (kind: ProfileEducationDocumentKind) => {
    if (!draftHistory) return;
    setDraftError('');
    setUploadingKind(kind);
    try {
      const uploaded = await onPickDocument();
      if (!uploaded) return;
      setDraftHistory((prev) => {
        if (!prev) return prev;
        const nextDocuments = prev.documents.filter((document) => document.kind !== kind);
        nextDocuments.push({
          ...uploaded,
          kind,
          label: uploaded.label || uploaded.originalName || getEducationDocumentLabel(kind),
        });
        return { ...prev, documents: nextDocuments };
      });
    } finally {
      setUploadingKind(null);
    }
  };

  const handleDocumentRemove = (kind: ProfileEducationDocumentKind) => {
    setDraftHistory((prev) =>
      prev
        ? {
            ...prev,
            documents: prev.documents.filter((document) => document.kind !== kind),
          }
        : prev,
    );
  };

  const handleSaveDraft = async () => {
    if (!draftHistory) return;
    if (!hasEducationHistoryContent(draftHistory)) {
      setDraftError(
        `Isi minimal ${getEducationInstitutionLabel(draftHistory.level).toLowerCase()} atau unggah salah satu dokumen sebelum disimpan.`,
      );
      return;
    }
    setIsPersisting(true);
    try {
      await onSaveHistory(draftHistory);
      closeModal();
    } finally {
      setIsPersisting(false);
    }
  };

  const confirmRemoveHistory = (history: ProfileEducationHistory) => {
    Alert.alert(
      'Hapus riwayat pendidikan',
      `Hapus jenjang ${getEducationLevelLabel(history.level)} dari daftar profil?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: () => {
            setRemovingLevel(history.level);
            Promise.resolve(onRemoveHistory(history.level)).finally(() => {
              setRemovingLevel(null);
            });
          },
        },
      ],
    );
  };

  const currentDraft = draftHistory;
  const currentLevel = currentDraft?.level ?? null;
  const currentDocumentKinds = currentLevel ? getAllowedDocumentKindsForLevel(track, currentLevel) : [];
  const isHigherEducation = currentLevel ? levelUsesHigherEducationFields(currentLevel) : false;
  const isCertification = currentLevel ? levelUsesCertificationFields(currentLevel) : false;
  const usesAcademicFields = isHigherEducation || isCertification;
  const uploadSectionTitle =
    isCertification && currentDocumentKinds.length > 0 ? 'Upload Dokumen Sertifikasi' : 'Upload Dokumen';

  return (
    <View>
      <View
        style={{
          borderWidth: 1,
          borderColor: '#bfdbfe',
          backgroundColor: '#eff6ff',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 6 }}>Ketentuan Upload Riwayat Pendidikan</Text>
        <Text style={{ color: '#1d4ed8', fontSize: 12, lineHeight: 18 }}>
          Tambahkan riwayat pendidikan satu per satu agar form tetap ringkas. Dokumen hanya menerima format PDF,
          JPG, JPEG, atau PNG dengan ukuran maksimal 500KB per file.
        </Text>
      </View>

      <View
        style={{
          borderWidth: 1,
          borderColor: '#e2e8f0',
          backgroundColor: '#fff',
          borderRadius: 16,
          padding: 14,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#0f172a', fontWeight: '700' }}>Daftar Riwayat Pendidikan</Text>
        <Text style={{ color: '#64748b', marginTop: 6, marginBottom: 12 }}>
          {activeHistories.length > 0
            ? `${activeHistories.length} jenjang sudah ditambahkan.`
            : 'Belum ada riwayat pendidikan yang ditambahkan.'}
        </Text>
        <Pressable
          onPress={openCreateModal}
          disabled={availableLevels.length === 0}
          style={{
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12,
            alignItems: 'center',
            backgroundColor: availableLevels.length === 0 ? '#e2e8f0' : '#2563eb',
          }}
        >
          <Text style={{ color: availableLevels.length === 0 ? '#94a3b8' : '#fff', fontWeight: '700' }}>
            Tambah Riwayat Pendidikan
          </Text>
        </Pressable>
      </View>

      {activeHistories.length > 0 ? (
        activeHistories.map((history) => {
          const institutionLabel = getEducationInstitutionLabel(history.level);
          const documentCount = countUploadedDocuments(history);
          const isHigherEntry = levelUsesHigherEducationFields(history.level);
          const isCertificationEntry = levelUsesCertificationFields(history.level);
          const showsAcademicFields = isHigherEntry || isCertificationEntry;

          return (
            <View
              key={history.level}
              style={{
                borderWidth: 1,
                borderColor: '#e2e8f0',
                backgroundColor: '#fff',
                borderRadius: 16,
                padding: 14,
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  alignSelf: 'flex-start',
                  borderWidth: 1,
                  borderColor: '#bfdbfe',
                  backgroundColor: '#eff6ff',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: '#1d4ed8', fontSize: 12, fontWeight: '700' }}>
                  {getEducationLevelLabel(history.level)}
                </Text>
              </View>

              <Text style={{ color: '#64748b', fontSize: 12 }}>{institutionLabel}</Text>
              <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 16, marginTop: 4 }}>
                {history.institutionName || `Belum mengisi ${institutionLabel.toLowerCase()}`}
              </Text>

              {showsAcademicFields ? (
                <View style={{ marginTop: 10 }}>
                  {!isCertificationEntry ? (
                    <Text style={{ color: '#475569', marginBottom: 4 }}>Fakultas: {history.faculty || '-'}</Text>
                  ) : null}
                  <Text style={{ color: '#475569', marginBottom: 4 }}>
                    Program Studi/Jurusan: {history.studyProgram || '-'}
                  </Text>
                  {!isCertificationEntry ? (
                    <Text style={{ color: '#475569', marginBottom: 4 }}>IPK: {history.gpa || '-'}</Text>
                  ) : null}
                  <Text style={{ color: '#475569' }}>Gelar Akademik: {history.degree || '-'}</Text>
                  {isCertificationEntry ? (
                    <Text style={{ color: '#475569', marginTop: 4 }}>NRG: {history.nrg || '-'}</Text>
                  ) : null}
                </View>
              ) : null}

              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  borderRadius: 12,
                  backgroundColor: '#f8fafc',
                  padding: 12,
                  marginTop: 12,
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: '#64748b', fontSize: 12 }}>Dokumen</Text>
                <Text style={{ color: '#0f172a', fontWeight: '700', marginTop: 4 }}>
                  {documentCount} file terpasang
                </Text>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                  <Pressable
                    onPress={() => openEditModal(history)}
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      backgroundColor: '#fff',
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ color: '#334155', fontWeight: '700' }}>Edit</Text>
                  </Pressable>
                </View>
                <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                  <Pressable
                    onPress={() => confirmRemoveHistory(history)}
                    disabled={removingLevel === history.level}
                    style={{
                      borderWidth: 1,
                      borderColor: '#fecaca',
                      backgroundColor: '#fef2f2',
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ color: '#dc2626', fontWeight: '700' }}>
                      {removingLevel === history.level ? 'Menghapus...' : 'Hapus'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        })
      ) : (
        <View
          style={{
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: '#cbd5e1',
            backgroundColor: '#f8fafc',
            borderRadius: 16,
            padding: 20,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 6 }}>
            Riwayat pendidikan masih kosong
          </Text>
          <Text style={{ color: '#64748b', textAlign: 'center', lineHeight: 20 }}>
            Tekan tombol Tambah Riwayat Pendidikan lalu isi jenjang yang memang perlu Anda tampilkan di profil.
          </Text>
        </View>
      )}

      <Modal visible={isModalOpen} transparent animationType="fade" onRequestClose={closeModal}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            justifyContent: 'center',
            paddingHorizontal: 16,
            paddingVertical: 20,
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 20,
              borderWidth: 1,
              borderColor: '#dbeafe',
              padding: 16,
              maxHeight: '88%',
              shadowColor: '#0f172a',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.2,
              shadowRadius: 16,
              elevation: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: '#1d4ed8', fontSize: 12, fontWeight: '700', marginBottom: 6 }}>
                  Riwayat Pendidikan
                </Text>
                <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '700', marginBottom: 6 }}>
                  {modalMode === 'create' ? 'Tambah riwayat pendidikan' : 'Edit riwayat pendidikan'}
                </Text>
                <Text style={{ color: '#475569', lineHeight: 20 }}>
                  Isi data pendidikan secara bertahap, lalu unggah dokumen pendukung yang sesuai dengan jenjang ini.
                </Text>
              </View>
              <Pressable
                onPress={closeModal}
                disabled={isPersisting}
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 999,
                  width: 36,
                  height: 36,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#64748b', fontSize: 18, fontWeight: '700' }}>×</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  backgroundColor: '#f8fafc',
                  borderRadius: 16,
                  padding: 14,
                  marginBottom: 14,
                }}
              >
                <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 10 }}>Jenjang</Text>
                {modalMode === 'create' ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                    {availableLevels.map((level) => {
                      const active = currentLevel === level;
                      return (
                        <View key={level} style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                          <Pressable
                            onPress={() => handleLevelSelect(level)}
                            style={{
                              borderWidth: 1,
                              borderColor: active ? '#2563eb' : '#cbd5e1',
                              backgroundColor: active ? '#2563eb' : '#fff',
                              borderRadius: 12,
                              paddingHorizontal: 12,
                              paddingVertical: 9,
                            }}
                          >
                            <Text style={{ color: active ? '#fff' : '#334155', fontWeight: '700' }}>
                              {getEducationLevelLabel(level)}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      borderWidth: 1,
                      borderColor: '#bfdbfe',
                      backgroundColor: '#fff',
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                    }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>
                      {currentLevel ? getEducationLevelLabel(currentLevel) : '-'}
                    </Text>
                  </View>
                )}
              </View>

              {currentDraft ? (
                <>
                  <Field
                    label={currentLevel ? getEducationInstitutionLabel(currentLevel) : 'Nama Institusi'}
                    value={currentDraft.institutionName}
                    onChangeText={(value) => handleFieldChange('institutionName', value)}
                    placeholder={usesAcademicFields ? 'Masukkan nama perguruan tinggi' : 'Masukkan nama sekolah'}
                  />

                  {isHigherEducation && !isCertification ? (
                    <>
                      <Field
                        label="Fakultas"
                        value={currentDraft.faculty}
                        onChangeText={(value) => handleFieldChange('faculty', value)}
                        placeholder="Masukkan nama fakultas"
                      />
                    </>
                  ) : null}

                  {usesAcademicFields ? (
                    <>
                      <Field
                        label="Program Studi/Jurusan"
                        value={currentDraft.studyProgram}
                        onChangeText={(value) => handleFieldChange('studyProgram', value)}
                        placeholder="Masukkan program studi atau jurusan"
                      />
                      {!isCertification ? (
                        <Field
                          label="IPK"
                          value={currentDraft.gpa}
                          onChangeText={(value) => handleFieldChange('gpa', value)}
                          placeholder="Contoh: 3.72"
                        />
                      ) : (
                        <Field
                          label="NRG (No. Registrasi Guru)"
                          value={currentDraft.nrg}
                          onChangeText={(value) => handleFieldChange('nrg', value)}
                          placeholder="Masukkan NRG"
                        />
                      )}
                      <Field
                        label="Gelar Akademik"
                        value={currentDraft.degree}
                        onChangeText={(value) => handleFieldChange('degree', value)}
                        placeholder="Contoh: S.Kom., S.Pd., M.M."
                      />
                    </>
                  ) : null}

                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                      backgroundColor: '#f8fafc',
                      borderRadius: 16,
                      padding: 14,
                      marginTop: 2,
                    }}
                  >
                    <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>{uploadSectionTitle}</Text>
                    <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 10 }}>
                      Format file: PDF, JPG, JPEG, PNG. Ukuran maksimal 500KB per file.
                    </Text>

                    {currentDocumentKinds.map((kind) => {
                      const document = currentDraft.documents.find((item) => item.kind === kind);
                      const isUploading = uploadingKind === kind;

                      return (
                        <View
                          key={kind}
                          style={{
                            borderWidth: 1,
                            borderColor: '#e2e8f0',
                            backgroundColor: '#fff',
                            borderRadius: 12,
                            padding: 12,
                            marginBottom: 10,
                          }}
                        >
                          <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>
                            {getEducationDocumentLabel(kind)}
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                            <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                              <Pressable
                                onPress={() => {
                                  void handleDocumentPick(kind);
                                }}
                                disabled={isUploading}
                                style={{
                                  borderWidth: 1,
                                  borderColor: '#1d4ed8',
                                  backgroundColor: isUploading ? '#bfdbfe' : '#eff6ff',
                                  borderRadius: 10,
                                  paddingHorizontal: 12,
                                  paddingVertical: 9,
                                }}
                              >
                                <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>
                                  {isUploading ? 'Mengunggah...' : getDocumentActionLabel(kind, Boolean(document))}
                                </Text>
                              </Pressable>
                            </View>
                            {document ? (
                              <>
                                {onViewDocument ? (
                                  <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                                    <Pressable
                                      onPress={() => onViewDocument(document)}
                                      style={{
                                        borderWidth: 1,
                                        borderColor: '#1d4ed8',
                                        backgroundColor: '#eff6ff',
                                        borderRadius: 10,
                                        paddingHorizontal: 12,
                                        paddingVertical: 9,
                                      }}
                                    >
                                      <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Lihat</Text>
                                    </Pressable>
                                  </View>
                                ) : null}
                                <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                                  <Pressable
                                    onPress={() => handleDocumentRemove(kind)}
                                    style={{
                                      borderWidth: 1,
                                      borderColor: '#fecaca',
                                      backgroundColor: '#fef2f2',
                                      borderRadius: 10,
                                      paddingHorizontal: 12,
                                      paddingVertical: 9,
                                    }}
                                  >
                                    <Text style={{ color: '#dc2626', fontWeight: '700' }}>Hapus</Text>
                                  </Pressable>
                                </View>
                              </>
                            ) : null}
                          </View>
                          <Text style={{ color: '#64748b', fontSize: 12 }}>
                            {document?.originalName || document?.label || 'Belum ada file terunggah'}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  {draftError ? (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        backgroundColor: '#fef2f2',
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        marginTop: 12,
                      }}
                    >
                      <Text style={{ color: '#b91c1c' }}>{draftError}</Text>
                    </View>
                  ) : null}
                </>
              ) : null}
            </ScrollView>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
              <Pressable
                onPress={closeModal}
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  backgroundColor: '#fff',
                  marginRight: 8,
                }}
              >
                <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void handleSaveDraft();
                }}
                disabled={isPersisting}
                style={{
                  borderWidth: 1,
                  borderColor: '#2563eb',
                  borderRadius: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  backgroundColor: isPersisting ? '#93c5fd' : '#2563eb',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {isPersisting ? 'Menyimpan...' : 'Simpan Riwayat Pendidikan'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
