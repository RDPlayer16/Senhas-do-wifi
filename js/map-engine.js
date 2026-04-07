window.map = null;
window.mapMarker = null;
window.redeEditandoMapa = null;
window.mapGlobal = null; 
window.marcadorUsuarioGlobal = null;
window.circuloUsuarioGlobal = null;

window.TILE_SATELLITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
window.TILE_OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

// HELPER DE PRECISÃO: Garante ponto decimal e remove ruídos de string
window.parseCoord = function(val) {
    if (val === undefined || val === null || val === '') return NaN;
    return parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
};

window.fecharMapa = function() { document.getElementById('modalMapa').style.display = 'none'; };

window.calcularDistancia = function(la1, lo1, la2, lo2) {
    const R = 6371e3; 
    const p1 = la1 * Math.PI/180; 
    const p2 = la2 * Math.PI/180;
    const dp = (la2-la1) * Math.PI/180; 
    const dl = (lo2-lo1) * Math.PI/180;
    const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

window.abrirMapaGlobal = function() {
    if (typeof L === 'undefined') { alert("Conecte-se à internet para carregar o mapa."); return; }
    
    const modal = document.getElementById('modalMapaGlobal');
    modal.style.display = 'flex';
    
    if (window.mapGlobal) { 
        window.mapGlobal.remove(); 
        document.getElementById('mapa-global-container').innerHTML = '';
        window.marcadorUsuarioGlobal = null;
        window.circuloUsuarioGlobal = null;
    }

    setTimeout(() => {
        window.mapGlobal = L.map('mapa-global-container').setView([-15, -50], 4); 
        
        const osmLayer = L.tileLayer(window.TILE_OSM, { maxZoom: 19 });
        const satLayer = L.tileLayer(window.TILE_SATELLITE, { maxZoom: 18 });
        osmLayer.addTo(window.mapGlobal);

        L.control.layers({ "Mapa Padrão": osmLayer, "Satélite": satLayer }).addTo(window.mapGlobal);

        const markers = []; 
        
        window.redesEmMemoria.forEach(r => {
            // Aplica parseCoord para garantir o formato de ponto
            const lat = window.parseCoord(r.lat);
            const lng = window.parseCoord(r.lng);

            if(isNaN(lat) || isNaN(lng)) return;

            const marker = L.marker([lat, lng]).addTo(window.mapGlobal);
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

        if (markers.length > 0) {
            const bounds = L.latLngBounds(markers);
            if (bounds.isValid()) {
                window.mapGlobal.invalidateSize(true);
                window.mapGlobal.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
            } else {
                window.focarLocalizacaoUsuario(window.mapGlobal);
            }
        } else {
            window.focarLocalizacaoUsuario(window.mapGlobal);
        }

        setTimeout(() => { if (window.mapGlobal) window.mapGlobal.invalidateSize(true); }, 150);
    }, 300);
};

window.abrirMapaParaRede = function(id, ssid, lat, lng) {
    window.vibrar();
    if (typeof L === 'undefined') { alert("Conecte-se à internet para carregar o mapa."); return; }
    
    document.getElementById('modalMapa').style.display = 'flex';
    document.getElementById('tituloModalMapa').innerText = `📍 ${ssid}`;
    window.redeEditandoMapa = { id };
    
    if(window.map) { window.map.remove(); document.getElementById('mapa-container').innerHTML = ''; }
    
    // Converte para ponto antes de usar
    const l = window.parseCoord(lat);
    const g = window.parseCoord(lng);
    
    const isValidGeo = !isNaN(l) && !isNaN(g);
    const finalLat = isValidGeo ? l : -15;
    const finalLng = isValidGeo ? g : -50;
    const z = isValidGeo ? 18 : 4;

    setTimeout(() => {
        window.map = L.map('mapa-container', { center: [finalLat, finalLng], zoom: z });
        L.tileLayer(window.TILE_OSM, { maxZoom: 19 }).addTo(window.map);
        window.map.invalidateSize(true);
        
        if(isValidGeo) {
            window.mapMarker = L.marker([finalLat, finalLng], { draggable: true }).addTo(window.map);
        }
        
        window.map.on('click', (e) => { 
            if(window.mapMarker) window.mapMarker.setLatLng(e.latlng); 
            else window.mapMarker = L.marker(e.latlng, { draggable: true }).addTo(window.map); 
        });
    }, 200);
};

window.aplicarCoordenadasNoMapa = function() {
    window.vibrar();
    const input = document.getElementById('inputCoordenadasMapa').value.trim();
    if (!input) return;

    // Tenta identificar o separador (vírgula ou ponto e vírgula)
    const partes = input.includes(';') ? input.split(';') : input.split(',');
    
    if (partes.length >= 2) {
        const lat = window.parseCoord(partes[0]);
        const lng = window.parseCoord(partes[1]);

        if (!isNaN(lat) && !isNaN(lng)) {
            if (window.map) {
                window.map.setView([lat, lng], 18);
                if (window.mapMarker) window.mapMarker.setLatLng([lat, lng]);
                else window.mapMarker = L.marker([lat, lng], { draggable: true }).addTo(window.map);
                window.mostrarToast("Alvo atualizado!");
            }
        } else {
            alert("Erro ao processar números. Use o formato: -23.55, -46.63");
        }
    }
};

window.salvarLocalizacaoMapa = function() {
    window.vibrar();
    if(!window.mapMarker) { window.mostrarToast("Marque o local no mapa primeiro!"); return; }
    const { lat, lng } = window.mapMarker.getLatLng();
    
    // Força gravação como float/ponto
    const latFixed = parseFloat(lat.toFixed(8));
    const lngFixed = parseFloat(lng.toFixed(8));

    if (navigator.onLine && typeof window.firebaseAtualizar === 'function' && !window.redeEditandoMapa.id.toString().startsWith('local_')) { 
        window.firebaseAtualizar(window.redeEditandoMapa.id, latFixed, lngFixed); 
    } else {
        let filaUpdate = JSON.parse(localStorage.getItem('wifi_pro_updates_v1') || '{}');
        filaUpdate[window.redeEditandoMapa.id] = { lat: latFixed, lng: lngFixed };
        localStorage.setItem('wifi_pro_updates_v1', JSON.stringify(filaUpdate));
    }

    const index = window.redesEmMemoria.findIndex(r => r.id === window.redeEditandoMapa.id);
    if (index !== -1) { 
        window.redesEmMemoria[index].lat = latFixed; 
        window.redesEmMemoria[index].lng = lngFixed; 
    }
    
    window.atualizarBackupLocal(window.redesEmMemoria);
    window.renderizarInterface(window.redesEmMemoria);
    window.mostrarToast("Coordenadas salvas!"); 
    window.fecharMapa();
};
