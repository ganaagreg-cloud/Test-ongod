import { mn } from '../i18n/mn';

/** "2027.10.08" in Ulaanbaatar time; falls back to the date part of the ISO string. */
export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ulaanbaatar' })
      .format(new Date(iso))
      .replaceAll('-', '.');
  } catch {
    return iso.slice(0, 10).replaceAll('-', '.');
  }
}

/** "iPhone 15" / "Android · Pixel 8": how a registered device is named in the device list. */
export function deviceLabel(platform: string, model: string | null): string {
  const name =
    platform === 'ios'
      ? mn.deviceLimit.platformIos
      : platform === 'android'
        ? mn.deviceLimit.platformAndroid
        : mn.deviceLimit.platformWeb;
  return model ? `${name} · ${model}` : name;
}
