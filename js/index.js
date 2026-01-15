const GEOAPIFY_KEY = "61ca90447ebd483ab2f002050433fa42"; 
const SPORT_EMOJIS = { "football": "⚽", "basketball": "🏀", "handball": "🤾"};

// États globaux
let allMatches = [];
let currentlyFiltered = []; 
let currentFilters = { week: "", comp: "all", sport: "all", accredOnly: false, sortBy: "date", search: "" };
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

const formatCompetition = (rawName, sport) => {
    if (!rawName) return "MATCH";
    const name = rawName.toUpperCase();
    const s = (sport).toLowerCase();
    let sportLabel = s.includes("basket") ? "BASKET" : (s.includes("foot") ? "FOOT" : "HAND");
    
    let level = "AUTRE", age = "SENIOR";
    if (name.includes("BETCLIC") || name.includes("STARLIGUE")) {level = "L1"}
    else if (name.includes("BUTAGAZ") || name.includes("LBWL")) { level = "L1"; age = "SENIOR F"; }
    else if (name.includes("ÉLIT2") || name.includes("PROLIGUE")) { level = "L2"; }
    else if (name.includes("LF2")) { level = "L2"; age = "SENIOR F"; }
    else if (name.includes("NF1")) { level = "N1"; age = "SENIOR F"; }
    else if (name.includes("ESPOIRS")) { level = "L1"; age = "U21"; }
    else if (name.includes("NATIONALE 1")) { level = "N1"; }
    else {
        const isFeminine = name.includes("FÉMININ") || name.includes("FEMININ") || name.includes(" F ");
        if (name.includes("N3")) level = "N3";
        else if (name.includes("N2")) level = "N2";
        else if (name.includes("D3") && (name.includes("FÉMININE") || name.includes("FEMININE"))) level = "L3";
        else if (name.includes("NATIONAL") || name.includes("NAT")) level = "NAT";
        if (name.includes("U19")) age = "U19";
        else if (name.includes("U17")) age = "U17";
        if (isFeminine && !age.includes("F")) age += " F";
    }
    return `${sportLabel} - ${level} - ${age}`;
};

function openGmailCompose(email, homeTeam, awayTeam, matchDate, sport, compet) {
    // On utilise désormais les paramètres passés à la fonction pour le sujet
    const subject = encodeURIComponent(`Demande d'accréditation photographe : ${matchDate} vs ${awayTeam}`);
    
    // Le corps du mail est maintenant dynamique selon le match et la date
    const body = encodeURIComponent(`Bonjour,\n\nJe me permets de vous contacter en tant que photographe, passionné par le ${sport}, afin de solliciter une accréditation pour le match ${homeTeam} vs ${awayTeam} (${compet}) prévu le ${matchDate}.\n
Cette opportunité me permettra de mon côté d'enrichir mon portfolio. Et du vôtre, si vous le souhaitez, je vous fournirai à l'issue de la rencontre les photos pour vos communications.
Vous pouvez avoir un aperçu de mon travail sur mon compte Instagram : @kiksf4

Je reste à votre entière disposition pour toute information complémentaire.

En vous remerciant par avance de votre considération.

Cordialement,
Kilian LENTZ`);
    
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${email}&su=${subject}&body=${body}`;
    window.open(gmailUrl, '_blank');
}

const getAccreditationHTML = (match) => {
    if (!match || !match.home) return `<div class="accred-status accred-unavailable"><i class="fa-solid fa-circle-xmark"></i> <span>Inconnu</span></div>`;

    const teamName = match.home.name;
    const key = Object.keys(ACCRED_LIST).find(k => teamName.toUpperCase().includes(k));
    
    if (key) {
        const contact = ACCRED_LIST[key];
        
        if (contact.startsWith('http')) {
            return `<div class="accred-status accred-available">
                        <i class="fa-solid fa-external-link-alt"></i> 
                        <a href="${contact}" target="_blank" class="accred-email">Plateforme</a>
                    </div>`;
        } 

        // --- AJOUT : Formatage de la date en DD/MM ---
        const d = match.dateObj;
        const shortDate = ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2);
        // --------------------------------------------

        const home = match.home.name.replace(/'/g, "\\'");
        const away = match.away.name.replace(/'/g, "\\'");
        const compRaw = match.competition.replace(/'/g, "\\'");
        const sportComplet = match.sport;

        return `
            <div class="accred-status accred-available" style="gap: 10px;">
                <a href="#" onclick="copyToClipboard(event, '${contact}')" title="Copier le mail">
                    <i class="fa-solid fa-copy"></i>
                </a>
                <a href="#" onclick="openGmailCompose('${contact}', '${home}', '${away}', '${shortDate}', '${sportComplet}', '${compRaw}')" title="Ouvrir dans Gmail" style="color: #ea4335;">
                    <i class="fa-solid fa-envelope"></i>
                </a>
                <span class="accred-email">${contact}</span>
            </div>`;
    }
    
    return `<div class="accred-status accred-unavailable"><i class="fa-solid fa-circle-xmark"></i> <span>Inconnu</span></div>`;
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

    // Mise à jour des données
    if (nextStatus) {
        matchStatuses[matchId] = nextStatus;
    } else {
        delete matchStatuses[matchId]; // Si on revient à null, on supprime
    }
    localStorage.setItem('matchStatuses', JSON.stringify(matchStatuses));

    // Mise à jour visuelle immédiate (Classes)
    btn.classList.remove('status-envie', 'status-asked', 'status-received', 'status-refused');
    if (nextStatus) btn.classList.add(`status-${nextStatus}`);

    // Mise à jour de l'icône
    icon.className = getStatusIcon(nextStatus);
    
    // Mise à jour du titre pour l'accessibilité
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
        alert("Veuillez d'abord définir une position (GPS ou Ville).");
        return;
    }

    isCalculating = true;
    const btn = document.getElementById('calcDistBtn');
    
    // Feedback visuel sur le bouton
    const originalBtnText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calcul...';

    const targets = currentlyFiltered;

    // --- ÉTAPE IMPORTANTE : RESET VISUEL ---
    // On remet les distances à 0 pour forcer le recalcul et montrer à l'utilisateur que ça change
    allMatches.forEach(m => {
        m.distance = 0;
        m.times.car = 0;
        m.times.public = 0;
    });
    // On rafraichit l'affichage tout de suite pour montrer des "-- km" pendant le calcul
    renderMatches(currentlyFiltered); 

    // --- CALCUL PARALLÈLE ---
    await Promise.all(targets.map(async (m) => {
        // CORRECTION : On a supprimé "&& m.distance === 0" pour forcer le recalcul
        if (m.locationCoords) {
            const travel = await fetchTravelData(userPosition.lat, userPosition.lon, m.locationCoords.lat, m.locationCoords.lon);
            
            // Gestion Météo (uniquement pour le foot ici, selon votre logique)
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
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-route"></i> Calculer les distances';
    
    // Rendu final avec les nouvelles valeurs
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

function requestUserLocation() {
    if (navigator.geolocation) {
        // On ajoute 'async' ici pour pouvoir attendre le calcul
        navigator.geolocation.getCurrentPosition(async pos => {
            const newPos = { 
                lat: pos.coords.latitude, 
                lon: pos.coords.longitude 
            };

            // 1. Vérification du changement de position (Logic existante)
            if (userPosition) {
                const latDiff = Math.abs(userPosition.lat - newPos.lat);
                const lonDiff = Math.abs(userPosition.lon - newPos.lon);

                if (latDiff > 0.05 || lonDiff > 0.05) {
                    console.log("📍 Position modifiée : nettoyage du cache de distance.");
                    travelCache.clear();
                    Object.keys(localStorage).forEach(key => {
                        if (key.startsWith('travel_')) localStorage.removeItem(key);
                    });
                }
            }

            // 2. Mise à jour de la position globale
            userPosition = newPos;
            localStorage.setItem('userLastPosition', JSON.stringify(newPos)); 
            
            // Mise à jour visuelle du bouton
            document.getElementById('gpsBtn').classList.add('active');
            console.log("Position GPS mise à jour :", userPosition);
            
            // --- AJOUT IMPORTANT ICI ---
            // On lance le calcul automatiquement une fois la position GPS trouvée
            await updateDistances(); 
            // ---------------------------
            
        }, (error) => {
            console.warn("Erreur de géolocalisation :", error.message);
            // Si erreur, on décoche le bouton pour ne pas laisser l'utilisateur penser que c'est actif
            document.getElementById('gpsBtn').classList.remove('active');
            alert("Veuillez autoriser la géolocalisation pour calculer les distances.");
        });
    } else {
        alert("La géolocalisation n'est pas supportée par votre navigateur.");
    }
}

function populateCompFilter(filteredMatches) {
    const select = document.getElementById('compFilter');
    const savedValue = currentFilters.comp;
    select.innerHTML = '<option value="all">📊 Toutes compétitions</option>';
    const uniqueComps = [];
    const seen = new Set();
    filteredMatches.forEach(m => {
        if (!seen.has(m.compFormatted)) {
            seen.add(m.compFormatted);
            uniqueComps.push({ name: m.compFormatted, sport: m.sport.toLowerCase() });
        }
    });
    uniqueComps.sort((a, b) => a.name.localeCompare(b.name)).forEach(c => {
        const emoji = SPORT_EMOJIS[c.sport] || "🏟️";
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = `${emoji} ${c.name}`;
        if (c.name === savedValue) opt.selected = true;
        select.appendChild(opt);
    });
    if (!seen.has(savedValue)) currentFilters.comp = "all";
}

function resetFilters() {
    currentFilters = { week: "", comp: "all", sport: "all", accredOnly: false, sortBy: "date", search: "" };
    
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
        if (m.times.car === 0 && m.times.public === 0) return true;

        const isTooFarByCar = m.times.car > 100;
        const isTooFarByBus = m.times.public > 150;

        return !(isTooFarByCar && isTooFarByBus);
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
    
    document.getElementById('calcDistBtn').addEventListener('click', updateDistances);
    document.getElementById('gpsBtn').addEventListener('click', () => {
        const btn = document.getElementById('gpsBtn');
        
        // Si le GPS est déjà actif -> on le désactive pour afficher le champ ville
        if (btn.classList.contains('active')) {
            btn.classList.remove('active');
            userPosition = null; // On vide la position
            localStorage.removeItem('userLastPosition'); // On nettoie le stockage
            
            // Optionnel : on vide le champ ville pour repartir à zéro
            document.getElementById('startCityInput').value = "";
            
            console.log("📍 GPS désactivé, passage en mode manuel.");
        } 
        // Sinon -> on active la géolocalisation
        else {
            // On vide le champ ville pour éviter la confusion
            document.getElementById('startCityInput').value = ""; 
            requestUserLocation();
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
});

// --- GESTION DES MAILS DU FOOTER ---

function sendFooterMail(type) {
    const adminEmail = "lentzkilian@gmail.com";
    let subject = "";
    let body = "";

    switch(type) {
        case 'add':
            subject = "Demande d'ajout de club";
            body = "Bonjour Kilian,\n\nJ'aimerais suggérer l'ajout du club suivant :\n- Nom du club : \n- Sport : \n- Niveau : ";
            break;
        case 'bug':
            subject = "Signalement de bug";
            body = "Bonjour,\nJ'ai rencontré un problème sur le dashboard :";
            break;
        case 'contact':
            subject = "Prise de contact Dashboard";
            body = "Bonjour,";
            break;
    }

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${adminEmail}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');
}