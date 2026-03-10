import { useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';
import {
  examProgramCodeToSlug,
  examService,
  findExamProgramBySlug,
  type ExamProgram,
} from '../../../services/exam.service';
import { TeacherHomeroomFinalPage } from './TeacherHomeroomFinalPage';
import { TeacherHomeroomSbtsPage } from './TeacherHomeroomSbtsPage';

function normalizeGradeComponentType(raw: unknown): string {
  return String(raw || '').trim().toUpperCase();
}

function isMidtermAliasCode(raw: unknown): boolean {
  const normalized = normalizeGradeComponentType(raw);
  if (!normalized) return false;
  if (['MIDTERM', 'SBTS', 'PTS', 'UTS'].includes(normalized)) return true;
  return normalized.includes('MIDTERM');
}

function isFinalAliasCode(raw: unknown): boolean {
  const normalized = normalizeGradeComponentType(raw);
  if (!normalized) return false;
  if (['FINAL', 'SAS', 'SAT', 'PAS', 'PAT', 'PSAS', 'PSAT'].includes(normalized)) return true;
  return normalized.includes('FINAL');
}

function isFinalEvenAliasCode(raw: unknown): boolean {
  const normalized = normalizeGradeComponentType(raw);
  if (!normalized) return false;
  if (['SAT', 'PAT', 'PSAT', 'FINAL_EVEN'].includes(normalized)) return true;
  return normalized.includes('FINAL_EVEN');
}

function isFinalOddAliasCode(raw: unknown): boolean {
  const normalized = normalizeGradeComponentType(raw);
  if (!normalized) return false;
  if (['SAS', 'PAS', 'PSAS', 'FINAL_ODD'].includes(normalized)) return true;
  return normalized.includes('FINAL_ODD');
}

function resolveProgramComponentMode(program?: ExamProgram | null): 'MIDTERM' | 'FINAL' | '' {
  if (!program) return '';
  const componentType = normalizeGradeComponentType(
    program.gradeComponentTypeCode || program.gradeComponentType,
  );
  if (isMidtermAliasCode(componentType)) return 'MIDTERM';
  if (isFinalAliasCode(componentType)) return 'FINAL';

  const baseType = normalizeGradeComponentType(program.baseTypeCode || program.baseType);
  if (isMidtermAliasCode(baseType)) return 'MIDTERM';
  if (isFinalAliasCode(baseType)) return 'FINAL';
  return '';
}

function resolveProgramBaseReportType(program?: ExamProgram | null): string {
  if (!program) return '';
  const mode = resolveProgramComponentMode(program);
  const fixedSemester = normalizeGradeComponentType(program.fixedSemester);
  const baseType = normalizeGradeComponentType(program.baseTypeCode || program.baseType);

  if (mode === 'MIDTERM') return 'MIDTERM';
  if (mode === 'FINAL') {
    if (fixedSemester === 'EVEN' || isFinalEvenAliasCode(baseType)) return 'FINAL_EVEN';
    if (fixedSemester === 'ODD' || isFinalOddAliasCode(baseType)) return 'FINAL_ODD';
    return 'FINAL_ODD';
  }
  return '';
}

export const TeacherHomeroomProgramPage = () => {
  const { programCode: programSlugParam } = useParams<{ programCode?: string }>();
  const { data: activeAcademicYear, isLoading: isLoadingActiveYear } = useActiveAcademicYear();

  const examProgramsQuery = useQuery({
    queryKey: ['teacher-homeroom-programs', activeAcademicYear?.id],
    enabled: Boolean(activeAcademicYear?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      examService.getPrograms({
        academicYearId: activeAcademicYear?.id,
        roleContext: 'teacher',
      }),
  });

  const reportPrograms = useMemo<ExamProgram[]>(() => {
    const rows = examProgramsQuery.data?.data?.programs || [];
    return rows
      .filter((program: ExamProgram) => {
        if (!program?.isActive || !program?.showOnTeacherMenu) return false;
        return Boolean(resolveProgramComponentMode(program));
      })
      .sort((a: ExamProgram, b: ExamProgram) => Number(a.order || 0) - Number(b.order || 0));
  }, [examProgramsQuery.data?.data?.programs]);

  const selectedProgram = useMemo(() => {
    if (!reportPrograms.length) return null;
    const slug = String(programSlugParam || '').trim().toLowerCase();
    if (slug) {
      const matched = findExamProgramBySlug(reportPrograms, slug);
      if (matched) return matched;
    }
    return reportPrograms[0] || null;
  }, [programSlugParam, reportPrograms]);

  if (isLoadingActiveYear || examProgramsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!reportPrograms.length) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700">
        Belum ada Program Ujian rapor aktif untuk wali kelas. Aktifkan program dengan komponen
        nilai rapor di menu Kelola Ujian.
      </div>
    );
  }

  if (!selectedProgram) {
    const fallbackSlug = examProgramCodeToSlug(reportPrograms[0].code);
    return <Navigate to={`/teacher/wali-kelas/rapor/program/${fallbackSlug}`} replace />;
  }

  const selectedSlug = examProgramCodeToSlug(selectedProgram.code);
  if (programSlugParam && selectedSlug !== String(programSlugParam || '').trim().toLowerCase()) {
    return <Navigate to={`/teacher/wali-kelas/rapor/program/${selectedSlug}`} replace />;
  }

  const gradeComponentType = resolveProgramComponentMode(selectedProgram);
  const fixedSemester = normalizeGradeComponentType(selectedProgram.fixedSemester);
  const resolvedReportTypeForPage = resolveProgramBaseReportType(selectedProgram);

  const sharedProps = {
    programCode: selectedProgram.code,
    programBaseType: resolvedReportTypeForPage,
    programLabel: String(selectedProgram.label || selectedProgram.shortLabel || selectedProgram.code),
  };

  if (isMidtermAliasCode(gradeComponentType)) {
    return (
      <TeacherHomeroomSbtsPage
        {...sharedProps}
        preferenceScope={selectedProgram.code}
      />
    );
  }
  if (isFinalAliasCode(gradeComponentType)) {
    return (
      <TeacherHomeroomFinalPage
        {...sharedProps}
        fixedSemester={
          fixedSemester === 'ODD' || fixedSemester === 'EVEN'
            ? (fixedSemester as 'ODD' | 'EVEN')
            : null
        }
        preferenceScope={selectedProgram.code}
      />
    );
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
      Program ujian {sharedProps.programLabel} belum didukung untuk mode rapor wali kelas
      (tipe komponen: {gradeComponentType || '-'}).
    </div>
  );
};
