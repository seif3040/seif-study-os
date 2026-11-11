import { Toaster } from "@/components/ui/sonner";
import DashboardLayout from "@/components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Redirect, Route, Switch } from "wouter";
import Dashboard from "@/pages/Dashboard";
import StudyPlan from "@/pages/StudyPlan";
import LessonSources from "@/pages/LessonSources";
import Habits from "@/pages/Habits";
import Pomodoro from "@/pages/Pomodoro";
import StudyVideo from "@/pages/StudyVideo";
import Exams from "@/pages/Exams";
import FocusLounge from "@/pages/FocusLounge";
import CalendarPage from "@/pages/CalendarPage";
import Analytics from "@/pages/Analytics";
import Rewards from "@/pages/Rewards";
import Coins from "@/pages/Coins";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";

function Router() { return <DashboardLayout><Switch><Route path="/" component={Dashboard} /><Route path="/focus-lounge" component={FocusLounge} /><Route path="/study-plan" component={StudyPlan} /><Route path="/lesson-sources" component={LessonSources} /><Route path="/tasks"><Redirect to="/calendar?view=all" replace /></Route><Route path="/daily"><Redirect to="/calendar?view=all" replace /></Route><Route path="/habits" component={Habits} /><Route path="/pomodoro" component={Pomodoro} /><Route path="/study-video" component={StudyVideo} /><Route path="/exams" component={Exams} /><Route path="/calendar" component={CalendarPage} /><Route path="/analytics" component={Analytics} /><Route path="/rewards" component={Rewards} /><Route path="/coins" component={Coins} /><Route path="/settings" component={Settings} /><Route component={NotFound} /></Switch></DashboardLayout>; }
export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light" switchable><TooltipProvider><Toaster position="top-center" richColors /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
