# Fokal Press - Dashboard Photographes & Accréditations

Un **outil de planification tout-en-un** conçu spécifiquement pour les **photographes de sport**.

Ce dashboard centralise les calendriers de plusieurs sports (Football, Basket, Handball) et offre une suite d'outils pour gérer la **logistique**, les **accréditations** et le **suivi** des rencontres, le tout dans une interface moderne et responsive.

---

## ✨ Fonctionnalités Clés

### 📅 Planification & Filtres Avancés
- **Multi-Sports** : Support du Football ⚽, Basketball 🏀 et Handball 🤾.
- **Filtres Précis** : Tri par compétition (L1, L2, N1, U19...), par semaine, ou par club via la barre de recherche.
- **Panneau de Contrôle Avancé** :
  - **Slider de Distance** 📏 : Ajustez le rayon de recherche (de 10 à 300km) en temps réel.
  - **Tris Dynamiques** : Organisez les résultats par Date, Distance, Niveau de compétition ou Priorité (Favoris).
- **Google Agenda** : Export en un clic de l'événement avec remplissage automatique (Lieu, équipes, heure).

### 🗺️ Cartographie & Visualisation
- **Carte Interactive (Leaflet)** : Visualisez l'ensemble des matchs filtrés sur une carte dynamique directement depuis l'application.
- **Clustering Intelligent** : Gestion avancée des points superposés. Si plusieurs matchs ont lieu au même endroit (même stade), une popup avec liste déroulante permet de naviguer entre les rencontres.
- **Navigation Fluide** : Un clic sur un match depuis la carte vous renvoie directement vers sa fiche détaillée dans la grille.

### 📍 Logistique & Déplacements
- **Géolocalisation Flexible** : 
  - **GPS** : Position automatique.
  - **Recherche Ville** : Champ de recherche avec autocomplétion pour simuler un départ depuis n'importe quelle ville (via API Geoapify).
- **Calcul d'Itinéraire** : Affichage automatique des distances et temps de trajet (Voiture 🚗 vs Transports 🚆).
- **Intégration Météo** 🌤️ : Affichage des prévisions météo locales pour le jour du match (via Open-Meteo).
- **Navigation** : Liens directs vers Google Maps pour l'itinéraire.

### 💼 Gestion des Accréditations (Mini-CRM)
- **Système de Statuts (Cycle de vie)** :
  - Cliquez sur l'étoile pour changer le statut du match :
  - ⬜ **Neutre**
  - ⭐ **Envie** (Jaune)
  - 📨 **Accréditation Demandée** (Orange)
  - ✅ **Accréditation Reçue** (Vert)
  - ❌ **Accréditation Réfusée** (Rouge)
- **Tri Intelligent** : Possibilité de trier la grille pour voir les priorités (Accréditations reçues/demandées) en premier.
- **Automatisation des Mails** : 
  - Génération de mails de demande d'accréditation pré-remplis (Objet, Corps avec date/match, Destinataire) ouvrant directement Gmail.
  - Copie rapide des adresses emails.

### 🎨 Interface & UX
- **Modes d'Affichage** :
  - **Vue Grille** : Cartes détaillées, idéal pour la découverte.
  - **Vue Liste** : Affichage condensé et compact, idéal pour scanner rapidement un grand nombre de matchs.
- **Design Responsive** : Optimisé pour Desktop, Tablette et Mobile.
- **Dark Mode** 🌙 : Thème sombre automatique (selon système) ou manuel via un toggle, persistant au rechargement.
- **Persistance des données** : Sauvegarde locale (`localStorage`) de la position GPS, du thème, des préférences d'affichage et des statuts favoris.

---

## 🛠️ Stack Technique

- **Frontend** : 
  - HTML5, CSS3 (Flexbox/Grid, Variables CSS).
  - JavaScript Vanilla (ES6+).
  - **Leaflet.js** : Librairie open-source pour la carte interactive.
- **APIs Externes** :
  - **Geoapify** : Géocodage (Recherche ville) et Routing (Calcul distance/temps).
  - **Open-Meteo** : Prévisions météorologiques.
- **Backend / Data** :
  - Node.js + Puppeteer (Scraping des données des fédérations).
  - Fichier `matchs.json` comme base de données.
- **Icônes & Fonts** : FontAwesome 6, Google Fonts (Inter).

---

## 🚀 Installation & Utilisation

1. **Cloner le projet**
  ```bash
   git clone https://github.com/Kili1n/Fokal-Press.git
  ```

2. **Mise à jour des données (Scraping) Nécessite Node.js installé.**

  ```bash
  node update_matchs.js
  ```
  *Cela génère le fichier data/matchs.json.*

  3. **Lancer le Dashboard** Ouvrez simplement index.html dans votre navigateur. (Pour une expérience optimale avec les APIs, l'utilisation d'un serveur local type Live Server est recommandée).

## 📁 Structure du Projet
```
Fokal-Press/
├── css/
│   ├── index.css       # Styles principaux et Dark Mode
│   └── mobile.css      # Adaptations responsive
├── js/
│   ├── config.js       # Clés API et configurations
│   └── index.js        # Logique applicative (Filtres, API, Favoris)
├── data/
│   └── matchs.json     # Données scrapées
├── index.html          # Point d'entrée
├── update_matchs.js    # Script de scraping
└── README.md
```

## 🤝 Contribution & Contact

Le projet inclut un footer interactif permettant aux utilisateurs de :
- Suggérer l'ajout de nouveaux clubs.
- Signaler des bugs.
- Contacter le développeur.

**Auteur** : Kilian Lentz

**Instagram** : [@kiksf4](https://instagram.com/kiksf4)

---

💡 *Projet pensé pour être extensible : ajout d’autres sports, clubs, sources de données ou fonctionnalités analytiques futures.*
