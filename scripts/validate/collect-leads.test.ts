import { deduplicateAndFilterPool, selectDiverseCandidates } from './collect-leads-utils.js';
import * as assert from 'assert';

function testDeduplication() {
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
  
  assert.strictEqual(result.length, 2, 'Should only have 2 eligible unique candidates');
  assert.strictEqual(result[0].place_id, '1');
  assert.strictEqual(result[1].place_id, '6');
  console.log('✅ testDeduplication passed');
}

function testDiversitySelection() {
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

  assert.strictEqual(result.length, 4, 'Should select exactly the target amount');
  
  const countries = result.map(c => c.country);
  // Round 1: Egypt, Canada, UK
  // Round 2: Egypt
  assert.ok(countries.includes('Egypt'), 'Must include Egypt');
  assert.ok(countries.includes('Canada'), 'Must include Canada');
  assert.ok(countries.includes('UK'), 'Must include UK');
  
  console.log('✅ testDiversitySelection passed');
}

try {
  testDeduplication();
  testDiversitySelection();
  console.log('All tests passed! 🎉');
  process.exit(0);
} catch (err) {
  console.error('Test failed:', err);
  process.exit(1);
}
