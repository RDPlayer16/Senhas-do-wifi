// VARIÁVEIS GLOBAIS DE ESTADO
window.DB_KEY = 'wifi_pro_db_v9';
window.DB_GEO_KEY = 'wifi_pro_db_geo_v1';
window.redesEmMemoria = [];
window.mostrandoApenasProximas = false;
window.radarWatchId = null;
window.redeDuplicadaAtual = null;
window.redePendenteExclusao = null;
window.deleteTimeout = null;
window.redeEditandoAtual = null;
window.novaRedeBssidSugerida = null;
window.novaRedeWifiSugerida = null;
window.novaRedeConectarAposCadastro = false;
window.scanTarget = 'novo'; 
window.appCurrentView = localStorage.getItem('wifi_pro_view_screen_v1') || 'home';
window.appCurrentFilter = localStorage.getItem('wifi_pro_filter_v1') || 'all';
if (!['all', 'recent'].includes(window.appCurrentFilter)) window.appCurrentFilter = 'all';
window.appThemeMode = localStorage.getItem('wifi_pro_theme_v1') || 'dark';
window.appDeveloperMode = localStorage.getItem('wifi_pro_developer_v1') === 'true';

window.isNativeRuntime = function() {
    return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
};

window.criarMetadadosCadastroRede = function(timestamp = Date.now()) {
    const createdAt = Number(timestamp) || Date.now();
    const date = new Date(createdAt);
    return {
        createdAt,
        createdAtIso: date.toISOString(),
        createdAtLocal: date.toLocaleString('pt-BR')
    };
};

window.vibrar = function() {
    if (navigator.vibrate) navigator.vibrate(40);
};

// UI E COMPORTAMENTOS
window.modoCompacto = localStorage.getItem('wifi_pro_view_v1') === 'true';

window.toggleViewMode = function() {
    window.vibrar();
    window.modoCompacto = !window.modoCompacto;
    localStorage.setItem('wifi_pro_view_v1', window.modoCompacto);
    window.aplicarViewMode();
};

window.aplicarViewMode = function() {
    const out = document.getElementById('output');
    const btn = document.getElementById('btnViewMode');
    if (!out) return;
    if (window.modoCompacto) {
        out.classList.add('compact-mode');
        if(btn) btn.innerText = "🗂️"; 
    } else {
        out.classList.remove('compact-mode');
        if(btn) btn.innerText = "📄"; 
    }
};

window.aplicarViewMode = function() {
    const out = document.getElementById('output');
    const btn = document.getElementById('btnViewMode');
    if (!out) return;
    out.classList.toggle('compact-mode', !!window.modoCompacto);
    if (btn) btn.innerText = window.modoCompacto ? '☷' : '▤';
};

window.aplicarTemaApp = function() {
    const theme = window.appThemeMode || 'dark';
    const html = document.documentElement;
    html.dataset.theme = theme;
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', theme === 'light' ? '#f4f6fb' : '#0d0e18');

    document.querySelectorAll('[data-theme-option]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.themeOption === theme);
    });
};

window.definirTemaApp = function(theme) {
    window.appThemeMode = ['dark', 'light', 'auto'].includes(theme) ? theme : 'dark';
    localStorage.setItem('wifi_pro_theme_v1', window.appThemeMode);
    window.aplicarTemaApp();
};

window.aplicarModoDesenvolvedor = function() {
    document.body.classList.toggle('developer-mode', !!window.appDeveloperMode);
    const toggle = document.getElementById('toggleDeveloperMode');
    if (toggle) toggle.checked = !!window.appDeveloperMode;
};

window.alternarModoDesenvolvedor = function(enabled) {
    window.appDeveloperMode = !!enabled;
    localStorage.setItem('wifi_pro_developer_v1', String(window.appDeveloperMode));
    window.aplicarModoDesenvolvedor();
};

window.aplicarRuntimeLayout = function() {
    const native = window.isNativeRuntime();
    document.body.classList.toggle('native-runtime', native);
    document.body.classList.toggle('pwa-runtime', !native);

    const abrirRadar = () => {
        if (typeof window.fecharMenuLateral === 'function') window.fecharMenuLateral();
        if (typeof window.buscarSenhasPorPerto === 'function') {
            window.buscarSenhasPorPerto();
        }
    };

    const drawerWifi = document.getElementById('drawerWifiAction');
    const bottomWifi = document.getElementById('bottomWifiAction');

    if (!native) {
        if (drawerWifi) {
            drawerWifi.innerHTML = '<span class="drawer-icon">⌖</span><span>Radar</span>';
            drawerWifi.onclick = abrirRadar;
        }
        if (bottomWifi) {
            bottomWifi.innerHTML = '<span class="nav-icon">⌖</span><span class="nav-label">Radar</span><small>GPS</small>';
            bottomWifi.onclick = abrirRadar;
        }
    }
};

window.abrirModalConfiguracoes = function() {
    const modal = document.getElementById('modalConfiguracoes');
    if (modal) modal.style.display = 'flex';
    window.aplicarTemaApp();
    window.aplicarModoDesenvolvedor();
    window.fecharMenuLateral();
};

window.fecharModalConfiguracoes = function() {
    const modal = document.getElementById('modalConfiguracoes');
    if (modal) modal.style.display = 'none';
};

window.abrirMenuLateral = function() {
    document.getElementById('drawerBackdrop')?.classList.add('show');
    document.getElementById('sideDrawer')?.classList.add('show');
};

window.fecharMenuLateral = function() {
    document.getElementById('drawerBackdrop')?.classList.remove('show');
    document.getElementById('sideDrawer')?.classList.remove('show');
};

window.mostrarTelaApp = function(view = 'home') {
    const nextView = view === 'saved' ? 'saved' : 'home';
    window.appCurrentView = nextView;
    localStorage.setItem('wifi_pro_view_screen_v1', nextView);
    document.body.classList.toggle('view-home', nextView === 'home');
    document.body.classList.toggle('view-saved', nextView === 'saved');

    document.querySelectorAll('.app-screen').forEach(section => {
        section.classList.remove('active');
    });

    const target = document.getElementById(nextView === 'saved' ? 'appSavedScreen' : 'appHomeScreen');
    if (target) target.classList.add('active');

    document.querySelectorAll('[data-app-nav]').forEach(button => {
        button.classList.toggle('active', button.dataset.appNav === nextView);
    });

    window.fecharMenuLateral();
    if (nextView === 'saved') {
        window.renderizarInterface(window.redesEmMemoria || []);
    } else {
        window.atualizarDashboardLayout();
        window.renderizarBuscaInicio();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.irParaInicio = function() {
    window.mostrarTelaApp('home');
};

window.filtrarListaPainel = function(lista, radar = false) {
    const base = Array.isArray(lista) ? [...lista] : [];
    if (radar) return base;
    if (window.appCurrentFilter === 'recent') {
        return base
            .sort((a, b) => window.getRedeRecentTimestamp(b) - window.getRedeRecentTimestamp(a))
            .slice(0, 10);
    }
    return base;
};

window.getRedeRecentTimestamp = function(rede) {
    if (!rede) return 0;
    const direct = Number(rede.createdAt || rede.criadoEm || rede.updatedAt || rede.timestamp);
    if (!Number.isNaN(direct) && direct > 0) return direct;

    const id = String(rede.id || '');
    const localMatch = id.match(/local_(\d+)/);
    if (localMatch) return Number(localMatch[1]) || 0;

    return 0;
};

window.filtrarPainel = function(filter) {
    window.appCurrentFilter = ['all', 'recent'].includes(filter) ? filter : 'all';
    localStorage.setItem('wifi_pro_filter_v1', window.appCurrentFilter);
    document.querySelectorAll('.filter-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === window.appCurrentFilter);
    });
    if (window.appCurrentView !== 'saved') {
        window.mostrarTelaApp('saved');
        return;
    }
    window.renderizarInterface(window.redesEmMemoria || []);
};

window.atualizarDashboardLayout = function() {
    const redes = window.redesEmMemoria || [];
    const mapped = redes.filter(rede => rede.lat && rede.lng).length;
    const found = Array.isArray(window.nativeWifiUltimoScan) ? window.nativeWifiUltimoScan.length : 0;
    const recent = Math.min(redes.length, 10);

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(value);
    };

    setText('statSaved', redes.length);
    setText('statFound', found);
    setText('statMapped', mapped);
    setText('tabAllCount', redes.length);
    setText('tabRecentCount', recent);

    const subtitle = document.getElementById('listSubtitle');
    if (subtitle) {
        subtitle.textContent = window.appCurrentFilter === 'recent'
            ? 'Ultimas 10 redes cadastradas'
            : 'Todas as redes cadastradas';
    }

    const ssidEl = document.getElementById('dashboardCurrentSsid');
    const metaEl = document.getElementById('dashboardCurrentMeta');
    const labelEl = document.getElementById('dashboardCurrentLabel');
    const routerBtn = document.getElementById('btnHomeManageRouter');
    const saveBtn = document.getElementById('btnHomeSaveCurrent');
    const current = window.wifiAtualConexao;
    if (ssidEl && metaEl) {
        if (!window.isNativeRuntime()) {
            if (labelEl) labelEl.textContent = 'Resumo PWA';
            ssidEl.textContent = `${redes.length} redes salvas`;
            metaEl.textContent = 'Use o Radar por GPS ou cadastre uma nova rede manualmente.';
            if (routerBtn) routerBtn.disabled = true;
            if (saveBtn) saveBtn.disabled = true;
        } else if (current && current.connected && current.ssid) {
            if (labelEl) labelEl.textContent = 'Rede Atual';
            ssidEl.textContent = current.ssid;
            metaEl.textContent = `${current.level || 'Sinal n/d'} dBm${current.bssid ? ' · ' + current.bssid : ''}`;
            if (routerBtn) routerBtn.disabled = false;
            if (saveBtn) saveBtn.disabled = !!(window.redesEmMemoria || []).find(rede => rede.ssid === current.ssid);
        } else {
            if (labelEl) labelEl.textContent = 'Rede Atual';
            ssidEl.textContent = 'Sem Wi-Fi conectado';
            metaEl.textContent = 'Abra Redes para escanear redes próximas';
            if (routerBtn) routerBtn.disabled = true;
            if (saveBtn) saveBtn.disabled = true;
        }
    }
};

window.renderizarBuscaInicio = function() {
    const input = document.getElementById('homeSearchInput');
    const out = document.getElementById('homeSearchResults');
    if (!input || !out) return;

    const termo = input.value.trim().toLowerCase();
    out.innerHTML = '';
    if (!termo) {
        const vazio = document.createElement('div');
        vazio.className = 'home-search-empty';
        vazio.textContent = 'Digite o nome de uma rede para buscar.';
        out.appendChild(vazio);
        return;
    }

    const resultados = (window.redesEmMemoria || [])
        .filter(rede => String(rede.ssid || '').toLowerCase().includes(termo))
        .slice(0, 5);

    if (!resultados.length) {
        const vazio = document.createElement('div');
        vazio.className = 'home-search-empty';
        vazio.textContent = 'Nenhuma rede encontrada.';
        out.appendChild(vazio);
        return;
    }

    resultados.forEach(rede => {
        const item = document.createElement('div');
        item.className = 'home-search-item';

        const info = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = rede.ssid || '';
        const meta = document.createElement('small');
        meta.textContent = rede.bssid ? `BSSID ${rede.bssid}` : 'Rede salva no banco';
        info.appendChild(title);
        info.appendChild(meta);

        const actions = document.createElement('div');
        const copiar = document.createElement('button');
        copiar.type = 'button';
        copiar.textContent = 'Copiar';
        copiar.addEventListener('click', () => window.copy(rede.senha || ''));
        actions.appendChild(copiar);

        if (typeof window.conectarRedeWifiReal === 'function') {
            const conectar = document.createElement('button');
            conectar.type = 'button';
            conectar.textContent = 'Conectar';
            conectar.addEventListener('click', () => window.conectarRedeWifiReal(rede, {
                ssid: rede.ssid,
                bssid: rede.bssid || '',
                capabilities: rede.senha ? '[WPA2-PSK]' : ''
            }, conectar, { forceSwitch: true }));
            actions.appendChild(conectar);
        }

        item.appendChild(info);
        item.appendChild(actions);
        out.appendChild(item);
    });
};

window.salvarRedeAtualPeloInicio = function() {
    const connection = window.wifiAtualConexao;
    if (!connection || !connection.connected || !connection.ssid) {
        window.mostrarToast('Nenhuma rede atual para salvar.');
        return;
    }

    if (typeof window.abrirModal === 'function') window.abrirModal();
    window.novaRedeBssidSugerida = typeof window.normalizarWifiBssid === 'function'
        ? window.normalizarWifiBssid(connection.bssid)
        : (connection.bssid || '');
    window.novaRedeWifiSugerida = {
        ssid: connection.ssid,
        bssid: window.novaRedeBssidSugerida || '',
        capabilities: connection.capabilities || '',
        level: connection.level || null,
        conectarAposSalvar: false
    };
    window.novaRedeConectarAposCadastro = false;

    const ssid = document.getElementById('novoSSID');
    const senha = document.getElementById('novaSenha');
    if (ssid) ssid.value = connection.ssid;
    if (senha) senha.focus();
    if (typeof window.checarDuplicadoModal === 'function') window.checarDuplicadoModal();
};

window.mostrarToast = function(m) { 
    const t = document.getElementById('toast'); 
    t.innerText = m; 
    t.className = 'show'; 
    setTimeout(() => t.className = '', 3000); 
};

window.abrirModal = function() {
    window.novaRedeBssidSugerida = null;
    window.novaRedeWifiSugerida = null;
    window.novaRedeConectarAposCadastro = false;
    document.getElementById('modalNovaRede').style.display = 'flex';
};

window.fecharModal = function() { 
    document.getElementById('modalNovaRede').style.display = 'none'; 
    document.getElementById('novoSSID').value = ''; 
    document.getElementById('novaSenha').value = ''; 
    document.getElementById('novaCoordenadaManual').value = ''; 
    document.getElementById('msgDuplicadoModal').style.display = 'none'; 
    document.getElementById('btnSalvarModal').style.display = 'flex'; 
    document.getElementById('containerCheckLocalizacao').style.display = 'flex'; 
    document.getElementById('btnAdicionarGeo').style.display = 'none'; 
    window.redeDuplicadaAtual = null; 
    window.novaRedeBssidSugerida = null;
    window.novaRedeWifiSugerida = null;
    window.novaRedeConectarAposCadastro = false;
};

window.filtrar = function() { 
    const v = document.getElementById('searchInput').value.toLowerCase(); 
    document.querySelectorAll('.card').forEach(c => c.style.display = c.dataset.nomeRede.includes(v) ? 'flex' : 'none'); 
};

window.abrirModalAvancado = function() { 
    window.fecharMenuLateral();
    document.getElementById('modalAvancado').style.display = 'flex'; 
    const inputOculta = document.getElementById('listaInputOculta');
    inputOculta.value = window.redesEmMemoria.map(r => `* ${r.ssid}: ${r.senha}`).join('\n\n');
};

window.fecharModalAvancado = function() { document.getElementById('modalAvancado').style.display = 'none'; };

window.copy = function(t) { 
    window.vibrar(); 
    const el = document.createElement('textarea'); 
    el.value = t; 
    document.body.appendChild(el); 
    el.select(); 
    document.execCommand('copy'); 
    document.body.removeChild(el); 
    if(window.mostrandoApenasProximas) { 
        if(typeof window.pararRadar === 'function') window.pararRadar(true); 
        window.mostrarToast("Copiado e Radar desligado!"); 
    } else { 
        window.mostrarToast("Copiado!"); 
    }
};

window.escapeWiFiQrField = function(value) {
    return String(value ?? '').replace(/([\\;,:"])/g, '\\$1');
};

window.criarWifiQrPayload = function(ssid, senha) {
    return `WIFI:T:WPA;S:${window.escapeWiFiQrField(ssid)};P:${window.escapeWiFiQrField(senha)};;`;
};

window.renderizarQrModerno = function(target, text) {
    return new Promise((resolve, reject) => {
        if (!window.QRCodeModern || typeof window.QRCodeModern.toCanvas !== 'function') {
            reject(new Error('QRCodeModern indisponivel'));
            return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = 140;
        canvas.height = 140;
        canvas.style.width = '140px';
        canvas.style.height = '140px';
        window.QRCodeModern.toCanvas(canvas, text, {
            width: 140,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: { dark: '#000000', light: '#ffffff' }
        }, (err) => {
            if (err) {
                reject(err);
                return;
            }
            target.innerHTML = '';
            target.appendChild(canvas);
            resolve();
        });
    });
};

window.renderizarQrAntigo = function(target, text) {
    if (typeof QRCode === 'undefined') {
        throw new Error('QRCode antigo indisponivel');
    }

    const niveis = [QRCode.CorrectLevel.M, QRCode.CorrectLevel.L, QRCode.CorrectLevel.H];
    let ultimoErro = null;

    for (const nivel of niveis) {
        try {
            target.innerHTML = '';
            new QRCode(target, {
                text,
                width: 140,
                height: 140,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: nivel
            });
            return;
        } catch (err) {
            ultimoErro = err;
        }
    }

    throw ultimoErro || new Error('Falha ao gerar QR antigo');
};

window.renderizarWifiQr = async function(target, text) {
    const tentativas = [
        () => window.renderizarQrModerno(target, text),
        () => {
            window.renderizarQrAntigo(target, text);
            return Promise.resolve();
        }
    ];

    let ultimoErro = null;
    for (const tentativa of tentativas) {
        try {
            await tentativa();
            target.dataset.rendered = 'true';
            return;
        } catch (err) {
            ultimoErro = err;
        }
    }

    throw ultimoErro || new Error('Falha ao gerar QR');
};

// MANUTENÇÃO / HARD RESET
window.hardResetPWA = async function() {
    if(!confirm("Atenção: Isso vai limpar o cache interno e atualizar o App para a versão mais recente. Deseja continuar?")) return;
    
    window.vibrar();
    window.mostrarToast("Limpando PWA...");
    
    localStorage.clear();
    sessionStorage.clear();
    indexedDB.deleteDatabase('WiFiManagerDB_v9');
    
    if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) await registration.unregister();
    }
    
    if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
    
    alert("App atualizado! Ele será reiniciado agora.");
    window.location.reload(true);
};

// BANCO DE DADOS LOCAL (IndexedDB)
window.initDB = function() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('WiFiManagerDB_v9', 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('redes')) {
                db.createObjectStore('redes', { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

window.salvarNoIndexedDB = async function(lista) {
    try {
        const db = await window.initDB();
        const tx = db.transaction('redes', 'readwrite');
        const store = tx.objectStore('redes');
        store.clear(); 
        lista.forEach(item => store.put(item));
        return new Promise(resolve => tx.oncomplete = resolve);
    } catch (e) {}
};

window.lerDoIndexedDB = async function() {
    try {
        const db = await window.initDB();
        const tx = db.transaction('redes', 'readonly');
        const store = tx.objectStore('redes');
        const request = store.getAll();
        return new Promise(resolve => {
            request.onsuccess = () => resolve(request.result);
        });
    } catch (e) { return []; }
};

window.atualizarBackupLocal = async function(lista) {
    await window.salvarNoIndexedDB(lista);
    const txtBackup = lista.map(r => `* ${r.ssid}: ${r.senha}`).join('\n\n');
    const inputOculta = document.getElementById('listaInputOculta');
    if(inputOculta) inputOculta.value = txtBackup; 
};

// SINCRONIZAÇÃO E CONTADORES
window.atualizarContador = function(modo, totalNuvem = 0) {
    const el = document.getElementById('statusContador');
    if(!el) return;
    
    const pendentesCriacao = window.redesEmMemoria.filter(r => String(r.id).startsWith('local_')).length;
    const pendentesExclusao = JSON.parse(localStorage.getItem('wifi_pro_deletes_v1') || '[]').length;
    const pendentesUpdate = Object.keys(JSON.parse(localStorage.getItem('wifi_pro_updates_v1') || '{}')).length;
    
    const totalPendentes = pendentesCriacao + pendentesExclusao + pendentesUpdate;
    const total = window.redesEmMemoria.length;
    
    let avisoPendentes = totalPendentes > 0 ? `<span style="color:#F59E0B; font-weight:bold; background:rgba(245, 158, 11, 0.15); padding:3px 8px; border-radius:6px; margin-left: 5px; border: 1px solid rgba(245, 158, 11, 0.3);">⚠️ ${totalPendentes}</span>` : '';

    if (modo === 'offline') {
        el.innerHTML = `<span style="color:var(--text-muted);">📱 Offline (${total})</span> ${avisoPendentes}`;
    } else if (modo === 'sincronizando') {
        el.innerHTML = `<span style="color:var(--warning);">⏳ Sync...</span>`;
    } else if (modo === 'sincronizado') {
        el.innerHTML = `<span style="color:var(--success);">☁️ Online (${totalNuvem})</span>`;
    }
};

window.sincronizarPendentes = async function() {
    if (typeof window.firebasePush !== 'function') return;

    let filaExclusao = JSON.parse(localStorage.getItem('wifi_pro_deletes_v1') || '[]');
    if (filaExclusao.length > 0) {
        filaExclusao.forEach(id => {
            if(typeof window.firebaseExcluir === 'function') window.firebaseExcluir(id);
        });
        localStorage.removeItem('wifi_pro_deletes_v1');
    }

    let filaUpdate = JSON.parse(localStorage.getItem('wifi_pro_updates_v1') || '{}');
    if (Object.keys(filaUpdate).length > 0) {
        Object.keys(filaUpdate).forEach(id => {
            const up = filaUpdate[id];
            const toUpdate = {};
            if(up.lat !== undefined) { toUpdate.lat = up.lat; toUpdate.lng = up.lng; }
            if(up.ssid !== undefined) { toUpdate.ssid = up.ssid; toUpdate.senha = up.senha; }
            if(up.bssid !== undefined) { toUpdate.bssid = up.bssid; }
            if(typeof window.firebaseAtualizarObjeto === 'function') window.firebaseAtualizarObjeto(id, toUpdate);
        });
        localStorage.removeItem('wifi_pro_updates_v1');
    }

    const pendentes = window.redesEmMemoria.filter(r => String(r.id).startsWith('local_'));
    if (pendentes.length > 0) {
        window.redesEmMemoria = window.redesEmMemoria.filter(r => !String(r.id).startsWith('local_'));
        await window.atualizarBackupLocal(window.redesEmMemoria);
        pendentes.forEach(rede => {
            const meta = window.criarMetadadosCadastroRede(window.getRedeRecentTimestamp(rede) || Date.now());
            window.firebasePush(rede.ssid, rede.senha, rede.lat, rede.lng, rede.bssid, {
                ...meta,
                createdAtLocal: rede.createdAtLocal || meta.createdAtLocal
            });
        });
    }
};

// EVENTOS BASE DO APLICATIVO
window.addEventListener('online', () => {
    window.atualizarContador('sincronizando');
    if (typeof window.firebasePush === 'function') window.sincronizarPendentes();
});

window.addEventListener('offline', () => { window.atualizarContador('offline'); });

window.addEventListener('DOMContentLoaded', async () => {
    window.aplicarTemaApp();
    window.aplicarModoDesenvolvedor();
    window.aplicarRuntimeLayout();
    window.aplicarViewMode(); 
    
    try {
        const dadosLocal = await window.lerDoIndexedDB();
        if (dadosLocal && dadosLocal.length > 0) {
            window.redesEmMemoria = dadosLocal;
            window.renderizarInterface(window.redesEmMemoria);
            if (typeof window.atualizarPreScanWifiComBanco === 'function') {
                window.atualizarPreScanWifiComBanco();
            }
            window.atualizarContador(navigator.onLine ? 'sincronizando' : 'offline');
        }
    } catch (e) {}
    window.atualizarDashboardLayout();
    window.mostrarTelaApp(window.appCurrentView);
    
    // CORREÇÃO 1: QR CODE LENGTH OVERFLOW
    if (typeof QRCode !== 'undefined' || typeof window.QRCodeModern !== 'undefined') {
        window.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !entry.target.dataset.rendered) {
                    entry.target.innerHTML = "";
                    try {
                        const wifiStringNovo = window.criarWifiQrPayload(entry.target.dataset.ssid, entry.target.dataset.pass);
                        window.renderizarWifiQr(entry.target, wifiStringNovo).catch((err) => {
                            entry.target.innerHTML = "<small style='color:red'>Erro QR</small>";
                            console.error("Erro ao gerar QR:", err);
                        });
                        return;
                        // Função para escapar caracteres especiais no formato Wi-Fi
                        const escapeWiFiChar = (str) => {
                            return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/:/g, '\\:').replace(/"/g, '\\"');
                        };
                        
                        const ssid = escapeWiFiChar(entry.target.dataset.ssid);
                        const pass = escapeWiFiChar(entry.target.dataset.pass);
                        
                        // Formato Wi-Fi padrão com escape de caracteres especiais
                        const wifiString = window.criarWifiQrPayload(entry.target.dataset.ssid, entry.target.dataset.pass);
                        
                        // Tenta com diferentes níveis de correção (M é melhor para dados grandes)
                        let tentativas = [QRCode.CorrectLevel.M, QRCode.CorrectLevel.L, QRCode.CorrectLevel.H];
                        let gerado = false;
                        
                        for (let nivel of tentativas) {
                            try {
                                entry.target.innerHTML = "";
                                new QRCode(entry.target, { 
                                    text: wifiString,
                                    width: 140, 
                                    height: 140,
                                    colorDark: "#000000",
                                    colorLight: "#ffffff",
                                    correctLevel: nivel
                                });
                                gerado = true;
                                break;
                            } catch (e) {
                                // Tenta o próximo nível
                                continue;
                            }
                        }
                        
                        if (!gerado) {
                            throw new Error("Falha em todos os níveis de correção");
                        }
                        
                        entry.target.dataset.rendered = "true";
                    } catch (err) {
                        entry.target.innerHTML = "<small style='color:red'>Erro QR</small>";
                        console.error("Erro ao gerar QR:", err);
                    }
                }
            });
        }, { rootMargin: '100px' });
    }
});

// OPERAÇÕES DE REDE (CRUD)
window.renderizarInterface = function(lista, radar = false) {
    const out = document.getElementById('output');
    if(!out) return;
    out.innerHTML = '';
    lista.forEach(r => {
        const div = document.createElement('div');
        div.className = 'card'; div.dataset.nomeRede = r.ssid.toLowerCase();
        
        // CORREÇÃO 2: Parsing de GPS para o Radar funcionar
        const latF = parseFloat(String(r.lat).replace(',', '.'));
        const distBadge = (radar && !isNaN(latF)) ? `<div class="badge-geo" style="background:rgba(16, 185, 129, 0.1); color:var(--success); border-color:rgba(16, 185, 129, 0.3);">A ${Math.round(r.d)}m</div>` : (r.lat ? `<div class="badge-geo">📍 Local Salvo</div>` : '');
        
        const btnMapa = r.lat ? "🗺️ Editar Local" : "📍 Add Local";
        const corMapa = r.lat ? "var(--geo)" : "#6366F1";

        div.innerHTML = `
            <div class="card-info">
                ${distBadge}
                <h3>${r.ssid}</h3>
                <p>${r.senha}</p>
            </div>
            <div class="qrcode" data-ssid="${r.ssid}" data-pass="${r.senha}">Gerando...</div>
            <div class="card-actions">
                <button class="btn-mini" style="background:var(--btn-copy-bg);color:var(--text-main)" onclick="copy('${r.senha}')">📋 Copiar</button>
                <button class="btn-mini" style="background:var(--success);color:#fff" onclick="compartilharRede('${r.ssid}', '${r.senha}')">🔗 Compartilhar</button>
                <button class="btn-mini" style="background:${corMapa}; color:#fff;" onclick="window.abrirMapaParaRede('${r.id}','${r.ssid}','${r.lat}','${r.lng}')">${btnMapa}</button>
                <button class="btn-mini" style="background:var(--warning); color:#fff;" onclick="abrirModalEditar('${r.id}')">✏️ Editar</button>
            </div>`;
        out.appendChild(div);
        if(window.observer) window.observer.observe(div.querySelector('.qrcode'));
    });
};

window.renderizarInterface = function(lista, radar = false) {
    const out = document.getElementById('output');
    if (!out) return;
    window.atualizarDashboardLayout();
    window.renderizarBuscaInicio();
    document.querySelectorAll('.filter-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === window.appCurrentFilter);
    });
    out.innerHTML = '';
    const listaRender = window.filtrarListaPainel(lista, radar);

    listaRender.forEach(r => {
        const ssid = String(r.ssid ?? '');
        const senha = String(r.senha ?? '');
        const div = document.createElement('div');
        div.className = 'card';
        div.dataset.nomeRede = ssid.toLowerCase();

        const latF = parseFloat(String(r.lat).replace(',', '.'));
        const cardInfo = document.createElement('div');
        cardInfo.className = 'card-info';

        if ((radar && !isNaN(latF)) || r.lat) {
            const badge = document.createElement('div');
            badge.className = 'badge-geo';
            if (radar && !isNaN(latF)) {
                badge.textContent = `A ${Math.round(r.d)}m`;
                badge.style.background = 'rgba(16, 185, 129, 0.1)';
                badge.style.color = 'var(--success)';
                badge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
            } else {
                badge.textContent = 'Local Salvo';
            }
            cardInfo.appendChild(badge);
        }

        const title = document.createElement('h3');
        title.textContent = ssid;
        const password = document.createElement('p');
        password.textContent = senha;
        cardInfo.appendChild(title);
        cardInfo.appendChild(password);

        const qr = document.createElement('div');
        qr.className = 'qrcode';
        qr.dataset.ssid = ssid;
        qr.dataset.pass = senha;
        qr.textContent = 'Gerando...';

        const actions = document.createElement('div');
        actions.className = 'card-actions';

        const criarBotao = (label, background, color, handler) => {
            const button = document.createElement('button');
            button.className = 'btn-mini';
            button.type = 'button';
            button.textContent = label;
            button.style.background = background;
            button.style.color = color;
            button.addEventListener('click', handler);
            return button;
        };

        actions.appendChild(criarBotao('⧉ Copiar', 'var(--btn-copy-bg)', 'var(--text-main)', () => window.copy(senha)));
        actions.appendChild(criarBotao('⇪ Compartilhar', 'var(--success)', '#fff', () => window.compartilharRede(ssid, senha)));
        actions.appendChild(criarBotao(r.lat ? '⌖ Editar Local' : '⌖ Add Local', r.lat ? 'var(--geo)' : '#6366F1', '#fff', () => window.abrirMapaParaRede(r.id, ssid, r.lat, r.lng)));
        actions.appendChild(criarBotao('✎ Editar', 'var(--warning)', '#fff', () => window.abrirModalEditar(r.id)));

        div.appendChild(cardInfo);
        div.appendChild(qr);
        div.appendChild(actions);
        out.appendChild(div);
        if (window.observer) window.observer.observe(qr);
    });

    if (!listaRender.length) {
        const empty = document.createElement('div');
        empty.className = 'wifi-empty app-empty-state';
        empty.textContent = 'Nenhuma rede para mostrar.';
        out.appendChild(empty);
    }

    const searchInput = document.getElementById('searchInput');
    if (searchInput && searchInput.value) {
        window.filtrar();
    }

    const modalMapaGlobal = document.getElementById('modalMapaGlobal');
    if (window.mapGlobal && modalMapaGlobal && modalMapaGlobal.style.display === 'flex' && typeof window.renderizarMarcadoresMapaGlobal === 'function') {
        window.requestAnimationFrame(() => {
            window.renderizarMarcadoresMapaGlobal(!window.mapGlobalBoundsAplicado);
        });
    }
};

window.checarDuplicadoModal = function() {
    const s = document.getElementById('novoSSID').value.trim(); 
    const p = document.getElementById('novaSenha').value.trim();
    const bssidNovo = typeof window.normalizarWifiBssid === 'function'
        ? window.normalizarWifiBssid(window.novaRedeBssidSugerida)
        : String(window.novaRedeBssidSugerida || '').trim().toLowerCase();
    window.redeDuplicadaAtual = window.redesEmMemoria.find(r => {
        if (r.ssid !== s || r.senha !== p) return false;
        const bssidExistente = typeof window.normalizarWifiBssid === 'function'
            ? window.normalizarWifiBssid(r.bssid)
            : String(r.bssid || '').trim().toLowerCase();
        if (bssidNovo && bssidExistente && bssidNovo !== bssidExistente) return false;
        if (bssidNovo && !bssidExistente) return false;
        return true;
    });
    
    const msg = document.getElementById('msgDuplicadoModal');
    const btnSalvar = document.getElementById('btnSalvarModal');
    const checkLoc = document.getElementById('containerCheckLocalizacao');
    const btnGeo = document.getElementById('btnAdicionarGeo');

    if (window.redeDuplicadaAtual) {
        msg.style.display = 'block'; 
        btnSalvar.style.display = 'none'; 
        checkLoc.style.display = 'none';
        btnGeo.style.display = 'flex';
        msg.innerText = !window.redeDuplicadaAtual.lat ? "ℹ️ Esta rede já existe sem localização." : "ℹ️ Esta rede já existe com localização.";
    } else {
        msg.style.display = 'none'; 
        btnSalvar.style.display = 'flex'; 
        checkLoc.style.display = 'flex';
        btnGeo.style.display = 'none';
    }
};

window.abrirModalEditar = function(id) {
    window.vibrar();
    const rede = window.redesEmMemoria.find(r => r.id === id);
    if(!rede) return;
    window.redeEditandoAtual = rede;
    document.getElementById('editSSID').value = rede.ssid;
    document.getElementById('editSenha').value = rede.senha;
    document.getElementById('modalEditarRede').style.display = 'flex';
};

window.fecharModalEditar = function() {
    document.getElementById('modalEditarRede').style.display = 'none';
    window.redeEditandoAtual = null;
};

window.salvarEdicaoRede = async function() {
    window.vibrar();
    if(!window.redeEditandoAtual) return;
    const s = document.getElementById('editSSID').value.trim();
    const p = document.getElementById('editSenha').value.trim();
    if(!s || !p) { window.mostrarToast("Preencha o nome e a senha!"); return; }
    if(p.length < 8) { window.mostrarToast("⚠️ A senha deve ter no mínimo 8 caracteres!"); return; }

    const id = window.redeEditandoAtual.id;
    const index = window.redesEmMemoria.findIndex(r => r.id === id);
    
    if(index !== -1) {
        window.redesEmMemoria[index].ssid = s;
        window.redesEmMemoria[index].senha = p;
    }

    if (navigator.onLine && typeof window.firebaseEditarCredenciais === 'function' && !id.toString().startsWith('local_')) {
        window.firebaseEditarCredenciais(id, s, p);
    } else if (!id.toString().startsWith('local_')) {
        let filaUpdate = JSON.parse(localStorage.getItem('wifi_pro_updates_v1') || '{}');
        filaUpdate[id] = { ssid: s, senha: p };
        localStorage.setItem('wifi_pro_updates_v1', JSON.stringify(filaUpdate));
    }

    window.redesEmMemoria.sort((a, b) => a.ssid.localeCompare(b.ssid));
    window.atualizarBackupLocal(window.redesEmMemoria);
    if (!window.mostrandoApenasProximas) window.renderizarInterface(window.redesEmMemoria);
    window.atualizarContador(navigator.onLine ? 'sincronizando' : 'offline');
    window.fecharModalEditar();
    window.mostrarToast("Rede atualizada!");
};

window.excluirPeloModalEditar = function() {
    if(window.redeEditandoAtual) {
        window.iniciarExclusao(window.redeEditandoAtual.id, window.redeEditandoAtual.ssid);
        window.fecharModalEditar();
    }
};

window.iniciarExclusao = function(id, ssid) {
    window.vibrar(); 
    if (window.redePendenteExclusao) window.confirmarExclusaoDefinitiva();
    const rede = window.redesEmMemoria.find(r => r.id === id);
    if (!rede) return;

    window.redePendenteExclusao = rede;
    window.redesEmMemoria = window.redesEmMemoria.filter(r => r.id !== id);
    window.atualizarBackupLocal(window.redesEmMemoria);
    window.renderizarInterface(window.redesEmMemoria);
    window.atualizarContador(navigator.onLine ? 'sincronizando' : 'offline');

    const tUndo = document.getElementById('toast-undo');
    document.getElementById('toast-undo-text').innerText = `Rede apagada.`;
    tUndo.className = 'show';
    window.deleteTimeout = setTimeout(() => { window.confirmarExclusaoDefinitiva(); }, 5000);
};

window.desfazerExclusao = function() {
    window.vibrar(); 
    if (!window.redePendenteExclusao) return;
    clearTimeout(window.deleteTimeout);
    window.redesEmMemoria.push(window.redePendenteExclusao);
    window.redesEmMemoria.sort((a, b) => a.ssid.localeCompare(b.ssid));
    window.atualizarBackupLocal(window.redesEmMemoria);
    window.renderizarInterface(window.redesEmMemoria);
    window.atualizarContador(navigator.onLine ? 'sincronizando' : 'offline');
    window.redePendenteExclusao = null;
    document.getElementById('toast-undo').className = '';
    window.mostrarToast("Ação desfeita!");
};

window.confirmarExclusaoDefinitiva = function() {
    if (!window.redePendenteExclusao) return;
    const id = window.redePendenteExclusao.id;
    if (navigator.onLine && typeof window.firebaseExcluir === 'function' && !id.toString().startsWith('local_')) {
        window.firebaseExcluir(id);
    } else if (!id.toString().startsWith('local_')) {
        let filaExclusao = JSON.parse(localStorage.getItem('wifi_pro_deletes_v1') || '[]');
        if(!filaExclusao.includes(id)) filaExclusao.push(id);
        localStorage.setItem('wifi_pro_deletes_v1', JSON.stringify(filaExclusao));
    }
    window.redePendenteExclusao = null;
    const tUndo = document.getElementById('toast-undo');
    if(tUndo) tUndo.className = '';
};

window.atualizarGeoRedeExistente = async function() {
    window.vibrar();
    if (!window.redeDuplicadaAtual) return;

    const usarGeo = document.getElementById('checkLocalizacao').checked;
    const coordManual = document.getElementById('novaCoordenadaManual').value.trim();
    let lat = null, lng = null;
    const btnGeo = document.getElementById('btnAdicionarGeo');

    // PRIORIDADE 1: Coordenadas digitadas manualmente (sempre tem prioridade)
    if (coordManual) {
        const partes = coordManual.split(',');
        if (partes.length >= 2) {
            const l = parseFloat(partes[0].trim().replace(',', '.'));
            const g = parseFloat(partes[1].trim().replace(',', '.'));
            if (!isNaN(l) && !isNaN(g)) { 
                lat = l; 
                lng = g; 
            } else {
                window.mostrarToast("Coordenadas inválidas! Use o formato: -23.55, -46.63");
                return;
            }
        } else {
            window.mostrarToast("Coordenadas inválidas! Use o formato: -23.55, -46.63");
            return;
        }
    } 
    // PRIORIDADE 2: GPS do celular (apenas se checkbox marcado e sem coordenadas manuais)
    else if (usarGeo) {
        btnGeo.innerText = "📍 Obtendo GPS..."; btnGeo.disabled = true;
        try {
            const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, {
                enableHighAccuracy: true, timeout: 7000 
            }));
            lat = pos.coords.latitude; 
            lng = pos.coords.longitude;
        } catch(e) { 
            window.mostrarToast("GPS falhou. Verifique as permissões."); 
            btnGeo.innerText = "📍 Adicionar GPS Agora"; 
            btnGeo.disabled = false;
            return;
        }
    }
    // PRIORIDADE 3: Sem localização (campo vazio e checkbox desmarcado)
    // Neste caso, lat e lng permanecem null, o que é válido

    const id = window.redeDuplicadaAtual.id;
    const index = window.redesEmMemoria.findIndex(r => r.id === id);
    if (index !== -1) {
        window.redesEmMemoria[index].lat = lat;
        window.redesEmMemoria[index].lng = lng;
    }

    // Sincronização com Firebase ou Fila de Updates
    if (navigator.onLine && typeof window.firebaseAtualizarObjeto === 'function' && !id.toString().startsWith('local_')) {
        window.firebaseAtualizarObjeto(id, { lat, lng });
    } else if (!id.toString().startsWith('local_')) {
        let filaUpdate = JSON.parse(localStorage.getItem('wifi_pro_updates_v1') || '{}');
        if (!filaUpdate[id]) filaUpdate[id] = {};
        filaUpdate[id].lat = lat;
        filaUpdate[id].lng = lng;
        localStorage.setItem('wifi_pro_updates_v1', JSON.stringify(filaUpdate));
    }

    await window.atualizarBackupLocal(window.redesEmMemoria);
    window.renderizarInterface(window.redesEmMemoria);
    window.fecharModal();
    btnGeo.innerText = "📍 Adicionar GPS Agora"; 
    btnGeo.disabled = false;
    
    const msgSucesso = lat && lng ? "Localização adicionada com sucesso!" : "Rede atualizada sem localização!";
    window.mostrarToast(msgSucesso);
};

window.tentarConectarRedeRecemCadastrada = async function(rede, contextoWifi, conectarAposCadastro) {
    if (!conectarAposCadastro || !rede || typeof window.conectarRedeWifiReal !== 'function') {
        return false;
    }

    if (contextoWifi && contextoWifi.ssid && contextoWifi.ssid !== rede.ssid) {
        return false;
    }

    const network = {
        ssid: rede.ssid,
        bssid: (contextoWifi && contextoWifi.bssid) || rede.bssid || '',
        capabilities: (contextoWifi && contextoWifi.capabilities) || (rede.senha ? '[WPA2-PSK]' : ''),
        level: contextoWifi && contextoWifi.level !== undefined ? contextoWifi.level : null
    };

    window.mostrarToast("Rede salva. Abrindo conexao no Android...");
    await window.conectarRedeWifiReal(rede, network, null, { forceSwitch: false, switchAfterSave: true });
    return true;
};

window.salvarRedeLocal = async function() {
    window.vibrar(); 
    const s = document.getElementById('novoSSID').value.trim();
    const p = document.getElementById('novaSenha').value.trim();
    if(!s || !p) { window.mostrarToast("Preencha os campos!"); return; }
    
    const usarGeo = document.getElementById('checkLocalizacao').checked;
    const coordManual = document.getElementById('novaCoordenadaManual').value.trim();
    let lat = null, lng = null;
    const btnSalvar = document.getElementById('btnSalvarModal');

    // PRIORIDADE 1: Coordenadas digitadas manualmente (sempre tem prioridade)
    if (coordManual) {
        const partes = coordManual.split(',');
        if (partes.length >= 2) {
            const l = parseFloat(partes[0].trim().replace(',', '.'));
            const g = parseFloat(partes[1].trim().replace(',', '.'));
            if (!isNaN(l) && !isNaN(g)) { 
                lat = l; 
                lng = g; 
            } else {
                window.mostrarToast("Coordenadas inválidas! Use o formato: -23.55, -46.63");
                return;
            }
        } else {
            window.mostrarToast("Coordenadas inválidas! Use o formato: -23.55, -46.63");
            return;
        }
    } 
    // PRIORIDADE 2: GPS do celular (apenas se checkbox marcado e sem coordenadas manuais)
    else if (usarGeo) {
        btnSalvar.innerText = "📍 Obtendo GPS..."; 
        btnSalvar.disabled = true;
        try {
            const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, {
                enableHighAccuracy: true, timeout: 7000 
            }));
            lat = pos.coords.latitude; 
            lng = pos.coords.longitude;
        } catch(e) { 
            window.mostrarToast("GPS falhou. Rede salva sem localização.");
            // Continua salvando sem localização
        }
    }
    // PRIORIDADE 3: Sem localização (campo vazio e checkbox desmarcado)
    // Neste caso, lat e lng permanecem null, o que é válido

    const bssid = typeof window.normalizarWifiBssid === 'function'
        ? window.normalizarWifiBssid(window.novaRedeBssidSugerida)
        : String(window.novaRedeBssidSugerida || '').trim().toLowerCase();
    const contextoWifiCadastro = window.novaRedeWifiSugerida ? { ...window.novaRedeWifiSugerida } : null;
    const conectarAposCadastro = !!window.novaRedeConectarAposCadastro;

    const metaCriacao = window.criarMetadadosCadastroRede();
    let novoId = 'local_' + metaCriacao.createdAt; 
    if (navigator.onLine && typeof window.firebasePush === 'function') {
        const key = window.firebasePush(s, p, lat, lng, bssid || null, metaCriacao);
        if (key) novoId = key;
    }

    const novaRede = { id: novoId, ssid: s, senha: p, lat, lng, bssid: bssid || null, ...metaCriacao };
    window.redesEmMemoria.push(novaRede);
    window.redesEmMemoria.sort((a, b) => a.ssid.localeCompare(b.ssid));
    await window.atualizarBackupLocal(window.redesEmMemoria);
    window.renderizarInterface(window.redesEmMemoria);
    if (typeof window.atualizarEstadoWifiComBanco === 'function') {
        window.atualizarEstadoWifiComBanco();
    }
    window.fecharModal(); 
    btnSalvar.innerText = "Salvar"; 
    btnSalvar.disabled = false;
    const conectando = await window.tentarConectarRedeRecemCadastrada(novaRede, contextoWifiCadastro, conectarAposCadastro);
    if (conectando) return;
    
    const msgSucesso = lat && lng ? "Rede salva com localização!" : "Rede salva sem localização!";
    window.mostrarToast(msgSucesso);
};

window.importarListaTexto = async function() {
    window.vibrar();
    const texto = document.getElementById('listaInputOculta').value;
    const linhas = texto.split('\n');
    let adicionados = 0;

    linhas.forEach(linha => {
        const l = linha.trim();
        if (l.startsWith('* ')) {
            const partes = l.substring(2).split(': ');
            if (partes.length >= 2) {
                const s = partes[0].trim();
                const p = partes[1].trim();
                if (p.length >= 8 && !window.redesEmMemoria.find(r => r.ssid === s)) {
                    const metaImportacao = window.criarMetadadosCadastroRede(Date.now() + adicionados);
                    window.redesEmMemoria.push({ id: 'local_' + metaImportacao.createdAt, ssid: s, senha: p, lat: null, lng: null, ...metaImportacao });
                    adicionados++;
                }
            }
        }
    });

    if (adicionados > 0) {
        window.redesEmMemoria.sort((a, b) => a.ssid.localeCompare(b.ssid));
        await window.atualizarBackupLocal(window.redesEmMemoria);
        window.renderizarInterface(window.redesEmMemoria);
        window.mostrarToast(`${adicionados} redes importadas!`);
    }
    window.fecharModalAvancado();
};

window.normalizarBssidImportacao = function(bssid) {
    if (typeof window.normalizarWifiBssid === 'function') return window.normalizarWifiBssid(bssid);
    const value = String(bssid || '').trim().toLowerCase();
    if (!value || value === '02:00:00:00:00:00' || value === '00:00:00:00:00:00') return '';
    return /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/.test(value) ? value : '';
};

window.parseCoordenadasImportacao = function(value) {
    const match = String(value || '').match(/(-?\d+(?:[.,]\d+)?)\s*,\s*(-?\d+(?:[.,]\d+)?)/);
    if (!match) return { lat: null, lng: null };
    const lat = parseFloat(match[1].replace(',', '.'));
    const lng = parseFloat(match[2].replace(',', '.'));
    if (Number.isNaN(lat) || Number.isNaN(lng)) return { lat: null, lng: null };
    return { lat, lng };
};

window.parseBackupWifiTexto = function(texto) {
    const linhas = String(texto || '').replace(/\r/g, '').split('\n');
    const redes = [];
    let atual = null;

    const finalizarAtual = () => {
        if (atual && atual.ssid && atual.senha) {
            redes.push({
                ssid: atual.ssid.trim(),
                senha: atual.senha.trim(),
                bssid: window.normalizarBssidImportacao(atual.bssid) || null,
                lat: atual.lat ?? null,
                lng: atual.lng ?? null
            });
        }
        atual = null;
    };

    linhas.forEach((linhaOriginal) => {
        const linha = linhaOriginal.trim();
        if (!linha) {
            finalizarAtual();
            return;
        }

        const antigo = linha.match(/^\*\s*(.+?)\s*:\s*(.+)$/);
        if (antigo) {
            finalizarAtual();
            redes.push({ ssid: antigo[1].trim(), senha: antigo[2].trim(), bssid: null, lat: null, lng: null });
            return;
        }

        const pdfAntigo = linha.match(/^\d+\.\s*(.+?)\s*:\s*(.+)$/);
        if (pdfAntigo) {
            finalizarAtual();
            redes.push({ ssid: pdfAntigo[1].trim(), senha: pdfAntigo[2].trim(), bssid: null, lat: null, lng: null });
            return;
        }

        const novoTitulo = linha.match(/^\d+\.\s+(.+)$/);
        if (novoTitulo) {
            finalizarAtual();
            atual = { ssid: novoTitulo[1].trim(), senha: '', bssid: null, lat: null, lng: null };
            return;
        }

        const redeLinha = linha.match(/^Rede:\s*(.+)$/i);
        if (redeLinha) {
            finalizarAtual();
            atual = { ssid: redeLinha[1].trim(), senha: '', bssid: null, lat: null, lng: null };
            return;
        }

        if (!atual) return;

        const senha = linha.match(/^Senha:\s*(.*)$/i);
        if (senha) {
            atual.senha = senha[1].trim();
            return;
        }

        const bssid = linha.match(/^BSSID:\s*(.*)$/i);
        if (bssid) {
            atual.bssid = bssid[1].trim();
            return;
        }

        const coords = linha.match(/^Coordenadas?:\s*(.*)$/i);
        if (coords) {
            const parsed = window.parseCoordenadasImportacao(coords[1]);
            atual.lat = parsed.lat;
            atual.lng = parsed.lng;
        }
    });

    finalizarAtual();
    return redes.filter(r => r.ssid && r.senha);
};

window.aplicarRedesImportadas = async function(redes) {
    let adicionados = 0;
    let atualizados = 0;

    redes.forEach((rede) => {
        const bssid = window.normalizarBssidImportacao(rede.bssid);
        let existente = null;

        if (bssid) {
            existente = window.redesEmMemoria.find(r => window.normalizarBssidImportacao(r.bssid) === bssid);
        }
        if (!existente) {
            existente = window.redesEmMemoria.find(r => {
                if (r.ssid !== rede.ssid || r.senha !== rede.senha) return false;
                const existenteBssid = window.normalizarBssidImportacao(r.bssid);
                return !bssid || !existenteBssid || existenteBssid === bssid;
            });
        }

        if (existente) {
            let mudou = false;
            if (bssid && !window.normalizarBssidImportacao(existente.bssid)) {
                existente.bssid = bssid;
                mudou = true;
            }
            if (rede.lat !== null && rede.lng !== null && (!existente.lat || !existente.lng)) {
                existente.lat = rede.lat;
                existente.lng = rede.lng;
                mudou = true;
            }
            if (mudou) atualizados++;
            return;
        }

        const metaImportacao = window.criarMetadadosCadastroRede(Date.now() + adicionados);
        window.redesEmMemoria.push({
            id: 'local_' + metaImportacao.createdAt + '_' + adicionados,
            ssid: rede.ssid,
            senha: rede.senha,
            bssid: bssid || null,
            lat: rede.lat ?? null,
            lng: rede.lng ?? null,
            ...metaImportacao
        });
        adicionados++;
    });

    if (adicionados > 0 || atualizados > 0) {
        window.redesEmMemoria.sort((a, b) => a.ssid.localeCompare(b.ssid));
        await window.atualizarBackupLocal(window.redesEmMemoria);
        window.renderizarInterface(window.redesEmMemoria);
        if (typeof window.atualizarEstadoWifiComBanco === 'function') window.atualizarEstadoWifiComBanco();
    }

    return { adicionados, atualizados };
};

window.importarListaTexto = async function() {
    window.vibrar();
    const texto = document.getElementById('listaInputOculta').value;
    const redes = window.parseBackupWifiTexto(texto);

    if (!redes.length) {
        window.mostrarToast("Nenhuma rede reconhecida para importar.");
        return;
    }

    const result = await window.aplicarRedesImportadas(redes);
    window.fecharModalAvancado();
    window.mostrarToast(`${result.adicionados} adicionadas, ${result.atualizados} atualizadas.`);
};

window.decodificarPdfLiteral = function(value) {
    return value
        .replace(/\\([nrtbf()\\])/g, (m, code) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[code] || code))
        .replace(/\\([0-7]{1,3})/g, (m, oct) => String.fromCharCode(parseInt(oct, 8)));
};

window.decodificarPdfHex = function(hex) {
    const clean = String(hex || '').replace(/\s/g, '');
    const bytes = [];
    for (let i = 0; i < clean.length; i += 2) {
        const value = parseInt(clean.slice(i, i + 2), 16);
        if (!Number.isNaN(value)) bytes.push(value);
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        let out = '';
        for (let i = 2; i + 1 < bytes.length; i += 2) out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
        return out;
    }
    return new TextDecoder('latin1').decode(new Uint8Array(bytes));
};

window.extrairTextoPdfSimples = function(buffer) {
    const raw = new TextDecoder('latin1').decode(new Uint8Array(buffer));
    const partes = [];
    const literalRegex = /\((?:\\.|[^\\)])*\)\s*Tj/g;
    const hexRegex = /<([0-9a-fA-F\s]+)>\s*Tj/g;
    let match;

    while ((match = literalRegex.exec(raw))) {
        partes.push(window.decodificarPdfLiteral(match[0].replace(/\)\s*Tj$/, '').slice(1)));
    }
    while ((match = hexRegex.exec(raw))) {
        partes.push(window.decodificarPdfHex(match[1]));
    }

    return partes.join('\n');
};

window.importarArquivoBackup = async function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
        let texto = '';
        if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name)) {
            texto = window.extrairTextoPdfSimples(await file.arrayBuffer());
        } else {
            texto = await file.text();
        }

        const redes = window.parseBackupWifiTexto(texto);
        if (!redes.length) {
            window.mostrarToast("Arquivo nao parece ser um backup valido.");
            return;
        }

        const result = await window.aplicarRedesImportadas(redes);
        window.fecharModalAvancado();
        window.mostrarToast(`${result.adicionados} adicionadas, ${result.atualizados} atualizadas.`);
    } catch (error) {
        console.error("Erro ao importar arquivo:", error);
        window.mostrarToast("Falha ao importar arquivo.");
    } finally {
        event.target.value = '';
    }
};

window.abrirModalExportar = function() {
    window.fecharMenuLateral();
    document.getElementById('modalExportar').style.display = 'flex';
};
window.fecharModalExportar = function() { document.getElementById('modalExportar').style.display = 'none'; };

window.exportarTXT = function() {
    window.vibrar();
    let texto = "Senhas Wi-Fi\n\n" + window.redesEmMemoria.map(r => `* ${r.ssid}: ${r.senha}`).join('\n');
    const blob = new Blob([texto], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Backup_WiFi.txt";
    a.click();
};

window.exportarPDF = function() {
    window.vibrar();
    if (typeof window.jspdf === 'undefined') return alert("Biblioteca PDF não carregada.");
    const doc = new window.jspdf.jsPDF();
    doc.text("Backup de Senhas Wi-Fi", 10, 10);
    window.redesEmMemoria.forEach((r, i) => doc.text(`${i+1}. ${r.ssid}: ${r.senha}`, 10, 20 + (i * 10)));
    doc.save("Backup_WiFi.pdf");
};

window.getPluginExportacaoNativa = function() {
    if (!window.Capacitor) return null;
    if (window.Capacitor.Plugins && window.Capacitor.Plugins.WifiNative) {
        return window.Capacitor.Plugins.WifiNative;
    }
    if (typeof window.Capacitor.registerPlugin === 'function') {
        return window.WifiNativePluginProxy || (window.WifiNativePluginProxy = window.Capacitor.registerPlugin('WifiNative'));
    }
    return null;
};

window.arrayBufferParaBase64 = function(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
};

window.textoParaBase64Utf8 = function(texto) {
    return window.arrayBufferParaBase64(new TextEncoder().encode(texto).buffer);
};

window.baixarArquivoWeb = function(fileName, mimeType, conteudo) {
    const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

window.salvarArquivoExportado = async function(fileName, mimeType, base64, fallbackConteudo) {
    const plugin = window.getPluginExportacaoNativa();
    if (plugin && window.Capacitor && window.Capacitor.isNativePlatform() && typeof plugin.saveExportFile === 'function') {
        const result = await plugin.saveExportFile({ fileName, mimeType, base64 });
        window.mostrarToast(`Arquivo salvo em Downloads: ${result.fileName || fileName}`);
        return result;
    }

    window.baixarArquivoWeb(fileName, mimeType, fallbackConteudo);
    window.mostrarToast("Exportacao iniciada.");
    return { saved: true, fileName };
};

window.montarTextoBackupWifi = function() {
    const linhas = [
        "Backup de Senhas Wi-Fi",
        `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
        `Total de redes: ${window.redesEmMemoria.length}`,
        ""
    ];

    window.redesEmMemoria.forEach((r, i) => {
        linhas.push(`${i + 1}. ${r.ssid || ''}`);
        linhas.push(`Senha: ${r.senha || ''}`);
        if (r.bssid) linhas.push(`BSSID: ${r.bssid}`);
        if (r.lat && r.lng) linhas.push(`Coordenadas: ${r.lat}, ${r.lng}`);
        linhas.push("");
    });

    return linhas.join('\n');
};

window.exportarTXT = async function() {
    window.vibrar();
    try {
        const texto = window.montarTextoBackupWifi();
        await window.salvarArquivoExportado(
            "Backup_WiFi.txt",
            "text/plain",
            window.textoParaBase64Utf8(texto),
            texto
        );
    } catch (error) {
        console.error("Erro ao exportar TXT:", error);
        window.mostrarToast("Falha ao exportar TXT.");
    }
};

window.adicionarLinhaPdf = function(doc, texto, estado) {
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const maxWidth = pageWidth - (estado.margin * 2);
    const linhas = doc.splitTextToSize(String(texto || ''), maxWidth);

    linhas.forEach((linha) => {
        if (estado.y > pageHeight - estado.margin) {
            doc.addPage();
            estado.y = estado.margin;
        }
        doc.text(linha, estado.margin, estado.y);
        estado.y += estado.lineHeight;
    });
};

window.criarPdfBackupWifi = function() {
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    const estado = { margin: 12, y: 14, lineHeight: 6 };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    window.adicionarLinhaPdf(doc, "Backup de Senhas Wi-Fi", estado);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    window.adicionarLinhaPdf(doc, `Gerado em: ${new Date().toLocaleString('pt-BR')}`, estado);
    window.adicionarLinhaPdf(doc, `Total de redes: ${window.redesEmMemoria.length}`, estado);
    estado.y += 4;

    window.redesEmMemoria.forEach((r, i) => {
        if (estado.y > 270) {
            doc.addPage();
            estado.y = estado.margin;
        }

        doc.setFont('helvetica', 'bold');
        window.adicionarLinhaPdf(doc, `${i + 1}. ${r.ssid || ''}`, estado);
        doc.setFont('helvetica', 'normal');
        window.adicionarLinhaPdf(doc, `Senha: ${r.senha || ''}`, estado);
        if (r.bssid) window.adicionarLinhaPdf(doc, `BSSID: ${r.bssid}`, estado);
        if (r.lat && r.lng) window.adicionarLinhaPdf(doc, `Coordenadas: ${r.lat}, ${r.lng}`, estado);
        estado.y += 3;
    });

    return doc;
};

window.exportarPDF = async function() {
    window.vibrar();
    if (typeof window.jspdf === 'undefined') return alert("Biblioteca PDF nao carregada.");
    try {
        const doc = window.criarPdfBackupWifi();
        const buffer = doc.output('arraybuffer');
        const base64 = window.arrayBufferParaBase64(buffer);
        const blob = new Blob([buffer], { type: "application/pdf" });
        await window.salvarArquivoExportado("Backup_WiFi.pdf", "application/pdf", base64, blob);
    } catch (error) {
        console.error("Erro ao exportar PDF:", error);
        window.mostrarToast("Falha ao exportar PDF.");
    }
};

window.compartilharRede = async function(ssid, senha) {
    window.vibrar();
    if (navigator.share) {
        navigator.share({ title: 'Wi-Fi: ' + ssid, text: `Rede: ${ssid}\nSenha: ${senha}` }).catch(() => {});
    } else {
        window.mostrarToast("Compartilhamento não suportado.");
    }
};
