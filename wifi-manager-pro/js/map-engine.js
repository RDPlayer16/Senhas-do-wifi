window.map = null;
window.mapMarker = null;
window.redeEditandoMapa = null;
window.mapGlobal = null; 
window.marcadorUsuarioGlobal = null;
window.circuloUsuarioGlobal = null;

window.TILE_SATELLITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
window.TILE_OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

window.fecharMapa = function() { document.getElementById('modalMapa').style.display = 'none'; };

window.calcularDistancia = function(la1, lo1, la2, lo2) {
    const R = 6371e3; const p1 = la1 * Math.PI/180; const p2 = la2 * Math.PI/180;
    const dp = (la2-la1) * Math.PI/180; const dl = (lo2-lo1) * Math.PI/180;
    const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

window.focarLocalizacaoUsuario = function(mapInstance) {
    if(navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(p => {
            mapInstance.setView([p.coords.latitude, p.coords.longitude], 14);
        }, () => {});
    }
};

window.abrirMapaGlobal = function() {
    if (typeof L === 'undefined') { alert("Conecte-se à internet para carregar o mapa."); return; }
    
    const modal = document.getElementById('modalMapaGlobal');
    modal.style.display = 'flex';
    
    if(window.mapGlobal) { 
        window.mapGlobal.remove(); 
        document.getElementById('mapa-global-container').innerHTML = '';
        window.marcadorUsuarioGlobal = null;
        window.circuloUsuarioGlobal = null;
    }

    window.lerDoIndexedDB().then(dadosFrescos => {
        const redesValidas = (dadosFrescos || window.redesEmMemoria).filter(r => {
            return r.lat != null && r.lng != null && 
                   r.lat !== 'null' && r.lng !== 'null' &&
                   r.lat !== 'undefined' && r.lng !== 'undefined' &&
                   r.lat !== '' && r.lng !== '';
        });

        return new Promise(resolve => {
            const checkSize = () => {
                const h = document.getElementById('mapa-global-container').clientHeight;
                if (h > 0) resolve(redesValidas);
                else requestAnimationFrame(checkSize);
            };
            checkSize();
        });
    }).then(redesComGeo => {
        window.mapGlobal = L.map('mapa-global-container').setView([-15, -50], 4); 
        
        const osmLayer = L.tileLayer(window.TILE_OSM, { maxZoom: 19 });
        const satLayer = L.tileLayer(window.TILE_SATELLITE, { maxZoom: 18 });
        osmLayer.addTo(window.mapGlobal);

        L.control.layers({
            "Mapa Padrão": osmLayer,
            "Satélite": satLayer
        }).addTo(window.mapGlobal);
        
        window.mapGlobal.invalidateSize(); 

        if (redesComGeo.length > 0) {
            const markers = []; 
            
            redesComGeo.forEach(r => {
                const lat = parseFloat(r.lat); const lng = parseFloat(r.lng);
                if(isNaN(lat) || isNaN(lng)) return;

                const marker = L.marker([lat, lng]).addTo(window.mapGlobal);
                
                const popupHTML = `
                    <div style="text-align: center; min-width: 140px; padding: 5px;">
                        <b style="font-size: 15px; color: var(--primary); display: block; margin-bottom: 5px;">${r.ssid}</b>
                        <span style="font-size: 13px; color: #555; display: block; margin-bottom: 12px; background: #f0f0f0; padding: 4px; border-radius: 4px;">${r.senha}</span>
                        <button onclick="window.copy('${r.senha}')" style="background: var(--success); color: white; border: none; padding: 8px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 8px;">📋 Copiar Senha</button>
                        <button onclick="window.fecharMapaGlobal(); window.abrirMapaParaRede('${r.id}', '${r.ssid}', '${r.lat}', '${r.lng}')" style="background: var(--geo); color: white; border: none; padding: 8px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">🗺️ Editar Local</button>
                    </div>
                `;
                marker.bindPopup(popupHTML);
                markers.push([lat, lng]);
            });

            if(markers.length > 0) {
                const bounds = L.latLngBounds(markers);
                window.mapGlobal.flyToBounds(bounds, { padding: [40, 40], maxZoom: 18, duration: 0.5 });
            } else {
                window.focarLocalizacaoUsuario(window.mapGlobal);
            }
        } else {
            window.focarLocalizacaoUsuario(window.mapGlobal);
        }
    });
};

window.mostrarMinhaLocalizacaoNoMapa = function() {
    window.vibrar();
    if (!window.mapGlobal) return;
    window.mostrarToast("📍 Buscando sua localização...");
    
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;

            window.mapGlobal.setView([lat, lng], 17);

            if (window.marcadorUsuarioGlobal) window.mapGlobal.removeLayer(window.marcadorUsuarioGlobal);
            if (window.circuloUsuarioGlobal) window.mapGlobal.removeLayer(window.circuloUsuarioGlobal);

            const iconeUsuario = L.divIcon({
                className: 'user-icon',
                html: '<div style="background:#EF4444; width:16px; height:16px; border-radius:50%; border:3px solid #fff; box-shadow:0 0 8px rgba(0,0,0,0.6);"></div>',
                iconSize: [22, 22],
                iconAnchor: [11, 11]
            });

            window.marcadorUsuarioGlobal = L.marker([lat, lng], { icon: iconeUsuario }).addTo(window.mapGlobal);
            window.marcadorUsuarioGlobal.bindPopup("<div style='text-align:center;'><b>📍 Você está aqui!</b><br><span style='font-size:12px;color:#666;'>Veja as redes ao redor</span></div>").openPopup();

            window.circuloUsuarioGlobal = L.circle([lat, lng], {
                color: '#EF4444',
                fillColor: '#EF4444',
                fillOpacity: 0.1,
                radius: 150
            }).addTo(window.mapGlobal);
            
            window.mostrarToast("GPS Encontrado com Sucesso!");
        },
        (err) => { alert("Não foi possível acessar o GPS. Verifique se a localização está ativada."); },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
};

window.fecharMapaGlobal = function() { 
    document.getElementById('modalMapaGlobal').style.display = 'none'; 
    if (window.marcadorUsuarioGlobal && window.mapGlobal) {
        window.mapGlobal.removeLayer(window.marcadorUsuarioGlobal);
        window.marcadorUsuarioGlobal = null;
    }
    if (window.circuloUsuarioGlobal && window.mapGlobal) {
        window.mapGlobal.removeLayer(window.circuloUsuarioGlobal);
        window.circuloUsuarioGlobal = null;
    }
};

window.abrirMapaParaRede = function(id, ssid, lat, lng) {
    window.vibrar();
    if (typeof L === 'undefined') { alert("Conecte-se à internet para carregar o mapa."); return; }
    
    const modal = document.getElementById('modalMapa');
    modal.style.display = 'flex';
    document.getElementById('tituloModalMapa').innerText = `📍 ${ssid}`;
    document.getElementById('inputCoordenadasMapa').value = '';

    window.redeEditandoMapa = { id };
    
    if(window.map) { 
        window.map.remove(); 
        window.mapMarker = null; 
        document.getElementById('mapa-container').innerHTML = '';
    }
    
    const l = (lat && lat !== 'null' && lat !== 'undefined' && lat !== '') ? parseFloat(lat) : -15; 
    const g = (lng && lng !== 'null' && lng !== 'undefined' && lng !== '') ? parseFloat(lng) : -50;
    const z = (lat && lat !== 'null' && lat !== 'undefined' && lat !== '') ? 18 : 4;
    
    new Promise(resolve => {
        const checkSize = () => {
            const h = document.getElementById('mapa-container').clientHeight;
            if (h > 0) resolve();
            else requestAnimationFrame(checkSize);
        };
        checkSize();
    }).then(() => {
        window.map = L.map('mapa-container', { center: [l, g], zoom: z });

        const osmLayer = L.tileLayer(window.TILE_OSM, { maxZoom: 19 });
        const satLayer = L.tileLayer(window.TILE_SATELLITE, { maxZoom: 18 });

        osmLayer.addTo(window.map);

        L.control.layers({
            "Mapa Padrão": osmLayer,
            "Satélite": satLayer
        }).addTo(window.map);
        
        window.map.invalidateSize(true);
        
        if(z === 18) {
            window.mapMarker = L.marker([l, g], { draggable: true }).addTo(window.map);
        }
        
        window.map.on('click', (e) => { 
            if(window.mapMarker) window.mapMarker.setLatLng(e.latlng); 
            else window.mapMarker = L.marker(e.latlng, { draggable: true }).addTo(window.map); 
        });
    });
};

window.aplicarCoordenadasNoMapa = function() {
    window.vibrar();
    const input = document.getElementById('inputCoordenadasMapa').value;
    if (!input.trim()) return;

    const partes = input.split(',');
    if (partes.length >= 2) {
        const lat = parseFloat(partes[0].trim());
        const lng = parseFloat(partes[1].trim());

        if (!isNaN(lat) && !isNaN(lng)) {
            if (window.map) {
                window.map.setView([lat, lng], 18);
                if (window.mapMarker) {
                    window.mapMarker.setLatLng([lat, lng]);
                } else {
                    window.mapMarker = L.marker([lat, lng], { draggable: true }).addTo(window.map);
                }
                window.mostrarToast("Alvo atualizado!");
            }
        } else {
            alert("Coordenadas inválidas. Use apenas números e vírgula.");
        }
    } else {
        alert("Formato inválido. Cole no formato: Latitude, Longitude (Ex: -23.55, -46.63)");
    }
};

window.usarMeuGPSNoMapa = function() {
    window.vibrar();
    if (!window.map) { window.mostrarToast("Erro: O mapa não foi inicializado."); return; }
    if (!navigator.geolocation) { alert("Seu navegador não suporta GPS."); return; }

    const btn = document.getElementById('btnGpsMapa');
    const textoOriginal = btn.innerText;
    btn.innerText = "🎯 Buscando satélites...";
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude } = pos.coords;
            window.map.setView([latitude, longitude], 18); 
            if(window.mapMarker) { window.mapMarker.setLatLng([latitude, longitude]); } 
            else { window.mapMarker = L.marker([latitude, longitude], { draggable: true }).addTo(window.map); } 
            window.mostrarToast("GPS de Alta Precisão encontrado!");
            btn.innerText = textoOriginal; 
            btn.disabled = false;
        },
        (err) => {
            navigator.geolocation.getCurrentPosition(
                (posFallback) => {
                    const { latitude, longitude } = posFallback.coords;
                    window.map.setView([latitude, longitude], 16); 
                    if(window.mapMarker) { window.mapMarker.setLatLng([latitude, longitude]); } 
                    else { window.mapMarker = L.marker([latitude, longitude], { draggable: true }).addTo(window.map); }
                    window.mostrarToast("GPS Aproximado encontrado.");
                    btn.innerText = textoOriginal; 
                    btn.disabled = false;
                },
                (errFallback) => {
                    alert("Não foi possível obter o GPS. Ligue a localização do aparelho.");
                    btn.innerText = textoOriginal; 
                    btn.disabled = false;
                },
                { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
            );
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
};

window.salvarLocalizacaoMapa = function() {
    window.vibrar();
    if(!window.mapMarker) { window.mostrarToast("Marque o local no mapa primeiro!"); return; }
    const { lat, lng } = window.mapMarker.getLatLng();
    
    if (navigator.onLine && typeof window.firebaseAtualizar === 'function' && !window.redeEditandoMapa.id.toString().startsWith('local_')) { 
        window.firebaseAtualizar(window.redeEditandoMapa.id, lat, lng); 
    } else if (!window.redeEditandoMapa.id.toString().startsWith('local_')) {
        let filaUpdate = JSON.parse(localStorage.getItem('wifi_pro_updates_v1') || '{}');
        if(!filaUpdate[window.redeEditandoMapa.id]) filaUpdate[window.redeEditandoMapa.id] = {};
        filaUpdate[window.redeEditandoMapa.id].lat = lat;
        filaUpdate[window.redeEditandoMapa.id].lng = lng;
        localStorage.setItem('wifi_pro_updates_v1', JSON.stringify(filaUpdate));
    }

    const index = window.redesEmMemoria.findIndex(r => r.id === window.redeEditandoMapa.id);
    if (index !== -1) { window.redesEmMemoria[index].lat = lat; window.redesEmMemoria[index].lng = lng; }
    window.atualizarBackupLocal(window.redesEmMemoria);
    if (!window.mostrandoApenasProximas) window.renderizarInterface(window.redesEmMemoria);
    
    window.atualizarContador(navigator.onLine ? 'sincronizando' : 'offline');
    window.mostrarToast("Coordenadas salvas!"); 
    window.fecharMapa();
};

window.atualizarGeoRedeExistente = async function() {
    if (!window.redeDuplicadaAtual || !window.redeDuplicadaAtual.id) return;
    const rede = window.redeDuplicadaAtual;
    const btn = document.getElementById('btnAdicionarGeo');
    const textoOriginal = btn.innerText;

    const coordManual = document.getElementById('novaCoordenadaManual').value.trim();
    let novaLat = null, novaLng = null;

    if (coordManual) {
        const partes = coordManual.split(',');
        if (partes.length >= 2) {
            const l = parseFloat(partes[0].trim());
            const g = parseFloat(partes[1].trim());
            if (!isNaN(l) && !isNaN(g)) {
                novaLat = l; novaLng = g;
            } else {
                window.mostrarToast("Coordenadas manuais inválidas."); return;
            }
        } else {
            window.mostrarToast("Formato de GPS inválido. Use: Lat, Lng"); return;
        }
    } else {
        btn.innerText = "📍 Obtendo GPS..."; btn.disabled = true;
        try {
            const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { 
                enableHighAccuracy: true, timeout: 10000, maximumAge: 0 
            }));
            novaLat = pos.coords.latitude; novaLng = pos.coords.longitude;
        } catch (error) { 
            window.mostrarToast("Erro de GPS. Cole coordenadas manuais."); 
            btn.innerText = textoOriginal; btn.disabled = false; 
            return; 
        }
    }

    if (rede.lat && !coordManual) {
        const dist = window.calcularDistancia(novaLat, novaLng, rede.lat, rede.lng);
        if (dist <= 30) { alert(`Distância de ${Math.round(dist)}m. GPS já está preciso.`); window.fecharModal(); return; }
    }

    if (navigator.onLine && typeof window.firebaseAtualizar === 'function' && !rede.id.toString().startsWith('local_')) {
        window.firebaseAtualizar(rede.id, novaLat, novaLng);
    } else if (!rede.id.toString().startsWith('local_')) {
        let filaUpdate = JSON.parse(localStorage.getItem('wifi_pro_updates_v1') || '{}');
        if(!filaUpdate[rede.id]) filaUpdate[rede.id] = {};
        filaUpdate[rede.id].lat = novaLat;
        filaUpdate[rede.id].lng = novaLng;
        localStorage.setItem('wifi_pro_updates_v1', JSON.stringify(filaUpdate));
    }
    
    const index = window.redesEmMemoria.findIndex(r => r.id === rede.id);
    if(index !== -1) { window.redesEmMemoria[index].lat = novaLat; window.redesEmMemoria[index].lng = novaLng; }
    
    window.atualizarBackupLocal(window.redesEmMemoria);
    if (!window.mostrandoApenasProximas) window.renderizarInterface(window.redesEmMemoria);

    window.atualizarContador(navigator.onLine ? 'sincronizando' : 'offline');
    window.mostrarToast("GPS Atualizado!"); 
    btn.innerText = textoOriginal; btn.disabled = false;
    window.fecharModal();
};

window.pararRadar = function(veioDoCopy = false) {
    window.mostrandoApenasProximas = false;
    if (window.radarWatchId) { navigator.geolocation.clearWatch(window.radarWatchId); window.radarWatchId = null; }
    const btn = document.getElementById('btnRadar');
    btn.innerText = "📍 Radar";
    btn.style.background = "";
    btn.style.color = "";
    btn.style.border = "";
    window.renderizarInterface(window.redesEmMemoria);
    if(!veioDoCopy) window.mostrarToast("Radar parado.");
};

window.buscarSenhasPorPerto = function() {
    if (window.mostrandoApenasProximas) return window.pararRadar();
    window.vibrar(); 
    const btn = document.getElementById('btnRadar');
    btn.innerText = "❌ Parar";
    btn.style.background = "var(--danger)";
    btn.style.color = "white";
    btn.style.border = "none";
    
    window.radarWatchId = navigator.geolocation.watchPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        const proximas = window.redesEmMemoria.map(r => {
            if(!r.lat) return {...r, d: 999999};
            const d = window.calcularDistancia(latitude, longitude, r.lat, r.lng);
            return {...r, d};
        }).filter(r => r.d <= 150).sort((a,b) => a.d - b.d);
        
        window.mostrandoApenasProximas = true;
        window.renderizarInterface(proximas, true);
    }, () => window.pararRadar(), {enableHighAccuracy: true});
};