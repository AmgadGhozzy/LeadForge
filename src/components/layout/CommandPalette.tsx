import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, Folder, Zap, PieChart, Users, Keyboard } from 'lucide-react';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { projectId } = useParams();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleSelect = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const commands = [
    { name: 'Go to Command Center', path: `/projects/${projectId}`, icon: Zap },
    { name: 'Open Pipeline', path: `/projects/${projectId}/pipeline`, icon: Users },
    { name: 'New Search Session', path: `/projects/${projectId}/search/new`, icon: Search },
    { name: 'View Search History', path: `/projects/${projectId}/search`, icon: Folder },
    { name: 'Knowledge Center', path: `/projects/${projectId}/knowledge`, icon: PieChart },
  ];

  const filtered = commands.filter((cmd) =>
    cmd.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50 md:hidden">
        <button
          onClick={() => setOpen(true)}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
        >
          <Search className="h-5 w-5" />
        </button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 overflow-hidden max-w-2xl gap-0 border-border/50">
          <VisuallyHidden.Root>
            <DialogTitle>Command Palette</DialogTitle>
            <DialogDescription>Quickly navigate the app</DialogDescription>
          </VisuallyHidden.Root>
          <div className="flex items-center border-b border-border/50 px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              placeholder="Type a command or search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-14 w-full border-0 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-0 shadow-none"
            />
            <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
              <Keyboard className="h-3 w-3" /> ESC
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                No results found.
              </p>
            ) : (
              <div className="space-y-1">
                {filtered.map((cmd) => (
                  <button
                    key={cmd.name}
                    onClick={() => handleSelect(cmd.path)}
                    className="flex w-full items-center rounded-md px-4 py-3 text-sm hover:bg-muted transition-colors text-left"
                  >
                    <cmd.icon className="mr-3 h-4 w-4 text-muted-foreground" />
                    <span>{cmd.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
