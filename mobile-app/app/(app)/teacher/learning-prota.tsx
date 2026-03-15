import { TeacherLearningResourceProgramScreen } from '../../../src/features/learningResources/TeacherLearningResourceProgramScreen';

export default function TeacherLearningProtaScreen() {
  return (
    <TeacherLearningResourceProgramScreen
      programCode="PROTA"
      fallbackTitle="Program Tahunan"
      fallbackDescription="Kelola distribusi capaian pembelajaran dalam satu tahun ajaran."
      icon="calendar"
    />
  );
}
