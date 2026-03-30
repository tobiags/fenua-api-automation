# CAHIER DES CHARGES — AUTOMATISATION E-COMMERCE
# Fenua Api — Système de gestion des livraisons

---

**Auteur :** Tobias AGOSSOU
**Date de création :** Février 2025
**Dernière mise à jour :** Février 2025
**Version :** 2.0 — FINALE
**Statut :** ✅ Validée — Prête pour implémentation

---

## HISTORIQUE DES VERSIONS

| Version | Date | Modifications |
|---------|------|--------------|
| 1.0 | Février 2025 | Document initial |
| 1.1 | Février 2025 | Nom FRET confirmé, templates SMS validés, SMS matin = clients, ajout colonne ID Shopify |
| 1.2 | Février 2025 | Refonte colonnes Google Sheets, SMS FRET condensé, canal alerte e-mail confirmé, Livreur = manuel |
| 2.0 | Février 2025 | **VERSION FINALE** — Remplacement Twilio par Vonage/ClickSend, consolidation de toutes les validations client, document finalisé |

---

## RÉSUMÉ EXÉCUTIF

Ce document décrit la mise en place d'un système d'automatisation complet pour la gestion des commandes e-commerce de **Fenua Api**, depuis la réception d'une commande Shopify jusqu'à la clôture comptable quotidienne, en passant par la planification des livraisons et l'envoi de notifications SMS aux clients.

**Durée estimée d'implémentation :** 2 à 3 semaines
**Technologies utilisées :** n8n, Google Sheets, Shopify, Vonage ou ClickSend (SMS)
**Fuseau horaire :** Pacific/Tahiti (UTC-10) — appliqué sur l'ensemble du système

---

## 1. OBJECTIFS DU PROJET

| # | Objectif |
|---|----------|
| 1 | Automatiser l'enregistrement des nouvelles commandes dans un planning de livraison Google Sheets |
| 2 | Notifier les clients par SMS chaque matin à 7h00 pour les prévenir de leur livraison du jour |
| 3 | Effectuer la clôture comptable automatique chaque soir à 18h00 |
| 4 | Gérer les cas particuliers : livraisons inter-îles (FRET), zones éloignées, weekends |

---

## 2. ARCHITECTURE GÉNÉRALE

Le système repose sur **3 workflows automatisés** fonctionnant de manière indépendante :

```
WORKFLOW 1 — Nouvelle commande
Shopify (nouvelle commande payée) → Routage → Google Sheets planning + SMS FRET

WORKFLOW 2 — SMS quotidien (7h00 Tahiti)
Déclencheur horaire → Lecture planning du jour → Envoi SMS clients

WORKFLOW 3 — Clôture quotidienne (18h00 Tahiti)
Déclencheur horaire → Rapport Shopify → Comptabilité → Archivage → Réinitialisation
```

---

## 3. STRUCTURE GOOGLE SHEETS

### 3.1 Organisation des feuilles

Le fichier Google Sheets contient **9 feuilles** aux noms exacts suivants :

| Feuille | Contenu | Effacée à 18h ? |
|---------|---------|----------------|
| `Lundi` | Planning livraisons du lundi | ✅ Oui |
| `Mardi` | Planning livraisons du mardi | ✅ Oui |
| `Mercredi` | Planning livraisons du mercredi | ✅ Oui |
| `Jeudi` | Planning livraisons du jeudi | ✅ Oui |
| `Vendredi` | Planning livraisons du vendredi | ✅ Oui |
| `Samedi` | Planning livraisons du samedi + zones éloignées | ✅ Oui |
| `FRET` | Livraisons inter-îles — permanent | ❌ Non |
| `Historique` | Archive quotidienne de toutes les livraisons | ❌ Non |
| `Suivi comptable` | Totaux journaliers et statistiques | ❌ Non |

### 3.2 Colonnes du planning (feuilles Lundi → Samedi et FRET)

| Colonne | Nom | Rempli par | Description |
|---------|-----|-----------|-------------|
| A | ID Shopify | n8n | ID numérique (ex : `4221`) — utilisé pour l'API WF3 |
| B | Réf commande | n8n | Référence affichée (ex : `#4221`) |
| C | Date commande | n8n | Date de passage de la commande |
| D | A CLIENT | n8n | Prénom + Nom du client |
| E | Téléphone | n8n | Numéro de contact client |
| F | Lieu de livraison | n8n | Adresse complète de livraison |
| G | Produits | n8n | Tous les articles sur une ligne (ex : `1 Aspirateur ; 2 SOLID TAPE`) |
| H | Prix TOTAL | n8n | Montant à encaisser (XPF) |
| I | Horaire | **Manuel** | Créneau de livraison (ex : `11H`) |
| J | NOTE | **Manuel** | Instructions spéciales |
| K | Livreur | **Manuel** | Nom du livreur assigné |
| L | Livraison | n8n + Manuel | Statut : `Livrée` / `Non livrée` / `Awaiting response` |

> **Valeur par défaut à la création :** n8n inscrit automatiquement `Awaiting response` en colonne L.
> **Format Produits :** `[quantité] [nom] ; [quantité] [nom] ; ...` — concaténation automatique de tous les articles Shopify.
> **Colonnes I, J, K :** jamais modifiées par n8n — saisie manuelle uniquement par l'équipe.

### 3.3 Codes couleurs automatiques (Google Sheets)

Règles de mise en forme conditionnelle à configurer **une seule fois manuellement** sur la colonne L :

| Valeur | Couleur de fond |
|--------|----------------|
| `Livrée` | 🟢 Vert |
| `Non livrée` | 🔴 Rouge |
| `Awaiting response` | 🟡 Jaune |

---

## 4. WORKFLOW 1 — NOUVELLE COMMANDE SHOPIFY

### 4.1 Description

Déclenché automatiquement à chaque nouvelle commande **payée** sur Shopify. Le workflow extrait les données, applique la logique de routage et inscrit la commande dans la bonne feuille Google Sheets.

### 4.2 Logique de routage

```
Commande reçue
  │
  ├─ Méthode livraison = "Fret pour les îles" ?
  │    → OUI : Feuille FRET + SMS RIB immédiat
  │
  ├─ Ville dans la liste des zones éloignées ?
  │    → OUI : Feuille Samedi
  │
  ├─ Jour actuel = Vendredi, Samedi ou Dimanche ?
  │    → OUI : Feuille Lundi
  │
  └─ Sinon → Feuille du lendemain (J+1)
```

### 4.3 Zones éloignées → Feuille Samedi

✅ **Validé par le client.**

| Communes routées vers Samedi |
|-----------------------------|
| Mataiea, Paea, Papara, Mahina, Tiarei, Faaone, Taravao, Vairao, Teahupoo, Tautira, Papenoo, Hitiaa, Papeari |

### 4.4 Détection FRET

✅ **Validé par le client.**

Correspondance exacte sur le nom de la méthode de livraison Shopify :

**Nom exact :** `Fret pour les îles`

### 4.5 SMS FRET immédiat

✅ **Template validé par le client (v1.2 condensée).**

```
Iaorana ici Fenua Api: commande validée. Paiement par virement [TOTAL] F.
Intitulé RYAN B. RIB 17469 00027 02229540001 17
IBAN FR76 1746 9000 2702 2295 4000 117.
Envoyez une preuve du virement à support@fenuapi.com ou Facebook
pour expédition rapide. Merci
```

> ⚠️ **Note :** Ce message (~260 caractères) génère **2 SMS facturés** par commande FRET. Le destinataire reçoit un seul message continu.

---

## 5. WORKFLOW 2 — SMS QUOTIDIEN (7H00)

### 5.1 Description

Déclenché chaque matin à **7h00 heure de Tahiti (UTC-10)**. Envoie un SMS de prévenance à chaque client dont la livraison est planifiée ce jour.

### 5.2 Fonctionnement

```
7h00 Tahiti → Identifier le jour courant (Luxon, timezone Pacific/Tahiti)
→ Lire la feuille Google Sheets du jour
→ Pour chaque ligne : envoyer 1 SMS au numéro client (colonne E)
→ En cas d'échec SMS individuel : continuer + alerte e-mail
→ Si planning vide : aucun SMS, fin silencieuse
```

### 5.3 Template SMS client

✅ **Validé par le client.**

```
Iaorana, notre livreur vous livrera aujourd'hui. Il vous contactera
directement par téléphone.
Le paiement se fera directement avec lui lors de la livraison. Belle journée.
```

---

## 6. WORKFLOW 3 — CLÔTURE QUOTIDIENNE (18H00)

### 6.1 Description

Déclenché chaque soir à **18h00 heure de Tahiti**. Effectue la clôture complète de la journée en 4 étapes séquentielles obligatoires.

### 6.2 Étapes de clôture

```
ÉTAPE 1 — Fulfillment Shopify
→ Pour chaque commande "Livrée" (colonne L) : appel API Shopify fulfill + capture paiement

ÉTAPE 2 — Rapport comptable
→ Calculer total XPF du jour (commandes "Livrée" uniquement)
→ Écrire dans "Suivi comptable" : date, nombre livraisons, total XPF

ÉTAPE 3 — Archivage ← CRITIQUE
→ Copier toutes les lignes du planning du jour vers "Historique"

ÉTAPE 4 — Réinitialisation ← UNIQUEMENT SI ÉTAPE 3 RÉUSSIE
→ Effacer la feuille du planning du jour
```

> ⚠️ **Règle de sécurité absolue :** Si l'étape 3 échoue, l'étape 4 ne s'exécute **jamais**. Aucune donnée ne peut être perdue.

### 6.3 Feuille FRET

La feuille FRET **n'est jamais effacée** par le système. Gestion manuelle uniquement.

---

## 7. FOURNISSEUR SMS

### 7.1 Twilio — Non retenu

Twilio n'est pas adapté à la région Polynésie française. Deux alternatives sont proposées :

### 7.2 Alternatives recommandées

| Critère | Vonage | ClickSend |
|---------|--------|-----------|
| Nœud n8n natif | ✅ Oui | ❌ HTTP Request |
| Couverture +689 | ✅ Bonne | ✅ Excellente (APAC) |
| Prix indicatif | ~0.07€/SMS | ~0.05€/SMS |
| Engagement | Aucun | Aucun |
| Intégration n8n | Très facile | Facile |
| Idéal pour | Rapidité de mise en place | Volume élevé / meilleur tarif |

> **Décision à prendre avant démarrage :** Vonage (priorité vitesse) ou ClickSend (priorité coût).

---

## 8. ACCÈS ET PRÉREQUIS TECHNIQUES

### 8.1 Statut des accès

| Service | Accès requis | Statut |
|---------|-------------|--------|
| **n8n** | URL + identifiants admin | ⏳ En attente |
| **Shopify** | Token API privé | ⏳ En attente |
| **Google Sheets** | Compte de service Google | ✅ Compte lié |
| **Google JSON** | Fichier clé compte de service | ⏳ À transmettre (Drive sécurisé) |
| **Vonage ou ClickSend** | Clés API + numéro d'envoi | ⏳ En attente du choix |

### 8.2 Shopify — Permissions API requises

| Permission | Utilité |
|-----------|---------|
| `read_orders` | Lecture des commandes (WF1) |
| `write_orders` | Modification des commandes (WF3) |
| `read_fulfillments` | Lecture des expéditions (WF3) |
| `write_fulfillments` | Création des expéditions (WF3) |

**Procédure :** Shopify Admin → Paramètres → Applications → Développer des applications → Créer une application → Configurer portées → Installer → Copier token.

### 8.3 Google Sheets — Compte de service

✅ Compte de service lié au fichier Google Sheets (droits Éditeur).
Le fichier JSON doit être transmis de manière sécurisée (Google Drive, lien privé).

---

## 9. GESTION DES ERREURS ET ALERTES

### 9.1 Canal d'alerte

✅ **Validé par le client.**

Toutes les alertes d'erreur critiques sont envoyées par e-mail à :
**`support@fenuapi.com`**

### 9.2 Comportement par type d'erreur

| Situation | Comportement | Alerte |
|-----------|-------------|--------|
| SMS client échoué (WF2) | Continue — SMS suivants envoyés | ✅ E-mail |
| Écriture Google Sheets échouée | STOP immédiat | ✅ E-mail |
| Archivage WF3 échoué | STOP — planning non effacé | ✅ E-mail |
| Fulfillment Shopify échoué | STOP | ✅ E-mail |

---

## 10. CHECKLIST D'IMPLÉMENTATION

### Phase 1 — Préparation (avant démarrage)

- [ ] Choisir le fournisseur SMS : **Vonage** ou **ClickSend**
- [ ] Créer le compte SMS et obtenir les clés API + numéro d'envoi
- [ ] Fournir les accès n8n (URL + identifiants admin)
- [ ] Créer le token API Shopify (permissions section 8.2)
- [ ] Transmettre le fichier JSON Google via Drive sécurisé
- [ ] Créer le fichier Google Sheets avec les 9 feuilles aux noms exacts
- [ ] Créer les 12 colonnes (A→L) dans chaque feuille planning
- [ ] Configurer les règles de mise en forme conditionnelle colonne L (couleurs)

### Phase 2 — Implémentation

- [ ] WF1 — Nouvelle commande (trigger, routage, Sheets, SMS FRET)
- [ ] WF2 — SMS quotidien 7h00 (schedule, lecture Sheets, envoi SMS)
- [ ] WF3 — Clôture 18h00 (schedule, Shopify, comptable, archivage, effacement)
- [ ] Alertes e-mail sur toutes les erreurs critiques

### Phase 3 — Tests & Mise en production

- [ ] Commande test standard → vérifier inscription planning J+1
- [ ] Commande test zone éloignée → vérifier feuille Samedi
- [ ] Commande test FRET → vérifier feuille FRET + SMS RIB reçu
- [ ] Commande test vendredi → vérifier feuille Lundi
- [ ] Déclencher WF2 manuellement → vérifier SMS reçu par le client
- [ ] Déclencher WF3 manuellement → vérifier archivage + effacement + Suivi comptable
- [ ] Simuler erreur → vérifier alerte e-mail reçue sur support@fenuapi.com

---

## 11. PLANNING D'IMPLÉMENTATION

| Semaine | Phase | Contenu |
|---------|-------|---------|
| **Semaine 1** | Préparation | Collecte accès, création Google Sheets, configuration SMS |
| **Semaine 2** | Développement | Implémentation WF1, WF2, WF3 dans n8n |
| **Semaine 3** | Tests & Production | Tests end-to-end, corrections, mise en ligne |

---

## 12. TABLEAU DE VALIDATION FINALE

| # | Point | Statut |
|---|-------|--------|
| 1 | Liste zones éloignées | ✅ Validé |
| 2 | Nom méthode livraison FRET | ✅ "Fret pour les îles" |
| 3 | SMS FRET avec RIB | ✅ Template validé |
| 4 | SMS clients matin | ✅ Template validé |
| 5 | Canal alerte erreurs | ✅ support@fenuapi.com |
| 6 | Colonne Livreur = manuel | ✅ Confirmé |
| 7 | Structure 12 colonnes Google Sheets | ✅ Validée |
| 8 | Compte de service Google Sheets | ✅ Lié |
| 9 | Fournisseur SMS | ⏳ Vonage ou ClickSend — choix à faire |
| 10 | Accès n8n | ⏳ En attente |
| 11 | Token API Shopify | ⏳ En attente |
| 12 | Fichier JSON Google | ⏳ À transmettre |

---

## 13. REMARQUES FINALES

- Toutes les heures sont en **heure de Tahiti (UTC-10, Pacific/Tahiti)**
- Le système fonctionne **7j/7, 24h/24** sans intervention manuelle
- La feuille **FRET est permanente** — jamais effacée automatiquement
- Les colonnes **Horaire (I), NOTE (J), Livreur (K)** sont exclusivement à saisie manuelle — n8n ne les modifie jamais
- Les données sont **archivées chaque soir avant effacement** — aucune perte de données possible
- Le système peut être **étendu** ultérieurement : rapports hebdomadaires, tableau de bord, notifications WhatsApp, etc.

---

*Document préparé par **Tobias AGOSSOU***
*Version 2.0 FINALE — Février 2025*
