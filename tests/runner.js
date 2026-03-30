'use strict';
// runner.js — Boucle autonome de test Fenua Api (inspiré autoresearch)
// Usage: node tests/runner.js [--cycles N] [--scenarios M] [--once]

const fs   = require('fs');
const path = require('path');

const { runWF1, runWF3 } = require('./simulators');
const { wf1CriticalCases, makeShopifyOrder,
        wf3CriticalCases, generateRandomWF3Cases } = require('./generators');

// ── Config ────────────────────────────────────────────────────────────────────
const ARG_CYCLES    = process.argv.indexOf('--cycles');
const ARG_SCENARIOS = process.argv.indexOf('--scenarios');
const MAX_CYCLES    = ARG_CYCLES    !== -1 ? parseInt(process.argv[ARG_CYCLES    + 1], 10) : 10;
const SCENARIOS_PER = ARG_SCENARIOS !== -1 ? parseInt(process.argv[ARG_SCENARIOS + 1], 10) : 20;
const PASS_STREAK   = parseInt(process.env.PASS_STREAK || '3', 10);
const RUN_ONCE      = process.argv.includes('--once');
const RESULTS_DIR   = path.join(__dirname, '..', 'results');

const REMOTE_ZONES  = ['mataiea','paea','papara','mahina','tiarei','faaone','taravao',
                       'vairao','teahupoo','tautira','papenoo','hitiaa','papeari'];
const WEEKDAYS      = [1, 2, 3, 4, 5, 6, 7];

function norm(str) {
  return String(str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ── WF1 Evaluator ─────────────────────────────────────────────────────────────

/**
 * @param {string} label
 * @param {object} order     Shopify order object
 * @param {number} weekday   1=Mon … 7=Sun (Luxon convention)
 * @param {string} [expectedRoute]  Expected route string, auto-derived if omitted
 */
function evalWF1(label, order, weekday, expectedRoute) {
  let result;
  try {
    result = runWF1(order, weekday);
  } catch (e) {
    return { label, pass: false, failures: [`CRASH: ${e.message}`] };
  }

  const { extracted, route } = result;
  const failures = [];

  // 1. Phone E.164 (or empty allowed)
  if (extracted.telephone && !/^\+689\d{6,8}$/.test(extracted.telephone)) {
    failures.push(`phone: "${extracted.telephone}" invalide (attendu +689XXXXXXXX)`);
  }

  // 2. isFret exact match only for "Fret pour les îles"
  const shTitle   = (order.shipping_lines || [])[0]?.title || '';
  const shouldFret = shTitle === 'Fret pour les îles';
  if (extracted.isFret !== shouldFret) {
    failures.push(`isFret: attendu ${shouldFret}, obtenu ${extracted.isFret} (title="${shTitle}")`);
  }

  // 3. isDepotVente accent-insensitive, NOT triggered for FRET
  const titleNorm  = norm(shTitle);
  const shouldDepot = !shouldFret && (titleNorm.includes('recup') || titleNorm.includes('depot'));
  if (extracted.isDepotVente !== shouldDepot) {
    failures.push(`isDepotVente: attendu ${shouldDepot}, obtenu ${extracted.isDepotVente} (title="${shTitle}")`);
  }

  // 4. Route
  if (!expectedRoute) {
    const addrNorm = norm(extracted.lieuLivraison);
    const isRemote = REMOTE_ZONES.some(z => addrNorm.includes(z));
    const dayMap   = { 1:'Mardi', 2:'Mercredi', 3:'Jeudi', 4:'Vendredi', 5:'Samedi', 6:'Lundi' };
    if (shouldFret)       expectedRoute = 'FRET';
    else if (shouldDepot) expectedRoute = 'Depot-Vente';
    else if (isRemote)    expectedRoute = 'Samedi';
    else if (weekday === 5 || weekday === 6 || weekday === 7) expectedRoute = 'Lundi';
    else                  expectedRoute = dayMap[weekday] || 'Lundi';
  }
  if (route !== expectedRoute) {
    failures.push(`route: attendu "${expectedRoute}", obtenu "${route}" (weekday=${weekday})`);
  }

  // 5. prixTotal format
  if (!/^\d+ F$/.test(extracted.prixTotal)) {
    failures.push(`prixTotal: "${extracted.prixTotal}" invalide (attendu "<N> F")`);
  }

  // 6. Missing shipping_address → "Non spécifié"
  if (!order.shipping_address && extracted.lieuLivraison !== 'Non spécifié') {
    failures.push(`lieuLivraison: sans adresse devrait être "Non spécifié", obtenu "${extracted.lieuLivraison}"`);
  }

  // 7. idShopify is string
  if (typeof extracted.idShopify !== 'string') {
    failures.push(`idShopify type: attendu string, obtenu ${typeof extracted.idShopify}`);
  }

  return { label, pass: failures.length === 0, failures };
}

// ── WF3 Evaluator ─────────────────────────────────────────────────────────────

/**
 * @param {string} label
 * @param {object[]} rows    Planning sheet rows
 * @param {object}  [exp]    Expected: { totalGeneral, totalEspeces, totalCheque, totalVirement,
 *                                       chainComplete, suiviRows, comptableRows, livreurNonAssigne }
 */
function evalWF3(label, rows, exp = {}) {
  let result;
  try {
    result = runWF3(rows);
  } catch (e) {
    return { label, pass: false, failures: [`CRASH: ${e.message}`] };
  }

  const { comptable, forHistorique, suiviRows, forSuivi, chainComplete, totals } = result;
  const failures = [];

  // 1. Prepare Comptable always returns 1+ items
  if (!comptable || comptable.length === 0) {
    failures.push('comptable: doit retourner 1+ items même si 0 livraisons');
  }

  // 2. Chain always completes
  if (!chainComplete) {
    failures.push('chainComplete: False — Clear Today Sheet ne s\'exécuterait pas');
  }

  // 3. Prepare Suivi Rows always returns 1+ items
  if (!suiviRows || suiviRows.length === 0) {
    failures.push('suiviRows: doit retourner 1+ items');
  }

  // 4. Filters strip _summaryOnly
  if (forHistorique.some(i => i._summaryOnly)) {
    failures.push('forHistorique: item _summaryOnly ne doit pas passer');
  }
  if (forSuivi.some(i => i._summaryOnly)) {
    failures.push('forSuivi: item _summaryOnly ne doit pas passer');
  }

  // 5. Totals accuracy (only check fields present in exp)
  if (exp.totalGeneral !== undefined && totals.totalGeneral !== exp.totalGeneral) {
    failures.push(`totalGeneral: attendu ${exp.totalGeneral}, obtenu ${totals.totalGeneral}`);
  }
  if (exp.totalEspeces !== undefined && totals.totalEspeces !== exp.totalEspeces) {
    failures.push(`totalEspeces: attendu ${exp.totalEspeces}, obtenu ${totals.totalEspeces}`);
  }
  if (exp.totalCheque !== undefined && totals.totalCheque !== exp.totalCheque) {
    failures.push(`totalCheque: attendu ${exp.totalCheque}, obtenu ${totals.totalCheque}`);
  }
  if (exp.totalVirement !== undefined && totals.totalVirement !== exp.totalVirement) {
    failures.push(`totalVirement: attendu ${exp.totalVirement}, obtenu ${totals.totalVirement}`);
  }

  // 6. Expected suivi row count
  if (exp.suiviRows !== undefined && forSuivi.length !== exp.suiviRows) {
    failures.push(`suivi row count: attendu ${exp.suiviRows}, obtenu ${forSuivi.length}`);
  }

  // 7. Livreur vide → "Non assigné"
  if (exp.livreurNonAssigne) {
    const hasNonAssigne = Object.keys(totals.livreurStats || {}).some(k => k === 'Non assigné');
    if (!hasNonAssigne) {
      failures.push('livreurNonAssigne: livreur vide devrait être compté sous "Non assigné"');
    }
  }

  // 8. No negative totals
  if (totals.totalGeneral < 0) failures.push(`totalGeneral négatif: ${totals.totalGeneral}`);

  return { label, pass: failures.length === 0, failures };
}

// ── Cycle ─────────────────────────────────────────────────────────────────────

function runCycle(cycleNum) {
  const results = { cycle: cycleNum, wf1: [], wf3: [], passed: 0, failed: 0 };

  // WF1 — fixed critical cases
  for (const order of wf1CriticalCases()) {
    const { weekday, expectedTab } = order._meta;
    // Map expectedTab to route name
    const routeMap = { FRET:'FRET', DEPOT_VENTE:'Depot-Vente', Lundi:'Lundi', Mardi:'Mardi',
                       Mercredi:'Mercredi', Jeudi:'Jeudi', Vendredi:'Vendredi', Samedi:'Samedi' };
    const expectedRoute = routeMap[expectedTab];
    const label = `WF1-crit #${order.id} (${expectedTab})`;
    const ev = evalWF1(label, order, weekday, expectedRoute);
    results.wf1.push(ev);
    ev.pass ? results.passed++ : results.failed++;
  }

  // WF1 — random scenarios
  for (let i = 0; i < SCENARIOS_PER; i++) {
    const order   = makeShopifyOrder();
    const weekday = WEEKDAYS[Math.floor(Math.random() * WEEKDAYS.length)];
    const ev = evalWF1(`WF1-rand-${i + 1}`, order, weekday);
    results.wf1.push(ev);
    ev.pass ? results.passed++ : results.failed++;
  }

  // WF3 — fixed critical cases
  for (const { label, rows, expected } of wf3CriticalCases()) {
    const ev = evalWF3(label, rows, expected || {});
    results.wf3.push(ev);
    ev.pass ? results.passed++ : results.failed++;
  }

  // WF3 — random scenarios
  for (const { label, rows, expected } of generateRandomWF3Cases(SCENARIOS_PER)) {
    const ev = evalWF3(label, rows, expected || {});
    results.wf3.push(ev);
    ev.pass ? results.passed++ : results.failed++;
  }

  return results;
}

// ── Output ────────────────────────────────────────────────────────────────────

function printCycleSummary({ cycle, wf1, wf3, passed, failed }) {
  const total = passed + failed;
  const status = failed === 0 ? 'OK  ' : 'FAIL';
  console.log(`\n${'─'.repeat(64)}`);
  console.log(`Cycle ${cycle}  [${status}]  ${passed}/${total} passes`);
  console.log('─'.repeat(64));

  const failures = [...wf1, ...wf3].filter(r => !r.pass);
  if (failures.length === 0) { console.log('  Tous les tests passent.'); return; }

  for (const f of failures) {
    console.log(`  FAIL  ${f.label}`);
    for (const msg of f.failures) console.log(`         > ${msg}`);
  }
}

function saveResults(allCycles) {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(RESULTS_DIR, `run_${ts}.json`);

  let streak = 0;
  for (let i = allCycles.length - 1; i >= 0; i--) {
    if (allCycles[i].failed === 0) streak++;
    else break;
  }

  const summary = {
    date: new Date().toISOString(),
    config: { MAX_CYCLES, SCENARIOS_PER, PASS_STREAK },
    cycles: allCycles.length,
    totalPassed: allCycles.reduce((s, c) => s + c.passed, 0),
    totalFailed: allCycles.reduce((s, c) => s + c.failed, 0),
    finalPassStreak: streak,
    runs: allCycles
  };

  fs.writeFileSync(file, JSON.stringify(summary, null, 2), 'utf-8');
  return file;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Fenua Api — Runner autonome ===');
  console.log(`Cycles: ${RUN_ONCE ? 1 : MAX_CYCLES}  |  Scenarios/WF: ${SCENARIOS_PER}  |  Streak cible: ${PASS_STREAK}`);

  const allCycles = [];
  let streak = 0;
  const cycles = RUN_ONCE ? 1 : MAX_CYCLES;

  for (let c = 1; c <= cycles; c++) {
    const res = runCycle(c);
    allCycles.push(res);
    printCycleSummary(res);

    if (res.failed === 0) {
      streak++;
      if (!RUN_ONCE && streak >= PASS_STREAK) {
        console.log(`\nArret : ${streak} cycles consecutifs sans echec.`);
        break;
      }
    } else {
      streak = 0;
    }
  }

  const file = saveResults(allCycles);
  const totalFailed = allCycles.reduce((s, c) => s + c.failed, 0);
  const totalPassed = allCycles.reduce((s, c) => s + c.passed, 0);

  console.log('\n' + '='.repeat(64));
  console.log(`FIN  ${allCycles.length} cycles  |  ${totalPassed} passes / ${totalFailed} echecs`);
  console.log(`Resultats sauvegardes: ${file}`);
  console.log(totalFailed === 0 ? 'Statut: TOUS LES TESTS PASSENT' : `Statut: ${totalFailed} echec(s) — voir rapport`);
  console.log('='.repeat(64));

  process.exit(totalFailed === 0 ? 0 : 1);
}

main();
