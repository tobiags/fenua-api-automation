# program.md — Stratégie de test autonome Fenua Api Workflows

## Objectif
Valider la robustesse des 3 workflows n8n de Fenua Api face à des données réelles variées.
Le runner exécute des cycles autonomes : génère → simule → évalue → logue → répète.

---

## WF1 — Nouvelle Commande Shopify

### Contrat attendu
Pour toute commande Shopify entrante, le workflow DOIT :
1. Extraire correctement : `idShopify`, `refCommande`, `telephone`, `prixTotal`, `produits`, `lieuLivraison`
2. Détecter `isFret` uniquement si `shippingLines[0].title === "Fret pour les îles"` (exact)
3. Détecter `isDepotVente` si le titre contient "recup" OU "depot" (insensible casse+accents)
4. Router vers le bon onglet selon la priorité : FRET > DEPOT_VENTE > Zone éloignée > J+1
5. Le téléphone doit toujours sortir au format E.164 : `+689XXXXXXXX`
6. Si le jour est Vendredi/Samedi/Dimanche → router vers Lundi (J+1 weekend)
7. Une adresse de zone éloignée (taravao, punaauia, papara…) → Samedi (sauf FRET/DEPOT_VENTE)

### Cas critiques à couvrir
- Téléphone avec espaces, tirets, parenthèses
- Téléphone déjà au format +689
- Téléphone au format local 8XXXXXXX (8 chiffres sans 689)
- ShippingTitle vide → ni FRET ni DEPOT_VENTE
- Commande sans shipping_address → lieuLivraison = "Non spécifié"
- Produits multiples : "2 Aspirateur ; 1 Lampe"
- Prix avec décimales : "1990.50" → "1991 F"
- Majuscules dans "DEPOT" ou "RECUP"
- Combinaison FRET + adresse zone éloignée → FRET gagne
- Combinaison DEPOT_VENTE + adresse zone éloignée → DEPOT_VENTE gagne

---

## WF3 — Clôture 18h00

### Contrat attendu
Pour toute feuille planning du jour, le workflow DOIT :
1. `Prepare Comptable` : toujours retourner 1+ items (même si 0 livraisons)
2. Calculer les totaux exacts par moyen de paiement (espèces/chèque/virement)
3. Calculer les stats par livreur (count + total)
4. `Filter Historique` : ne passer que les items NON `_summaryOnly`
5. `Prepare Suivi Rows` : 1 ligne par livreur×paiement, toujours 1+ items
6. `Filter Suivi` : ne passer que les lignes NON `_summaryOnly`
7. `Clear Today Sheet` TOUJOURS s'exécuter (même si 0 livraisons)
8. `Send Daily Summary` TOUJOURS s'exécuter avec les bons totaux

### Cas critiques à couvrir
- 0 livraisons effectuées (toutes "Livraison en attente") → totaux à 0, chaîne complète
- 100% livrées → totaux corrects
- Mix livré/en attente/annulé
- Moyen de paiement vide → comptabilisé en espèces par défaut
- Moyen de paiement en majuscules "ESPECES" → reconnu
- Livreur vide → "Non assigné"
- Prix avec " F" → parsé correctement
- Prix non numérique → 0
- Même livreur, plusieurs paiements → 2 lignes dans Suivi Rows

---

## Métriques d'évaluation

| Métrique | Seuil acceptable |
|----------|-----------------|
| Taux de routing correct WF1 | 100% |
| Format téléphone valide | 100% |
| Précision totaux WF3 | 100% (0 tolérance financière) |
| Chaîne complète WF3 (Clear+Email) | 100% même si 0 livraisons |
| Faux positifs FRET | 0% |
| Faux positifs DEPOT_VENTE | 0% |

---

## Mode autonome
Le runner tourne en boucles de N cycles. Chaque cycle :
1. Génère M scénarios aléatoires + les cas critiques fixes
2. Simule les workflows
3. Évalue chaque output
4. Logue les résultats dans `results/run_TIMESTAMP.json`
5. Affiche un résumé avec les cas en échec

Arrêt : quand tous les tests passent sur 3 cycles consécutifs, ou après MAX_CYCLES.
