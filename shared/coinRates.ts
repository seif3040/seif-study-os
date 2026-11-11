export const coinRateCatalog = {
  "pomodoro_15": [
    "Pomodoro · ١٥ دقيقة",
    8,
    "تركيز"
  ],
  "pomodoro_25": [
    "Pomodoro · ٢٥ دقيقة",
    12,
    "تركيز"
  ],
  "pomodoro_45": [
    "Pomodoro · ٤٥ دقيقة",
    22,
    "تركيز"
  ],
  "pomodoro_60": [
    "Pomodoro · ساعة",
    100,
    "تركيز"
  ],
  "video_block": [
    "فيديو مذاكرة · ٤٥ دقيقة",
    25,
    "تركيز"
  ],
  "lesson_complete": [
    "إكمال درس",
    75,
    "دراسة"
  ],
  "lesson_review": [
    "مراجعة درس",
    15,
    "دراسة"
  ],
  "task_urgent": [
    "مهمة عاجلة",
    30,
    "دراسة"
  ],
  "task_medium": [
    "مهمة متوسطة",
    20,
    "دراسة"
  ],
  "task_low": [
    "مهمة منخفضة الأولوية",
    10,
    "دراسة"
  ],
  "habit_complete": [
    "إكمال عادة",
    10,
    "دراسة"
  ],
  "goal_complete": [
    "إكمال هدف",
    50,
    "دراسة"
  ],
  "exam_complete": [
    "تسجيل نتيجة امتحان",
    15,
    "امتحانات"
  ],
  "exam_bonus_60": [
    "استيعاب ٦٠٪ فأعلى",
    10,
    "امتحانات"
  ],
  "exam_bonus_70": [
    "استيعاب ٧٠٪ فأعلى",
    20,
    "امتحانات"
  ],
  "exam_bonus_80": [
    "استيعاب ٨٠٪ فأعلى",
    35,
    "امتحانات"
  ],
  "exam_bonus_90": [
    "استيعاب ٩٠٪ فأعلى",
    50,
    "امتحانات"
  ],
  "exam_bonus_95": [
    "استيعاب ٩٥٪ فأعلى",
    75,
    "امتحانات"
  ],
  "streak_3": [
    "سلسلة ٣ أيام",
    25,
    "السلسلة"
  ],
  "streak_7": [
    "سلسلة ٧ أيام",
    75,
    "السلسلة"
  ],
  "streak_14": [
    "سلسلة ١٤ يوم",
    150,
    "السلسلة"
  ],
  "streak_30": [
    "سلسلة ٣٠ يوم",
    400,
    "السلسلة"
  ],
  "streak_60": [
    "سلسلة ٦٠ يوم",
    800,
    "السلسلة"
  ],
  "streak_90": [
    "سلسلة ٩٠ يوم",
    1500,
    "السلسلة"
  ]
} as const;
export type CoinRateKey = keyof typeof coinRateCatalog;
export const coinRateKeys = Object.keys(coinRateCatalog) as [CoinRateKey, ...CoinRateKey[]];
