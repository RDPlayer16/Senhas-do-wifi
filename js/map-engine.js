// =========================================================
// 1. FUNÇÕES DE INTERFACE
// =========================================================
window.fecharMapa = function() {
    const m = document.getElementById('modalMapa');
    if (m) m.style.display = 'none';
};

window.fecharMapaGlobal = function() {
    const m = document.getElementById('modalMapaGlobal');
    if (m) m.style.display = 'none';

    if (window.marcadorUsuarioGlobal && window.mapGlobal) {
        window.mapGlobal.removeLayer(window.marcadorUsuarioGlobal);
        window.marcadorUsuarioGlobal = null;
    }

    if (window.circuloUsuarioGlobal && window.mapGlobal) {
        window.mapGlobal.removeLayer(window.circuloUsuarioGlobal);
        window.circuloUsuarioGlobal = null;
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
    if (val === null || val === undefined || val === '') return NaN;
    return parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
};

window.escapeHTML = function(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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
    if ([la1, lo1, la2, lo2].some(v => isNaN(v))) return Infinity;

    const R = 6371e3;
    const p1 = la1 * Math.PI / 180;
    const p2 = la2 * Math.PI / 180;
    const dp = (la2 - la1) * Math.PI / 180;
    const dl = (lo2 - lo1) * Math.PI / 180;

    const a =
        Math.sin(dp / 2) ** 2 +
        Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// =========================================================
// 3. AJUSTE DE ZOOM DO MAPA GLOBAL
// =========================================================
window.ajustarZoomMapaGlobal = function(pontos, fallback = [-15, -50]) {
    if (!window.mapGlobal) return;

    window.mapGlobal.invalidateSize(true);

    if (pontos.length === 1) {
        window.mapGlobal.setView(pontos[0], 17, { animate: false });
    } else if (pontos.length > 1) {
        window.mapGlobal.fitBounds(L.latLngBounds(pontos), {
            padding: [35, 35],
            maxZoom: 17,
            animate: false
        });
    } else {
        window.mapGlobal.setView(fallback, 4, { animate: false });
    }
};

// =========================================================
// 4. MAPA GERAL
// =========================================================
window.abrirMapaGlobal = function() {
    if (typeof L === 'undefined') {
        alert("Erro: Leaflet não carregado.");
        return;
    }

    window.corrigirIconesLeaflet();

    const modal = document.getElementById('modalMapaGlobal');
    if (!modal) {
        alert("Erro: modalMapaGlobal não encontrado.");
        return;
    }

    const redes = Array.isArray(window.redesEmMemoria) ? window.redesEmMemoria : [];

    const listaComGps = redes.filter(r => {
        const lat = window.parseCoord(r.lat);
        const lng = window.parseCoord(r.lng);
        return !isNaN(lat) && !isNaN(lng);
    });

    if (listaComGps.length === 0 && typeof window.mostrarToast === 'function') {
        window.mostrarToast("Nenhuma rede com GPS salvo ainda.");
    }

    modal.style.display = 'flex';

    if (window.mapGlobal) {
        window.mapGlobal.remove();
        window.mapGlobal = null;
    }

    setTimeout(() => {
        window.mapGlobal = L.map('mapa-global-container').setView([-15, -50], 4);

        L.tileLayer(window.TILE_OSM, {
            maxZoom: 19
        }).addTo(window.mapGlobal);

        const pontos = [];

        listaComGps.forEach(r => {
            const lat = window.parseCoord(r.lat);
            const lng = window.parseCoord(r.lng);

            const ssidSeguro = window.escapeHTML(r.ssid || 'Sem nome');
            const senhaSeguro = window.escapeHTML(r.senha || '');
            const senhaJS = JSON.stringify(r.senha || '');
            const idJS = JSON.stringify(r.id || '');
            const ssidJS = JSON.stringify(r.ssid || '');
            const latJS = JSON.stringify(String(r.lat ?? ''));
            const lngJS = JSON.stringify(String(r.lng ?? ''));

            const marker = L.marker([lat, lng]).addTo(window.mapGlobal);

            const popupHTML = `
                <div style="text-align:center; min-width:140px; padding:5px;">
                    <b style="font-size:15px; color:var(--primary); display:block; margin-bottom:5px;">
                        ${ssidSeguro}
                    </b>

                    <span style="font-size:13px; color:#555; display:block; margin-bottom:12px; background:#f0f0f0; padding:4px; border-radius:4px;">
                        ${senhaSeguro}
                    </span>

                    <button onclick='window.copy(${senhaJS})'
                        style="background:var(--success); color:white; border:none; padding:8px 12px; border-radius:6px; font-weight:bold; cursor:pointer; width:100%; box-shadow:0 2px 4px rgba(0,0,0,0.1); margin-bottom:8px;">
                        📋 Copiar Senha
                    </button>

                    <button onclick='window.fecharMapaGlobal(); window.abrirMapaParaRede(${idJS}, ${ssidJS}, ${latJS}, ${lngJS})'
                        style="background:var(--geo); color:white; border:none; padding:8px 12px; border-radius:6px; font-weight:bold; cursor:pointer; width:100%; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
                        🗺️ Editar Local
                    </button>
                </div>
            `;

            marker.bindPopup(popupHTML);
            pontos.push([lat, lng]);
        });

        requestAnimationFrame(() => {
            window.ajustarZoomMapaGlobal(pontos);
        });

        setTimeout(() => {
            window.ajustarZoomMapaGlobal(pontos);
        }, 150);

        setTimeout(() => {
            window.ajustarZoomMapaGlobal(pontos);
        }, 500);

    }, 250);
};

window.mostrarMinhaLocalizacaoNoMapa = function() {
    if (typeof window.vibrar === 'function') window.vibrar();

    if (!window.mapGlobal) return;

    navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        if (window.marcadorUsuarioGlobal) {
            window.mapGlobal.removeLayer(window.marcadorUsuarioGlobal);
        }

        if (window.circuloUsuarioGlobal) {
            window.mapGlobal.removeLayer(window.circuloUsuarioGlobal);
        }

        window.marcadorUsuarioGlobal = L.circleMarker([lat, lng], {
            radius: 8,
            fillOpacity: 1,
            color: '#fff',
            weight: 3,
            fillColor: '#EF4444'
        }).addTo(window.mapGlobal);

        window.circuloUsuarioGlobal = L.circle([lat, lng], {
            radius: 150,
            color: '#EF4444',
            fillColor: '#EF4444',
            fillOpacity: 0.12,
            weight: 2
        }).addTo(window.mapGlobal);

        const redes = Array.isArray(window.redesEmMemoria) ? window.redesEmMemoria : [];

        const pontosProximos = redes
            .map(r => {
                const rLat = window.parseCoord(r.lat);
                const rLng = window.parseCoord(r.lng);
                const d = window.calcularDistancia(lat, lng, rLat, rLng);
                return { lat: rLat, lng: rLng, d };
            })
            .filter(r => !isNaN(r.lat) && !isNaN(r.lng) && r.d <= 150)
            .map(r => [r.lat, r.lng]);

        const todosPontos = [[lat, lng], ...pontosProximos];

        window.ajustarZoomMapaGlobal(todosPontos, [lat, lng]);

        if (typeof window.mostrarToast === 'function') {
            if (pontosProximos.length > 0) {
                window.mostrarToast(`${pontosProximos.length} rede(s) perto de você.`);
            } else {
                window.mostrarToast("GPS encontrado! Nenhuma rede em até 150m.");
            }
        }

    }, () => {
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast("Não foi possível obter sua localização.");
        }
    }, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
    });
};

// =========================================================
// 5. MAPA DE EDIÇÃO
// =========================================================
window.abrirMapaParaRede = function(id, ssid, lat, lng) {
    if (typeof L === 'undefined') return;

    window.corrigirIconesLeaflet();

    const modal = document.getElementById('modalMapa');
    if (!modal) return;

    modal.style.display = 'flex';
    window.redeEditandoMapa = { id };

    if (window.map) {
        window.map.remove();
        window.map = null;
    }

    const l = window.parseCoord(lat);
    const g = window.parseCoord(lng);
    const isValid = !isNaN(l) && !isNaN(g);

    setTimeout(() => {
        window.map = L.map('mapa-container', {
            center: [isValid ? l : -15, isValid ? g : -50],
            zoom: isValid ? 18 : 4
        });

        L.tileLayer(window.TILE_OSM, {
            maxZoom: 19
        }).addTo(window.map);

        setTimeout(() => {
            window.map.invalidateSize(true);
        }, 150);

        if (isValid) {
            window.mapMarker = L.marker([l, g], {
                draggable: true
            }).addTo(window.map);
        } else {
            window.mapMarker = null;
        }

        window.map.on('click', (e) => {
            if (window.mapMarker) {
                window.mapMarker.setLatLng(e.latlng);
            } else {
                window.mapMarker = L.marker(e.latlng, {
                    draggable: true
                }).addTo(window.map);
            }
        });

    }, 300);
};

window.usarMeuGPSNoMapa = function() {
    navigator.geolocation.getCurrentPosition((pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;

        if (window.map) {
            window.map.setView([latitude, longitude], 18);

            if (window.mapMarker) {
                window.mapMarker.setLatLng([latitude, longitude]);
            } else {
                window.mapMarker = L.marker([latitude, longitude], {
                    draggable: true
                }).addTo(window.map);
            }
        }
    }, () => {
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast("Não foi possível obter seu GPS.");
        }
    }, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
    });
};

window.aplicarCoordenadasNoMapa = function() {
    const input = document.getElementById('inputCoordenadasMapa')?.value.trim() || '';
    const partes = input.split(',');

    if (partes.length >= 2) {
        const lat = window.parseCoord(partes[0]);
        const lng = window.parseCoord(partes[1]);

        if (!isNaN(lat) && !isNaN(lng) && window.map) {
            window.map.setView([lat, lng], 18);

            if (window.mapMarker) {
                window.mapMarker.setLatLng([lat, lng]);
            } else {
                window.mapMarker = L.marker([lat, lng], {
                    draggable: true
                }).addTo(window.map);
            }

            if (typeof window.mostrarToast === 'function') {
                window.mostrarToast("Coordenadas aplicadas.");
            }
        }
    }
};

window.salvarLocalizacaoMapa = function() {
    if (!window.mapMarker) {
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast("Marque um ponto no mapa antes de salvar.");
        }
        return;
    }

    const pos = window.mapMarker.getLatLng();
    const latF = parseFloat(pos.lat.toFixed(8));
    const lngF = parseFloat(pos.lng.toFixed(8));

    const redes = Array.isArray(window.redesEmMemoria) ? window.redesEmMemoria : [];
    const index = redes.findIndex(r => r.id === window.redeEditandoMapa?.id);

    if (index !== -1) {
        redes[index].lat = latF;
        redes[index].lng = lngF;
    }

    if (typeof window.atualizarBackupLocal === 'function') {
        window.atualizarBackupLocal(redes);
    }

    if (typeof window.renderizarInterface === 'function') {
        window.renderizarInterface(redes);
    }

    window.fecharMapa();

    if (typeof window.mostrarToast === 'function') {
        window.mostrarToast("Localização salva!");
    }
};

// =========================================================
// 6. RADAR
// =========================================================
window.buscarSenhasPorPerto = function() {
    if (window.mostrandoApenasProximas) {
        window.mostrandoApenasProximas = false;

        if (window.radarWatchId) {
            navigator.geolocation.clearWatch(window.radarWatchId);
            window.radarWatchId = null;
        }

        const btn = document.getElementById('btnRadar');
        if (btn) btn.innerText = "📍 Radar";

        if (typeof window.renderizarInterface === 'function') {
            window.renderizarInterface(window.redesEmMemoria || []);
        }

        return;
    }

    if (typeof window.vibrar === 'function') window.vibrar();

    const btn = document.getElementById('btnRadar');
    if (btn) btn.innerText = "❌ Parar";

    window.radarWatchId = navigator.geolocation.watchPosition((pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;

        const redes = Array.isArray(window.redesEmMemoria) ? window.redesEmMemoria : [];

        const proximas = redes
            .map(r => {
                const lat = window.parseCoord(r.lat);
                const lng = window.parseCoord(r.lng);

                return {
                    ...r,
                    d: window.calcularDistancia(latitude, longitude, lat, lng)
                };
            })
            .filter(r => r.d <= 150)
            .sort((a, b) => a.d - b.d);

        window.mostrandoApenasProximas = true;

        if (typeof window.renderizarInterface === 'function') {
            window.renderizarInterface(proximas, true);
        }

    }, () => {
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast("Não foi possível acessar o GPS.");
        }

        const btn = document.getElementById('btnRadar');
        if (btn) btn.innerText = "📍 Radar";

        window.mostrandoApenasProximas = false;
    }, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
    });
};

console.log("✅ Map Engine corrigido: mapa global, zoom, GPS e radar funcionando.");    }, 500); // Aumentado levemente para garantir que o DOM do modal esteja 100% pronto
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
