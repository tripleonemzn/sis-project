import { useLocalSearchParams } from 'expo-router';
import { TeacherExamPacketsModuleScreen } from '../../../src/features/exams/TeacherExamPacketsModuleScreen';

export default function TeacherExamPacketsScreen() {
  const params = useLocalSearchParams<{ programCode?: string | string[] }>();
  const programCode = Array.isArray(params.programCode) ? params.programCode[0] : params.programCode;

  return (
    <TeacherExamPacketsModuleScreen
      title="Daftar Ujian"
      subtitle="Bank ujian berdasarkan kelas dan mata pelajaran yang Anda ampu."
      fixedProgramCode={programCode || undefined}
    />
  );
}
