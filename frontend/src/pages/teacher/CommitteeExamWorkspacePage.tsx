import { useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Briefcase, Loader2 } from 'lucide-react';
import ExamManagementHubPage from './wakasek/ExamManagementHubPage';
import { committeeService } from '../../services/committee.service';

function buildWorkspaceDescription(params: {
  assignmentRole: string;
  programLabel?: string | null;
  title: string;
}) {
  const roleLabel = String(params.assignmentRole || '').trim() || 'Anggota Panitia';
  const programLabel = String(params.programLabel || '').trim();
  if (programLabel) {
    return `${roleLabel} untuk ${params.title}. Workspace ini otomatis terkunci ke program ${programLabel}.`;
  }
  return `${roleLabel} untuk ${params.title}. Workspace ini hanya menampilkan fitur yang di-grant pada assignment panitia Anda.`;
}

export default function CommitteeExamWorkspacePage() {
  const params = useParams<{ eventId?: string }>();
  const eventId = Number(params.eventId || 0);

  const workspaceQuery = useQuery({
    queryKey: ['committee-workspace', eventId],
    queryFn: () => committeeService.getWorkspace(eventId),
    enabled: eventId > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const workspace = workspaceQuery.data?.data;
  const allowedSections = useMemo(
    () => Array.from(new Set((workspace?.allowedFeatures || []).map((feature) => feature.section))),
    [workspace?.allowedFeatures],
  );

  if (!eventId) {
    return <Navigate to="/teacher/committees" replace />;
  }

  if (workspaceQuery.isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          Memuat workspace kepanitiaan...
        </div>
      </div>
    );
  }

  if (workspaceQuery.isError || !workspace) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-white p-8 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-600" />
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Workspace panitia belum tersedia</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Assignment panitia Anda belum aktif atau akses workspace ini tidak ditemukan.
            </p>
            <Link
              to="/teacher/committees"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Briefcase className="h-4 w-4" />
              Kembali ke Kegiatan Panitia
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (allowedSections.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{workspace.label}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Assignment panitia Anda sudah aktif, tetapi belum memiliki feature grant yang bisa dibuka.
            </p>
            <Link
              to="/teacher/committees"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Briefcase className="h-4 w-4" />
              Kembali ke Kegiatan Panitia
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ExamManagementHubPage
      title={workspace.label}
      description={buildWorkspaceDescription({
        assignmentRole: workspace.assignmentRole,
        programLabel: workspace.programLabel,
        title: workspace.title,
      })}
      allowedSections={allowedSections}
      forcedProgramCode={workspace.programCode || null}
    />
  );
}
