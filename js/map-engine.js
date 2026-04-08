// =========================================================
// 1. FUNÇÕES DE INTERFACE (DEFINIDAS PRIMEIRO)
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
// 2. CONFIGURAÇÕES E PARSING
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
// 3. MOTOR DO MAPA GERAL (COM BOTÕES RESTAURADOS)
// =========================================================
window.abrirMapaGlobal = function() {
    if (typeof L === 'undefined') { alert("Erro: Leaflet não carregado."); return; }
    window.corrigirIconesLeaflet();
    
    // VERIFICAÇÃO: Se não houver redes com GPS, avisar o usuário
    const temGps = window.redesEmMemoria.some(r => !isNaN(window.parseCoord(r.lat)));
    if (!temGps) {
        window.mostrarToast("Nenhuma rede com GPS salvo ainda.");
    }

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
            
            // RESTAURAÇÃO: Seu HTML rico com os botões de ação
            const popupHTML = `
                <div style="text-align: center; min-width: 140px; padding: 5px;">
                    <b style="font-size: 15px; color: var(--primary); display: block; margin-bottom: 5px;">${r.ssid}</b>
                    <span style="font-size: 13px; color: #555; display: block; margin-bottom: 12px; background: #f0f0f0; padding: 4px; border-radius: 4px;">${r.senha}</span>
                    <button onclick="window.copy('${r.senha}')" style="background: var(--success); color: white; border: none; padding: 8px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 8px;">📋 Copiar Senha</button>
                    <button onclick="window.fecharMapaGlobal(); window.abrirMapaParaRede('${r.id}', '${r.ssid}', '${r.lat}', '${r.lng}')" style="background: var(--geo); color: white; border: none; padding: 8px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">🗺️ Editar Local</button>
                </div>`;
            
            marker.bindPopup(popupHTML);
            markers.push([lat, lng]);
        });

        window.mapGlobal.invalidateSize();
        
        if (markers.length > 0) {
            const bounds = L.latLngBounds(markers);
            window.mapGlobal.fitBounds(bounds, { padding: [50, 50] });
        }

        // GARANTIA DE RENDERIZAÇÃO: Força o Leaflet a reprocessar as camadas
        setTimeout(() => { 
            window.mapGlobal.invalidateSize(); 
            // Se o mapa ainda estiver vazio (bug visual), movemos levemente o centro para forçar o redesenho
            const center = window.mapGlobal.getCenter();
            window.mapGlobal.setView(center, window.mapGlobal.getZoom(), { animate: false });
        }, 300);

    }, 500); // Aumentado levemente para garantir que o DOM do modal esteja 100% pronto
};

window.mostrarMinhaLocalizacaoNoMapa = function() {
    if (typeof window.vibrar === 'function') window.vibrar();
    if (!window.mapGlobal) return;
    
    navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        window.mapGlobal.setView([lat, lng], 17);

        if (window.marcadorUsuarioGlobal) window.mapGlobal.removeLayer(window.marcadorUsuarioGlobal);
        window.marcadorUsuarioGlobal = L.circleMarker([lat, lng], {
            radius: 8, fillOpacity: 1, color: '#fff', weight: 3, fillColor: '#EF4444'
        }).addTo(window.mapGlobal);
        
        window.mostrarToast("GPS Encontrado!");
    }, null, { enableHighAccuracy: true });
};

// =========================================================
// 4. MAPA DE EDIÇÃO E RADAR
// =========================================================
window.abrirMapaParaRede = function(id, ssid, lat, lng) {
    if (typeof L === 'undefined') return;
    window.corrigirIconesLeaflet();
    document.getElementById('modalMapa').style.display = 'flex';
    window.redeEditandoMapa = { id };
    if(window.map) window.map.remove();
    
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
    navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        if(window.map) {
            window.map.setView([latitude, longitude], 18);
            if(window.mapMarker) window.mapMarker.setLatLng([latitude, longitude]);
            else window.mapMarker = L.marker([latitude, longitude], { draggable: true }).addTo(window.map);
        }
    });
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
    if(!window.mapMarker) return;
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
    window.mostrarToast("Salvo!");
};

window.buscarSenhasPorPerto = function() {
    if (window.mostrandoApenasProximas) {
        window.mostrandoApenasProximas = false;
        if (window.radarWatchId) navigator.geolocation.clearWatch(window.radarWatchId);
        document.getElementById('btnRadar').innerText = "📍 Radar";
        window.renderizarInterface(window.redesEmMemoria);
        return;
    }
    window.vibrar();
    document.getElementById('btnRadar').innerText = "❌ Parar";
    window.radarWatchId = navigator.geolocation.watchPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        const proximas = window.redesEmMemoria.map(r => ({
            ...r, d: window.calcularDistancia(latitude, longitude, window.parseCoord(r.lat), window.parseCoord(r.lng))
        })).filter(r => r.d <= 150).sort((a,b) => a.d - b.d);
        window.mostrandoApenasProximas = true;
        window.renderizarInterface(proximas, true);
    }, null, {enableHighAccuracy: true});
};

console.log("✅ Map Engine Finalizado com Botões Restaurados!");
