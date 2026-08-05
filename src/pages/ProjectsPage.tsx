import { ProjectList } from '@/features/projects/components/ProjectList';
import { CreateProjectDialog } from '@/features/projects/components/CreateProjectDialog';

export function ProjectsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Your Projects</h2>
          <p className="mt-1 text-muted-foreground">
            Manage your lead generation campaigns
          </p>
        </div>
        <CreateProjectDialog />
      </div>

      <ProjectList />
    </div>
  );
}
