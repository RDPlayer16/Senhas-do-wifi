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
window.scanTarget = 'novo'; 

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

window.mostrarToast = function(m) { 
    const t = document.getElementById('toast'); 
    t.innerText = m; 
    t.className = 'show'; 
    setTimeout(() => t.className = '', 3000); 
};

window.abrirModal = function() { document.getElementById('modalNovaRede').style.display = 'flex'; };

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
};

window.filtrar = function() { 
    const v = document.getElementById('searchInput').value.toLowerCase(); 
    document.querySelectorAll('.card').forEach(c => c.style.display = c.dataset.nomeRede.includes(v) ? 'flex' : 'none'); 
};

window.abrirModalAvancado = function() { 
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
            if(typeof window.firebaseAtualizarObjeto === 'function') window.firebaseAtualizarObjeto(id, toUpdate);
        });
        localStorage.removeItem('wifi_pro_updates_v1');
    }

    const pendentes = window.redesEmMemoria.filter(r => String(r.id).startsWith('local_'));
    if (pendentes.length > 0) {
        window.redesEmMemoria = window.redesEmMemoria.filter(r => !String(r.id).startsWith('local_'));
        await window.atualizarBackupLocal(window.redesEmMemoria);
        pendentes.forEach(rede => { window.firebasePush(rede.ssid, rede.senha, rede.lat, rede.lng); });
    }
};

// EVENTOS BASE DO APLICATIVO
window.addEventListener('online', () => {
    window.atualizarContador('sincronizando');
    if (typeof window.firebasePush === 'function') window.sincronizarPendentes();
});

window.addEventListener('offline', () => { window.atualizarContador('offline'); });

window.addEventListener('DOMContentLoaded', async () => {
    window.aplicarViewMode(); 
    
    try {
        const dadosLocal = await window.lerDoIndexedDB();
        if (dadosLocal && dadosLocal.length > 0) {
            window.redesEmMemoria = dadosLocal;
            window.renderizarInterface(window.redesEmMemoria);
            window.atualizarContador(navigator.onLine ? 'sincronizando' : 'offline');
        }
    } catch (e) {}
    
    // CORREÇÃO 1: QR CODE LENGTH OVERFLOW
    if (typeof QRCode !== 'undefined') {
        window.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !entry.target.dataset.rendered) {
                    entry.target.innerHTML = "";
                    try {
                        // Função para escapar caracteres especiais no formato Wi-Fi
                        const escapeWiFiChar = (str) => {
                            return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/:/g, '\\:').replace(/"/g, '\\"');
                        };
                        
                        const ssid = escapeWiFiChar(entry.target.dataset.ssid);
                        const pass = escapeWiFiChar(entry.target.dataset.pass);
                        
                        // Formato Wi-Fi padrão com escape de caracteres especiais
                        const wifiString = `WIFI:S:${ssid};T:WPA;P:${pass};;`;
                        
                        // Tenta com diferentes níveis de correção (M é melhor para dados grandes)
                        let tentativas = [QRCode.CorrectLevel.M, QRCode.CorrectLevel.L, QRCode.CorrectLevel.H];
                        let gerado = false;
                        
                        for (let nivel of tentativas) {
                            try {
                                entry.target.innerHTML = "";
                                new QRCode(entry.target, { 
                                    text: wifiString,
                                    width: 130, 
                                    height: 130,
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

window.checarDuplicadoModal = function() {
    const s = document.getElementById('novoSSID').value.trim(); 
    const p = document.getElementById('novaSenha').value.trim();
    window.redeDuplicadaAtual = window.redesEmMemoria.find(r => r.ssid === s && r.senha === p);
    
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

    let novoId = 'local_' + Date.now(); 
    if (navigator.onLine && typeof window.firebasePush === 'function') {
        const key = window.firebasePush(s, p, lat, lng);
        if (key) novoId = key;
    }

    window.redesEmMemoria.push({ id: novoId, ssid: s, senha: p, lat, lng });
    window.redesEmMemoria.sort((a, b) => a.ssid.localeCompare(b.ssid));
    await window.atualizarBackupLocal(window.redesEmMemoria);
    window.renderizarInterface(window.redesEmMemoria);
    window.fecharModal(); 
    btnSalvar.innerText = "Salvar"; 
    btnSalvar.disabled = false;
    
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
                    window.redesEmMemoria.push({ id: 'local_' + Date.now() + adicionados, ssid: s, senha: p, lat: null, lng: null });
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

window.abrirModalExportar = function() { document.getElementById('modalExportar').style.display = 'flex'; };
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

window.compartilharRede = async function(ssid, senha) {
    window.vibrar();
    if (navigator.share) {
        navigator.share({ title: 'Wi-Fi: ' + ssid, text: `Rede: ${ssid}\nSenha: ${senha}` }).catch(() => {});
    } else {
        window.mostrarToast("Compartilhamento não suportado.");
    }
};
