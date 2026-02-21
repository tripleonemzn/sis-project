type RouterLike = {
  push: (...args: any[]) => void;
};

type OpenWebModuleRouteParams = {
  moduleKey?: string | null;
  webPath: string;
  label?: string | null;
};

function normalizeWebPath(path: string) {
  const trimmed = String(path || '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function openWebModuleRoute(router: RouterLike, params: OpenWebModuleRouteParams) {
  const rawPath = String(params.webPath || '').trim();
  const isAbsoluteUrl = /^https?:\/\//i.test(rawPath);
  const webPath = isAbsoluteUrl ? rawPath : normalizeWebPath(rawPath);
  if (!webPath) return;

  const moduleKey = String(params.moduleKey || '').trim() || 'web-fallback';
  const label = String(params.label || '').trim();

  router.push({
    pathname: '/web-module/[moduleKey]',
    params: {
      moduleKey,
      ...(isAbsoluteUrl ? { url: webPath } : { path: webPath }),
      ...(label ? { label } : {}),
    },
  } as never);
}
