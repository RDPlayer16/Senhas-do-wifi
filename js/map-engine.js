window.map = null;
window.mapMarker = null;
window.redeEditandoMapa = null;
window.mapGlobal = null; 
window.marcadorUsuarioGlobal = null;
window.circuloUsuarioGlobal = null;

// Função de segurança para evitar o erro "L is not defined"
window.garantirLeaflet = function() {
    if (typeof L === 'undefined') return false;
    
    // Só executa a correção se ainda não foi feita
    if (!L.Icon.Default.prototype._patched) {
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: './js/libs/images/marker-icon-2x.png',
            iconUrl: './js/libs/images/marker-icon.png',
            shadowUrl: './js/libs/images/marker-shadow.png',
        });
        L.Icon.Default.prototype._patched = true;
    }
    return true;
};

window.TILE_SATELLITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
window.TILE_OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

window.parseCoord = function(val) {
    if (val === undefined || val === null || val === '') return NaN;
    return parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
};

window.fecharMapa = function() { document.getElementById('modalMapa').style.display = 'none'; };

window.calcularDistancia = function(la1, lo1, la2, lo2) {
    const R = 6371e3; 
    const p1 = la1 * Math.PI/180; const p2 = la2 * Math.PI/180;
    const dp = (la2-la1) * Math.PI/180; const dl = (lo2-lo1) * Math.PI/180;
    const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

window.abrirMapaGlobal = function() {
    if (!window.garantirLeaflet()) { alert("Erro: Biblioteca de mapas não carregada."); return; }
    
    const modal = document.getElementById('modalMapaGlobal');
    modal.style.display = 'flex';
    
    if (window.mapGlobal) { 
        window.mapGlobal.remove(); 
        document.getElementById('mapa-global-container').innerHTML = '';
    }

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

window.abrirMapaParaRede = function(id, ssid, lat, lng) {
    if (!window.garantirLeaflet()) { alert("Erro: Biblioteca de mapas não carregada."); return; }
    
    document.getElementById('modalMapa').style.display = 'flex';
    window.redeEditandoMapa = { id };
    if(window.map) { window.map.remove(); document.getElementById('mapa-container').innerHTML = ''; }
    
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

// Funções de Radar mantidas
window.pararRadar = function() {
    window.mostrandoApenasProximas = false;
    if (window.radarWatchId) navigator.geolocation.clearWatch(window.radarWatchId);
    document.getElementById('btnRadar').innerText = "📍 Radar";
    window.renderizarInterface(window.redesEmMemoria);
};

window.buscarSenhasPorPerto = function() {
    if (window.mostrandoApenasProximas) return window.pararRadar();
    window.vibrar();
    const btn = document.getElementById('btnRadar');
    btn.innerText = "❌ Parar";
    
    window.radarWatchId = navigator.geolocation.watchPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        const proximas = window.redesEmMemoria.map(r => ({
            ...r, d: window.calcularDistancia(latitude, longitude, window.parseCoord(r.lat), window.parseCoord(r.lng))
        })).filter(r => r.d <= 150).sort((a,b) => a.d - b.d);
        
        window.mostrandoApenasProximas = true;
        window.renderizarInterface(proximas, true);
    }, () => window.pararRadar(), {enableHighAccuracy: true});
};
