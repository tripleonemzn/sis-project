import { useEffect, useMemo, useState } from 'react';

export type ParentSignatureCandidate = {
  key?: string;
  label?: string;
  name?: string;
};

type ReportWithParentSignature = {
  header?: {
    studentName?: string;
  };
  footer: {
    signatures: {
      parent: {
        title?: string;
        name?: string;
        candidates?: ParentSignatureCandidate[];
      };
    };
  };
};

const normalizeText = (value: unknown) => String(value ?? '').trim();

export function getParentSignatureCandidates(reportData: ReportWithParentSignature | null) {
  const parent = reportData?.footer?.signatures?.parent;
  const seen = new Set<string>();
  const fromCandidates = Array.isArray(parent?.candidates) ? parent.candidates : [];
  const normalizedCandidates = fromCandidates
    .map((candidate, index) => ({
      key: normalizeText(candidate.key) || `candidate-${index}`,
      label: normalizeText(candidate.label) || 'Orang Tua / Wali',
      name: normalizeText(candidate.name),
    }))
    .filter((candidate) => {
      if (!candidate.name) return false;
      const dedupeKey = candidate.name.toLowerCase();
      if (seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    });

  const currentName = normalizeText(parent?.name);
  if (currentName && !seen.has(currentName.toLowerCase()) && !currentName.includes('....')) {
    normalizedCandidates.unshift({
      key: 'current',
      label: normalizeText(parent?.title) || 'Orang Tua / Wali',
      name: currentName,
    });
  }

  return normalizedCandidates;
}

export function shouldChooseParentSignature(reportData: ReportWithParentSignature | null) {
  return getParentSignatureCandidates(reportData).length > 1;
}

export function applyParentSignatureName<TReport extends ReportWithParentSignature>(
  reportData: TReport,
  parentName: string,
): TReport {
  return {
    ...reportData,
    footer: {
      ...reportData.footer,
      signatures: {
        ...reportData.footer.signatures,
        parent: {
          ...reportData.footer.signatures.parent,
          name: normalizeText(parentName) || reportData.footer.signatures.parent.name,
        },
      },
    },
  };
}

type ParentSignaturePrintDialogProps<TReport extends ReportWithParentSignature> = {
  reportData: TReport | null;
  reportLabel: string;
  onCancel: () => void;
  onConfirm: (reportData: TReport) => void;
};

export function ParentSignaturePrintDialog<TReport extends ReportWithParentSignature>({
  reportData,
  reportLabel,
  onCancel,
  onConfirm,
}: ParentSignaturePrintDialogProps<TReport>) {
  const candidates = useMemo(() => getParentSignatureCandidates(reportData), [reportData]);
  const [selectedKey, setSelectedKey] = useState('');
  const [manualName, setManualName] = useState('');

  useEffect(() => {
    const firstCandidate = candidates[0];
    setSelectedKey(firstCandidate?.key || 'manual');
    setManualName(firstCandidate?.name || normalizeText(reportData?.footer?.signatures?.parent?.name));
  }, [candidates, reportData]);

  if (!reportData) return null;

  const selectedCandidate = candidates.find((candidate) => candidate.key === selectedKey);
  const resolvedName = normalizeText(selectedCandidate?.name || manualName);
  const studentName = normalizeText(reportData.header?.studentName) || 'siswa ini';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 px-4 py-6 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="parent-signature-title"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
            Cetak Rapor {reportLabel}
          </p>
          <h2 id="parent-signature-title" className="mt-1 text-lg font-bold text-slate-900">
            Pilih Tanda Tangan Orang Tua/Wali
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Pilih nama yang akan dicetak untuk {studentName}. Ini membantu saat tanda tangan tidak memakai nama ayah.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Sumber nama</span>
            <select
              value={selectedKey}
              onChange={(event) => {
                const nextKey = event.target.value;
                setSelectedKey(nextKey);
                const nextCandidate = candidates.find((candidate) => candidate.key === nextKey);
                setManualName(nextCandidate?.name || manualName);
              }}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {candidates.map((candidate) => (
                <option key={candidate.key} value={candidate.key}>
                  {candidate.label}: {candidate.name}
                </option>
              ))}
              <option value="manual">Isi manual</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Nama yang dicetak</span>
            <input
              type="text"
              value={manualName}
              onChange={(event) => {
                setSelectedKey('manual');
                setManualName(event.target.value);
              }}
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Nama orang tua/wali"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => onConfirm(applyParentSignatureName(reportData, resolvedName))}
            disabled={!resolvedName}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Lanjut Cetak
          </button>
        </div>
      </div>
    </div>
  );
}
