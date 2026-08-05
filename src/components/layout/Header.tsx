import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useProject } from '@/features/projects/hooks/use-projects';
import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';

export function Header() {
  const { projectId } = useParams();
  const { data: project } = useProject(projectId ?? '');
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  // Initialize from system preference
  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsDark(prefersDark);
  }, []);

  return (
    <header className="flex h-16 items-center justify-between border-b border-border/50 bg-card/30 px-6 backdrop-blur-xl">
      <div>
        {projectId && project ? (
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-muted-foreground">{project.description}</p>
            )}
          </div>
        ) : (
          <h1 className="text-lg font-semibold tracking-tight">Projects</h1>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsDark(!isDark)}
        className="rounded-lg"
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </header>
  );
}
