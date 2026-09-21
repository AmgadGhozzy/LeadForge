import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const snap = fs.readFileSync('scripts/pilot_data/pilot_sample_snapshot.csv', 'utf-8')
  .trim().split('\n').slice(1);
const ids = snap.map(r => r.split(',')[0].replace(/^"|"$/g, ''));

const checks = await Promise.all([
  sb.from('contacts').select('business_id', { count: 'exact', head: true }).in('business_id', ids),
  sb.from('business_capabilities').select('business_id', { count: 'exact', head: true }).in('business_id', ids),
  sb.from('website_pages').select('business_id', { count: 'exact', head: true }).in('business_id', ids),
  sb.from('business_technologies').select('business_id', { count: 'exact', head: true }).in('business_id', ids),
]);

console.log('contacts rows:             ', checks[0].count, checks[0].error?.message ?? '');
console.log('business_capabilities rows:', checks[1].count, checks[1].error?.message ?? '');
console.log('website_pages rows:        ', checks[2].count, checks[2].error?.message ?? '');
console.log('business_technologies rows:', checks[3].count, checks[3].error?.message ?? '');

// Also check distinct types in capabilities if any
if ((checks[1].count ?? 0) > 0) {
  const { data } = await sb.from('business_capabilities')
    .select('type')
    .in('business_id', ids)
    .limit(100);
  const types = [...new Set((data ?? []).map(r => r.type))];
  console.log('capability types found:', types.join(', '));
}
