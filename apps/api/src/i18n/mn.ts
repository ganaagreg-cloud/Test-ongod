// All user-facing API text (error messages, emails) in Mongolian.

export const mn = {
  errors: {
    NOT_FOUND: 'Хайсан зүйл олдсонгүй.',
    VALIDATION_ERROR: 'Оруулсан мэдээлэл буруу байна.',
    UNAUTHORIZED: 'Нэвтрэх шаардлагатай.',
    FORBIDDEN: 'Энэ үйлдлийг хийх эрхгүй байна.',
    RATE_LIMITED: 'Хэт олон хүсэлт илгээлээ. Түр хүлээгээд дахин оролдоно уу.',
    BAD_REQUEST: 'Хүсэлт буруу байна.',
    SERVICE_UNAVAILABLE: 'Үйлчилгээ түр ажиллахгүй байна.',
    INTERNAL: 'Алдаа гарлаа. Дахин оролдоно уу.',
  },

  email: {
    signature: 'Хүндэтгэсэн,\nОнгод',
    verifyEmail: {
      subject: 'Онгод: имэйл баталгаажуулах код',
      body: (p: { firstName: string; code: string }) =>
        `Сайн байна уу, ${p.firstName}.\n\nТаны баталгаажуулах код: ${p.code}\n\nКод 10 минутын дотор хүчинтэй. Хэрэв та бүртгүүлээгүй бол энэ имэйлийг үл тоомсорлоно уу.`,
    },
    resetPassword: {
      subject: 'Онгод: нууц үг сэргээх код',
      body: (p: { firstName: string; code: string }) =>
        `Сайн байна уу, ${p.firstName}.\n\nНууц үг сэргээх код: ${p.code}\n\nКод 10 минутын дотор хүчинтэй. Хэрэв та хүсэлт илгээгээгүй бол энэ имэйлийг үл тоомсорлоно уу.`,
    },
    changeEmail: {
      subject: 'Онгод: шинэ имэйл баталгаажуулах',
      body: (p: { firstName: string; code: string }) =>
        `Сайн байна уу, ${p.firstName}.\n\nШинэ имэйл хаягаа баталгаажуулах код: ${p.code}\n\nКод 10 минутын дотор хүчинтэй.`,
    },
    paymentApproved: {
      subject: 'Онгод: таны эрх идэвхжлээ',
      body: (p: { firstName: string; endsAt: string }) =>
        `Сайн байна уу, ${p.firstName}.\n\nТаны төлбөр баталгаажиж, эрх идэвхжлээ. Эрх ${p.endsAt} хүртэл хүчинтэй.`,
    },
    paymentRejected: {
      subject: 'Онгод: төлбөр баталгаажсангүй',
      body: (p: { firstName: string; reason: string }) =>
        `Сайн байна уу, ${p.firstName}.\n\nТаны төлбөрийн хүсэлт баталгаажсангүй.\nШалтгаан: ${p.reason}`,
    },
    accessEnding: {
      subject: 'Онгод: эрх дуусах гэж байна',
      body: (p: { firstName: string; endsAt: string }) =>
        `Сайн байна уу, ${p.firstName}.\n\nТаны эрх ${p.endsAt}-нд дуусна.`,
    },
  },
} as const;
