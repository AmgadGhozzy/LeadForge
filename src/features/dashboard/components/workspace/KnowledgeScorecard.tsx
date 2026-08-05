

export function KnowledgeScorecard({ scores }: { scores: any }) {
  const bars = [
    { label: 'Identity', value: scores.identity, color: 'bg-emerald-500' },
    { label: 'Contacts', value: scores.contacts, color: 'bg-blue-500' },
    { label: 'Website', value: scores.website, color: 'bg-indigo-500' },
    { label: 'Technology', value: scores.technology, color: 'bg-purple-500' },
    { label: 'Social', value: scores.social, color: 'bg-amber-500' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div>
        <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">Canonical Profile Completeness</h3>
        <div className="flex items-center gap-4 mb-6">
          <div className="text-4xl font-black text-primary">{scores.knowledge}%</div>
          <p className="text-xs text-muted-foreground max-w-[200px]">
            This score represents the absolute completeness of our data on this business before AI inference.
          </p>
        </div>
      </div>
      
      <div className="space-y-3">
        {bars.map(bar => (
          <div key={bar.label} className="grid grid-cols-[80px_1fr_40px] items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">{bar.label}</span>
            <div className="h-1.5 w-full bg-secondary overflow-hidden rounded-full">
              <div className={`h-full ${bar.color}`} style={{ width: `${bar.value}%` }} />
            </div>
            <span className="text-xs font-bold text-right">{bar.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
