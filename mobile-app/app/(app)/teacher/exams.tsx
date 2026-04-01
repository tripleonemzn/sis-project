import { useLocalSearchParams } from 'expo-router';
import { TeacherExamPacketsModuleScreen } from '../../../src/features/exams/TeacherExamPacketsModuleScreen';

export default function TeacherExamPacketsScreen() {
  const params = useLocalSearchParams<{ programCode?: string | string[]; type?: string | string[] }>();
  const programCode = Array.isArray(params.programCode) ? params.programCode[0] : params.programCode;
  const type = Array.isArray(params.type) ? params.type[0] : params.type;

  return (
    <TeacherExamPacketsModuleScreen
      title="Program Ujian"
      subtitle="Kelola paket soal berdasarkan program ujian untuk kelas dan mata pelajaran yang Anda ampu."
      fixedType={type || undefined}
      fixedProgramCode={programCode || undefined}
    />
  );
}
