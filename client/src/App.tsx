import StudyStudio from "@/pages/StudyStudio";
import Backlog from "@/pages/Backlog";
import { Toaster } from "@/components/ui/sonner";
import DashboardLayout from "@/components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Redirect, Route, Switch } from "wouter";
import WorkspaceSearch from "@/pages/WorkspaceSearch";
import Dashboard from "@/pages/Dashboard";
import StudyPlan from "@/pages/StudyPlan";
import LessonSources from "@/pages/LessonSources";
import Exams from "@/pages/Exams";
import CalendarPage from "@/pages/CalendarPage";
import Analytics from "@/pages/Analytics";
import Rewards from "@/pages/Rewards";
import Coins from "@/pages/Coins";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";

function Router() { return <DashboardLayout><Switch><Route path="/" component={Dashboard} /><Route path="/search" component={WorkspaceSearch} /><Route path="/backlog" component={Backlog} /><Route path="/study-plan" component={StudyPlan} /><Route path="/lesson-sources" component={LessonSources} /><Route path="/tasks"><Redirect to="/calendar?view=all" replace /></Route><Route path="/daily"><Redirect to="/calendar?view=all" replace /></Route><Route path="/pomodoro"><Redirect to="/study-video#pomodoro" replace /></Route><Route path="/study-video" component={StudyStudio} /><Route path="/exams" component={Exams} /><Route path="/calendar" component={CalendarPage} /><Route path="/analytics" component={Analytics} /><Route path="/rewards" component={Rewards} /><Route path="/coins" component={Coins} /><Route path="/settings" component={Settings} /><Route component={NotFound} /></Switch></DashboardLayout>; }
export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light" switchable><TooltipProvider><Toaster position="top-center" richColors /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
