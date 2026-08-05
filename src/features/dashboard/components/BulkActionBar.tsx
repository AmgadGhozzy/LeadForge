import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BulkActionBarProps {
  selectedCount: number;
  isAnalyzing: boolean;
  completed: number;
  total: number;
  onClear: () => void;
  onAnalyze: () => void;
}

export function BulkActionBar({
  selectedCount,
  isAnalyzing,
  completed,
  total,
  onClear,
  onAnalyze,
}: BulkActionBarProps) {
  if (selectedCount === 0 && !isAnalyzing) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300">
      <div className="bg-card border border-border shadow-2xl rounded-full px-4 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2 border-r border-border pr-4">
          <Badge className="bg-primary text-primary-foreground">{selectedCount}</Badge>
          <span className="text-sm font-medium">Selected</span>
        </div>

        {isAnalyzing ? (
          <div className="flex items-center gap-3 px-2">
            <Sparkles className="h-4 w-4 animate-spin text-purple-500" />
            <span className="text-sm font-medium">
              Analyzing... {completed} / {total}
            </span>
            <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden ml-2">
              <div
                className="h-full bg-purple-500 transition-all duration-300"
                style={{ width: `${(completed / total) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={onAnalyze}
              className="bg-purple-600 hover:bg-purple-700 h-8 gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Analyze Selected
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClear}
              className="h-8 w-8 rounded-full hover:bg-destructive/10 hover:text-destructive"
              title="Clear selection"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// Need to add Badge since we used it
import { Badge } from '@/components/ui/badge';
