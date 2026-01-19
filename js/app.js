const GEOAPIFY_KEY = "61ca90447ebd483ab2f002050433fa42"; 
const SPORT_EMOJIS = { "football": "⚽", "basketball": "🏀", "handball": "🤾"};

// États globaux
let allMatches = [];
let currentlyFiltered = []; 
let currentFilters = { week: "", comp: "all", sport: "all", accredOnly: false, sortBy: "date", search: "", maxDist: 300 };
let userPosition = null;
let isCalculating = false;
const travelCache = new Map();
const logoCache = new Map();

const getLogoUrl = (name) => {
    if (logoCache.has(name)) return logoCache.get(name);

    const upperName = name.toUpperCase();
    const customKey = Object.keys(CUSTOM_LOGOS).find(key => upperName.includes(key));
    
    let finalUrl;
    if (customKey) {
        finalUrl = CUSTOM_LOGOS[customKey];
    } else {
        finalUrl = ''; 
        console.warn(`⚠️ Aucun logo trouvé pour le club : "${name}"`);
    }

    logoCache.set(name, finalUrl);
    return finalUrl;
};

const getShortComp = (formattedComp, sport) => {
    if (formattedComp === "AUTRE") return "🔖";
    
    // On récupère l'émoji
    const emoji = SPORT_EMOJIS[sport.toLowerCase()] || "🏟️";
    
    // On décompose "SPORT - L1 - SENIOR"
    const parts = formattedComp.split(' - ');
    // parts[0] = Sport (on a déjà l'émoji)
    const level = parts[1] || "";
    let age = parts[2] || "";

    // Abréviations
    if (age === "SENIOR") age = "S";
    else if (age === "SENIOR F") age = "SF";
    else if (age === "U21" || age === "ESPOIRS") age = "U21";
    
    // Retourne "🏀 - L1 - S"
    return `${emoji} - ${level} - ${age}`;
};

const formatCompetition = (rawName, sport) => {
    if (!rawName) return "MATCH";
    const name = rawName.toUpperCase();
    const s = (sport).toLowerCase();
    
    let sportLabel = s.includes("basket") ? "BASKET" : (s.includes("foot") ? "FOOT" : "HAND");
    
    let level = "AUTRE", age = "SENIOR";

    // --- NIVEAU L1 ---
    if (name.includes("BETCLIC") || name.includes("STARLIGUE")) { level = "L1"; }
    else if (name.includes("BUTAGAZ") || name.includes("LBWL")) { level = "L1"; age = "SENIOR F"; }
    else if (name.includes("ARKEMA") || name.includes("PREMIERE LIGUE")) { level = "L1"; age = "SENIOR F"; }

    // --- NIVEAU L2 ---
    else if (name.includes("ÉLIT2") || name.includes("PROLIGUE")) { level = "L2"; }
    else if (name.includes("LIGUE 2") || name.includes("L2")) { level = "L2"; }
    else if (name.includes("SECONDE LIGUE")) { level = "L2"; age = "SENIOR F"; } 
    else if (name.includes("LF2")) { level = "L2"; age = "SENIOR F"; }

    // --- NIVEAU N1 ---
    else if (name.includes("NF1")) { level = "N1"; age = "SENIOR F"; }
    else if (name.includes("ESPOIRS")) { level = "L1"; age = "U21"; }
    else if (name.includes("NATIONALE 1") || name.includes("NATIONAL 1") || name.includes("NATIONAL - SENIOR")) { level = "N1"; }

    // --- LOGIQUE GÉNÉRIQUE ---
    else {
        const isFeminine = name.includes("FÉMININ") || name.includes("FEMININ") || name.includes(" F ") || name.includes("SEF");
        
        if (name.includes("N3")) level = "N3";
        else if (name.includes("N2")) level = "N2";
        else if (name.includes("D3") && (name.includes("FÉMININE") || name.includes("FEMININE"))) level = "L3";
        else if (name.includes("NATIONAL - SENIOR")) level = "N1";
        else if (name.includes("NATIONAL") || name.includes("NAT")) level = "NAT";
        
        if (name.includes("U19")) age = "U19";
        else if (name.includes("U17")) age = "U17";
        
        if (isFeminine && !age.includes("F")) age += " F";
    }

    // --- MODIFICATION ICI ---
    // Si le niveau est "AUTRE", on ne met pas le sport devant.
    // Cela permet de grouper "AUTRE - SENIOR" pour le Foot et le Basket ensemble.
    if (level === "AUTRE") {
        return "AUTRE";
    }

    return `${sportLabel} - ${level} - ${age}`;
};

const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
           || window.innerWidth <= 768;
};

function openGmailCompose(email, homeTeam, awayTeam, matchDate, sport, compet) {
    // 1. Récupération des infos
    const user = firebase.auth().currentUser;
    const storedInsta = localStorage.getItem('userInsta');
    const storedPortfolio = localStorage.getItem('userPortfolio');

    const userName = (user && user.displayName) ? user.displayName : "[VOTRE NOM ET PRÉNOM]";

    // 2. Construction de la phrase de présentation du travail
    let workSentence = "";

    if (storedInsta && storedPortfolio) {
        // Cas : Les deux existent
        workSentence = `Vous pouvez avoir un aperçu de mon travail sur mon portfolio : ${storedPortfolio} ainsi que sur mon compte Instagram : ${storedInsta}`;
    } else if (storedInsta) {
        // Cas : Uniquement Instagram
        workSentence = `Vous pouvez avoir un aperçu de mon travail sur mon compte Instagram : @${storedInsta}`;
    } else if (storedPortfolio) {
        // Cas : Uniquement Portfolio
        workSentence = `Vous pouvez avoir un aperçu de mon travail sur mon portfolio : ${storedPortfolio}`;
    } else {
        // Cas : Aucun (Placeholder par défaut)
        workSentence = `Vous pouvez avoir un aperçu de mon travail ici : [LIEN VERS VOTRE PORTFOLIO / INSTAGRAM]`;
    }

    const subject = `Demande d'accréditation : ${homeTeam} vs ${awayTeam} (${matchDate})`;
    
    // 3. Corps du mail
    const body = `Bonjour,\n\n` +
        `Je me permets de vous contacter en tant que photographe afin de solliciter une accréditation pour le match ${homeTeam} vs ${awayTeam} (${compet}) prévu le ${matchDate}.\n\n` +
        `Passionné par le ${sport}, cette rencontre serait pour moi l'opportunité d'enrichir mon portfolio. En contrepartie, je pourrais, si vous le souhaitez, mettre à votre disposition les clichés réalisés pour vos supports de communication.\n\n` +
        `${workSentence}\n\n` +
        `Je reste à votre entière disposition pour toute information complémentaire.\n\n` +
        `Cordialement,\n\n` +
        `${userName}\n` +
        `---\n` +
        `Demande préparée via fokalpress.fr - Outil de planification pour photographes de sport.`;
    
    if (isMobile()) {
        const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoUrl;
    } else {
        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${email}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(gmailUrl, '_blank');
    }
}

const getAccreditationHTML = (match) => {
    if (!match || !match.home) return `<div class="accred-status accred-unavailable"><i class="fa-solid fa-circle-xmark"></i> <span>Inconnu</span></div>`;

    const teamName = match.home.name.toUpperCase();
    
    // 1. Détection du contexte ESPOIRS / U21
    // On regarde si le formatage de la compétition contient U21 ou ESPOIRS
    const isEspoirs = match.compFormatted.includes("U21") || match.compFormatted.includes("ESPOIRS");
    
    let key = null;

    // 2. Si c'est un match Espoirs, on cherche D'ABORD une clé spécifique (ex: "PARIS BASKETBALL_U21")
    if (isEspoirs) {
        key = Object.keys(ACCRED_LIST).find(k => k === `${teamName}_U21` || k === `${teamName}_ESPOIRS`);
    }

    // 3. Si pas de clé spécifique trouvée (ou si ce n'est pas un match espoir), on cherche la clé normale
    if (!key) {
        key = Object.keys(ACCRED_LIST).find(k => teamName.includes(k) && !k.includes("_U21") && !k.includes("_ESPOIRS"));
    }
    
    if (key) {
        const contact = ACCRED_LIST[key];
        
        if (contact.startsWith('http')) {
            return `<div class="accred-status accred-available">
                        <a href="${contact}" target="_blank" class="accred-email" title="Accéder à la plateforme" style="display:flex; align-items:center; gap:6px;">
                            <i class="fa-solid fa-external-link-alt"></i> 
                            <span class="accred-text">Plateforme</span>
                        </a>
                    </div>`;
        } 

        const d = match.dateObj;
        const shortDate = ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2);
        const home = match.home.name.replace(/'/g, "\\'");
        const away = match.away.name.replace(/'/g, "\\'");
        const compRaw = match.competition.replace(/'/g, "\\'");
        const sportComplet = match.sport;

        return `
            <div class="accred-status accred-available" style="gap: 12px;">
                <a href="#" onclick="copyToClipboard(event, '${contact}')" title="Copier le mail">
                    <i class="fa-solid fa-copy"></i>
                </a>
                <a href="#" onclick="openGmailCompose('${contact}', '${home}', '${away}', '${shortDate}', '${sportComplet}', '${compRaw}')" title="Ouvrir dans Gmail" style="color: #ea4335;">
                    <i class="fa-solid fa-envelope"></i>
                </a>
                <span class="accred-text accred-email-text">${contact}</span>
            </div>`;
        }
    
    return `<div class="accred-status accred-unavailable">
                <i class="fa-solid fa-circle-xmark"></i> 
                <span class="accred-text">Inconnu</span>
            </div>`;
};

// --- LOGIQUE STATUS MULTIPLES ---

// 1. Chargement : On récupère un objet { "matchID": "status", ... }
let matchStatuses = JSON.parse(localStorage.getItem('matchStatuses') || '{}');

// Ordre du cycle des statuts
const STATUS_CYCLE = [null, 'envie', 'asked', 'received', 'refused'];

// Helpers visuels (Icône selon le statut)
const getStatusIcon = (status) => {
    switch(status) {
        case 'envie': return 'fa-solid fa-star';          // Étoile pleine
        case 'asked': return 'fa-solid fa-paper-plane';   // Avion papier
        case 'received': return 'fa-solid fa-circle-check'; // Coche validée
        case 'refused': return 'fa-solid fa-circle-xmark'; // Croix refusée
        default: return 'fa-regular fa-star';             // Étoile vide
    }
};

const getMatchId = (m) => {
    const h = m.home.name.replace(/\s+/g, '');
    const a = m.away.name.replace(/\s+/g, '');
    const d = m.dateObj.toISOString().split('T')[0];
    return `${h}_${a}_${d}`;
};

// Fonction pour envoyer un changement unique à Firebase
async function syncFavoriteToFirebase(matchId, status) {
    const user = auth.currentUser;
    if (!user) return; // Si pas connecté, on ne fait rien (reste en local)

    try {
        // On prépare la mise à jour
        // Si status est null, on supprime le champ de la base avec FieldValue.delete()
        const updateData = {};
        updateData[`favorites.${matchId}`] = status ? status : firebase.firestore.FieldValue.delete();

        // On met à jour uniquement ce champ dans le document user
        await db.collection('users').doc(user.uid).update(updateData);
    } catch (e) {
        console.error("Erreur sync favoris :", e);
        // Si le document n'existe pas encore (cas rare), on le crée
        if (e.code === 'not-found') {
             await db.collection('users').doc(user.uid).set({
                 favorites: { [matchId]: status }
             }, { merge: true });
        }
    }
}

// 2. Fonction de cycle appelée au clic
function cycleStatus(event, matchId) {
    event.stopPropagation();
    const btn = event.currentTarget;
    const icon = btn.querySelector('i');

    // Trouver le statut actuel et le suivant
    const currentStatus = matchStatuses[matchId] || null;
    const currentIndex = STATUS_CYCLE.indexOf(currentStatus);
    const nextIndex = (currentIndex + 1) % STATUS_CYCLE.length;
    const nextStatus = STATUS_CYCLE[nextIndex];

    // 1. Mise à jour de la variable globale (Mémoire vive)
    if (nextStatus) {
        matchStatuses[matchId] = nextStatus;
    } else {
        delete matchStatuses[matchId];
    }

    // 2. Mise à jour du Cache Local (Pour que ça reste fluide au rechargement de page)
    // C'est nécessaire même connecté, sinon l'étoile disparaît au F5 avant que Firebase ne réponde
    localStorage.setItem('matchStatuses', JSON.stringify(matchStatuses));

    // 3. Mise à jour Cloud (Si connecté)
    if (auth.currentUser) {
        syncFavoriteToFirebase(matchId, nextStatus);
    }

    // 4. Mise à jour Visuelle
    btn.classList.remove('status-envie', 'status-asked', 'status-received', 'status-refused');
    if (nextStatus) btn.classList.add(`status-${nextStatus}`);
    icon.className = getStatusIcon(nextStatus);
    
    // Titres (Accessibilité)
    const titles = {
        envie: "Envie d'y aller",
        asked: "Accréditation demandée",
        received: "Accréditation confirmée !",
        refused: "Accréditation refusée",
        null: "Ajouter au suivi"
    };
    btn.title = titles[nextStatus] || titles.null;
}

const getTeamCoords = (name) => {
    const upperName = name.toUpperCase();
    const key = Object.keys(STADIUM_COORDS).find(k => upperName.includes(k));
    
    // --- AJOUT LOG ---
    if (!key) {
        console.warn(`❌ Pas de coordonnées pour : ${name}`);
    }
    // -----------------

    return key ? STADIUM_COORDS[key] : null;
};

async function fetchTravelData(uLat, uLon, dLat, dLon) {
    const cacheKey = `travel_${uLat}_${uLon}_${dLat}_${dLon}`;
    const stored = localStorage.getItem(cacheKey);
    if (stored) {
        const parsed = JSON.parse(stored);
        if (Date.now() - parsed.timestamp < 86400000) {
            return parsed.data;
        }
    }

    if (travelCache.has(cacheKey)) return travelCache.get(cacheKey);

    try {
        const url = `https://api.geoapify.com/v1/routing?waypoints=${uLat},${uLon}|${dLat},${dLon}&mode=drive&apiKey=${GEOAPIFY_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.features?.length > 0) {
            const props = data.features[0].properties;
            const result = { dist: Math.round(props.distance / 1000), car: Math.round(props.time / 60) };
            travelCache.set(cacheKey, result);
            return result;
        }
    } catch (e) { console.warn(e); }
    return null;
}

function copyToClipboard(event, text) {
    event.preventDefault();
    const link = event.currentTarget;
    const originalText = link.innerHTML;

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text)
            .then(() => showSuccess(link, originalText))
            .catch(err => fallbackCopy(text, link, originalText));
    } else {
        fallbackCopy(text, link, originalText);
    }
}


function fallbackCopy(text, link, originalText) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        showSuccess(link, originalText);
    } catch (err) {
        console.error('Impossible de copier', err);
    }
    
    document.body.removeChild(textArea);
}


function showSuccess(link, originalText) {
    link.innerHTML = '<span style="color: #34C759;"><i class="fa-solid fa-check"></i> Copié !</span>';
    setTimeout(() => {
        link.innerHTML = originalText;
    }, 2000);
}

async function fetchTravelData(uLat, uLon, dLat, dLon) {
    const cacheKey = `travel_${uLat}_${uLon}_${dLat}_${dLon}`;

    // 1. Vérification du localStorage (Persistance longue durée)
    const stored = localStorage.getItem(cacheKey);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            // On vérifie si le cache a moins de 24h (86400000 ms)
            if (Date.now() - parsed.timestamp < 86400000) {
                // On remet en mémoire vive pour les prochains accès rapides
                travelCache.set(cacheKey, parsed.data);
                return parsed.data;
            }
        } catch (e) {
            console.warn("Erreur lecture localStorage", e);
        }
    }
    
    // 2. Vérification du travelCache (Mémoire vive - Map)
    if (travelCache.has(cacheKey)) return travelCache.get(cacheKey);

    // 3. Appel API Geoapify si aucune donnée en cache
    try {
        const url = `https://api.geoapify.com/v1/routing?waypoints=${uLat},${uLon}|${dLat},${dLon}&mode=drive&apiKey=${GEOAPIFY_KEY}`;
        const res = await fetch(url);
        
        if (!res.ok) throw new Error(`Erreur API: ${res.status}`);
        
        const data = await res.json();
        
        if (data.features?.length > 0) {
            const props = data.features[0].properties;
            const result = { 
                dist: Math.round(props.distance / 1000), 
                car: Math.round(props.time / 60) 
            };

            // 4. Sauvegarde dans les deux caches
            travelCache.set(cacheKey, result); // Mémoire vive
            localStorage.setItem(cacheKey, JSON.stringify({
                timestamp: Date.now(),
                data: result
            })); // Stockage local

            return result;
        }
    } catch (e) { 
        console.warn("Erreur lors de la récupération du trajet :", e); 
    }
    return null;
}

async function fetchWeather(lat, lon, date) {
    if (!lat || !lon || !date || isNaN(date.getTime())) return null;

    const now = new Date();
    const diffInDays = (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    // 1. Sécurité : Open-Meteo limite à 16 jours. On bloque à 14 pour éviter l'erreur 400.
    if (diffInDays > 14 || diffInDays < -1) return null; 

    // 2. Cache localStorage : Clé unique par lieu et par date
    const dateStr = date.toISOString().split('T')[0];
    const cacheKey = `weather_${lat}_${lon}_${dateStr}`;
    const stored = localStorage.getItem(cacheKey);
    
    if (stored) return stored;

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code&start_date=${dateStr}&end_date=${dateStr}&timezone=auto`;
        const res = await fetch(url);
        
        if (!res.ok) return null; // Si l'API renvoie 400 ou 500, on ignore proprement

        const data = await res.json();
        if (data.daily && data.daily.weather_code) {
            const icon = WEATHER_ICONS[data.daily.weather_code[0]] || "🌡️";
            // On mémorise l'émoji (valable pour toujours car la date est fixée)
            localStorage.setItem(cacheKey, icon);
            return icon;
        }
    } catch (e) {
        console.error("Erreur météo:", e);
    }
    return null;
}

async function updateDistances() {
    // Vérification de sécurité
    if (isCalculating) return;
    if (!userPosition) {
        // Optionnel : Alert si on appelle la fonction sans position (ne devrait pas arriver via le workflow actuel)
        console.warn("Tentative de calcul sans position utilisateur.");
        return;
    }

    isCalculating = true;

    // --- MISE À JOUR VISUELLE (Spinner sur le GPS si c'est lui qui a lancé ?) ---
    // Pour l'instant, on laisse l'UI gérée par requestUserLocation ou handleCitySearch
    // Mais on peut changer le curseur pour montrer que ça travaille
    document.body.style.cursor = "wait";

    const targets = currentlyFiltered;

    // --- RESET VISUEL ---
    // On remet les distances à 0 pour montrer à l'utilisateur que ça change
    allMatches.forEach(m => {
        m.distance = 0;
        m.times.car = 0;
        m.times.public = 0;
    });
    
    renderMatches(currentlyFiltered); 

    // --- CALCUL PARALLÈLE ---
    await Promise.all(targets.map(async (m) => {
        if (m.locationCoords) {
            const travel = await fetchTravelData(userPosition.lat, userPosition.lon, m.locationCoords.lat, m.locationCoords.lon);
            
            // Gestion Météo (si applicable)
            if (m.sport.toLowerCase() === "football") {
                m.weather = await fetchWeather(m.locationCoords.lat, m.locationCoords.lon, m.dateObj);
            }

            if (travel) {
                // On met à jour TOUTES les occurrences de ce match dans la mémoire globale
                allMatches.forEach(match => {
                    if (match.home.name === m.home.name) {
                        match.distance = travel.dist;
                        match.times.car = travel.car;
                        match.times.public = Math.round(travel.car * 1.5 + 15);
                    }
                });
            }
        }
    }));

    // Fin du calcul
    isCalculating = false;
    document.body.style.cursor = "default";
    
    // Rendu final avec les nouvelles valeurs
    applyFilters();
}

function resetDistancesDisplay() {
    // Remet les données à zéro
    allMatches.forEach(m => {
        m.distance = 0;
        m.times.car = 0;
        m.times.public = 0;
    });
    // Rafraichit la grille
    applyFilters();
}

async function loadMatches() {
    try {
        const response = await fetch('data/matchs.json');
        const data = await response.json();
        allMatches = data.map(m => {
            const d = new Date(m.isoDate);
            // Formatage de l'heure (ex: 19h00)
            const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
                            
        return {
                sport: m.sport,
                sourceUrl: m.url || m.sourceUrl || "#",
                competition: m.competition || "N/A",
                compFormatted: formatCompetition(m.competition, m.sport),
                home: { name: m.home }, 
                away: { name: m.away },
                dateDisplay: m.date,
                dateShort: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }), 
                dateObj: d,
                time: time,
                locationCoords: getTeamCoords(m.home),
                distance: 0,
                times: { car: 0, public: 0 },
                isCalculating: false
            };
        }).sort((a, b) => a.dateObj - b.dateObj);
                        
        applyFilters();
    } catch (error) {
        document.getElementById('grid').innerHTML = `<div class="error-msg">Erreur de chargement.</div>`;
        console.error("Détail de l'erreur :", error);
    }
}

function requestUserLocation(btnElement, originalIcon) {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async pos => {
            const newPos = { 
                lat: pos.coords.latitude, 
                lon: pos.coords.longitude 
            };

            // Gestion du changement de position (nettoyage cache)
            if (userPosition) {
                const latDiff = Math.abs(userPosition.lat - newPos.lat);
                const lonDiff = Math.abs(userPosition.lon - newPos.lon);
                if (latDiff > 0.05 || lonDiff > 0.05) {
                    travelCache.clear();
                    // Nettoyage localStorage partiel si besoin...
                }
            }

            userPosition = newPos;
            localStorage.setItem('userLastPosition', JSON.stringify(newPos)); 
            
            // Mise à jour visuelle (Succès)
            if(btnElement) {
                btnElement.innerHTML = originalIcon; // Remet l'icône normale
                btnElement.classList.add('active');
            }
            
            console.log("📍 Position GPS trouvée. Lancement du calcul...");
            
            // --- AUTOMATISATION : ON LANCE LE CALCUL ICI ---
            await updateDistances(); 
            
        }, (error) => {
            console.warn("Erreur géo:", error);
            if(btnElement) {
                btnElement.innerHTML = originalIcon;
                btnElement.classList.remove('active');
            }
            alert("Impossible de vous géolocaliser.");
        });
    } else {
        alert("Géolocalisation non supportée.");
    }
}

function populateCompFilter(filteredMatches) {
    const select = document.getElementById('compFilter');
    const savedValue = currentFilters.comp;
    
    // Réinitialisation du menu
    select.innerHTML = '<option value="all">📊 Toutes compétitions</option>';
    
    const uniqueComps = [];
    const seen = new Set();
    
    // 1. Récupération des compétitions uniques
    filteredMatches.forEach(m => {
        if (!seen.has(m.compFormatted)) {
            seen.add(m.compFormatted);
            uniqueComps.push({ name: m.compFormatted, sport: m.sport.toLowerCase() });
        }
    });

    // 2. Tri : Alphabétique mais "AUTRE" est forcé à la fin
    uniqueComps.sort((a, b) => {
        if (a.name === "AUTRE") return 1;  // Pousse "AUTRE" vers le bas
        if (b.name === "AUTRE") return -1; // Garde les autres au-dessus
        return a.name.localeCompare(b.name); // Tri alphabétique standard
    }).forEach(c => {
        
        // 3. Gestion des émojis (avec 'let' pour éviter l'erreur)
        let emoji = SPORT_EMOJIS[c.sport] || "🏟️";
        
        if (c.name === "AUTRE") {
            emoji = "🔖"; 
        }

        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = `${emoji} ${c.name}`;
        
        if (c.name === savedValue) opt.selected = true;
        select.appendChild(opt);
    });

    // Sécurité : si le filtre sélectionné n'existe plus dans la nouvelle liste, on repasse à "all"
    if (!seen.has(savedValue)) currentFilters.comp = "all";
}

function resetFilters() {
    currentFilters = { week: "", comp: "all", sport: "all", accredOnly: false, sortBy: "date", search: "", maxDist: 300 };
    
    // Reset des éléments UI
    document.getElementById('weekFilter').value = "";
    document.getElementById('compFilter').value = "all";
    document.getElementById('sortFilter').value = "date";
    document.getElementById('searchInput').value = "";
    document.getElementById('accredToggle').checked = false;
    
    document.getElementById('gpsBtn').classList.remove('active');
    userPosition = null;

    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.filter-btn[data-filter="all"]').classList.add('active');

    const slider = document.getElementById('distSlider');
    const label = document.getElementById('distValue');
    
    if (slider && label) {
        slider.value = 300;        // Remet le curseur à droite
        label.textContent = "300km"; // Remet le texte à jour
    }
    
    updateFilterSlider();
    applyFilters();
}

function applyFilters() {
    let filtered = [...allMatches];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    filtered = filtered.filter(m => {
        return m.dateObj >= today;
    });

    filtered = filtered.filter(m => {
        if (m.distance > 0 && m.distance > currentFilters.maxDist) {
            return false; 
        }
        return true;
    });

    if (currentFilters.search) {
        const term = currentFilters.search.toLowerCase();
        filtered = filtered.filter(m => m.home.name.toLowerCase().includes(term) || m.away.name.toLowerCase().includes(term));
    }

    if (currentFilters.sport !== "all") {
        filtered = filtered.filter(m => m.sport.toLowerCase() === currentFilters.sport);
    }

    populateCompFilter(filtered);

    if (currentFilters.comp !== "all") {
        filtered = filtered.filter(m => m.compFormatted === currentFilters.comp);
    }

    if (currentFilters.accredOnly) {
        const accredKeys = Object.keys(ACCRED_LIST);
        filtered = filtered.filter(m => accredKeys.some(key => m.home.name.toUpperCase().includes(key)));
    }

    if (currentFilters.week) {
        filtered = filtered.filter(m => {
            const d = new Date(Date.UTC(m.dateObj.getFullYear(), m.dateObj.getMonth(), m.dateObj.getDate()));
            const dayNum = d.getUTCDay() || 7; // Convertit Dimanche de 0 à 7
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
            
            const matchWeek = `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
            return matchWeek === currentFilters.week;
    });
}

    filtered.sort((a, b) => {
        if (currentFilters.sortBy === "favorite") {
            // On donne un poids à chaque statut pour le tri
            const weights = { 'received': 3, 'asked': 2, 'envie': 1, 'refused': -1, null: 0 };
            
            const statusA = matchStatuses[getMatchId(a)];
            const statusB = matchStatuses[getMatchId(b)];
            
            const weightA = weights[statusA] || 0;
            const weightB = weights[statusB] || 0;

            // Le plus grand poids en premier
            if (weightA !== weightB) {
                return weightB - weightA;
            }
            
            // Si même statut, tri par date
            return a.dateObj - b.dateObj;
        }
        if (currentFilters.sortBy === "distance") {
            return (a.distance || 9999) - (b.distance || 9999);
        }
        if (currentFilters.sortBy === "level") {
            const priority = { "L1": 1, "L2": 2, "N1": 3, "N2": 4, "N3": 5, "NAT": 6, "REG": 7 };
            const getLevel = (comp) => comp.split(' - ')[1] || "REG";
            return (priority[getLevel(a.compFormatted)] || 99) - (priority[getLevel(b.compFormatted)] || 99);
        }
        return a.dateObj - b.dateObj;
    });

    currentlyFiltered = filtered;
    renderMatches(filtered);
}

function renderMatches(data) {
    const grid = document.getElementById('grid');
    grid.innerHTML = '';

    if (data.length === 0) {
        grid.innerHTML = `
            <div class="no-results">
                <i class="fa-solid fa-calendar-xmark" style="font-size: 3rem; margin-bottom: 1rem; color: #ccc;"></i>
                <p>Aucun match ne correspond à vos critères de recherche.</p>
                <button onclick="resetFilters()" class="calc-btn" style="margin-top: 1rem; width: auto;">
                    Réinitialiser les filtres
                </button>
            </div>
        `;
        return;
    }
    
    data.forEach(m => {
        const card = document.createElement('article');
        card.className = 'card';
        card.id = `match-card-${getMatchId(m)}`;

        const matchId = getMatchId(m);
        const currentStatus = matchStatuses[matchId] || null;
        const statusClass = currentStatus ? `status-${currentStatus}` : '';

        const emoji = SPORT_EMOJIS[m.sport.toLowerCase()] || "🏟️";
        const coordsArg = m.locationCoords ? JSON.stringify(m.locationCoords) : 'null';
        
        const distText = m.isCalculating ? '<i class="fa-solid fa-spinner fa-spin"></i>' : (m.distance > 0 ? `${m.distance} km` : '-- km');

        // --- CORRECTION DES LIENS GOOGLE MAPS ---
        let mapsUrl = "#";
        if (m.locationCoords) {
            if (userPosition) {
                // Lien d'itinéraire (Direction)
                mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${userPosition.lat},${userPosition.lon}&destination=${m.locationCoords.lat},${m.locationCoords.lon}&travelmode=driving`;
            } else {
                // Lien de localisation simple
                mapsUrl = `https://www.google.com/maps/search/?api=1&query=${m.locationCoords.lat},${m.locationCoords.lon}`;
            }
        }

        card.innerHTML = `
            <button class="fav-btn ${statusClass}" 
                    onclick="cycleStatus(event, '${matchId}')" 
                    title="Cliquez pour changer le statut">
                <i class="${getStatusIcon(currentStatus)}"></i>
            </button>
            <div class="match-header">
                <div class="team">
                    <img src="${getLogoUrl(m.home.name)}" class="team-logo" onerror="this.src='https://placehold.co/42x42/png?text=H'">
                    <span class="team-name">${m.home.name}</span>
                </div>
                <div class="match-center">
                    <div class="match-time">${m.time}</div>
                    <div class="vs">VS</div>
                </div>
                <div class="team">
                    <img src="${getLogoUrl(m.away.name)}" class="team-logo" onerror="this.src='https://placehold.co/42x42/png?text=A'">
                    <span class="team-name">${m.away.name}</span>
                </div>
            </div>
            <div class="match-meta">
                <span class="badge"><span>${emoji}</span> ${m.compFormatted}</span>
                <div class="date-group" style="display: flex; align-items: center; gap: 8px;">
                    <span class="date-time">${m.dateDisplay}</span>
                    <button class="calendar-btn" 
                            onclick='exportToGoogleCalendar("${m.home.name.replace(/"/g, "")}", "${m.away.name.replace(/"/g, "")}", new Date("${m.dateObj.toISOString()}"), "${m.compFormatted}", "${m.sport}", ${coordsArg})'
                            title="Ajouter à Google Agenda"
                            style="background:none; border:none; cursor:pointer; color: var(--accent); font-size: 14px; padding: 0;">
                        <i class="fa-solid fa-calendar-plus"></i>
                    </button>
                </div>
            </div>
            <div class="transport-block">
                <div class="transport-info">
                    <div class="distance">${distText}</div>
                    <div class="modes">
                        ${m.weather ? `<div class="mode weather-badge" title="Météo prévue">${m.weather}</div>` : ''}
                        <div class="mode"><i class="fa-solid fa-car"></i> ${m.times.car || '--'}'</div>
                        <div class="mode"><i class="fa-solid fa-train-subway"></i> ${m.times.public || '--'}'</div>
                    </div>
                </div>
                <a href="${mapsUrl}" target="_blank" class="maps-arrow ${!m.locationCoords ? 'disabled' : ''}" title="Voir l'itinéraire sur Google Maps">
                    <i class="fa-solid fa-chevron-right"></i>
                </a>
            </div>
            <div class="accred-footer">
                ${getAccreditationHTML(m)}
                <a href="${m.sourceUrl}" target="_blank" class="source-link" title="Voir la source officielle">
                    <i class="fa-solid fa-link"></i>
                </a>
            </div>
        `;

const compShort = getShortComp(m.compFormatted, m.sport);

        card.innerHTML = `
            <button class="fav-btn ${statusClass}" onclick="cycleStatus(event, '${matchId}')">
                <i class="${getStatusIcon(currentStatus)}"></i>
            </button>
            <div class="match-header">
                <div class="team">
                    <img src="${getLogoUrl(m.home.name)}" class="team-logo" onerror="this.src='https://placehold.co/42x42/png?text=H'">
                    <span class="team-name">${m.home.name}</span>
                </div>
                <div class="match-center">
                    <div class="match-time">${m.time}</div>
                    <div class="vs">VS</div>
                </div>
                <div class="team">
                    <img src="${getLogoUrl(m.away.name)}" class="team-logo" onerror="this.src='https://placehold.co/42x42/png?text=A'">
                    <span class="team-name">${m.away.name}</span>
                </div>
            </div>
            <div class="match-meta">
                
                <span class="badge badge-long"><span>${emoji}</span> ${m.compFormatted}</span>
                <span class="badge badge-short">${compShort}</span>

                <div class="date-group" style="display: flex; align-items: center; gap: 8px;">
                    <span class="date-time date-long">${m.dateDisplay}</span>
                    <span class="date-time date-short">${m.dateShort}</span>

                    <button class="calendar-btn" 
                            onclick='exportToGoogleCalendar("${m.home.name.replace(/"/g, "")}", "${m.away.name.replace(/"/g, "")}", new Date("${m.dateObj.toISOString()}"), "${m.compFormatted}", "${m.sport}", ${coordsArg})'>
                        <i class="fa-solid fa-calendar-plus"></i>
                    </button>
                </div>
            </div>
            <div class="transport-block">
                <div class="transport-info">
                    <div class="distance">${distText}</div>
                    <div class="modes">
                        ${m.weather ? `<div class="mode weather-badge">${m.weather}</div>` : ''}
                        <div class="mode"><i class="fa-solid fa-car"></i> ${m.times.car || '--'}'</div>
                    </div>
                </div>
                <a href="${mapsUrl}" target="_blank" class="maps-arrow ${!m.locationCoords ? 'disabled' : ''}">
                    <i class="fa-solid fa-chevron-right"></i>
                </a>
            </div>
            <div class="accred-footer">
                ${getAccreditationHTML(m)}
                <a href="${m.sourceUrl}" target="_blank" class="source-link">
                    <i class="fa-solid fa-link"></i>
                </a>
            </div>
        `;
        grid.appendChild(card);
    });
}

function exportToGoogleCalendar(home, away, dateObj, comp, sport, coords) {
    const formatDate = (date) => date.toISOString().replace(/-|:|\.\d\d\d/g, "");

    const startTime = formatDate(dateObj);
    const endTime = formatDate(new Date(dateObj.getTime() + 2 * 60 * 60 * 1000));

    const title = encodeURIComponent(`${home} vs ${away}`);
    const details = encodeURIComponent(`Accréditation photographe sur le match ${home} vs ${away} en ${comp} - Généré via Fokal Press`);
    
    // Modification ici : si coords existe, on met "lat,lon", sinon le nom du club
    const locationValue = coords ? `${coords.lat},${coords.lon}` : home;
    const location = encodeURIComponent(locationValue);

    const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startTime}/${endTime}&details=${details}&location=${location}`;
    
    window.open(url, '_blank');
}

function updateFilterSlider() {
    const activeBtn = document.querySelector('.filter-btn.active');
    const slider = document.querySelector('.filter-slider');
    
    if (activeBtn && slider) {
        slider.style.width = `${activeBtn.offsetWidth}px`;
        slider.style.left = `${activeBtn.offsetLeft}px`;
    }
}

// Listeners
    document.addEventListener('DOMContentLoaded', () => {
    loadMatches();
    
    document.getElementById('gpsBtn').addEventListener('click', () => {
        const btn = document.getElementById('gpsBtn');
        const cityInput = document.getElementById('startCityInput');
        
        // CAS 1 : DÉSACTIVATION DU GPS
        if (btn.classList.contains('active')) {
            btn.classList.remove('active');
            userPosition = null; 
            localStorage.removeItem('userLastPosition');
            
            // On réinitialise l'affichage des distances à "-- km"
            resetDistancesDisplay();
            
            console.log("📍 GPS désactivé, affichage de la recherche manuelle.");
        } 
        // CAS 2 : ACTIVATION DU GPS
        else {
            // On vide le champ ville pour éviter la confusion
            cityInput.value = ""; 
            
            // On change l'icône temporairement pour montrer le chargement
            const originalIcon = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            
            requestUserLocation(btn, originalIcon);
        }
    });

    document.getElementById('searchInput').addEventListener('input', e => {
        currentFilters.search = e.target.value;
        applyFilters();
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelector('.filter-btn.active').classList.remove('active');
            btn.classList.add('active');
            currentFilters.sport = btn.dataset.filter;
            
            updateFilterSlider();
            applyFilters();
        });
    });

    document.getElementById('siteLogo').addEventListener('click', resetFilters);
    document.getElementById('weekFilter').addEventListener('change', e => { currentFilters.week = e.target.value; applyFilters(); });
    document.getElementById('compFilter').addEventListener('change', e => { currentFilters.comp = e.target.value; applyFilters(); });
    document.getElementById('sortFilter').addEventListener('change', e => { currentFilters.sortBy = e.target.value; applyFilters(); });
    document.getElementById('accredToggle').addEventListener('change', e => { currentFilters.accredOnly = e.target.checked; applyFilters(); });
    
    window.addEventListener('scroll', () => {
        document.getElementById('mainHeader').classList.toggle('scrolled', window.scrollY > 20);
    });

    window.addEventListener('load', updateFilterSlider);
    window.addEventListener('resize', updateFilterSlider);

    const savedPos = localStorage.getItem('userLastPosition');
    if (savedPos) {
        userPosition = JSON.parse(savedPos);
        document.getElementById('gpsBtn').classList.add('active');
    }

    document.getElementById('menuToggle').addEventListener('click', (e) => {
        e.stopPropagation(); 
        document.getElementById('mainHeader').classList.toggle('menu-open');
    });
    const themeToggle = document.getElementById('themeToggle');
    const body = document.body;
    const themeIcon = themeToggle.querySelector('i');

    // 1. Vérifier si un thème est déjà sauvegardé ou utiliser la préférence système
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        body.classList.add('dark-mode');
        themeIcon.classList.replace('fa-moon', 'fa-sun');
    }

    // 2. Gérer le clic sur le bouton
    themeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        
        const isDark = body.classList.contains('dark-mode');
        
        // Changer l'icône
        if (isDark) {
            themeIcon.classList.replace('fa-moon', 'fa-sun');
            localStorage.setItem('theme', 'dark');
        } else {
            themeIcon.classList.replace('fa-sun', 'fa-moon');
            localStorage.setItem('theme', 'light');
        }
    });

    const cityInput = document.getElementById('startCityInput');

    // Fonction pour gérer la recherche et le calcul
    const handleCitySearch = async () => {
        const city = cityInput.value.trim();
        if (!city) return;

        // Feedback visuel : ça charge
        cityInput.style.opacity = "0.5";
        cityInput.disabled = true;
        document.body.style.cursor = "wait";

        try {
            const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(city)}&limit=1&apiKey=${GEOAPIFY_KEY}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.features && data.features.length > 0) {
                const props = data.features[0].properties;
                
                // 1. On force la mise à jour de la position
                userPosition = { lat: props.lat, lon: props.lon };
                
                // 2. On s'assure que le bouton GPS est visuellement éteint
                document.getElementById('gpsBtn').classList.remove('active');
                
                // 3. IMPORTANT : On nettoie le cache précédent
                travelCache.clear();
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith('travel_')) localStorage.removeItem(key);
                });

                console.log(`✅ Ville trouvée : ${props.city || city} (${userPosition.lat}, ${userPosition.lon})`);

                // 4. On force le recalcul immédiat
                // On remet isCalculating à false au cas où il serait bloqué
                isCalculating = false; 
                await updateDistances();
                
                // Succès visuel
                cityInput.style.borderColor = "#34C759";
            } else {
                alert("Ville introuvable. Essayez avec le code postal (ex: Paris 75001)");
                cityInput.style.borderColor = "red";
                userPosition = null; // On annule la position si ville fausse
            }
        } catch (e) {
            console.error("Erreur Geocoding:", e);
            alert("Erreur de connexion lors de la recherche de la ville.");
        } finally {
            // Rétablissement de l'interface
            cityInput.disabled = false;
            cityInput.style.opacity = "1";
            document.body.style.cursor = "default";
            // On redonne le focus au champ pour pouvoir corriger si besoin
            cityInput.focus(); 
        }
    };

    // Déclenchement sur "Entrée"
    cityInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleCitySearch();
        }
    });

    // Déclenchement quand on clique ailleurs (changement de focus)
    cityInput.addEventListener('change', handleCitySearch);

    const viewToggle = document.getElementById('viewToggle');
    const matchesGrid = document.getElementById('grid');
    const viewIcon = viewToggle.querySelector('i');

    // Fonction pour appliquer la vue
    const setViewMode = (mode) => {
        if (mode === 'list') {
            matchesGrid.classList.add('list-view');
            viewToggle.classList.add('active');
            viewIcon.classList.replace('fa-list', 'fa-border-all');
            viewToggle.title = "Passer en vue Grille";
        } else {
            matchesGrid.classList.remove('list-view');
            viewToggle.classList.remove('active');
            viewIcon.classList.replace('fa-border-all', 'fa-list');
            viewToggle.title = "Passer en vue Liste";
        }
        localStorage.setItem('viewMode', mode);
    };

    // Chargement de la préférence
    const savedView = localStorage.getItem('viewMode');
    if (savedView === 'list') {
        setViewMode('list');
    }

    // Event Listener
    viewToggle.addEventListener('click', () => {
        const isList = matchesGrid.classList.contains('list-view');
        setViewMode(isList ? 'grid' : 'list');
    });

    const distSlider = document.getElementById('distSlider');
    const distValue = document.getElementById('distValue');

    // On vérifie que les éléments existent AVANT d'ajouter les écouteurs
    if (distSlider && distValue) {
        
        // Mise à jour visuelle
        distSlider.addEventListener('input', (e) => {
            distValue.textContent = e.target.value + "km";
        });

        // Application du filtre
        distSlider.addEventListener('change', (e) => {
            currentFilters.maxDist = parseInt(e.target.value);
            applyFilters();
        });
    }

    let mapInstance = null;
    let markersLayer = null;

    const mapModal = document.getElementById('mapModal');
    const mapToggleBtn = document.getElementById('mapToggle');
    const closeMapBtn = document.getElementById('closeMapBtn');

    function initMap() {
        if (mapInstance) return; // Déjà initialisée

        // 1. Création de la map (centrée sur la France par défaut)
        mapInstance = L.map('leafletMap').setView([46.603354, 1.888334], 6);

        // 2. Ajout des tuiles Geoapify (Style OSM Bright)
        L.tileLayer(`https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${GEOAPIFY_KEY}`, {
            attribution: 'Powered by Geoapify | © OpenStreetMap',
            maxZoom: 20, 
            id: 'osm-bright',
        }).addTo(mapInstance);

        // 3. Groupe de marqueurs pour pouvoir les nettoyer facilement
        markersLayer = L.layerGroup().addTo(mapInstance);
    }


    function updateMapMarkers() {
        if (!mapInstance || !markersLayer) return;

        markersLayer.clearLayers(); // On efface les anciens points
        const bounds = []; // Pour ajuster le zoom à la fin

        // 1. Groupement des matchs par coordonnées (lat_lon)
        const groupedMatches = {};

        currentlyFiltered.forEach(m => {
            if (m.locationCoords && m.locationCoords.lat && m.locationCoords.lon) {
                const key = `${m.locationCoords.lat}_${m.locationCoords.lon}`;
                if (!groupedMatches[key]) {
                    groupedMatches[key] = [];
                }
                groupedMatches[key].push(m);
            }
        });

        // 2. Création des marqueurs pour chaque groupe
        Object.keys(groupedMatches).forEach(key => {
            const matches = groupedMatches[key];
            const [lat, lon] = key.split('_').map(Number);
            
            let popupContent = '';

            // CAS A : Un seul match (Affichage standard comme avant)
            if (matches.length === 1) {
                const m = matches[0];
                popupContent = `
                    <div class="map-popup-card">
                        <div class="map-popup-header">
                            <span>${m.home.name}</span>
                            <span style="color:var(--text-secondary)">vs</span>
                            <span>${m.away.name}</span>
                        </div>
                        <div style="font-size:12px; margin-bottom:4px;">
                            📅 ${m.dateDisplay} à ${m.time}
                        </div>
                        <div style="font-size:12px; margin-bottom:4px;">
                            🏆 ${m.compFormatted}
                        </div>
                        <button class="map-popup-btn" onclick="goToCard('${getMatchId(m)}')">
                            Voir la fiche
                        </button>
                    </div>
                `;
            } 
            // CAS B : Plusieurs matchs (Affichage en liste)
            else {
                let listHtml = matches.map(m => `
                    <div class="map-list-item">
                        <div class="map-list-title">
                            ${m.home.name} <span style="font-weight:400; opacity:0.7;">vs</span> ${m.away.name}
                        </div>
                        <div class="map-list-meta">
                            📅 ${m.dateDisplay} (${m.time})
                        </div>
                        <button class="map-popup-btn small-btn" onclick="goToCard('${getMatchId(m)}')">
                            Voir
                        </button>
                    </div>
                `).join('');

                popupContent = `
                    <div class="map-popup-card">
                        <div class="map-popup-header multi-header">
                            📍 ${matches.length} Matchs ici
                        </div>
                        <div class="map-scroll-container">
                            ${listHtml}
                        </div>
                    </div>
                `;
            }

            // Création du marqueur
            const marker = L.marker([lat, lon]).bindPopup(popupContent);
            markersLayer.addLayer(marker);
            bounds.push([lat, lon]);
        });

        // Ajuster la vue pour voir tous les marqueurs
        if (bounds.length > 0) {
            mapInstance.fitBounds(bounds, { padding: [50, 50] });
        }
    }

    // Fonction globale pour le clic "Voir la fiche" depuis la popup
    window.goToCard = (matchId) => {
        // 1. Fermer la modale
        mapModal.classList.add('hidden');
        
        // 2. Trouver la carte dans la grille
        const card = document.getElementById(`match-card-${matchId}`);
        
        if (card) {
            // 3. Scroll doux vers la carte
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // 4. Petit effet visuel pour mettre en évidence
            card.style.borderColor = "var(--accent)";
            setTimeout(() => { card.style.borderColor = ""; }, 2000);
        }
    };

    // Event Listeners pour la carte
    mapToggleBtn.addEventListener('click', () => {
        mapModal.classList.remove('hidden');
        
        // Petit délai pour laisser le DOM afficher la div avant d'init Leaflet
        setTimeout(() => {
            initMap();
            mapInstance.invalidateSize(); // Important : recalculer la taille car la div était cachée
            updateMapMarkers(); // Charger les matchs filtrés actuels
        }, 100);
    });

    closeMapBtn.addEventListener('click', () => {
        mapModal.classList.add('hidden');
    });

    // Fermer si on clique en dehors de la carte (sur le fond gris)
    mapModal.addEventListener('click', (e) => {
        if (e.target === mapModal) {
            mapModal.classList.add('hidden');
        }
    });

    // --- GESTION DES FILTRES AVANCÉS & MODE COMPACT ---

    const advFiltersBtn = document.getElementById('advFiltersBtn');
    const advancedFilters = document.getElementById('advancedFilters');
    const mainHeader = document.getElementById('mainHeader'); // <-- Cible principale

    function toggleAdvancedFilters() {
        const isHidden = advancedFilters.classList.contains('hidden-filters');
        
        if (isHidden) {
            // --- OUVERTURE (Mode normal) ---
            advancedFilters.classList.remove('hidden-filters');
            advFiltersBtn.classList.add('active');
            
            // On retire le mode compact du header
            mainHeader.classList.remove('compact-mode');
            
            localStorage.setItem('showAdvancedFilters', 'true');
        } else {
            // --- FERMETURE (Mode compact) ---
            advancedFilters.classList.add('hidden-filters');
            advFiltersBtn.classList.remove('active');
            
            // On active le mode compact sur le header
            mainHeader.classList.add('compact-mode');
            
            localStorage.setItem('showAdvancedFilters', 'false');
        }
    }

    // Initialisation au chargement de la page
    if (advFiltersBtn && advancedFilters) {
        advFiltersBtn.addEventListener('click', toggleAdvancedFilters);

        const savedState = localStorage.getItem('showAdvancedFilters');
        
        if (savedState === 'true') {
            // État initial : OUVERT
            advancedFilters.classList.remove('hidden-filters');
            advFiltersBtn.classList.add('active');
            mainHeader.classList.remove('compact-mode');
        } else {
            // État initial : FERMÉ (Compact)
            advancedFilters.classList.add('hidden-filters');
            advFiltersBtn.classList.remove('active');
            mainHeader.classList.add('compact-mode');
        }
    }

    requestAnimationFrame(() => {
        document.body.classList.add('loaded');
    }); 


});


function sendFooterMail(type) {
    const adminEmail = "contact@fokalPress.fr"; 
    const siteTitle = "Fokal Press";

    const mailConfigs = {
        'add': {
            subject: `[${siteTitle}] Suggestion d'ajout : Nouveau Club`,
            body: "Bonjour,\n\n" +
                  "Je souhaiterais suggérer l'ajout d'une nouvelle entité sur le dashboard :\n\n" +
                  "• Nom du club : \n" +
                  "• Discipline (Foot/Basket/Hand) : \n" +
                  "• Niveau de compétition : \n" +
                  "• Lien site fédération (si connu) : \n\n" +
                  "Cordialement,\n" +
                  "[Prénom NOM]"
        },
        'suggest': {
            subject: `[${siteTitle}] Suggestion de contact d'accréditation`,
            body: "Bonjour,\n\n" +
                  "Je souhaite proposer un contact d'accréditation vérifié pour la base de données :\n\n" +
                  "• Club concerné : \n" +
                  "• Niveau de compétition : \n" +
                  "• Adresse e-mail de contact : \n\n" +
                  "IMPORTANT : Conformément aux règles de fiabilité, j'ai joint à cet e-mail une capture d'écran d'une réponse officielle du club prouvant la validité de ce contact.\n\n" +
                  "Cordialement,\n" +
                  "[Prénom NOM]"
        },
        'remove': {
            subject: `[${siteTitle}] Demande de retrait de données`,
            body: "Bonjour,\n\n" +
                  "En tant que propriétaire légitime, je sollicite le retrait des informations suivantes de votre plateforme :\n\n" +
                  "• Élément à supprimer (Nom du club ou adresse e-mail) : \n" +
                  "• Motif du retrait : \n\n" +
                  "IMPORTANT : J'ai joint à cet e-mail un justificatif prouvant ma qualité de propriétaire ou de responsable autorisé pour cette entité.\n\n" +
                  "Dans l'attente de votre confirmation,\n\n" +
                  "Cordialement,\n" +
                  "[Prénom NOM]"
        },
        'bug': {
            subject: `[${siteTitle}] Signalement d'anomalie`,
            body: "Bonjour,\n\n" +
                  "Je signale un dysfonctionnement technique :\n" +
                  "- \n\n" +
                  "Infos techniques :\n" +
                  `• Date : ${new Date().toLocaleString('fr-FR')}\n` +
                  `• Navigateur : ${navigator.userAgent}\n` +
                  "Cordialement,\n" +
                  "[Prénom NOM]"
        },
        'contact': {
            subject: `[${siteTitle}] Prise de contact`,
            body: "Bonjour,\n\n"
        }
    };

    const config = mailConfigs[type] || mailConfigs['contact'];
    const encodedSubject = encodeURIComponent(config.subject);
    const encodedBody = encodeURIComponent(config.body);
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${adminEmail}&su=${encodedSubject}&body=${encodedBody}`;
    
    window.open(gmailUrl, '_blank');
}
// --- CONFIGURATION FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDgTd3xeQpnlnr4YqTX2B9qwtAnzhQefDY",
  authDomain: "fokalpress.firebaseapp.com",
  projectId: "fokalpress",
  storageBucket: "fokalpress.firebasestorage.app",
  messagingSenderId: "646309909772",
  appId: "1:646309909772:web:ab3102c4e3351bf823e529",
  measurementId: "G-LYH1P3NB5L"
};

// Initialisation de Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
// Initialisation des services
const auth = firebase.auth();
const db = firebase.firestore();
const analytics = firebase.analytics();

// --- LOGIQUE GLOBALE (Connexion, Profil, Paramètres) ---

document.addEventListener('DOMContentLoaded', () => {
    // Éléments UI LOGIN
    const loginModal = document.getElementById('loginModal');
    const closeLoginBtn = document.getElementById('closeLoginBtn');
    const googleBtn = document.getElementById('googleLoginBtn');
    const loginView = document.getElementById('loginView');
    const profileView = document.getElementById('completeProfileView');
    const profileForm = document.getElementById('profileForm');

    // Éléments UI SETTINGS
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const settingsForm = document.getElementById('settingsForm');
    const settingsLogoutBtn = document.getElementById('settingsLogoutBtn');
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');

    // --- 1. ÉCOUTEUR D'ÉTAT AUTHENTIFICATION (Chargement initial) ---
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            console.log("Utilisateur connecté :", user.email);
            
            try {
                const userDoc = await db.collection('users').doc(user.uid).get();

                if (userDoc.exists) {
                    const userData = userDoc.data();
                    
                    // A. Sync Favoris (Priorité Cloud)
                    matchStatuses = userData.favorites || {};
                    localStorage.setItem('matchStatuses', JSON.stringify(matchStatuses));
                    renderMatches(currentlyFiltered);

                    // B. Cache Profil
                    if (userData.instagram) localStorage.setItem('userInsta', userData.instagram);
                    if (userData.portfolio) localStorage.setItem('userPortfolio', userData.portfolio);

                    // C. Update UI
                    updateLoginUI(true, userData.photoURL || user.photoURL);
                    loginModal.classList.add('hidden');

                } else {
                    // Nouveau compte (Pas encore en base)
                    matchStatuses = {};
                    localStorage.setItem('matchStatuses', JSON.stringify(matchStatuses));
                    renderMatches(currentlyFiltered);

                    // Ouvrir modale profil pour finir l'inscription
                    loginModal.classList.remove('hidden'); 
                    loginView.style.display = 'none';
                    profileView.style.display = 'block';
                }
            } catch (error) {
                console.error("Erreur chargement données:", error);
            }
        } else {
            // Déconnexion
            console.log("Utilisateur déconnecté");
            updateLoginUI(false);
            
            // Nettoyage
            matchStatuses = {}; 
            localStorage.removeItem('matchStatuses');
            localStorage.removeItem('userInsta');
            localStorage.removeItem('userPortfolio');
            
            renderMatches(currentlyFiltered);
        }
    });

    // --- 2. GESTION DU CLIC SUR L'ICÔNE UTILISATEUR ---
    document.querySelectorAll('.login-trigger').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const currentUser = auth.currentUser;

            if (currentUser) {
                // CAS A : CONNECTÉ -> On ouvre les PARAMÈTRES
                openSettingsModal();
            } else {
                // CAS B : DÉCONNECTÉ -> On ouvre le LOGIN
                loginModal.classList.remove('hidden');
                loginView.style.display = 'block';
                profileView.style.display = 'none';
            }
        });
    });

    // --- 3. FONCTIONS MODALE PARAMÈTRES ---
    
    // Ouvrir et charger les données
    async function openSettingsModal() {
        const user = auth.currentUser;
        if (!user) return;

        settingsModal.classList.remove('hidden');

        // Pré-remplissage des champs
        try {
            const doc = await db.collection('users').doc(user.uid).get();
            if (doc.exists) {
                const data = doc.data();
                if(document.getElementById('settingsInsta')) document.getElementById('settingsInsta').value = data.instagram || '';
                if(document.getElementById('settingsPortfolio')) document.getElementById('settingsPortfolio').value = data.portfolio || '';
            }
        } catch (e) {
            console.error("Erreur chargement profil", e);
        }
    }

    // Sauvegarder modifications
    if (settingsForm) {
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = auth.currentUser;
            const btn = settingsForm.querySelector('button');
            const originalText = "Enregistrer les modifications";
            
            const newInsta = document.getElementById('settingsInsta').value.trim();
            const newPortfolio = document.getElementById('settingsPortfolio').value.trim();

            // 1. État de chargement
            btn.disabled = true;
            btn.innerText = "Enregistrement...";

            try {
                await db.collection('users').doc(user.uid).update({
                    instagram: newInsta,
                    portfolio: newPortfolio
                });

                // 2. SUCCÈS : Bouton Vert + Message
                btn.style.backgroundColor = "#34C759";
                btn.style.borderColor = "#34C759";
                btn.innerHTML = '<i class="fa-solid fa-check"></i> Enregistré !';

                // 3. Fermeture après délai (1.5s)
                setTimeout(() => {
                    settingsModal.classList.add('hidden');
                    
                    // Reset du bouton pour la prochaine fois
                    btn.innerText = originalText;
                    btn.style.backgroundColor = "";
                    btn.style.borderColor = "";
                    btn.disabled = false;
                }, 1500);

            } catch (error) {
                console.error(error);
                alert("Erreur : " + error.message);
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });
    }

    // Déconnexion via le bouton gris
// Déconnexion via le bouton gris
    if (settingsLogoutBtn) {
        settingsLogoutBtn.addEventListener('click', async () => {
            const originalText = '<i class="fa-solid fa-right-from-bracket"></i> Se déconnecter';
            
            // 1. État de chargement
            settingsLogoutBtn.disabled = true;
            settingsLogoutBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Déconnexion...';

            try {
                await auth.signOut();

                // 2. SUCCÈS : Bouton Vert
                settingsLogoutBtn.style.backgroundColor = "#34C759";
                settingsLogoutBtn.style.borderColor = "#34C759";
                settingsLogoutBtn.style.color = "#ffffff"; // Force le texte en blanc
                settingsLogoutBtn.innerHTML = '<i class="fa-solid fa-check"></i> Déconnecté !';

                console.log("Déconnexion réussie"); 
                resetFilters(); 

                // 3. Fermeture après délai (1.5s)
                setTimeout(() => {
                    settingsModal.classList.add('hidden');
                    
                    // Reset du bouton (invisible, mais propre pour la prochaine fois)
                    settingsLogoutBtn.style.backgroundColor = "";
                    settingsLogoutBtn.style.borderColor = "";
                    settingsLogoutBtn.style.color = ""; // Retour couleur css
                    settingsLogoutBtn.innerHTML = originalText;
                    settingsLogoutBtn.disabled = false;
                }, 1000);

            } catch (error) {
                console.error(error);
                settingsLogoutBtn.innerHTML = originalText;
                settingsLogoutBtn.disabled = false;
            }
        });
    }

    // Suppression de compte via le bouton rouge
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', async () => {
            const confirmation = prompt("Pour confirmer la suppression définitive, tapez 'SUPPRIMER' ci-dessous :");
            if (confirmation === "SUPPRIMER") {
                const user = auth.currentUser;
                const uid = user.uid;
                try {
                    await db.collection('users').doc(uid).delete();
                    await user.delete();
                    alert("Votre compte a été supprimé.");
                    settingsModal.classList.add('hidden');
                    resetFilters();
                } catch (error) {
                    if (error.code === 'auth/requires-recent-login') {
                        alert("Par sécurité, veuillez vous déconnecter et vous reconnecter avant de supprimer votre compte.");
                    } else {
                        alert("Erreur : " + error.message);
                    }
                }
            }
        });
    }

    // Fermeture Settings
    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
    }
    settingsModal.addEventListener('click', (e) => {
        if(e.target === settingsModal) settingsModal.classList.add('hidden');
    });


    // --- 4. FONCTIONS MODALE LOGIN (Google & Inscription) ---

    // Connexion Google
    if(googleBtn) {
        googleBtn.addEventListener('click', async () => {
            // On stocke le contenu HTML original pour pouvoir le remettre plus tard
            const originalContent = `
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" width="18" height="18">
                <span>Continuer avec Google</span>
            `;
            
            // 1. État de chargement
            googleBtn.disabled = true;
            googleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connexion...';
            
            const provider = new firebase.auth.GoogleAuthProvider();
            
            try {
                await auth.signInWithPopup(provider);
                
                // 2. SUCCÈS : Bouton Vert
                googleBtn.classList.remove('google-btn'); // Enlève le style blanc
                googleBtn.style.backgroundColor = "#34C759";
                googleBtn.style.borderColor = "#34C759";
                googleBtn.style.color = "white";
                googleBtn.innerHTML = '<i class="fa-solid fa-check"></i> Connecté !';

                // 3. RESET AUTOMATIQUE après 1.5 seconde (pour la prochaine fois)
                setTimeout(() => {
                    googleBtn.disabled = false;
                    googleBtn.classList.add('google-btn'); // Remet le style blanc
                    googleBtn.style.backgroundColor = "";
                    googleBtn.style.borderColor = "";
                    googleBtn.style.color = "";
                    googleBtn.innerHTML = originalContent;
                }, 1500);

            } catch (error) {
                console.error("Erreur login Google:", error);
                alert("Erreur de connexion : " + error.message);
                
                // Reset immédiat en cas d'erreur
                googleBtn.disabled = false;
                googleBtn.classList.add('google-btn');
                googleBtn.style.backgroundColor = "";
                googleBtn.style.borderColor = "";
                googleBtn.style.color = "";
                googleBtn.innerHTML = originalContent;
            }
        });
    }

    // Enregistrement Profil (Premier login)
    if(profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = auth.currentUser;
            if(!user) return;

            const insta = document.getElementById('profileInsta').value.trim();
            const portfolio = document.getElementById('profilePortfolio').value.trim();
            const errorMsg = document.getElementById('formError');
            const submitBtn = profileForm.querySelector('button');
            const originalText = "Valider mon profil";

            if (!insta && !portfolio) {
                errorMsg.style.display = 'block';
                return; 
            } else {
                errorMsg.style.display = 'none';
            }

            // 1. État de chargement
            submitBtn.disabled = true;
            submitBtn.innerText = "Enregistrement...";

            try {
                await db.collection('users').doc(user.uid).set({
                    uid: user.uid,
                    displayName: user.displayName,
                    email: user.email,
                    photoURL: user.photoURL,
                    instagram: insta,
                    portfolio: portfolio,
                    favorites: {},
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // 2. SUCCÈS : Bouton Vert
                submitBtn.style.backgroundColor = "#34C759";
                submitBtn.style.borderColor = "#34C759";
                submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Profil créé !';

                updateLoginUI(true, user.photoURL);

                // 3. Fermeture après délai
                setTimeout(() => {
                    loginModal.classList.add('hidden');
                    // Reset
                    submitBtn.innerText = originalText;
                    submitBtn.style.backgroundColor = "";
                    submitBtn.style.borderColor = "";
                    submitBtn.disabled = false;
                }, 1500);

            } catch (error) {
                alert("Erreur : " + error.message);
                submitBtn.innerText = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    // Fonction pour remettre les boutons à zéro quand on ferme les modales
    function resetAllButtons() {
        // Reset Google
        if (googleBtn) {
            googleBtn.disabled = false;
            googleBtn.classList.add('google-btn');
            googleBtn.style = ""; // Enlève tous les styles inline (vert/bordures)
            googleBtn.innerHTML = `
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" width="18" height="18">
                <span>Continuer avec Google</span>
            `;
        }
        // Reset Logout
        if (settingsLogoutBtn) {
            settingsLogoutBtn.disabled = false;
            settingsLogoutBtn.style = "";
            settingsLogoutBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Se déconnecter';
        }
    }

    // Fermeture Login
// Fermeture Login (Bouton Croix)
    if(closeLoginBtn) {
        closeLoginBtn.addEventListener('click', () => {
            const user = auth.currentUser;
            if (user && profileView.style.display === 'block') {
                auth.signOut(); 
            }
            loginModal.classList.add('hidden');
            resetAllButtons(); // <--- AJOUT ICI
        });
    }
    // Fermeture Login (Clic extérieur)
    loginModal.addEventListener('click', (e) => {
        if (e.target === loginModal) {
            const user = auth.currentUser;
            if (user && profileView.style.display === 'block') {
                auth.signOut();
            }
            loginModal.classList.add('hidden');
            resetAllButtons(); // <--- AJOUT ICI
        }
    });

    // Fermeture Settings (Bouton Croix)
    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
            resetAllButtons(); // <--- AJOUT ICI
        });
    }
    // Fermeture Settings (Clic extérieur)
    settingsModal.addEventListener('click', (e) => {
        if(e.target === settingsModal) {
            settingsModal.classList.add('hidden');
            resetAllButtons(); // <--- AJOUT ICI
        }
    });
    
    loginModal.addEventListener('click', (e) => {
        if (e.target === loginModal) {
            const user = auth.currentUser;
            if (user && profileView.style.display === 'block') {
                auth.signOut();
            }
            loginModal.classList.add('hidden');
        }
    });

    // --- 5. LOGIQUE BASCULE VUES LOGIN (Optionnel si usage Google unique) ---
    const showSignupLink = document.getElementById('showSignupLink');
    const showLoginLink = document.getElementById('showLoginLink');
    
    if(showSignupLink) {
        showSignupLink.addEventListener('click', (e) => {
            e.preventDefault();
            loginView.style.display = 'none';
            document.getElementById('signupView').style.display = 'block';
        });
    }
    if(showLoginLink) {
        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('signupView').style.display = 'none';
            loginView.style.display = 'block';
        });
    }
});

// --- FONCTIONS UI ---

function updateLoginUI(isLogged, photoURL) {
    document.querySelectorAll('.login-trigger').forEach(btn => {
        if (isLogged) {
            btn.title = "Mon Compte";
            if (photoURL) {
                btn.innerHTML = `<img src="${photoURL}" style="width:28px; height:28px; border-radius:50%; border: 2px solid #34C759; object-fit: cover;">`;
            } else {
                btn.innerHTML = '<i class="fa-solid fa-user-astronaut logged-in-icon"></i>';
            }
        } else {
            btn.title = "Se connecter";
            btn.innerHTML = '<i class="fa-regular fa-user"></i>'; 
        }
    });
}