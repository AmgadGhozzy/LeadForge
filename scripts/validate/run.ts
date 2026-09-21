import { runValidation } from './comparator.js';
import { generateReport } from './reporter.js';

async function main() {
  try {
    const results = await runValidation();
    generateReport(results);
  } catch (err: any) {
    console.error("Validation Error:", err.message);
    process.exit(1);
  }
}

main();
