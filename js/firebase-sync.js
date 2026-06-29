window.iniciarFirebaseSeguro = async function() {
    try {
        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js");
        const { getDatabase, ref, onValue, push, set, remove, update, query, orderByChild, limitToLast } = await import("https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js");

        const config = {
            apiKey: "AIzaSyCqDSP5SAZdMrHYvyeq9z9lZDp3UTcKu7Y",
            authDomain: "wifi-manager-pro-44487.firebaseapp.com",
            databaseURL: "https://wifi-manager-pro-44487-default-rtdb.firebaseio.com",
            projectId: "wifi-manager-pro-44487",
            storageBucket: "wifi-manager-pro-44487.firebasestorage.app",
            messagingSenderId: "653885032085",
            appId: "1:653885032085:web:3a443b20ad2c6c26067d9c",
            measurementId: "G-NFF0SWFB9P"
        };

        const app = initializeApp(config);
        const db = getDatabase(app);
        const redesRef = ref(db, 'redes_wifi');
        const logsRef = ref(db, 'app_logs');
        const logsQuery = query(logsRef, orderByChild('timestamp'), limitToLast(300));

        window.firebasePush = function(s, p, lat, lng, bssid = null, meta = {}) {
            const novaRedeRef = push(redesRef);
            const createdAt = Number(meta.createdAt) || Date.now();
            set(novaRedeRef, {
                ssid: s,
                senha: p,
                lat,
                lng,
                bssid: bssid || null,
                createdAt,
                createdAtIso: meta.createdAtIso || new Date(createdAt).toISOString(),
                createdAtLocal: meta.createdAtLocal || new Date(createdAt).toLocaleString('pt-BR')
            }).catch(()=>{});
            return novaRedeRef.key;
        };

        window.firebaseExcluir = function(id) {
            remove(ref(db, 'redes_wifi/' + id)).catch(()=>{});
        };

        window.firebaseAtualizar = function(id, lat, lng) {
            update(ref(db, 'redes_wifi/' + id), { lat, lng }).catch(()=>{});
        };

        window.firebaseEditarCredenciais = function(id, ssid, senha) {
            update(ref(db, 'redes_wifi/' + id), { ssid, senha }).catch(()=>{});
        };

        window.firebaseAtualizarObjeto = function(id, obj) {
            update(ref(db, 'redes_wifi/' + id), obj).catch(()=>{});
        };

        window.firebasePushLog = function(evento) {
            if (!evento || !evento.id) return Promise.resolve(null);
            const logId = String(evento.id).replace(/[.#$\/\[\]]/g, '_');
            return set(ref(db, 'app_logs/' + logId), {
                ...evento,
                id: logId,
                dados: evento.dados || {}
            });
        };

        window.firebaseLimparLogs = function() {
            return remove(logsRef);
        };

        if (typeof window.prepararMigracaoLogGlobal === 'function') {
            window.prepararMigracaoLogGlobal();
        }
        if (typeof window.sincronizarLogsPendentes === 'function') {
            window.sincronizarLogsPendentes();
        }

        const connectedRef = ref(db, '.info/connected');
        onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
                if (typeof window.sincronizarLogsPendentes === 'function') {
                    window.sincronizarLogsPendentes();
                }
                window.sincronizarPendentes();
            }
        });

        onValue(logsQuery, (snapshot) => {
            const dados = snapshot.val();
            let listaLogs = [];
            if (dados) {
                listaLogs = Object.keys(dados).map(id => ({ id, ...dados[id] }));
            }

            const pendentes = typeof window.obterLogsPendentes === 'function'
                ? window.obterLogsPendentes()
                : [];

            if (typeof window.salvarLogEventos === 'function') {
                window.salvarLogEventos([...listaLogs, ...pendentes]);
            }
            if (typeof window.renderizarLogDesenvolvedor === 'function') {
                window.renderizarLogDesenvolvedor();
            }
        });

        onValue(redesRef, (snapshot) => {
            const dados = snapshot.val();
            let listaNuvem = [];
            if (dados) {
                listaNuvem = Object.keys(dados).map(c => ({ id: c, ...dados[c] }));
            }

            const filaExclusao = JSON.parse(localStorage.getItem('wifi_pro_deletes_v1') || '[]');
            listaNuvem = listaNuvem.filter(r => !filaExclusao.includes(r.id));

            const filaUpdate = JSON.parse(localStorage.getItem('wifi_pro_updates_v1') || '{}');
            listaNuvem = listaNuvem.map(r => {
                if(filaUpdate[r.id]) {
                    if(filaUpdate[r.id].lat !== undefined) { r.lat = filaUpdate[r.id].lat; r.lng = filaUpdate[r.id].lng; }
                    if(filaUpdate[r.id].ssid !== undefined) { r.ssid = filaUpdate[r.id].ssid; r.senha = filaUpdate[r.id].senha; }
                    if(filaUpdate[r.id].bssid !== undefined) { r.bssid = filaUpdate[r.id].bssid; }
                }
                return r;
            });

            if (window.redePendenteExclusao) {
                listaNuvem = listaNuvem.filter(r => r.id !== window.redePendenteExclusao.id);
            }

            const pendentesLocais = window.redesEmMemoria.filter(r => String(r.id).startsWith('local_'));
            listaNuvem = [...listaNuvem, ...pendentesLocais];

            listaNuvem.sort((a, b) => a.ssid.localeCompare(b.ssid));
            
            window.redesEmMemoria = listaNuvem;
            if (typeof window.atualizarPreScanWifiComBanco === 'function') {
                window.atualizarPreScanWifiComBanco();
            }

            if (!window.mostrandoApenasProximas) { 
                window.renderizarInterface(window.redesEmMemoria); 
            }
            
            if (window.salvarNoIndexedDB) {
                window.salvarNoIndexedDB(listaNuvem);
            }
            
            window.atualizarContador('sincronizado', listaNuvem.length);
        });

    } catch (error) {
        console.warn("Modo Offline ativado: Firebase não carregou.", error);
        window.atualizarContador('offline');
    }
};

if (navigator.onLine) {
    window.iniciarFirebaseSeguro();
}
