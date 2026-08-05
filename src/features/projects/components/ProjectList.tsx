import { useNavigate } from 'react-router-dom';
import { useProjects } from '../hooks/use-projects';
import { formatRelativeTime } from '@/lib/utils';
import { FolderOpen, ArrowRight, Loader2 } from 'lucide-react';

export function ProjectList() {
  const { data: projects, isLoading, error } = useProjects();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-destructive">Failed to load projects</p>
        <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="rounded-2xl bg-muted/50 p-6">
          <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground/60" />
        </div>
        <h3 className="mt-6 text-lg font-semibold">No projects yet</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Create your first project to start finding and analyzing leads.
          Each project groups businesses by industry or region.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <button
          key={project.id}
          onClick={() => navigate(`/projects/${project.id}`)}
          className="group relative flex flex-col rounded-xl border border-border/50 bg-card p-6 text-left transition-all duration-200 hover:border-primary/30 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="flex items-start justify-between">
            <div className="rounded-lg bg-primary/10 p-2.5">
              <FolderOpen className="h-5 w-5 text-primary" />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100" />
          </div>

          <h3 className="mt-4 font-semibold tracking-tight">{project.name}</h3>

          {project.description && (
            <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
              {project.description}
            </p>
          )}

          <p className="mt-auto pt-4 text-xs text-muted-foreground/70">
            Created {formatRelativeTime(project.created_at)}
          </p>
        </button>
      ))}
    </div>
  );
}
