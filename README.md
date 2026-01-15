# Fokal Press - Dashboard Photographes & Accréditations

Un **outil de planification tout-en-un** conçu spécifiquement pour les **photographes de sport**.

Ce dashboard centralise les calendriers de plusieurs sports (Football, Basket, Handball) et offre une suite d'outils pour gérer la **logistique**, les **accréditations** et le **suivi** des rencontres, le tout dans une interface moderne et responsive.

---

## ✨ Fonctionnalités Clés

### 📅 Planification & Filtres
- **Multi-Sports** : Support du Football ⚽, Basketball 🏀 et Handball 🤾.
- **Filtres Avancés** : Tri par compétition (L1, L2, N1, U19...), par semaine, ou par club via la barre de recherche.
- **Google Agenda** : Export en un clic de l'événement avec remplissage automatique (Lieu, équipes, heure).

### 📍 Logistique & Déplacements
- **Géolocalisation Intelligente** : 
  - Utilisation du GPS ou recherche manuelle par Ville.
  - Calcul automatique des distances et temps de trajet.
- **Comparateur de Transport** : Estimation du temps de trajet en **Voiture** 🚗 vs **Transports en commun** 🚆.
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
- **Design Responsive** : Optimisé pour Desktop, Tablette et Mobile.
- **Dark Mode** 🌙 : Thème sombre automatique (selon système) ou manuel via un toggle, persistant au rechargement.
- **Persistance des données** : Sauvegarde locale (`localStorage`) de la position GPS, du thème et des statuts favoris.

---

## 🛠️ Stack Technique

- **Frontend** : 
  - HTML5, CSS3 (Flexbox/Grid, Variables CSS).
  - JavaScript Vanilla (ES6+).
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
