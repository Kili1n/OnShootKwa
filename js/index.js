const GEOAPIFY_KEY = "61ca90447ebd483ab2f002050433fa42"; 
const LOGO_TOKEN = "pk_ZMm3eD-YScqxE9anYdSV8g";
const SPORT_EMOJIS = { "football": "⚽", "basketball": "🏀", "handball": "🤾"};

// États globaux
let allMatches = [];
let currentlyFiltered = []; 
let currentFilters = { week: "", comp: "all", sport: "all", accredOnly: false, sortBy: "date", search: "" };
let userPosition = null;
let isCalculating = false;
const travelCache = new Map();

const normalize = (str) => {
    if (!str) return '';
    return str.toUpperCase()
        .replace(/[^A-Z0-9]/g, '') 
        .replace(/FC$|SFC$|SC$|FOOTBALL$|JEANNEDARC$|\d+$/g, '');
};

const getLogoUrl = (name) => {
    const upperName = name.toUpperCase();
    const customKey = Object.keys(CUSTOM_LOGOS).find(key => upperName.includes(key));
    if (customKey) return CUSTOM_LOGOS[customKey];
    let cleanName = normalize(name);
    return `https://img.logo.dev/name/${encodeURIComponent(cleanName.toLowerCase())}?token=${LOGO_TOKEN}`;
};

const formatCompetition = (rawName, sport) => {
    if (!rawName) return "MATCH";
    const name = rawName.toUpperCase();
    const s = (sport).toLowerCase();
    let sportLabel = s.includes("basket") ? "BASKET" : (s.includes("foot") ? "FOOT" : "HAND");
    
    let level = "REG", age = "SENIOR";
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
Cette opportunité me permettra d'enrichir mon portfolio. De votre côté, si vous le souhaitez, je vous fournirai à l'issue de la rencontre les photos pour vos communications.
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

const getTeamCoords = (name) => {
    const upperName = name.toUpperCase();
    const key = Object.keys(STADIUM_COORDS).find(k => upperName.includes(k));
    return key ? STADIUM_COORDS[key] : null;
};

async function fetchTravelData(uLat, uLon, dLat, dLon) {
    const cacheKey = `${uLat},${uLon},${dLat},${dLon}`;
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

async function updateDistances() {
    if (isCalculating || !userPosition) {
        if(!userPosition) alert("Veuillez d'abord activer votre position GPS.");
        return;
    }

    isCalculating = true;
    const btn = document.getElementById('calcDistBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calcul...';


    const targets = currentlyFiltered.slice(0, 100);

    for (let m of targets) {
        if (m.locationCoords && m.distance === 0) {
            m.isCalculating = true;
            renderMatches(currentlyFiltered); 

            const travel = await fetchTravelData(userPosition.lat, userPosition.lon, m.locationCoords.lat, m.locationCoords.lon);
            
            if (travel) {
                allMatches.forEach(match => {
                    if (match.home.name === m.home.name) {
                        match.distance = travel.dist;
                        match.times.car = travel.car;
                        match.times.public = Math.round(travel.car * 1.5 + 15);
                        match.isCalculating = false;
                    }
                });
            }
            m.isCalculating = false;
        }
    }

    isCalculating = false;
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-route"></i> Calculer les distances';
    applyFilters(); // Rafraîchit l'affichage final
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
    if(navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            userPosition = { lat: pos.coords.latitude, lon: pos.coords.longitude };
            document.getElementById('gpsBtn').classList.add('active');
        });
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
        const emoji = SPORT_EMOJIS[m.sport.toLowerCase()] || "🏟️";
        
        // Affichage propre de la distance (pas de 0km)
        const distText = m.isCalculating ? '<i class="fa-solid fa-spinner fa-spin"></i>' : (m.distance > 0 ? `${m.distance} km` : '-- km');

       let mapsUrl = "#";
        if (m.locationCoords) {
            if (userPosition) {
                // Itinéraire de l'utilisateur vers le stade
                mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${userPosition.lat},${userPosition.lon}&destination=${m.locationCoords.lat},${m.locationCoords.lon}&travelmode=driving`;
            } else {
                // Simple recherche du lieu si le GPS n'est pas activé
                mapsUrl = `https://www.google.com/maps/search/?api=1&query=${m.locationCoords.lat},${m.locationCoords.lon}`;
            }
        }

        card.innerHTML = `
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
                <span class="date-time">${m.dateDisplay}</span>
            </div>
            <div class="transport-block">
                <div class="transport-info">
                    <div class="distance">${distText}</div>
                    <div class="modes">
                        <div class="mode"><i class="fa-solid fa-car"></i> ${m.times.car || '--'}'</div>
                        <div class="mode"><i class="fa-solid fa-train-subway"></i> ${m.times.public || '--'}'</div>
                    </div>
                </div>
                <a href="${mapsUrl}" target="_blank" class="maps-arrow ${!m.locationCoords ? 'disabled' : ''}" title="Voir l'itinéraire">
                    <i class="fa-solid fa-chevron-right"></i>
                </a>
            </div>
            <div class="accred-footer">${getAccreditationHTML(m)}</div>
        `;
        grid.appendChild(card);
    });
}

// Listeners
document.addEventListener('DOMContentLoaded', () => {
    loadMatches();
    
    document.getElementById('calcDistBtn').addEventListener('click', updateDistances);
    document.getElementById('gpsBtn').addEventListener('click', requestUserLocation);

    document.getElementById('searchInput').addEventListener('input', e => {
        currentFilters.search = e.target.value;
        applyFilters();
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelector('.filter-btn.active').classList.remove('active');
            btn.classList.add('active');
            currentFilters.sport = btn.dataset.filter;
            applyFilters();
        });
    });

    document.getElementById('siteLogo').addEventListener('click', resetFilters);
    document.getElementById('weekFilter').addEventListener('change', e => { currentFilters.week = e.target.value; applyFilters(); });
    document.getElementById('compFilter').addEventListener('change', e => { currentFilters.comp = e.target.value; applyFilters(); });
    document.getElementById('sortFilter').addEventListener('change', e => { currentFilters.sortBy = e.target.value; applyFilters(); });
    document.getElementById('accredToggle').addEventListener('change', e => { currentFilters.accredOnly = e.target.checked; applyFilters(); });
    document.getElementById('gpsBtn').addEventListener('click', requestUserLocation);
    
    window.addEventListener('scroll', () => {
        document.getElementById('mainHeader').classList.toggle('scrolled', window.scrollY > 20);
    });

    document.getElementById('menuToggle').addEventListener('click', (e) => {
        e.stopPropagation(); 
        document.getElementById('mainHeader').classList.toggle('menu-open');
    });
});