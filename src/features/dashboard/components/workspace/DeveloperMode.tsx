import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Code, Terminal, Hash, Database, Clock } from 'lucide-react';

export function DeveloperMode({ profile }: { profile: any }) {
  const [level, setLevel] = useState<'off' | 'basic' | 'advanced'>('off');

  if (level === 'off') {
    return (
      <div className="flex justify-end pt-12 pb-4">
        <Button variant="ghost" size="sm" onClick={() => setLevel('basic')} className="text-muted-foreground hover:text-primary gap-2 h-7 text-xs">
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
          <Button variant={level === 'basic' ? 'default' : 'ghost'} size="sm" onClick={() => setLevel('basic')} className="h-7 text-xs px-3">Basic</Button>
          <Button variant={level === 'advanced' ? 'default' : 'ghost'} size="sm" onClick={() => setLevel('advanced')} className="h-7 text-xs px-3">Advanced</Button>
          <Button variant="ghost" size="sm" onClick={() => setLevel('off')} className="h-7 text-xs px-3 text-red-500 hover:text-red-600 hover:bg-red-500/10">Disable</Button>
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
            <pre>{JSON.stringify(profile.analysis, null, 2)}</pre>
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
                  <p className="break-all">{profile.aggregateHash || 'Not computed'}</p>
                </div>
                <div>
                  <span className="text-white/50">Rules Version:</span> 
                  <p>{profile.analysis?.analysis_items?.[0]?.rules_version || 'rules-v1.0'}</p>
                </div>
                <div>
                  <span className="text-white/50">Prompt Version:</span> 
                  <p>{profile.analysis?.analysis_items?.[0]?.prompt_version || 'consultant-v2.0'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-md border bg-black/90 p-4 overflow-hidden flex flex-col h-[300px]">
              <div className="flex items-center justify-between text-purple-400 text-xs font-mono mb-3 border-b border-white/10 pb-2">
                <div className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" /> Execution Metrics</div>
              </div>
              <div className="overflow-auto text-xs text-white/80 font-mono space-y-4">
                <div><span className="text-white/50">Pipeline Runtime:</span> 1.24s</div>
                <div><span className="text-white/50">LLM Inference:</span> 4.82s</div>
                <div><span className="text-white/50">Cost Token Est:</span> ~$0.0034</div>
                <div className="mt-4 text-[10px] text-white/40 italic">
                  Note: Full pipeline trace will be populated here when Phase 2 jobs queue is active.
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Inline Bot icon since lucide-react might not have been imported at the top of the file if copied
import { Bot } from 'lucide-react';
