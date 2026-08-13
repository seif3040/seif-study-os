export type RewardRarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";

const rewardRows: Array<[string, number]> = [
  ["شوكولاتة", 100], ["قهوة / نسكافيه", 120], ["مشروبك المفضل", 120], ["بسكويت", 130], ["فشار", 150],
  ["سناك حلو", 150], ["آيس كريم", 180], ["20 دقيقة موسيقى", 180], ["15 دقيقة سوشيال ميديا", 200], ["20 دقيقة Gaming", 200],
  ["حلقة قصيرة", 220], ["غفوة 20 دقيقة", 250], ["مشاهدة YouTube ممتعة", 250], ["مكالمة بدون قيود", 250], ["قطعة حلوى", 250],
  ["برجر", 300], ["قطعة Pizza", 320], ["ساندوتش شاورما", 350], ["وجبة خفيفة", 350], ["45 دقيقة Gaming", 350],
  ["45 دقيقة Social Media", 350], ["فيلم", 400], ["حلقتان مسلسل", 400], ["غفوة 45 دقيقة", 400], ["آيس كريم كبير", 400],
  ["Pizza صغيرة", 450], ["وجبة Fast Food", 450], ["ساعة Music", 450], ["ساعة Gaming", 500], ["ساعة Social Media", 500],
  ["قهوة + سناك", 500], ["Chocolate Box صغيرة", 550], ["Movie Night", 550], ["ساعة Relax بدون مذاكرة", 550], ["نوم إضافي ساعة", 600],
  ["وجبة شاورما كاملة", 650], ["برجر + بطاطس", 650], ["Pizza كاملة", 700], ["وجبة مفضلة", 700], ["ساعتان Gaming", 700],
  ["ساعتان Social Media", 700], ["سينما / فيلم Premium", 750], ["Dessert كبير", 750], ["نوم إضافي ساعتين", 750], ["قعدة مع الصحاب", 800],
  ["Gaming Night", 850], ["3 حلقات مسلسل", 850], ["Cheat Meal", 900], ["شراء حاجة صغيرة", 900], ["يوم Music بدون قيود", 900],
  ["3 ساعات Social Media", 950], ["3 ساعات Gaming", 950], ["وجبة كبيرة", 1000], ["خروج مع الصحاب", 1000], ["نصف يوم Relax", 1000],
  ["وجبة ضخمة", 1100], ["4 ساعات Gaming", 1100], ["4 ساعات Social Media", 1100], ["Cinema + Food", 1200], ["Shopping صغير", 1200],
  ["يوم كامل مع الصحاب", 1250], ["نوم بدون Alarm", 1250], ["Gaming Day", 1300], ["وجبة كاملة", 1300], ["Movie Marathon", 1350],
  ["شراء شيء نفسك فيه", 1400], ["6 ساعات Gaming", 1450], ["يوم Social Media", 1500], ["Food Feast", 1500], ["يوم Relax جزئي", 1550],
  ["Day Out", 1600], ["Shopping متوسط", 1600], ["Cinema Night كاملة", 1700], ["Ultimate Gaming Session", 1800], ["يوم ترفيه كامل", 1800],
  ["وجبة فاخرة", 2000], ["Pizza + Dessert", 2000], ["Gaming Weekend", 2100], ["Cinema + Dinner", 2100], ["Shopping متوسط", 2200],
  ["خروج مميز مع الصحاب", 2200], ["يوم بدون Alarm", 2300], ["يوم Gaming كامل", 2400], ["يوم أكل مميز", 2400], ["Movie Marathon + Food", 2500],
  ["إعفاء من مادة واحدة", 2500], ["شراء شيء مهم نفسك فيه", 2600], ["Half Day Off", 2700], ["Full Day Out", 2800], ["يوم راحة كامل", 3000],
  ["Ultimate Gaming Day", 3500], ["Ultimate Movie Day", 3500], ["Shopping كبير", 3800], ["Ultimate Food Day", 4000], ["يوم كامل Out مع الصحاب", 4000],
  ["يوم راحة كامل بدون التزامات", 4200], ["Gaming Weekend", 4500], ["شراء حاجة نفسك فيها من زمان", 4500], ["Perfect Day Reward", 5000], ["Ultimate 90-Day Reward", 6000],
];

function rarityFor(index: number): RewardRarity {
  if (index <= 15) return "common";
  if (index <= 35) return "uncommon";
  if (index <= 55) return "rare";
  if (index <= 75) return "epic";
  if (index <= 90) return "legendary";
  return "mythic";
}

export const rewardCatalog = rewardRows.map(([title, cost], index) => ({
  catalogId: index + 1,
  title,
  cost,
  rarity: rarityFor(index + 1),
}));

export type AchievementMetric =
  | "lessonsCompleted" | "reviews" | "studyMinutes" | "pomodoros" | "currentStreak"
  | "tasksCompleted" | "urgentTasks" | "goalsCompleted" | "habitDays" | "videoMinutes"
  | "videoBlocks" | "examsCompleted" | "bestExamScore" | "averageExamScore" | "coinsEarned"
  | "activeDays" | "compositeScholar" | "compositeProductivity" | "compositeAcademic" | "cycleComplete";

export type AchievementCatalogItem = {
  catalogId: number;
  title: string;
  description: string;
  category: "lessons" | "focus" | "streak" | "tasks" | "goals" | "habits" | "video" | "exams" | "coins" | "cycle";
  rarity: RewardRarity;
  metric: AchievementMetric;
  target: number;
};

const make = (
  category: AchievementCatalogItem["category"],
  metric: AchievementMetric,
  rows: Array<[string, string, number]>,
  start: number,
): AchievementCatalogItem[] => rows.map(([title, description, target], offset) => ({
  catalogId: start + offset,
  title,
  description,
  category,
  metric,
  target,
  rarity: target >= 150 ? "mythic" : target >= 75 ? "legendary" : target >= 30 ? "epic" : target >= 10 ? "rare" : "uncommon",
}));

export const achievementCatalog: AchievementCatalogItem[] = [
  ...make("lessons", "lessonsCompleted", [["أول درس", "أكمل أول درس", 1], ["5 دروس", "أكمل 5 دروس", 5], ["10 دروس", "أكمل 10 دروس", 10], ["25 درس", "أكمل 25 درس", 25], ["50 درس", "أكمل 50 درس", 50], ["75 درس", "أكمل 75 درس", 75], ["100 درس", "أكمل 100 درس", 100]], 101),
  ...make("lessons", "reviews", [["أول مراجعة", "راجع أول درس", 1], ["10 مراجعات", "نفذ 10 مراجعات", 10], ["25 مراجعة", "نفذ 25 مراجعة", 25]], 108),
  ...make("focus", "studyMinutes", [["أول ساعة", "ساعة مذاكرة", 60], ["5 ساعات", "5 ساعات مذاكرة", 300], ["10 ساعات", "10 ساعات مذاكرة", 600], ["25 ساعة", "25 ساعة مذاكرة", 1500], ["50 ساعة", "50 ساعة مذاكرة", 3000], ["75 ساعة", "75 ساعة مذاكرة", 4500], ["100 ساعة", "100 ساعة مذاكرة", 6000], ["150 ساعة", "150 ساعة مذاكرة", 9000], ["200 ساعة", "200 ساعة مذاكرة", 12000], ["250 ساعة", "250 ساعة مذاكرة", 15000]], 111),
  ...make("focus", "pomodoros", [["أول Pomodoro", "أكمل أول جلسة", 1], ["5 جلسات", "أكمل 5 جلسات", 5], ["10 جلسات", "أكمل 10 جلسات", 10], ["25 جلسة", "أكمل 25 جلسة", 25], ["50 جلسة", "أكمل 50 جلسة", 50], ["100 جلسة", "أكمل 100 جلسة", 100], ["150 جلسة", "أكمل 150 جلسة", 150], ["200 جلسة", "أكمل 200 جلسة", 200], ["300 جلسة", "أكمل 300 جلسة", 300], ["Pomodoro Master", "أكمل 500 جلسة", 500]], 121),
  ...make("streak", "currentStreak", [["يومان", "يومان متتاليان", 2], ["3 أيام", "3 أيام متتالية", 3], ["أسبوع", "7 أيام", 7], ["14 يوم", "14 يوم", 14], ["21 يوم", "21 يوم", 21], ["شهر", "30 يوم", 30], ["45 يوم", "45 يوم", 45], ["60 يوم", "60 يوم", 60], ["75 يوم", "75 يوم", 75], ["90 Day Legend", "90 يوم", 90]], 131),
  ...make("tasks", "tasksCompleted", [["أول مهمة", "أكمل أول مهمة", 1], ["10 مهام", "أكمل 10 مهام", 10], ["25 مهمة", "أكمل 25 مهمة", 25], ["50 مهمة", "أكمل 50 مهمة", 50], ["100 مهمة", "أكمل 100 مهمة", 100], ["Emergency Hero", "أكمل 10 مهام عاجلة", 10], ["Task Machine", "أكمل 25 مهمة", 25], ["Task Hunter", "أكمل 50 مهمة", 50], ["Task Master", "أكمل 100 مهمة", 100], ["Task Legend", "أكمل 200 مهمة", 200]], 141),
  ...make("goals", "goalsCompleted", [["أول هدف", "أكمل أول هدف", 1], ["3 أهداف", "أكمل 3 أهداف", 3], ["5 أهداف", "أكمل 5 أهداف", 5], ["10 أهداف", "أكمل 10 أهداف", 10], ["Goal Master", "أكمل 25 هدف", 25]], 151),
  ...make("habits", "habitDays", [["أول عادة", "أكمل أول عادة", 1], ["7 Habit Days", "7 أيام عادة", 7], ["30 Habit Days", "30 يوم", 30], ["60 Habit Days", "60 يوم", 60], ["Habit Master", "90 يوم", 90]], 156),
  ...make("video", "videoBlocks", [["أول جلسة فيديو", "أكمل 45 دقيقة", 1], ["5 جلسات فيديو", "أكمل 5 جلسات", 5], ["10 جلسات فيديو", "أكمل 10 جلسات", 10], ["25 جلسة فيديو", "أكمل 25 جلسة", 25], ["50 جلسة فيديو", "أكمل 50 جلسة", 50], ["25 ساعة فيديو", "أكمل 25 ساعة", 1500], ["50 ساعة فيديو", "أكمل 50 ساعة", 3000], ["75 ساعة فيديو", "أكمل 75 ساعة", 4500], ["100 ساعة فيديو", "أكمل 100 ساعة", 6000], ["Video Master", "أكمل 150 ساعة", 9000]], 161),
  ...make("exams", "examsCompleted", [["أول امتحان", "أكمل أول امتحان", 1], ["5 امتحانات", "أكمل 5 امتحانات", 5], ["10 امتحانات", "أكمل 10 امتحانات", 10], ["20 امتحان", "أكمل 20 امتحان", 20], ["30 امتحان", "أكمل 30 امتحان", 30], ["80%", "أول نتيجة 80%+", 80], ["90%", "أول نتيجة 90%+", 90], ["95%", "أول نتيجة 95%+", 95], ["Perfect Score", "احصل على 100%", 100], ["Exam Master", "20 امتحان بمتوسط 90%+", 20]], 171),
  ...make("coins", "coinsEarned", [["أول Coin", "اكسب أول Coin", 1], ["500 Coins", "اكسب 500", 500], ["1,000 Coins", "اكسب 1,000", 1000], ["2,500 Coins", "اكسب 2,500", 2500], ["5,000 Coins", "اكسب 5,000", 5000], ["10,000 Coins", "اكسب 10,000", 10000], ["Coin Collector", "اكسب 15,000", 15000], ["Coin Master", "اكسب 20,000", 20000], ["Coin Legend", "اكسب 30,000", 30000], ["Coin Tycoon", "اكسب 50,000", 50000]], 181),
  ...make("cycle", "activeDays", [["بداية الرحلة", "أول يوم دراسة", 1], ["أسبوع كامل", "أكمل أسبوع دراسة", 7], ["شهر كامل", "أكمل 30 يوم", 30], ["نصف الرحلة", "أكمل 45 يوم", 45], ["بدون استسلام", "لا تكسر الـStreak لمدة 30 يوم", 30], ["Scholar", "100 درس + 50 ساعة مذاكرة", 100], ["Productivity Beast", "100 مهمة + 50 Pomodoro", 100], ["Academic Weapon", "10 امتحانات + متوسط 85%+", 10], ["90-Day Champion", "أكمل أهداف الدورة الأساسية", 90], ["SEIF — LEGEND OF THE CYCLE", "أكمل دورة الـ90 يوم وحقق شروط الدورة", 90]], 191),
];

const metricOverrides: Partial<Record<number, AchievementMetric>> = {
  146: "urgentTasks", 166: "videoMinutes", 167: "videoMinutes", 168: "videoMinutes", 169: "videoMinutes", 170: "videoMinutes",
  176: "bestExamScore", 177: "bestExamScore", 178: "bestExamScore", 179: "bestExamScore", 180: "averageExamScore",
  195: "currentStreak", 196: "compositeScholar", 197: "compositeProductivity", 198: "compositeAcademic", 199: "cycleComplete", 200: "cycleComplete",
};
achievementCatalog.forEach(item => { if (metricOverrides[item.catalogId]) item.metric = metricOverrides[item.catalogId]!; });

if (rewardCatalog.length !== 100 || achievementCatalog.length !== 100) {
  throw new Error("Seif Study OS catalogs must contain exactly 100 rewards and 100 achievements.");
}
