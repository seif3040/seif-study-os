import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { BarChart3, BookOpen, CalendarDays, CircleDollarSign, Clock3, Flame, Gift, GraduationCap, LayoutDashboard, LogOut, Menu, Settings, Sparkles, Timer, Users, Video } from "lucide-react";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useState } from "react";

const menu = [
  ["لوحة التحكم", "/", LayoutDashboard], ["سيفي AI", "/seify", Sparkles], ["مصادر دروسي", "/lesson-sources", Users], ["خطة المنهج", "/study-plan", BookOpen], ["الامتحانات", "/exams", GraduationCap], ["Pomodoro", "/pomodoro", Timer], ["استراحة محسوبة", "/focus-lounge", Clock3], ["فيديو المذاكرة", "/study-video", Video], ["العادات", "/habits", Flame], ["التحليلات", "/analytics", BarChart3], ["التقويم", "/calendar", CalendarDays], ["الهدايا", "/rewards", Gift], ["Coins", "/coins", CircleDollarSign], ["الإعدادات", "/settings", Settings],
] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  if (loading || !user) return <SignInGate />;
  return <StudyNavigation>{children}</StudyNavigation>;
}

function SignInGate() { const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const signIn = async () => { setBusy(true); try { const response = await fetch("/api/private-auth/sign-in", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email: "seif94803@gmail.com", password }) }); const result = await response.json() as { success?: boolean; message?: string }; if (!response.ok || !result.success) { toast.error(result.message ?? "تعذّر تسجيل الدخول."); return; } window.location.reload(); } catch { toast.error("تعذّر الاتصال بخدمة تسجيل الدخول."); } finally { setBusy(false); } }; return <div className="app-shell flex min-h-screen items-center justify-center p-5"><div className="surface w-full max-w-md p-8 text-center"><img src="/study-logo.svg" alt="" className="mx-auto mb-5 size-16 rounded-2xl" /><h1 className="text-2xl font-bold">Seif Study OS</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">حساب شخصي خاص لحفظ خطة مذاكرتك، إنجازاتك، وCoins بأمان.</p><div className="mt-6 space-y-3 text-right"><label className="block text-sm font-semibold">البريد</label><Input dir="ltr" value="seif94803@gmail.com" readOnly aria-label="البريد المسموح له" /><label className="block text-sm font-semibold">كلمة المرور</label><Input dir="ltr" type="password" value={password} onChange={event => setPassword(event.target.value)} onKeyDown={event => event.key === "Enter" && signIn()} placeholder="أدخل كلمة المرور" autoComplete="current-password" /></div><Button disabled={!password || busy} onClick={signIn} className="mt-6 w-full">{busy ? "جارٍ التحقق…" : "تسجيل الدخول"}</Button></div></div>; }

function StudyNavigation({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth(); const [location, navigate] = useLocation(); const mobile = useIsMobile(); const { theme, toggleTheme } = useTheme();
  const current = menu.find(([_, path]) => path === location)?.[0] ?? "Seif Study OS";
  return <SidebarProvider defaultOpen><Sidebar side="right" collapsible="offcanvas" className="border-l border-sidebar-border"><SidebarHeader className="h-[76px] border-b border-sidebar-border px-4"><button onClick={() => navigate("/")} className="flex w-full items-center gap-3 text-right"><img src="/study-logo.svg" alt="" className="size-11 rounded-xl" /><div><p className="font-[Manrope] text-base font-extrabold tracking-tight">SEIF STUDY OS</p></div></button></SidebarHeader><SidebarContent className="px-3 py-4"><p className="mb-2 px-3 text-[10px] font-bold tracking-[0.13em] text-sidebar-foreground/50">مساحة العمل</p><SidebarMenu>{menu.map(([label, path, Icon]) => <SidebarMenuItem key={path}><SidebarMenuButton isActive={location === path} onClick={() => navigate(path)} className="h-10 rounded-xl text-sidebar-foreground/80 data-[active=true]:bg-sidebar-primary data-[active=true]:font-bold data-[active=true]:text-sidebar-primary-foreground"><Icon className="size-4" /><span>{label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent><SidebarFooter className="border-t border-sidebar-border p-3"><button onClick={toggleTheme} className="mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/75 hover:bg-sidebar-accent"><Clock3 className="size-4" />المظهر: {theme === "dark" ? "داكن" : "فاتح"}</button><div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/70 p-2.5"><Avatar className="size-9"><AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground">{user?.name?.slice(0, 1) ?? "S"}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{user?.name ?? "Seif"}</p></div><button onClick={logout} aria-label="تسجيل الخروج" className="rounded-lg p-2 text-sidebar-foreground/65 hover:bg-black/10"><LogOut className="size-4" /></button></div></SidebarFooter></Sidebar><SidebarInset className="app-shell min-h-screen"><div className="flex h-[76px] items-center justify-between border-b border-border/70 bg-background/65 px-4 backdrop-blur-xl md:px-8"><div className="flex items-center gap-3">{mobile && <SidebarTrigger className="rounded-xl"><Menu /></SidebarTrigger>}<div><p className="font-bold">{current}</p></div></div><img src="/study-logo.svg" alt="Seif Study OS" className="size-9 rounded-lg md:hidden" /></div><main className="page-enter study-content min-h-[calc(100vh-76px)] w-full max-w-[1440px] self-center p-4 md:p-8">{children}</main><nav className="study-bottom-nav md:hidden" aria-label="تنقل الموبايل">
  {([["الرئيسية", "/", LayoutDashboard], ["المنهج", "/study-plan", BookOpen], ["التقويم", "/calendar", CalendarDays], ["التركيز", "/pomodoro", Timer], ["التحليلات", "/analytics", BarChart3]] as const).map(([label, path, Icon]) =>
    <button key={path} type="button" aria-current={location === path ? "page" : undefined} onClick={() => navigate(path)}>
      <Icon className="size-5" aria-hidden /><span>{label}</span>
    </button>
  )}
</nav>{location !== "/seify" && <Button className="study-assistant fixed bottom-4 left-4 z-40" onClick={() => navigate("/seify?from=" + encodeURIComponent(location))}><Sparkles />كلم سيفي</Button>}</SidebarInset></SidebarProvider>;
}
