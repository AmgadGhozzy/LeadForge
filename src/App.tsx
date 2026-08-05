import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from '@/lib/query-client';
import { AuthProvider } from '@/lib/auth-context';
import { Toaster } from 'sonner';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/auth/LoginPage';
import { SignupPage } from '@/pages/auth/SignupPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { SearchPage } from '@/pages/SearchPage';
import { PipelinePage } from '@/pages/PipelinePage';
import { SearchSessionsPage } from '@/pages/SearchSessionsPage';
import { KnowledgeCenterPage } from '@/pages/KnowledgeCenterPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { MessagesPage } from '@/pages/MessagesPage';
import { LeadWorkspacePage } from '@/pages/LeadWorkspacePage';
import { DataInspectorPage } from '@/pages/DataInspectorPage';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                {/* Projects */}
                <Route index element={<ProjectsPage />} />

                {/* Project-scoped routes */}
                <Route path="projects/:projectId">
                  <Route index element={<DashboardPage />} />
                  <Route path="pipeline" element={<PipelinePage />} />
                  <Route path="search" element={<SearchSessionsPage />} />
                  <Route path="search/new" element={<SearchPage />} />
                  <Route path="knowledge" element={<KnowledgeCenterPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="messages" element={<MessagesPage />} />
                  <Route path="lead/:businessId" element={<LeadWorkspacePage />} />
                  <Route path="lead/:businessId/inspector" element={<DataInspectorPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
      <Toaster richColors position="bottom-right" />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
