import AnghamiMusic from "@/pages/AnghamiMusic";
import { QuranPlayerProvider } from "@/components/QuranPlayer";
import QuranAudio from "@/pages/QuranAudio";
import StudyLibrary from "@/pages/StudyLibrary";
import Assessments from "@/pages/Assessments";
import StudyStudio from "@/pages/StudyStudio";
import Backlog from "@/pages/Backlog";
import { Toaster } from "@/components/ui/sonner";
import DashboardLayout from "@/components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Redirect, Route, Switch, useLocation, useSearch } from "wouter";
import WorkspaceSearch from "@/pages/WorkspaceSearch";
import Welcome from "@/pages/Welcome";
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

function Router() {
  const [path] = useLocation();
  const search = useSearch();
  const standalone = path === "/quran" && new URLSearchParams(search).get("player") === "1";
  return <QuranPlayerProvider key={String(standalone)} standalone={standalone}>
    {standalone ? <main className="app-shell mx-auto max-w-lg p-3"><QuranAudio standalone /></main> : <StudyRouter />}
  </QuranPlayerProvider>;
}
function StudyRouter() { return <DashboardLayout><Switch><Route path="/" component={Welcome} /><Route path="/today" component={Dashboard} /><Route path="/search" component={WorkspaceSearch} /><Route path="/backlog" component={Backlog} /><Route path="/study-plan" component={StudyPlan} /><Route path="/lesson-sources" component={LessonSources} /><Route path="/tasks"><Redirect to="/calendar?view=all" replace /></Route><Route path="/daily"><Redirect to="/calendar?view=all" replace /></Route><Route path="/pomodoro"><Redirect to="/study-video#pomodoro" replace /></Route><Route path="/study-video" component={StudyStudio} /><Route path="/study-library"><StudyLibrary /></Route><Route path="/homework"><StudyLibrary section="الواجبات" /></Route><Route path="/mistakes"><StudyLibrary section="كشكول الأخطاء" /></Route><Route path="/year-review"><StudyLibrary section="مراجعة آخر السنة" /></Route><Route path="/assessments" component={Assessments} /><Route path="/exams" component={Exams} /><Route path="/calendar" component={CalendarPage} /><Route path="/quran" component={QuranAudio} /><Route path="/music" component={AnghamiMusic} /><Route path="/analytics" component={Analytics} /><Route path="/rewards" component={Rewards} /><Route path="/coins" component={Coins} /><Route path="/settings" component={Settings} /><Route component={NotFound} /></Switch></DashboardLayout>; }
export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light" switchable><TooltipProvider><Toaster position="top-center" richColors /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
