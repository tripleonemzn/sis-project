import { TeacherExamPacketsModuleScreen } from '../../../src/features/exams/TeacherExamPacketsModuleScreen';

export default function TeacherExamSbtsScreen() {
  return (
    <TeacherExamPacketsModuleScreen
      title="Ujian SBTS"
      subtitle="Kelola packet ujian SBTS untuk kelas dan mata pelajaran yang Anda ampu."
      fixedType="SBTS"
      defaultType="SBTS"
    />
  );
}
