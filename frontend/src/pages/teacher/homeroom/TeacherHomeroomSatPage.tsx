import { TeacherHomeroomFinalPage } from './TeacherHomeroomFinalPage';

interface TeacherHomeroomSatPageProps {
  programCode?: string;
  programBaseType?: string;
  programLabel?: string;
}

export const TeacherHomeroomSatPage = (props: TeacherHomeroomSatPageProps) => {
  return (
    <TeacherHomeroomFinalPage
      {...props}
      fixedSemester="EVEN"
      preferenceScope={props.programCode || props.programBaseType || 'FINAL_EVEN'}
    />
  );
};
