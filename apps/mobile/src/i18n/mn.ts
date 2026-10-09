// All app text, in Mongolian (CLAUDE.md). The server's own error messages already arrive in
// Mongolian (error.message) and are shown as they are. The apps never show prices, plans, bank
// details or payment buttons (ADR-0006): test/no-payment-text.test.ts guards this file.

export const mn = {
  appName: 'Онгод',
  close: 'Хаах',
  back: 'Буцах',
  audioWebOnly: 'Аудио зөвхөн утсан дээр тоглоно',

  common: {
    loading: 'Ачаалж байна',
    retry: 'Дахин оролдох',
    cancel: 'Болих',
    or: 'эсвэл',
  },

  errors: {
    network: 'Сүлжээний холболт тасарлаа. Холболтоо шалгаад дахин оролдоно уу.',
    generic: 'Алдаа гарлаа. Дахин оролдоно уу.',
    social: 'Нэвтэрч чадсангүй. Дахин оролдоно уу.',
    required: 'Заавал бөглөнө үү.',
    email: 'Имэйл хаяг буруу байна.',
    phone: 'Утасны дугаар буруу байна.',
    username: 'Нэвтрэх нэр буруу байна: 3–30 тэмдэгт (a-z, 0-9, ., _) эсвэл имэйл.',
    password: 'Нууц үг хамгийн багадаа 8 тэмдэгттэй байна.',
    code: 'Кодыг 6 оронтой тоогоор оруулна уу.',
  },

  gate: {
    unreachableTitle: 'Сервертэй холбогдож чадсангүй',
    unreachableText: 'Интернэт холболтоо шалгаад дахин оролдоно уу.',
    apiMissingTitle: 'API хаяг тохируулаагүй',
    apiMissingText: 'apps/mobile/.env файлд EXPO_PUBLIC_API_URL-г бичээд аппыг дахин ачаална уу.',
    errorTitle: 'Алдаа гарлаа',
    errorText: 'Апп-д гэнэтийн алдаа гарлаа. Дахин оролдоно уу.',
  },

  update: {
    title: 'Шинэчлэлт шаардлагатай',
    text: 'Апп-ын шинэ хувилбар гарсан байна. Үргэлжлүүлэхийн тулд апп-аа шинэчилнэ үү.',
    open: 'Дэлгүүр нээх',
  },

  /** Legal pages on the portal; shown only when EXPO_PUBLIC_PORTAL_URL is set. */
  legal: {
    terms: 'Үйлчилгээний нөхцөл',
    privacy: 'Нууцлалын бодлого',
    /** "Үргэлжлүүлснээр Үйлчилгээний нөхцөл-ийг зөвшөөрнө." (the middle part is the link) */
    agreeBefore: 'Үргэлжлүүлснээр ',
    agreeAfter: '-ийг зөвшөөрнө.',
  },

  welcome: {
    subtitle: 'Гишүүдэд зориулсан хаалттай аудио сан. Сонсож, өсөж, өөрийгөө нээ.',
    login: 'Нэвтрэх',
    register: 'Бүртгүүлэх',
  },

  login: {
    title: 'Нэвтрэх',
    identifier: 'Имэйл эсвэл нэвтрэх нэр',
    password: 'Нууц үг',
    submit: 'Нэвтрэх',
    forgot: 'Нууц үгээ мартсан уу?',
    noAccount: 'Бүртгэлгүй юу?',
    register: 'Бүртгүүлэх',
    verified: 'Имэйл баталгаажлаа. Одоо нэвтэрч болно.',
    passwordReset: 'Нууц үг солигдлоо. Шинэ нууц үгээрээ нэвтэрнэ үү.',
  },

  social: {
    google: 'Google-ээр нэвтрэх',
    appleLabel: 'Apple-ээр нэвтрэх',
  },

  register: {
    title: 'Бүртгүүлэх',
    lastName: 'Овог',
    firstName: 'Нэр',
    phone: 'Утасны дугаар',
    email: 'Имэйл',
    username: 'Нэвтрэх нэр (заавал биш)',
    usernameHint: 'Хоосон орхивол имэйл хаяг нэвтрэх нэр болно.',
    password: 'Нууц үг',
    passwordHint: 'Хамгийн багадаа 8 тэмдэгт.',
    submit: 'Бүртгүүлэх',
    haveAccount: 'Бүртгэлтэй юу?',
    login: 'Нэвтрэх',
  },

  verify: {
    title: 'Имэйлээ баталгаажуулна уу',
    text: (email: string) => `${email} хаяг руу 6 оронтой код илгээлээ. Код 10 минут хүчинтэй.`,
    code: 'Баталгаажуулах код',
    submit: 'Баталгаажуулах',
    noCode: 'Код ирээгүй юу?',
    resend: 'Код дахин илгээх',
    resendIn: (seconds: number) => `Шинэ код авахад ${seconds} секунд`,
    resent: 'Шинэ код илгээлээ.',
  },

  forgot: {
    title: 'Нууц үг сэргээх',
    text: 'Бүртгэлтэй имэйл хаягаа оруулна уу. Сэргээх код илгээнэ.',
    email: 'Имэйл',
    submit: 'Код илгээх',
    sent: 'Хэрэв энэ имэйл бүртгэлтэй бол сэргээх код очсон байна.',
    haveCode: 'Кодтой болсон',
  },

  reset: {
    title: 'Шинэ нууц үг',
    email: 'Имэйл',
    code: 'Сэргээх код',
    newPassword: 'Шинэ нууц үг',
    submit: 'Нууц үг солих',
  },

  deviceLimit: {
    title: 'Төхөөрөмжийн хязгаар хэтэрсэн',
    text: 'Нэг бүртгэлээр хамгийн ихдээ 2 төхөөрөмжөөс нэвтэрнэ. Нэгийг нь хасаад нэвтэрнэ үү.',
    remove: 'Хасаад нэвтрэх',
    lastSeen: (date: string) => `Сүүлд: ${date}`,
    platformIos: 'iPhone',
    platformAndroid: 'Android',
    platformWeb: 'Вэб',
  },

  completeProfile: {
    title: 'Профайлаа гүйцээнэ үү',
    text: 'Үргэлжлүүлэхийн өмнө мэдээллээ бөглөнө үү.',
    username: 'Нэвтрэх нэр',
    password: 'Нууц үг',
    passwordHint: 'Имэйлээр нэвтрэхэд хэрэглэнэ. Хамгийн багадаа 8 тэмдэгт.',
    lastName: 'Овог',
    firstName: 'Нэр',
    phone: 'Утасны дугаар',
    submit: 'Хадгалах',
    otherAccount: 'Өөр бүртгэлээр нэвтрэх',
  },

  home: {
    title: 'Нүүр',
    greeting: (name: string) => `Сайн байна уу, ${name}`,
    soon: 'Сан удахгүй энд нээгдэнэ.',
    logout: 'Гарах',
  },
} as const;
