'use strict';
// generators.js — Générateurs de données de test Fenua Api

const SHIPPING_TITLES_FRET      = ['Fret pour les îles'];
const SHIPPING_TITLES_DEPOT     = ['Récupération en point relais','Dépôt magasin','Récupérer au magasin','DEPOT EXPRESS','depot-relais','Recup magasin centre'];
const SHIPPING_TITLES_NORMAL    = ['Expédition','Livraison standard','Standard Shipping',''];
const REMOTE_ZONES              = ['taravao','punaauia','papara','mahina','paea','mataiea','tiarei','faaone','vairao','teahupoo','tautira','papenoo','hitiaa','papeari'];
const PAPEETE_ZONES             = ['Papeete','Pirae','Faaa','Arue','Motu uta'];
const PRODUCTS                  = ['ASPIGUN L\'aspirateur sans fil','Lampe de Lecture','SOLID TAPE','Chargeur USB-C','Vélo électrique','Kit cuisine'];
const LIVREURS                  = ['Terii','Manu','Hina','Roa',''];
const PAIEMENTS                 = ['Espèces','Chèque','Virement','ESPECES','especes','cheque','','Cash','cash'];
const LIVRAISON_STATUTS         = ['Livrée','Livraison en attente','Effectuée','Non livrée','livree','LIVREE'];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ── WF1 Generators ────────────────────────────────────────────────────────────

function makePhone() {
  const formats = [
    `+689 ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)}`,
    `689${randInt(80000000,89999999)}`,
    `+689${randInt(80000000,89999999)}`,
    `${randInt(80000000,89999999)}`,
    `(689) ${randInt(80,89)}-${randInt(100000,999999)}`,
    `+689-${randInt(80,89)}-${randInt(100000,999999)}`,
  ];
  return rand(formats);
}

function makeShopifyOrder(opts = {}) {
  const type = opts.type || rand(['normal','fret','depot','normal','normal']); // weighted toward normal
  const isRemote = opts.isRemote ?? (Math.random() < 0.2);

  let shippingTitle;
  if (type === 'fret') shippingTitle = rand(SHIPPING_TITLES_FRET);
  else if (type === 'depot') shippingTitle = rand(SHIPPING_TITLES_DEPOT);
  else shippingTitle = rand(SHIPPING_TITLES_NORMAL);

  const city = isRemote && type === 'normal' ? rand(REMOTE_ZONES) : rand(PAPEETE_ZONES);
  const nProducts = randInt(1, 3);
  const lineItems = Array.from({length: nProducts}, (_, i) => ({
    title: rand(PRODUCTS), quantity: randInt(1, 3)
  }));
  const price = rand([1990, 3500, 7500, 9500, 14500, 25000, 500, 0]);

  return {
    id: randInt(1000000, 9999999),
    order_number: randInt(1000, 9999),
    total_price: String(price + Math.random() < 0.3 ? 0.50 : 0),
    customer: {
      first_name: rand(['Jean','Marie','Teva','Hina','Rayan','Ana','Will']),
      last_name: rand(['Dupont','Tane','Rai','Tamarii','-']),
      email: `test${randInt(1,999)}@test.pf`,
      phone: Math.random() < 0.3 ? makePhone() : null
    },
    shipping_address: Math.random() < 0.05 ? null : {
      address1: `${randInt(1,999)} Rue ${rand(['Cook','Dumont','Colette','du Port','-'])}`,
      city,
      phone: makePhone()
    },
    line_items: lineItems,
    shipping_lines: shippingTitle ? [{ title: shippingTitle }] : [],
    _meta: { type, isRemote, expectedTab: null } // filled by evaluator
  };
}

// Fixed critical test cases for WF1
function wf1CriticalCases() {
  return [
    // FRET exact match
    { id:1, order_number:1001, total_price:'14500', customer:{first_name:'A',last_name:'B',email:'a@b.pf',phone:null}, shipping_address:{address1:'Q',city:'Papeete',phone:'+68987250982'}, line_items:[{title:'TV',quantity:1}], shipping_lines:[{title:'Fret pour les îles'}], _meta:{type:'fret',weekday:1,expectedTab:'FRET'} },
    // FRET partial → NOT fret
    { id:2, order_number:1002, total_price:'5000', customer:{first_name:'A',last_name:'B',email:'a@b.pf',phone:null}, shipping_address:{address1:'Q',city:'Papeete',phone:'87250001'}, line_items:[{title:'Lampe',quantity:1}], shipping_lines:[{title:'Fret'}], _meta:{type:'normal',weekday:2,expectedTab:'Mercredi'} },
    // DEPOT vente casse mixte
    { id:3, order_number:1003, total_price:'3500', customer:{first_name:'A',last_name:'B',email:'a@b.pf',phone:null}, shipping_address:{address1:'Q',city:'Papeete',phone:'87250002'}, line_items:[{title:'Casque',quantity:1}], shipping_lines:[{title:'DEPOT EXPRESS'}], _meta:{type:'depot',weekday:3,expectedTab:'DEPOT_VENTE'} },
    // Récup accent
    { id:4, order_number:1004, total_price:'1990', customer:{first_name:'A',last_name:'B',email:'a@b.pf',phone:null}, shipping_address:{address1:'Q',city:'Faaa',phone:'87250003'}, line_items:[{title:'Brosse',quantity:1}], shipping_lines:[{title:'Récupération en point relais'}], _meta:{type:'depot',weekday:1,expectedTab:'DEPOT_VENTE'} },
    // Zone éloignée → Samedi
    { id:5, order_number:1005, total_price:'7500', customer:{first_name:'A',last_name:'B',email:'a@b.pf',phone:null}, shipping_address:{address1:'Route',city:'Taravao',phone:'87250004'}, line_items:[{title:'Frigo',quantity:1}], shipping_lines:[{title:'Expédition'}], _meta:{type:'normal',weekday:2,isRemote:true,expectedTab:'Samedi'} },
    // DEPOT_VENTE + zone éloignée → DEPOT_VENTE gagne
    { id:6, order_number:1006, total_price:'9500', customer:{first_name:'A',last_name:'B',email:'a@b.pf',phone:null}, shipping_address:{address1:'Route',city:'Papara',phone:'87250005'}, line_items:[{title:'Vélo',quantity:1}], shipping_lines:[{title:'Dépôt magasin'}], _meta:{type:'depot',weekday:3,isRemote:true,expectedTab:'DEPOT_VENTE'} },
    // Vendredi → Lundi
    { id:7, order_number:1007, total_price:'2000', customer:{first_name:'A',last_name:'B',email:'a@b.pf',phone:null}, shipping_address:{address1:'Rue',city:'Papeete',phone:'87250006'}, line_items:[{title:'Livre',quantity:1}], shipping_lines:[{title:'Expédition'}], _meta:{type:'normal',weekday:5,expectedTab:'Lundi'} },
    // Dimanche → Lundi
    { id:8, order_number:1008, total_price:'1500', customer:{first_name:'A',last_name:'B',email:'a@b.pf',phone:null}, shipping_address:{address1:'Rue',city:'Arue',phone:'87250007'}, line_items:[{title:'Badge',quantity:1}], shipping_lines:[{title:'Livraison standard'}], _meta:{type:'normal',weekday:7,expectedTab:'Lundi'} },
    // Pas de shipping_address
    { id:9, order_number:1009, total_price:'500', customer:{first_name:'A',last_name:'B',email:'a@b.pf',phone:'87250008'}, shipping_address:null, line_items:[{title:'Sticker',quantity:5}], shipping_lines:[{title:'Expédition'}], _meta:{type:'normal',weekday:1,expectedTab:'Mardi'} },
    // Téléphone format local sans 689
    { id:10, order_number:1010, total_price:'3000', customer:{first_name:'A',last_name:'B',email:'a@b.pf',phone:null}, shipping_address:{address1:'Rue',city:'Papeete',phone:'87560000'}, line_items:[{title:'Chargeur',quantity:2}], shipping_lines:[{title:'Expédition'}], _meta:{type:'normal',weekday:4,expectedTab:'Vendredi'} },
  ];
}

// ── WF3 Generators ────────────────────────────────────────────────────────────

function makePlanningRow(opts = {}) {
  const livraison = opts.livraison || rand(LIVRAISON_STATUTS);
  const prix = opts.prix !== undefined ? opts.prix : rand(['7500 F','9500 F','1990 F','14500 F','3500 F','0 F','','abc']);
  return {
    row_number: opts.row || randInt(2, 50),
    'Prix TOTAL': prix,
    'Livraison': livraison,
    'Téléphone': randInt(68980000000, 68989999999),
    'Lieu de livraison': `-, ${rand(PAPEETE_ZONES)}`,
    'Produits': `${randInt(1,3)} ${rand(PRODUCTS)}`,
    'Moyen de paiement': opts.paiement !== undefined ? opts.paiement : rand(PAIEMENTS),
    'NOTE': rand(['','Appeler avant','Urgent','']),
    'Horaire': rand(['','9h-12h','14h-17h','']),
    'À CLIENT': `${rand(['Jean','Marie','Teva','Hina'])} ${rand(['Dupont','Tane','-'])}`,
    'Livreur': opts.livreur !== undefined ? opts.livreur : rand(LIVREURS),
    'Date': '25/03/2026',
    'ID Shopify': opts.idShopify !== undefined ? opts.idShopify : String(randInt(1000000,9999999)),
    'Réf commande': `#${randInt(1000,9999)}`,
    'Email client': `test${randInt(1,99)}@test.pf`
  };
}

function wf3CriticalCases() {
  return [
    // Case A: 0 livraisons — chaîne doit continuer
    { label: 'A — 0 livraisons (toutes en attente)', rows: [
      makePlanningRow({livraison:'Livraison en attente', row:2}),
      makePlanningRow({livraison:'Livraison en attente', row:3}),
      makePlanningRow({livraison:'Livraison en attente', row:4}),
    ], expected: { totalGeneral: 0, chainComplete: true, comptableRows: 0 } },

    // Case B: 100% livrées espèces
    { label: 'B — 100% livrées espèces', rows: [
      makePlanningRow({livraison:'Livrée', prix:'7500 F', paiement:'Espèces', livreur:'Terii', row:2}),
      makePlanningRow({livraison:'Livrée', prix:'7500 F', paiement:'Espèces', livreur:'Terii', row:3}),
      makePlanningRow({livraison:'Livrée', prix:'9500 F', paiement:'Espèces', livreur:'Manu',  row:4}),
    ], expected: { totalGeneral: 24500, totalEspeces: 24500, chainComplete: true, comptableRows: 2 } },

    // Case C: Mix livré/annulé/en attente
    { label: 'C — Mix livré/annulé/en attente', rows: [
      makePlanningRow({livraison:'Livrée',             prix:'7500 F', paiement:'Chèque',  livreur:'Terii', row:2}),
      makePlanningRow({livraison:'Livraison en attente',prix:'7500 F',paiement:'',        livreur:'',      row:3}),
      makePlanningRow({livraison:'Effectuée',          prix:'3500 F', paiement:'Virement',livreur:'Manu',  row:4}),
      makePlanningRow({livraison:'Non livrée',         prix:'9500 F', paiement:'',        livreur:'Terii', row:5}),
    ], expected: { totalGeneral: 11000, totalCheque: 7500, totalVirement: 3500, chainComplete: true } },

    // Case D: Moyen de paiement vide → espèces par défaut
    { label: 'D — Paiement vide → espèces défaut', rows: [
      makePlanningRow({livraison:'Livrée', prix:'7500 F', paiement:'', livreur:'Terii', row:2}),
    ], expected: { totalGeneral: 7500, totalEspeces: 7500, chainComplete: true } },

    // Case E: Même livreur, 2 paiements différents → 2 lignes suivi
    { label: 'E — Même livreur, 2 paiements → 2 lignes', rows: [
      makePlanningRow({livraison:'Livrée', prix:'7500 F', paiement:'Espèces', livreur:'Terii', row:2}),
      makePlanningRow({livraison:'Livrée', prix:'3500 F', paiement:'Chèque',  livreur:'Terii', row:3}),
    ], expected: { totalGeneral: 11000, suiviRows: 2, chainComplete: true } },

    // Case F: Prix malformé → 0
    { label: 'F — Prix malformé → 0', rows: [
      makePlanningRow({livraison:'Livrée', prix:'N/A',  paiement:'Espèces', livreur:'Terii', row:2}),
      makePlanningRow({livraison:'Livrée', prix:'',     paiement:'Espèces', livreur:'Manu',  row:3}),
      makePlanningRow({livraison:'Livrée', prix:'7500 F',paiement:'Espèces',livreur:'Terii', row:4}),
    ], expected: { totalGeneral: 7500, chainComplete: true } },

    // Case G: Livreur vide → "Non assigné"
    { label: 'G — Livreur vide → Non assigné', rows: [
      makePlanningRow({livraison:'Livrée', prix:'5000 F', paiement:'Espèces', livreur:'', row:2}),
    ], expected: { totalGeneral: 5000, chainComplete: true, livreurNonAssigne: true } },

    // Case H: ID Shopify vide → row ignorée dans comptable
    { label: 'H — ID Shopify vide → ignoré', rows: [
      makePlanningRow({livraison:'Livrée', prix:'7500 F', paiement:'Espèces', livreur:'Terii', idShopify:'', row:2}),
      makePlanningRow({livraison:'Livrée', prix:'3500 F', paiement:'Espèces', livreur:'Terii', idShopify:'', row:3}),
    ], expected: { totalGeneral: 0, chainComplete: true, comptableRows: 0 } },

    // Case I: ESPECES en majuscules → reconnu
    { label: 'I — ESPECES majuscules', rows: [
      makePlanningRow({livraison:'Livrée', prix:'9500 F', paiement:'ESPECES', livreur:'Manu', row:2}),
    ], expected: { totalGeneral: 9500, totalEspeces: 9500, chainComplete: true } },

    // Case J: Statut "livree" minuscules → reconnu
    { label: 'J — Statut livree minuscules', rows: [
      makePlanningRow({livraison:'livree', prix:'7500 F', paiement:'Espèces', livreur:'Terii', row:2}),
    ], expected: { totalGeneral: 7500, chainComplete: true } },
  ];
}

function generateRandomWF3Cases(n = 10) {
  const cases = [];
  for (let i = 0; i < n; i++) {
    const nRows = randInt(1, 15);
    const rows = Array.from({length: nRows}, (_, j) => makePlanningRow({row: j + 2}));
    const delivered = rows.filter(r => {
      const n = String(r['Livraison']).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      return n.includes('effectu') || (n.includes('livre') && !n.includes('non livre'));
    });
    const totalGeneral = delivered.reduce((sum, r) => {
      const idShopify = r['ID Shopify'];
      if (!idShopify || idShopify === 'ID Shopify') return sum;
      return sum + (parseInt(String(r['Prix TOTAL']).replace(/[^0-9]/g,''), 10) || 0);
    }, 0);
    cases.push({ label: `Random-${i+1} (${nRows} rows, ${delivered.length} livrées)`, rows, expected: { totalGeneral, chainComplete: true } });
  }
  return cases;
}

module.exports = { wf1CriticalCases, makeShopifyOrder, wf3CriticalCases, generateRandomWF3Cases, LIVREURS, PAIEMENTS };
