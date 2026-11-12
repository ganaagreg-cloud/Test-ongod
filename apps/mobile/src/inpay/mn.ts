// ADR-0076, ADR-0090: every text of the in-app payment and gift screens. This folder is the only
// place in the app where payment words may appear, and its screens exist only while the server
// switch `inAppPayment` is on (test/no-payment-text.test.ts checks both).
import type { GiftStatus } from '@ongod/shared';

const statuses: Record<GiftStatus, string> = {
  PENDING_PAYMENT: 'Төлбөр хүлээж байна',
  PAID: 'Ашиглагдаагүй',
  REDEEMED: 'Ашигласан',
  CANCELLED: 'Цуцалсан',
  EXPIRED: 'Хугацаа дууссан',
  VOID: 'Хүчингүй',
};

export const inpayMn = {
  redeem: {
    row: 'Бэлгийн код оруулах',
    title: 'Бэлгийн код',
    text: 'Бэлгээр авсан 12 тэмдэгттэй кодоо оруулна уу.',
    welcomeTitle: 'Бэлгийн код байгаа юу?',
    welcomeText:
      'Хэн нэгэн танд эрх бэлэглэсэн бол кодоо энд оруулаарай. Байхгүй бол алгасаад дараа нь Профайл хэсгээс оруулж болно.',
    label: 'Код',
    placeholder: 'XXXX-XXXX-XXXX',
    invalid: 'Код 12 тэмдэгттэй байна.',
    submit: 'Идэвхжүүлэх',
    skip: 'Алгасах',
    doneTitle: 'Эрх идэвхжлээ',
    doneText: (date: string) => `${date} хүртэл бүх дугаарыг сонсоорой.`,
    start: 'Эхлэх',
    close: 'Болсон',
  },
  gift: {
    row: 'Эрх бэлэглэх',
    title: 'Эрх бэлэглэх',
    intro:
      'Багцаа сонгоод QPay-ээр төлнө. Төлбөр баталгаажмагц нэг удаа ашиглах код үүснэ. Кодоо бэлэглэх хүндээ өгөөрэй.',
    closed: 'Төлбөр түр хаалттай байна.',
    loadFailed: 'Багцуудыг ачаалж чадсангүй. Дахин оролдоно уу.',
    plan: (name: string, days: number) => `${name} · ${days} өдөр`,
    amount: (mnt: number) => `${mnt.toLocaleString('en-US')}₮`,
    buy: 'Бэлэг авах',
    failed: 'Төлбөр эхлүүлж чадсангүй. Дахин оролдоно уу.',
    mine: 'Миний бэлгүүд',
    empty: 'Одоогоор бэлэг алга.',
    statuses,
    waitingText: 'Банкны аппаар төлсний дараа код энд автоматаар гарч ирнэ.',
    continuePay: 'Төлбөрийн хуудсыг нээх',
    validUntil: (date: string) => `${date} хүртэл хүчинтэй`,
    share: 'Код хуваалцах',
    shareText: (code: string) =>
      `Танд "Зөв үү? Тав уу?" аппын эрх бэлэглэлээ. Апп дээр Профайл → "Бэлгийн код оруулах" хэсэгт энэ кодыг оруулна уу: ${code}`,
  },
} as const;
