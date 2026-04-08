function normalizeTeacherExamEditorRoute(route: string): string | null {
  const trimmed = String(route || '').trim();
  if (!trimmed.startsWith('/teacher/exams/')) return null;

  const [pathname, rawQuery = ''] = trimmed.split('?');
  const match = pathname.match(/^\/teacher\/exams\/(\d+)\/edit$/);
  if (!match) return null;

  const packetId = Number(match[1]);
  if (!Number.isFinite(packetId) || packetId <= 0) return null;

  const params = new URLSearchParams(rawQuery);
  const nextParams = new URLSearchParams();
  nextParams.set('packetId', String(packetId));

  const questionId = String(params.get('questionId') || '').trim();
  if (questionId) {
    nextParams.set('questionId', questionId);
    nextParams.set('section', 'QUESTIONS');
  } else if (String(params.get('section') || '').trim()) {
    nextParams.set('section', String(params.get('section') || '').trim().toUpperCase());
  }

  return `/teacher/exams/editor?${nextParams.toString()}`;
}

export function resolveMobileNotificationTarget(route: unknown): string {
  const rawRoute = typeof route === 'string' ? route.trim() : '';
  if (!rawRoute.startsWith('/')) return '/notifications';
  if (rawRoute.startsWith('/web-module/')) return '/notifications';

  const teacherExamEditorTarget = normalizeTeacherExamEditorRoute(rawRoute);
  if (teacherExamEditorTarget) return teacherExamEditorTarget;

  return rawRoute;
}
