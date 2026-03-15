import { TeacherLearningResourceProgramScreen } from '../../../src/features/learningResources/TeacherLearningResourceProgramScreen';

export default function TeacherLearningMatriksSebaranScreen() {
  return (
    <TeacherLearningResourceProgramScreen
      programCode="MATRIKS_SEBARAN"
      fallbackTitle="Matriks Sebaran"
      fallbackDescription="Kelola peta sebaran materi, asesmen, dan target pembelajaran lintas semester."
      icon="grid"
    />
  );
}
