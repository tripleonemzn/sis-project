import { Alert, type AlertButton, type AlertOptions } from 'react-native';

export type AppAlertButton = AlertButton;

export type AppAlertPayload = {
  title?: string;
  message?: string;
  buttons?: AppAlertButton[];
  options?: AlertOptions;
};

type AppAlertListener = (payload: AppAlertPayload) => void;

const listeners = new Set<AppAlertListener>();
const pendingQueue: AppAlertPayload[] = [];
const originalAlert = Alert.alert.bind(Alert);
let isInstalled = false;

export function subscribeAppAlert(listener: AppAlertListener) {
  listeners.add(listener);
  if (pendingQueue.length > 0) {
    const buffered = pendingQueue.splice(0, pendingQueue.length);
    buffered.forEach((payload) => {
      listener(payload);
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

export function showAppAlert(payload: AppAlertPayload) {
  if (listeners.size === 0) {
    pendingQueue.push(payload);
    return true;
  }
  let delivered = false;
  for (const listener of listeners) {
    delivered = true;
    listener(payload);
  }
  return delivered;
}

export function installAppAlertOverride() {
  if (isInstalled) return;
  isInstalled = true;

  (Alert as typeof Alert).alert = (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions,
  ) => {
    const payload: AppAlertPayload = {
      title,
      message,
      buttons: buttons?.length ? buttons : [{ text: 'OK' }],
      options,
    };

    if (!showAppAlert(payload)) {
      originalAlert(title, message, buttons, options);
    }
  };
}
