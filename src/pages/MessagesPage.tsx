import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/features/dashboard/services/dashboard-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, Search, Mail, MessageCircle, Phone, Copy, Check, RotateCw } from 'lucide-react';
import { toast } from 'sonner';

export function MessagesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: result, isLoading } = useQuery({
    queryKey: ['messages', projectId],
    queryFn: () => dashboardApi.getAllSalesAssets(projectId!),
    enabled: !!projectId,
  });

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

  const messages = result?.data || [];

  const copyToClipboard = async (text: string, id: string) => {
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

  if (isLoading) {
    return <div className="text-center py-10 text-muted-foreground">Loading messages...</div>;
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
          <TabsTrigger value="email" className="gap-2">
            <Mail className="h-4 w-4" /> Emails
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-2">
            <MessageCircle className="h-4 w-4" /> WhatsApp
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
          {filteredMessages.map((msg) => (
            <Card key={msg.id} className="overflow-hidden">
              <CardHeader className="bg-muted/30 py-3 px-4 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base font-semibold">{msg.businesses?.name || 'Unknown Business'}</CardTitle>
                    <Badge variant="secondary" className="font-normal capitalize">
                      {msg.offer_templates?.name || 'Custom Offer'}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(msg.created_at).toLocaleDateString()}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x border-b">
                  {/* Email Section */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold flex items-center gap-1.5 text-blue-400">
                        <Mail className="h-4 w-4" /> Email
                      </span>
                      <Button
                        variant="ghost" size="sm" className="h-7 px-2 text-xs"
                        onClick={() => copyToClipboard(msg.email, `${msg.id}-email`)}
                      >
                        {copiedId === `${msg.id}-email` ? <Check className="h-3 w-3 text-emerald-400 mr-1" /> : <Copy className="h-3 w-3 mr-1" />} Copy
                      </Button>
                    </div>
                    <div className="bg-muted/20 p-3 rounded-md text-xs whitespace-pre-wrap text-muted-foreground h-48 overflow-y-auto">
                      {parseEmailSubject(msg.email) && (
                        <span className="font-semibold text-foreground mb-1 block">Subj: {parseEmailSubject(msg.email)}</span>
                      )}
                      {parseEmailBody(msg.email)}
                    </div>
                  </div>

                  {/* WhatsApp Section */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold flex items-center gap-1.5 text-emerald-400">
                        <MessageCircle className="h-4 w-4" /> WhatsApp
                      </span>
                      <Button
                        variant="ghost" size="sm" className="h-7 px-2 text-xs"
                        onClick={() => copyToClipboard(msg.whatsapp, `${msg.id}-wa`)}
                      >
                        {copiedId === `${msg.id}-wa` ? <Check className="h-3 w-3 text-emerald-400 mr-1" /> : <Copy className="h-3 w-3 mr-1" />} Copy
                      </Button>
                    </div>
                    <div className="bg-muted/20 p-3 rounded-md text-xs whitespace-pre-wrap text-muted-foreground h-48 overflow-y-auto">
                      {msg.whatsapp}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredMessages.length === 0 && (
            <p className="text-center text-muted-foreground py-10">No messages match your search.</p>
          )}
        </TabsContent>

        {/* Other Tabs (Simplified for brevity, just filtering the All view or showing specific sections) */}
        {['email', 'whatsapp', 'call', 'followup'].map((tab) => (
          <TabsContent key={tab} value={tab}>
            <div className="text-center py-12 bg-card border rounded-lg">
              <p className="text-muted-foreground">Showing specific {tab} view (Simplified for Beta).</p>
              <p className="text-sm mt-2">Use the "All" tab to view all channels side-by-side.</p>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
