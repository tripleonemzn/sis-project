import {
  getAllowedDocumentKindsForLevel,
  getEducationDocumentLabel,
  getEducationInstitutionLabel,
  getEducationLevelLabel,
  levelUsesHigherEducationFields,
  type ProfileEducationDocumentKind,
  type ProfileEducationHistory,
  type ProfileEducationLevel,
  type ProfileEducationTrack,
} from '../../features/profileEducation/profileEducation';

type ProfileEducationEditorProps = {
  track: ProfileEducationTrack;
  histories: ProfileEducationHistory[];
  uploadingKey?: string | null;
  onHistoryChange: (
    level: ProfileEducationLevel,
    field: 'institutionName' | 'faculty' | 'studyProgram' | 'gpa' | 'degree',
    value: string,
  ) => void;
  onUploadDocument: (level: ProfileEducationLevel, kind: ProfileEducationDocumentKind, file: File) => void | Promise<void>;
  onRemoveDocument: (level: ProfileEducationLevel, kind: ProfileEducationDocumentKind) => void;
};

export function ProfileEducationEditor({
  track,
  histories,
  uploadingKey,
  onHistoryChange,
  onUploadDocument,
  onRemoveDocument,
}: ProfileEducationEditorProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
        <p className="text-sm font-semibold text-blue-900">Ketentuan Upload Riwayat Pendidikan</p>
        <p className="mt-1 text-xs leading-5 text-blue-700">
          Setiap dokumen hanya menerima format PDF, JPG, JPEG, atau PNG dengan ukuran maksimal 500KB.
          Jika file tidak sesuai, sistem akan menampilkan peringatan yang jelas sebelum upload dilanjutkan.
        </p>
      </div>

      {histories.map((history) => {
        const higherEducationFields = levelUsesHigherEducationFields(history.level);
        const documentKinds = getAllowedDocumentKindsForLevel(track, history.level);

        return (
          <div key={history.level} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 xl:grid-cols-2">
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">Jenjang</span>
                <input
                  value={getEducationLevelLabel(history.level)}
                  readOnly
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">
                  {getEducationInstitutionLabel(history.level)}
                </span>
                <input
                  value={history.institutionName}
                  onChange={(event) => onHistoryChange(history.level, 'institutionName', event.target.value)}
                  placeholder={
                    higherEducationFields ? 'Masukkan nama perguruan tinggi' : 'Masukkan nama sekolah'
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              {higherEducationFields ? (
                <>
                  <label className="block">
                    <span className="block text-sm font-medium text-gray-700 mb-1">Fakultas</span>
                    <input
                      value={history.faculty}
                      onChange={(event) => onHistoryChange(history.level, 'faculty', event.target.value)}
                      placeholder="Masukkan nama fakultas"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-sm font-medium text-gray-700 mb-1">Program Studi/Jurusan</span>
                    <input
                      value={history.studyProgram}
                      onChange={(event) => onHistoryChange(history.level, 'studyProgram', event.target.value)}
                      placeholder="Masukkan program studi atau jurusan"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-sm font-medium text-gray-700 mb-1">IPK</span>
                    <input
                      value={history.gpa}
                      onChange={(event) => onHistoryChange(history.level, 'gpa', event.target.value)}
                      placeholder="Contoh: 3.72"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-sm font-medium text-gray-700 mb-1">Gelar Akademik</span>
                    <input
                      value={history.degree}
                      onChange={(event) => onHistoryChange(history.level, 'degree', event.target.value)}
                      placeholder="Contoh: S.Kom., S.Pd., M.M."
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                </>
              ) : null}
            </div>

            <div className="mt-5">
              <p className="text-sm font-semibold text-slate-900">Upload Dokumen</p>
              <p className="mt-1 text-xs text-slate-500">
                Format file: PDF, JPG, JPEG, PNG. Ukuran maksimal 500KB per file.
              </p>
              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                {documentKinds.map((kind) => {
                  const document = history.documents.find((item) => item.kind === kind);
                  const slotKey = `${history.level}:${kind}`;
                  const isUploading = uploadingKey === slotKey;

                  return (
                    <div key={kind} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                      <p className="text-sm font-semibold text-slate-800">{getEducationDocumentLabel(kind)}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <label className="inline-flex cursor-pointer items-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
                          {isUploading ? 'Mengunggah...' : document ? 'Ganti File' : 'Upload File'}
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="sr-only"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) {
                                void onUploadDocument(history.level, kind, file);
                              }
                              event.currentTarget.value = '';
                            }}
                            disabled={isUploading}
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
                              onClick={() => onRemoveDocument(history.level, kind)}
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
          </div>
        );
      })}
    </div>
  );
}
