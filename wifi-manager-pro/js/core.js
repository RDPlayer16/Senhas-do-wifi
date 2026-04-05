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
        window.pararRadar(true); 
        window.mostrarToast("Copiado e Radar desligado!"); 
    } else { 
        window.mostrarToast("Copiado!"); 
    }
};

// MANUTENÇÃO / HARD RESET
window.hardResetPWA = async function() {
    if(!confirm("Atenção: Isso vai limpar o cache interno e atualizar o App para a versão mais recente. Suas redes seguras no Firebase NÃO serão apagadas. Deseja continuar?")) return;
    
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
    
    const pendentesCriacao = window.redesEmMemoria.filter(r => String(r.id).startsWith('local_')).length;
    const pendentesExclusao = JSON.parse(localStorage.getItem('wifi_pro_deletes_v1') || '[]').length;
    const pendentesUpdate = Object.keys(JSON.parse(localStorage.getItem('wifi_pro_updates_v1') || '{}')).length;
    
    const totalPendentes = pendentesCriacao + pendentesExclusao + pendentesUpdate;
    const total = window.redesEmMemoria.length;
    
    let avisoPendentes = totalPendentes > 0 ? `<span style="color:#F59E0B; font-weight:bold; background:rgba(245, 158, 11, 0.15); padding:3px 8px; border-radius:6px; margin-left: 5px; border: 1px solid rgba(245, 158, 11, 0.3);">⚠️ ${totalPendentes} pendente(s)</span>` : '';

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
        
        pendentes.forEach(rede => {
            window.firebasePush(rede.ssid, rede.senha, rede.lat, rede.lng);
        });
    }
};

// EVENTOS BASE DO APLICATIVO
window.addEventListener('online', () => {
    window.atualizarContador('sincronizando');
    if (typeof window.firebasePush === 'function') window.sincronizarPendentes();
    else if (typeof window.iniciarFirebaseSeguro === 'function') window.iniciarFirebaseSeguro();
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
        } else {
            const cacheGeo = localStorage.getItem(DB_GEO_KEY);
            if (cacheGeo) { 
                window.redesEmMemoria = JSON.parse(cacheGeo);
                window.renderizarInterface(window.redesEmMemoria);
                window.salvarNoIndexedDB(window.redesEmMemoria); 
                window.atualizarContador(navigator.onLine ? 'sincronizando' : 'offline');
            }
        }
    } catch (e) {}
    
    if (typeof QRCode !== 'undefined') {
        window.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !entry.target.dataset.rendered) {
                    entry.target.innerHTML = "";
                    new QRCode(entry.target, { 
                        text: unescape(encodeURIComponent(`WIFI:S:${entry.target.dataset.ssid};T:WPA;P:${entry.target.dataset.pass};;`)), 
                        width: 130, height: 130,
                        colorDark : "#000000",
                        colorLight : "#ffffff"
                    });
                    entry.target.dataset.rendered = "true";
                }
            });
        }, { rootMargin: '100px' });
    }
});

// OPERAÇÕES DE REDE (CRUD)
window.renderizarInterface = function(lista, radar = false) {
    const out = document.getElementById('output');
    out.innerHTML = '';
    lista.forEach(r => {
        const div = document.createElement('div');
        div.className = 'card'; div.dataset.nomeRede = r.ssid.toLowerCase();
        const dist = radar && r.d < 1000 ? `<div class="badge-geo" style="background:rgba(16, 185, 129, 0.1); color:var(--success); border-color:rgba(16, 185, 129, 0.3);">A ${Math.round(r.d)}m</div>` : (r.lat ? `<div class="badge-geo">📍 Local Salvo</div>` : '');
        const btnMapa = r.lat ? "🗺️ Editar Local" : "📍 Add Local";
        const corMapa = r.lat ? "var(--geo)" : "#6366F1";

        div.innerHTML = `
            <div class="card-info">
                ${dist}
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
    
    if (window.redeDuplicadaAtual) {
        document.getElementById('msgDuplicadoModal').style.display = 'block'; 
        document.getElementById('btnSalvarModal').style.display = 'none'; 
        document.getElementById('containerCheckLocalizacao').style.display = 'none';
        document.getElementById('btnAdicionarGeo').style.display = 'flex';
        if (!window.redeDuplicadaAtual.lat) document.getElementById('msgDuplicadoModal').innerText = "ℹ️ Esta rede já existe sem localização. Atualize o GPS.";
        else document.getElementById('msgDuplicadoModal').innerText = "ℹ️ Esta rede já existe com localização.";
    } else {
        document.getElementById('msgDuplicadoModal').style.display = 'none'; 
        document.getElementById('btnSalvarModal').style.display = 'flex'; 
        document.getElementById('containerCheckLocalizacao').style.display = 'flex';
        document.getElementById('btnAdicionarGeo').style.display = 'none';
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
        if(!filaUpdate[id]) filaUpdate[id] = {};
        filaUpdate[id].ssid = s;
        filaUpdate[id].senha = p;
        localStorage.setItem('wifi_pro_updates_v1', JSON.stringify(filaUpdate));
    }

    window.redesEmMemoria.sort((a, b) => a.ssid.localeCompare(b.ssid));
    window.atualizarBackupLocal(window.redesEmMemoria);
    
    if (!window.mostrandoApenasProximas) window.renderizarInterface(window.redesEmMemoria);
    window.atualizarContador(navigator.onLine ? 'sincronizando' : 'offline');

    window.fecharModalEditar();
    window.mostrarToast("Rede atualizada com sucesso!");
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

    if (navigator.onLine && typeof window.firebaseExcluir === 'function') {
        if (!id.toString().startsWith('local_')) window.firebaseExcluir(id);
    } else {
        if (!id.toString().startsWith('local_')) {
            let filaExclusao = JSON.parse(localStorage.getItem('wifi_pro_deletes_v1') || '[]');
            if(!filaExclusao.includes(id)) filaExclusao.push(id);
            localStorage.setItem('wifi_pro_deletes_v1', JSON.stringify(filaExclusao));
        }
    }

    window.redePendenteExclusao = null;
    document.getElementById('toast-undo').className = '';
    window.atualizarContador(navigator.onLine ? 'sincronizando' : 'offline');
};

window.salvarRedeLocal = async function() {
    window.vibrar(); 
    const s = document.getElementById('novoSSID').value.trim();
    const p = document.getElementById('novaSenha').value.trim();
    
    if(!s || !p) { window.mostrarToast("Preencha o nome e a senha!"); return; }
    if(p.length < 8) { window.mostrarToast("⚠️ A senha deve ter no mínimo 8 caracteres!"); return; }

    const usarGeo = document.getElementById('checkLocalizacao').checked;
    const coordManual = document.getElementById('novaCoordenadaManual').value.trim();
    let lat = null, lng = null;
    const btnSalvar = document.getElementById('btnSalvarModal');

    if (coordManual) {
        const partes = coordManual.split(',');
        if (partes.length >= 2) {
            const l = parseFloat(partes[0].trim());
            const g = parseFloat(partes[1].trim());
            if (!isNaN(l) && !isNaN(g)) {
                lat = l; lng = g;
            } else {
                window.mostrarToast("Coordenadas manuais inválidas."); return;
            }
        } else {
            window.mostrarToast("Formato de GPS inválido. Use: Lat, Lng"); return;
        }
    } else if (usarGeo) {
        btnSalvar.innerText = "📍 GPS..."; btnSalvar.disabled = true;
        try {
            const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, {
                enableHighAccuracy: true, timeout: 10000, maximumAge: 0 
            }));
            lat = pos.coords.latitude; lng = pos.coords.longitude;
        } catch(e) {
            window.mostrarToast("Erro de GPS. Salvo sem localização.");
        }
    }

    let novoId = 'local_' + Date.now() + Math.floor(Math.random() * 1000); 
    if (navigator.onLine && typeof window.firebasePush === 'function') {
        try { const key = window.firebasePush(s, p, lat, lng); if (key) novoId = key; } catch(e) {}
    }

    const obj = { id: novoId, ssid: s, senha: p, lat, lng };
    window.redesEmMemoria.push(obj);
    window.redesEmMemoria.sort((a, b) => a.ssid.localeCompare(b.ssid));
    
    window.atualizarBackupLocal(window.redesEmMemoria);
    if (!window.mostrandoApenasProximas) window.renderizarInterface(window.redesEmMemoria);
    
    window.atualizarContador(navigator.onLine ? 'sincronizando' : 'offline');
    
    window.fecharModal(); 
    btnSalvar.innerText = "Salvar"; 
    btnSalvar.disabled = false;
    window.mostrarToast("Salvo com sucesso!");
};

window.importarListaTexto = async function() {
    window.vibrar();
    const texto = document.getElementById('listaInputOculta').value;
    if (!texto.trim()) return;

    const linhas = texto.split('\n');
    let adicionados = 0; let ignorados = 0;

    linhas.forEach(linha => {
        const l = linha.trim();
        if (l.startsWith('* ')) {
            const indexDoisPontos = l.indexOf(': ');
            if (indexDoisPontos !== -1) {
                const ssidExtraido = l.substring(2, indexDoisPontos).trim();
                const senhaExtraida = l.substring(indexDoisPontos + 2).trim();

                if (senhaExtraida.length < 8) { ignorados++; return; }

                const existe = window.redesEmMemoria.find(r => r.ssid === ssidExtraido && r.senha === senhaExtraida);
                if (!existe && ssidExtraido && senhaExtraida) {
                    let novoId = 'local_' + Date.now() + Math.floor(Math.random() * 10000) + adicionados;
                    if (navigator.onLine && typeof window.firebasePush === 'function') {
                        try { const key = window.firebasePush(ssidExtraido, senhaExtraida, null, null); if (key) novoId = key; } catch(e) {}
                    }
                    window.redesEmMemoria.push({ id: novoId, ssid: ssidExtraido, senha: senhaExtraida, lat: null, lng: null });
                    adicionados++;
                }
            }
        }
    });

    if (adicionados > 0) {
        window.redesEmMemoria.sort((a, b) => a.ssid.localeCompare(b.ssid));
        await window.atualizarBackupLocal(window.redesEmMemoria);
        if (!window.mostrandoApenasProximas) window.renderizarInterface(window.redesEmMemoria);
        
        window.atualizarContador(navigator.onLine ? 'sincronizando' : 'offline');
        
        let msg = `${adicionados} rede(s) importada(s)!`;
        if (ignorados > 0) msg += ` (${ignorados} ignoradas por senha curta)`;
        window.mostrarToast(msg);
    } else { window.mostrarToast("Nenhuma rede nova ou válida encontrada."); }
    window.fecharModalAvancado();
};

window.abrirModalExportar = function() { document.getElementById('modalExportar').style.display = 'flex'; };
window.fecharModalExportar = function() { document.getElementById('modalExportar').style.display = 'none'; };

window.exportarTXT = function() {
    window.vibrar();
    if (window.redesEmMemoria.length === 0) { window.mostrarToast("Nenhuma rede para exportar."); return; }
    let texto = "Senhas Wi-Fi Salvas\n\n";
    window.redesEmMemoria.forEach(r => { texto += `* ${r.ssid}: ${r.senha}\n`; });
    const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Senhas_WiFi_Backup.txt";
    a.click();
};

window.exportarPDF = function() {
    window.vibrar();
    if (typeof window.jspdf === 'undefined') { alert("Conecte-se à internet para carregar a biblioteca de PDF."); return; }
    if (window.redesEmMemoria.length === 0) { window.mostrarToast("Nenhuma rede para exportar."); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Backup de Senhas Wi-Fi", 10, 10);
    doc.setFontSize(12);
    let y = 20;
    window.redesEmMemoria.forEach((r, i) => {
        if (y > 280) { doc.addPage(); y = 10; }
        doc.text(`${i+1}. ${r.ssid} - Senha: ${r.senha}`, 10, y);
        y += 8;
    });
    doc.save("Senhas_WiFi_Backup.pdf");
};

window.compartilharRede = async function(ssid, senha) {
    window.vibrar();
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Conexão Wi-Fi: ' + ssid,
                text: `Conecte-se na minha rede Wi-Fi!\n\n📶 Rede: ${ssid}\n🔑 Senha: ${senha}`
            });
        } catch (err) { console.log('Compartilhamento cancelado'); }
    } else {
        window.mostrarToast("Seu navegador não suporta compartilhamento nativo.");
    }
};