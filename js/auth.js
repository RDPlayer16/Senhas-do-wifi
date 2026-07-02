import { firebaseConfig } from "./firebase-config.js";

const SDK_VERSION = "12.10.0";
const PROFILE_KEY = "wifi_pro_auth_profile_v1";
const AUTHORIZATION_KEY = "wifi_pro_auth_authorization_v1";
const SIGNED_OUT_KEY = "wifi_pro_auth_signed_out_v1";
const LOCAL_SESSION_STATUSES = ["signed-in", "offline-signed-in", "checking"];
const AUTHORIZATION_REFRESH_MS = 2 * 60 * 1000;
const AUTHORIZATION_RECHECK_DEBOUNCE_MS = 15000;

let auth = null;
let authInitPromise = null;
let initialAuthResolved = false;
let resolveInitialAuth;
let authorizationCheckPromise = null;
let authorizationTimer = null;
let lastAuthorizationCheckAt = 0;
let accessBlocked = false;
let authMode = "login";

window.wifiAuthState = {
    status: "loading",
    user: null,
    profile: null,
    authorization: null,
    error: null
};

window.wifiAuthInitialPromise = new Promise((resolve) => {
    resolveInitialAuth = resolve;
});

function waitForDom() {
    if (document.readyState !== "loading") return Promise.resolve();
    return new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

function readJsonStorage(key) {
    try {
        return JSON.parse(localStorage.getItem(key) || "null");
    } catch (error) {
        return null;
    }
}

function readCachedProfile() {
    return readJsonStorage(PROFILE_KEY);
}

function readCachedAuthorization() {
    return readJsonStorage(AUTHORIZATION_KEY);
}

function getAuthorizationForProfile(profile = readCachedProfile()) {
    const authorization = readCachedAuthorization();
    if (!profile || !authorization) return null;
    if (String(authorization.uid || "") !== String(profile.uid || "")) return null;
    return authorization;
}

function isAuthorizationActive(authorization) {
    return authorization?.active === true || authorization?.active === "true";
}

function isAuthorizationPending(authorization) {
    return authorization?.status === "pending" || authorization?.pending === true;
}

function normalizeRole(role) {
    const normalized = String(role || "user").trim().toLowerCase();
    return normalized === "admin" ? "admin" : "user";
}

function getRuntimeLabel() {
    return typeof window.getAppPlatformLabel === "function" ? window.getAppPlatformLabel() : "PWA";
}

function saveProfile(user, authorization = null) {
    const profile = {
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || user.email || "Usuario",
        role: normalizeRole(authorization?.role || getAuthorizationForProfile({ uid: user.uid })?.role),
        lastAuthAt: Date.now()
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    localStorage.removeItem(SIGNED_OUT_KEY);
    return profile;
}

function saveAuthorization(authorization) {
    localStorage.setItem(AUTHORIZATION_KEY, JSON.stringify(authorization));
    return authorization;
}

function clearLocalAuthCache() {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(AUTHORIZATION_KEY);
}

function wasSignedOut() {
    return localStorage.getItem(SIGNED_OUT_KEY) === "true";
}

function resolveInitialOnce() {
    if (initialAuthResolved) return;
    initialAuthResolved = true;
    resolveInitialAuth(window.wifiAuthState);
}

function emitAuthEvent(name = "wifi-auth-state-changed") {
    window.dispatchEvent(new CustomEvent(name, { detail: window.wifiAuthState }));
}

function setAuthState(status, patch = {}) {
    window.wifiAuthState = {
        ...(window.wifiAuthState || {}),
        status,
        ...patch
    };
    renderAuthUi();
    emitAuthEvent();
    if (
        status === "signed-in" &&
        navigator.onLine &&
        isAuthorizationActive(window.wifiAuthState.authorization)
    ) {
        emitAuthEvent("wifi-auth-sync-allowed");
    }
}

function getAuthMessage(status, error = null) {
    if (status === "loading") {
        return ["Verificando sessao", "Aguarde enquanto o app confere o login salvo neste dispositivo."];
    }
    if (status === "signing-in") {
        return ["Entrando", "Validando conta e permissao de acesso."];
    }
    if (status === "creating-account") {
        return ["Criando conta", "Registrando sua solicitacao para o administrador liberar."];
    }
    if (status === "pending") {
        return ["Aguardando autorizacao", error || "Sua conta foi criada. O administrador precisa liberar o acesso antes de usar o app."];
    }
    if (status === "signed-out") {
        return ["Entrar no Wi-Fi Manager Pro", "Entre com sua conta ou crie uma nova solicitacao de acesso."];
    }
    if (status === "offline-no-session") {
        return ["Login necessario", "Conecte a internet para entrar pela primeira vez."];
    }
    if (status === "offline-signed-in") {
        return ["Modo offline", "Sessao local autorizada. A sincronizacao volta quando houver internet."];
    }
    if (status === "checking") {
        return ["Verificando sessao", "Voce pode continuar usando o app enquanto a permissao e validada em segundo plano."];
    }
    if (status === "blocked") {
        return ["Acesso bloqueado", error || "Este dispositivo foi bloqueado pelo administrador."];
    }
    if (status === "error") {
        return ["Falha no login", error || "Nao foi possivel validar a sessao agora."];
    }
    return ["Sessao ativa", "Login validado."];
}

function renderAuthUi() {
    const state = window.wifiAuthState || {};
    const overlay = document.getElementById("authOverlay");
    const card = overlay ? overlay.querySelector(".auth-card") : null;
    const form = document.getElementById("authLoginForm");
    const title = document.getElementById("authTitle");
    const message = document.getElementById("authMessage");
    const status = document.getElementById("authStatus");
    const submit = document.getElementById("authSubmitButton");
    const modeTabs = document.getElementById("authModeTabs");
    const loginModeButton = document.getElementById("authLoginModeButton");
    const createModeButton = document.getElementById("authCreateModeButton");
    const nameRow = document.getElementById("authNameRow");
    const passwordInput = document.getElementById("authPassword");
    const pendingActions = document.getElementById("authPendingActions");
    const blockedActions = document.getElementById("authBlockedActions");
    const accountEmail = document.getElementById("drawerAccountEmail");
    const accountStatus = document.getElementById("drawerAccountStatus");
    const accountBox = document.getElementById("drawerAccountBox");
    const settingsEmail = document.getElementById("settingsAccountEmail");
    const settingsStatus = document.getElementById("settingsAccountStatus");
    const profile = state.profile || null;
    const authorization = state.authorization || getAuthorizationForProfile(profile);
    const email = profile?.email || state.user?.email || "";
    const blocked = state.status === "blocked";
    const pending = state.status === "pending";
    const signedIn = !!profile && LOCAL_SESSION_STATUSES.includes(state.status);
    const showLogin = blocked || pending || !signedIn;
    const disabled = ["loading", "offline-no-session", "signing-in", "creating-account"].includes(state.status);
    const [titleText, messageText] = getAuthMessage(state.status, state.error);

    document.body.classList.toggle("auth-locked", showLogin);
    document.body.classList.toggle("auth-ready", signedIn && !blocked);
    document.body.classList.toggle("auth-blocked", blocked);
    document.body.classList.toggle("auth-pending", pending);
    document.body.classList.toggle("auth-register-mode", authMode === "register");
    document.body.classList.toggle("admin-mode", signedIn && !blocked && authorization?.role === "admin");
    document.body.classList.toggle("developer-mode", signedIn && !blocked && authorization?.role === "admin");

    if (card) card.classList.toggle("auth-blocked-card", blocked);
    if (overlay) overlay.style.display = showLogin ? "flex" : "none";
    if (form) form.style.display = state.status === "loading" || blocked || pending ? "none" : "flex";
    if (modeTabs) modeTabs.style.display = state.status === "loading" || blocked || pending ? "none" : "grid";
    if (pendingActions) pendingActions.style.display = pending ? "grid" : "none";
    if (blockedActions) blockedActions.style.display = blocked ? "grid" : "none";
    if (loginModeButton) loginModeButton.classList.toggle("active", authMode === "login");
    if (createModeButton) createModeButton.classList.toggle("active", authMode === "register");
    if (nameRow) nameRow.style.display = authMode === "register" ? "flex" : "none";
    if (passwordInput) passwordInput.autocomplete = authMode === "register" ? "new-password" : "current-password";
    if (title) title.textContent = titleText;
    if (message) message.textContent = messageText;
    if (status) {
        status.textContent = state.error
            || (authMode === "register" && state.status === "signed-out" ? "A conta criada fica pendente ate o admin liberar." : "")
            || (state.status === "offline-no-session" ? "Sem sessao local." : "");
        status.classList.toggle("danger", !!state.error || state.status === "offline-no-session");
    }
    if (submit) {
        submit.disabled = disabled;
        submit.textContent = authMode === "register" ? "Criar conta" : "Entrar";
    }

    if (accountBox) accountBox.style.display = signedIn && !blocked ? "flex" : "none";
    if (accountEmail) accountEmail.textContent = email || "Conta local";
    if (accountStatus) {
        accountStatus.textContent = state.status === "offline-signed-in"
            ? "Offline"
            : state.status === "checking"
                ? "Verificando"
                : authorization?.role === "admin"
                    ? "Admin"
                    : "Online";
    }
    if (settingsEmail) settingsEmail.textContent = email || "Nenhuma conta conectada";
    if (settingsStatus) {
        settingsStatus.textContent = signedIn && !blocked
            ? state.status === "offline-signed-in"
                ? "Sessao local autorizada"
                : state.status === "checking"
                    ? "Verificando permissao"
                    : authorization?.role === "admin"
                        ? "Administrador autorizado"
                        : "Sessao autorizada"
            : blocked
                ? "Acesso bloqueado"
                : "Login pendente";
    }
}

function mapAuthError(error) {
    const code = String(error?.code || error?.message || "");
    if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password")) return "E-mail ou senha invalidos.";
    if (code.includes("auth/user-not-found")) return "Conta nao encontrada.";
    if (code.includes("auth/email-already-in-use")) return "Este e-mail ja tem conta. Use Entrar.";
    if (code.includes("auth/weak-password")) return "Use uma senha com pelo menos 6 caracteres.";
    if (code.includes("auth/invalid-email")) return "Informe um e-mail valido.";
    if (code.includes("auth/too-many-requests")) return "Muitas tentativas. Aguarde um pouco e tente de novo.";
    if (code.includes("auth/network-request-failed")) return "Falha de rede. Verifique a internet.";
    if (code.includes("auth/operation-not-allowed")) return "Login por e-mail e senha ainda nao esta ativo no Firebase Auth.";
    return "Nao foi possivel entrar. Confira os dados e tente novamente.";
}

function getDatabaseURL() {
    const config = window.WIFI_FIREBASE_CONFIG || firebaseConfig;
    return String(config.databaseURL || "").replace(/\/+$/, "");
}

function limparIdFirebase(id) {
    return String(id || "").replace(/[.#$\/\[\]]/g, "_");
}

function criarIdLogAuth(prefixo = "auth") {
    return `${prefixo}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function getCurrentUserToken(forceRefresh = false) {
    if (!auth || !auth.currentUser) return null;
    return auth.currentUser.getIdToken(!!forceRefresh);
}

async function buildRestUrl(path, forceRefresh = false) {
    const cleanPath = String(path || "").replace(/^\/+/, "");
    const queryIndex = cleanPath.indexOf("?");
    let url;
    if (queryIndex !== -1) {
        url = `${getDatabaseURL()}/${cleanPath.slice(0, queryIndex)}.json${cleanPath.slice(queryIndex)}`;
    } else {
        url = `${getDatabaseURL()}/${cleanPath}.json`;
    }
    const token = await getCurrentUserToken(forceRefresh);
    if (!token) throw new Error("Token de login indisponivel");
    url += `${url.includes("?") ? "&" : "?"}auth=${encodeURIComponent(token)}`;
    return url;
}

async function firebaseAuthRestRequest(path, options = {}, forceRefresh = false) {
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };
    const response = await fetch(await buildRestUrl(path, forceRefresh), {
        cache: "no-store",
        ...options,
        headers
    });
    const text = await response.text();
    if (!response.ok) {
        if (!forceRefresh && (response.status === 401 || response.status === 403)) {
            return firebaseAuthRestRequest(path, options, true);
        }
        throw new Error(`Firebase REST ${response.status}: ${text || response.statusText}`);
    }
    return text ? JSON.parse(text) : null;
}

function normalizeRemoteAuthorization(record, user, reason = "check") {
    const now = Date.now();
    const remoteExists = !!record && typeof record === "object";
    const role = normalizeRole(record?.role);
    const active = remoteExists && isAuthorizationActive(record);
    const status = remoteExists
        ? String(record?.status || (active ? "active" : "blocked")).toLowerCase()
        : "missing";
    return {
        uid: user?.uid || record?.uid || "",
        email: record?.email || user?.email || "",
        displayName: record?.displayName || user?.displayName || user?.email || "Usuario",
        role,
        isAdmin: role === "admin",
        active,
        status,
        wipeLocalOnRevoke: record?.wipeLocalOnRevoke !== false,
        remoteExists,
        requestedAt: Number(record?.requestedAt || 0),
        approvedAt: Number(record?.approvedAt || 0),
        blockedAt: Number(record?.blockedAt || 0),
        checkedAt: now,
        checkedAtIso: new Date(now).toISOString(),
        source: reason
    };
}

async function enviarLogAutorizacaoRemoto(tipo, mensagem, dados = {}) {
    try {
        const user = auth?.currentUser || null;
        if (!user) return;
        const timestamp = Number(dados.timestamp) || Date.now();
        const id = criarIdLogAuth(tipo);
        const profile = window.wifiAuthState?.profile || readCachedProfile() || {};
        const authorization = window.wifiAuthState?.authorization || getAuthorizationForProfile(profile) || {};
        const usuario = {
            uid: user.uid,
            email: user.email || profile.email || "",
            displayName: user.displayName || profile.displayName || user.email || "Usuario",
            role: normalizeRole(authorization.role || profile.role)
        };
        await firebaseAuthRestRequest(`app_logs/${limparIdFirebase(id)}`, {
            method: "PUT",
            body: JSON.stringify({
                id,
                tipo,
                mensagem,
                timestamp,
                dataIso: new Date(timestamp).toISOString(),
                dataLocal: new Date(timestamp).toLocaleString("pt-BR"),
                deviceId: typeof window.obterLogDeviceId === "function" ? window.obterLogDeviceId() : null,
                runtime: getRuntimeLabel().toLowerCase(),
                userUid: usuario.uid,
                userEmail: usuario.email,
                userRole: usuario.role,
                usuario,
                dados: {
                    ...dados,
                    usuario
                }
            })
        });
    } catch (error) {
        console.warn("Firebase Auth: falha ao registrar log de autorizacao.", error);
    }
}

async function atualizarUltimoAcesso(user, authorization) {
    if (!user || !isAuthorizationActive(authorization)) return;
    try {
        const now = Date.now();
        await firebaseAuthRestRequest(`authorized_users/${limparIdFirebase(user.uid)}`, {
            method: "PATCH",
            body: JSON.stringify({
                lastSeenAt: now,
                lastSeenAtIso: new Date(now).toISOString(),
                lastPlatform: getRuntimeLabel().toLowerCase(),
                lastVersion: window.APP_VERSION || "3.0"
            })
        });
    } catch (error) {
        console.warn("Firebase Auth: nao foi possivel atualizar ultimo acesso.", error);
    }
}

async function registrarSolicitacaoUsuario(user, displayName = "", source = "self_signup") {
    if (!user) throw new Error("Usuario indisponivel para cadastro");
    const now = Date.now();
    const payload = {
        uid: user.uid,
        email: user.email || "",
        displayName: displayName || user.displayName || user.email || "Usuario",
        role: "user",
        active: false,
        status: "pending",
        pending: true,
        wipeLocalOnRevoke: true,
        requestedAt: now,
        requestedAtIso: new Date(now).toISOString(),
        requestedPlatform: getRuntimeLabel().toLowerCase(),
        requestedVersion: window.APP_VERSION || "3.0",
        requestSource: source,
        updatedAt: now,
        updatedAtIso: new Date(now).toISOString()
    };
    await firebaseAuthRestRequest(`authorized_users/${limparIdFirebase(user.uid)}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
    });
    return normalizeRemoteAuthorization(payload, user, source);
}

function manterContaPendente(user, authorization, reason = "pending") {
    const pendingAuthorization = {
        ...authorization,
        uid: authorization?.uid || user?.uid || "",
        email: authorization?.email || user?.email || "",
        displayName: authorization?.displayName || user?.displayName || user?.email || "Usuario",
        role: "user",
        active: false,
        status: "pending",
        pending: true,
        source: reason
    };
    saveAuthorization(pendingAuthorization);
    const profile = saveProfile(user, pendingAuthorization);
    setAuthState("pending", {
        user,
        profile,
        authorization: pendingAuthorization,
        error: null
    });
    scheduleAuthorizationWatcher();
    return false;
}

function getBlockedMessage(authorization) {
    if (authorization?.remoteExists === false) {
        return "Esta conta nao esta mais autorizada neste app. O banco local foi protegido.";
    }
    return "Esta conta foi desativada pelo administrador. O banco local foi protegido.";
}

async function bloquearAcessoWifi(authorization, reason = "revoked") {
    if (accessBlocked && window.wifiAuthState?.status === "blocked") return false;
    accessBlocked = true;

    const user = auth?.currentUser || null;
    const profile = window.wifiAuthState?.profile || readCachedProfile() || {
        uid: user?.uid || authorization?.uid || "",
        email: user?.email || authorization?.email || "",
        displayName: user?.displayName || authorization?.displayName || user?.email || "Usuario",
        role: normalizeRole(authorization?.role)
    };
    const blockedAuthorization = {
        ...authorization,
        active: false,
        blockedAt: Date.now(),
        blockedAtIso: new Date().toISOString(),
        reason
    };
    const message = getBlockedMessage(blockedAuthorization);

    setAuthState("blocked", {
        user: null,
        profile,
        authorization: blockedAuthorization,
        error: message
    });
    if (typeof window.atualizarContador === "function") {
        window.atualizarContador("bloqueado");
    }

    await enviarLogAutorizacaoRemoto("acesso_bloqueado", message, {
        uid: blockedAuthorization.uid || profile.uid || null,
        email: blockedAuthorization.email || profile.email || null,
        motivo: reason,
        remoteExists: blockedAuthorization.remoteExists,
        wipeLocalOnRevoke: blockedAuthorization.wipeLocalOnRevoke !== false
    });

    try {
        if (auth && auth.currentUser) {
            const authModule = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`);
            await authModule.signOut(auth);
        }
    } catch (error) {
        console.warn("Firebase Auth: falha ao encerrar sessao bloqueada.", error);
    }

    if (blockedAuthorization.wipeLocalOnRevoke !== false && typeof window.limparDadosLocaisPorRevogacao === "function") {
        await window.limparDadosLocaisPorRevogacao({
            uid: blockedAuthorization.uid || profile.uid || null,
            email: blockedAuthorization.email || profile.email || null,
            reason
        });
    } else {
        clearLocalAuthCache();
    }

    localStorage.setItem(SIGNED_OUT_KEY, "true");
    clearLocalAuthCache();
    setAuthState("blocked", {
        user: null,
        profile,
        authorization: blockedAuthorization,
        error: message
    });
    emitAuthEvent("wifi-auth-blocked");
    return false;
}

async function verificarAutorizacaoAtual(options = {}) {
    const { force = false, reason = "manual" } = options;
    if (!auth || !auth.currentUser) return false;
    if (accessBlocked) return false;

    if (!navigator.onLine) {
        const profile = readCachedProfile();
        const authorization = getAuthorizationForProfile(profile);
        if (profile && !wasSignedOut() && isAuthorizationActive(authorization)) {
            setAuthState("offline-signed-in", {
                user: null,
                profile,
                authorization,
                error: null
            });
            return false;
        }
        return false;
    }

    const now = Date.now();
    if (
        !force &&
        lastAuthorizationCheckAt &&
        now - lastAuthorizationCheckAt < AUTHORIZATION_RECHECK_DEBOUNCE_MS &&
        isAuthorizationActive(window.wifiAuthState?.authorization)
    ) {
        return true;
    }

    if (authorizationCheckPromise) return authorizationCheckPromise;

    authorizationCheckPromise = (async () => {
        const user = auth.currentUser;
        const cachedProfile = readCachedProfile();
        const cachedAuthorization = getAuthorizationForProfile(cachedProfile);
        setAuthState(isAuthorizationPending(cachedAuthorization) ? "pending" : "checking", {
            user,
            profile: cachedProfile || saveProfile(user, cachedAuthorization),
            authorization: cachedAuthorization,
            error: null
        });

        try {
            const record = await firebaseAuthRestRequest(`authorized_users/${limparIdFirebase(user.uid)}`);
            const authorization = normalizeRemoteAuthorization(record, user, reason);
            lastAuthorizationCheckAt = Date.now();

            if (authorization.remoteExists === false && !isAuthorizationActive(cachedAuthorization)) {
                try {
                    const pendingAuthorization = await registrarSolicitacaoUsuario(user, user.displayName || cachedProfile?.displayName || user.email || "Usuario", "login_request");
                    return manterContaPendente(user, pendingAuthorization, reason);
                } catch (requestError) {
                    console.warn("Firebase Auth: falha ao registrar solicitacao pendente.", requestError);
                    setAuthState("pending", {
                        user,
                        profile: cachedProfile || saveProfile(user, null),
                        authorization: {
                            uid: user.uid,
                            email: user.email || "",
                            displayName: user.displayName || user.email || "Usuario",
                            role: "user",
                            active: false,
                            status: "pending",
                            pending: true,
                            remoteExists: false
                        },
                        error: "Conta criada, mas a solicitacao nao foi registrada. Avise o administrador."
                    });
                    scheduleAuthorizationWatcher();
                    return false;
                }
            }

            if (isAuthorizationPending(authorization)) {
                return manterContaPendente(user, authorization, reason);
            }

            if (!isAuthorizationActive(authorization)) {
                return bloquearAcessoWifi(authorization, reason);
            }

            saveAuthorization(authorization);
            const profile = saveProfile(user, authorization);
            const wasSignedIn = window.wifiAuthState?.status === "signed-in";
            setAuthState("signed-in", {
                user,
                profile,
                authorization,
                error: null
            });
            scheduleAuthorizationWatcher();
            atualizarUltimoAcesso(user, authorization);

            if (!wasSignedIn && typeof window.registrarLogEvento === "function") {
                window.registrarLogEvento("login_autorizado", `Login autorizado: ${authorization.email || user.email}`, {
                    uid: authorization.uid,
                    email: authorization.email || user.email || "",
                    role: authorization.role,
                    plataforma: getRuntimeLabel(),
                    operacao: "auth_check"
                });
            }

            return true;
        } catch (error) {
            console.warn("Firebase Auth: falha ao validar autorizacao.", error);
            const profile = readCachedProfile();
            const authorization = getAuthorizationForProfile(profile);
            if (profile && !wasSignedOut() && isAuthorizationActive(authorization)) {
                setAuthState("checking", {
                    user,
                    profile,
                    authorization,
                    error: null
                });
            } else if (profile && !wasSignedOut() && isAuthorizationPending(authorization)) {
                setAuthState("pending", {
                    user,
                    profile,
                    authorization,
                    error: "Nao foi possivel verificar a liberacao agora."
                });
            } else {
                setAuthState("error", {
                    user: null,
                    profile: null,
                    authorization: null,
                    error: "Nao foi possivel confirmar a permissao desta conta."
                });
            }
            return false;
        } finally {
            authorizationCheckPromise = null;
        }
    })();

    return authorizationCheckPromise;
}

function scheduleAuthorizationWatcher() {
    if (authorizationTimer) return;
    authorizationTimer = setInterval(() => {
        if (
            navigator.onLine &&
            auth?.currentUser &&
            ["signed-in", "pending"].includes(window.wifiAuthState?.status)
        ) {
            verificarAutorizacaoAtual({ force: true, reason: "periodic_check" });
        }
    }, AUTHORIZATION_REFRESH_MS);
}

async function initializeFirebaseAuth() {
    if (authInitPromise) return authInitPromise;
    authInitPromise = initializeFirebaseAuthInternal().finally(() => {
        authInitPromise = null;
    });
    return authInitPromise;
}

async function initializeFirebaseAuthInternal() {
    await waitForDom();
    bindAuthUi();

    const cachedProfile = readCachedProfile();
    const cachedAuthorization = getAuthorizationForProfile(cachedProfile);
    const cachedActive = isAuthorizationActive(cachedAuthorization);
    const cachedPending = isAuthorizationPending(cachedAuthorization);
    if (cachedProfile && !wasSignedOut() && cachedPending) {
        setAuthState("pending", {
            profile: cachedProfile,
            authorization: cachedAuthorization,
            user: auth?.currentUser || null,
            error: null
        });
    } else if (cachedProfile && !wasSignedOut() && (navigator.onLine || cachedActive)) {
        setAuthState(navigator.onLine ? "checking" : "offline-signed-in", {
            profile: cachedProfile,
            authorization: cachedAuthorization,
            user: auth?.currentUser || null,
            error: null
        });
    } else {
        renderAuthUi();
    }

    if (!navigator.onLine) {
        if (cachedProfile && !wasSignedOut() && cachedActive) {
            setAuthState("offline-signed-in", {
                profile: cachedProfile,
                authorization: cachedAuthorization,
                user: null,
                error: null
            });
        } else if (cachedPending) {
            setAuthState("offline-no-session", {
                profile: null,
                authorization: null,
                user: null,
                error: "Conecte a internet para verificar a liberacao da conta."
            });
        } else {
            setAuthState("offline-no-session", {
                profile: null,
                authorization: null,
                user: null,
                error: null
            });
        }
        resolveInitialOnce();
        return;
    }

    try {
        const appModule = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`);
        const authModule = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`);
        const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(firebaseConfig);
        auth = authModule.getAuth(app);
        try {
            await authModule.setPersistence(auth, authModule.browserLocalPersistence);
        } catch (error) {
            console.warn("Firebase Auth: persistencia local indisponivel.", error);
        }

        authModule.onAuthStateChanged(auth, async (user) => {
            if (accessBlocked) {
                resolveInitialOnce();
                return;
            }
            if (user) {
                const currentAuthorization = getAuthorizationForProfile({ uid: user.uid });
                const profile = saveProfile(user, currentAuthorization);
                setAuthState(isAuthorizationPending(currentAuthorization) ? "pending" : "checking", {
                    user,
                    profile,
                    authorization: currentAuthorization,
                    error: null
                });
                await verificarAutorizacaoAtual({ force: true, reason: "auth_state" });
            } else {
                const fallbackProfile = readCachedProfile();
                const fallbackAuthorization = getAuthorizationForProfile(fallbackProfile);
                if (!navigator.onLine && fallbackProfile && !wasSignedOut() && isAuthorizationActive(fallbackAuthorization)) {
                    setAuthState("offline-signed-in", {
                        user: null,
                        profile: fallbackProfile,
                        authorization: fallbackAuthorization,
                        error: null
                    });
                } else {
                    setAuthState("signed-out", {
                        user: null,
                        profile: null,
                        authorization: null,
                        error: null
                    });
                }
            }
            resolveInitialOnce();
        });
    } catch (error) {
        console.warn("Firebase Auth: falha ao inicializar.", error);
        if (cachedProfile && !wasSignedOut() && cachedActive) {
            setAuthState("offline-signed-in", {
                profile: cachedProfile,
                authorization: cachedAuthorization,
                user: null,
                error: null
            });
        } else {
            setAuthState("error", {
                profile: null,
                authorization: null,
                user: null,
                error: "Conecte a internet para validar o login."
            });
        }
        resolveInitialOnce();
    }
}

function bindAuthUi() {
    const form = document.getElementById("authLoginForm");
    if (form && !form.dataset.bound) {
        form.dataset.bound = "true";
        form.addEventListener("submit", window.entrarContaWifi);
    }
}

window.waitForWifiAuthInitial = function() {
    return window.wifiAuthInitialPromise;
};

window.verificarAutorizacaoWifi = function(options = {}) {
    return verificarAutorizacaoAtual(options);
};

window.temAutorizacaoWifiAtiva = function() {
    const state = window.wifiAuthState || {};
    const authorization = state.authorization || getAuthorizationForProfile(state.profile);
    return isAuthorizationActive(authorization);
};

window.podeSincronizarFirebaseComAuth = function() {
    return !!(
        navigator.onLine &&
        auth &&
        auth.currentUser &&
        window.wifiAuthState?.status === "signed-in" &&
        isAuthorizationActive(window.wifiAuthState?.authorization)
    );
};

window.getWifiAuthToken = async function(forceRefresh = false) {
    if (!auth || !auth.currentUser) return null;
    if (!window.podeSincronizarFirebaseComAuth()) return null;
    try {
        return await auth.currentUser.getIdToken(!!forceRefresh);
    } catch (error) {
        console.warn("Firebase Auth: falha ao obter token.", error);
        return null;
    }
};

window.getWifiAuthProfile = function() {
    return window.wifiAuthState?.profile || readCachedProfile();
};

window.getWifiAuthorization = function() {
    return window.wifiAuthState?.authorization || getAuthorizationForProfile(window.getWifiAuthProfile());
};

window.temSessaoLocalWifi = function() {
    const profile = readCachedProfile();
    if (!profile || wasSignedOut()) return false;
    if (window.wifiAuthState?.status === "blocked") return false;
    return isAuthorizationActive(getAuthorizationForProfile(profile));
};

window.definirModoAuth = function(mode = "login") {
    authMode = mode === "register" ? "register" : "login";
    const status = window.wifiAuthState?.status || "signed-out";
    if (["error", "signed-out", "offline-no-session"].includes(status)) {
        setAuthState(status === "error" ? "signed-out" : status, { error: null });
    } else {
        renderAuthUi();
    }
};

window.entrarContaWifi = async function(event) {
    if (event) event.preventDefault();
    if (authMode === "register") {
        return window.criarContaWifi();
    }
    const email = String(document.getElementById("authEmail")?.value || "").trim();
    const password = String(document.getElementById("authPassword")?.value || "");
    if (!email || !password) {
        setAuthState("signed-out", { error: "Informe e-mail e senha." });
        return;
    }
    if (!navigator.onLine) {
        setAuthState("offline-no-session", { error: "Conecte a internet para entrar." });
        return;
    }
    try {
        accessBlocked = false;
        setAuthState("signing-in", { error: null });
        if (!auth) {
            await initializeFirebaseAuth();
        }
        if (!auth) throw new Error("Auth indisponivel");
        const authModule = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`);
        await authModule.signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.warn("Firebase Auth: login falhou.", error);
        setAuthState("signed-out", { error: mapAuthError(error) });
    }
};

window.criarContaWifi = async function() {
    const displayName = String(document.getElementById("authName")?.value || "").trim();
    const email = String(document.getElementById("authEmail")?.value || "").trim();
    const password = String(document.getElementById("authPassword")?.value || "");
    if (!displayName || !email || !password) {
        setAuthState("signed-out", { error: "Informe nome, e-mail e senha." });
        return;
    }
    if (password.length < 6) {
        setAuthState("signed-out", { error: "Use uma senha com pelo menos 6 caracteres." });
        return;
    }
    if (!navigator.onLine) {
        setAuthState("offline-no-session", { error: "Conecte a internet para criar a conta." });
        return;
    }
    try {
        accessBlocked = false;
        setAuthState("creating-account", { error: null });
        if (!auth) {
            await initializeFirebaseAuth();
        }
        if (!auth) throw new Error("Auth indisponivel");
        const authModule = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`);
        const credential = await authModule.createUserWithEmailAndPassword(auth, email, password);
        if (credential.user && displayName) {
            await authModule.updateProfile(credential.user, { displayName });
        }
        const user = credential.user;
        let authorization;
        try {
            authorization = await registrarSolicitacaoUsuario(user, displayName, "self_signup");
        } catch (requestError) {
            console.warn("Firebase Auth: conta criada, mas solicitacao pendente falhou.", requestError);
            const pendingAuthorization = {
                uid: user.uid,
                email: user.email || email,
                displayName,
                role: "user",
                active: false,
                status: "pending",
                pending: true,
                remoteExists: false
            };
            saveAuthorization(pendingAuthorization);
            const profile = saveProfile(user, pendingAuthorization);
            setAuthState("pending", {
                user,
                profile,
                authorization: pendingAuthorization,
                error: "Conta criada, mas a solicitacao nao foi registrada. Avise o administrador."
            });
            scheduleAuthorizationWatcher();
            return;
        }
        if (typeof window.registrarLogEvento === "function") {
            window.registrarLogEvento("conta_pendente_criada", `Conta aguardando autorizacao: ${email}`, {
                uid: user.uid,
                email,
                operacao: "self_signup"
            });
        }
        manterContaPendente(user, authorization, "self_signup");
    } catch (error) {
        console.warn("Firebase Auth: cadastro falhou.", error);
        setAuthState("signed-out", { error: mapAuthError(error) });
    }
};

window.verificarLiberacaoConta = async function() {
    if (!navigator.onLine) {
        setAuthState("pending", { error: "Conecte a internet para verificar a liberacao." });
        return false;
    }
    if (!auth) {
        await initializeFirebaseAuth();
    }
    if (!auth?.currentUser) {
        setAuthState("signed-out", { error: "Entre novamente para verificar a liberacao." });
        return false;
    }
    return verificarAutorizacaoAtual({ force: true, reason: "manual_pending_check" });
};

window.entrarOutraContaWifi = async function() {
    accessBlocked = false;
    authMode = "login";
    localStorage.setItem(SIGNED_OUT_KEY, "true");
    clearLocalAuthCache();

    ["authName", "authEmail", "authPassword"].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = "";
    });

    try {
        if (auth) {
            const authModule = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`);
            await authModule.signOut(auth);
        }
    } catch (error) {
        console.warn("Firebase Auth: falha ao trocar de conta.", error);
    }

    setAuthState(navigator.onLine ? "signed-out" : "offline-no-session", {
        user: null,
        profile: null,
        authorization: null,
        error: navigator.onLine ? null : "Conecte a internet para entrar em outra conta."
    });
};

window.sairContaWifi = async function() {
    if (!confirm("Sair desta conta neste dispositivo?")) return;
    localStorage.setItem(SIGNED_OUT_KEY, "true");
    clearLocalAuthCache();
    try {
        if (auth) {
            const authModule = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`);
            await authModule.signOut(auth);
        }
    } catch (error) {
        console.warn("Firebase Auth: falha ao sair.", error);
    }
    window.location.reload();
};

window.addEventListener("online", () => {
    if (accessBlocked) return;
    if (!auth?.currentUser && !wasSignedOut()) {
        initializeFirebaseAuth();
    } else if (auth?.currentUser) {
        verificarAutorizacaoAtual({ force: true, reason: "online" });
    }
});

document.addEventListener("visibilitychange", () => {
    if (
        document.visibilityState === "visible" &&
        navigator.onLine &&
        auth?.currentUser &&
        ["signed-in", "pending"].includes(window.wifiAuthState?.status)
    ) {
        verificarAutorizacaoAtual({ force: true, reason: "visible" });
    }
});

initializeFirebaseAuth();
