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
    clearTimeout(window.mapGlobalRenderTimer);
    window.mapGlobalEmMovimento = false;
    window.mapGlobalRenderPendente = false;
    window.mapGlobalPopupAberto = false;
    if (window.marcadorUsuarioGlobal && window.mapGlobal) {
        window.mapGlobal.removeLayer(window.marcadorUsuarioGlobal);
        window.marcadorUsuarioGlobal = null;
    }
    window.mapGlobalRedesCache = [];
    window.mapGlobalMarkersIndice = new Map();
};

// =========================================================
// 2. CONFIGURAÇÕES E PARSING
// =========================================================
window.map = null;
window.mapMarker = null;
window.mapGlobal = null; 
window.mapGlobalMarkersLayer = null;
window.mapGlobalRedesCache = [];
window.mapGlobalBoundsAplicado = false;
window.mapGlobalEmMovimento = false;
window.mapGlobalRenderPendente = false;
window.mapGlobalRenderTimer = null;
window.mapGlobalPopupAberto = false;
window.mapGlobalMarkersIndice = new Map();
window.marcadorUsuarioGlobal = null;
window.circuloUsuarioGlobal = null;
window.TILE_OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
window.TILE_SATELLITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
window.ATTR_OSM = '&copy; OpenStreetMap contributors';
window.ATTR_SATELLITE = 'Tiles &copy; Esri';

window.parseCoord = function(val) {
    if (val === null || val === undefined || val === '') return NaN;
    const numero = Number.parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(numero) ? numero : NaN;
};

window.validarParCoordenadasMapa = function(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

window.parseParCoordenadasMapa = function(value) {
    if (Array.isArray(value) && value.length >= 2) {
        const lat = window.parseCoord(value[0]);
        const lng = window.parseCoord(value[1]);
        return window.validarParCoordenadasMapa(lat, lng) ? { lat, lng } : null;
    }

    if (value && typeof value === 'object') {
        const latKeys = ['lat', 'latitude', 'gpsLat', 'geoLat', 'mapLat', 'coordLat'];
        const lngKeys = ['lng', 'lon', 'long', 'longitude', 'gpsLng', 'gpsLon', 'geoLng', 'mapLng', 'coordLng'];
        for (const latKey of latKeys) {
            for (const lngKey of lngKeys) {
                const lat = window.parseCoord(value[latKey]);
                const lng = window.parseCoord(value[lngKey]);
                if (window.validarParCoordenadasMapa(lat, lng)) return { lat, lng };
            }
        }
    }

    if (typeof value === 'string') {
        const numeros = value.match(/-?\d+(?:[.,]\d+)?/g) || [];
        for (let i = 0; i < numeros.length - 1; i++) {
            const lat = window.parseCoord(numeros[i]);
            const lng = window.parseCoord(numeros[i + 1]);
            if (window.validarParCoordenadasMapa(lat, lng)) return { lat, lng };
        }
    }

    return null;
};

window.obterGeoLegadoMapa = function() {
    if (window.geoLegadoMapaCache !== undefined) return window.geoLegadoMapaCache;
    const keys = [window.DB_GEO_KEY || 'wifi_pro_db_geo_v1', 'wifi_pro_db_geo_v1'];
    for (const key of [...new Set(keys)]) {
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                window.geoLegadoMapaCache = JSON.parse(raw);
                return window.geoLegadoMapaCache;
            }
        } catch (error) {}
    }
    window.geoLegadoMapaCache = null;
    return null;
};

window.obterCoordenadasLegadasRedeMapa = function(rede) {
    const geo = window.obterGeoLegadoMapa();
    if (!geo || !rede) return null;

    const normalizar = (value) => String(value || '').trim().toLowerCase();
    const chavesRede = [
        rede.id,
        rede.logicalId,
        rede.ssid,
        normalizar(rede.ssid),
        `${normalizar(rede.ssid)}|${normalizar(rede.senha)}`,
        `${normalizar(rede.ssid)}|${normalizar(rede.bssid)}`
    ].filter(Boolean);

    const testarValor = (value) => {
        const direto = window.parseParCoordenadasMapa(value);
        if (direto) return direto;
        if (value && typeof value === 'object') {
            const campos = ['coordenadas', 'coords', 'coord', 'gps', 'geo', 'localizacao', 'location'];
            for (const campo of campos) {
                const coords = window.parseParCoordenadasMapa(value[campo]);
                if (coords) return coords;
            }
        }
        return null;
    };

    if (Array.isArray(geo)) {
        for (const item of geo) {
            if (!item) continue;
            const combina = chavesRede.includes(item.id) || chavesRede.includes(item.redeId) || chavesRede.includes(item.logicalId) || chavesRede.includes(item.ssid) || chavesRede.includes(normalizar(item.ssid));
            if (combina) {
                const coords = testarValor(item);
                if (coords) return coords;
            }
        }
        return null;
    }

    if (typeof geo === 'object') {
        for (const chave of chavesRede) {
            const coords = testarValor(geo[chave]);
            if (coords) return coords;
        }

        for (const [chave, value] of Object.entries(geo)) {
            if (chavesRede.includes(chave) || chavesRede.includes(normalizar(chave))) {
                const coords = testarValor(value);
                if (coords) return coords;
            }
            if (value && typeof value === 'object') {
                const combina = chavesRede.includes(value.id) || chavesRede.includes(value.redeId) || chavesRede.includes(value.logicalId) || chavesRede.includes(value.ssid) || chavesRede.includes(normalizar(value.ssid));
                if (combina) {
                    const coords = testarValor(value);
                    if (coords) return coords;
                }
            }
        }
    }

    return null;
};

window.removerCoordenadasLegadasRedeMapa = function(rede) {
    if (!rede) return false;

    const key = window.DB_GEO_KEY || 'wifi_pro_db_geo_v1';
    let geo = null;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        geo = JSON.parse(raw);
    } catch (error) {
        return false;
    }

    const normalizar = (value) => String(value || '').trim().toLowerCase();
    const chavesRede = [
        rede.id,
        rede.logicalId,
        rede.ssid,
        normalizar(rede.ssid),
        `${normalizar(rede.ssid)}|${normalizar(rede.senha)}`,
        `${normalizar(rede.ssid)}|${normalizar(rede.bssid)}`
    ].filter(Boolean);

    const combina = (value) => {
        if (!value) return false;
        return chavesRede.includes(value.id)
            || chavesRede.includes(value.redeId)
            || chavesRede.includes(value.logicalId)
            || chavesRede.includes(value.ssid)
            || chavesRede.includes(normalizar(value.ssid));
    };

    let mudou = false;
    if (Array.isArray(geo)) {
        const filtrado = geo.filter(item => !combina(item));
        mudou = filtrado.length !== geo.length;
        geo = filtrado;
    } else if (geo && typeof geo === 'object') {
        Object.keys(geo).forEach((chave) => {
            if (chavesRede.includes(chave) || chavesRede.includes(normalizar(chave)) || combina(geo[chave])) {
                delete geo[chave];
                mudou = true;
            }
        });
    }

    if (!mudou) return false;
    try {
        localStorage.setItem(key, JSON.stringify(geo));
        window.geoLegadoMapaCache = geo;
    } catch (error) {}
    return true;
};

window.obterCoordenadasRedeMapa = function(rede) {
    if (!rede) return null;

    const direto = window.parseParCoordenadasMapa(rede);
    if (direto) return direto;

    const campos = ['coordenadas', 'coords', 'coord', 'gps', 'geo', 'localizacao', 'location'];
    for (const campo of campos) {
        const coords = window.parseParCoordenadasMapa(rede[campo]);
        if (coords) return coords;
    }

    const legado = window.obterCoordenadasLegadasRedeMapa(rede);
    if (legado) {
        rede.lat = legado.lat;
        rede.lng = legado.lng;
        return legado;
    }

    return null;
};

window.corrigirIconesLeaflet = function() {
    if (typeof L !== 'undefined' && L.Icon && L.Icon.Default) {
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: './js/libs/images/marker-icon-2x.png',
            iconUrl: './js/libs/images/marker-icon.png',
            shadowUrl: null,
            shadowRetinaUrl: null,
            shadowSize: [0, 0],
            shadowAnchor: [0, 0],
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

window.adicionarCamadasBaseMapa = function(mapInstance) {
    const padrao = L.tileLayer(window.TILE_OSM, {
        maxZoom: 19,
        attribution: window.ATTR_OSM,
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: 1
    }).addTo(mapInstance);

    if (!navigator.onLine) {
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast('Offline: use o mapa padrao. Satelite precisa de internet.');
        }
        return { padrao };
    }

    const satelite = L.tileLayer(window.TILE_SATELLITE, {
        maxZoom: 19,
        attribution: window.ATTR_SATELLITE,
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: 1
    });

    L.control.layers({
        'Padrao': padrao,
        'Satelite': satelite
    }, null, {
        collapsed: false
    }).addTo(mapInstance);

    return { padrao, satelite };
};

window.criarPopupRedeMapa = function(r) {
    const container = document.createElement('div');
    container.style.textAlign = 'center';
    container.style.minWidth = '140px';
    container.style.padding = '5px';

    const ssid = document.createElement('b');
    ssid.style.fontSize = '15px';
    ssid.style.color = 'var(--primary)';
    ssid.style.display = 'block';
    ssid.style.marginBottom = '5px';
    ssid.textContent = r.ssid;

    const senha = document.createElement('span');
    senha.style.fontSize = '13px';
    senha.style.color = '#555';
    senha.style.display = 'block';
    senha.style.marginBottom = '12px';
    senha.style.background = '#f0f0f0';
    senha.style.padding = '4px';
    senha.style.borderRadius = '4px';
    senha.textContent = r.senha;

    const copiar = document.createElement('button');
    copiar.textContent = 'Copiar Senha';
    copiar.style.background = 'var(--success)';
    copiar.style.color = 'white';
    copiar.style.border = 'none';
    copiar.style.padding = '8px 12px';
    copiar.style.borderRadius = '6px';
    copiar.style.fontWeight = 'bold';
    copiar.style.cursor = 'pointer';
    copiar.style.width = '100%';
    copiar.style.marginBottom = '8px';
    copiar.addEventListener('click', () => window.copy(r.senha));

    const adicionar = document.createElement('button');
    adicionar.textContent = 'Adicionar ao celular';
    adicionar.style.background = '#10b981';
    adicionar.style.color = 'white';
    adicionar.style.border = 'none';
    adicionar.style.padding = '8px 12px';
    adicionar.style.borderRadius = '6px';
    adicionar.style.fontWeight = 'bold';
    adicionar.style.cursor = 'pointer';
    adicionar.style.width = '100%';
    adicionar.style.marginBottom = '8px';
    adicionar.addEventListener('click', () => {
        if (typeof window.adicionarRedeNoCelular !== 'function') {
            if (typeof window.mostrarToast === 'function') window.mostrarToast('Funcao nativa disponivel apenas no APK.');
            return;
        }

        window.adicionarRedeNoCelular(r, {
            ssid: r.ssid,
            bssid: r.bssid || '',
            capabilities: r.senha ? '[WPA2-PSK]' : ''
        }, adicionar);
    });

    const editar = document.createElement('button');
    editar.textContent = 'Editar Local';
    editar.style.background = 'var(--geo)';
    editar.style.color = 'white';
    editar.style.border = 'none';
    editar.style.padding = '8px 12px';
    editar.style.borderRadius = '6px';
    editar.style.fontWeight = 'bold';
    editar.style.cursor = 'pointer';
    editar.style.width = '100%';
    editar.addEventListener('click', () => {
        window.fecharMapaGlobal();
        window.abrirMapaParaRede(r.id, r.ssid, r.lat, r.lng);
    });

    container.appendChild(ssid);
    container.appendChild(senha);
    container.appendChild(copiar);
    if (typeof window.isNativeRuntime === 'function' && window.isNativeRuntime()) {
        container.appendChild(adicionar);
    }
    container.appendChild(editar);
    return container;
};

window.obterRedesComCoordenadasMapa = function() {
    return (window.redesEmMemoria || [])
        .map((r) => {
            const coords = window.obterCoordenadasRedeMapa(r);
            if (!coords) return null;
            r.lat = coords.lat;
            r.lng = coords.lng;
            return { rede: r, lat: coords.lat, lng: coords.lng };
        })
        .filter(Boolean);
};

window.mesclarCoordenadasMapa = function(listaLocal) {
    if (!Array.isArray(listaLocal) || !listaLocal.length) return false;
    if (!Array.isArray(window.redesEmMemoria)) window.redesEmMemoria = [];

    const normalizar = (value) => String(value || '').trim().toLowerCase();
    const criarChaves = (rede) => [
        rede && rede.id,
        rede && rede.logicalId,
        rede && `${normalizar(rede.ssid)}|${normalizar(rede.senha)}`,
        rede && `${normalizar(rede.ssid)}|${normalizar(rede.bssid)}`,
        rede && normalizar(rede.ssid)
    ].filter(Boolean);

    if (!window.redesEmMemoria.length) {
        window.redesEmMemoria = listaLocal.map(rede => ({ ...rede }));
        return true;
    }

    const indice = new Map();
    window.redesEmMemoria.forEach((rede) => {
        criarChaves(rede).forEach(chave => {
            if (!indice.has(chave)) indice.set(chave, rede);
        });
    });

    let mudou = false;
    listaLocal.forEach((local) => {
        const coordsLocal = window.obterCoordenadasRedeMapa(local);
        const alvo = criarChaves(local).map(chave => indice.get(chave)).find(Boolean);
        if (!alvo) return;
        const coordsAlvo = window.obterCoordenadasRedeMapa(alvo);
        if (coordsLocal && !coordsAlvo) {
            alvo.lat = coordsLocal.lat;
            alvo.lng = coordsLocal.lng;
            mudou = true;
        }
        if (!alvo.bssid && local.bssid) {
            alvo.bssid = local.bssid;
            mudou = true;
        }
    });

    return mudou;
};

window.prepararRedesMapaGlobal = async function() {
    window.geoLegadoMapaCache = undefined;
    if (!Array.isArray(window.redesEmMemoria)) window.redesEmMemoria = [];

    let mudou = false;
    if (typeof window.lerDoIndexedDB === 'function') {
        try {
            const pontosAtuais = window.obterRedesComCoordenadasMapa();
            if (!window.redesEmMemoria.length || !pontosAtuais.length) {
                const dadosLocal = await window.lerDoIndexedDB();
                mudou = window.mesclarCoordenadasMapa(dadosLocal) || mudou;
            }
        } catch (error) {
            console.warn('Mapa: falha ao ler banco local antes de abrir.', error);
        }
    }

    const pontos = window.obterRedesComCoordenadasMapa();
    if (mudou && pontos.length && typeof window.atualizarBackupLocal === 'function') {
        window.atualizarBackupLocal(window.redesEmMemoria);
    }
    return pontos;
};

window.pausarMarcadoresMapaGlobal = function() {
    // Mantem os pins visiveis durante o movimento; a otimizacao acontece no fim do arraste.
};

window.retornarMarcadoresMapaGlobal = function() {
    if (!window.mapGlobal || !window.mapGlobalMarkersLayer) return;
    if (!window.mapGlobal.hasLayer(window.mapGlobalMarkersLayer)) {
        window.mapGlobalMarkersLayer.addTo(window.mapGlobal);
    }
};

window.obterChaveMarcadorMapaGlobal = function(item) {
    const rede = item && item.rede ? item.rede : {};
    const id = rede.id || rede.logicalId || `${rede.ssid || ''}|${rede.senha || ''}|${rede.bssid || ''}`;
    return `${id}|${Number(item.lat).toFixed(6)}|${Number(item.lng).toFixed(6)}`;
};

window.obterPontosVisiveisMapaGlobal = function(redesComGps) {
    if (!window.mapGlobal || !Array.isArray(redesComGps)) return [];
    try {
        const bounds = window.mapGlobal.getBounds().pad(0.35);
        return redesComGps.filter(({ lat, lng }) => bounds.contains([lat, lng]));
    } catch (error) {
        return redesComGps;
    }
};

window.agendarRenderizacaoMapaGlobal = function(ajustarBounds = false) {
    if (!window.mapGlobal || typeof window.renderizarMarcadoresMapaGlobal !== 'function') return;
    if (window.mapGlobalEmMovimento || window.mapGlobalPopupAberto) {
        window.mapGlobalRenderPendente = true;
        return;
    }

    clearTimeout(window.mapGlobalRenderTimer);
    window.mapGlobalRenderTimer = setTimeout(() => {
        if (!window.mapGlobal || window.mapGlobalEmMovimento || window.mapGlobalPopupAberto) {
            window.mapGlobalRenderPendente = true;
            return;
        }
        window.renderizarMarcadoresMapaGlobal(ajustarBounds);
    }, 90);
};

window.configurarAtualizacaoMapaGlobalQuandoParado = function(mapInstance) {
    if (!mapInstance || mapInstance._wifiIdleUpdateConfigured) return;
    mapInstance._wifiIdleUpdateConfigured = true;

    mapInstance.on('movestart zoomstart', () => {
        window.mapGlobalEmMovimento = true;
    });

    mapInstance.on('moveend zoomend', () => {
        clearTimeout(window.mapGlobalRenderTimer);
        window.mapGlobalRenderTimer = setTimeout(() => {
            window.mapGlobalEmMovimento = false;
            window.retornarMarcadoresMapaGlobal();
            if (window.mapGlobal) window.mapGlobal.invalidateSize(false);
            if (window.mapGlobalPopupAberto) {
                window.mapGlobalRenderPendente = true;
                return;
            }
            window.mapGlobalRenderPendente = false;
            window.renderizarMarcadoresMapaGlobal(false);
        }, 120);
    });

    mapInstance.on('popupopen', () => {
        window.mapGlobalPopupAberto = true;
    });

    mapInstance.on('popupclose', () => {
        window.mapGlobalPopupAberto = false;
        if (window.mapGlobalRenderPendente && !window.mapGlobalEmMovimento) {
            window.mapGlobalRenderPendente = false;
            window.agendarRenderizacaoMapaGlobal(false);
        }
    });
};

window.renderizarMarcadoresMapaGlobal = function(ajustarBounds = true) {
    if (!window.mapGlobal || typeof L === 'undefined') return 0;
    if ((window.mapGlobalEmMovimento || window.mapGlobalPopupAberto) && !ajustarBounds) {
        window.mapGlobalRenderPendente = true;
        return window.mapGlobalMarkersLayer && typeof window.mapGlobalMarkersLayer.getLayers === 'function'
            ? window.mapGlobalMarkersLayer.getLayers().length
            : 0;
    }

    if (!window.mapGlobalMarkersLayer) {
        window.mapGlobalMarkersLayer = L.layerGroup().addTo(window.mapGlobal);
    }
    if (!(window.mapGlobalMarkersIndice instanceof Map)) {
        window.mapGlobalMarkersIndice = new Map();
    }

    const redesComGps = Array.isArray(window.mapGlobalRedesCache) && window.mapGlobalRedesCache.length
        ? window.mapGlobalRedesCache
        : window.obterRedesComCoordenadasMapa();

    if (ajustarBounds && redesComGps.length > 0) {
        const todosPontos = redesComGps.map(({ lat, lng }) => [lat, lng]);
        if (todosPontos.length === 1) {
            window.mapGlobal.setView(todosPontos[0], 17, { animate: false });
        } else {
            window.mapGlobal.fitBounds(L.latLngBounds(todosPontos), {
                padding: [50, 50],
                maxZoom: 18,
                animate: false
            });
        }
        window.mapGlobalBoundsAplicado = true;
    }

    const redesVisiveis = window.obterPontosVisiveisMapaGlobal(redesComGps);
    const chavesVisiveis = new Set();

    const adicionarPin = ({ rede, lat, lng }) => {
        const chave = window.obterChaveMarcadorMapaGlobal({ rede, lat, lng });
        chavesVisiveis.add(chave);

        let marker = window.mapGlobalMarkersIndice.get(chave);
        if (!marker) {
            marker = L.marker([lat, lng], {
                keyboard: false,
                riseOnHover: false
            }).addTo(window.mapGlobalMarkersLayer);
            marker.on('click', () => {
                marker.bindPopup(window.criarPopupRedeMapa(marker._wifiRede)).openPopup();
            });
            window.mapGlobalMarkersIndice.set(chave, marker);
        } else if (!window.mapGlobalMarkersLayer.hasLayer(marker)) {
            marker.addTo(window.mapGlobalMarkersLayer);
        }

        marker._wifiRede = rede;
        marker.setLatLng([lat, lng]);
    };

    redesVisiveis.forEach(adicionarPin);

    window.mapGlobalMarkersIndice.forEach((marker, chave) => {
        if (chavesVisiveis.has(chave)) return;
        if (typeof marker.isPopupOpen === 'function' && marker.isPopupOpen()) return;
        window.mapGlobalMarkersLayer.removeLayer(marker);
        window.mapGlobalMarkersIndice.delete(chave);
    });

    window.mapGlobal.invalidateSize(false);
    return redesVisiveis.length;
};

// =========================================================
// 3. MOTOR DO MAPA GERAL (LEGADO INATIVO)
// =========================================================
window.abrirMapaGlobalLegadoInativo = function() {
    if (typeof window.fecharMenuLateral === 'function') window.fecharMenuLateral();
    if (typeof L === 'undefined') { alert("Erro: Leaflet não carregado."); return; }
    window.corrigirIconesLeaflet();

    const modalGlobal = document.getElementById('modalMapaGlobal');
    const containerGlobal = document.getElementById('mapa-global-container');
    if (!modalGlobal || !containerGlobal) return;

    const totalGpsGlobal = window.obterRedesComCoordenadasMapa().length;
    if (!totalGpsGlobal && typeof window.mostrarToast === 'function') {
        window.mostrarToast("Nenhuma rede com GPS salvo ainda.");
    }

    modalGlobal.style.display = 'flex';
    if (window.mapGlobal) {
        window.mapGlobal.remove();
    }
    window.mapGlobal = null;
    window.mapGlobalMarkersLayer = null;
    window.mapGlobalBoundsAplicado = false;
    window.mapGlobalEmMovimento = false;
    window.mapGlobalRenderPendente = false;
    window.mapGlobalPopupAberto = false;
    window.mapGlobalMarkersIndice = new Map();
    clearTimeout(window.mapGlobalRenderTimer);
    containerGlobal.innerHTML = '';
    delete containerGlobal._leaflet_id;

    const inicializarMapaGlobal = () => {
        const rect = containerGlobal.getBoundingClientRect();
        if (rect.width < 80 || rect.height < 80) {
            setTimeout(inicializarMapaGlobal, 80);
            return;
        }

        window.mapGlobal = L.map(containerGlobal).setView([-15, -50], 4);
        window.adicionarCamadasBaseMapa(window.mapGlobal);
        window.mapGlobalMarkersLayer = L.layerGroup().addTo(window.mapGlobal);
        window.configurarAtualizacaoMapaGlobalQuandoParado(window.mapGlobal);

        const redesenhar = (ajustarBounds = true) => {
            if (!window.mapGlobal) return;
            window.mapGlobal.invalidateSize(true);
            window.renderizarMarcadoresMapaGlobal(ajustarBounds);
        };

        window.requestAnimationFrame(() => {
            setTimeout(() => redesenhar(true), 60);
            setTimeout(() => redesenhar(!window.mapGlobalBoundsAplicado), 350);
            setTimeout(() => redesenhar(!window.mapGlobalBoundsAplicado), 900);
        });
    };

    window.requestAnimationFrame(inicializarMapaGlobal);
    return;
    
    // VERIFICAÇÃO: Se não houver redes com GPS, avisar o usuário
    const temGps = window.redesEmMemoria.some(r => !isNaN(window.parseCoord(r.lat)));
    if (!temGps) {
        window.mostrarToast("Nenhuma rede com GPS salvo ainda.");
    }

    document.getElementById('modalMapaGlobal').style.display = 'flex';
    if (window.mapGlobal) { window.mapGlobal.remove(); }

    setTimeout(() => {
        window.mapGlobal = L.map('mapa-global-container').setView([-15, -50], 4); 
        window.adicionarCamadasBaseMapa(window.mapGlobal);
        
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
                    <button onclick="window.copy('${r.senha}')" style="background: var(--success); color: white; border: none; padding: 8px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; margin-bottom: 8px;">📋 Copiar Senha</button>
                    <button onclick="window.fecharMapaGlobal(); window.abrirMapaParaRede('${r.id}', '${r.ssid}', '${r.lat}', '${r.lng}')" style="background: var(--geo); color: white; border: none; padding: 8px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%;">🗺️ Editar Local</button>
                </div>`;
            
            marker.bindPopup(window.criarPopupRedeMapa(r));
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

// Abre o mapa usado pelo app: carrega todos os pins antes do enquadramento.
window.abrirMapaGlobal = async function() {
    if (typeof window.fecharMenuLateral === 'function') window.fecharMenuLateral();
    if (typeof L === 'undefined') {
        alert("Erro: Leaflet nao carregado.");
        return;
    }
    window.corrigirIconesLeaflet();

    const modalGlobal = document.getElementById('modalMapaGlobal');
    const containerGlobal = document.getElementById('mapa-global-container');
    if (!modalGlobal || !containerGlobal) return;

    modalGlobal.style.display = 'flex';
    if (window.mapGlobal) {
        window.mapGlobal.remove();
    }
    window.mapGlobal = null;
    window.mapGlobalMarkersLayer = null;
    window.mapGlobalBoundsAplicado = false;
    window.mapGlobalEmMovimento = false;
    window.mapGlobalRenderPendente = false;
    window.mapGlobalPopupAberto = false;
    window.mapGlobalMarkersIndice = new Map();
    clearTimeout(window.mapGlobalRenderTimer);
    containerGlobal.innerHTML = '<div class="map-loading">Carregando pontos...</div>';
    delete containerGlobal._leaflet_id;

    try {
        window.mapGlobalRedesCache = await window.prepararRedesMapaGlobal();
    } catch (error) {
        console.warn('Mapa: falha ao preparar pontos.', error);
        window.mapGlobalRedesCache = window.obterRedesComCoordenadasMapa();
    }

    const totalGpsGlobal = window.mapGlobalRedesCache.length;
    if (!totalGpsGlobal && typeof window.mostrarToast === 'function') {
        window.mostrarToast("Nenhuma rede com GPS salvo ainda.");
    }

    const inicializarMapaGlobal = () => {
        const rect = containerGlobal.getBoundingClientRect();
        if (rect.width < 80 || rect.height < 80) {
            setTimeout(inicializarMapaGlobal, 80);
            return;
        }

        containerGlobal.innerHTML = '';
        delete containerGlobal._leaflet_id;

        window.mapGlobal = L.map(containerGlobal).setView([-15, -50], 4);
        window.adicionarCamadasBaseMapa(window.mapGlobal);
        window.mapGlobalMarkersLayer = L.layerGroup().addTo(window.mapGlobal);
        window.configurarAtualizacaoMapaGlobalQuandoParado(window.mapGlobal);

        const redesenhar = (ajustarBounds = true) => {
            if (!window.mapGlobal) return;
            window.mapGlobal.invalidateSize(false);
            window.renderizarMarcadoresMapaGlobal(ajustarBounds);
        };

        window.requestAnimationFrame(() => {
            redesenhar(true);
            setTimeout(() => redesenhar(!window.mapGlobalBoundsAplicado), 120);
            setTimeout(() => {
                if (window.mapGlobal) window.mapGlobal.invalidateSize(false);
            }, 450);
        });
    };

    window.requestAnimationFrame(inicializarMapaGlobal);
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
        window.adicionarCamadasBaseMapa(window.map);
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
    const id = window.redeEditandoMapa.id;
    const index = window.redesEmMemoria.findIndex(r => r.id === id);
    const redeAtualizada = index !== -1 ? window.redesEmMemoria[index] : window.redeEditandoMapa;
    if (index !== -1) { 
        window.redesEmMemoria[index].lat = latF; 
        window.redesEmMemoria[index].lng = lngF; 
    }

    if (navigator.onLine && typeof window.firebaseAtualizarObjeto === 'function' && !id.toString().startsWith('local_')) {
        window.firebaseAtualizarObjeto(id, { lat: latF, lng: lngF });
    } else if (!id.toString().startsWith('local_')) {
        let filaUpdate = JSON.parse(localStorage.getItem('wifi_pro_updates_v1') || '{}');
        if (!filaUpdate[id]) filaUpdate[id] = {};
        filaUpdate[id].lat = latF;
        filaUpdate[id].lng = lngF;
        localStorage.setItem('wifi_pro_updates_v1', JSON.stringify(filaUpdate));
    }

    window.atualizarBackupLocal(window.redesEmMemoria);
    if (typeof window.registrarOperacaoBanco === 'function') {
        window.registrarOperacaoBanco('localizacao_atualizada', `Localizacao atualizada pelo mapa: ${redeAtualizada.ssid}`, {
            ...redeAtualizada,
            lat: latF,
            lng: lngF
        }, {
            lat: latF,
            lng: lngF,
            origem: 'mapa'
        });
    }
    window.renderizarInterface(window.redesEmMemoria);
    window.fecharMapa();
    window.mostrarToast("Salvo!");
};

window.atualizarBotoesRadar = function(ativo) {
    document.querySelectorAll('[data-radar-button]').forEach((button) => {
        const icon = ativo ? '&times;' : '&#8982;';
        const label = ativo ? 'Parar' : 'Radar';
        button.classList.toggle('radar-active', !!ativo);
        if (button.classList.contains('bottom-btn')) {
            button.innerHTML = `<span class="nav-icon">${icon}</span><span class="nav-label">${label}</span><small>${ativo ? 'GPS ativo' : 'GPS'}</small>`;
        } else if (button.id === 'drawerWifiAction') {
            button.innerHTML = `<span class="drawer-icon">${icon}</span><span>${label}</span>`;
        } else {
            button.innerHTML = `${icon} ${label}`;
        }
    });
    document.querySelectorAll('[data-radar-stop-button]').forEach((button) => {
        button.classList.toggle('show', !!ativo);
        button.textContent = ativo ? 'Parar Radar' : 'Radar parado';
    });
};

window.buscarSenhasPorPerto = function() {
    if (window.mostrandoApenasProximas) {
        window.mostrandoApenasProximas = false;
        if (window.radarWatchId) navigator.geolocation.clearWatch(window.radarWatchId);
        window.radarWatchId = null;
        window.atualizarBotoesRadar(false);
        window.renderizarInterface(window.redesEmMemoria);
        return;
    }
    if (!navigator.geolocation || typeof navigator.geolocation.watchPosition !== 'function') {
        window.mostrandoApenasProximas = false;
        window.radarWatchId = null;
        window.atualizarBotoesRadar(false);
        if (typeof window.mostrarToast === 'function') window.mostrarToast('GPS indisponivel neste navegador.');
        return;
    }
    window.vibrar();
    if (typeof window.fecharMapaGlobal === 'function') window.fecharMapaGlobal();
    if (typeof window.mostrarTelaApp === 'function') window.mostrarTelaApp('saved');
    window.atualizarBotoesRadar(true);
    try {
        window.radarWatchId = navigator.geolocation.watchPosition((pos) => {
            const { latitude, longitude } = pos.coords;
            const redes = Array.isArray(window.redesEmMemoria) ? window.redesEmMemoria : [];
            const proximas = redes.map(r => ({
                ...r,
                __coordsMapa: window.obterCoordenadasRedeMapa(r)
            })).map(r => ({
                ...r,
                d: r.__coordsMapa ? window.calcularDistancia(latitude, longitude, r.__coordsMapa.lat, r.__coordsMapa.lng) : Infinity
            })).filter(r => r.d <= 150).sort((a,b) => a.d - b.d);
            window.mostrandoApenasProximas = true;
            window.renderizarInterface(proximas, true);
        }, () => {
            window.mostrandoApenasProximas = false;
            if (window.radarWatchId) navigator.geolocation.clearWatch(window.radarWatchId);
            window.radarWatchId = null;
            window.atualizarBotoesRadar(false);
            if (typeof window.mostrarToast === 'function') window.mostrarToast('Permita a localizacao para usar o Radar.');
        }, {enableHighAccuracy: true});
    } catch (error) {
        window.mostrandoApenasProximas = false;
        window.radarWatchId = null;
        window.atualizarBotoesRadar(false);
        if (typeof window.mostrarToast === 'function') window.mostrarToast('Nao foi possivel iniciar o Radar.');
    }
};

console.log("✅ Map Engine Finalizado com Botões Restaurados!");
