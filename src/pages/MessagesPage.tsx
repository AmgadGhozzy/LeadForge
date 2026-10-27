import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/features/dashboard/services/dashboard-api';
import { useBusinesses } from '@/features/dashboard/hooks/use-businesses';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  MessageSquare,
  Search,
  Mail,
  MessageCircle,
  Phone,
  Copy,
  Check,
  RotateCw,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import type { FollowUpStep } from '@/types/database';

export function MessagesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: result, isLoading } = useQuery({
    queryKey: ['messages', projectId],
    queryFn: () => dashboardApi.getAllSalesAssets(projectId!),
    enabled: !!projectId,
  });

  const { data: businessesResult } = useBusinesses(projectId);

  const businessMap = useMemo(() => {
    const map = new Map<string, any>();
    if (businessesResult?.data) {
      businessesResult.data.forEach((b: any) => {
        map.set(b.id, b);
      });
    }
    return map;
  }, [businessesResult]);

  // Parse email subject from the stored "Subject: ...\n\n..." email string
  const parseEmailSubject = (email: string): string => {
    if (!email) return '';
    const firstLine = email.split('\n')[0];
    return firstLine.startsWith('Subject:') ? firstLine.replace('Subject:', '').trim() : '';
  };

  const parseEmailBody = (email: string): string => {
    if (!email) return '';
    const parts = email.split('\n\n');
    return parts.length > 1 ? parts.slice(1).join('\n\n') : email;
  };

  const parseColdCallScript = (script: any) => {
    if (!script) return { hook: '', pitch: '', objection_handling: '' };
    if (typeof script === 'object') {
      return {
        hook: script.hook || '',
        pitch: script.pitch || '',
        objection_handling: script.objection_handling || '',
      };
    }
    try {
      const parsed = JSON.parse(script);
      return {
        hook: parsed.hook || '',
        pitch: parsed.pitch || '',
        objection_handling: parsed.objection_handling || '',
      };
    } catch {
      return { hook: '', pitch: '', objection_handling: script };
    }
  };

  const messages = result?.data || [];

  const copyToClipboard = async (text: string, id: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredMessages = useMemo(() => {
    if (!search) return messages;
    const lowerSearch = search.toLowerCase();
    return messages.filter(
      (m: any) =>
        (m.businesses?.name || '').toLowerCase().includes(lowerSearch) ||
        (m.offer_templates?.name || '').toLowerCase().includes(lowerSearch)
    );
  }, [messages, search]);

  const getBusinessPhone = (businessId: string): string | null => {
    const b = businessMap.get(businessId);
    if (!b?.contacts) return null;
    const wa = b.contacts.find((c: any) => c.type === 'WHATSAPP');
    const ph = b.contacts.find((c: any) => c.type === 'PHONE');
    const raw = wa?.value || ph?.value;
    return raw ? raw.replace(/\D/g, '') : null;
  };

  const getBusinessEmail = (businessId: string): string | null => {
    const b = businessMap.get(businessId);
    if (!b?.contacts) return null;
    const em = b.contacts.find((c: any) => c.type === 'EMAIL');
    return em?.value || null;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 w-48 bg-muted/60 rounded animate-pulse" />
          <div className="h-4 w-72 bg-muted/40 rounded mt-2 animate-pulse" />
        </div>
        <div className="h-10 max-w-md bg-muted/40 rounded-md animate-pulse" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-6 space-y-4 animate-pulse">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="h-5 w-40 bg-muted/60 rounded" />
                <div className="h-4 w-24 bg-muted/40 rounded" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="h-32 bg-muted/30 rounded" />
                <div className="h-32 bg-muted/30 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Messages Hub</h2>
          <p className="mt-1 text-muted-foreground">
            View and manage AI-generated sales messages for your leads
          </p>
        </div>

        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 py-20 text-center">
          <div className="rounded-2xl bg-purple-500/5 p-5">
            <MessageSquare className="h-10 w-10 text-purple-400/60" />
          </div>
          <h3 className="mt-6 text-lg font-semibold">No messages yet</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Messages will be generated after analyzing businesses. Each message is
            personalized based on AI analysis of the business website.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Messages Hub</h2>
        <p className="mt-1 text-muted-foreground">
          {messages.length} generated message{messages.length === 1 ? '' : 's'} across all your leads.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by business name or offer..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="all" className="gap-2">
            <MessageSquare className="h-4 w-4" /> All
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-2">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-2">
            <Mail className="h-4 w-4" /> Emails
          </TabsTrigger>
          <TabsTrigger value="call" className="gap-2">
            <Phone className="h-4 w-4" /> Call Scripts
          </TabsTrigger>
          <TabsTrigger value="followup" className="gap-2">
            <RotateCw className="h-4 w-4" /> Follow-ups
          </TabsTrigger>
        </TabsList>

        {/* All Tab */}
        <TabsContent value="all" className="space-y-6">
          {filteredMessages.map((msg) => {
            const phone = getBusinessPhone(msg.business_id);
            const email = getBusinessEmail(msg.business_id);
            return (
              <Card key={msg.id} className="overflow-hidden">
                <CardHeader className="bg-muted/30 py-3 px-4 border-b">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <CardTitle className="text-base font-semibold" dir="auto">
                        {msg.businesses?.name || 'Unknown Business'}
                      </CardTitle>
                      <Badge variant="secondary" className="font-normal capitalize">
                        {msg.offer_templates?.name || 'Custom Offer'}
                      </Badge>
                      {phone && (
                        <span className="text-xs text-muted-foreground font-mono">
                          +{phone}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(msg.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x border-b">
                    {/* WhatsApp Section */}
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold flex items-center gap-1.5 text-emerald-400">
                          <MessageCircle className="h-4 w-4" /> WhatsApp
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => copyToClipboard(msg.whatsapp || '', `${msg.id}-wa`)}
                          >
                            {copiedId === `${msg.id}-wa` ? (
                              <Check className="h-3 w-3 text-emerald-400 mr-1" />
                            ) : (
                              <Copy className="h-3 w-3 mr-1" />
                            )}
                            Copy
                          </Button>
                          {msg.whatsapp && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs gap-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                              onClick={() => {
                                const url = phone
                                  ? `https://wa.me/${phone}?text=${encodeURIComponent(msg.whatsapp)}`
                                  : `https://wa.me/?text=${encodeURIComponent(msg.whatsapp)}`;
                                window.open(url, '_blank');
                              }}
                            >
                              <ExternalLink className="h-3 w-3" /> Send
                            </Button>
                          )}
                        </div>
                      </div>
                      <div
                        className="bg-muted/20 p-3 rounded-md text-xs whitespace-pre-wrap text-muted-foreground h-48 overflow-y-auto leading-relaxed"
                        dir="auto"
                      >
                        {msg.whatsapp || 'No WhatsApp message generated.'}
                      </div>
                    </div>

                    {/* Email Section */}
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold flex items-center gap-1.5 text-blue-400">
                          <Mail className="h-4 w-4" /> Email
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => copyToClipboard(msg.email || '', `${msg.id}-email`)}
                          >
                            {copiedId === `${msg.id}-email` ? (
                              <Check className="h-3 w-3 text-emerald-400 mr-1" />
                            ) : (
                              <Copy className="h-3 w-3 mr-1" />
                            )}
                            Copy
                          </Button>
                          {msg.email && email && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs gap-1 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                              onClick={() => {
                                const subj = parseEmailSubject(msg.email);
                                const bdy = parseEmailBody(msg.email);
                                window.open(`mailto:${email}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(bdy)}`, '_blank');
                              }}
                            >
                              <ExternalLink className="h-3 w-3" /> Mail
                            </Button>
                          )}
                        </div>
                      </div>
                      <div
                        className="bg-muted/20 p-3 rounded-md text-xs whitespace-pre-wrap text-muted-foreground h-48 overflow-y-auto leading-relaxed"
                        dir="auto"
                      >
                        {parseEmailSubject(msg.email) && (
                          <span className="font-semibold text-foreground mb-1 block">
                            Subj: {parseEmailSubject(msg.email)}
                          </span>
                        )}
                        {parseEmailBody(msg.email) || 'No email generated.'}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filteredMessages.length === 0 && (
            <p className="text-center text-muted-foreground py-10">No messages match your search.</p>
          )}
        </TabsContent>

        {/* WhatsApp Tab */}
        <TabsContent value="whatsapp" className="space-y-4">
          {filteredMessages
            .filter((m) => !!m.whatsapp)
            .map((msg) => {
              const phone = getBusinessPhone(msg.business_id);
              return (
                <Card key={msg.id} className="overflow-hidden">
                  <CardHeader className="bg-emerald-500/5 py-3 px-4 border-b border-emerald-500/10">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <MessageCircle className="h-4 w-4 text-emerald-400" />
                        <CardTitle className="text-base font-semibold" dir="auto">
                          {msg.businesses?.name || 'Unknown Business'}
                        </CardTitle>
                        {phone && (
                          <Badge variant="outline" className="font-mono text-xs text-emerald-400 border-emerald-500/20">
                            +{phone}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() => copyToClipboard(msg.whatsapp || '', `${msg.id}-wa-tab`)}
                        >
                          {copiedId === `${msg.id}-wa-tab` ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400 mr-1" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 mr-1" />
                          )}
                          Copy Message
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 text-xs gap-1.5 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                          onClick={() => {
                            const url = phone
                              ? `https://wa.me/${phone}?text=${encodeURIComponent(msg.whatsapp)}`
                              : `https://wa.me/?text=${encodeURIComponent(msg.whatsapp)}`;
                            window.open(url, '_blank');
                          }}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open in WhatsApp
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div
                      className="bg-card rounded-lg border p-4 text-sm whitespace-pre-wrap leading-relaxed shadow-inner"
                      dir="auto"
                    >
                      {msg.whatsapp}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          {filteredMessages.filter((m) => !!m.whatsapp).length === 0 && (
            <p className="text-center text-muted-foreground py-10">No WhatsApp messages available.</p>
          )}
        </TabsContent>

        {/* Email Tab */}
        <TabsContent value="email" className="space-y-4">
          {filteredMessages
            .filter((m) => !!m.email)
            .map((msg) => {
              const email = getBusinessEmail(msg.business_id);
              const subject = parseEmailSubject(msg.email);
              const body = parseEmailBody(msg.email);
              return (
                <Card key={msg.id} className="overflow-hidden">
                  <CardHeader className="bg-blue-500/5 py-3 px-4 border-b border-blue-500/10">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-blue-400" />
                        <CardTitle className="text-base font-semibold" dir="auto">
                          {msg.businesses?.name || 'Unknown Business'}
                        </CardTitle>
                        {email && (
                          <Badge variant="outline" className="font-mono text-xs text-blue-400 border-blue-500/20">
                            {email}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() => copyToClipboard(subject, `${msg.id}-em-subj`)}
                        >
                          {copiedId === `${msg.id}-em-subj` ? <Check className="h-3.5 w-3.5 text-blue-400 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                          Copy Subject
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() => copyToClipboard(body, `${msg.id}-em-body`)}
                        >
                          {copiedId === `${msg.id}-em-body` ? <Check className="h-3.5 w-3.5 text-blue-400 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                          Copy Body
                        </Button>
                        {email && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-xs gap-1.5 border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
                            onClick={() => {
                              window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
                            }}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Send Email
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {subject && (
                      <div className="p-3 bg-muted/30 rounded-md border text-sm">
                        <span className="text-xs font-semibold text-muted-foreground mr-2">Subject:</span>
                        <span className="font-medium" dir="auto">{subject}</span>
                      </div>
                    )}
                    <div
                      className="bg-card rounded-lg border p-4 text-sm whitespace-pre-wrap leading-relaxed shadow-inner"
                      dir="auto"
                    >
                      {body}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          {filteredMessages.filter((m) => !!m.email).length === 0 && (
            <p className="text-center text-muted-foreground py-10">No emails available.</p>
          )}
        </TabsContent>

        {/* Cold Call Scripts Tab */}
        <TabsContent value="call" className="space-y-4">
          {filteredMessages
            .filter((m) => !!m.cold_call_script)
            .map((msg) => {
              const phone = getBusinessPhone(msg.business_id);
              const script = parseColdCallScript(msg.cold_call_script);
              const fullScript = `Hook:\n${script.hook}\n\nPitch:\n${script.pitch}\n\nObjection Handling:\n${script.objection_handling}`;

              return (
                <Card key={msg.id} className="overflow-hidden">
                  <CardHeader className="bg-amber-500/5 py-3 px-4 border-b border-amber-500/10">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-amber-400" />
                        <CardTitle className="text-base font-semibold" dir="auto">
                          {msg.businesses?.name || 'Unknown Business'}
                        </CardTitle>
                        {phone && (
                          <Badge variant="outline" className="font-mono text-xs text-amber-400 border-amber-500/20">
                            +{phone}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() => copyToClipboard(fullScript, `${msg.id}-call-full`)}
                        >
                          {copiedId === `${msg.id}-call-full` ? (
                            <Check className="h-3.5 w-3.5 text-amber-400 mr-1" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 mr-1" />
                          )}
                          Copy Full Script
                        </Button>
                        {phone && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-xs gap-1.5 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                            onClick={() => {
                              window.open(`tel:+${phone}`, '_self');
                            }}
                          >
                            <Phone className="h-3.5 w-3.5" />
                            Call Now
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="p-3 bg-card border rounded-lg space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                            🎯 Hook (10s)
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[11px]"
                            onClick={() => copyToClipboard(script.hook, `${msg.id}-hook`)}
                          >
                            <Copy className="h-3 w-3 mr-1" /> Copy
                          </Button>
                        </div>
                        <p className="text-sm leading-relaxed" dir="auto">{script.hook}</p>
                      </div>

                      <div className="p-3 bg-card border rounded-lg space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-blue-400 flex items-center gap-1">
                            💡 Pitch (30s)
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[11px]"
                            onClick={() => copyToClipboard(script.pitch, `${msg.id}-pitch`)}
                          >
                            <Copy className="h-3 w-3 mr-1" /> Copy
                          </Button>
                        </div>
                        <p className="text-sm leading-relaxed" dir="auto">{script.pitch}</p>
                      </div>
                    </div>

                    <div className="p-3 bg-card border rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-amber-400 flex items-center gap-1">
                          🛡️ Objection Handling
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[11px]"
                          onClick={() => copyToClipboard(script.objection_handling, `${msg.id}-obj`)}
                        >
                          <Copy className="h-3 w-3 mr-1" /> Copy
                        </Button>
                      </div>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed" dir="auto">
                        {script.objection_handling}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          {filteredMessages.filter((m) => !!m.cold_call_script).length === 0 && (
            <p className="text-center text-muted-foreground py-10">No cold call scripts available.</p>
          )}
        </TabsContent>

        {/* Follow-up Sequences Tab */}
        <TabsContent value="followup" className="space-y-4">
          {filteredMessages
            .filter((m) => m.follow_up_sequence && m.follow_up_sequence.length > 0)
            .map((msg) => {
              const phone = getBusinessPhone(msg.business_id);
              const sequence: FollowUpStep[] = msg.follow_up_sequence || [];

              return (
                <Card key={msg.id} className="overflow-hidden">
                  <CardHeader className="bg-purple-500/5 py-3 px-4 border-b border-purple-500/10">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <RotateCw className="h-4 w-4 text-purple-400" />
                        <CardTitle className="text-base font-semibold" dir="auto">
                          {msg.businesses?.name || 'Unknown Business'}
                        </CardTitle>
                        <Badge variant="outline" className="text-xs text-purple-400 border-purple-500/20">
                          {sequence.length} Step Sequence
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {sequence.map((step, idx) => (
                      <div key={idx} className="flex gap-3 items-start">
                        <div className="flex flex-col items-center mt-1">
                          <div className="h-8 w-8 rounded-full bg-card border-2 border-purple-500/40 flex items-center justify-center text-xs font-bold">
                            D{step.day}
                          </div>
                          {idx < sequence.length - 1 && (
                            <div className="w-px h-full min-h-[2.5rem] bg-border" />
                          )}
                        </div>

                        <div className="flex-1 rounded-lg border bg-card p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            {step.channel === 'whatsapp' ? (
                              <MessageCircle className="h-3.5 w-3.5 text-emerald-400" />
                            ) : step.channel === 'email' ? (
                              <Mail className="h-3.5 w-3.5 text-blue-400" />
                            ) : (
                              <Phone className="h-3.5 w-3.5 text-amber-400" />
                            )}
                            <span className="text-xs font-medium capitalize">{step.channel}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-auto">
                              {step.goal}
                            </Badge>
                          </div>

                          <p className="text-sm text-muted-foreground leading-relaxed" dir="auto">
                            {step.message}
                          </p>

                          <div className="flex justify-end gap-2 pt-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => copyToClipboard(step.message, `${msg.id}-fu-${idx}`)}
                            >
                              {copiedId === `${msg.id}-fu-${idx}` ? (
                                <Check className="h-3 w-3 text-purple-400 mr-1" />
                              ) : (
                                <Copy className="h-3 w-3 mr-1" />
                              )}
                              Copy
                            </Button>
                            {step.channel === 'whatsapp' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2.5 text-xs gap-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                                onClick={() => {
                                  const url = phone
                                    ? `https://wa.me/${phone}?text=${encodeURIComponent(step.message)}`
                                    : `https://wa.me/?text=${encodeURIComponent(step.message)}`;
                                  window.open(url, '_blank');
                                }}
                              >
                                <MessageCircle className="h-3 w-3" /> WhatsApp
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          {filteredMessages.filter((m) => m.follow_up_sequence && m.follow_up_sequence.length > 0).length === 0 && (
            <p className="text-center text-muted-foreground py-10">No follow-up sequences available.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
