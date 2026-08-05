import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function ImportProgress() {
  return (
    <Card className="border-primary/50 shadow-[0_0_15px_rgba(var(--primary),0.1)]">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
        <h3 className="text-lg font-semibold mb-2">Importing Businesses...</h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          Searching Google Places, checking for duplicates, calculating health scores, and saving to database. This may take a minute.
        </p>
      </CardContent>
    </Card>
  );
}
