import { useEffect, useMemo, useState } from 'react';
import { PencilLine, Plus, Trash2, UploadCloud, X } from 'lucide-react';
import {
  createEmptyEducationHistory,
  getAllowedDocumentKindsForLevel,
  getEducationDocumentLabel,
  getEducationInstitutionLabel,
  getEducationLevelLabel,
  getEducationLevelsForTrack,
  hasEducationHistoryContent,
  levelUsesHigherEducationFields,
  type ProfileEducationDocument,
  type ProfileEducationDocumentKind,
  type ProfileEducationHistory,
  type ProfileEducationLevel,
  type ProfileEducationTrack,
} from '../../features/profileEducation/profileEducation';

type EditableEducationField = 'institutionName' | 'faculty' | 'studyProgram' | 'gpa' | 'degree';

type ProfileEducationEditorProps = {
  track: ProfileEducationTrack;
  histories: ProfileEducationHistory[];
  onSaveHistory: (history: ProfileEducationHistory) => Promise<void> | void;
  onRemoveHistory: (level: ProfileEducationLevel) => Promise<void> | void;
  onUploadDocument: (file: File) => Promise<ProfileEducationDocument>;
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
  const allowedKinds = new Set(getAllowedDocumentKindsForLevel(track, level));

  return {
    ...nextHistory,
    level,
    faculty: higherEducation ? nextHistory.faculty : '',
    studyProgram: higherEducation ? nextHistory.studyProgram : track === 'STUDENT' ? nextHistory.studyProgram : '',
    gpa: higherEducation ? nextHistory.gpa : '',
    degree: higherEducation ? nextHistory.degree : '',
    documents: nextHistory.documents.filter((document) => allowedKinds.has(document.kind)),
  };
}

function countUploadedDocuments(history: ProfileEducationHistory) {
  return history.documents.filter((document) => String(document.fileUrl || '').trim()).length;
}

export function ProfileEducationEditor({
  track,
  histories,
  onSaveHistory,
  onRemoveHistory,
  onUploadDocument,
}: ProfileEducationEditorProps) {
  const allLevels = useMemo(() => getEducationLevelsForTrack(track), [track]);
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

  const handleDocumentUpload = async (kind: ProfileEducationDocumentKind, file: File) => {
    if (!draftHistory) return;
    setDraftError('');
    setUploadingKind(kind);
    try {
      const uploaded = await onUploadDocument(file);
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
    } catch {
      // Notification handled by parent uploader.
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

  const confirmRemoveHistory = async (history: ProfileEducationHistory) => {
    const confirmed = window.confirm(
      `Hapus riwayat pendidikan ${getEducationLevelLabel(history.level)} dari daftar profil?`,
    );
    if (!confirmed) return;
    setRemovingLevel(history.level);
    try {
      await onRemoveHistory(history.level);
    } finally {
      setRemovingLevel(null);
    }
  };

  const currentDraft = draftHistory;
  const currentLevel = currentDraft?.level ?? null;
  const currentDocumentKinds = currentLevel ? getAllowedDocumentKindsForLevel(track, currentLevel) : [];
  const isHigherEducation = currentLevel ? levelUsesHigherEducationFields(currentLevel) : false;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
        <p className="text-sm font-semibold text-blue-900">Ketentuan Upload Riwayat Pendidikan</p>
        <p className="mt-1 text-xs leading-5 text-blue-700">
          Tambahkan riwayat pendidikan satu per satu agar form tetap ringkas. Dokumen hanya menerima format PDF,
          JPG, JPEG, atau PNG dengan ukuran maksimal 500KB per file.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Daftar Riwayat Pendidikan</p>
          <p className="mt-1 text-sm text-slate-500">
            {activeHistories.length > 0
              ? `${activeHistories.length} jenjang sudah ditambahkan.`
              : 'Belum ada riwayat pendidikan yang ditambahkan.'}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          disabled={availableLevels.length === 0}
          className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
            availableLevels.length === 0
              ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
              : 'bg-blue-600 text-white shadow-[0_16px_30px_rgba(37,99,235,0.18)] hover:bg-blue-700'
          }`}
        >
          <Plus size={16} />
          Tambah Riwayat Pendidikan
        </button>
      </div>

      {activeHistories.length > 0 ? (
        <div className="space-y-3">
          {activeHistories.map((history) => {
            const documentCount = countUploadedDocuments(history);
            const institutionLabel = getEducationInstitutionLabel(history.level);
            const institutionValue = history.institutionName || `Belum mengisi ${institutionLabel.toLowerCase()}`;

            return (
              <div
                key={history.level}
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                      {getEducationLevelLabel(history.level)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500">{institutionLabel}</p>
                      <p className="mt-1 text-base font-semibold text-slate-900">{institutionValue}</p>
                    </div>
                    {isHigherEducation ? (
                      <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                        <p>Fakultas: {history.faculty || '-'}</p>
                        <p>Program Studi/Jurusan: {history.studyProgram || '-'}</p>
                        <p>IPK: {history.gpa || '-'}</p>
                        <p>Gelar Akademik: {history.degree || '-'}</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-3 lg:min-w-[220px]">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Dokumen</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {documentCount} file terpasang
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(history)}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <PencilLine size={15} />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void confirmRemoveHistory(history);
                        }}
                        disabled={removingLevel === history.level}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
                      >
                        <Trash2 size={15} />
                        {removingLevel === history.level ? 'Menghapus...' : 'Hapus'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center shadow-sm">
          <p className="text-base font-semibold text-slate-900">Riwayat pendidikan masih kosong</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Klik tombol <span className="font-semibold text-slate-700">Tambah Riwayat Pendidikan</span> lalu isi
            jenjang yang memang perlu Anda tampilkan di profil.
          </p>
        </div>
      )}

      {isModalOpen && currentDraft ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_30px_80px_rgba(15,23,42,0.18)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
                  Riwayat Pendidikan
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">
                  {modalMode === 'create' ? 'Tambah riwayat pendidikan' : 'Edit riwayat pendidikan'}
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Isi data pendidikan secara bertahap, lalu unggah dokumen pendukung yang sesuai dengan jenjang ini.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Tutup modal riwayat pendidikan"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 max-h-[75vh] space-y-5 overflow-y-auto pr-1">
              <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
                <p className="text-sm font-semibold text-slate-900">Jenjang</p>
                {modalMode === 'create' ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {availableLevels.map((level) => {
                      const active = currentLevel === level;
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => handleLevelSelect(level)}
                          className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                            active
                              ? 'border-blue-300 bg-blue-600 text-white shadow-[0_12px_26px_rgba(37,99,235,0.2)]'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700'
                          }`}
                        >
                          {getEducationLevelLabel(level)}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 inline-flex items-center rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-semibold text-blue-700">
                    {currentLevel ? getEducationLevelLabel(currentLevel) : '-'}
                  </div>
                )}
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">
                    {currentLevel ? getEducationInstitutionLabel(currentLevel) : 'Nama Institusi'}
                  </span>
                  <input
                    value={currentDraft.institutionName}
                    onChange={(event) => handleFieldChange('institutionName', event.target.value)}
                    placeholder={isHigherEducation ? 'Masukkan nama perguruan tinggi' : 'Masukkan nama sekolah'}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                {isHigherEducation ? (
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700">Fakultas</span>
                    <input
                      value={currentDraft.faculty}
                      onChange={(event) => handleFieldChange('faculty', event.target.value)}
                      placeholder="Masukkan nama fakultas"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                ) : null}

                {isHigherEducation ? (
                  <>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">Program Studi/Jurusan</span>
                      <input
                        value={currentDraft.studyProgram}
                        onChange={(event) => handleFieldChange('studyProgram', event.target.value)}
                        placeholder="Masukkan program studi atau jurusan"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">IPK</span>
                      <input
                        value={currentDraft.gpa}
                        onChange={(event) => handleFieldChange('gpa', event.target.value)}
                        placeholder="Contoh: 3.72"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <label className="block xl:col-span-2">
                      <span className="mb-1 block text-sm font-medium text-gray-700">Gelar Akademik</span>
                      <input
                        value={currentDraft.degree}
                        onChange={(event) => handleFieldChange('degree', event.target.value)}
                        placeholder="Contoh: S.Kom., S.Pd., M.M."
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                  </>
                ) : null}
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
                <p className="text-sm font-semibold text-slate-900">Upload Dokumen</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Format file: PDF, JPG, JPEG, PNG. Ukuran maksimal 500KB per file.
                </p>
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  {currentDocumentKinds.map((kind) => {
                    const document = currentDraft.documents.find((item) => item.kind === kind);
                    const isUploading = uploadingKind === kind;

                    return (
                      <div key={kind} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-sm font-semibold text-slate-800">{getEducationDocumentLabel(kind)}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
                            <UploadCloud size={16} />
                            {isUploading ? 'Mengunggah...' : document ? 'Ganti File' : 'Upload File'}
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              className="sr-only"
                              disabled={isUploading}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) {
                                  void handleDocumentUpload(kind, file);
                                }
                                event.currentTarget.value = '';
                              }}
                            />
                          </label>
                          {document ? (
                            <>
                              <a
                                href={document.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                              >
                                Lihat File
                              </a>
                              <button
                                type="button"
                                onClick={() => handleDocumentRemove(kind)}
                                className="inline-flex items-center rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
                              >
                                Hapus
                              </button>
                            </>
                          ) : null}
                        </div>
                        <p className="mt-3 text-xs text-slate-500">
                          {document?.originalName || document?.label || 'Belum ada file terunggah'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {draftError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {draftError}
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeModal}
                disabled={isPersisting}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSaveDraft();
                }}
                disabled={isPersisting}
                className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(37,99,235,0.2)] transition hover:bg-blue-700"
              >
                {isPersisting ? 'Menyimpan...' : 'Simpan Riwayat Pendidikan'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
