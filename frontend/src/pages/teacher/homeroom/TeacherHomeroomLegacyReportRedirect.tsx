import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';
import { examProgramCodeToSlug, examService, type ExamProgram } from '../../../services/exam.service';

interface TeacherHomeroomLegacyReportRedirectProps {
  hint: LegacyRedirectHint;
}

function normalizeComponentType(raw: unknown): string {
  return String(raw || '').trim().toUpperCase();
}

function isMidtermAliasCode(raw: unknown): boolean {
  const code = normalizeComponentType(raw);
  if (!code) return false;
  if (['MIDTERM', 'SBTS', 'PTS', 'UTS'].includes(code)) return true;
  return code.includes('MIDTERM');
}

function isFinalEvenAliasCode(raw: unknown): boolean {
  const code = normalizeComponentType(raw);
  if (!code) return false;
  if (['SAT', 'PAT', 'PSAT', 'FINAL_EVEN'].includes(code)) return true;
  return code.includes('EVEN');
}

function isFinalOddAliasCode(raw: unknown): boolean {
  const code = normalizeComponentType(raw);
  if (!code) return false;
  if (['SAS', 'PAS', 'PSAS', 'FINAL_ODD'].includes(code)) return true;
  return code.includes('ODD');
}

function isFinalAliasCode(raw: unknown): boolean {
  const code = normalizeComponentType(raw);
  if (!code) return false;
  if (['FINAL', 'SAS', 'SAT', 'PAS', 'PAT', 'PSAS', 'PSAT', 'FINAL_EVEN', 'FINAL_ODD'].includes(code)) {
    return true;
  }
  return code.includes('FINAL');
}

type LegacyRedirectHint = 'MIDTERM' | 'FINAL_ODD' | 'FINAL_EVEN';

function matchProgramHint(
  program: ExamProgram,
  hint: LegacyRedirectHint,
  strictSemester: boolean,
): boolean {
  const componentType = normalizeComponentType(
    program.gradeComponentTypeCode || program.gradeComponentType,
  );
  const baseType = normalizeComponentType(program.baseTypeCode || program.baseType);
  const fixedSemester = String(program.fixedSemester || '')
    .trim()
    .toUpperCase();

  if (hint === 'MIDTERM') {
    return isMidtermAliasCode(componentType) || isMidtermAliasCode(baseType);
  }
  if (hint === 'FINAL_EVEN') {
    if (!isFinalAliasCode(componentType) && !isFinalAliasCode(baseType)) return false;
    if (!strictSemester) return true;
    return fixedSemester === 'EVEN' || isFinalEvenAliasCode(baseType);
  }
  if (!isFinalAliasCode(componentType) && !isFinalAliasCode(baseType)) return false;
  if (!strictSemester) return true;
  return fixedSemester === 'ODD' || isFinalOddAliasCode(baseType);
}

export const TeacherHomeroomLegacyReportRedirect = ({
  hint,
}: TeacherHomeroomLegacyReportRedirectProps) => {
  const { data: activeAcademicYear, isLoading: isLoadingActiveYear } = useActiveAcademicYear();

  const examProgramsQuery = useQuery({
    queryKey: ['teacher-homeroom-legacy-programs', activeAcademicYear?.id],
    enabled: Boolean(activeAcademicYear?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      examService.getPrograms({
        academicYearId: activeAcademicYear?.id,
        roleContext: 'teacher',
      }),
  });

  if (isLoadingActiveYear || examProgramsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[260px]">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
      </div>
    );
  }

  const programs = (examProgramsQuery.data?.data?.programs || [])
    .filter((program: ExamProgram) => program?.isActive && program?.showOnTeacherMenu)
    .sort((a: ExamProgram, b: ExamProgram) => Number(a.order || 0) - Number(b.order || 0));

  const strictMatch = programs.find((program) =>
    matchProgramHint(program, hint, true),
  );
  const relaxedMatch = programs.find((program) =>
    matchProgramHint(program, hint, false),
  );
  const fallback = programs[0] || null;
  const targetProgram = strictMatch || relaxedMatch || fallback;

  if (!targetProgram) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700">
        Belum ada Program Ujian rapor aktif untuk rute ini.
      </div>
    );
  }

  const targetSlug = examProgramCodeToSlug(targetProgram.code);
  return <Navigate to={`/teacher/wali-kelas/rapor/program/${targetSlug}`} replace />;
};
