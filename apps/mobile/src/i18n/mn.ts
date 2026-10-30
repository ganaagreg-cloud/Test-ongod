// All app text, in Mongolian (CLAUDE.md). The server's own error messages already arrive in
// Mongolian (error.message) and are shown as they are. The apps never show prices, plans, bank
// details or payment buttons (ADR-0006): test/no-payment-text.test.ts guards this file.

export const mn = {
  appName: 'Онгод',
  close: 'Хаах',
  back: 'Буцах',
  audioWebOnly: 'Аудио зөвхөн утсан дээр тоглоно',
  /** Screen-reader name of the video area (video episodes, ADR-0038). */
  videoLabel: 'Видео',

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
    subtitle: 'Гишүүдэд зориулсан хаалттай аудио, видео сан. Сонсож, өсөж, өөрийгөө нээ.',
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

  tabs: {
    label: 'Үндсэн цэс',
    home: 'Нүүр',
    library: 'Сан',
    saved: 'Хадгалсан',
    profile: 'Профайл',
  },

  home: {
    title: 'Нүүр',
    greetingMorning: 'Өглөөний мэнд,',
    greetingDay: 'Өдрийн мэнд,',
    greetingEvening: 'Оройн мэнд,',
    featured: 'Онцлох',
    slide: (n: number) => `${n}-р слайд`,
    continue: 'Үргэлжлүүлэх',
    remaining: (time: string) => `${time} үлдсэн`,
    latest: 'Шинэ',
    all: 'Бүгд',
    categories: 'Сэдвээр сонсох',
    episodeCount: (n: number) => `${n} дугаар`,
    thisWeek: 'Энэ 7 хоногт',
    opensIn: (time: string) => `Нээгдэхэд ${time}`,
    countdownDays: (days: number, time: string) => `${days} өдөр ${time}`,
    /** Sunday first, as Date.getDay() counts. */
    weekdays: ['НЯМ', 'ДАВ', 'МЯГ', 'ЛХА', 'ПҮР', 'БАА', 'БЯМ'],
    emptyTitle: 'Одоогоор дугаар алга',
    emptyText: 'Шинэ дугаар нийтлэгдэхэд энд харагдана.',
  },

  series: {
    part: (n: number) => `${n}-р хэсэг`,
    parts: 'Хэсгүүд',
    emptyTitle: 'Хэсэг алга',
    emptyText: 'Нийтлэгдсэн хэсэг одоогоор алга.',
  },

  playlist: {
    emptyTitle: 'Дугаар алга',
    emptyText: 'Нийтлэгдсэн дугаар одоогоор алга.',
  },

  episode: {
    play: 'Тоглуулах',
    pause: 'Түр зогсоох',
    save: 'Хадгалах',
    unsave: 'Хадгалснаас хасах',
    saved: 'Хадгаллаа',
    unsaved: 'Хадгалснаас хаслаа',
    progress: (percent: number) => `${percent}% сонссон`,
    heard: 'Сонссон',
    loadError: 'Ачаалж чадсангүй. Холболтоо шалгаад дахин оролдоно уу.',
  },

  player: {
    close: 'Хаах',
    back15: '15 секунд ухрах',
    forward15: '15 секунд урагшлах',
    speed: (rate: string) => `Хурд ${rate}`,
    sleep: 'Унтах цаг',
    sleepOff: 'Унтраах',
    sleepMinutes: (minutes: number) => `${minutes} минут`,
    sleepEnd: 'Дугаар дуусахад',
    sleepSet: 'Унтах цаг тавилаа',
    position: 'Байрлал',
    description: 'Тайлбар',
    more: 'Цааш унших',
    less: 'Хураах',
    next: 'Дараагийн',
    nextInSeries: 'Дараагийн хэсэг',
    autoplayIn: (seconds: number) => `Дараагийн дугаар ${seconds} секундын дараа эхэлнэ`,
    autoplayCancel: 'Болих',
    notReady: 'Энэ дугаарын файл бэлэн болоогүй байна.',
    videoUnsupported: 'Энэ төхөөрөмж дээр видео тоглох боломжгүй байна.',
    playError: 'Тоглуулж чадсангүй. Дахин оролдоно уу.',
  },

  /** The no-access sheet (DESIGN: "Эрхээ шалгах" only; no price, no link, no payment text). */
  noAccess: {
    title: 'Таны эрх идэвхгүй байна',
    /** ADR-0044: the one allowed line about the plan; text only, no button, no link. */
    activate: 'Онгод Premium, та багцаа идэвхжүүлнэ үү',
    text: 'Эрх тань идэвхжсэн бол доорх товчийг дарж шинэчилнэ үү.',
    check: 'Эрхээ шалгах',
    checking: 'Шалгаж байна…',
    still: 'Эрх одоогоор идэвхжээгүй байна',
    activeTitle: 'Эрх идэвхжлээ',
    activeText: (date: string) => `${date} хүртэл бүх дугаарыг сонсоорой.`,
    play: 'Тоглуулах',
  },

  library: {
    title: 'Сан',
    search: 'Хайх',
    searchPlaceholder: 'Дугаар, сэдэв хайх',
    all: 'Бүгд',
    sort: 'Эрэмбэ',
    sortNewest: 'Шинэ',
    sortOldest: 'Хуучин',
    sortLongest: 'Урт',
    emptyTitle: 'Илэрц олдсонгүй',
    emptyText: 'Өөр үгээр хайх эсвэл өөр сэдэв сонгоод үзээрэй.',
    clear: 'Шүүлтүүрийг арилгах',
  },

  saved: {
    title: 'Хадгалсан',
    emptyTitle: 'Хадгалсан дугаар алга',
    emptyText: 'Дугаар дээрх тэмдэглэгээг дарж хадгалаарай.',
    browse: 'Сан руу очих',
  },

  profile: {
    title: 'Профайл',
    access: 'Эрх',
    accessActive: (date: string) => `Идэвхтэй · ${date} хүртэл`,
    accessInactive: 'Идэвхгүй',
    daysLeft: (days: number) => `${days} хоног үлдсэн`,
    finished: 'Сонсож дуусгасан',
    hours: 'Сонссон цаг',
    settings: 'Тохиргоо',
    devices: 'Төхөөрөмжүүд',
    blocked: 'Хаасан хэрэглэгчид',
    notifications: 'Мэдэгдэл',
  },

  // Сэтгэгдэл (SPEC L, ADR-0061). No payment wording: the box simply is not there without access.
  comments: {
    title: 'Сэтгэгдэл',
    empty: 'Сэтгэгдэл алга. Эхнийх нь та байж болно.',
    loadError: 'Сэтгэгдлийг ачаалж чадсангүй.',
    loadMore: 'Цааш үзэх',
    write: 'Сэтгэгдэл бичих',
    open: (total: number) => `Сэтгэгдэл, ${total}. Бүгдийг нээх`,
    placeholder: 'Сэтгэгдэл нэмэх...',
    send: 'Илгээх',
    sent: 'Сэтгэгдэл нэмэгдлээ',
    save: 'Хадгалах',
    edited: 'засварласан',
    more: 'Сэтгэгдлийн цэс',
    edit: 'Засах',
    delete: 'Устгах',
    deleted: 'Сэтгэгдлийг устгалаа',
    report: 'Гомдол гаргах',
    reportTitle: 'Яагаад гомдол гаргах вэ?',
    reasons: { SPAM: 'Спам', ABUSE: 'Доромжлол, хэрүүл', OTHER: 'Бусад' },
    reported: 'Гомдол хүлээн авлаа. Баярлалаа',
    block: 'Хэрэглэгчийг хаах',
    blockTitle: 'Энэ хэрэглэгчийг хаах уу?',
    blockText:
      'Түүний сэтгэгдлүүд танд харагдахаа болино. Хаасан хэрэглэгчдийг Профайлаас харж, буцааж болно.',
    blocked: 'Хэрэглэгчийг хаалаа',
    cancel: 'Болих',
    mine: 'Та',
    contact: (email: string) => `Асуудал, гомдол: ${email}`,
    rules: 'Бусдыг хүндэтгэнэ үү. Холбоос оруулах боломжгүй.',
    blockedTitle: 'Хаасан хэрэглэгчид',
    blockedText: 'Эдгээр хүмүүсийн сэтгэгдэл танд харагдахгүй.',
    blockedEmpty: 'Та хэнийг ч хаагаагүй байна.',
    unblock: 'Нээх',
    unblocked: 'Хэрэглэгчийг нээлээ',
  },

  push: {
    /** Android notification channel name (system settings). */
    channel: 'Мэдэгдэл',
  },

  settings: {
    title: 'Тохиргоо',
    personal: 'Хувийн мэдээлэл',
    lastName: 'Овог',
    firstName: 'Нэр',
    phone: 'Утасны дугаар',
    save: 'Хадгалах',
    saved: 'Мэдээлэл хадгалагдлаа',
    account: 'Бүртгэл',
    username: 'Нэвтрэх нэр',
    usernameHint: 'Нэвтрэх нэрийг апп-аас өөрчлөх боломжгүй.',
    email: 'Имэйл',
    changeEmail: 'Имэйл солих',
    changePassword: 'Нууц үг солих',
    logout: 'Гарах',
    deleteAccount: 'Бүртгэл устгах',
    deleteTitle: 'Бүртгэлээ устгах уу?',
    deleteText:
      'Хувийн мэдээлэл тань устаж, бүх төхөөрөмжөөс гарна. Хадгалсан дугаар, сонсолтын түүх сэргэхгүй.',
    deleteNext: 'Үргэлжлүүлэх',
    deleteConfirmTitle: 'Итгэлтэй байна уу?',
    deleteConfirmText: 'Энэ үйлдлийг буцаах боломжгүй.',
    deleteConfirm: 'Тийм, устгах',
  },

  changePassword: {
    title: 'Нууц үг солих',
    current: 'Одоогийн нууц үг',
    next: 'Шинэ нууц үг',
    nextHint: 'Хамгийн багадаа 8 тэмдэгт.',
    submit: 'Нууц үг солих',
    done: 'Нууц үг солигдлоо. Бусад төхөөрөмжөөс гарлаа.',
  },

  changeEmail: {
    title: 'Имэйл солих',
    text: 'Шинэ хаяг руу 6 оронтой код илгээнэ.',
    newEmail: 'Шинэ имэйл',
    password: 'Нууц үг',
    send: 'Код илгээх',
    codeText: (email: string) => `${email} хаяг руу илгээсэн кодыг оруулна уу.`,
    code: 'Баталгаажуулах код',
    verify: 'Баталгаажуулах',
    done: 'Имэйл солигдлоо.',
  },

  devices: {
    title: 'Төхөөрөмжүүд',
    text: 'Нэг бүртгэлээр хамгийн ихдээ 2 төхөөрөмжөөс нэвтэрнэ.',
    current: 'Энэ төхөөрөмж',
    remove: 'Хасах',
    removeTitle: 'Төхөөрөмж хасах',
    removeText: 'Нууц үгээ оруулж баталгаажуулна уу.',
    password: 'Нууц үг',
    removed: 'Төхөөрөмжийг хаслаа.',
  },
} as const;
