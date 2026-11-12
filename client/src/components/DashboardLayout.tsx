import { StudyReminders } from "@/components/StudyReminders";
import OfflineTools from "@/components/OfflineTools";
import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { BarChart3, BookOpen, CalendarDays, CircleDollarSign, Clock3, Flame, Gift, GraduationCap, LayoutDashboard, LogOut, Menu, Search, Settings, Sparkles, Timer, Users, Video } from "lucide-react";
import { useLocation } from "wouter";
import { QuickThemePicker } from "@/components/ThemePicker";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useState } from "react";

const menu = [
  ["النهارده", "/", LayoutDashboard], ["جارفيس", "/seify", Sparkles], ["مصادر دروسي", "/lesson-sources", Users], ["خطة المنهج", "/study-plan", BookOpen], ["الامتحانات", "/exams", GraduationCap], ["Pomodoro", "/pomodoro", Timer], ["استراحة محسوبة", "/focus-lounge", Clock3], ["فيديو المذاكرة", "/study-video", Video], ["العادات", "/habits", Flame], ["التحليلات", "/analytics", BarChart3], ["التقويم", "/calendar", CalendarDays], ["الهدايا", "/rewards", Gift], ["Coins", "/coins", CircleDollarSign], ["الإعدادات", "/settings", Settings],
] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  if (loading || !user) return <SignInGate />;
  return <StudyNavigation>{children}</StudyNavigation>;
}

function SignInGate() { const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const signIn = async () => { setBusy(true); try { const response = await fetch("/api/private-auth/sign-in", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email: "seif94803@gmail.com", password }) }); const result = await response.json() as { success?: boolean; message?: string }; if (!response.ok || !result.success) { toast.error(result.message ?? "تعذّر تسجيل الدخول."); return; } window.location.reload(); } catch { toast.error("تعذّر الاتصال بخدمة تسجيل الدخول."); } finally { setBusy(false); } }; return <div className="app-shell flex min-h-screen items-center justify-center p-5"><div className="surface w-full max-w-md p-8 text-center"><img src="/study-logo.svg" alt="" className="mx-auto mb-5 size-16 rounded-2xl" /><h1 className="text-2xl font-bold">Seif Study OS</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">حساب شخصي خاص لحفظ خطة مذاكرتك، إنجازاتك، وCoins بأمان.</p><div className="mt-6 space-y-3 text-right"><label className="block text-sm font-semibold">البريد</label><Input dir="ltr" value="seif94803@gmail.com" readOnly aria-label="البريد المسموح له" /><label className="block text-sm font-semibold">كلمة المرور</label><Input dir="ltr" type="password" value={password} onChange={event => setPassword(event.target.value)} onKeyDown={event => event.key === "Enter" && signIn()} placeholder="أدخل كلمة المرور" autoComplete="current-password" /></div><Button disabled={!password || busy} onClick={signIn} className="mt-6 w-full">{busy ? "جارٍ التحقق…" : "تسجيل الدخول"}</Button></div></div>; }

function StudyNavigation({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth(); const [location, navigate] = useLocation(); const mobile = useIsMobile();
  const current = menu.find(([_, path]) => path === location)?.[0] ?? "Seif Study OS";
  return <SidebarProvider defaultOpen><Sidebar side="right" collapsible="offcanvas" className="border-l border-sidebar-border"><SidebarHeader className="study-brand h-[76px] border-b border-sidebar-border px-4"><button onClick={() => navigate("/")} className="flex w-full items-center gap-3 text-right"><img src="/study-logo.svg" alt="" className="study-brand-icon size-11 rounded-xl" /><div><p className="font-[Manrope] text-base font-extrabold tracking-tight">Seif Study OS</p></div></button></SidebarHeader><SidebarContent className="px-3 py-4"><SidebarMenu>{menu.map(([label, path, Icon]) => <SidebarMenuItem key={path}><SidebarMenuButton isActive={location === path} onClick={() => navigate(path)} className="study-sidebar-link h-10 rounded-xl text-sidebar-foreground/85 data-[active=true]:bg-sidebar-primary data-[active=true]:font-bold data-[active=true]:text-sidebar-primary-foreground"><Icon className="size-4" /><span>{label}</span>{location === path && <span aria-hidden className="study-active-dot" />}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent><SidebarFooter className="border-t border-sidebar-border p-3"><QuickThemePicker /><div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/70 p-2.5"><Avatar className="size-9"><AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground">{user?.name?.slice(0, 1) ?? "S"}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{user?.name ?? "Seif"}</p></div><button onClick={async () => { await window.StudyOffline?.forget().catch(() => undefined); await logout(); }} aria-label="تسجيل الخروج" className="rounded-lg p-2 text-sidebar-foreground/65 hover:bg-black/10"><LogOut className="size-4" /></button></div></SidebarFooter></Sidebar><SidebarInset className="app-shell min-h-screen"><div className="study-topbar sticky top-0 z-20 flex h-[64px] items-center justify-between border-b border-border/70 bg-background/65 px-4 backdrop-blur-xl md:px-8"><div className="flex items-center gap-3">{mobile && <SidebarTrigger className="rounded-xl"><Menu /></SidebarTrigger>}<div><p className="rounded-full bg-secondary px-3 py-1.5 text-sm font-bold text-secondary-foreground">{current}</p></div></div><div className="flex items-center gap-1">{user && <><StudyReminders ownerId={user.id} /><OfflineTools ownerId={user.id} /></>}<Button variant="ghost" size="icon" aria-label="ابحث" onClick={() => navigate("/search")}><Search /></Button></div></div><main key={location} className="page-enter study-content min-h-[calc(100vh-64px)] w-full max-w-[1440px] self-center p-4 md:p-8">{children}</main><nav className="study-bottom-nav md:hidden" aria-label="تنقل الموبايل">
  {([["النهارده", "/", LayoutDashboard], ["المنهج", "/study-plan", BookOpen], ["التقويم", "/calendar", CalendarDays], ["التركيز", "/pomodoro", Timer], ["جارفيس", "/seify", Sparkles]] as const).map(([label, path, Icon]) =>
    <button key={path} type="button" aria-current={location === path ? "page" : undefined} onClick={() => navigate(path)}>
      <Icon className="size-5" aria-hidden /><span>{label}</span>
    </button>
  )}
</nav>{location !== "/seify" && <Button className="study-assistant fixed bottom-5 left-5 z-40 hidden md:inline-flex" onClick={() => navigate("/seify?from=" + encodeURIComponent(location))}><Sparkles />كلم جارفيس</Button>}</SidebarInset></SidebarProvider>;
}
