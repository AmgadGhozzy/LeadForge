import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Code, Terminal, Hash, Database, Clock, Bot, Activity } from 'lucide-react';
import { extractDbpgEvidence } from '../../utils/dbpg-Shared';

export function DeveloperMode({ profile }: { profile: any }) {
  const [level, setLevel] = useState<'off' | 'basic' | 'advanced'>('off');

  const dbpg = extractDbpgEvidence({
    ...profile,
    website: profile?.digitalPresence?.website,
    website_analyses: profile?.analysis ? [profile.analysis] : [],
    business_capabilities: profile?.capabilities,
    business_technologies: profile?.technologies,
    contacts: profile?.contacts,
  });

  const analyzedAt = profile?.analysis?.created_at
    ? new Date(profile.analysis.created_at).toISOString()
    : 'Not Analyzed';

  const itemsCount =
    profile?.insights?.length ||
    profile?.analysis?.analysis_items?.length ||
    0;

  const salesStatus =
    (profile?.analysis?.generated_messages?.length ?? 0) > 0
      ? 'Assets Generated'
      : 'Pending Generation';

  if (level === 'off') {
    return (
      <div className="flex justify-end pt-12 pb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLevel('basic')}
          className="text-muted-foreground hover:text-primary gap-2 h-7 text-xs"
        >
          <Code className="h-3.5 w-3.5" /> Enable Developer Mode
        </Button>
      </div>
    );
  }

  return (
    <div className="border-t border-dashed mt-12 pt-8 pb-12 space-y-6 animate-in slide-in-from-bottom-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-mono font-semibold flex items-center gap-2">
          <Terminal className="h-5 w-5 text-primary" /> Developer Inspector
        </h3>
        <div className="flex bg-muted rounded-md p-1">
          <Button
            variant={level === 'basic' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setLevel('basic')}
            className="h-7 text-xs px-3"
          >
            Basic
          </Button>
          <Button
            variant={level === 'advanced' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setLevel('advanced')}
            className="h-7 text-xs px-3"
          >
            Advanced
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLevel('off')}
            className="h-7 text-xs px-3 text-red-500 hover:text-red-600 hover:bg-red-500/10"
          >
            Disable
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Basic Level Data */}
        <div className="rounded-md border bg-black/90 p-4 overflow-hidden flex flex-col h-[400px]">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono mb-3 border-b border-white/10 pb-2">
            <Database className="h-3.5 w-3.5" /> Canonical Profile JSON
          </div>
          <div className="overflow-auto text-[10px] text-white/80 font-mono flex-1">
            <pre>{JSON.stringify(profile, null, 2)}</pre>
          </div>
        </div>

        <div className="rounded-md border bg-black/90 p-4 overflow-hidden flex flex-col h-[400px]">
          <div className="flex items-center gap-2 text-blue-400 text-xs font-mono mb-3 border-b border-white/10 pb-2">
            <Bot className="h-3.5 w-3.5" /> AI Engine Output
          </div>
          <div className="overflow-auto text-[10px] text-white/80 font-mono flex-1">
            <pre>{JSON.stringify(profile?.analysis, null, 2)}</pre>
          </div>
        </div>

        {/* Advanced Level Data */}
        {level === 'advanced' && (
          <>
            <div className="rounded-md border bg-black/90 p-4 overflow-hidden flex flex-col h-[300px]">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-mono mb-3 border-b border-white/10 pb-2">
                <Hash className="h-3.5 w-3.5" /> Hashes & Versions
              </div>
              <div className="overflow-auto text-xs text-white/80 font-mono space-y-4">
                <div>
                  <span className="text-white/50">Aggregate Hash:</span>
                  <p className="break-all">{profile?.aggregateHash || 'Not computed'}</p>
                </div>
                <div>
                  <span className="text-white/50">Rules Version:</span>
                  <p>{profile?.analysis?.analysis_items?.[0]?.rules_version || 'rules-v1.0'}</p>
                </div>
                <div>
                  <span className="text-white/50">Prompt Version:</span>
                  <p>{profile?.analysis?.analysis_items?.[0]?.prompt_version || 'consultant-v2.0'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-md border bg-black/90 p-4 overflow-hidden flex flex-col h-[300px]">
              <div className="flex items-center justify-between text-purple-400 text-xs font-mono mb-3 border-b border-white/10 pb-2">
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5" /> Engine Telemetry & Pipeline State
                </div>
              </div>
              <div className="overflow-auto text-xs text-white/80 font-mono space-y-3">
                <div>
                  <span className="text-white/50">Engine Version:</span> {dbpg.engineVersion}
                </div>
                <div>
                  <span className="text-white/50">Rule Slug:</span> {dbpg.ruleSlug}
                </div>
                <div>
                  <span className="text-white/50">DBPG Status:</span> {dbpg.status} ({dbpg.statusLabel})
                </div>
                <div>
                  <span className="text-white/50">Verification Strength:</span>{' '}
                  {dbpg.verificationStrength || 'UNVERIFIED_EXTERNAL_STATE'}
                </div>
                <div>
                  <span className="text-white/50">Analyzed At:</span> {analyzedAt}
                </div>
                <div>
                  <span className="text-white/50">Evidence Signals Count:</span> {itemsCount}
                </div>
                <div>
                  <span className="text-white/50">Sales Assets Status:</span> {salesStatus}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
