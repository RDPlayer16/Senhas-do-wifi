import { firebaseConfig } from "./firebase-config.js";

let firebaseSyncScheduleTimer = null;
let firebaseSyncStartInProgress = false;

window.iniciarFirebaseSeguro = async function() {
    if (!navigator.onLine) return;
    if (window.firebaseSyncStarted || firebaseSyncStartInProgress) return;
    firebaseSyncStartInProgress = true;
    if (typeof window.verificarAutorizacaoWifi === "function") {
        let autorizado = false;
        try {
            autorizado = await window.verificarAutorizacaoWifi({ reason: "before_sync" });
        } catch (error) {
            console.warn("Firebase Sync: falha ao confirmar autorizacao antes da sync.", error);
            firebaseSyncStartInProgress = false;
            if (typeof window.atualizarContador === "function") {
                window.atualizarContador("local");
            }
            return;
        }
        if (!autorizado) {
            if (typeof window.atualizarContador === "function") {
                window.atualizarContador(window.wifiAuthState?.status === "blocked" ? "bloqueado" : "local");
            }
            firebaseSyncStartInProgress = false;
            return;
        }
    }
    if (typeof window.podeSincronizarFirebaseComAuth === "function" && !window.podeSincronizarFirebaseComAuth()) {
        if (typeof window.atualizarContador === "function") {
            window.atualizarContador(window.wifiAuthState?.status === "blocked" ? "bloqueado" : "auth");
        }
        firebaseSyncStartInProgress = false;
        return;
    }
    window.firebaseSyncStarted = true;
    const config = window.WIFI_FIREBASE_CONFIG || firebaseConfig;

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

    function sincronizacaoAutorizada() {
        if (typeof window.podeSincronizarFirebaseComAuth !== "function") return true;
        return window.podeSincronizarFirebaseComAuth();
    }

    function atualizarEstadoSemAutorizacao() {
        if (typeof window.atualizarContador === "function") {
            window.atualizarContador(window.wifiAuthState?.status === "blocked" ? "bloqueado" : "auth");
        }
    }

    function exigirSincronizacaoAutorizada(contexto = "firebase") {
        if (sincronizacaoAutorizada()) return true;
        atualizarEstadoSemAutorizacao();
        throw new Error(`Sincronizacao bloqueada sem autorizacao: ${contexto}`);
    }

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

    async function restUrl(path) {
        const cleanPath = String(path || "").replace(/^\/+/, "");
        let url;
        const queryIndex = cleanPath.indexOf("?");
        if (queryIndex !== -1) {
            url = `${databaseURL}/${cleanPath.slice(0, queryIndex)}.json${cleanPath.slice(queryIndex)}`;
        } else {
            url = `${databaseURL}/${cleanPath}.json`;
        }
        const token = typeof window.getWifiAuthToken === "function"
            ? await window.getWifiAuthToken(false)
            : null;
        if (token) {
            url += `${url.includes("?") ? "&" : "?"}auth=${encodeURIComponent(token)}`;
        }
        return url;
    }

    async function firebaseRestRequest(path, options = {}) {
        exigirSincronizacaoAutorizada(path);
        const headers = {
            "Content-Type": "application/json",
            ...(options.headers || {})
        };
        const response = await fetch(await restUrl(path), {
            cache: "no-store",
            ...options,
            headers
        });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`Firebase REST ${response.status}: ${text || response.statusText}`);
        }
        return text ? JSON.parse(text) : null;
    }

    function montarListaRedes(dados) {
        if (!dados) return [];
        return Object.keys(dados).map(id => ({ id, ...dados[id] }));
    }

    async function aplicarSnapshotRedes(dados, origem = "sdk") {
        if (!sincronizacaoAutorizada()) {
            atualizarEstadoSemAutorizacao();
            return Array.isArray(window.redesEmMemoria) ? window.redesEmMemoria : [];
        }

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

        listaNuvem.sort((a, b) => String(a.ssid || "").localeCompare(String(b.ssid || "")));

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
            if (!sincronizacaoAutorizada()) return null;
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
            if (!sincronizacaoAutorizada()) return Promise.resolve(null);
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
            if (!sincronizacaoAutorizada()) return Promise.resolve(null);
            return firebaseRestRequest(`redes_wifi/${limparIdFirebase(id)}`, {
                method: "PATCH",
                body: JSON.stringify(obj || {})
            }).catch(error => console.warn("Firebase REST: falha ao atualizar rede.", error));
        };

        window.firebasePushLog = function(evento) {
            if (!evento || !evento.id) return Promise.resolve(null);
            if (!sincronizacaoAutorizada()) return Promise.resolve(null);
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
            if (!sincronizacaoAutorizada()) return Promise.resolve(null);
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
        const { initializeApp, getApps, getApp } = await import("https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js");
        const { getDatabase, ref, onValue, push, set, remove, update, query, orderByChild, limitToLast, get } = await import("https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js");

        const app = getApps().length ? getApp() : initializeApp(config);
        const db = getDatabase(app, config.databaseURL);
        atualizarEstadoFirebaseSync({ mode: "sdk" });
        const redesRef = ref(db, "redes_wifi");
        const logsRef = ref(db, "app_logs");

        window.firebasePush = function(s, p, lat, lng, bssid = null, meta = {}) {
            if (!sincronizacaoAutorizada()) return null;
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
            if (!sincronizacaoAutorizada()) return Promise.resolve(null);
            return remove(ref(db, "redes_wifi/" + id)).catch(() => {
                window.instalarFirebaseRestFallback();
                return window.firebaseExcluir(id);
            });
        };

        window.firebaseAtualizar = function(id, lat, lng) {
            if (!sincronizacaoAutorizada()) return Promise.resolve(null);
            return update(ref(db, "redes_wifi/" + id), { lat, lng }).catch(() => {
                window.instalarFirebaseRestFallback();
                return window.firebaseAtualizar(id, lat, lng);
            });
        };

        window.firebaseEditarCredenciais = function(id, ssid, senha) {
            if (!sincronizacaoAutorizada()) return Promise.resolve(null);
            return update(ref(db, "redes_wifi/" + id), { ssid, senha }).catch(() => {
                window.instalarFirebaseRestFallback();
                return window.firebaseEditarCredenciais(id, ssid, senha);
            });
        };

        window.firebaseAtualizarObjeto = function(id, obj) {
            if (!sincronizacaoAutorizada()) return Promise.resolve(null);
            return update(ref(db, "redes_wifi/" + id), obj).catch(() => {
                window.instalarFirebaseRestFallback();
                return window.firebaseAtualizarObjeto(id, obj);
            });
        };

        window.firebasePushLog = function(evento) {
            if (!evento || !evento.id) return Promise.resolve(null);
            if (!sincronizacaoAutorizada()) return Promise.resolve(null);
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
            if (!sincronizacaoAutorizada()) return Promise.resolve(null);
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
            if (snap.val() === true) {
                if (!sincronizacaoAutorizada()) return;
                if (typeof window.sincronizarLogsPendentes === "function") {
                    window.sincronizarLogsPendentes();
                }
                if (typeof window.sincronizarPendentes === "function") {
                    window.sincronizarPendentes();
                }
            }
        }, (error) => {
            console.warn("Firebase SDK: falha no indicador de conexao.", error);
        });

        window.carregarLogsFirebaseRecentes = async function(limit = 120) {
            if (!sincronizacaoAutorizada()) return;
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
            if (!sincronizacaoAutorizada()) return;
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
                        window.atualizarContador("local");
                    }
                });
            }, delay);
        }, async (error) => {
            console.warn("Firebase SDK: falha ao escutar redes.", error);
            const ok = await window.carregarBancoFirebaseRest("erro_sdk_redes");
            if (!ok && typeof window.atualizarContador === "function") {
                window.atualizarContador("local");
            }
        });
    } catch (error) {
        console.warn("Firebase SDK indisponivel. Tentando REST.", error);
        const ok = await window.carregarBancoFirebaseRest("catch_sdk");
        if (!ok && typeof window.atualizarContador === "function") {
            window.atualizarContador(navigator.onLine ? "local" : "offline");
        }
    } finally {
        firebaseSyncStartInProgress = false;
    }
};

async function iniciarFirebaseQuandoAutenticado() {
    if (!navigator.onLine) {
        if (typeof window.atualizarContador === "function") {
            window.atualizarContador("offline");
        }
        return;
    }
    if (typeof window.waitForWifiAuthInitial === "function") {
        await window.waitForWifiAuthInitial();
    }
    if (window.wifiAuthState?.status === "blocked") {
        if (typeof window.atualizarContador === "function") {
            window.atualizarContador("bloqueado");
        }
        return;
    }
    if (typeof window.verificarAutorizacaoWifi === "function") {
        const autorizado = await window.verificarAutorizacaoWifi({ reason: "start_sync" });
        if (!autorizado) {
            if (typeof window.atualizarContador === "function") {
                window.atualizarContador(
                    window.wifiAuthState?.status === "blocked"
                        ? "bloqueado"
                        : typeof window.temSessaoLocalWifi === "function" && window.temSessaoLocalWifi()
                            ? "local"
                            : "auth"
                );
            }
            return;
        }
    }
    if (typeof window.podeSincronizarFirebaseComAuth === "function" && !window.podeSincronizarFirebaseComAuth()) {
        if (typeof window.atualizarContador === "function") {
            window.atualizarContador(
                typeof window.temSessaoLocalWifi === "function" && window.temSessaoLocalWifi()
                    ? "local"
                    : "auth"
            );
        }
        return;
    }
    window.iniciarFirebaseSeguro();
}

function agendarFirebaseQuandoAutenticado(delay = 1800) {
    clearTimeout(firebaseSyncScheduleTimer);
    firebaseSyncScheduleTimer = setTimeout(() => {
        iniciarFirebaseQuandoAutenticado();
    }, delay);
}

window.addEventListener("wifi-auth-sync-allowed", () => agendarFirebaseQuandoAutenticado(1200));
window.addEventListener("online", () => agendarFirebaseQuandoAutenticado(1800));
agendarFirebaseQuandoAutenticado(2200);
