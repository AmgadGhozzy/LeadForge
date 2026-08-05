import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LayoutGrid, List, Columns, Search, Filter, ArrowRight, Star, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export function PipelinePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<'grid' | 'list' | 'compact'>('grid');
  const [search, setSearch] = useState('');
  
  const activeFilter = searchParams.get('view') || 'all';

  const setFilter = (f: string) => {
    if (f === 'all') {
      searchParams.delete('view');
    } else {
      searchParams.set('view', f);
    }
    setSearchParams(searchParams);
  };

  const { data: businesses, isLoading } = useQuery({
    queryKey: ['pipeline-businesses', projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from('businesses')
        .select('*, website_analyses(*), contacts(*), business_technologies(*)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!projectId
  });

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'IMMEDIATE': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'HIGH': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      case 'MEDIUM': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
      default: return 'text-muted-foreground bg-muted border-border';
    }
  };

  if (isLoading) return <div className="p-8 animate-pulse text-center text-muted-foreground">Loading Pipeline...</div>;

  const filteredBusinesses = businesses?.filter((b: any) => {
    // 1. Search Filter
    const query = search.toLowerCase();
    const matchesSearch = !query || 
      b.name?.toLowerCase().includes(query) ||
      b.categories?.name?.toLowerCase().includes(query) ||
      b.website_analyses?.[0]?.priority_tier?.toLowerCase().includes(query) ||
      b.website_analyses?.[0]?.recommended_offer?.toLowerCase().includes(query);

    // 2. Tab Filter
    let matchesFilter = true;
    if (activeFilter === 'needs_analysis') matchesFilter = b.status !== 'ANALYZED';
    if (activeFilter === 'analyzed') matchesFilter = b.status === 'ANALYZED';
    if (activeFilter === 'immediate') matchesFilter = b.website_analyses?.[0]?.priority_tier === 'IMMEDIATE';
    if (activeFilter === 'needs_website') matchesFilter = !b.website;
    
    // Saved Views logic
    if (activeFilter === 'today') {
      const priority = b.website_analyses?.[0]?.priority_tier;
      const hasPhone = b.contacts?.some((c: any) => c.type === 'PHONE');
      matchesFilter = (priority === 'IMMEDIATE' || priority === 'HIGH') && hasPhone;
    }
    if (activeFilter === 'seo') {
      matchesFilter = !b.website;
    }

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden animate-fade-in">
      
      {/* Header & Command Bar */}
      <div className="border-b bg-card shrink-0 p-4 md:p-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold tracking-tight">Smart Pipeline</h1>
          
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-1 border">
            <Button variant={view === 'grid' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setView('grid')}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setView('list')}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={view === 'compact' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setView('compact')}>
              <Columns className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3 items-center">
          <div className="relative flex-1 w-full group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input 
              placeholder="Search or type commands (e.g., priority:high booking:missing)..." 
              className="pl-9 bg-background font-mono text-sm shadow-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                <span className="text-xs">⌘</span>K
              </kbd>
            </div>
          </div>
          
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 hide-scrollbar">
            <Button variant={activeFilter === 'all' ? 'default' : 'outline'} size="sm" className="h-9 whitespace-nowrap" onClick={() => setFilter('all')}>
              All Leads
            </Button>
            <Button variant={activeFilter === 'needs_analysis' ? 'default' : 'outline'} size="sm" className="h-9 whitespace-nowrap" onClick={() => setFilter('needs_analysis')}>
              Needs Analysis
            </Button>
            <Button variant={activeFilter === 'analyzed' ? 'default' : 'outline'} size="sm" className="h-9 whitespace-nowrap" onClick={() => setFilter('analyzed')}>
              Analyzed
            </Button>
            <Button 
              variant={activeFilter === 'immediate' ? 'default' : 'outline'} 
              size="sm" 
              className={cn("h-9 whitespace-nowrap", activeFilter !== 'immediate' && "text-red-500 border-red-500/20 hover:bg-red-500/10")} 
              onClick={() => setFilter('immediate')}
            >
              Immediate Priority
            </Button>
            <Button variant={activeFilter === 'today' ? 'default' : 'outline'} size="sm" className="h-9 whitespace-nowrap" onClick={() => setFilter('today')}>
              Today's Calls
            </Button>
            <Button variant={activeFilter === 'seo' ? 'default' : 'outline'} size="sm" className="h-9 whitespace-nowrap" onClick={() => setFilter('seo')}>
              SEO Leads
            </Button>
          </div>
        </div>
      </div>

      {/* Pipeline Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-muted/10">
        <div className={cn(
          "grid gap-4",
          view === 'grid' ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" :
          view === 'compact' ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" :
          "grid-cols-1 max-w-4xl mx-auto"
        )}>
          {filteredBusinesses?.map((b: any) => {
            const hasId = b.name && b.address;
            const hasCt = b.contacts?.length > 0;
            const hasWeb = !!b.website;
            const hasTech = b.business_technologies?.length > 0;
            const hasSoc = b.contacts?.some((c: any) => ['FACEBOOK','INSTAGRAM'].includes(c.type));

            return (
              <PipelineCard key={b.id} business={b} projectId={projectId!} />
            );
          })}

          {filteredBusinesses?.length === 0 && (
            <div className="col-span-full py-20 text-center text-muted-foreground border-2 border-dashed rounded-xl">
              <p>No leads match your current filters.</p>
              <Button onClick={() => {setSearch(''); setFilter('all');}} variant="link" className="mt-2">
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Extracted Component to use hooks per-card
import { useNextBestAction } from '@/features/intelligence/hooks/use-next-best-action';
import { ChevronDown, ChevronUp, Phone, MessageCircle } from 'lucide-react';

function PipelineCard({ business, projectId }: { business: any; projectId: string }) {
  const [expanded, setExpanded] = useState(false);
  const intelligence = useNextBestAction(business);
  
  if (!intelligence) return null;
  const { priority, nextBestAction, signals } = intelligence;

  const priorityStyle = priority.tier === 'IMMEDIATE' ? 'border-l-red-500' :
                        priority.tier === 'HIGH' ? 'border-l-amber-500' : 
                        priority.tier === 'MEDIUM' ? 'border-l-blue-500' : 'border-l-transparent';

  const badgeStyle = priority.tier === 'IMMEDIATE' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                     priority.tier === 'HIGH' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                     priority.tier === 'MEDIUM' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                     'bg-muted text-muted-foreground';

  return (
    <div className={cn("flex flex-col bg-card rounded-xl border transition-all hover:shadow-md group", priorityStyle, "border-l-4")}>
      <div className="p-4 flex-1">
        <div className="flex justify-between items-start mb-2">
          <Badge variant="outline" className={cn("text-[10px] px-1.5 h-5", badgeStyle)}>
            {signals.isAnalyzed ? priority.tier : 'NEW LEAD'}
          </Badge>
          <span className="text-[10px] text-muted-foreground font-mono font-semibold">
            SCORE {priority.score}
          </span>
        </div>
        
        <h3 className="font-bold text-lg line-clamp-1 group-hover:text-primary transition-colors">
          <Link to={`/projects/${projectId}/lead/${business.id}`} className="hover:underline">{business.name}</Link>
        </h3>
        
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-0.5"><Star className="h-3 w-3 text-amber-400 fill-amber-400"/> {signals.rating || '-'} ({signals.reviewsCount})</span>
          <span>•</span>
          <span className="truncate">{business.address?.split(',')[0] || 'Unknown'}</span>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Opportunity</span>
            <p className="text-sm font-medium text-purple-400">{nextBestAction.recommended_offer || 'No Offer Detected'}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Problem</span>
            <p className="text-sm text-muted-foreground truncate">{nextBestAction.reason[0] || 'Requires Investigation'}</p>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border/50">
          <span className="text-[10px] uppercase font-bold text-primary tracking-wider">Next: {nextBestAction.action}</span>
          <p className="text-sm font-semibold">{nextBestAction.title}</p>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/50 pt-4 bg-muted/20 animate-in slide-in-from-top-2">
          <h4 className="text-xs font-semibold mb-2 uppercase tracking-wider text-muted-foreground">Digital Setup</h4>
          <div className="grid grid-cols-2 gap-2 text-xs mb-4">
            <div className="flex justify-between p-1.5 bg-background rounded border">
              <span>Website</span>
              <span className={signals.hasWebsite ? 'text-emerald-500' : 'text-red-500'}>{signals.hasWebsite ? '✓' : '✕'}</span>
            </div>
            <div className="flex justify-between p-1.5 bg-background rounded border">
              <span>Booking</span>
              <span className={signals.hasBooking ? 'text-emerald-500' : 'text-red-500'}>{signals.hasBooking ? '✓' : '✕'}</span>
            </div>
            <div className="flex justify-between p-1.5 bg-background rounded border">
              <span>WhatsApp</span>
              <span className={signals.hasWhatsApp ? 'text-emerald-500' : 'text-red-500'}>{signals.hasWhatsApp ? '✓' : '✕'}</span>
            </div>
            <div className="flex justify-between p-1.5 bg-background rounded border">
              <span>Chatbot</span>
              <span className={signals.hasChatbot ? 'text-emerald-500' : 'text-red-500'}>{signals.hasChatbot ? '✓' : '✕'}</span>
            </div>
          </div>
          <h4 className="text-xs font-semibold mb-2 uppercase tracking-wider text-muted-foreground">Score Reasoning</h4>
          <ul className="text-xs space-y-1 text-muted-foreground">
            {priority.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t bg-muted/10 p-2 flex gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          className="flex-1 h-8 text-xs" 
          disabled={!signals.hasPhone}
          onClick={(e) => {
            e.stopPropagation();
            const phone = business.contacts?.find((c: any) => c.type === 'PHONE' || c.type === 'WHATSAPP')?.value;
            if (phone) window.open(`tel:${phone}`);
          }}
        >
          <Phone className="h-3 w-3 mr-1.5" /> Call
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          className="flex-1 h-8 text-xs" 
          disabled={!signals.hasPhone}
          onClick={(e) => {
            e.stopPropagation();
            const phone = business.contacts?.find((c: any) => c.type === 'WHATSAPP' || c.type === 'PHONE')?.value;
            if (phone) {
              const cleanPhone = phone.replace(/[^0-9+]/g, '');
              window.open(`https://wa.me/${cleanPhone.startsWith('+') ? cleanPhone.slice(1) : cleanPhone}`, '_blank');
            }
          }}
        >
          <MessageCircle className="h-3 w-3 mr-1.5" /> WA
        </Button>
        <Button variant="secondary" size="sm" className="flex-1 h-8 text-xs" asChild>
          <Link to={`/projects/${projectId}/lead/${business.id}`}>360 <ArrowRight className="h-3 w-3 ml-1" /></Link>
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
