const GEOAPIFY_KEY = "61ca90447ebd483ab2f002050433fa42"; 
const SPORT_EMOJIS = { "football": "⚽", "basketball": "🏀", "handball": "🤾"};

// États globaux
let allMatches = [];
let currentlyFiltered = []; 
let currentFilters = { week: "", comp: "all", sport: "all", accredOnly: false, sortBy: "date", search: "", maxDist: 300 };
let userPosition = null;
let matchToDelete = null;
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

function checkAuthOrBlock() {
    if (firebase.auth().currentUser) {
        return true;
    } else {
        document.getElementById('featureAuthModal').classList.remove('hidden');
        return false;
    }
}

function openGmailCompose(email, homeTeam, awayTeam, matchDate, sport, compet) {
    // --- VERIFICATION AUTH ---
    if (!checkAuthOrBlock()) return;
    // -------------------------

    // 1. Récupération des infos
    const user = firebase.auth().currentUser;
    const storedInsta = localStorage.getItem('userInsta');
    const storedPortfolio = localStorage.getItem('userPortfolio');

    const userName = (user && user.displayName) ? user.displayName : "[VOTRE NOM ET PRÉNOM]";

    // 2. Construction de la phrase de présentation du travail
    let workSentence = "";

    // app.js ligne 160 environ
    if (storedInsta && storedPortfolio) {
        workSentence = `Vous pouvez avoir un aperçu de mon travail sur mon portfolio : ${storedPortfolio} ainsi que sur mon compte Instagram : @${storedInsta}`;
    } else if (storedInsta) {
        // Si storedInsta est déjà propre (ex: "l.kilian6"), le @ s'affichera correctement
        workSentence = `Vous pouvez avoir un aperçu de mon travail sur mon compte Instagram : @${storedInsta}`;
    } else if (storedPortfolio) {
        workSentence = `Vous pouvez avoir un aperçu de mon travail sur mon portfolio : ${storedPortfolio}`;
    } else {
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

    const isLogged = firebase.auth() && firebase.auth().currentUser;
    const teamName = match.home.name.toUpperCase();
    const isEspoirs = match.compFormatted.includes("U21") || match.compFormatted.includes("ESPOIRS");
    
    let key = null;
    if (isEspoirs) {
        key = Object.keys(ACCRED_LIST).find(k => k === `${teamName}_U21` || k === `${teamName}_ESPOIRS`);
    }
    if (!key) {
        key = Object.keys(ACCRED_LIST).find(k => teamName.includes(k) && !k.includes("_U21") && !k.includes("_ESPOIRS"));
    }
    
    if (key) {
        const contact = ACCRED_LIST[key];
        
        // --- CAS : UTILISATEUR NON CONNECTÉ ---
        if (!isLogged) {
            return `
                <div class="accred-status accred-available" 
                    onclick="document.getElementById('featureAuthModal').classList.remove('hidden')" 
                    style="gap: 12px; opacity: 0.7; cursor: pointer;" 
                    title="Connectez-vous pour voir l'adresse">
                    <i class="fa-solid fa-lock" style="font-size: 12px; color: var(--text-muted);"></i>
                    <span class="accred-text accred-email-text" style="filter: blur(4px); user-select: none;">
                        adresse@masquee.fr
                    </span>
                </div>`;
        }

        // --- CAS : UTILISATEUR CONNECTÉ ---
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

        return `
            <div class="accred-status accred-available" style="gap: 12px;">
                <a href="#" onclick="copyToClipboard(event, '${contact}')" title="Copier le mail">
                    <i class="fa-solid fa-copy"></i>
                </a>
                <a href="#" onclick="openGmailCompose('${contact}', '${home}', '${away}', '${shortDate}', '${match.sport}', '${compRaw}')" title="Ouvrir dans Gmail" style="color: #ea4335;">
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

let matchArchives = JSON.parse(localStorage.getItem('matchArchives') || '{}');

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
    // Le regex /['"\s]/g cible : les apostrophes ('), les guillemets (") et les espaces (\s)
    const clean = (str) => str.replace(/['"\s]/g, '');

    const h = clean(m.home.name);
    const a = clean(m.away.name);
    
    // Sécurité supplémentaire : s'assurer que la date est valide
    const d = m.dateObj ? m.dateObj.toISOString().split('T')[0] : 'NODATE';
    
    return `${h}_${a}_${d}`;
};


// Fonction pour envoyer un changement unique à Firebase
async function syncFavoriteToFirebase(matchId, status, snapshotData) {
    const user = auth.currentUser;
    if (!user) return;

    const userRef = db.collection('users').doc(user.uid);
    const payload = {};

    if (status) {
        payload.favorites = { [matchId]: status };
    } else {
        payload.favorites = { [matchId]: firebase.firestore.FieldValue.delete() };
    }

    if (snapshotData) {
        payload.archives = { [matchId]: snapshotData };
    } else {
        payload.archives = { [matchId]: firebase.firestore.FieldValue.delete() };
    }

    try {
        await userRef.set(payload, { merge: true });
    } catch (e) {
        console.error(e);
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

    // --- LOGIQUE D'ARCHIVAGE STRICTE ---
    // On nettoie l'ID pour la recherche
    const cleanId = matchId.replace(/\s+/g, '');
    const matchDataObj = allMatches.find(m => getMatchId(m) === cleanId);
    
    let snapshot = null;

    // RÈGLE : On archive UNIQUEMENT si le statut devient 'received'
    if (nextStatus === 'received' && matchDataObj) {
        snapshot = {
            sport: matchDataObj.sport,
            home: { name: matchDataObj.home.name },
            away: { name: matchDataObj.away.name },
            compFormatted: matchDataObj.compFormatted,
            dateObj: matchDataObj.dateObj.toISOString()
        };
        // On sauvegarde en local
        matchArchives[matchId] = snapshot;
    } else {
        // Pour tout autre statut (asked, envie, refused, null), on SUPPRIME l'archive
        delete matchArchives[matchId];
        snapshot = null; // Cela signalera à Firebase de supprimer le champ
    }
    // -----------------------------------

    // 1. Mise à jour des variables globales
    if (nextStatus) {
        matchStatuses[matchId] = nextStatus;
    } else {
        delete matchStatuses[matchId];
    }

    // 2. Mise à jour du Cache Local
    localStorage.setItem('matchStatuses', JSON.stringify(matchStatuses));
    localStorage.setItem('matchArchives', JSON.stringify(matchArchives)); // <--- Sauvegarde locale

    // 3. LOGIQUE CONNEXION & CLOUD
    if (auth.currentUser) {
        // On envoie le snapshot (qui est null si pas 'received', donc ça supprimera)
        syncFavoriteToFirebase(matchId, nextStatus, snapshot);
    } else {
        if (nextStatus && !localStorage.getItem('hasShownLoginHint')) {
            localStorage.setItem('hasShownLoginHint', 'true');
            const hintModal = document.getElementById('favHintModal');
            if (hintModal) hintModal.classList.remove('hidden');
        }
    }

    // 4. Mise à jour Visuelle
    btn.classList.remove('status-envie', 'status-asked', 'status-received', 'status-refused');
    if (nextStatus) btn.classList.add(`status-${nextStatus}`);
    icon.className = getStatusIcon(nextStatus);
    
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
            const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).replace(':', 'h');
            // On force le format : "sam. 7 févr. 2026" puis on enlève les points pour faire "sam 7 févr 2026"
            const shortDate = d.toLocaleDateString('fr-FR', { 
                weekday: 'short', 
                day: 'numeric', 
                month: 'short', 
                year: 'numeric' 
            }).replace(/\./g, ''); // Enlève les points (ex: "sam." -> "sam")
                            
        return {
                sport: m.sport,
                sourceUrl: m.url || m.sourceUrl || "#",
                competition: m.competition || "N/A",
                compFormatted: formatCompetition(m.competition, m.sport),
                home: { name: m.home }, 
                away: { name: m.away },
                dateDisplay: shortDate,
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
    
    filteredMatches.forEach(m => {
        if (!seen.has(m.compFormatted)) {
            seen.add(m.compFormatted);
            uniqueComps.push({ name: m.compFormatted, sport: m.sport.toLowerCase() });
        }
    });

    uniqueComps.sort((a, b) => {
        if (a.name === "AUTRE") return 1;
        if (b.name === "AUTRE") return -1;
        return a.name.localeCompare(b.name);
    }).forEach(c => {
        
       let emoji = SPORT_EMOJIS[c.sport] || "🏟️";
        
        if (c.name === "AUTRE") {
            emoji = "🔖"; 
        }

        const opt = document.createElement('option');
        opt.value = c.name;
        // On supprime le texte du sport (ex: "FOOT - ") du nom affiché
        const displayName = c.name.replace(/^(FOOT|BASKET|HAND) - /, ''); 
        opt.textContent = `${emoji} ${displayName}`;
        
        if (c.name === savedValue) opt.selected = true;
        select.appendChild(opt);
    });

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

    const now = new Date();

    filtered = filtered.filter(m => {
        return m.dateObj >= now;
    });

    filtered = filtered.filter(m => {
        if (m.distance > 0 && m.distance > currentFilters.maxDist) {
            return false; 
        }
        if (m.away.name.toUpperCase().includes("EXEMPT")) {
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
        const compShort = getShortComp(m.compFormatted, m.sport);

        let mapsUrl = "#";
        if (m.locationCoords) {
            if (userPosition) {
                mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${userPosition.lat},${userPosition.lon}&destination=${m.locationCoords.lat},${m.locationCoords.lon}&travelmode=driving`;
            } else {
                mapsUrl = `https://www.google.com/maps/search/?api=1&query=${m.locationCoords.lat},${m.locationCoords.lon}`;
            }
        }
        card.setAttribute('onclick', `toggleMobileCard(event, '${matchId}')`);

        // --- LOGIQUE GENRE POUR LA CARTE ---
        // Détection Féminin
        const isWomen = m.compFormatted.includes("SENIOR F") || m.compFormatted.includes(" SF") || m.compFormatted.includes(" F ") || m.compFormatted.endsWith(" F");
        
        // Icône Rose si femme, sinon vide (pas d'icône homme)
        const genderIcon = isWomen 
            ? `<i class="fa-solid fa-venus" title="Féminin" style="color: #FF2D55; margin-left: 10px; font-size: 14px;"></i>` 
            : ``; 

        card.innerHTML = `
            <button class="fav-btn ${statusClass}" 
                    onclick="cycleStatus(event, '${matchId}')" 
                    title="Cliquez pour changer le statut">
                <i class="${getStatusIcon(currentStatus)}"></i>
            </button>
            <div class="match-header">
                <div class="team">
                    <img src="${getLogoUrl(m.home.name)}" class="team-logo" onerror="this.onerror=null; this.src='data/default-team.png'">
                    <span class="team-name">${m.home.name}</span>
                </div>
                <div class="match-center">
                    <div class="match-time">${m.time}</div>
                    <div class="vs">VS</div>
                </div>
                <div class="team">
                    <img src="${getLogoUrl(m.away.name)}" class="team-logo" onerror="this.onerror=null; this.src='data/default-team.png'">
                    <span class="team-name">${m.away.name}</span>
                </div>
            </div>
            
            <div class="match-meta">
                <div style="display:flex; align-items:center;">
                    <span class="badge badge-long"><span>${emoji}</span> ${m.compFormatted}</span>
                    <span class="badge badge-short">${compShort}</span>
                    ${genderIcon} </div>
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
                <a href="${mapsUrl}" target="_blank" rel="nofollow noopener"class="maps-arrow ${!m.locationCoords ? 'disabled' : ''}" title="Voir l'itinéraire sur Google Maps">
                    <i class="fa-solid fa-chevron-right"></i>
                </a>
            </div>
            <div class="accred-footer">
                ${getAccreditationHTML(m)}
                <a href="${m.sourceUrl}" target="_blank" rel="nofollow noopener" class="source-link" title="Voir la source officielle">
                    <i class="fa-solid fa-link"></i>
                </a>
            </div>
        `;

        grid.appendChild(card);
    });
}

function toggleMobileCard(event, matchId) {
    // Vérifier si on est sur mobile (<= 768px)
    if (window.innerWidth > 768) return;

    // Vérifier si on est en vue liste
    const grid = document.getElementById('grid');
    if (!grid.classList.contains('list-view')) return;

    const card = document.getElementById(`match-card-${matchId}`);
    if (card) {
        // Bascule la classe qui force l'affichage "Grille"
        card.classList.toggle('mobile-expanded');
    }
}

function exportToGoogleCalendar(home, away, dateObj, comp, sport, coords) {
    // --- VERIFICATION AUTH ---
    if (!checkAuthOrBlock()) return;
    // -------------------------

    const formatDate = (date) => date.toISOString().replace(/-|:|\.\d\d\d/g, "");

    // Si dateObj est passé comme string par le HTML inline, on le reconvertit
    const d = new Date(dateObj); 

    const startTime = formatDate(d);
    const endTime = formatDate(new Date(d.getTime() + 2 * 60 * 60 * 1000));

    const title = encodeURIComponent(`${home} vs ${away}`);
    const details = encodeURIComponent(`Accréditation photographe sur le match ${home} vs ${away} en ${comp} - Généré via Fokal Press`);
    
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

        // --- GESTION HISTORIQUE ---
    const historyModal = document.getElementById('historyModal');
    const openHistoryBtn = document.getElementById('openHistoryBtn');
    const closeHistoryBtn = document.getElementById('closeHistoryBtn');

    if (openHistoryBtn) {
        openHistoryBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Ferme les paramètres
            document.getElementById('settingsModal').classList.add('hidden');
            // Ouvre l'historique
            historyModal.classList.remove('hidden');
            // Charge les données
            renderHistory();
        });
    }

    if (closeHistoryBtn) {
        closeHistoryBtn.addEventListener('click', () => {
            historyModal.classList.add('hidden');
        });
    }

    // Fermeture clic extérieur
    historyModal.addEventListener('click', (e) => {
        if (e.target === historyModal) historyModal.classList.add('hidden');
    });
    localStorage.removeItem('hasShownLoginHint');
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
            cityInput.value = ""; 
            const savedPos = localStorage.getItem('userLastPosition');

            if (savedPos) {
                // On récupère la position sauvegardée sans redemander au navigateur
                userPosition = JSON.parse(savedPos);
                btn.classList.add('active');
                console.log("📍 Position récupérée du stockage local. Calcul...");
                updateDistances(); 
            } else {
                // Si rien en mémoire, on lance la demande de géolocalisation classique
                const originalIcon = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                requestUserLocation(btn, originalIcon);
            }
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
// --- GESTION STATISTIQUES ---
// --- GESTION STATISTIQUES ---
    const statsModal = document.getElementById('statsModal');
    const openStatsBtn = document.getElementById('openStatsBtn');
    const closeStatsBtn = document.getElementById('closeStatsBtn');
    const shareStatsBtn = document.getElementById('shareStatsBtn');
    const saveStatsBtn = document.getElementById('saveStatsBtn'); // Nouveau bouton

    // Configuration des couleurs par Sport pour le camembert
    const SPORT_COLORS = {
        'football': '#34C759',   // Vert
        'basketball': '#FF9500', // Orange
        'handball': '#0071E3'    // Bleu
    };

    const LEVEL_RANK = {
        'L1': 10, 'L2': 9, 'N1': 8, 'N2': 7, 'N3': 6, 
        'D1': 10, 'PRO A': 10, 'PRO B': 9, 'ELITE': 10,
        'NAT': 8, 'REG': 5, 'AUTRE': 0
    };

    // Fonction utilitaire pour générer le SVG du camembert
// --- NOUVELLE FONCTION DOUBLE DONUT (SUNBURST) ---
// --- NOUVELLE FONCTION DOUBLE DONUT (SUNBURST) CORRIGÉE ---
    function getPieChartSVG(data, colors) {
        const size = 100; 
        const center = size / 2;
        
        // Configuration des rayons
        const r1_in = 20; // Trou central
        const r1_out = 35; // Fin étage 1 (Sport)
        const gap = 2;     // Espace blanc
        const r2_in = r1_out + gap; // Début étage 2 (Niveaux)
        const r2_out = 50; // Fin étage 2

        let total = 0;
        ['football', 'basketball', 'handball'].forEach(sport => {
            if(data[sport]) Object.values(data[sport]).forEach(val => total += val);
        });

        if (total === 0) {
            return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                        <circle cx="${center}" cy="${center}" r="${r2_out}" fill="#F2F2F7" />
                        <circle cx="${center}" cy="${center}" r="${r1_in}" fill="var(--card-bg)" />
                    </svg>`;
        }

        let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform: rotate(-90deg);">`;
        
        // Helper amélioré pour gérer le 360° (Cercle complet)
        const createArc = (startA, endA, rIn, rOut, color, opacity = 1) => {
            // FIX : Si l'angle est un tour complet (2*PI), on le réduit infimement 
            // pour éviter que point de départ == point d'arrivée (sinon le SVG ne s'affiche pas)
            if (endA - startA >= 2 * Math.PI) {
                endA -= 0.0001;
            }

            const x1_out = center + rOut * Math.cos(startA);
            const y1_out = center + rOut * Math.sin(startA);
            const x2_out = center + rOut * Math.cos(endA);
            const y2_out = center + rOut * Math.sin(endA);

            const x1_in = center + rIn * Math.cos(startA);
            const y1_in = center + rIn * Math.sin(startA);
            const x2_in = center + rIn * Math.cos(endA);
            const y2_in = center + rIn * Math.sin(endA);

            // Large Arc Flag : 1 si l'angle est > 180 degrés
            const largeArc = (endA - startA) > Math.PI ? 1 : 0;

            const d = [
                `M ${x1_out} ${y1_out}`,
                `A ${rOut} ${rOut} 0 ${largeArc} 1 ${x2_out} ${y2_out}`,
                `L ${x2_in} ${y2_in}`,
                `A ${rIn} ${rIn} 0 ${largeArc} 0 ${x1_in} ${y1_in}`,
                `Z`
            ].join(' ');

            return `<path d="${d}" fill="${color}" fill-opacity="${opacity}" stroke="var(--card-bg)" stroke-width="1" />`;
        };

        let currentAngle = 0;

        ['football', 'basketball', 'handball'].forEach(sport => {
            const comps = data[sport];
            if (!comps || Object.keys(comps).length === 0) return;

            const baseColor = colors[sport];
            
            let sportTotal = 0;
            Object.values(comps).forEach(v => sportTotal += v);
            
            const sportSliceAngle = (sportTotal / total) * 2 * Math.PI;
            const sportEndAngle = currentAngle + sportSliceAngle;

            // --- ÉTAGE 1 : SPORT ---
            // Dessine le sport (ex: Vert pour Foot)
            svg += createArc(currentAngle, sportEndAngle, r1_in, r1_out, baseColor, 1);

            // --- ÉTAGE 2 : NIVEAUX ---
            let levelCurrentAngle = currentAngle;
            const sortedComps = Object.entries(comps).sort((a, b) => b[1] - a[1]);

            sortedComps.forEach(([compName, count], index) => {
                const levelSliceAngle = (count / sportTotal) * sportSliceAngle;
                const levelEndAngle = levelCurrentAngle + levelSliceAngle;
                
                // Opacité dégressive
                const opacity = 0.5 + (0.5 * (1 - (index / sortedComps.length)));

                svg += createArc(levelCurrentAngle, levelEndAngle, r2_in, r2_out, baseColor, opacity);
                
                levelCurrentAngle = levelEndAngle;
            });

            currentAngle = sportEndAngle;
        });

        svg += `</svg>`;
        return svg;
    }

    // --- FONCTION PRINCIPALE ---
// --- FONCTION PRINCIPALE ---
// --- FONCTION PRINCIPALE STATISTIQUES CORRIGÉE ---
    async function calculateAndShowStats(e) {
        if(e) e.preventDefault();

        const user = firebase.auth().currentUser;
        if (!user) {
            alert("Connectez-vous pour voir vos statistiques.");
            return;
        }

        // --- 1. Récupération de la photo (inchangé) ---
        let finalPhotoURL = user.photoURL;
        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                if (userData.photoURL) finalPhotoURL = userData.photoURL;
            }
        } catch (err) { console.warn("Erreur photo stats:", err); }

        // --- 2. Mise à jour UI User (inchangé) ---
        const userNameEl = document.getElementById('statsUserName');
        if (userNameEl) userNameEl.textContent = user.displayName || "Photographe";
        
        const initial = (user.displayName || "U").charAt(0).toUpperCase();
        document.getElementById('statsUserInitial').innerHTML = finalPhotoURL 
            ? `<img src="${finalPhotoURL}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`
            : initial;

        const insta = localStorage.getItem('userInsta');
        const portfolio = localStorage.getItem('userPortfolio');
        let socialHtml = '';
        if (insta) socialHtml += `<span><i class="fa-brands fa-instagram"></i> @${insta.replace('@','')}</span>`;
        if (portfolio && !insta) socialHtml += `<span><i class="fa-solid fa-globe"></i> Web</span>`;
        if (!insta && !portfolio) socialHtml = `<span>Saison 2024-2025</span>`;
        document.getElementById('statsSocials').innerHTML = socialHtml;

        // --- 3. Initialisation des compteurs ---
        let counts = { asked: 0, received: 0, refused: 0 };
        let monthsCount = {};
        let clubsCount = {};
        let compBreakdown = { football: {}, basketball: {}, handball: {} };
        
        let maxLevelVal = -1;
        let bestMatchName = "--";

        // --- 4. ÉTAPE A : Compter "Demandés" et "Refusés" depuis matchStatuses ---
        // On garde matchStatuses pour ce qui est "en cours" ou "refusé", car ce n'est pas dans les archives.
        Object.values(matchStatuses).forEach(status => {
            if (status === 'asked') counts.asked++;
            if (status === 'refused') counts.refused++;
            // Note : On ne compte pas 'received' ici pour éviter les doublons, on le fera via les archives.
        });

        // --- 5. ÉTAPE B : Analyser TOUT l'historique (Flux + Manuel) depuis matchArchives ---
        // C'est ici que la correction opère : on parcourt les archives au lieu des statuts pour les stats de couverture.
        const allArchives = Object.values(matchArchives);
        counts.received = allArchives.length; // Le nombre total de matchs couverts

        allArchives.forEach(matchData => {
            // Sécurité sur l'objet date (parfois string dans les archives)
            const d = new Date(matchData.dateObj);
            
            // A. Data pour Camembert (Sport & Compétition + Age)
            const s = (matchData.sport || "autre").toLowerCase();
            
            // Sécurité si le format n'est pas "SPORT - L1 - AGE"
            const compStr = matchData.compFormatted || "AUTRE - AUTRE - SENIOR";
            const parts = compStr.split(' - ');
            
            let compName = parts[1] || "Autre"; // Ex: "L1"
            const ageCat = parts[2]; // Ex: "U19"

            // Si catégorie jeune (hors SENIOR), on l'ajoute au nom (ex: "NAT U19")
            if (ageCat && !ageCat.includes("SENIOR") && !ageCat.includes("S")) {
                compName += ` ${ageCat}`;
            }
            
            // Initialisation si sport inconnu
            if (!compBreakdown[s]) compBreakdown[s] = {};
            
            compBreakdown[s][compName] = (compBreakdown[s][compName] || 0) + 1;

            // B. Club le plus visité
            const club = matchData.home?.name || "Inconnu";
            clubsCount[club] = (clubsCount[club] || 0) + 1;

            // C. Mois record (Si la date est valide)
            if (!isNaN(d.getTime())) {
                const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
                monthsCount[monthKey] = (monthsCount[monthKey] || 0) + 1;
            }

            // D. Meilleur Match (Logique de classement)
            const lvl = parts[1] || "AUTRE";
            let rank = LEVEL_RANK[lvl] || 0;
            
            const cat = (parts[2] || "").toUpperCase();
            if (cat === "SENIOR" || cat === "S" || cat === "") {
                rank += 0.5;
            } else if (cat.includes("F") || cat.includes("FEM")) {
                rank += 0.3;
            } else {
                rank += 0.1;
            }

            if (rank > maxLevelVal) {
                maxLevelVal = rank;
                
                let displayLvl = lvl;
                if (cat && !cat.includes("SENIOR") && cat !== "S") {
                    const shortCat = cat.replace("ESPOIRS", "U21"); 
                    displayLvl += ` ${shortCat}`;
                }

                // Récupération des logos (soit depuis l'archive manuelle, soit le cache)
                const homeLogo = matchData.home.logo || getLogoUrl(matchData.home.name);
                const awayLogo = matchData.away.logo || getLogoUrl(matchData.away.name);
                const fallback = "https://placehold.co/42x42/png?text=?";

                bestMatchName = `
                    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 10px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <img src="${homeLogo || fallback}" style="width: 32px; height: 32px; object-fit: contain;" onerror="this.src='${fallback}'">
                            <span style="font-weight: 800; opacity: 0.15; font-size: 9px; letter-spacing: 1px;">VS</span>
                            <img src="${awayLogo || fallback}" style="width: 32px; height: 32px; object-fit: contain;" onerror="this.src='${fallback}'">
                        </div>
                        
                        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                            <span style="opacity: 0.3; font-weight: 300;">—</span>
                            <span class="stat-level-badge">
                                ${displayLvl}
                            </span>
                        </div>
                    </div>
                `;
            }
        });

        // --- 6. Affichage Chiffres Clés ---
        // Total = Demandés (en cours) + Refusés + Archives (Reçus + Manuels)
        const totalRequests = counts.asked + counts.refused + counts.received; 
        
        // Taux de réussite : On ne compte que ce qui a été demandé via l'app (pas les manuels qui faussent le % car 100% succès)
        // OU on inclut tout. Ici je choisis d'inclure tout pour valoriser l'utilisateur.
        const successRate = totalRequests > 0 ? Math.round((counts.received / totalRequests) * 100) : 0;

        document.getElementById('statRequests').textContent = totalRequests;
        document.getElementById('statAccreds').textContent = counts.received;
        document.getElementById('statRate').textContent = `${successRate}%`;
        
        const bestMatchEl = document.getElementById('statBestMatch');
        bestMatchEl.style.display = "flex";
        bestMatchEl.style.width = "100%";
        bestMatchEl.style.whiteSpace = "normal"; 
        bestMatchEl.innerHTML = bestMatchName;

        // --- 7. Calcul "Mois Record" ---
        let bestMonthTxt = "--";
        let maxMatchesMonth = 0;
        Object.keys(monthsCount).forEach(key => {
            if (monthsCount[key] > maxMatchesMonth) {
                maxMatchesMonth = monthsCount[key];
                const [year, monthIdx] = key.split('-');
                const date = new Date(year, monthIdx, 1);
                const mName = date.toLocaleString('fr-FR', { month: 'long' });
                bestMonthTxt = `${mName.charAt(0).toUpperCase() + mName.slice(1)} (${maxMatchesMonth})`;
            }
        });
        document.getElementById('statBestMonth').textContent = bestMonthTxt;

        // --- 8. Calcul "Club Favori" ---
        let bestClubTxt = "--";
        let maxMatchesClub = 0;
        Object.keys(clubsCount).forEach(clubName => {
            if (clubsCount[clubName] > maxMatchesClub) {
                maxMatchesClub = clubsCount[clubName];
                bestClubTxt = clubName;
            }
        });

        const favClubEl = document.getElementById('statFavClub');
        if (maxMatchesClub > 0) {
            // On essaie de trouver le logo dans les archives si c'est un club manuel avec logo perso
            let foundLogo = getLogoUrl(bestClubTxt);
            // Si pas de logo auto, on cherche dans les archives si un match manuel contient ce logo
            if (!foundLogo) {
                const archiveMatch = allArchives.find(m => m.home.name === bestClubTxt && m.home.logo);
                if (archiveMatch) foundLogo = archiveMatch.home.logo;
            }
            
            const fallback = "https://placehold.co/42x42/png?text=?";

            favClubEl.style.display = "flex";
            favClubEl.style.alignItems = "center";
            favClubEl.style.width = "100%";
            favClubEl.style.justifyContent = "space-between";

            favClubEl.innerHTML = `
                <div class="stat-info-main">
                    <img src="${foundLogo || fallback}" 
                        style="width: 28px; height: 28px; object-fit: contain; flex-shrink: 0;" 
                        onerror="this.src='${fallback}'">
                    <span class="stat-club-name" title="${bestClubTxt}">
                        ${bestClubTxt}
                    </span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                    <span style="opacity: 0.2; font-weight: 300;">—</span>
                    <span class="stat-count-badge">
                        ${maxMatchesClub}
                    </span>
                </div>
            `;
        } else {
            favClubEl.textContent = "--";
        }

        // --- 9. Génération Camembert & Légende (Inchangé) ---
        const chartEl = document.getElementById('sportPieChart');
        const legendEl = document.getElementById('pieLegend');
        
        chartEl.innerHTML = getPieChartSVG(compBreakdown, SPORT_COLORS);

        let legendHtml = '';
        if (counts.received === 0) {
            legendHtml = '<span style="font-size:11px; color:gray; display:block; text-align:center; margin-top:10px;">Aucune donnée</span>';
        } else {
            legendHtml += '<div style="display: flex; justify-content: center; gap: 16px; margin-top: 8px; margin-bottom: 8px;">';
            ['football', 'basketball', 'handball'].forEach(sport => {
                if (compBreakdown[sport] && Object.keys(compBreakdown[sport]).length > 0) {
                    const color = SPORT_COLORS[sport];
                    const emoji = SPORT_EMOJIS[sport]; 
                    legendHtml += `
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <span style="width: 6px; height: 6px; border-radius: 50%; background: ${color};"></span>
                            <span style="font-size: 12px; line-height: 1;">${emoji}</span>
                        </div>`;
                }
            });
            legendHtml += '</div>';
            legendHtml += '<div style="height: 1px; background: var(--border-color); margin: 0 10px 6px; opacity: 0.3;"></div>';

            ['football', 'basketball', 'handball'].forEach(sport => {
                const comps = compBreakdown[sport];
                if (!comps || Object.keys(comps).length === 0) return;
                const baseColor = SPORT_COLORS[sport];
                const sortedComps = Object.entries(comps).sort((a,b) => b[1] - a[1]);

                sortedComps.forEach(([cName, count], index) => {
                    if (index < 2) { 
                        const percent = (count / counts.received) * 100;
                        const opacity = 0.5 + (0.5 * (1 - (index / sortedComps.length)));
                        legendHtml += `
                            <div class="legend-item" style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px; padding: 0 10px; color: var(--text-secondary);">
                                <span style="display: flex; align-items: center; gap: 6px;">
                                    <span class="legend-color" style="width:5px; height:5px; border-radius:2px; background:${baseColor}; opacity:${opacity}"></span> 
                                    ${cName}
                                </span>
                                <span style="font-weight:600; opacity:0.8;">${Math.round(percent)}%</span>
                            </div>`;
                    }
                });
            });
        }
        legendEl.innerHTML = legendHtml;

        // --- 10. Affichage Final ---
        document.getElementById('settingsModal').classList.add('hidden');
        statsModal.classList.remove('hidden');
    }

    // --- LISTENER BOUTON ENREGISTRER (IMAGE) ---
    if (saveStatsBtn) {
        saveStatsBtn.addEventListener('click', () => {
            const card = document.querySelector('#statsModal .login-card');
            const closeBtn = document.getElementById('closeStatsBtn');
            const btnsWrapper = document.getElementById('statsButtonsWrapper');
            
            // On cherche le conteneur des boutons (le div en display:flex) pour le cacher
            // mais on garde le reste du wrapper (le texte fokalpress.fr) visible
            const buttonsRow = btnsWrapper.querySelector('div[style*="display: flex"]');

            // 1. On cache les éléments inutiles pour la photo
            closeBtn.style.display = 'none';
            if(buttonsRow) buttonsRow.style.display = 'none';
            
            // Feedback visuel sur le bouton (avant qu'il disparaisse)
            const originalBtnText = saveStatsBtn.innerHTML;
            saveStatsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            // --- FIX COULEURS DE FOND (Mode Sombre/Clair) ---
            // html2canvas a besoin qu'on force les couleurs calculées
            const originalCardBg = card.style.background;
            const originalCardColor = card.style.color;
            
            const computedStyle = getComputedStyle(card);
            const computedBgColor = computedStyle.backgroundColor;
            const computedTextColor = computedStyle.color;

            // Application des styles forcés
            card.style.backgroundColor = computedBgColor;
            card.style.color = computedTextColor;

            // On s'assure que le header reste blanc
            const headerDiv = card.querySelector('div[style*="linear-gradient"]');
            if(headerDiv) headerDiv.style.color = 'white';

            // 2. Capture
            html2canvas(card, {
                scale: 3, // Qualité maximale (Retina)
                backgroundColor: computedBgColor, // Fond forcé
                useCORS: true // Pour charger l'image de profil Google
            }).then(canvas => {
                // 3. Téléchargement
                const link = document.createElement('a');
                link.download = `FokalPress_Stats_${new Date().toISOString().slice(0,10)}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();

                // 4. RESTAURATION DE L'ÉTAT ORIGINAL
                closeBtn.style.display = 'flex';
                if(buttonsRow) buttonsRow.style.display = 'flex'; // On remet en flex
                saveStatsBtn.innerHTML = originalBtnText;
                
                // Reset styles CSS
                card.style.backgroundColor = originalCardBg;
                card.style.color = originalCardColor;
                if(headerDiv) headerDiv.style.color = ''; 

            }).catch(err => {
                console.error("Erreur capture :", err);
                alert("Erreur lors de la création de l'image.");
                
                // Restauration en cas d'erreur
                closeBtn.style.display = 'flex';
                if(buttonsRow) buttonsRow.style.display = 'flex';
                saveStatsBtn.innerHTML = originalBtnText;
                card.style.backgroundColor = originalCardBg;
                card.style.color = originalCardColor;
            });
        });
    }

    // Listener Share (Copié Presse-papier) - Inchangé
// --- LISTENER BOUTON PARTAGER (Web Share API) ---
    if (shareStatsBtn) {
        shareStatsBtn.addEventListener('click', async () => {
            // 1. Préparation (Comme pour Enregistrer)
            const card = document.querySelector('#statsModal .login-card');
            const closeBtn = document.getElementById('closeStatsBtn');
            const btnsWrapper = document.getElementById('statsButtonsWrapper');
            const buttonsRow = btnsWrapper.querySelector('div[style*="display: flex"]');

            // Masquage UI
            closeBtn.style.display = 'none';
            if(buttonsRow) buttonsRow.style.display = 'none';

            // Feedback visuel
            const originalBtnText = shareStatsBtn.innerHTML;
            shareStatsBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';

            // --- FIX COULEURS (Mode Sombre/Clair) ---
            const originalCardBg = card.style.background;
            const originalCardColor = card.style.color;
            const computedStyle = getComputedStyle(card);
            const computedBgColor = computedStyle.backgroundColor;
            const computedTextColor = computedStyle.color;

            card.style.backgroundColor = computedBgColor;
            card.style.color = computedTextColor;
            const headerDiv = card.querySelector('div[style*="linear-gradient"]');
            if(headerDiv) headerDiv.style.color = 'white';

            try {
                // 2. Génération de l'image
                const canvas = await html2canvas(card, {
                    scale: 3,
                    backgroundColor: computedBgColor,
                    useCORS: true
                });

                // 3. Conversion en Fichier (Blob)
                canvas.toBlob(async (blob) => {
                    if (!blob) throw new Error("Erreur génération blob");

                    const file = new File([blob], "FokalPress_Stats.png", { type: "image/png" });

                    // 4. Déclenchement du Partage Natif
                    if (navigator.share && navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            title: 'Mes Stats FokalPress',
                            text: 'Regarde ma saison sur FokalPress !',
                            files: [file]
                        });
                    } else {
                        // Fallback PC (Si le partage natif n'existe pas)
                        // On copie l'image dans le presse-papier
                        try {
                            const item = new ClipboardItem({ "image/png": blob });
                            await navigator.clipboard.write([item]);
                            alert("Image copiée dans le presse-papier !");
                        } catch (err) {
                            alert("Partage non supporté sur cet appareil.");
                        }
                    }

                    // 5. Restauration (Dans le callback du blob)
                    closeBtn.style.display = 'flex';
                    if(buttonsRow) buttonsRow.style.display = 'flex';
                    shareStatsBtn.innerHTML = originalBtnText;
                    card.style.backgroundColor = originalCardBg;
                    card.style.color = originalCardColor;
                    if(headerDiv) headerDiv.style.color = '';

                }, 'image/png');

            } catch (err) {
                console.error("Erreur partage :", err);
                alert("Impossible de partager l'image.");
                
                // Restauration en cas d'erreur
                closeBtn.style.display = 'flex';
                if(buttonsRow) buttonsRow.style.display = 'flex';
                shareStatsBtn.innerHTML = originalBtnText;
                card.style.backgroundColor = originalCardBg;
                card.style.color = originalCardColor;
            }
        });
    }

    // Listeners Ouverture/Fermeture
    if (openStatsBtn) openStatsBtn.addEventListener('click', calculateAndShowStats);
    if (closeStatsBtn) closeStatsBtn.addEventListener('click', () => statsModal.classList.add('hidden'));
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

    // 1. On prépare les deux types d'URLs
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${adminEmail}&su=${encodedSubject}&body=${encodedBody}`;
    const mailtoUrl = `mailto:${adminEmail}?subject=${encodedSubject}&body=${encodedBody}`;

    // 2. On applique la même logique que openGmailCompose
    if (isMobile()) {
        // Sur mobile, on tente d'ouvrir l'application mail par défaut
        window.location.href = mailtoUrl;
    } else {
        // Sur ordinateur, on ouvre l'onglet Gmail Web
        window.open(gmailUrl, '_blank');
    }
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

    // --- GESTION POPUP FAVORIS ---
    const favHintModal = document.getElementById('favHintModal');
    const closeFavHintBtn = document.getElementById('closeFavHintBtn');
    const favLoginBtn = document.getElementById('favLoginBtn');
    const favDismissBtn = document.getElementById('favDismissBtn');

    // 1. Clic sur "Me connecter maintenant"
    if (favLoginBtn) {
        favLoginBtn.addEventListener('click', () => {
            favHintModal.classList.add('hidden'); // On ferme la pub
            loginModal.classList.remove('hidden'); // On ouvre le vrai login
            // On s'assure d'afficher la vue connexion
            document.getElementById('loginView').style.display = 'block';
            document.getElementById('completeProfileView').style.display = 'none';
        });
    }

    // 2. Clic sur "Plus tard" ou la Croix
    const closeFavHint = () => favHintModal.classList.add('hidden');
    
    if (favDismissBtn) favDismissBtn.addEventListener('click', closeFavHint);
    if (closeFavHintBtn) closeFavHintBtn.addEventListener('click', closeFavHint);
    
    // Fermeture en cliquant dehors
    favHintModal.addEventListener('click', (e) => {
        if (e.target === favHintModal) closeFavHint();
    });

    // --- LOGIQUE TUTORIEL ---
    const closeTutoBtn = document.getElementById('closeTutoBtn');
    if (closeTutoBtn) {
        closeTutoBtn.addEventListener('click', async () => {
            // 1. Fermer visuellement
            document.getElementById('tutorialModal').classList.add('hidden');
            
            // 2. Sauvegarder dans Firebase que c'est vu
            const user = firebase.auth().currentUser;
            if (user) {
                try {
                    await db.collection('users').doc(user.uid).set(
                        { hasSeenTutorial: true }, 
                        { merge: true }
                    );
                } catch (e) {
                    console.error("Erreur save tuto", e);
                }
            }
        });
    }
    // --- 1. ÉCOUTEUR D'ÉTAT AUTHENTIFICATION (Chargement initial) ---
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

                    // --- B. Sync Historique (Priorité Cloud + Local existant si vide) ---
                    // On s'assure de ne pas mélanger avec des données résiduelles
                    const cloudArchives = userData.archives || {};
                    
                    // On écrase matchArchives avec les données du cloud pour cet utilisateur
                    // (ou on fusionne si tu veux garder le fonctionnement actuel, mais le cloud doit primer)
                    matchArchives = { ...cloudArchives }; 
                    
                    localStorage.setItem('matchArchives', JSON.stringify(matchArchives));

                    // Mise à jour visuelle si la modale historique est ouverte
                    const historyModal = document.getElementById('historyModal');
                    if (historyModal && !historyModal.classList.contains('hidden')) {
                        renderHistory();
                    }

                    // ... (Reste du code de gestion photo, etc. inchangé) ...
                    // [Code photo Instagram / Google inchangé ici]

                    renderMatches(currentlyFiltered);

                    // C. Cache Profil
                    localStorage.setItem('userInsta', userData.instagram || "");
                    localStorage.setItem('userPortfolio', userData.portfolio || "");

                    // D. Update UI
                    updateLoginUI(true, userData.photoURL || user.photoURL);
                    loginModal.classList.add('hidden');

                    if (!userData.hasSeenTutorial) {
                        setTimeout(() => {
                            const tutoModal = document.getElementById('tutorialModal');
                            if(tutoModal) tutoModal.classList.remove('hidden');
                        }, 1000);
                    }

                } else {
                    // Nouveau compte (Pas encore en base)
                    // On nettoie tout par sécurité pour partir sur une base vierge
                    matchStatuses = {};
                    matchArchives = {}; // <--- Important
                    localStorage.setItem('matchStatuses', JSON.stringify(matchStatuses));
                    localStorage.setItem('matchArchives', JSON.stringify(matchArchives)); // <--- Important
                    
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
            // ---------------------------------------------------------
            // PARTIE DÉCONNEXION (C'est ici que la correction opère)
            // ---------------------------------------------------------
            console.log("Utilisateur déconnecté");
            updateLoginUI(false);
            
            // 1. Nettoyage des FAVORIS
            matchStatuses = {}; 
            localStorage.removeItem('matchStatuses');

            // 2. Nettoyage de l'HISTORIQUE (CORRECTION ICI)
            matchArchives = {}; // On vide la variable en mémoire
            localStorage.removeItem('matchArchives'); // On vide le stockage local
            
            // 3. Nettoyage du PROFIL
            localStorage.removeItem('userInsta');
            localStorage.removeItem('userPortfolio');
            
            // 4. Reset visuel
            // On vide aussi la grille d'historique au cas où elle est ouverte
            const historyGrid = document.getElementById('historyGrid');
            if(historyGrid) historyGrid.innerHTML = '';

            renderMatches(currentlyFiltered);
        }
        renderMatches(currentlyFiltered);
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
            
            // MODIFICATION ICI
            const rawInsta = document.getElementById('settingsInsta').value.trim();
            const newInsta = cleanInstagramInput(rawInsta); // On nettoie avant d'enregistrer

            const newPortfolio = document.getElementById('settingsPortfolio').value.trim();

            // 1. État de chargement
            btn.disabled = true;
            btn.innerText = "Enregistrement...";

            try {
                const updateData = {
                    instagram: newInsta,
                    portfolio: newPortfolio
                };

                // --- AJOUT : Si l'Insta change ou est présent, on tente de maj la photo ---
                if (newInsta) {
                    const picUrl = await fetchInstaProfilePic(newInsta);
                    if (picUrl) {
                        updateData.photoURL = picUrl;
                        document.querySelectorAll('.login-trigger img').forEach(img => img.src = picUrl);
                    }
                }else {
                    const user = firebase.auth().currentUser;
                    updateData.photoURL = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}`;
                    
                    // On nettoie explicitement le localStorage
                    localStorage.removeItem('userInsta');
                }
                await db.collection('users').doc(user.uid).update(updateData);

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

            // MODIFICATION ICI
            const rawInsta = document.getElementById('profileInsta').value.trim();
            const insta = cleanInstagramInput(rawInsta); // On nettoie ici aussi
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

                let finalPhotoURL = user.photoURL; // Par défaut : photo Google
    
                if (insta) {
                    const instaPic = await fetchInstaProfilePic(insta);
                    if (instaPic) {
                        finalPhotoURL = instaPic;
                    }
                }
                if (!finalPhotoURL) {
                    finalPhotoURL = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=random&color=fff&size=128`;
                }   
                await db.collection('users').doc(user.uid).set({
                    uid: user.uid,
                    displayName: user.displayName,
                    email: user.email,
                    photoURL: finalPhotoURL,
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

    // --- GESTION MODALE FONCTIONNALITÉ RESTREINTE ---
    const featureAuthModal = document.getElementById('featureAuthModal');
    const closeFeatureAuthBtn = document.getElementById('closeFeatureAuthBtn');
    const featureLoginBtn = document.getElementById('featureLoginBtn');
    const featureDismissBtn = document.getElementById('featureDismissBtn');

    // Fermer la modale
    const closeFeatureModal = () => featureAuthModal.classList.add('hidden');
    
    if (closeFeatureAuthBtn) closeFeatureAuthBtn.addEventListener('click', closeFeatureModal);
    if (featureDismissBtn) featureDismissBtn.addEventListener('click', closeFeatureModal);
    
    // Clic en dehors
    featureAuthModal.addEventListener('click', (e) => {
        if (e.target === featureAuthModal) closeFeatureModal();
    });

    // Redirection vers le Login
    if (featureLoginBtn) {
        featureLoginBtn.addEventListener('click', () => {
            closeFeatureModal(); // Ferme la modale "Restriction"
            document.getElementById('loginModal').classList.remove('hidden'); // Ouvre la modale "Login"
            document.getElementById('loginView').style.display = 'block'; // S'assure qu'on est sur la vue connexion
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

function renderHistory() {
    const historyGrid = document.getElementById('historyGrid');
    historyGrid.innerHTML = '';

    // 1. Récupération des IDs
    let historyList = Object.entries(matchArchives).map(([key, data]) => {
        return { ...data, id: key };
    });

    if (historyList.length === 0) {
        historyGrid.innerHTML = `
            <div class="empty-history" style="text-align: center; padding: 60px 20px;">
                <i class="fa-solid fa-camera-retro" style="font-size: 2.5rem; margin-bottom: 20px; color: var(--border-color);"></i>
                <p style="font-size: 1.1rem; font-weight: 600; color: var(--text-main); margin-bottom: 8px;">
                    Aucun match couvert pour le moment.
                </p>
                <p style="font-size: 0.95rem; color: var(--text-secondary); max-width: 320px; margin: 0 auto; line-height: 1.6; opacity: 0.8;">
                    Parcourez les prochains matchs et <b>ajoutez vos accréditations validées</b> pour construire votre historique de saison.
                </p>
            </div>`;
        return;
    }
    
    // 2. Tri par date (plus récent en premier)
    historyList.sort((a, b) => {
        const dateA = (a.dateObj === "UNKNOWN") ? 0 : new Date(a.dateObj).getTime();
        const dateB = (b.dateObj === "UNKNOWN") ? 0 : new Date(b.dateObj).getTime();
        if (dateA === 0 && dateB === 0) return 0;
        if (dateA === 0) return 1;
        if (dateB === 0) return -1;
        return dateB - dateA;
    });

    historyList.forEach(m => {
        const homeName = m.home?.name || "Équipe Inconnue";
        const awayName = m.away?.name || "Équipe Inconnue";
        if (homeName.includes("Inconnue") || awayName.includes("Inconnue")) return;

        let dateDisplay = "Date inconnue";
        let time = "--h--";
        if (m.dateObj && m.dateObj !== "UNKNOWN") {
            try {
                const d = new Date(m.dateObj);
                dateDisplay = d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });
                time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
            } catch (e) {}
        }

        const homeLogo = m.home.logo || getLogoUrl(homeName);
        const awayLogo = m.away.logo || getLogoUrl(awayName);
        const emoji = SPORT_EMOJIS[(m.sport || "autre").toLowerCase()] || "🏟️";
        const badgeManual = m.isManual ? '<span style="font-size:10px; opacity:0.6; margin-left:5px;">(Manuel)</span>' : '';

        const card = document.createElement('article');
        card.className = 'card history-card';
        card.style.position = 'relative'; 

        card.innerHTML = `
            <button class="history-btn edit-btn" onclick="editMatch('${m.id}')" title="Modifier" 
                style="position: absolute; top: 15px; right: 15px; background: transparent; border: none; cursor: pointer; color: var(--text-secondary); font-size: 14px; z-index: 10;">
                 <i class="fa-solid fa-pen"></i>
            </button>

            <div class="match-header">
                <div class="team">
                    <img src="${homeLogo}" class="team-logo" onerror="this.onerror=null; this.src='data/default-team.png'">
                    <span class="team-name">${homeName}</span>
                </div>
                <div class="match-center">
                    <div class="match-time">${time}</div>
                    <div class="vs">VS</div>
                </div>
                <div class="team">
                    <img src="${awayLogo}" class="team-logo" onerror="this.onerror=null; this.src='data/default-team.png'">
                    <span class="team-name">${awayName}</span>
                </div>
            </div>
            
            <div class="match-meta" style="border-top: 1px solid var(--border-color); margin-top: 10px; padding-top: 10px;">
                <span class="badge badge-long"><span>${emoji}</span> ${m.compFormatted || 'Compétition'}</span>
                <span class="date-time">${dateDisplay}</span>
            </div>

            <div class="history-badge">
                <span><i class="fa-solid fa-circle-check"></i> Couvert ${badgeManual}</span>
            </div>
        `;

        historyGrid.appendChild(card);
    });
}

// --- VARIABLES GLOBALES POUR LE MANUEL ---
let manualTeamsData = []; // Stocke {name, sport}
let manualCompsData = []; // Stocke {name, sport}

// --- AJOUTER CETTE VARIABLE TOUT EN HAUT DU FICHIER ---
let editingMatchId = null; 


function initManualMatchForm() {
    // 1. Reset Mode Édition
    editingMatchId = null; 
    const submitBtn = document.querySelector('#addMatchForm button[type="submit"]');
    if(submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Ajouter le match';

    const deleteBtn = document.getElementById('manualDeleteBtn');
    if (deleteBtn) {
        deleteBtn.style.display = 'none';
    }

    // 2. Reset des données
    const uniqueTeams = new Map(); 
    const uniqueComps = new Map(); 

    allMatches.forEach(m => {
        const s = m.sport.toLowerCase();
        
        // --- A. GESTION DES ÉQUIPES ---
        if(!uniqueTeams.has(m.home.name)) uniqueTeams.set(m.home.name, s);
        if(!uniqueTeams.has(m.away.name)) uniqueTeams.set(m.away.name, s);
        
        // --- B. GESTION DES COMPÉTITIONS (CORRECTION ICI) ---
        // Format habituel : "SPORT - NIVEAU - AGE"
        const parts = m.compFormatted.split(' - ');
        
        let displayComp = "";
        
        if (parts.length >= 3) {
            const level = parts[1]; // Ex: "L1", "N3"
            const age = parts[2];   // Ex: "SENIOR F", "U19", "SENIOR"
            
            // NOUVELLE LOGIQUE :
            // On garde l'âge si ce n'est pas juste "SENIOR" (homme standard).
            // Si c'est "SENIOR F", on veut afficher "L1 F".
            
            // Est-ce une catégorie féminine ?
            const isWomen = age.includes("F") || age.includes("FEM") || age.includes("FÉM");
            // Est-ce une catégorie jeune ?
            const isYouth = age.includes("U") || age.includes("ESPOIRS");

            if (isWomen || isYouth) {
                // On nettoie "SENIOR" pour ne garder que le "F" si présent
                let suffix = age.replace("SENIOR", "").replace("Sr", "").trim();
                
                // Si le suffixe est vide mais que c'était U19, on garde l'original
                if (!suffix && isYouth) suffix = age;
                
                displayComp = `${level} ${suffix}`.trim();
            } else {
                // C'est un Senior Homme standard, on affiche juste le niveau
                displayComp = level;
            }

        } else {
            // Cas de secours
            displayComp = m.compFormatted.replace(`${m.sport.toUpperCase()} - `, '');
        }

        // On stocke : Clé unique = "Nom + Sport" pour éviter les mélanges
        const uniqueKey = `${displayComp}_${s}`;
        
        if (!uniqueComps.has(uniqueKey)) {
            // On stocke l'objet propre pour l'autocomplete
            uniqueComps.set(uniqueKey, { name: displayComp, sport: s });
        }
    });

    // Conversion en tableaux exploitables
    manualTeamsData = Array.from(uniqueTeams, ([name, sport]) => ({ name, sport })).sort((a,b) => a.name.localeCompare(b.name));
    manualCompsData = Array.from(uniqueComps, ([key, val]) => val).sort((a,b) => a.name.localeCompare(b.name));

    // 3. Initialisation de l'affichage (charge la liste par défaut, souvent Football)
    refreshManualLists();

    // 4. Reset UI
    document.getElementById('step-1').classList.remove('hidden');
    document.getElementById('step-2').classList.add('hidden');
    document.getElementById('manualHomeLogoDiv').classList.add('hidden');
    document.getElementById('manualAwayLogoDiv').classList.add('hidden');
    
    // Vider les champs
    document.getElementById('manualComp').value = "";
    document.getElementById('manualHome').value = "";
    document.getElementById('manualAway').value = "";
    document.getElementById('manualHomeLogo').value = "";
    document.getElementById('manualAwayLogo').value = "";
    document.getElementById('manualDate').value = ""; 
    document.getElementById('manualTime').value = "";
}

// --- FONCTION DE FILTRAGE DYNAMIQUE ---
function refreshManualLists() {
    // 1. Quel sport est sélectionné ?
    const selectedSport = document.querySelector('input[name="manualSport"]:checked').value;
    
    // 2. Filtrer les données
    const filteredTeams = manualTeamsData.filter(t => t.sport === selectedSport).map(t => t.name);
    const filteredComps = manualCompsData.filter(c => c.sport === selectedSport); // Garde l'objet {name, sport} pour l'emoji

    // 3. Ré-initialiser les autocompletes avec les nouvelles données
    
    // A. Équipe Domicile
    setupAutocomplete(
        document.getElementById('manualHome'), 
        document.getElementById('homeResults'), 
        filteredTeams, 
        (teamName) => {
            const logo = getLogoUrl(teamName) || 'data/default-team.png';
            return `<img src="${logo}" class="result-icon" onerror="this.src='data/default-team.png'"> <span>${teamName}</span>`;
        }
    );

    // B. Équipe Extérieur
    setupAutocomplete(
        document.getElementById('manualAway'), 
        document.getElementById('awayResults'), 
        filteredTeams, 
        (teamName) => {
            const logo = getLogoUrl(teamName) || 'data/default-team.png';
            return `<img src="${logo}" class="result-icon" onerror="this.src='data/default-team.png'"> <span>${teamName}</span>`;
        }
    );

    // C. Compétition
    setupAutocomplete(
        document.getElementById('manualComp'), 
        document.getElementById('compResults'), 
        filteredComps, 
        (compObj) => {
            // compObj est {name, sport}
            const emoji = SPORT_EMOJIS[compObj.sport] || "🏆";
            return `<span class="result-emoji">${emoji}</span> <span>${compObj.name}</span>`;
        },
        true // Flag objet
    );
}

// --- LOGIQUE AUTOCOMPLETE (Mise à jour pour gérer Objets et Strings) ---
function setupAutocomplete(input, resultsContainer, dataArray, renderer, isObject = false) {
    // On clone le noeud pour supprimer les anciens EventListeners (éviter les doublons lors du refresh)
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    input = newInput;

    const showResults = (val) => {
        resultsContainer.innerHTML = '';
        const filterVal = val.toLowerCase();
        
        const matches = dataArray.filter(item => {
            const textToCheck = isObject ? item.name : item;
            return textToCheck.toLowerCase().includes(filterVal);
        });

        if (matches.length === 0) {
            resultsContainer.classList.add('hidden');
            return;
        }

        matches.slice(0, 10).forEach(item => {
            const div = document.createElement('div');
            div.className = 'result-item';
            const textValue = isObject ? item.name : item;
            
            div.innerHTML = renderer(item);
            
            div.addEventListener('click', () => {
                input.value = textValue;
                resultsContainer.classList.add('hidden');
            });
            
            resultsContainer.appendChild(div);
        });
        
        resultsContainer.classList.remove('hidden');
    };

    input.addEventListener('input', (e) => {
        const val = e.target.value;
        if (val.length < 1) {
            resultsContainer.classList.add('hidden');
            return;
        }
        showResults(val);
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !resultsContainer.contains(e.target)) {
            resultsContainer.classList.add('hidden');
        }
    });
    
    input.addEventListener('focus', () => {
        if(input.value.length > 0) showResults(input.value);
    });
}

// --- GESTION DES ÉTAPES ET SOUMISSION ---

document.addEventListener('DOMContentLoaded', () => {

    // --- GESTION CHANGEMENT DE SPORT (DANS LE FORMULAIRE) ---
    const sportRadios = document.querySelectorAll('input[name="manualSport"]');
    sportRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            // 1. On vide les champs pour éviter les incohérences (ex: Equipe de Foot dans Basket)
            document.getElementById('manualComp').value = "";
            document.getElementById('manualHome').value = "";
            document.getElementById('manualAway').value = "";
            
            // 2. On recharge les listes d'autocomplétion avec le bon sport
            refreshManualLists();
        });
    });
    
    // Bouton "Suivant" (Step 1 -> Step 2 OU Submit direct)
    const nextBtn = document.getElementById('nextStepBtn');
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const home = document.getElementById('manualHome').value.trim();
            const away = document.getElementById('manualAway').value.trim();
            const comp = document.getElementById('manualComp').value.trim();

            if(!home || !away || !comp) {
                alert("Merci de remplir les équipes et la compétition.");
                return;
            }

            // Vérifier si les équipes sont connues
            const homeKnown = getLogoUrl(home) !== '';
            const awayKnown = getLogoUrl(away) !== '';

            // Si les deux sont connues, on sauvegarde direct sans passer par l'étape 2
            if (homeKnown && awayKnown) {
                handleManualMatchSubmit(); 
            } else {
                // Sinon, on montre l'étape 2
                document.getElementById('step-1').classList.add('hidden');
                document.getElementById('step-2').classList.remove('hidden');

                // On affiche les champs URL uniquement pour les équipes inconnues
                const homeLogoDiv = document.getElementById('manualHomeLogoDiv');
                const awayLogoDiv = document.getElementById('manualAwayLogoDiv');
                
                if (!homeKnown) {
                    homeLogoDiv.classList.remove('hidden');
                    document.getElementById('lblHomeLogo').textContent = `Lien logo pour "${home}"`;
                }
                if (!awayKnown) {
                    awayLogoDiv.classList.remove('hidden');
                    document.getElementById('lblAwayLogo').textContent = `Lien logo pour "${away}"`;
                }
            }
        });
    }

    // Bouton "Passer" (Step 2 -> Submit sans logos)
    const skipBtn = document.getElementById('skipStepBtn');
    if(skipBtn) {
        skipBtn.addEventListener('click', () => {
            // On vide les champs logo pour être sûr
            document.getElementById('manualHomeLogo').value = "";
            document.getElementById('manualAwayLogo').value = "";
            handleManualMatchSubmit();
        });
    }

    const exportBtn = document.getElementById('exportCsvBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportHistoryToCSV);
    }

    // Soumission finale (via le bouton "Terminer" du formulaire)
    const form = document.getElementById('addMatchForm');
    if(form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            handleManualMatchSubmit();
        });
    }

    const openAddMatchBtn = document.getElementById('openAddMatchBtn');
    const addMatchModal = document.getElementById('addMatchModal');
    const closeAddMatchBtn = document.getElementById('closeAddMatchBtn');

    if (openAddMatchBtn) {
        openAddMatchBtn.addEventListener('click', () => {
            // 1. Initialiser le formulaire (vider les champs, charger les listes)
            initManualMatchForm(); 
            // 2. Afficher la modale
            addMatchModal.classList.remove('hidden');
        });
    }

    if (closeAddMatchBtn) {
        closeAddMatchBtn.addEventListener('click', () => {
            addMatchModal.classList.add('hidden');
        });
    }

    // Fermeture en cliquant en dehors (sur le fond gris)
    if (addMatchModal) {
        addMatchModal.addEventListener('click', (e) => {
            if (e.target === addMatchModal) {
                addMatchModal.classList.add('hidden');
            }
        });
    }


    const deleteModal = document.getElementById('deleteConfirmModal');
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    const cancelBtn = document.getElementById('cancelDeleteBtn');

    if (confirmBtn) confirmBtn.addEventListener('click', executeDeleteMatch);
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            deleteModal.classList.add('hidden');
            matchToDelete = null;
        });
    }

    // Fermeture clic extérieur
    if (deleteModal) {
        deleteModal.addEventListener('click', (e) => {
            if (e.target === deleteModal) {
                deleteModal.classList.add('hidden');
                matchToDelete = null;
            }
        });
    }
});

async function handleManualMatchSubmit() {
    const user = firebase.auth().currentUser;
    if (!user) { alert("Erreur auth."); return; }

    const sport = document.querySelector('input[name="manualSport"]:checked').value;
    
    // --- CORRECTION ANALYSE DU TEXTE ---
    let compRaw = document.getElementById('manualComp').value.trim(); // ex: "L1 SENIOR F"
    
    let age = "SENIOR";
    let level = compRaw;

    const upperComp = compRaw.toUpperCase();

    // 1. Détection Féminin (SENIOR F ou juste F à la fin)
    if (upperComp.includes("SENIOR F") || upperComp.includes("SF") || (upperComp.endsWith(" F") && !upperComp.includes("U"))) {
        age = "SENIOR F";
        // On nettoie le niveau pour ne garder que "L1"
        level = compRaw.replace(/SENIOR F/i, '').replace(/ SF/i, '').replace(/ F$/i, '').trim();
    }
    // 2. Détection Jeunes (U19, U17...)
    else {
        const ageMatch = compRaw.match(/(U\d+|ESPOIRS|PRO A|PRO B)/i);
        if (ageMatch) {
             age = ageMatch[0].toUpperCase();
             // Si c'est "NAT U19", level devient "NAT"
             level = compRaw.replace(ageMatch[0], '').trim();
        }
    }
    
    // On reformate : "HAND - L1 - SENIOR F"
    const compFormatted = `${sport.toUpperCase()} - ${level.toUpperCase()} - ${age}`;
    // -----------------------------------
    
    const homeName = document.getElementById('manualHome').value.trim();
    const awayName = document.getElementById('manualAway').value.trim();
    const homeLogo = document.getElementById('manualHomeLogo').value.trim();
    const awayLogo = document.getElementById('manualAwayLogo').value.trim();

    const dateVal = document.getElementById('manualDate').value;
    const timeVal = document.getElementById('manualTime').value;

    let dateObjString = "UNKNOWN";
    if (dateVal) {
        const d = new Date(dateVal);
        if (timeVal) {
            const [h, m] = timeVal.split(':');
            d.setHours(h, m);
        } else { d.setHours(20, 0); }
        dateObjString = d.toISOString();
    }

    const matchId = editingMatchId ? editingMatchId : `manual_${Date.now()}`;
    
    const matchSnapshot = {
        sport: sport,
        compFormatted: compFormatted,
        home: { name: homeName, logo: homeLogo }, 
        away: { name: awayName, logo: awayLogo },
        dateObj: dateObjString,
        isManual: true
    };

    try {
        matchArchives[matchId] = matchSnapshot;
        localStorage.setItem('matchArchives', JSON.stringify(matchArchives));
        
        const updateData = {};
        updateData[`archives.${matchId}`] = matchSnapshot;
        await db.collection('users').doc(user.uid).update(updateData);

        document.getElementById('addMatchModal').classList.add('hidden');
        document.getElementById('addMatchForm').reset();
        
        editingMatchId = null;
        renderHistory();
        

    } catch (e) {
        console.error(e);
        alert("Erreur lors de la sauvegarde.");
    }
}

async function deleteManualArchive(dateStr, homeName) {
    if(!confirm("Supprimer ce match de l'historique ?")) return;

    // Retrouver la clé (un peu laborieux car on n'a pas stocké l'ID dans l'objet archive, 
    // mais on peut itérer sur matchArchives pour trouver la clé correspondante)
    const entry = Object.entries(matchArchives).find(([key, val]) => {
        return val.isManual && val.home.name === homeName && val.dateObj === dateStr;
    });

    if (entry) {
        const [keyToDelete] = entry;
        const user = firebase.auth().currentUser;

        // Delete Local
        delete matchArchives[keyToDelete];
        localStorage.setItem('matchArchives', JSON.stringify(matchArchives));

        // Delete Firebase
        if (user) {
            const updateData = {};
            updateData[`archives.${keyToDelete}`] = firebase.firestore.FieldValue.delete();
            await db.collection('users').doc(user.uid).update(updateData);
        }

        renderHistory();
    }
}

// 1. Ouvre la modale "Attention"
function askDeleteMatch(matchId) {
    matchToDelete = matchId; // On mémorise l'ID
    document.getElementById('deleteConfirmModal').classList.remove('hidden');
}

// 2. Exécute la suppression (appelée par le bouton "Supprimer" de la modale)
async function executeDeleteMatch() {
    if (!matchToDelete) return;

    const btn = document.getElementById('confirmDeleteBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
        const user = firebase.auth().currentUser;
        
        // A. Suppression Locale
        delete matchArchives[matchToDelete];
        
        // Si c'est un match "Favori" (pas manuel), on le retire aussi des statuts
        // pour qu'il ne réapparaisse pas comme "Accréditation confirmée"
        if (matchStatuses[matchToDelete]) {
            delete matchStatuses[matchToDelete];
            localStorage.setItem('matchStatuses', JSON.stringify(matchStatuses));
        }

        localStorage.setItem('matchArchives', JSON.stringify(matchArchives));

        // B. Suppression Firebase
        if (user) {
            const updateData = {};
            // Suppression de l'archive
            updateData[`archives.${matchToDelete}`] = firebase.firestore.FieldValue.delete();
            // Suppression du statut favori (si existant)
            updateData[`favorites.${matchToDelete}`] = firebase.firestore.FieldValue.delete();
            
            await db.collection('users').doc(user.uid).update(updateData);
        }

        // C. UI Update
        renderHistory();
        renderMatches(currentlyFiltered); // Met à jour la grille principale pour enlever le statut vert
        
        // Fermer la modale
        document.getElementById('deleteConfirmModal').classList.add('hidden');

    } catch (error) {
        console.error("Erreur suppression :", error);
        alert("Erreur lors de la suppression.");
    } finally {
        // Reset bouton
        btn.innerHTML = 'Supprimer';
        btn.disabled = false;
        matchToDelete = null;
    }
}

function exportHistoryToCSV() {
    // 1. Récupération des données
    const archives = matchArchives ? Object.values(matchArchives) : [];

    if (archives.length === 0) {
        alert("Aucun historique à exporter.");
        return;
    }

    // 2. FILTRAGE STRICT (Identique à l'affichage)
    // On ne garde que les matchs qui n'ont pas "Inconnue" dans leurs noms d'équipes
    const validArchives = archives.filter(m => {
        // Sécurité : si m.home est undefined, on considère que c'est "Inconnue"
        const homeName = m.home?.name || "Inconnue";
        const awayName = m.away?.name || "Inconnue";
        
        // Si l'un des deux contient "Inconnue", on EXCLUT du CSV
        if (homeName.includes("Inconnue") || awayName.includes("Inconnue")) {
            return false;
        }
        return true;
    });

    if (validArchives.length === 0) {
        alert("Aucune donnée valide à exporter.");
        return;
    }

    // 3. Préparation du CSV
    const headers = ["Date", "Heure", "Sport", "Competition", "Domicile", "Exterieur", "Type"];
    
    // Fonction de nettoyage pour éviter les bugs CSV (guillemets, null, etc.)
    const clean = (data) => {
        if (data === null || data === undefined) return '""';
        const str = String(data);
        return `"${str.replace(/"/g, '""')}"`;
    };

    const rows = validArchives.map(m => {
        let dateStr = "Date Inconnue";
        let timeStr = "--:--";

        try {
            if (m.dateObj && m.dateObj !== "UNKNOWN") {
                const d = new Date(m.dateObj);
                if (!isNaN(d.getTime())) {
                    dateStr = d.toLocaleDateString('fr-CA'); // YYYY-MM-DD
                    timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                }
            }
        } catch (e) { console.warn("Erreur date export", e); }

        return [
            clean(dateStr),
            clean(timeStr),
            clean(m.sport || "Inconnu"),
            clean(m.compFormatted || "Autre"),
            clean(m.home?.name || ""), // Plus besoin de valeur par défaut "Inconnue" car déjà filtré
            clean(m.away?.name || ""),
            clean(m.isManual ? "Manuel" : "Accréditation")
        ].join(",");
    });

    // 4. Génération et Téléchargement
    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const today = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `FokalPress_Historique_${today}.csv`);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- FONCTION NAVIGATION TUTO ---
window.nextTutoStep = function() {
    const step1 = document.getElementById('tutoStep1');
    const step2 = document.getElementById('tutoStep2');
    const dot1 = document.getElementById('dot1');
    const dot2 = document.getElementById('dot2');

    if(step1 && step2) {
        step1.style.display = 'none';
        step2.style.display = 'block';
        
        // Mise à jour des points
        if(dot1) dot1.style.background = 'var(--border-color)';
        if(dot2) dot2.style.background = 'var(--accent)';
    }
};

// PLAN B : UTILISER LA RECHERCHE (Fonctionne à 100% si l'API est active)
async function fetchInstaProfilePic(username) {
    if (!username) return null;
    
    // Nettoyage du pseudo
    const cleanUser = username.replace('@', '').trim();

    const options = {
        method: 'POST',
        headers: {
            'x-rapidapi-key': 'cc89b1eb44mshde21357fdba7aafp191632jsncd0b3b0b5d6d',
            'x-rapidapi-host': 'instagram120.p.rapidapi.com',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            username: cleanUser
        })
    };

    try {
        // 1. ENDPOINT CORRIGÉ : /userInfo
        const response = await fetch('https://instagram120.p.rapidapi.com/api/instagram/userInfo', options);

        if (!response.ok) {
            console.warn(`Erreur API Instagram (${response.status})`);
            return null;
        }

        const data = await response.json();
        console.log("Données Instagram reçues :", data);

        // 2. CHEMIN D'ACCÈS CORRIGÉ : result[0].user.hd_profile_pic_url_info
        let imageUrl = null;

        if (data.result && data.result.length > 0) {
            const userObj = data.result[0].user;
            
            if (userObj && userObj.hd_profile_pic_url_info) {
                // Souvent 'hd_profile_pic_url_info' est un objet qui contient une propriété 'url'
                if (userObj.hd_profile_pic_url_info.url) {
                    imageUrl = userObj.hd_profile_pic_url_info.url;
                } 
                // Par sécurité, si c'est directement une chaîne de caractères
                else if (typeof userObj.hd_profile_pic_url_info === 'string') {
                    imageUrl = userObj.hd_profile_pic_url_info;
                }
            }
        }

        if (imageUrl) {
            return `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}`;
        }

        return null;

    } catch (error) {
        console.error("Erreur technique Instagram :", error);
        return null;
    }
}

/**
 * Extrait le pseudo d'une URL Instagram ou d'une saisie avec @
 */
const cleanInstagramInput = (input) => {
    if (!input) return "";
    let username = input.trim();
    // Supprime l'URL complète si présente
    username = username.replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, "");
    // Supprime le slash final si présent
    username = username.replace(/\/$/, "");
    // Supprime le @ au début s'il existe pour éviter les doubles @@
    username = username.replace(/^@/, "");
    // On garde uniquement le premier segment (cas d'une URL avec paramètres)
    return username.split('?')[0];
};

function editMatch(id) {
    const m = matchArchives[id];
    if (!m) return;

    // 1. Ouvrir la modale et reset le formulaire
    initManualMatchForm(); 
    document.getElementById('addMatchModal').classList.remove('hidden');

    // 2. Passer en mode Édition
    editingMatchId = id;
    
    // On met à jour le texte du bouton final (au cas où on va à l'étape 2)
    const form = document.getElementById('addMatchForm');
    const submitBtn = form.querySelector('button[type="submit"]');
    if(submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Modifier le match';

    // --- CORRECTION : CIBLER L'ÉTAPE 1 (VISIBLE) ---
    let deleteBtn = document.getElementById('manualDeleteBtn');
    
    // On cible le bouton "Suivant" qui est dans l'étape 1
    const nextBtn = document.getElementById('nextStepBtn');

    // A. Création du bouton s'il n'existe pas
    if (!deleteBtn) {
        deleteBtn = document.createElement('button');
        deleteBtn.type = 'button'; 
        deleteBtn.id = 'manualDeleteBtn';
        deleteBtn.className = 'login-btn'; 
        
        // Styles Rouge
        deleteBtn.style.backgroundColor = '#FF3B30';
        deleteBtn.style.borderColor = '#FF3B30';
        deleteBtn.style.color = 'white';
        deleteBtn.style.marginTop = '10px';
        deleteBtn.style.width = '100%';
        deleteBtn.style.fontWeight = '600';
    }

    // B. INSERTION DANS L'ÉTAPE 1
    // On insère le bouton rouge juste après le bouton "Suivant"
    if (nextBtn && nextBtn.parentNode) {
        nextBtn.parentNode.insertBefore(deleteBtn, nextBtn.nextSibling);
    } 

    // C. Configuration
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Supprimer ce match';
    deleteBtn.style.display = 'block'; 
    
    deleteBtn.onclick = () => {
        document.getElementById('addMatchModal').classList.add('hidden');
        askDeleteMatch(id);
    };
    // ---------------------------------------------------------

    // 3. Remplir les champs existants
    const radios = document.querySelectorAll('input[name="manualSport"]');
    radios.forEach(r => {
        if (r.value === m.sport) r.checked = true;
    });
    refreshManualLists(); 

    // Récupération de la compétition
    const compParts = m.compFormatted.split(' - ');
    let displayComp = compParts[1] || m.compFormatted; 
    const suffix = compParts[2];

    if (suffix && suffix !== "SENIOR") {
        displayComp += ` ${suffix}`;
    }
    
    document.getElementById('manualComp').value = displayComp;
    document.getElementById('manualHome').value = m.home.name;
    document.getElementById('manualAway').value = m.away.name;
    
    if (m.home.logo) document.getElementById('manualHomeLogo').value = m.home.logo;
    if (m.away.logo) document.getElementById('manualAwayLogo').value = m.away.logo;

    if (m.dateObj && m.dateObj !== "UNKNOWN") {
        const d = new Date(m.dateObj);
        document.getElementById('manualDate').value = d.toISOString().split('T')[0];
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        document.getElementById('manualTime').value = `${hh}:${mm}`;
    }

    if(m.home.logo) document.getElementById('manualHomeLogoDiv').classList.remove('hidden');
    if(m.away.logo) document.getElementById('manualAwayLogoDiv').classList.remove('hidden');
}
