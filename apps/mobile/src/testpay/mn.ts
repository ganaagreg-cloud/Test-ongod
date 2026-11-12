// ADR-0083: text of the flagged payment test flow. Only imported when EXPO_PUBLIC_MOBILE_PAYMENTS=1.
export const payMn = {
  open: 'Эрх авах',
  title: 'Эрх авах',
  intro: 'Багцаа сонгоно уу. Төлбөр баталгаажмагц бүх дугаар нээгдэнэ.',
  pay: (amount: string) => `QPay-ээр төлөх · ${amount}`,
  note: 'Төлбөрийн хуудаснаас банкны аппаа сонгоно. Эрх автоматаар сунгагдахгүй.',
  days: (n: number) => `${n} өдөр`,
  amount: (n: number) => `${n.toLocaleString('en-US')}₮`,
  closed: 'Төлбөр түр хаалттай байна.',
  waiting: 'Төлбөр хүлээж байна…',
  waitingText: 'Банкны аппаар төлсний дараа энд автоматаар идэвхжинэ.',
  reopen: 'Төлбөрийн хуудсыг дахин нээх',
  done: 'Эрх идэвхжлээ',
  back: 'Буцах',
  failed: 'Төлбөр эхлүүлж чадсангүй. Дахин оролдоно уу.',
} as const;
