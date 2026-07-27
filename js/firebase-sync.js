let firebaseSyncScheduleTimer = null;
let firebaseSyncStartInProgress = false;

window.iniciarFirebaseSeguro = async function() {
    if (window.firebaseSyncStarted || firebaseSyncStartInProgress) return;
    firebaseSyncStartInProgress = true;
    window.firebaseSyncStarted = true;

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

    const databaseURL = config.databaseURL.replace(/\/+$/, "");
    let restReadInProgress = false;
    window.firebaseSyncState = window.firebaseSyncState || {
        mode: "inicializando",
        databaseURL,
        lastSyncAt: null,
        lastOrigin: null,
        lastTotal: null,
        lastError: null
    };

    function atualizarEstadoFirebaseSync(patch = {}) {
        window.firebaseSyncState = {
            ...(window.firebaseSyncState || {}),
            databaseURL,
            ...patch
        };
        try {
            localStorage.setItem("wifi_pro_firebase_sync_state_v1", JSON.stringify(window.firebaseSyncState));
        } catch (error) {}
        return window.firebaseSyncState;
    }

    function definirBancoOnline(online, origem = null) {
        window.firebaseBancoOnline = online === true;
        atualizarEstadoFirebaseSync({
            databaseOnline: window.firebaseBancoOnline,
            connectivityCheckedAt: Date.now(),
            ...(origem ? { connectivityOrigin: origem } : {})
        });
        return window.firebaseBancoOnline;
    }

    window.getFirebaseDiagnosticState = function() {
        try {
            return {
                ...(JSON.parse(localStorage.getItem("wifi_pro_firebase_sync_state_v1") || "{}")),
                ...(window.firebaseSyncState || {}),
                databaseURL
            };
        } catch (error) {
            return { ...(window.firebaseSyncState || {}), databaseURL };
        }
    };

    function limparIdFirebase(id) {
        return String(id || "").replace(/[.#$\/\[\]]/g, "_");
    }

    function criarIdRest(prefixo = "rest") {
        return `${prefixo}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    function restUrl(path) {
        const cleanPath = String(path || "").replace(/^\/+/, "");
        const queryIndex = cleanPath.indexOf("?");
        if (queryIndex !== -1) {
            return `${databaseURL}/${cleanPath.slice(0, queryIndex)}.json${cleanPath.slice(queryIndex)}`;
        }
        return `${databaseURL}/${cleanPath}.json`;
    }

    async function firebaseRestRequest(path, options = {}) {
        try {
            const headers = {
                "Content-Type": "application/json",
                ...(options.headers || {})
            };
            const response = await fetch(restUrl(path), {
                cache: "no-store",
                ...options,
                headers
            });
            const text = await response.text();
            if (!response.ok) {
                throw new Error(`Firebase REST ${response.status}: ${text || response.statusText}`);
            }
            definirBancoOnline(true, "rest");
            return text ? JSON.parse(text) : null;
        } catch (error) {
            definirBancoOnline(false, "rest");
            throw error;
        }
    }

    function montarListaRedes(dados) {
        if (!dados) return [];
        return Object.keys(dados).map(id => ({ id, ...dados[id] }));
    }

    async function aplicarSnapshotRedes(dados, origem = "sdk") {
        let listaNuvem = montarListaRedes(dados);

        const filaExclusao = JSON.parse(localStorage.getItem("wifi_pro_deletes_v1") || "[]");
        listaNuvem = listaNuvem.filter(r => !filaExclusao.includes(r.id));

        const filaUpdate = JSON.parse(localStorage.getItem("wifi_pro_updates_v1") || "{}");
        listaNuvem = listaNuvem.map(r => {
            if (filaUpdate[r.id]) {
                if (filaUpdate[r.id].lat !== undefined) {
                    r.lat = filaUpdate[r.id].lat;
                    r.lng = filaUpdate[r.id].lng;
                }
                if (filaUpdate[r.id].ssid !== undefined) {
                    r.ssid = filaUpdate[r.id].ssid;
                    r.senha = filaUpdate[r.id].senha;
                }
                if (filaUpdate[r.id].bssid !== undefined) {
                    r.bssid = filaUpdate[r.id].bssid;
                }
            }
            return r;
        });

        if (window.redePendenteExclusao) {
            listaNuvem = listaNuvem.filter(r => r.id !== window.redePendenteExclusao.id);
        }

        const memoriaAtual = Array.isArray(window.redesEmMemoria) ? window.redesEmMemoria : [];
        const pendentesLocais = memoriaAtual.filter(r => String(r.id).startsWith("local_"));
        listaNuvem = [...listaNuvem, ...pendentesLocais];

        if (typeof window.deduplicarListaRedes === "function") {
            listaNuvem = window.deduplicarListaRedes(listaNuvem);
        }

        listaNuvem = typeof window.ordenarRedesAlfabeticamente === "function"
            ? window.ordenarRedesAlfabeticamente(listaNuvem)
            : listaNuvem.sort((a, b) => String(a.ssid || "").localeCompare(String(b.ssid || ""), "pt-BR"));

        const snapshotBase = listaNuvem
            .map(r => [r.id, r.ssid, r.senha, r.bssid, r.lat, r.lng, r.createdAt].join("|"))
            .join("||");
        let snapshotHash = 0;
        for (let i = 0; i < snapshotBase.length; i++) {
            snapshotHash = ((snapshotHash << 5) - snapshotHash + snapshotBase.charCodeAt(i)) | 0;
        }
        const snapshotKey = `redes:${snapshotHash}`;
        const snapshotAnterior = localStorage.getItem("wifi_pro_last_cloud_hash_v1");
        if (snapshotAnterior === snapshotKey && Array.isArray(window.redesEmMemoria) && window.redesEmMemoria.length > 0) {
            if (typeof window.atualizarContador === "function") {
                window.atualizarContador("sincronizado", listaNuvem.length);
            }
            atualizarEstadoFirebaseSync({
                mode: origem === "rest" ? "rest" : "sdk",
                lastSyncAt: Date.now(),
                lastOrigin: origem,
                lastTotal: listaNuvem.length,
                lastError: null,
                unchanged: true
            });
            return window.redesEmMemoria;
        }
        if (snapshotAnterior !== snapshotKey && typeof window.registrarLogEvento === "function") {
            window.registrarLogEvento("sync_recebido", `Banco recebido da nuvem: ${listaNuvem.length} rede(s)`, {
                total: listaNuvem.length,
                hash: snapshotKey,
                origem,
                operacao: "snapshot"
            });
            localStorage.setItem("wifi_pro_last_cloud_hash_v1", snapshotKey);
        }

        window.redesEmMemoria = listaNuvem;
        if (typeof window.atualizarPreScanWifiComBanco === "function") {
            window.atualizarPreScanWifiComBanco();
        }
        if (!window.mostrandoApenasProximas && typeof window.renderizarInterface === "function") {
            window.renderizarInterface(window.redesEmMemoria);
        }
        if (typeof window.salvarNoIndexedDB === "function") {
            await window.salvarNoIndexedDB(listaNuvem);
        }
        if (typeof window.atualizarContador === "function") {
            window.atualizarContador("sincronizado", listaNuvem.length);
        }
        atualizarEstadoFirebaseSync({
            mode: origem === "rest" ? "rest" : "sdk",
            lastSyncAt: Date.now(),
            lastOrigin: origem,
            lastTotal: listaNuvem.length,
            lastError: null
        });
        return listaNuvem;
    }

    window.instalarFirebaseRestFallback = function() {
        window.firebasePush = function(s, p, lat, lng, bssid = null, meta = {}) {
            const id = criarIdRest("rede");
            const createdAt = Number(meta.createdAt) || Date.now();
            const payload = {
                ssid: s,
                senha: p,
                lat,
                lng,
                bssid: bssid || null,
                logicalId: meta.logicalId || null,
                createdAt,
                createdAtIso: meta.createdAtIso || new Date(createdAt).toISOString(),
                createdAtLocal: meta.createdAtLocal || new Date(createdAt).toLocaleString("pt-BR")
            };
            firebaseRestRequest(`redes_wifi/${limparIdFirebase(id)}`, {
                method: "PUT",
                body: JSON.stringify(payload)
            }).catch(error => {
                console.warn("Firebase REST: falha ao criar rede.", error);
            });
            return id;
        };

        atualizarEstadoFirebaseSync({ mode: "rest" });

        window.firebaseExcluir = function(id) {
            return firebaseRestRequest(`redes_wifi/${limparIdFirebase(id)}`, { method: "DELETE" })
                .catch(error => console.warn("Firebase REST: falha ao excluir rede.", error));
        };

        window.firebaseAtualizar = function(id, lat, lng) {
            return window.firebaseAtualizarObjeto(id, { lat, lng });
        };

        window.firebaseEditarCredenciais = function(id, ssid, senha) {
            return window.firebaseAtualizarObjeto(id, { ssid, senha });
        };

        window.firebaseAtualizarObjeto = function(id, obj) {
            return firebaseRestRequest(`redes_wifi/${limparIdFirebase(id)}`, {
                method: "PATCH",
                body: JSON.stringify(obj || {})
            }).catch(error => console.warn("Firebase REST: falha ao atualizar rede.", error));
        };

        window.firebasePushLog = function(evento) {
            if (!evento || !evento.id) return Promise.resolve(null);
            const logId = limparIdFirebase(evento.id);
            return firebaseRestRequest(`app_logs/${logId}`, {
                method: "PUT",
                body: JSON.stringify({
                    ...evento,
                    id: logId,
                    dados: evento.dados || {}
                })
            });
        };

        window.firebaseLimparLogs = function() {
            return firebaseRestRequest("app_logs", { method: "DELETE" });
        };
    };

    window.carregarBancoFirebaseRest = async function(origem = "rest") {
        if (restReadInProgress) return false;
        restReadInProgress = true;
        try {
            if (typeof window.atualizarContador === "function") {
                window.atualizarContador("sincronizando");
            }
            const dados = await firebaseRestRequest("redes_wifi");
            await aplicarSnapshotRedes(dados, origem);
            if (typeof window.sincronizarLogsPendentes === "function") {
                window.sincronizarLogsPendentes();
            }
            if (typeof window.sincronizarPendentes === "function") {
                window.sincronizarPendentes();
            }
            return true;
        } catch (error) {
            definirBancoOnline(false, "rest");
            console.warn("Firebase REST: falha ao carregar banco.", error);
            atualizarEstadoFirebaseSync({
                mode: "rest",
                lastError: error.message || String(error)
            });
            if (typeof window.registrarLogEvento === "function") {
                window.registrarLogEvento("sync_erro", "Falha ao sincronizar pelo Firebase REST", {
                    erro: error.message || String(error),
                    origem
                });
            }
            if (typeof window.atualizarContador === "function") {
                window.atualizarContador("offline");
            }
            return false;
        } finally {
            restReadInProgress = false;
        }
    };

    window.executarDiagnosticoFirebase = async function() {
        const resultado = {
            ok: false,
            read: false,
            write: false,
            delete: false,
            mode: (window.firebaseSyncState && window.firebaseSyncState.mode) || "indefinido",
            testedAt: Date.now(),
            error: null
        };
        const id = "diagnostico_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        try {
            await firebaseRestRequest("redes_wifi?shallow=true");
            resultado.read = true;
            await firebaseRestRequest(`app_logs/${id}`, {
                method: "PUT",
                body: JSON.stringify({
                    id,
                    tipo: "diagnostico",
                    mensagem: "Teste temporario de escrita Firebase",
                    timestamp: resultado.testedAt
                })
            });
            resultado.write = true;
            await firebaseRestRequest(`app_logs/${id}`, { method: "DELETE" });
            resultado.delete = true;
            resultado.ok = resultado.read && resultado.write && resultado.delete;
            atualizarEstadoFirebaseSync({
                lastDiagnosticAt: resultado.testedAt,
                lastDiagnosticOk: resultado.ok,
                lastError: null
            });
        } catch (error) {
            resultado.error = error.message || String(error);
            atualizarEstadoFirebaseSync({
                lastDiagnosticAt: resultado.testedAt,
                lastDiagnosticOk: false,
                lastError: resultado.error
            });
        }
        return resultado;
    };

    window.instalarFirebaseRestFallback();

    try {
        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js");
        const { getDatabase, ref, onValue, push, set, remove, update, query, orderByChild, limitToLast, get } = await import("https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js");

        const app = initializeApp(config);
        const db = getDatabase(app, config.databaseURL);
        atualizarEstadoFirebaseSync({ mode: "sdk" });
        const redesRef = ref(db, "redes_wifi");
        const logsRef = ref(db, "app_logs");

        window.firebasePush = function(s, p, lat, lng, bssid = null, meta = {}) {
            const novaRedeRef = push(redesRef);
            const createdAt = Number(meta.createdAt) || Date.now();
            const payload = {
                ssid: s,
                senha: p,
                lat,
                lng,
                bssid: bssid || null,
                logicalId: meta.logicalId || null,
                createdAt,
                createdAtIso: meta.createdAtIso || new Date(createdAt).toISOString(),
                createdAtLocal: meta.createdAtLocal || new Date(createdAt).toLocaleString("pt-BR")
            };
            set(novaRedeRef, payload).catch(() => {
                window.instalarFirebaseRestFallback();
                window.firebaseAtualizarObjeto(novaRedeRef.key, payload);
            });
            return novaRedeRef.key;
        };

        window.firebaseExcluir = function(id) {
            return remove(ref(db, "redes_wifi/" + id)).catch(() => {
                window.instalarFirebaseRestFallback();
                return window.firebaseExcluir(id);
            });
        };

        window.firebaseAtualizar = function(id, lat, lng) {
            return update(ref(db, "redes_wifi/" + id), { lat, lng }).catch(() => {
                window.instalarFirebaseRestFallback();
                return window.firebaseAtualizar(id, lat, lng);
            });
        };

        window.firebaseEditarCredenciais = function(id, ssid, senha) {
            return update(ref(db, "redes_wifi/" + id), { ssid, senha }).catch(() => {
                window.instalarFirebaseRestFallback();
                return window.firebaseEditarCredenciais(id, ssid, senha);
            });
        };

        window.firebaseAtualizarObjeto = function(id, obj) {
            return update(ref(db, "redes_wifi/" + id), obj).catch(() => {
                window.instalarFirebaseRestFallback();
                return window.firebaseAtualizarObjeto(id, obj);
            });
        };

        window.firebasePushLog = function(evento) {
            if (!evento || !evento.id) return Promise.resolve(null);
            const logId = limparIdFirebase(evento.id);
            return set(ref(db, "app_logs/" + logId), {
                ...evento,
                id: logId,
                dados: evento.dados || {}
            }).catch(() => {
                window.instalarFirebaseRestFallback();
                return window.firebasePushLog(evento);
            });
        };

        window.firebaseLimparLogs = function() {
            return remove(logsRef).catch(() => {
                window.instalarFirebaseRestFallback();
                return window.firebaseLimparLogs();
            });
        };

        if (typeof window.prepararMigracaoLogGlobal === "function") {
            window.prepararMigracaoLogGlobal();
        }
        if (typeof window.sincronizarLogsPendentes === "function") {
            window.sincronizarLogsPendentes();
        }

        const connectedRef = ref(db, ".info/connected");
        onValue(connectedRef, (snap) => {
            const conectado = snap.val() === true;
            definirBancoOnline(conectado, "sdk");
            if (conectado) {
                if (typeof window.sincronizarLogsPendentes === "function") {
                    window.sincronizarLogsPendentes();
                }
                if (typeof window.sincronizarPendentes === "function") {
                    window.sincronizarPendentes();
                }
                if (typeof window.atualizarContador === "function") {
                    window.atualizarContador("sincronizado", (window.redesEmMemoria || []).length);
                }
            } else if (typeof window.atualizarContador === "function") {
                window.atualizarContador("offline");
            }
        }, (error) => {
            definirBancoOnline(false, "sdk");
            if (typeof window.atualizarContador === "function") window.atualizarContador("offline");
            console.warn("Firebase SDK: falha no indicador de conexao.", error);
        });

        window.carregarLogsFirebaseRecentes = async function(limit = 120) {
            const consulta = query(logsRef, orderByChild("timestamp"), limitToLast(Number(limit) || 120));
            const snapshot = await get(consulta);
            const dados = snapshot.val();
            let listaLogs = [];
            if (dados) {
                listaLogs = Object.keys(dados).map(id => ({ id, ...dados[id] }));
            }
            const pendentes = typeof window.obterLogsPendentes === "function"
                ? window.obterLogsPendentes()
                : [];
            if (typeof window.salvarLogEventos === "function") {
                window.salvarLogEventos([...listaLogs, ...pendentes]);
            }
            if (typeof window.renderizarLogDesenvolvedor === "function") {
                window.renderizarLogDesenvolvedor();
            }
        };

        let redesRealtimeTimer = null;
        let redesRealtimePrimeiroSnapshot = true;
        onValue(redesRef, (snapshot) => {
            if (typeof window.atualizarContador === "function" && redesRealtimePrimeiroSnapshot) {
                window.atualizarContador("sincronizando");
            }
            const delay = redesRealtimePrimeiroSnapshot ? 0 : 350;
            redesRealtimePrimeiroSnapshot = false;
            clearTimeout(redesRealtimeTimer);
            redesRealtimeTimer = setTimeout(() => {
                aplicarSnapshotRedes(snapshot.val(), "sdk_realtime").catch((error) => {
                    console.warn("Firebase SDK: falha ao aplicar redes em tempo real.", error);
                    if (typeof window.atualizarContador === "function") {
                        window.atualizarContador("offline");
                    }
                });
            }, delay);
        }, async (error) => {
            console.warn("Firebase SDK: falha ao escutar redes.", error);
            const ok = await window.carregarBancoFirebaseRest("erro_sdk_redes");
            if (!ok && typeof window.atualizarContador === "function") {
                window.atualizarContador("offline");
            }
        });
    } catch (error) {
        console.warn("Firebase SDK indisponivel. Tentando REST.", error);
        const ok = await window.carregarBancoFirebaseRest("catch_sdk");
        if (!ok && typeof window.atualizarContador === "function") {
            window.atualizarContador("offline");
        }
    } finally {
        firebaseSyncStartInProgress = false;
    }
};

function agendarFirebaseSeguro(delay = 1600) {
    clearTimeout(firebaseSyncScheduleTimer);
    firebaseSyncScheduleTimer = setTimeout(() => {
        if (navigator.onLine) {
            window.iniciarFirebaseSeguro();
        } else if (typeof window.atualizarContador === "function") {
            window.atualizarContador("offline");
        }
    }, delay);
}

window.addEventListener("online", () => agendarFirebaseSeguro(1200));
agendarFirebaseSeguro(1800);
