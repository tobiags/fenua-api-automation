'use strict';
// simulators.js — Reproduction exacte de la logique JS des workflows

// ── WF1 Simulator ─────────────────────────────────────────────────────────────

function simulateExtractOrderData(order) {
  if (!order || !order.id) throw new Error('[WF1] Commande invalide');

  const lineItems = order.line_items || [];
  const produitsStr = lineItems.map(i => `${i.quantity} ${i.title}`).join(' ; ') || 'Produit inconnu';

  let phone = order.shipping_address?.phone || order.billing_address?.phone || order.phone || order.customer?.phone || '';
  phone = phone.replace(/[\s\-\(\)]/g, '');
  if (phone && !phone.startsWith('+')) {
    phone = phone.startsWith('689') ? '+' + phone : '+689' + phone;
  }

  const emailClient = order.contact_email || order.email || order.customer?.email || '';
  const sh = order.shipping_address || {};
  const lieuLivraison = [sh.address1, sh.city].filter(Boolean).join(', ') || 'Non spécifié';
  const clientName = `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim() || 'Client';
  const prixTotal = `${Math.round(parseFloat(order.total_price || 0))} F`;

  const shippingLines = order.shipping_lines || [];
  const shippingTitle = shippingLines[0]?.title || '';
  const isFret = (shippingTitle === 'Fret pour les îles');

  const shippingTitleLower = shippingTitle.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const isDepotVente = shippingTitleLower.includes('recup') || shippingTitleLower.includes('depot');

  return {
    idShopify: String(order.id), refCommande: `#${order.order_number}`,
    date: '27/03/2026', aClient: clientName, telephone: phone,
    emailClient, lieuLivraison, produits: produitsStr, prixTotal,
    livraison: 'Livraison en attente', isFret, isDepotVente, shippingTitle, orderId: order.id
  };
}

function simulateDetermineTargetTab(data, weekday) {
  const REMOTE_ZONES = ['mataiea','paea','papara','mahina','tiarei','faaone','taravao','vairao','teahupoo','tautira','papenoo','hitiaa','papeari'];
  const normalizedAddress = (data.lieuLivraison || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const isRemoteZone = REMOTE_ZONES.some(z => normalizedAddress.includes(z));

  const dayTabMap = { 1:'Lundi', 2:'Mardi', 3:'Mercredi', 4:'Jeudi', 5:'Vendredi', 6:'Samedi' };

  let targetTab;
  if (data.isFret)           targetTab = 'FRET';
  else if (data.isDepotVente) targetTab = 'DEPOT_VENTE';
  else if (isRemoteZone)     targetTab = 'Samedi';
  else if (weekday === 5 || weekday === 6 || weekday === 7) targetTab = 'Lundi';
  else targetTab = dayTabMap[weekday + 1] || 'Lundi';

  return { ...data, targetTab, isRemoteZone, orderWeekdayOrigin: weekday };
}

function simulateRouteByTab(targetTab) {
  const routes = {
    FRET: 'FRET', Lundi: 'Lundi', Mardi: 'Mardi', Mercredi: 'Mercredi',
    Jeudi: 'Jeudi', Vendredi: 'Vendredi', Samedi: 'Samedi', DEPOT_VENTE: 'Depot-Vente'
  };
  return routes[targetTab] || 'fallback';
}

function runWF1(order, weekday) {
  const extracted = simulateExtractOrderData(order);
  const withTab   = simulateDetermineTargetTab(extracted, weekday);
  const route     = simulateRouteByTab(withTab.targetTab);
  return { extracted, withTab, route };
}

// ── WF3 Simulator ─────────────────────────────────────────────────────────────

function simulatePrepareComptable(rows) {
  const dateCloture = '27/03/2026';
  const comptableData = [];
  let totalGeneral = 0, totalEspeces = 0, totalCheque = 0, totalVirement = 0;
  const livreurStats = {};

  for (const r of rows) {
    if (!r['ID Shopify'] || r['ID Shopify'] === 'ID Shopify' || String(r['ID Shopify']).includes('[ex:')) continue;

    const livStatut = String(r['Livraison'] || '').trim();
    if (!livStatut || livStatut === 'Livraison en attente') continue;

    const livNorm = livStatut.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isEffectuee = livNorm.includes('effectu') || (livNorm.includes('livre') && !livNorm.includes('non livre'));

    const paiement = String(r['Moyen de paiement'] || '').trim();

    if (isEffectuee) {
      const montant = parseInt(String(r['Prix TOTAL'] || '0').replace(/[^0-9]/g, ''), 10) || 0;
      totalGeneral += montant;
      const pNorm = paiement.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (pNorm.includes('espece') || pNorm.includes('cash')) totalEspeces += montant;
      else if (pNorm.includes('cheque')) totalCheque += montant;
      else if (pNorm.includes('virement')) totalVirement += montant;
      else totalEspeces += montant;

      const livreurName = (r['Livreur'] || 'Non assigné').trim() || 'Non assigné';
      if (!livreurStats[livreurName]) livreurStats[livreurName] = { count: 0, total: 0 };
      livreurStats[livreurName].count++;
      livreurStats[livreurName].total += montant;
    }

    comptableData.push({
      _summaryOnly: false, _dateCloture: dateCloture,
      _totalGeneral: totalGeneral, _totalEspeces: totalEspeces,
      _totalCheque: totalCheque, _totalVirement: totalVirement,
      _livreurStats: JSON.stringify(livreurStats),
      'Livreur': r['Livreur'] || '', 'Statut Livraison': livStatut,
      'Moyen de paiement': paiement, 'Prix Total': r['Prix TOTAL'] || ''
    });
  }

  if (comptableData.length === 0) {
    return [{ _summaryOnly: true, _dateCloture: dateCloture,
      _totalGeneral: 0, _totalEspeces: 0, _totalCheque: 0, _totalVirement: 0,
      _livreurStats: '{}' }];
  }
  const last = comptableData[comptableData.length - 1];
  last['Total du jour'] = totalGeneral + ' F';
  return comptableData;
}

function simulateFilterHistorique(items) {
  return items.filter(i => !i._summaryOnly);
}

function simulatePrepareSuiviRows(items) {
  const dateCloture = (items[items.length - 1] || {})._dateCloture || '27/03/2026';
  const lastItem    = items[items.length - 1] || {};
  const stats = {};

  for (const r of items) {
    if (r._summaryOnly) continue;
    const statut = String(r['Statut Livraison'] || '').trim();
    const sNorm  = statut.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!sNorm.includes('effectu') && !(sNorm.includes('livre') && !sNorm.includes('non livre'))) continue;

    const livreur  = (r['Livreur'] || 'Non assigné').trim() || 'Non assigné';
    const paiement = String(r['Moyen de paiement'] || 'Espèces').trim() || 'Espèces';
    const montant  = parseInt(String(r['Prix Total'] || '0').replace(/[^0-9]/g, ''), 10) || 0;

    const key = livreur + '||' + paiement;
    if (!stats[key]) stats[key] = { livreur, paiement, count: 0, total: 0 };
    stats[key].count++;
    stats[key].total += montant;
  }

  const result = Object.values(stats).map(s => ({
    _summaryOnly: false, _dateCloture: dateCloture,
    _totalGeneral: lastItem._totalGeneral || 0,
    'Livreur': s.livreur, 'Moyen de paiement': s.paiement,
    'Nombre de livraison': s.count, 'Total récolté': s.total
  }));

  if (result.length === 0) {
    return [{ _summaryOnly: true, _dateCloture: dateCloture,
      _totalGeneral: lastItem._totalGeneral || 0,
      _totalEspeces: lastItem._totalEspeces || 0,
      _totalCheque:  lastItem._totalCheque  || 0,
      _totalVirement: lastItem._totalVirement || 0,
      _livreurStats: lastItem._livreurStats || '{}' }];
  }
  return result;
}

function simulateFilterSuivi(items) {
  return items.filter(i => !i._summaryOnly);
}

function runWF3(rows) {
  const comptable    = simulatePrepareComptable(rows);
  const forHistorique= simulateFilterHistorique(comptable);
  const suiviRows    = simulatePrepareSuiviRows(comptable);
  const forSuivi     = simulateFilterSuivi(suiviRows);
  // Clear Today Sheet + Send Daily Summary always run if suiviRows has items
  const chainComplete = suiviRows.length > 0;
  const lastComptable = comptable[comptable.length - 1];

  return {
    comptable, forHistorique, suiviRows, forSuivi, chainComplete,
    totals: {
      totalGeneral:  lastComptable._totalGeneral,
      totalEspeces:  lastComptable._totalEspeces,
      totalCheque:   lastComptable._totalCheque,
      totalVirement: lastComptable._totalVirement,
      livreurStats:  JSON.parse(lastComptable._livreurStats || '{}')
    }
  };
}

module.exports = { runWF1, runWF3, simulatePrepareComptable, simulatePrepareSuiviRows };
