import * as fs from 'fs';
import * as path from 'path';

const VALIDATION_DATASET = process.env.VALIDATION_DATASET;
if (!VALIDATION_DATASET) {
  console.error("ERROR: VALIDATION_DATASET environment variable is required.");
  process.exit(1);
}

const DATASET_DIR = path.resolve(process.cwd(), `scripts/validate/datasets/${VALIDATION_DATASET}`);
const REPORT_JSON = path.join(DATASET_DIR, 'report.json');
const REPORT_MD = path.join(DATASET_DIR, 'report.md');

export function generateReport(results: any[]) {
  console.log(`[reporter] Generating report for ${results.length} leads...`);
  
  const types = ['BOOKING', 'WHATSAPP', 'CHATBOT', 'SOCIAL', 'PHONE'];
  const metrics: Record<string, any> = {};
  
  let gateFailed = false;
  let overallInsufficient = false;

  for (const t of types) {
    let refYes = 0;
    let refNoTotal = 0;
    let refNoHighConf = 0;
    
    let tp = 0; // Engine YES, Ref YES
    let fp = 0; // Engine YES, Ref NO (High Conf)
    let tn = 0; // Engine ABSENT, Ref NO (High Conf)
    let fa = 0; // Engine ABSENT, Ref YES
    
    let engineUnknown = 0;
    let justifiedUnknown = 0; // Engine UNKNOWN, Ref UNKNOWN
    let unknownOnYes = 0; // Engine UNKNOWN, Ref YES
    
    // Coverage breakdown for FA
    const faByCoverage = {
      'Home only': 0,
      'Home+Contact': 0,
      'Home+Services': 0,
      '3+ pages': 0
    };

    let totalEvaluated = 0;

    for (const lead of results) {
      const comp = lead.comparisons[t];
      if (!comp) continue;

      const rTruth = comp.reference;
      const rConf = comp.reference_confidence;
      const eTruth = comp.engine;

      totalEvaluated++;

      if (rTruth === 'YES') {
        refYes++;
        if (eTruth === 'PRESENT') tp++;
        else if (eTruth === 'ABSENT') {
          fa++;
          // Categorize by coverage
          if (lead.pages_scraped === 1) faByCoverage['Home only']++;
          else if (lead.pages_scraped === 2) faByCoverage['Home+Contact']++; // Simplified categorization
          else if (lead.pages_scraped >= 3) faByCoverage['3+ pages']++;
        }
        else if (eTruth === 'UNKNOWN') unknownOnYes++;
      } else if (rTruth === 'NO') {
        refNoTotal++;
        if (rConf >= 0.70) {
          refNoHighConf++;
          if (eTruth === 'PRESENT') fp++;
          else if (eTruth === 'ABSENT') tn++;
        }
      } else if (rTruth === 'UNKNOWN') {
        if (eTruth === 'UNKNOWN') justifiedUnknown++;
      }

      if (eTruth === 'UNKNOWN') {
        engineUnknown++;
      }
    }

    const presentPrecision = (tp + fp) > 0 ? (tp / (tp + fp)) : 0;
    const absentPrecision = (tn + fa) > 0 ? (tn / (tn + fa)) : 0;
    const fpr = (fp + tp) > 0 ? (fp / (fp + tp)) : 0;
    const faRate = refYes > 0 ? (fa / refYes) : 0;
    const unknownOnYesRate = refYes > 0 ? (unknownOnYes / refYes) : 0;
    const unknownCorrectness = engineUnknown > 0 ? (justifiedUnknown / engineUnknown) : 0;
    const abstentionRate = totalEvaluated > 0 ? (engineUnknown / totalEvaluated) : 0;

    const isSufficient = refYes >= 6 && refNoHighConf >= 6;
    
    let gateStatus = 'PASS';
    if (!isSufficient) {
      gateStatus = 'INSUFFICIENT_SAMPLE';
      overallInsufficient = true;
    } else {
      if (presentPrecision < 0.90 || absentPrecision < 0.85 || faRate > 0.10 || fpr > 0.05) {
        gateStatus = 'FAIL';
        gateFailed = true;
      }
    }

    metrics[t] = {
      sample: {
        refYes,
        refNoTotal,
        refNoHighConf,
        totalEvaluated
      },
      rates: {
        presentPrecision,
        absentPrecision,
        fpr,
        faRate,
        unknownOnYesRate,
        unknownCorrectness,
        abstentionRate
      },
      faByCoverage,
      gateStatus
    };
  }

  const reportDoc = {
    generated_at: new Date().toISOString(),
    dataset: VALIDATION_DATASET,
    results,
    metrics,
    gateFailed,
    overallInsufficient
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(reportDoc, null, 2));

  // Build Markdown
  let md = `══════════════════════════════════════════════
LeadForge — Evidence Validation Report
Phase 8B — Offline Validation
Dataset: ${VALIDATION_DATASET}
══════════════════════════════════════════════\n\n`;

  for (const t of types) {
    const m = metrics[t];
    md += `────────────────── ${t} ───────────────────\n`;
    md += `Sample: Ref=YES:${m.sample.refYes}  Ref=NO(Total):${m.sample.refNoTotal}  Ref=NO(High-Conf):${m.sample.refNoHighConf}\n`;
    
    if (m.gateStatus === 'INSUFFICIENT_SAMPLE') {
      md += `  ⚠️ INSUFFICIENT_SAMPLE (Requires YES ≥ 6 and NO(High-Conf) ≥ 6)\n\n`;
    } else {
      md += `  PRESENT Precision:     ${(m.rates.presentPrecision*100).toFixed(1)}%   (≥90%)\n`;
      md += `  ABSENT  Precision:     ${(m.rates.absentPrecision*100).toFixed(1)}%   (≥85%)\n`;
      md += `  False Absent Rate:     ${(m.rates.faRate*100).toFixed(1)}%    (≤10%)\n`;
      md += `  False Positive Rate:   ${(m.rates.fpr*100).toFixed(1)}%    (≤5%)\n`;
      md += `  Unknown-on-YES Rate:   ${(m.rates.unknownOnYesRate*100).toFixed(1)}%\n`;
      md += `  UNKNOWN Correctness:   ${(m.rates.unknownCorrectness*100).toFixed(1)}%\n`;
      md += `  Abstention Rate:       ${(m.rates.abstentionRate*100).toFixed(1)}%\n`;
      
      md += `\n  FA by Coverage Breakdown:\n`;
      for (const [cov, val] of Object.entries(m.faByCoverage)) {
        md += `    - ${cov}: ${val}\n`;
      }
      md += `\n  Gate: ${m.gateStatus === 'PASS' ? '✅ PASS' : '❌ FAIL'}\n\n`;
    }
  }

  md += `──────────────── OVERALL GATE ────────────────\n`;
  for (const t of types) {
    md += `  ${t}: ${metrics[t].gateStatus === 'PASS' ? '✅ PASS' : metrics[t].gateStatus === 'FAIL' ? '❌ FAIL' : '⚠️ INSUFFICIENT'}\n`;
  }
  md += `══════════════════════════════════════════════\n`;

  fs.writeFileSync(REPORT_MD, md);
  console.log(md);

  if (gateFailed) {
    console.error("GATE FAILED. Do not merge until resolved.");
    process.exit(1);
  }
}
