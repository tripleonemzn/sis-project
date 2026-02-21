let isInstalled = false;

export function installMobileWebRedirectGuard() {
  if (isInstalled) return;
  // Keep this initialization hook for backward compatibility.
  // Internal web fallbacks are now allowed to preserve functional parity.
  isInstalled = true;
}
