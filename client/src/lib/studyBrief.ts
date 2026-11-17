type Brief = { nextExams?: string[]; groups: { label: string; titles: string[] }[] };

const count = new Intl.NumberFormat("ar-EG");

export function remainingStudyMessage({ groups }: Brief) {
  const open = groups.filter(group => group.titles.length);
  if (!open.length) return "خلصت كل اللي في خطة النهارده.";
  return "الباقي النهارده · " + open.map(group => group.label + " " + count.format(group.titles.length)).join("، ")
    + " · أول حاجة: " + open[0].titles[0];
}

export function morningStudyMessage({ groups, nextExams }: Brief, friday: boolean) {
  const opening = friday ? "صباح الخير يا سيف. النهارده إجازة." : "صباح الخير يا سيف.";
  const open = groups.filter(group => group.titles.length);
  const recap = open.length ? open.map(({ label, titles }) =>
    label + ": " + titles.slice(0, 2).join("، ") + (titles.length > 2 ? " و" + count.format(titles.length - 2) + " كمان" : "")
  ).join(" · ") : "مفيش حاجة في جدول النهارده.";
  return [opening, recap, nextExams?.length ? "امتحانات بكرة: " + nextExams.slice(0, 2).join("، ") : ""].filter(Boolean).join(" ");
}
