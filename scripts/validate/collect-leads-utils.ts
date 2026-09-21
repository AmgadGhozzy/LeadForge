export function deduplicateAndFilterPool(pool: any[]) {
  const uniquePlaceIds = new Set<string>();
  const uniqueWebsites = new Set<string>();
  const eligible = [];
  
  for (const b of pool) {
    if (!b.website || b.rating <= 0 || b.reviews <= 0) continue;
    
    let urlObj;
    try {
      urlObj = new URL(b.website.startsWith('http') ? b.website : `https://${b.website}`);
      if (!urlObj.hostname.includes('.')) continue; // Must be a real domain
    } catch {
      continue;
    }
    
    const domain = urlObj.hostname.replace(/^www\./, '').toLowerCase();
    
    if (uniquePlaceIds.has(b.place_id)) continue;
    if (uniqueWebsites.has(domain)) continue;
    
    uniquePlaceIds.add(b.place_id);
    uniqueWebsites.add(domain);
    eligible.push(b);
  }
  
  return eligible;
}

export function selectDiverseCandidates(candidates: any[], target: number) {
  if (candidates.length <= target) return candidates;
  
  const groups: Record<string, any[]> = {};
  for (const c of candidates) {
    const key = c.country || 'Unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }
  
  const selected = [];
  const keys = Object.keys(groups);
  
  let i = 0;
  while (selected.length < target) {
    let pushedInRound = false;
    for (const key of keys) {
      if (groups[key].length > 0) {
        selected.push(groups[key].shift());
        pushedInRound = true;
        if (selected.length === target) break;
      }
    }
    if (!pushedInRound) break;
  }
  
  return selected;
}
