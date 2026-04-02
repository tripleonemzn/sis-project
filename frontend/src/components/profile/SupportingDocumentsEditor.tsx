import { useMemo, useState } from 'react';
import { FilePlus2, PencilLine, Plus, Trash2, UploadCloud, X } from 'lucide-react';
import {
  buildSupportingDocumentItems,
  removeSupportingDocumentAt,
  SUPPORTING_DOCUMENT_CATEGORY,
  type SupportingDocumentItem,
  type SupportingDocumentRecord,
  upsertSupportingDocument,
} from '../../features/profileDocuments/supportingDocuments';

type UploadedDocumentResult = {
  fileUrl: string;
  title?: string;
  category?: string;
};

type SupportingDocumentsEditorProps = {
  documents: SupportingDocumentRecord[];
  canUpload: boolean;
  onUploadDocument: (file: File) => Promise<UploadedDocumentResult>;
  onSaveDocuments: (nextDocuments: SupportingDocumentRecord[]) => Promise<void>;
};

type DocumentDraft = {
  title: string;
  fileUrl: string;
  index: number | null;
  isDefault: boolean;
  displayName: string;
};

const createDraftFromItem = (item?: SupportingDocumentItem | null): DocumentDraft => ({
  title: item?.title || '',
  fileUrl: item?.fileUrl || '',
  index: item?.index ?? null,
  isDefault: Boolean(item?.isDefault),
  displayName: item?.title || '',
});

export function SupportingDocumentsEditor({
  documents,
  canUpload,
  onUploadDocument,
  onSaveDocuments,
}: SupportingDocumentsEditorProps) {
  const { defaultItems, customItems } = useMemo(() => buildSupportingDocumentItems(documents), [documents]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draft, setDraft] = useState<DocumentDraft | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftError, setDraftError] = useState('');

  const openCreateModal = () => {
    setDraft(createDraftFromItem());
    setDraftError('');
    setIsUploading(false);
    setIsSaving(false);
    setIsModalOpen(true);
  };

  const openEditModal = (item: SupportingDocumentItem) => {
    setDraft(createDraftFromItem(item));
    setDraftError('');
    setIsUploading(false);
    setIsSaving(false);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setDraft(null);
    setDraftError('');
    setIsUploading(false);
    setIsSaving(false);
  };

  const handleUploadFile = async (file: File) => {
    if (!draft) return;
    setDraftError('');
    setIsUploading(true);
    try {
      const uploaded = await onUploadDocument(file);
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              fileUrl: uploaded.fileUrl,
              displayName: uploaded.title || file.name,
            }
          : prev,
      );
    } catch {
      // Parent already shows feedback.
    } finally {
      setIsUploading(false);
    }
  };

  const persistDocuments = async (nextDocuments: SupportingDocumentRecord[]) => {
    setIsSaving(true);
    try {
      await onSaveDocuments(nextDocuments);
      closeModal();
    } catch {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!draft) return;
    const normalizedTitle = String(draft.title || '').trim();
    if (!draft.isDefault && !normalizedTitle) {
      setDraftError('Judul dokumen pendukung wajib diisi untuk dokumen manual.');
      return;
    }
    if (!String(draft.fileUrl || '').trim()) {
      setDraftError('Unggah file dokumen pendukung terlebih dahulu sebelum disimpan.');
      return;
    }

    const nextDocuments = upsertSupportingDocument({
      documents,
      nextDocument: {
        title: draft.isDefault ? draft.title : normalizedTitle,
        fileUrl: draft.fileUrl,
        category: SUPPORTING_DOCUMENT_CATEGORY,
      },
      index: draft.index,
    });

    await persistDocuments(nextDocuments);
  };

  const handleRemoveItem = async (item: SupportingDocumentItem) => {
    if (item.index == null) return;
    const confirmed = window.confirm(`Hapus dokumen ${item.title} dari daftar dokumen pendukung?`);
    if (!confirmed) return;
    setIsSaving(true);
    try {
      await onSaveDocuments(removeSupportingDocumentAt(documents, item.index));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
        <p className="text-sm font-semibold text-blue-900">Dokumen Pendukung Profil</p>
        <p className="mt-1 text-xs leading-5 text-blue-700">
          Slot utama sudah disiapkan agar user tinggal melengkapi. Format file mendukung PDF, JPG, JPEG, atau PNG
          dengan ukuran maksimal 2MB per file.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {defaultItems.map((item) => {
          const hasFile = Boolean(item.fileUrl);
          return (
            <div key={item.key} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
                  <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                    {hasFile ? 'Sudah diunggah' : 'Belum diunggah'}
                  </p>
                </div>
                <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  hasFile ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {hasFile ? 'Siap' : 'Kosong'}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openEditModal(item)}
                  disabled={!canUpload || isSaving}
                  className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                    !canUpload
                      ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {hasFile ? <PencilLine size={15} /> : <FilePlus2 size={15} />}
                  {hasFile ? 'Edit Dokumen' : 'Lengkapi'}
                </button>
                {hasFile ? (
                  <>
                    <a
                      href={item.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Lihat File
                    </a>
                    <button
                      type="button"
                      onClick={() => void handleRemoveItem(item)}
                      disabled={isSaving}
                      className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
                    >
                      <Trash2 size={15} />
                      Hapus
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Dokumen Tambahan Manual</p>
            <p className="mt-1 text-sm text-slate-500">
              Tambahkan sertifikat, surat tugas, atau dokumen pendukung lain sesuai kebutuhan profil.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            disabled={!canUpload || isSaving}
            className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              !canUpload
                ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                : 'bg-blue-600 text-white shadow-[0_16px_30px_rgba(37,99,235,0.18)] hover:bg-blue-700'
            }`}
          >
            <Plus size={16} />
            Tambah Dokumen Pendukung
          </button>
        </div>

        {customItems.length > 0 ? (
          <div className="mt-4 space-y-3">
            {customItems.map((item) => (
              <div key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(item)}
                      disabled={isSaving}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <PencilLine size={15} />
                      Edit
                    </button>
                    <a
                      href={item.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Lihat File
                    </a>
                    <button
                      type="button"
                      onClick={() => void handleRemoveItem(item)}
                      disabled={isSaving}
                      className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
                    >
                      <Trash2 size={15} />
                      Hapus
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-5 py-6 text-center">
            <p className="text-sm font-semibold text-slate-900">Belum ada dokumen tambahan</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Gunakan tombol <span className="font-semibold text-slate-700">Tambah Dokumen Pendukung</span> jika user
              ingin menambahkan sertifikat atau dokumen lain di luar slot utama.
            </p>
          </div>
        )}
      </div>

      {isModalOpen && draft ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_30px_80px_rgba(15,23,42,0.18)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
                  Dokumen Pendukung
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">
                  {draft.index == null ? 'Tambah dokumen pendukung' : 'Edit dokumen pendukung'}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Lengkapi slot dokumen utama atau tambahkan dokumen manual tambahan sesuai kebutuhan profil.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Tutup modal dokumen pendukung"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-5">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Judul Dokumen</span>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
                  readOnly={draft.isDefault}
                  placeholder="Contoh: Sertifikat Pelatihan, Surat Tugas, atau dokumen pendukung lain"
                  className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${
                    draft.isDefault
                      ? 'border-slate-200 bg-slate-50 text-slate-600'
                      : 'border-slate-200 bg-white text-slate-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
                  }`}
                />
              </label>

              <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
                <p className="text-sm font-semibold text-slate-900">Upload Dokumen</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Format file: PDF, JPG, JPEG, PNG. Ukuran maksimal 2MB per file.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <label className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                    !canUpload
                      ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                      : 'cursor-pointer bg-blue-600 text-white hover:bg-blue-700'
                  }`}>
                    <UploadCloud size={16} />
                    {isUploading ? 'Mengunggah...' : draft.fileUrl ? 'Ganti File' : 'Upload File'}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="sr-only"
                      disabled={!canUpload || isUploading || isSaving}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void handleUploadFile(file);
                        }
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                  {draft.fileUrl ? (
                    <>
                      <a
                        href={draft.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Lihat File
                      </a>
                      <button
                        type="button"
                        onClick={() => setDraft((prev) => (prev ? { ...prev, fileUrl: '', displayName: '' } : prev))}
                        className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
                      >
                        <Trash2 size={15} />
                        Hapus File
                      </button>
                    </>
                  ) : null}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {draft.displayName || draft.title || 'Belum ada file terunggah'}
                </p>
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
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void handleSaveDraft()}
                disabled={isSaving}
                className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(37,99,235,0.2)] transition hover:bg-blue-700 disabled:opacity-60"
              >
                {isSaving ? 'Menyimpan...' : 'Simpan Dokumen Pendukung'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
