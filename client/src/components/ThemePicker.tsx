import { Check, Palette } from "lucide-react";
import { studyThemes, useTheme, type ThemeId } from "@/contexts/ThemeContext";

export function ThemePicker() {
  const { themeId, setThemeId } = useTheme();
  return <section id="appearance" className="surface p-5 sm:p-6">
    <h2 className="flex items-center gap-2 text-lg font-bold"><Palette className="size-5 text-primary" />ثيمات الموقع</h2>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" role="group" aria-label="اختيار الثيم">
      {studyThemes.map(option => <button key={option.id} type="button" aria-pressed={themeId === option.id}
        onClick={() => setThemeId(option.id)} className="theme-tile study-interactive min-w-0 rounded-2xl border p-2 text-start">
        <div className="theme-preview" style={{ backgroundColor: option.colors[0] }} aria-hidden>
          <span style={{ backgroundColor: option.colors[1] }} />
          <span style={{ backgroundColor: option.colors[2] }} />
        </div>
        <span className="mt-2 flex items-center justify-between gap-1 px-1 text-sm font-bold">
          {option.label}{themeId === option.id && <Check className="study-check size-4 shrink-0 text-primary" />}
        </span>
        <span className="block px-1 text-xs text-muted-foreground">{option.mode === "dark" ? "داكن" : "فاتح"}</span>
      </button>)}
    </div>
    <p className="mt-4 text-xs text-muted-foreground">اختيارك بيتحفظ على الجهاز ويشتغل في وضع الأوفلاين.</p>
  </section>;
}

export function QuickThemePicker() {
  const { themeId, setThemeId } = useTheme();
  return <label className="theme-quick mb-2 flex items-center gap-2 rounded-xl px-3 py-1 text-sidebar-foreground">
    <Palette className="size-4 shrink-0" aria-hidden />
    <select aria-label="تغيير الثيم" value={themeId} onChange={event => setThemeId(event.target.value as ThemeId)}
      className="min-h-9 min-w-0 flex-1 rounded-md bg-transparent text-sm">
      {studyThemes.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
  </label>;
}
