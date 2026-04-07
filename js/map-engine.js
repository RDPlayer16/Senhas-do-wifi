// =========================================================
// 1. FUNÇÕES DE INTERFACE (FECHAMENTO E UI)
// =========================================================
window.fecharMapa = function() { 
    const m = document.getElementById('modalMapa');
    if(m) m.style.display = 'none'; 
};

window.fecharMapaGlobal = function() { 
    const m = document.getElementById('modalMapaGlobal');
    if(m) m.style.display = 'none'; 
    if (window.marcadorUsuarioGlobal && window.mapGlobal) {
        window.mapGlobal.removeLayer(window.marcadorUsuarioGlobal);
        window.marcadorUsuarioGlobal = null;
    }
};

// =========================================================
// 2. UTILITÁRIOS E GPS
// =========================================================
window.map = null;
window.mapMarker = null;
window.mapGlobal = null; 
window.marcadorUsuarioGlobal = null;
window.circuloUsuarioGlobal = null;
window.TILE_OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

window.parseCoord = function(val) {
    if (!val) return NaN;
    return parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
};

window.corrigirIconesLeaflet = function() {
    if (typeof L !== 'undefined' && L.Icon && L.Icon.Default) {
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: './js/libs/images/marker-icon-2x.png',
            iconUrl: './js/libs/images/marker-icon.png',
            shadowUrl: './js/libs/images/marker-shadow.png',
        });
    }
};

window.calcularDistancia = function(la1, lo1, la2, lo2) {
    const R = 6371e3; 
    const p1 = la1 * Math.PI/180; const p2 = la2 * Math.PI/180;
    const dp = (la2-la1) * Math.PI/180; const dl = (lo2-lo1) * Math.PI/180;
    const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

// =========================================================
// 3. LOGICA DO MAPA GLOBAL
// =========================================================
window.abrirMapaGlobal = function() {
    if (typeof L === 'undefined') { alert("Erro: Leaflet não carregado."); return; }
    window.corrigirIconesLeaflet();
    document.getElementById('modalMapaGlobal').style.display = 'flex';
    if (window.mapGlobal) { window.mapGlobal.remove(); }

    setTimeout(() => {
        window.mapGlobal = L.map('mapa-global-container').setView([-15, -50], 4); 
        L.tileLayer(window.TILE_OSM, { maxZoom: 19 }).addTo(window.mapGlobal);
        
        const markers = []; 
        window.redesEmMemoria.forEach(r => {
            const lat = window.parseCoord(r.lat);
            const lng = window.parseCoord(r.lng);
            if(isNaN(lat) || isNaN(lng)) return;
            const marker = L.marker([lat, lng]).addTo(window.mapGlobal);
            marker.bindPopup(`<b>${r.ssid}</b><br>${r.senha}`);
            markers.push([lat, lng]);
        });

        window.mapGlobal.invalidateSize();
        if (markers.length > 0) {
            window.mapGlobal.fitBounds(L.latLngBounds(markers), { padding: [50, 50] });
        }
    }, 400);
};

window.mostrarMinhaLocalizacaoNoMapa = function() {
    window.vibrar();
    if (!window.mapGlobal) return;
    window.mostrarToast("📍 Buscando sua localização...");
    
    navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        window.mapGlobal.setView([lat, lng], 17);

        if (window.marcadorUsuarioGlobal) window.mapGlobal.removeLayer(window.marcadorUsuarioGlobal);
        if (window.circuloUsuarioGlobal) window.mapGlobal.removeLayer(window.circuloUsuarioGlobal);

        window.marcadorUsuarioGlobal = L.circleMarker([lat, lng], {
            radius: 8, fillOpacity: 1, color: '#fff', weight: 3, fillColor: '#EF4444'
        }).addTo(window.mapGlobal);

        window.circuloUsuarioGlobal = L.circle([lat, lng], {
            color: '#EF4444', fillOpacity: 0.1, radius: 150
        }).addTo(window.mapGlobal);
        
        window.mostrarToast("GPS Encontrado!");
    }, () => alert("Erro ao acessar GPS."), { enableHighAccuracy: true });
};

// =========================================================
// 4. LOGICA DO MAPA INDIVIDUAL (EDIÇÃO)
// =========================================================
window.abrirMapaParaRede = function(id, ssid, lat, lng) {
    if (typeof L === 'undefined') { alert("Erro: Leaflet não carregado."); return; }
    window.corrigirIconesLeaflet();
    document.getElementById('modalMapa').style.display = 'flex';
    window.redeEditandoMapa = { id };
    if(window.map) { window.map.remove(); }
    
    const l = window.parseCoord(lat);
    const g = window.parseCoord(lng);
    const isValid = !isNaN(l) && !isNaN(g);

    setTimeout(() => {
        window.map = L.map('mapa-container', { center: [isValid ? l : -15, isValid ? g : -50], zoom: isValid ? 18 : 4 });
        L.tileLayer(window.TILE_OSM, { maxZoom: 19 }).addTo(window.map);
        window.map.invalidateSize();
        if(isValid) window.mapMarker = L.marker([l, g], { draggable: true }).addTo(window.map);
        
        window.map.on('click', (e) => { 
            if(window.mapMarker) window.mapMarker.setLatLng(e.latlng); 
            else window.mapMarker = L.marker(e.latlng, { draggable: true }).addTo(window.map); 
        });
    }, 400);
};

window.usarMeuGPSNoMapa = function() {
    window.vibrar();
    if (!window.map) return;
    navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        window.map.setView([latitude, longitude], 18);
        if(window.mapMarker) window.mapMarker.setLatLng([latitude, longitude]);
        else window.mapMarker = L.marker([latitude, longitude], { draggable: true }).addTo(window.map);
    }, null, { enableHighAccuracy: true });
};

window.aplicarCoordenadasNoMapa = function() {
    const input = document.getElementById('inputCoordenadasMapa').value.trim();
    const partes = input.split(',');
    if (partes.length >= 2) {
        const lat = window.parseCoord(partes[0]);
        const lng = window.parseCoord(partes[1]);
        if (!isNaN(lat) && !isNaN(lng) && window.map) {
            window.map.setView([lat, lng], 18);
            if (window.mapMarker) window.mapMarker.setLatLng([lat, lng]);
            else window.mapMarker = L.marker([lat, lng], { draggable: true }).addTo(window.map);
        }
    }
};

window.salvarLocalizacaoMapa = function() {
    if(!window.mapMarker) { window.mostrarToast("Marque o local!"); return; }
    const { lat, lng } = window.mapMarker.getLatLng();
    const latF = parseFloat(lat.toFixed(8));
    const lngF = parseFloat(lng.toFixed(8));

    const index = window.redesEmMemoria.findIndex(r => r.id === window.redeEditandoMapa.id);
    if (index !== -1) { 
        window.redesEmMemoria[index].lat = latF; 
        window.redesEmMemoria[index].lng = lngF; 
    }
    
    window.atualizarBackupLocal(window.redesEmMemoria);
    window.renderizarInterface(window.redesEmMemoria);
    window.fecharMapa();
    window.mostrarToast("Local salvo!");
};

// =========================================================
// 5. RADAR (MANTIDO)
// =========================================================
window.pararRadar = function() {
    window.mostrandoApenasProximas = false;
    if (window.radarWatchId) navigator.geolocation.clearWatch(window.radarWatchId);
    window.radarWatchId = null;
    const btn = document.getElementById('btnRadar');
    if(btn) btn.innerText = "📍 Radar";
    window.renderizarInterface(window.redesEmMemoria);
};

window.buscarSenhasPorPerto = function() {
    if (window.mostrandoApenasProximas) return window.pararRadar();
    window.vibrar();
    const btn = document.getElementById('btnRadar');
    if(btn) btn.innerText = "❌ Parar";
    window.radarWatchId = navigator.geolocation.watchPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        const proximas = window.redesEmMemoria.map(r => ({
            ...r, d: window.calcularDistancia(latitude, longitude, window.parseCoord(r.lat), window.parseCoord(r.lng))
        })).filter(r => r.d <= 150).sort((a,b) => a.d - b.d);
        window.mostrandoApenasProximas = true;
        window.renderizarInterface(proximas, true);
    }, () => window.pararRadar(), {enableHighAccuracy: true});
};
