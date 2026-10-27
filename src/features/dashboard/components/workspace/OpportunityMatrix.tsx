import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Zap,
  TrendingDown,
  Shield,
  DollarSign,
  Users,
  Wrench,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { extractDbpgEvidence, type DbpgEvidence, type Level1Atoms } from '../../utils/dbpg-Shared';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Insight {
  type?: string;
  severity?: string;
  insight?: string;
  finding?: string;
  business_impact?: { impact_type?: string; description?: string } | string;
  technical_fix?: string;
  suggested_offers?: { offer_name?: string }[];
  suggested_offer?: string;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  Critical: {
    label: 'Critical',
    weight: 4,
    bg: 'bg-red-500/8',
    border: 'border-red-500/30',
    badgeBg: 'bg-red-500/15',
    badgeText: 'text-red-400',
    badgeBorder: 'border-red-500/30',
    dot: 'bg-red-500',
    glow: 'shadow-red-500/10',
    icon: AlertCircle,
    iconColor: 'text-red-400',
    stripColor: 'bg-red-500',
  },
  High: {
    label: 'High',
    weight: 3,
    bg: 'bg-orange-500/8',
    border: 'border-orange-500/30',
    badgeBg: 'bg-orange-500/15',
    badgeText: 'text-orange-400',
    badgeBorder: 'border-orange-500/30',
    dot: 'bg-orange-500',
    glow: 'shadow-orange-500/10',
    icon: AlertTriangle,
    iconColor: 'text-orange-400',
    stripColor: 'bg-orange-500',
  },
  Medium: {
    label: 'Medium',
    weight: 2,
    bg: 'bg-amber-500/8',
    border: 'border-amber-500/20',
    badgeBg: 'bg-amber-500/15',
    badgeText: 'text-amber-400',
    badgeBorder: 'border-amber-500/30',
    dot: 'bg-amber-400',
    glow: 'shadow-amber-500/10',
    icon: Zap,
    iconColor: 'text-amber-400',
    stripColor: 'bg-amber-400',
  },
  Low: {
    label: 'Low',
    weight: 1,
    bg: 'bg-blue-500/5',
    border: 'border-blue-500/15',
    badgeBg: 'bg-blue-500/10',
    badgeText: 'text-blue-400',
    badgeBorder: 'border-blue-500/20',
    dot: 'bg-blue-400',
    glow: '',
    icon: Info,
    iconColor: 'text-blue-400',
    stripColor: 'bg-blue-400',
  },
  Info: {
    label: 'Info',
    weight: 0,
    bg: 'bg-muted/30',
    border: 'border-border/50',
    badgeBg: 'bg-muted/50',
    badgeText: 'text-muted-foreground',
    badgeBorder: 'border-border',
    dot: 'bg-muted-foreground',
    glow: '',
    icon: Info,
    iconColor: 'text-muted-foreground',
    stripColor: 'bg-muted-foreground/40',
  },
} as const;

type SeverityKey = keyof typeof SEVERITY_CONFIG;

const IMPACT_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  REVENUE: { icon: DollarSign, label: 'Revenue', color: 'text-emerald-400' },
  REPUTATION: { icon: Shield, label: 'Reputation', color: 'text-purple-400' },
  EFFICIENCY: { icon: TrendingDown, label: 'Efficiency', color: 'text-blue-400' },
  GROWTH: { icon: Users, label: 'Growth', color: 'text-cyan-400' },
  TECHNICAL: { icon: Wrench, label: 'Technical', color: 'text-orange-400' },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const cfg = SEVERITY_CONFIG[severity as SeverityKey] ?? SEVERITY_CONFIG.Info;
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border',
        cfg.badgeBg,
        cfg.badgeText,
        cfg.badgeBorder,
      )}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function ImpactPill({ impactType }: { impactType: string }) {
  const cfg = IMPACT_CONFIG[impactType?.toUpperCase()] ?? null;
  if (!cfg) {
    return (
      <span className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">
        {impactType}
      </span>
    );
  }
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold', cfg.color)}>
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  );
}

function InsightCard({ item, index }: { item: Insight; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const severity = (item.severity as SeverityKey) ?? 'Info';
  const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.Info;

  const label = item.insight ?? item.finding ?? 'No description';
  const offer =
    Array.isArray(item.suggested_offers) && item.suggested_offers[0]?.offer_name
      ? item.suggested_offers[0].offer_name
      : item.suggested_offer;

  const impactType =
    typeof item.business_impact === 'object'
      ? item.business_impact?.impact_type
      : typeof item.business_impact === 'string'
      ? item.business_impact
      : null;

  const hasFix = !!item.technical_fix;

  return (
    <div
      className={cn(
        'relative rounded-xl border overflow-hidden transition-all duration-200',
        'shadow-sm hover:shadow-md',
        cfg.bg,
        cfg.border,
        cfg.glow && `shadow ${cfg.glow}`,
      )}
    >
      <div className={cn('absolute left-0 top-0 bottom-0 w-1 rounded-l-xl', cfg.stripColor)} />

      <div className="pl-5 pr-4 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-[11px] font-bold text-muted-foreground/50 tabular-nums w-4 shrink-0">
            {String(index + 1).padStart(2, '0')}
          </span>

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={severity} />
              {impactType && (
                <>
                  <span className="text-muted-foreground/30 text-xs">·</span>
                  <ImpactPill impactType={impactType} />
                </>
              )}
            </div>

            <p className="text-sm font-semibold leading-snug text-foreground" dir="auto">{label}</p>

            {offer && (
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-purple-400">
                <Sparkles className="h-3 w-3 shrink-0" />
                <span className="truncate" dir="auto">{offer}</span>
              </div>
            )}
          </div>

          {hasFix && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className={cn(
                'shrink-0 mt-0.5 rounded-lg p-1.5 transition-colors',
                'text-muted-foreground hover:text-foreground hover:bg-foreground/8',
              )}
              aria-label={expanded ? 'Collapse fix' : 'Show fix'}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>

        {hasFix && expanded && (
          <div className="mt-3 ml-7 flex items-start gap-2 rounded-lg bg-background/60 border border-border/60 px-3 py-2.5">
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground font-mono leading-relaxed" dir="auto">
              {item.technical_fix}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryStrip({ actionable }: { actionable: Insight[] }) {
  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0 };
  for (const item of actionable) {
    const s = (item.severity as SeverityKey) ?? 'Info';
    if (s in counts) counts[s as keyof typeof counts]++;
  }

  const entries = (['Critical', 'High', 'Medium', 'Low'] as const).filter((s) => counts[s] > 0);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {entries.map((s) => {
        const cfg = SEVERITY_CONFIG[s];
        return (
          <div
            key={s}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold',
              cfg.badgeBg,
              cfg.badgeText,
              cfg.badgeBorder,
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
            {counts[s]} {cfg.label}
          </div>
        );
      })}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-8 rounded-xl border border-dashed border-border/60 bg-muted/10 text-center">
      <div className="h-12 w-12 rounded-full bg-muted/30 flex items-center justify-center">
        <Zap className="h-6 w-6 text-muted-foreground/40" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">No actionable insights yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Run an AI analysis to populate the opportunity matrix.
        </p>
      </div>
    </div>
  );
}

function AtomicSignalsStrip({ dbpg }: { dbpg: DbpgEvidence }) {
  const signalKeys: (keyof Level1Atoms)[] = [
    'CONSULTATION_CTA',
    'APPOINTMENT_CTA',
    'WHATSAPP',
    'DIRECT_CHECKOUT',
    'SELF_SERVICE_PORTAL',
  ];

  return (
    <div className="rounded-xl border bg-card/60 p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={dbpg.badgeVariant} className={cn("text-xs font-semibold px-2 py-0.5", dbpg.badgeStyle)}>
            {dbpg.statusLabel}
          </Badge>
          <span className="text-xs text-muted-foreground font-mono">
            {dbpg.engineVersion} • {dbpg.ruleSlug}
          </span>
        </div>
        {dbpg.verificationLabel && (
          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
            {dbpg.verificationLabel}
          </Badge>
        )}
      </div>

      {/* Atomic Signals Pills */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Level 1 Atomic Evidence Signals
        </p>
        <div className="flex flex-wrap gap-2">
          {signalKeys.map((sig) => {
            const state = dbpg.atoms[sig];
            const isPresent = state === 'PRESENT';
            const isAbsent = state === 'ABSENT';
            return (
              <div
                key={sig}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono font-medium transition-colors",
                  isPresent
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : isAbsent
                    ? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                    : "bg-muted/40 text-muted-foreground border-border"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", isPresent ? "bg-emerald-400" : isAbsent ? "bg-zinc-400" : "bg-muted-foreground")} />
                <span>{sig}</span>
                <span className="text-[10px] opacity-75 uppercase">[{state}]</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Audit Trail */}
      <div className="rounded-lg bg-muted/30 border border-border/50 p-2.5 text-xs text-muted-foreground leading-relaxed" dir="auto">
        <span className="font-semibold text-foreground mr-1.5">Rule Audit:</span>
        {dbpg.auditTrail}
      </div>
    </div>
  );
}

export function OpportunityMatrix({ insights, profile }: { insights: Insight[]; profile?: any }) {
  const dbpg = profile
    ? extractDbpgEvidence({
        ...profile,
        website: profile.digitalPresence?.website,
        website_analyses: profile.analysis ? [profile.analysis] : [],
        business_capabilities: profile.capabilities,
        business_technologies: profile.technologies,
        contacts: profile.contacts,
      })
    : null;

  if (!insights || insights.length === 0) {
    return (
      <div className="space-y-4">
        {dbpg && <AtomicSignalsStrip dbpg={dbpg} />}
        <EmptyState />
      </div>
    );
  }

  const actionable = insights
    .filter((i) => i.type !== 'STRENGTH')
    .sort((a, b) => {
      const w = SEVERITY_CONFIG;
      return (
        (w[(b.severity as SeverityKey)] ?? w.Info).weight -
        (w[(a.severity as SeverityKey)] ?? w.Info).weight
      );
    });

  return (
    <div className="space-y-4">
      {/* Atomic Signals Strip */}
      {dbpg && <AtomicSignalsStrip dbpg={dbpg} />}

      {actionable.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          <SummaryStrip actionable={actionable} />

          <div className="space-y-2">
            {actionable.map((item, i) => (
              <InsightCard key={i} item={item} index={i} />
            ))}
          </div>

          {actionable.some((i) => i.technical_fix) && (
            <p className="text-[11px] text-muted-foreground/50 text-center pt-1 flex items-center justify-center gap-1">
              Tap <ChevronDown className="inline h-3 w-3" /> on a card to reveal the technical fix
            </p>
          )}
        </div>
      )}
    </div>
  );
}
