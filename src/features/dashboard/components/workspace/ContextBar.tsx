import { formatDistanceToNow } from 'date-fns';

export function ContextBar({ profile }: { profile: any }) {
  const analyzedAgo = profile.analysis?.created_at 
    ? formatDistanceToNow(new Date(profile.analysis.created_at), { addSuffix: true })
    : 'Never';

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-muted/30 border-y py-2 px-4 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
      <div className="flex items-center gap-2">
        <span className="opacity-60">Imported</span>
        <span className="text-foreground">Today</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="opacity-60">Analyzed</span>
        <span className="text-foreground">{analyzedAgo}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="opacity-60">Knowledge</span>
        <span className="text-foreground">{profile.scores.knowledge}%</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="opacity-60">AI</span>
        <span className={profile.analysis ? "text-emerald-500" : "text-amber-500"}>
          {profile.analysis ? 'Ready' : 'Pending'}
        </span>
      </div>
    </div>
  );
}
