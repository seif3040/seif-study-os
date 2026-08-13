import { Toaster } from "@/components/ui/sonner";
import DashboardLayout from "@/components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Route, Switch } from "wouter";
import Dashboard from "@/pages/Dashboard";
import StudyPlan from "@/pages/StudyPlan";
import Tasks from "@/pages/Tasks";
import Habits from "@/pages/Habits";
import Goals from "@/pages/Goals";
import Pomodoro from "@/pages/Pomodoro";
import StudyVideo from "@/pages/StudyVideo";
import Exams from "@/pages/Exams";
import Assistant from "@/pages/Assistant";
import Notebooks from "@/pages/Notebooks";
import CalendarPage from "@/pages/CalendarPage";
import Analytics from "@/pages/Analytics";
import Rewards from "@/pages/Rewards";
import Achievements from "@/pages/Achievements";
import Coins from "@/pages/Coins";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";

function Router() { return <DashboardLayout><Switch><Route path="/" component={Dashboard} /><Route path="/study-plan" component={StudyPlan} /><Route path="/tasks" component={Tasks} /><Route path="/daily" component={Tasks} /><Route path="/habits" component={Habits} /><Route path="/goals" component={Goals} /><Route path="/pomodoro" component={Pomodoro} /><Route path="/study-video" component={StudyVideo} /><Route path="/exams" component={Exams} /><Route path="/assistant" component={Assistant} /><Route path="/notebooks" component={Notebooks} /><Route path="/calendar" component={CalendarPage} /><Route path="/analytics" component={Analytics} /><Route path="/rewards" component={Rewards} /><Route path="/achievements" component={Achievements} /><Route path="/coins" component={Coins} /><Route path="/settings" component={Settings} /><Route component={NotFound} /></Switch></DashboardLayout>; }
export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light" switchable><TooltipProvider><Toaster position="top-center" richColors /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
