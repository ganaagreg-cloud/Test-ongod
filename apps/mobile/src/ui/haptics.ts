import * as Haptics from 'expo-haptics';

// DESIGN.md "Motion": light impact on tab change, play/pause, save, chip select; success when
// access turns active; error on a wrong code. Never throws (web and simulators have no motor).
const run = (fn: () => Promise<void>) => {
  try {
    void fn().catch(() => undefined);
  } catch {
    // no haptics on this device
  }
};

export const haptic = {
  light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
