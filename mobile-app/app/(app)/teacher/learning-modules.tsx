import { TeacherLearningResourceProgramScreen } from '../../../src/features/learningResources/TeacherLearningResourceProgramScreen';

export default function TeacherLearningModulesScreen() {
  return (
    <TeacherLearningResourceProgramScreen
      programCode="MODUL_AJAR"
      fallbackTitle="Modul Ajar"
      fallbackDescription="Kelola modul ajar per topik untuk implementasi pembelajaran di kelas."
      icon="file-text"
    />
  );
}
