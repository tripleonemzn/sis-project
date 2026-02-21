import { TeacherExamPacketsModuleScreen } from '../../../src/features/exams/TeacherExamPacketsModuleScreen';

export default function TeacherExamSatScreen() {
  return (
    <TeacherExamPacketsModuleScreen
      title="Ujian SAT"
      subtitle="Kelola packet ujian SAT untuk kelas dan mata pelajaran yang Anda ampu."
      fixedType="SAT"
      defaultType="SAT"
    />
  );
}
