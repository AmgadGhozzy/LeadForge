import { NavLink, Link, useParams, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import {
  LayoutDashboard,
  KanbanSquare,
  Search,
  BookOpen,
  LineChart,
  Settings,
  FolderOpen,
  Sparkles,
  LogOut,
  PlusCircle,
  Download,
  Phone,
  AlertCircle,
  ListTodo,
  TrendingUp,
  MessageSquare,
  Target,
} from 'lucide-react';

export function Sidebar() {
  const { projectId } = useParams();
  const { user, signOut } = useAuth();
  const location = useLocation();

  const mainNavItems = [
    { to: '', icon: LayoutDashboard, label: 'Command Center', end: true },
    { to: 'pipeline', icon: KanbanSquare, label: 'Pipeline' },
    { to: 'messages', icon: MessageSquare, label: 'Messages Hub' },
    { to: 'search', icon: Search, label: 'Search Sessions' },
    { to: 'knowledge', icon: BookOpen, label: 'Knowledge' },
    { to: 'reports', icon: LineChart, label: 'Reports' },
    { to: 'settings', icon: Settings, label: 'Settings' },
  ];

  const savedViews = [
    { to: 'pipeline?view=booking_gap', icon: Target, label: 'Booking Gap (DBPG)' },
    { to: 'pipeline?view=today', icon: Phone, label: "Today's Calls" },
    { to: 'pipeline?view=immediate', icon: AlertCircle, label: 'Immediate' },
    { to: 'pipeline?view=needs_analysis', icon: ListTodo, label: 'Needs Analysis' },
    { to: 'pipeline?view=seo', icon: TrendingUp, label: 'SEO Leads' },
  ];

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border/50 bg-card/80 backdrop-blur-xl">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border/50 px-6 shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-bold tracking-tight">LeadForge</span>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <nav className="space-y-1 p-3">
          {/* Main Workspace Navigation */}
          {projectId ? (
            <>
              {mainNavItems.map(({ to, icon: Icon, label, end }) => (
                <NavLink
                  key={label}
                  to={`/projects/${projectId}/${to}`}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              ))}

              <div className="my-4 border-t border-border/50" />

              <div className="px-3 pb-2 pt-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Saved Views
                </p>
              </div>
              {savedViews.map(({ to, icon: Icon, label }) => {
                // Manually calculate active state for query params
                const [pathPart, queryPart] = to.split('?');
                const isViewActive = location.pathname.endsWith(pathPart) && location.search.includes(queryPart);

                return (
                  <Link
                    key={label}
                    to={`/projects/${projectId}/${to}`}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
                      isViewActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                );
              })}

              <div className="my-4 border-t border-border/50" />

              <div className="space-y-1">
                <Link to={`/projects/${projectId}/search/new`} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-150">
                  <PlusCircle className="h-4 w-4" />
                  Create Search
                </Link>
                <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-150">
                  <Download className="h-4 w-4" />
                  Import Leads
                </button>
              </div>
            </>
          ) : (
            <NavLink
              to="/"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )
              }
              end
            >
              <FolderOpen className="h-4 w-4" />
              All Projects
            </NavLink>
          )}
        </nav>
      </div>

      {/* Footer — User + Sign Out */}
      <div className="border-t border-border/50 p-4 space-y-3 shrink-0">
        <NavLink
          to="/"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 text-muted-foreground hover:bg-muted hover:text-foreground',
            !projectId && 'hidden'
          )}
          end
        >
          <FolderOpen className="h-4 w-4" />
          Switch Project
        </NavLink>
        {user && (
          <div className="flex items-center gap-3 px-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary uppercase shrink-0">
              {user.email?.[0] ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors duration-150"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
