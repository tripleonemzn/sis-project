import { TeacherExamPacketsModuleScreen } from '../../../src/features/exams/TeacherExamPacketsModuleScreen';

export default function TeacherExamBankScreen() {
  return (
    <TeacherExamPacketsModuleScreen
      title="Bank Soal"
      subtitle="Kelola bank soal lintas tipe ujian untuk kelas dan mata pelajaran yang Anda ampu."
      defaultType="ALL"
    />
  );
}
