// All user-facing API text (error messages, emails) in Mongolian.

/** "2026-10-08 14:05:09" in Ulaanbaatar time. */
const ulaanbaatarTime = (iso: string) =>
  new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Ulaanbaatar' });

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
    INVALID_CREDENTIALS: 'Нэвтрэх нэр эсвэл нууц үг буруу байна.',
    EMAIL_TAKEN: 'Энэ имэйл хаяг бүртгэлтэй байна.',
    USERNAME_TAKEN: 'Энэ нэвтрэх нэр бүртгэлтэй байна.',
    CODE_INVALID: 'Код буруу байна.',
    CODE_EXPIRED: 'Кодын хугацаа дууссан байна. Шинэ код авна уу.',
    CODE_ATTEMPTS_EXCEEDED: 'Хэт олон удаа буруу оруулсан. Шинэ код авна уу.',
    RESEND_COOLDOWN: 'Шинэ код авахын өмнө түр хүлээнэ үү.',
    DEVICE_LIMIT: 'Нэвтэрсэн төхөөрөмжийн тоо дүүрсэн байна. Нэг төхөөрөмжийг хасна уу.',
    ACCOUNT_DISABLED: 'Таны бүртгэл түр хаагдсан байна.',
    LINK_REQUIRED:
      'Энэ имэйлээр бүртгэл үүссэн байна. Нууц үгээрээ нэвтэрсний дараа Google/Apple-ийг холбоно уу.',
    PROFILE_INCOMPLETE: 'Эхлээд профайлаа бүрэн бөглөнө үү.',
    SOCIAL_TOKEN_INVALID: 'Google/Apple нэвтрэлтийг баталгаажуулж чадсангүй. Дахин оролдоно уу.',
    SOCIAL_EMAIL_REQUIRED: 'Google/Apple-ээс имэйл хаяг ирсэнгүй.',
    IDENTITY_TAKEN: 'Энэ Google/Apple бүртгэл өөр эсвэл ижил хэрэглэгчид холбогдсон байна.',
    LAST_LOGIN_METHOD: 'Нууц үггүй бол сүүлчийн нэвтрэх аргыг салгах боломжгүй.',
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
    errorAlert: {
      subject: 'Онгод: серверт алдаа гарлаа',
      body: (p: {
        kind: 'http' | 'job';
        summary: string;
        requestId?: string;
        occurredAt: string;
        throttleMinutes: number;
      }) =>
        [
          p.kind === 'http' ? 'Хүсэлт боловсруулахад алдаа гарлаа.' : 'Ажил (job) бүтэлгүйтлээ.',
          `Хэзээ: ${ulaanbaatarTime(p.occurredAt)} (Улаанбаатар)`,
          `Дэлгэрэнгүй:\n${p.summary}`,
          p.requestId
            ? `Request ID: ${p.requestId}\nЛог файлаас энэ ID-гаар хайж дэлгэрэнгүйг харна уу.`
            : 'Лог файлаас дэлгэрэнгүйг харна уу.',
          `Ижил алдааны дараагийн мэдэгдэл хамгийн багадаа ${p.throttleMinutes} минутын дараа ирнэ.`,
        ].join('\n\n'),
    },
  },
} as const;
