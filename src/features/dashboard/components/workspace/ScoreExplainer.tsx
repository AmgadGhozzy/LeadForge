import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { HelpCircle, Plus, Minus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function ScoreExplainer({ profile }: { profile: any }) {
  if (!profile.analysis) return null;

  // We are simulating the math breakdown here for the UI based on actual presence
  // Since the real PriorityCalculator does this in the backend, we mirror the logic for transparency.
  const baseScore = profile.analysis.lead_score || 0;
  
  const rules = [];
  if (profile.identity.category && profile.reputation.reviews > 100) rules.push({ type: 'add', value: 15, label: 'High Reviews Volume' });
  if (profile.digitalPresence.website) rules.push({ type: 'add', value: 10, label: 'Website Active' });
  if (profile.contacts.some((c: any) => c.type === 'FACEBOOK')) rules.push({ type: 'add', value: 10, label: 'Facebook Detected' });
  
  if (profile.facts.find((f: any) => f.signalId === 'BOOKING_MISSING' && f.isPresent)) {
    rules.push({ type: 'sub', value: 20, label: 'No Booking System' });
  }
  if (profile.facts.find((f: any) => f.signalId === 'WHATSAPP_MISSING' && f.isPresent)) {
    rules.push({ type: 'sub', value: 10, label: 'No WhatsApp' });
  }

  // Fallback if rule engine hasn't populated facts yet
  if (rules.length === 0) {
    rules.push({ type: 'add', value: baseScore, label: 'AI Baseline Score' });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground hover:text-primary px-2 gap-1 mt-2">
          <HelpCircle className="h-3 w-3" /> Why?
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="font-semibold text-sm">Lead Score</span>
            <span className="text-xl font-black text-primary">{baseScore}</span>
          </div>
          
          <div className="space-y-2">
            {rules.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  {r.type === 'add' ? <Plus className="h-3 w-3 text-emerald-500" /> : <Minus className="h-3 w-3 text-red-500" />}
                  {r.label}
                </span>
                <span className={r.type === 'add' ? 'text-emerald-500 font-medium' : 'text-red-500 font-medium'}>
                  {r.type === 'add' ? '+' : '-'}{r.value}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t text-[10px] text-muted-foreground text-center">
            Last updated: {formatDistanceToNow(new Date(profile.analysis.created_at), { addSuffix: true })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
