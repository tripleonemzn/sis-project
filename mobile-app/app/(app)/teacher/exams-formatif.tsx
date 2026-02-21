import { TeacherExamPacketsModuleScreen } from '../../../src/features/exams/TeacherExamPacketsModuleScreen';

export default function TeacherExamFormatifScreen() {
  return (
    <TeacherExamPacketsModuleScreen
      title="Ujian Formatif"
      subtitle="Kelola packet ujian formatif untuk kelas dan mata pelajaran yang Anda ampu."
      fixedType="FORMATIF"
      defaultType="FORMATIF"
    />
  );
}
