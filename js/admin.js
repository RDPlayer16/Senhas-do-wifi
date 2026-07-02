import { firebaseConfig } from "./firebase-config.js";

let adminUsers = [];
let adminLoading = false;

function waitForDom() {
    if (document.readyState !== "loading") return Promise.resolve();
    return new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

function limparIdFirebase(id) {
    return String(id || "").replace(/[.#$\/\[\]]/g, "_");
}

function getDatabaseURL() {
    const config = window.WIFI_FIREBASE_CONFIG || firebaseConfig;
    return String(config.databaseURL || "").replace(/\/+$/, "");
}

function usuarioAtualEhAdmin() {
    return typeof window.usuarioAtualEhAdmin === "function" && window.usuarioAtualEhAdmin();
}

function getCurrentUid() {
    const profile = typeof window.getWifiAuthProfile === "function" ? window.getWifiAuthProfile() : null;
    return profile?.uid || "";
}

async function buildAdminUrl(path) {
    const cleanPath = String(path || "").replace(/^\/+/, "");
    let url = `${getDatabaseURL()}/${cleanPath}.json`;
    const token = typeof window.getWifiAuthToken === "function" ? await window.getWifiAuthToken(false) : null;
    if (!token) throw new Error("Login indisponivel");
    url += `?auth=${encodeURIComponent(token)}`;
    return url;
}

async function adminRequest(path, options = {}) {
    if (!usuarioAtualEhAdmin()) throw new Error("Acesso admin indisponivel");
    const response = await fetch(await buildAdminUrl(path), {
        cache: "no-store",
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });
    const text = await response.text();
    if (!response.ok) throw new Error(text || response.statusText);
    return text ? JSON.parse(text) : null;
}

function normalizarUsuario(uid, data = {}) {
    const now = Date.now();
    const active = data.active === true || data.active === "true";
    const status = String(data.status || (active ? "active" : "blocked")).toLowerCase();
    return {
        uid,
        email: data.email || "",
        displayName: data.displayName || data.nome || data.email || "Usuario",
        role: data.role === "admin" ? "admin" : "user",
        active,
        status,
        pending: status === "pending" || data.pending === true,
        wipeLocalOnRevoke: data.wipeLocalOnRevoke !== false,
        requestedAt: Number(data.requestedAt || 0),
        requestedPlatform: data.requestedPlatform || "",
        approvedAt: Number(data.approvedAt || 0),
        approvedBy: data.approvedBy || "",
        blockedAt: Number(data.blockedAt || 0),
        blockedBy: data.blockedBy || "",
        lastSeenAt: Number(data.lastSeenAt || 0),
        lastPlatform: data.lastPlatform || "",
        lastVersion: data.lastVersion || "",
        createdAt: Number(data.createdAt || now),
        updatedAt: Number(data.updatedAt || 0),
        raw: data
    };
}

function setAdminStatus(message = "", danger = false) {
    const el = document.getElementById("adminFormStatus");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("danger", !!danger);
}

function formatDate(value) {
    const timestamp = Number(value || 0);
    if (!timestamp) return "Ainda sem acesso";
    return new Date(timestamp).toLocaleString("pt-BR");
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
    }[char]));
}

function getFilteredUsers() {
    const query = String(document.getElementById("adminSearchInput")?.value || "").trim().toLowerCase();
    const users = [...adminUsers].sort((a, b) => {
        if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
        if (a.pending !== b.pending) return a.pending ? -1 : 1;
        if (a.active !== b.active) return a.active ? -1 : 1;
        return String(a.email || a.displayName || a.uid).localeCompare(String(b.email || b.displayName || b.uid), "pt-BR");
    });
    if (!query) return users;
    return users.filter(user => [
        user.uid,
        user.email,
        user.displayName,
        user.role,
        user.status,
        user.requestedPlatform,
        user.lastPlatform
    ].join(" ").toLowerCase().includes(query));
}

window.renderizarUsuariosAdmin = function() {
    const out = document.getElementById("adminUsersOutput");
    const subtitle = document.getElementById("adminSubtitle");
    if (!out) return;
    if (!usuarioAtualEhAdmin()) {
        out.innerHTML = '<div class="admin-empty">Area disponivel apenas para administrador.</div>';
        if (subtitle) subtitle.textContent = "Acesso restrito";
        return;
    }
    if (adminLoading) {
        out.innerHTML = '<div class="admin-empty">Carregando usuarios...</div>';
        return;
    }

    const users = getFilteredUsers();
    const activeCount = adminUsers.filter(user => user.active).length;
    const pendingCount = adminUsers.filter(user => user.pending).length;
    if (subtitle) subtitle.textContent = `${adminUsers.length} usuario(s), ${activeCount} ativo(s), ${pendingCount} pendente(s)`;
    if (!users.length) {
        out.innerHTML = '<div class="admin-empty">Nenhum usuario encontrado.</div>';
        return;
    }

    out.innerHTML = "";
    const currentUid = getCurrentUid();
    users.forEach(user => {
        const card = document.createElement("div");
        card.className = "admin-user-card";
        const protectedAdmin = user.role === "admin" || user.uid === currentUid;
        const displayName = escapeHtml(user.displayName || user.email || "Usuario");
        const email = escapeHtml(user.email || "Sem e-mail");
        const uid = escapeHtml(user.uid);
        const lastPlatform = escapeHtml(user.lastPlatform ? `Plataforma: ${String(user.lastPlatform).toUpperCase()} ${user.lastVersion || ""}` : "Plataforma ainda nao registrada");
        const requestedInfo = user.pending
            ? `<small>Solicitado em: ${formatDate(user.requestedAt)}${user.requestedPlatform ? ` | ${escapeHtml(String(user.requestedPlatform).toUpperCase())}` : ""}</small>`
            : "";
        const statusLabel = user.pending ? "Pendente" : user.active ? "Ativo" : "Bloqueado";
        const statusClass = user.pending ? "pending" : user.active ? "active" : "blocked";
        const primaryAction = user.active ? "Bloquear" : user.pending ? "Autorizar" : "Ativar";
        card.innerHTML = `
            <div class="admin-user-main">
                <strong>${displayName}</strong>
                <span>${email}</span>
                <small>UID: ${uid}</small>
                ${requestedInfo}
                <small>Ultimo acesso: ${formatDate(user.lastSeenAt)}</small>
                <small>${lastPlatform}</small>
            </div>
            <div class="admin-user-badges">
                <span class="admin-badge ${statusClass}">${statusLabel}</span>
                <span class="admin-badge">${user.role === "admin" ? "Admin" : "Usuario"}</span>
                <span class="admin-badge">${user.wipeLocalOnRevoke ? "Limpa ao bloquear" : "Mantem local"}</span>
            </div>
            <div class="admin-user-actions">
                <button type="button" onclick="window.editarUsuarioAdmin('${user.uid}')">Editar</button>
                <button type="button" ${protectedAdmin ? "disabled" : ""} onclick="window.alternarUsuarioAdmin('${user.uid}')">${primaryAction}</button>
                <button type="button" ${protectedAdmin ? "disabled" : ""} onclick="window.alternarLimpezaUsuarioAdmin('${user.uid}')">Limpeza</button>
                <button type="button" class="btn-delete" ${protectedAdmin ? "disabled" : ""} onclick="window.removerUsuarioAdmin('${user.uid}')">Remover</button>
            </div>
        `;
        out.appendChild(card);
    });
};

window.atualizarPainelAdmin = async function(force = false) {
    await waitForDom();
    if (!usuarioAtualEhAdmin()) {
        window.renderizarUsuariosAdmin();
        return;
    }
    if (adminLoading && !force) return;
    adminLoading = true;
    window.renderizarUsuariosAdmin();
    try {
        const data = await adminRequest("authorized_users");
        adminUsers = Object.entries(data || {})
            .filter(([uid]) => uid !== "_schema")
            .map(([uid, value]) => normalizarUsuario(uid, value || {}));
        adminLoading = false;
        window.renderizarUsuariosAdmin();
    } catch (error) {
        adminLoading = false;
        console.warn("Admin: falha ao carregar usuarios.", error);
        const out = document.getElementById("adminUsersOutput");
        if (out) out.innerHTML = '<div class="admin-empty">Nao foi possivel carregar os usuarios agora.</div>';
    }
};

window.limparFormularioAdmin = function() {
    ["adminUserUid", "adminUserEmail", "adminUserName"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    const wipe = document.getElementById("adminUserWipe");
    if (wipe) wipe.checked = true;
    setAdminStatus("");
};

window.editarUsuarioAdmin = function(uid) {
    const user = adminUsers.find(item => item.uid === uid);
    if (!user) return;
    const uidInput = document.getElementById("adminUserUid");
    const emailInput = document.getElementById("adminUserEmail");
    const nameInput = document.getElementById("adminUserName");
    const wipeInput = document.getElementById("adminUserWipe");
    if (uidInput) uidInput.value = user.uid;
    if (emailInput) emailInput.value = user.email || "";
    if (nameInput) nameInput.value = user.displayName || "";
    if (wipeInput) wipeInput.checked = !!user.wipeLocalOnRevoke;
    setAdminStatus("Editando usuario selecionado.");
    window.scrollTo({ top: 0, behavior: "smooth" });
};

window.salvarUsuarioAdmin = async function(event) {
    if (event) event.preventDefault();
    if (!usuarioAtualEhAdmin()) return;
    const uid = limparIdFirebase(document.getElementById("adminUserUid")?.value || "");
    const email = String(document.getElementById("adminUserEmail")?.value || "").trim();
    const displayName = String(document.getElementById("adminUserName")?.value || "").trim() || email || "Usuario";
    const wipeLocalOnRevoke = document.getElementById("adminUserWipe")?.checked !== false;
    if (!uid || !email) {
        setAdminStatus("Informe UID e e-mail.", true);
        return;
    }
    setAdminStatus("Salvando...");
    try {
        const previous = adminUsers.find(user => user.uid === uid);
        const now = Date.now();
        await adminRequest(`authorized_users/${uid}`, {
            method: "PATCH",
            body: JSON.stringify({
                active: true,
                status: "active",
                pending: false,
                role: previous?.role === "admin" ? "admin" : "user",
                email,
                displayName,
                wipeLocalOnRevoke,
                createdAt: previous?.createdAt || now,
                approvedAt: previous?.approvedAt || now,
                approvedAtIso: previous?.approvedAt ? previous.raw?.approvedAtIso || null : new Date(now).toISOString(),
                approvedBy: previous?.approvedBy || getCurrentUid(),
                updatedAt: now,
                updatedAtIso: new Date(now).toISOString(),
                updatedBy: getCurrentUid()
            })
        });
        if (typeof window.registrarLogEvento === "function") {
            window.registrarLogEvento("admin_usuario_salvo", `Usuario autorizado: ${email}`, { uid, email, operacao: "save_user" });
        }
        setAdminStatus("Usuario salvo.");
        window.limparFormularioAdmin();
        await window.atualizarPainelAdmin(true);
    } catch (error) {
        console.warn("Admin: falha ao salvar usuario.", error);
        setAdminStatus("Nao foi possivel salvar.", true);
    }
};

window.alternarUsuarioAdmin = async function(uid) {
    const user = adminUsers.find(item => item.uid === uid);
    if (!user || user.role === "admin" || uid === getCurrentUid()) return;
    const nextActive = !user.active;
    const confirmar = nextActive || confirm(`Bloquear ${user.email || user.displayName}?`);
    if (!confirmar) return;
    try {
        const now = Date.now();
        const patch = {
            active: nextActive,
            status: nextActive ? "active" : "blocked",
            pending: false,
            updatedAt: now,
            updatedAtIso: new Date(now).toISOString(),
            updatedBy: getCurrentUid()
        };
        if (nextActive) {
            patch.approvedAt = user.approvedAt || now;
            patch.approvedAtIso = user.raw?.approvedAtIso || new Date(now).toISOString();
            patch.approvedBy = user.approvedBy || getCurrentUid();
        } else {
            patch.blockedAt = now;
            patch.blockedAtIso = new Date(now).toISOString();
            patch.blockedBy = getCurrentUid();
        }
        await adminRequest(`authorized_users/${limparIdFirebase(uid)}`, {
            method: "PATCH",
            body: JSON.stringify(patch)
        });
        if (typeof window.registrarLogEvento === "function") {
            const tipo = nextActive && user.pending ? "admin_usuario_autorizado" : nextActive ? "admin_usuario_ativado" : "admin_usuario_bloqueado";
            const acao = nextActive && user.pending ? "Usuario autorizado" : nextActive ? "Usuario ativado" : "Usuario bloqueado";
            window.registrarLogEvento(tipo, `${acao}: ${user.email || uid}`, { uid, email: user.email || null });
        }
        await window.atualizarPainelAdmin(true);
    } catch (error) {
        console.warn("Admin: falha ao alternar usuario.", error);
        window.mostrarToast("Nao foi possivel alterar o usuario.");
    }
};

window.alternarLimpezaUsuarioAdmin = async function(uid) {
    const user = adminUsers.find(item => item.uid === uid);
    if (!user || user.role === "admin" || uid === getCurrentUid()) return;
    try {
        await adminRequest(`authorized_users/${limparIdFirebase(uid)}`, {
            method: "PATCH",
            body: JSON.stringify({
                wipeLocalOnRevoke: !user.wipeLocalOnRevoke,
                updatedAt: Date.now(),
                updatedAtIso: new Date().toISOString(),
                updatedBy: getCurrentUid()
            })
        });
        await window.atualizarPainelAdmin(true);
    } catch (error) {
        console.warn("Admin: falha ao alternar limpeza local.", error);
        window.mostrarToast("Nao foi possivel alterar a limpeza.");
    }
};

window.removerUsuarioAdmin = async function(uid) {
    const user = adminUsers.find(item => item.uid === uid);
    if (!user || user.role === "admin" || uid === getCurrentUid()) return;
    if (!confirm(`Remover acesso de ${user.email || user.displayName}?`)) return;
    try {
        await adminRequest(`authorized_users/${limparIdFirebase(uid)}`, { method: "DELETE" });
        if (typeof window.registrarLogEvento === "function") {
            window.registrarLogEvento("admin_usuario_removido", `Usuario removido: ${user.email || uid}`, { uid, email: user.email || null });
        }
        await window.atualizarPainelAdmin(true);
    } catch (error) {
        console.warn("Admin: falha ao remover usuario.", error);
        window.mostrarToast("Nao foi possivel remover o usuario.");
    }
};

window.addEventListener("wifi-auth-state-changed", () => {
    if (usuarioAtualEhAdmin() && window.appCurrentView === "admin") {
        window.atualizarPainelAdmin();
    }
});

waitForDom().then(() => {
    if (usuarioAtualEhAdmin()) window.renderizarUsuariosAdmin();
});
