import { describe, it, expect } from 'vitest';
import { deduplicateAndFilterPool, selectDiverseCandidates } from './collect-leads-utils.js';

describe('collect-leads candidate pool selection', () => {
  it('deduplicates and filters pool candidates', () => {
    const pool = [
      { place_id: '1', website: 'https://example.com', rating: 4, reviews: 10 },
      { place_id: '1', website: 'https://example.com', rating: 4, reviews: 10 }, // duplicate place_id
      { place_id: '2', website: 'http://www.example.com/', rating: 5, reviews: 100 }, // duplicate domain
      { place_id: '3', website: 'https://another.com', rating: 0, reviews: 10 }, // rating 0
      { place_id: '4', website: null, rating: 5, reviews: 10 }, // no website
      { place_id: '5', website: 'not-a-url', rating: 5, reviews: 10 }, // invalid url
      { place_id: '6', website: 'https://valid.com', rating: 3, reviews: 5 } // valid
    ];

    const result = deduplicateAndFilterPool(pool);

    expect(result.length).toBe(2);
    expect(result[0].place_id).toBe('1');
    expect(result[1].place_id).toBe('6');
  });

  it('selects diverse candidates across countries', () => {
    const candidates = [
      { id: '1', country: 'Egypt' },
      { id: '2', country: 'Egypt' },
      { id: '3', country: 'Egypt' },
      { id: '4', country: 'Canada' },
      { id: '5', country: 'Canada' },
      { id: '6', country: 'UK' }
    ];

    const target = 4;
    const result = selectDiverseCandidates(candidates, target);

    expect(result.length).toBe(4);
    const countries = result.map(c => c.country);
    expect(countries).toContain('Egypt');
    expect(countries).toContain('Canada');
    expect(countries).toContain('UK');
  });
});
