import { TeacherWorkProgramModuleScreen } from '../../../src/features/workPrograms/TeacherWorkProgramModuleScreen';

export default function TutorWorkProgramScreen() {
  return (
    <TeacherWorkProgramModuleScreen
      mode="OWNER"
      title="Program Kerja"
      subtitle="Kelola program kerja, pengajuan alat, dan LPJ program kerja ekstrakurikuler."
      allowedRoles={['TEACHER', 'EXTRACURRICULAR_TUTOR']}
      forcedDuty="PEMBINA_EKSKUL"
    />
  );
}
