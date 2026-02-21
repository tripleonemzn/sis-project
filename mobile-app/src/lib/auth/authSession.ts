type UnauthorizedHandler = (reason: string) => Promise<void> | void;

let onUnauthorized: UnauthorizedHandler | null = null;

export const authSession = {
  setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
    onUnauthorized = handler;
  },
  async notifyUnauthorized(reason: string) {
    if (onUnauthorized) {
      await onUnauthorized(reason);
    }
  },
};

