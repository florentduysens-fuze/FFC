// -------------------------------
//   CONSTANTES & OUTILS
// -------------------------------
const R = 6371000;

function toRad(v) { return v * Math.PI / 180; }
function toDeg(v) { return v * 180 / Math.PI; }

// Distance Haversine (mode réel)
function haversine(p1, p2) {
  const dLat = toRad(p2.lat - p1.lat);
  const dLon = toRad(p2.lon - p1.lon);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

// Azimut vrai en millièmes OTAN (mode réel)
function bearingMils(p1, p2) {
  const φ1 = toRad(p1.lat);
  const φ2 = toRad(p2.lat);
  const Δλ = toRad(p2.lon - p1.lon);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  let brngDeg = toDeg(Math.atan2(y, x));
  if (brngDeg < 0) brngDeg += 360;

  return (brngDeg * 6400 / 360) % 6400;
}

// Convergence de grille (γ)
function gridConvergence(lat, lon) {
  const zone = Math.floor((lon + 180) / 6) + 1;
  const lambda0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  const phi = lat * Math.PI / 180;
  const lambda = lon * Math.PI / 180;

  const gamma = Math.atan(Math.tan(lambda - lambda0) * Math.sin(phi));
  return gamma * 180 / Math.PI;
}

// -------------------------------
//   MODE PLAN LOCAL ÉCOLE (Δx/Δy)
// -------------------------------

// Extrait X et Y (5 chiffres / 5 chiffres) depuis MGRS type "31UFR04170 93380"
function mgrsToXY(mgrsStr) {
  const clean = mgrsStr.replace(/\s+/g, "").toUpperCase();
  // ex : 31UFR0417093380 → on enlève 5 premiers caractères (31UFR)
  const grid = clean.slice(5);
  const x = parseInt(grid.slice(0, 5), 10);
  const y = parseInt(grid.slice(5, 10), 10);
  return { x, y };
}

// Distance école
function schoolDistance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Azimut école en millièmes (Δx / Δy)
function schoolAzimuthMils(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  let angleRad = Math.atan(dx / dy);
  let angleDeg = angleRad * 180 / Math.PI;

  if (dy < 0) angleDeg += 180;
  if (dy > 0 && dx < 0) angleDeg += 360;

  return Math.round(angleDeg * 6400 / 360);
}

// -------------------------------
//   CARTE LEAFLET
// -------------------------------
let map;
let markerPosnMor = null;
let markerObj = null;
let markerOA = null;
let markerObjCorr = null;
let markerGPS = null;

function initMap() {
  map = L.map('map').setView([50.85, 4.35], 6);

  L.tileLayer('tiles/{z}/{x}/{y}.png', {
    maxZoom: 12,
    minZoom: 4
  }).addTo(map);
}

window.onload = initMap;

// -------------------------------
//   MARQUEURS
// -------------------------------
function placeMarker(lat, lon, type) {
  if (!map) return;

  const markers = {
    posn: { ref: "markerPosnMor", label: "Posn Mor" },
    obj: { ref: "markerObj", label: "Obj" },
    oa: { ref: "markerOA", label: "OA" },
    obj_corr: { ref: "markerObjCorr", label: "Obj corrigée" },
    gps: { ref: "markerGPS", label: "GPS" }
  };

  const m = markers[type];
  if (!m) return;

  if (window[m.ref]) map.removeLayer(window[m.ref]);
  window[m.ref] = L.marker([lat, lon]).addTo(map).bindPopup(m.label);
}

// -------------------------------
//   GPS → Posn Mor
// -------------------------------
function useGPS() {
  const error = document.getElementById("error");

  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    const mgrsCoord = mgrs.forward([longitude, latitude], 5);

    document.getElementById("posn_mor").value = mgrsCoord;
    placeMarker(latitude, longitude, "gps");

  }, () => {
    error.textContent = "GPS non disponible";
  });
}

// -------------------------------
//   SYNCHRONISATION OBJ
// -------------------------------
let syncLock = false;

function syncObjFields(src) {
  if (syncLock) return;
  syncLock = true;

  const main = document.getElementById("obj_main");
  const oa = document.getElementById("obj_oa");

  if (src === "main") oa.value = main.value;
  if (src === "oa") main.value = oa.value;

  syncLock = false;
}

document.getElementById("obj_main").addEventListener("input", () => syncObjFields("main"));
document.getElementById("obj_oa").addEventListener("input", () => syncObjFields("oa"));

// -------------------------------
//   CALCUL POSN MOR → OBJ
// -------------------------------
function compute() {
  const posn = document.getElementById("posn_mor").value.trim();
  const obj = document.getElementById("obj_main").value.trim();
  const type = document.getElementById("azimutType").value;
  const modeOA = document.getElementById("oaMode").value;

  const error = document.getElementById("error");
  const result = document.getElementById("result");

  error.textContent = "";
  result.textContent = "";

  try {
    if (modeOA === "flat") {
      // MODE ÉCOLE : Δx / Δy
      const P1 = mgrsToXY(posn);
      const P2 = mgrsToXY(obj);

      const d = Math.round(schoolDistance(P1, P2));
      const az = schoolAzimuthMils(P1, P2);

      result.innerHTML = `
        Distance : ${d} m<br>
        Direction : ${az} millièmes
      `;

      const p1geo = mgrs.toPoint(posn);
      const p2geo = mgrs.toPoint(obj);

      placeMarker(p1geo[1], p1geo[0], "posn");
      placeMarker(p2geo[1], p2geo[0], "obj");

      return;
    }

    // MODE RÉEL
    const p1 = mgrs.toPoint(posn);
    const p2 = mgrs.toPoint(obj);

    const P1 = { lat: p1[1], lon: p1[0] };
    const P2 = { lat: p2[1], lon: p2[0] };

    const d = Math.round(haversine(P1, P2));
    const azVrai = bearingMils(P1, P2);

    let azFinal = azVrai;

    if (type === "grille") {
      const gammaDeg = gridConvergence(P1.lat, P1.lon);
      const gammaMils = gammaDeg * 6400 / 360;
      azFinal = (azVrai - gammaMils + 6400) % 6400;
    }

    result.innerHTML = `
      Distance : ${d} m<br>
      Direction : ${Math.round(azFinal)} millièmes
    `;

  } catch (e) {
    error.textContent = "Coordonnées MGRS invalides";
  }
}

// -------------------------------
//   OA : CORRECTION SUCCESSIVE (MODE RÉEL UNIQUEMENT)
// -------------------------------
let latSign = 1;
let rangeSign = 1;

function setLatSign(sign) {
  latSign = sign;
  document.getElementById("btnG").classList.toggle("active", sign === -1);
  document.getElementById("btnD").classList.toggle("active", sign === 1);
}

function setRangeSign(sign) {
  rangeSign = sign;
  document.getElementById("btnLoin").classList.toggle("active", sign === 1);
  document.getElementById("btnPres").classList.toggle("active", sign === -1);
}

function applyOACorrection() {
  const oaMgrs = document.getElementById("oa_mgrs").value.trim();
  const oaAzStr = document.getElementById("oa_azimut").value.trim();
  const objStr = document.getElementById("obj_oa").value.trim();
  const latCorrStr = document.getElementById("oa_lat").value.trim();
  const rangeCorrStr = document.getElementById("oa_range").value.trim();
  const posnMorStr = document.getElementById("posn_mor").value.trim();

  const out = document.getElementById("oa_result");
  const error = document.getElementById("error");

  out.textContent = "";
  error.textContent = "";

  try {
    const azMils = parseFloat(oaAzStr);
    const azRad = azMils * 2 * Math.PI / 6400;

    const latCorr = latSign * parseFloat(latCorrStr || "0");
    const rangeCorr = rangeSign * parseFloat(rangeCorrStr || "0");

    // OA, OBJ, POSN en géographique (mode réel)
    const oaPoint = mgrs.toPoint(oaMgrs);
    const objPoint = mgrs.toPoint(objStr);
    const posnPoint = mgrs.toPoint(posnMorStr);

    const OA = { lat: oaPoint[1], lon: oaPoint[0] };
    const OBJ = { lat: objPoint[1], lon: objPoint[0] };
    const POSN = { lat: posnPoint[1], lon: posnPoint[0] };

    // Distance OA → Obj
    const dOA = haversine(OA, OBJ);
    const newRange = dOA + rangeCorr;

    // Correction dans l’axe OA
    const dNorth = newRange * Math.cos(azRad) - latCorr * Math.sin(azRad);
    const dEast  = newRange * Math.sin(azRad) + latCorr * Math.cos(azRad);

    const phi0 = toRad(OA.lat);
    const latNew = OA.lat + toDeg(dNorth / R);
    const lonNew = OA.lon + toDeg(dEast / (R * Math.cos(phi0)));

    const mgrsNew = mgrs.forward([lonNew, latNew], 5);

    // Mise à jour Obj
    document.getElementById("obj_main").value = mgrsNew;
    document.getElementById("obj_oa").value = mgrsNew;

    // Recalcul Posn Mor → Obj corrigée (en mode réel)
    const P2 = { lat: latNew, lon: lonNew };

    const dFinal = Math.round(haversine(POSN, P2));
    const azFinal = Math.round(bearingMils(POSN, P2));

    out.innerHTML = `
      Nouvelle Obj : ${mgrsNew}<br>
      Distance corrigée : ${dFinal} m<br>
      Direction corrigée : ${azFinal} millièmes
    `;

  } catch (e) {
    error.textContent = "Erreur dans les données OA.";
  }
}
