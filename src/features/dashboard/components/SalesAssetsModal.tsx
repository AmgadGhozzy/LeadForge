import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Copy, Check, Mail, MessageCircle, Phone, RotateCw, AlertTriangle, Sparkles } from 'lucide-react';
import type { GeneratedMessage, FollowUpStep } from '@/types/database';

interface SalesAssetsModalProps {
  open: boolean;
  onClose: () => void;
  businessName: string;
  priorityTier?: string | null;
  nextAction?: string | null;
  salesAssets: GeneratedMessage | null;
}

export function SalesAssetsModal({
  open,
  onClose,
  businessName,
  priorityTier,
  nextAction,
  salesAssets,
}: SalesAssetsModalProps) {
  const [copiedTab, setCopiedTab] = useState<string | null>(null);

  const copyToClipboard = async (text: string, tab: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedTab(tab);
    setTimeout(() => setCopiedTab(null), 2000);
  };

  const getTierStyle = (tier: string | null | undefined) => {
    switch (tier) {
      case 'IMMEDIATE': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'HIGH': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'MEDIUM': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'LOW': return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getActionIcon = (action: string | null | undefined) => {
    switch (action) {
      case 'CALL': return <Phone className="h-3 w-3" />;
      case 'EMAIL': return <Mail className="h-3 w-3" />;
      case 'WHATSAPP': return <MessageCircle className="h-3 w-3" />;
      default: return null;
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email': return <Mail className="h-4 w-4 text-blue-400" />;
      case 'whatsapp': return <MessageCircle className="h-4 w-4 text-emerald-400" />;
      case 'phone': return <Phone className="h-4 w-4 text-amber-400" />;
      default: return null;
    }
  };

  // Parse cold call script from JSON string
  let coldCallScript = { hook: '', pitch: '', objection_handling: '' };
  if (salesAssets?.cold_call_script) {
    try {
      coldCallScript = typeof salesAssets.cold_call_script === 'string'
        ? JSON.parse(salesAssets.cold_call_script)
        : salesAssets.cold_call_script;
    } catch {
      coldCallScript = { hook: '', pitch: '', objection_handling: salesAssets.cold_call_script };
    }
  }

  const CopyButton = ({ text, tab }: { text: string; tab: string }) => (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={() => copyToClipboard(text, tab)}
    >
      {copiedTab === tab ? (
        <><Check className="h-3.5 w-3.5 text-emerald-500" /> Copied</>
      ) : (
        <><Copy className="h-3.5 w-3.5" /> Copy</>
      )}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 flex-wrap">
            <DialogTitle className="text-xl">{businessName}</DialogTitle>
            {priorityTier && (
              <Badge variant="outline" className={getTierStyle(priorityTier)}>
                {priorityTier === 'IMMEDIATE' && '🔥'}{priorityTier === 'HIGH' && '⭐'}
                {priorityTier === 'MEDIUM' && '🟡'}{priorityTier === 'LOW' && '⚪'}
                {' '}{priorityTier}
              </Badge>
            )}
            {nextAction && nextAction !== 'IGNORE' && (
              <Badge variant="secondary" className="gap-1">
                {getActionIcon(nextAction)} {nextAction}
              </Badge>
            )}
            {salesAssets?.language && (
              <Badge variant="outline" className="text-xs uppercase">
                {salesAssets.language}
              </Badge>
            )}
          </div>
        </DialogHeader>

        {!salesAssets ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Sparkles className="h-10 w-10 text-purple-400/60 mb-4" />
            <p className="text-muted-foreground">No sales assets generated yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Click "Generate Sales" to create personalized outreach.</p>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {/* Offer & Why */}
            <div className="grid grid-cols-1 gap-3">
              {salesAssets.selection_reason && (
                <Card className="border-purple-500/20 bg-purple-500/5">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-purple-400 mb-1">Why this offer?</p>
                        <p className="text-sm">{salesAssets.selection_reason}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              {salesAssets.proposal && (
                <Card className="border-amber-500/20 bg-amber-500/5">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-amber-400 mb-1">Why NOW?</p>
                        <p className="text-sm">{salesAssets.proposal}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Tabbed Content */}
            <Tabs defaultValue="email" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="email" className="gap-1.5 text-xs">
                  <Mail className="h-3.5 w-3.5" /> Email
                </TabsTrigger>
                <TabsTrigger value="whatsapp" className="gap-1.5 text-xs">
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </TabsTrigger>
                <TabsTrigger value="call" className="gap-1.5 text-xs">
                  <Phone className="h-3.5 w-3.5" /> Call
                </TabsTrigger>
                <TabsTrigger value="followup" className="gap-1.5 text-xs">
                  <RotateCw className="h-3.5 w-3.5" /> Follow-up
                </TabsTrigger>
              </TabsList>

              {/* Email Tab */}
              <TabsContent value="email" className="space-y-3 mt-3">
                <div className="flex justify-end">
                  <CopyButton text={salesAssets.email || ''} tab="email" />
                </div>
                <div className="rounded-lg border bg-card p-4 text-sm whitespace-pre-wrap leading-relaxed">
                  {salesAssets.email || 'No email generated.'}
                </div>
              </TabsContent>

              {/* WhatsApp Tab */}
              <TabsContent value="whatsapp" className="space-y-3 mt-3">
                <div className="flex justify-end">
                  <CopyButton text={salesAssets.whatsapp || ''} tab="whatsapp" />
                </div>
                <div className="rounded-lg border bg-card p-4 text-sm whitespace-pre-wrap leading-relaxed">
                  {salesAssets.whatsapp || 'No WhatsApp message generated.'}
                </div>
              </TabsContent>

              {/* Cold Call Tab */}
              <TabsContent value="call" className="space-y-3 mt-3">
                <div className="flex justify-end">
                  <CopyButton
                    text={`Hook: ${coldCallScript.hook}\n\nPitch: ${coldCallScript.pitch}\n\nObjection Handling: ${coldCallScript.objection_handling}`}
                    tab="call"
                  />
                </div>
                <div className="space-y-3">
                  <div className="rounded-lg border bg-card p-4">
                    <p className="text-xs font-semibold text-emerald-400 mb-2">🎯 Hook (10 seconds)</p>
                    <p className="text-sm">{coldCallScript.hook}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <p className="text-xs font-semibold text-blue-400 mb-2">💡 Pitch (30 seconds)</p>
                    <p className="text-sm">{coldCallScript.pitch}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <p className="text-xs font-semibold text-amber-400 mb-2">🛡️ Objection Handling</p>
                    <p className="text-sm whitespace-pre-wrap">{coldCallScript.objection_handling}</p>
                  </div>
                </div>
              </TabsContent>

              {/* Follow-up Tab */}
              <TabsContent value="followup" className="space-y-3 mt-3">
                {salesAssets.follow_up_sequence && salesAssets.follow_up_sequence.length > 0 ? (
                  <div className="space-y-3">
                    {salesAssets.follow_up_sequence.map((step: FollowUpStep, idx: number) => (
                      <div key={idx} className="flex gap-3 items-start">
                        {/* Timeline dot */}
                        <div className="flex flex-col items-center mt-1">
                          <div className="h-8 w-8 rounded-full bg-card border-2 border-primary/30 flex items-center justify-center text-xs font-bold">
                            D{step.day}
                          </div>
                          {idx < salesAssets.follow_up_sequence!.length - 1 && (
                            <div className="w-px h-full min-h-[2rem] bg-border" />
                          )}
                        </div>
                        {/* Content */}
                        <div className="flex-1 rounded-lg border bg-card p-3">
                          <div className="flex items-center gap-2 mb-2">
                            {getChannelIcon(step.channel)}
                            <span className="text-xs font-medium capitalize">{step.channel}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-auto">
                              {step.goal}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{step.message}</p>
                          <div className="flex justify-end mt-2">
                            <CopyButton text={step.message} tab={`followup-${idx}`} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No follow-up sequence generated.</p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
