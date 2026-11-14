import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { type MySqlTable } from "drizzle-orm/mysql-core";
import * as schema from "../drizzle/schema.js";
import { ENV } from "./_core/env.js";
import { exportStudyBackup, getDb } from "./db.js";

const restoreTables = {
  studyCycles: schema.studyCycles,
  subjects: schema.subjects,
  chapters: schema.chapters,
  lessons: schema.lessons,
  lessonProgress: schema.lessonProgress,
  tasks: schema.tasks,
  assistantChats: schema.assistantChats,
  assistantMessages: schema.assistantMessages,
  dailyStudySummaries: schema.dailyStudySummaries,
  habits: schema.habits,
  habitCompletions: schema.habitCompletions,
  goals: schema.goals,
  goalMilestones: schema.goalMilestones,
  pomodoroSessions: schema.pomodoroSessions,
  studyVideoSessions: schema.studyVideoSessions,
  videoNotes: schema.videoNotes,
  notebooks: schema.notebooks,
  notes: schema.notes,
  notebookSources: schema.notebookSources,
  exams: schema.exams,
  examLessons: schema.examLessons,
  examAttempts: schema.examAttempts,
  flashcardDecks: schema.flashcardDecks,
  flashcards: schema.flashcards,
  calendarEvents: schema.calendarEvents,
  lessonSources: schema.lessonSources,
  studyPlanner: schema.studyPlanner,
  rewardPurchases: schema.rewardPurchases,
  userAchievements: schema.userAchievements,
  coinTransactions: schema.coinTransactions,
  studyEvents: schema.studyEvents,
} satisfies Record<string, MySqlTable>;

type ArchiveData = Awaited<ReturnType<typeof exportStudyBackup>>;
type RestoreName = keyof typeof restoreTables;
type BackupRow = { id: number } & Record<string, unknown>;
const names = Object.keys(restoreTables) as RestoreName[];

function seal(userId: number, archive: ArchiveData) {
  if (!ENV.cookieSecret) throw new Error("توقيع النسخ الاحتياطية غير متاح.");
  return createHmac("sha256", ENV.cookieSecret)
    .update(JSON.stringify(["seif-study-backup-v1", userId, archive.format, archive.version, archive.exportedAt, archive.records]))
    .digest("hex");
}

export async function signedStudyBackup(userId: number, includeCatalog: boolean) {
  const archive = await exportStudyBackup(userId, includeCatalog);
  return { ...archive, signature: seal(userId, archive) };
}

export async function restoreStudyBackup(userId: number, raw: string, preview: boolean) {
  let file: ArchiveData & { signature?: string };
  try { file = JSON.parse(raw); }
  catch { throw new Error("ملف النسخة الاحتياطية مش JSON صالح."); }
  if (file?.format !== "seif-study-os" || file.version !== 1 || !/^[a-f0-9]{64}$/.test(file.signature ?? "")) {
    throw new Error("نزّل نسخة JSON جديدة موقّعة من الإعدادات عشان تستخدم الاسترجاع.");
  }
  if (!timingSafeEqual(Buffer.from(file.signature!, "hex"), Buffer.from(seal(userId, file), "hex"))) {
    throw new Error("النسخة تخص حساب تاني أو محتواها اتغيّر.");
  }

  const current = await exportStudyBackup(userId, false);
  const plan = names.map(name => {
    const present = new Set(current.records[name].map(row => row.id));
    const source = (file.records[name] ?? []) as BackupRow[];
    const missing = source.filter(row => !present.has(row.id));
    return { name, missing, retained: source.length - missing.length };
  });
  const summary = plan.map(({ name, missing, retained }) => ({ name, missing: missing.length, retained }));
  if (preview) return { summary, restored: 0 };

  const db = await getDb();
  if (!db) throw new Error("الاتصال بقاعدة البيانات مش متاح.");
  const restored = await db.transaction(async tx => {
    await tx.execute(sql`select id from ${schema.users} where id = ${userId} for update`);
    let count = 0;
    for (const { name, missing } of plan) {
      if (!missing.length) continue;
      const table = restoreTables[name];
      const fields = Object.entries(getTableColumns(table)).filter(([key]) => Object.hasOwn(missing[0], key));
      const columns = fields.map(([, column]) => sql.identifier(column.name));
      for (let offset = 0; offset < missing.length; offset += 75) {
        const values = missing.slice(offset, offset + 75).map(row => {
          const cells = fields.map(([key, column]) => {
            const value = row[key];
            if (value == null) return sql`null`;
            if (column.dataType === "json") return sql`${JSON.stringify(value)}`;
            if (column.dataType === "date" && typeof value === "string") {
              const date = new Date(value).toISOString().slice(0, 19).replace("T", " ");
              return sql`${date}`;
            }
            return sql`${value}`;
          });
          return sql`(${sql.join(cells, sql`, `)})`;
        });
        // An ID or unique-key collision rolls the entire restore back.
        await tx.execute(sql`insert into ${table} (${sql.join(columns, sql`, `)}) values ${sql.join(values, sql`, `)}`);
        count += values.length;
      }
    }
    return count;
  });
  return { summary, restored };
}


function cairoBackupDay() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return [fields.year, fields.month, fields.day].join("-");
}

export async function keepDailyBackup(userId: number, includeCatalog: boolean) {
  const db = await getDb();
  if (!db) throw new Error("الاتصال بقاعدة البيانات مش متاح.");
  const backupDay = cairoBackupDay();
  const [existing] = await db.select({ id: schema.savedStudyBackups.id }).from(schema.savedStudyBackups)
    .where(and(eq(schema.savedStudyBackups.userId, userId), eq(schema.savedStudyBackups.backupDay, backupDay))).limit(1);
  if (!existing) {
    const archive = await signedStudyBackup(userId, includeCatalog);
    await db.insert(schema.savedStudyBackups).values({ userId, backupDay, archive: JSON.stringify(archive) })
      .onDuplicateKeyUpdate({ set: { backupDay } });
  }
  return { backupDay };
}

export async function listDailyBackups(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("الاتصال بقاعدة البيانات مش متاح.");
  return db.select({ id: schema.savedStudyBackups.id, day: schema.savedStudyBackups.backupDay, createdAt: schema.savedStudyBackups.createdAt })
    .from(schema.savedStudyBackups).where(eq(schema.savedStudyBackups.userId, userId))
    .orderBy(desc(schema.savedStudyBackups.backupDay)).limit(30);
}

export async function downloadDailyBackup(userId: number, backupId: number) {
  const db = await getDb();
  if (!db) throw new Error("الاتصال بقاعدة البيانات مش متاح.");
  const [item] = await db.select({ archive: schema.savedStudyBackups.archive, day: schema.savedStudyBackups.backupDay })
    .from(schema.savedStudyBackups).where(and(eq(schema.savedStudyBackups.id, backupId), eq(schema.savedStudyBackups.userId, userId))).limit(1);
  if (!item) throw new Error("النسخة مش موجودة.");
  return item;
}
