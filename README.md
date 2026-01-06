# Dashboard_presse

Un **tableau de bord intelligent** conçu pour centraliser et visualiser les **prochains matchs de football** de plusieurs clubs (données issues de la **FFF**).  
Il permet aux utilisateurs de voir **en un clin d'œil** les rencontres à venir, avec des fonctionnalités avancées de **filtrage** et de **géolocalisation**.

---

## ✨ Fonctionnalités clés

- **Scraping automatisé**  
  Un script **Node.js** utilisant **Puppeteer** récupère automatiquement les données les plus récentes depuis les sites officiels, évitant toute saisie manuelle.

- **Calcul de distance & GPS**  
  Intégration d’une API de géolocalisation permettant de calculer la distance entre l’utilisateur et le lieu du match (ou via la saisie manuelle d’une ville).

- **Interface moderne & responsive**  
  Design épuré inspiré des interfaces **iOS / Apple**, optimisé pour une lecture rapide sur **mobile** et **ordinateur**.

- **Filtres intelligents**  
  Tri des matchs par :
  - compétition (U17, U19, etc.)
  - période (semaine en cours ou calendrier complet)

- **Mode hors-ligne**  
  Une fois les données chargées, le dashboard reste fluide grâce à l’utilisation d’un **fichier JSON local** performant.

---

## 🛠️ Stack technique

- **Frontend** :  
  - HTML5  
  - CSS3 (variables modernes, Flexbox / Grid)  
  - JavaScript Vanilla

- **Backend / Automation** :  
  - Node.js  
  - Puppeteer (extraction et mise à jour des données)

- **Stockage des données** :  
  - JSON

- **Icônes & typographie** :  
  - FontAwesome  
  - Google Fonts (Inter)

---

## 🚀 Comment ça marche ?

1. **Récupération**  
   Le script `update_matchs.js` parcourt une liste d’URLs de la FFF définie dans le code.

2. **Traitement**  
   Les données sont nettoyées, normalisées, triées par date, puis sauvegardées dans `matchs.json`.

3. **Affichage**  
   Le fichier `sport.html` (page d’accueil) lit ce JSON et génère dynamiquement des **cartes de matchs élégantes et interactives**.

---

## 📁 Structure du projet (exemple)

```
Dashboard_presse/
├── update_matchs.js
├── matchs.json
├── sport.html
├── css/
│ └── style.css
├── js/
│ └── app.js
└── README.md
```
---

## 📌 Objectif

Faciliter la **veille sportive** et la **planification des déplacements** en offrant une vue centralisée, claire et intelligente des matchs à venir.

---

💡 *Projet pensé pour être extensible : ajout d’autres sports, clubs, sources de données ou fonctionnalités analytiques futures.*
