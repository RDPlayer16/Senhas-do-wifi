// VARIÃVEIS GLOBAIS DE ESTADO
window.DB_KEY = 'wifi_pro_db_v9';
window.DB_GEO_KEY = 'wifi_pro_db_geo_v1';
window.APP_LOG_KEY = 'wifi_pro_event_log_v1';
window.APP_LOG_PENDING_KEY = 'wifi_pro_event_log_pending_v1';
window.APP_LOG_DEVICE_KEY = 'wifi_pro_event_log_device_v1';
window.APP_LOG_MIGRATED_KEY = 'wifi_pro_event_log_migrated_v1';
window.MAINTENANCE_BACKUP_KEY = 'wifi_pro_maintenance_backup_v1';
window.APP_LOG_LIMIT = 300;
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
const storedThemeMode = localStorage.getItem('wifi_pro_theme_v1');
window.appThemeMode = ['dark', 'light', 'auto'].includes(storedThemeMode) ? storedThemeMode : 'auto';
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

window.normalizarRedeTexto = function(value) {
    return String(value || '').trim().toLowerCase();
};

window.hashTextoSimples = function(value) {
    const texto = String(value || '');
    let hash = 0;
    for (let i = 0; i < texto.length; i++) {
        hash = ((hash << 5) - hash + texto.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
};

window.deduplicarListaRedes = function(lista) {
    const resultado = [];
    const vistosPorId = new Map();

    (Array.isArray(lista) ? lista : []).forEach((rede) => {
        if (!rede) return;
        window.aplicarIdLogicoRede(rede);
        const id = String(rede.id || '').trim();
        if (id) {
            if (vistosPorId.has(id)) {
                const existente = vistosPorId.get(id);
                Object.assign(existente, {
                    ...rede,
                    lat: rede.lat ?? existente.lat ?? null,
                    lng: rede.lng ?? existente.lng ?? null,
                    bssid: rede.bssid || existente.bssid || null,
                    createdAt: Number(rede.createdAt || existente.createdAt) || existente.createdAt || rede.createdAt
                });
                return;
            }
            vistosPorId.set(id, rede);
        }
        resultado.push(rede);
    });

    return resultado;
};

window.deduplicarRedesMemoria = function() {
    const antes = window.redesEmMemoria || [];
    const depois = window.deduplicarListaRedes(antes);
    if (depois.length !== antes.length) {
        const removidas = antes.length - depois.length;
        window.redesEmMemoria = depois;
        window.atualizarBackupLocal(window.redesEmMemoria);
        if (typeof window.registrarLogEvento === 'function') {
            window.registrarLogEvento('duplicata_removida', `${removidas} duplicata(s) removida(s) do banco local`, {
                removidas
            });
        }
    }
    return window.redesEmMemoria;
};

window.normalizarCoordenadaDuplicata = function(value) {
    if (value === null || value === undefined || value === '') return '';
    const numero = Number(String(value).replace(',', '.'));
    return Number.isFinite(numero) ? numero.toFixed(6) : '';
};

window.obterAssinaturaDuplicataRede = function(rede) {
    const bssid = typeof window.normalizarWifiBssid === 'function'
        ? window.normalizarWifiBssid(rede?.bssid)
        : window.normalizarRedeTexto(rede?.bssid);
    return [
        window.normalizarRedeTexto(rede?.ssid),
        String(rede?.senha || ''),
        bssid || '',
        window.normalizarCoordenadaDuplicata(rede?.lat),
        window.normalizarCoordenadaDuplicata(rede?.lng)
    ].join('||');
};

window.obterIdLogicoRede = function(rede) {
    return 'wifi_sig_' + window.hashTextoSimples(window.obterAssinaturaDuplicataRede(rede));
};

window.aplicarIdLogicoRede = function(rede) {
    if (!rede) return rede;
    rede.logicalId = rede.logicalId || window.obterIdLogicoRede(rede);
    return rede;
};

window.criarBackupManutencao = async function(operacao = 'manual', meta = {}) {
    const timestamp = Date.now();
    const backup = {
        tipo: 'wifi_manager_backup_manutencao',
        versao: '2.2',
        operacao,
        createdAt: timestamp,
        createdAtIso: new Date(timestamp).toISOString(),
        createdAtLocal: new Date(timestamp).toLocaleString('pt-BR'),
        totalRedes: (window.redesEmMemoria || []).length,
        redes: (window.redesEmMemoria || []).map(rede => ({ ...window.aplicarIdLogicoRede({ ...rede }) })),
        meta
    };
    localStorage.setItem(window.MAINTENANCE_BACKUP_KEY, JSON.stringify(backup));
    window.renderizarBackupManutencao();
    if (typeof window.registrarLogEvento === 'function') {
        window.registrarLogEvento('backup_manutencao_criado', `Backup de manutencao criado: ${operacao}`, {
            operacao,
            totalRedes: backup.totalRedes,
            timestamp
        });
    }
    return backup;
};

window.obterUltimoBackupManutencao = function() {
    try {
        return JSON.parse(localStorage.getItem(window.MAINTENANCE_BACKUP_KEY) || 'null');
    } catch (error) {
        return null;
    }
};

window.renderizarBackupManutencao = function() {
    const out = document.getElementById('maintenanceBackupOutput');
    if (!out) return;
    const backup = window.obterUltimoBackupManutencao();
    if (!backup) {
        out.innerHTML = '<div class="developer-log-item"><strong>Nenhum backup criado.</strong><span>Use o botao acima ou rode uma manutencao/importacao.</span></div>';
        return;
    }
    out.innerHTML = `<div class="developer-log-item success"><strong>Backup disponivel</strong><span>${backup.totalRedes || 0} rede(s) - ${backup.createdAtLocal || ''}</span><span>Operacao: ${backup.operacao || 'manual'}</span></div>`;
};

window.exportarUltimoBackupManutencao = async function() {
    const backup = window.obterUltimoBackupManutencao();
    if (!backup) {
        window.mostrarToast('Nenhum backup de manutencao para exportar.');
        return;
    }
    const texto = JSON.stringify(backup, null, 2);
    if (typeof window.salvarArquivoExportado === 'function') {
        await window.salvarArquivoExportado(
            `Backup_Manutencao_${backup.createdAt || Date.now()}.json`,
            'application/json',
            window.textoParaBase64Utf8 ? window.textoParaBase64Utf8(texto) : btoa(unescape(encodeURIComponent(texto))),
            texto
        );
    } else {
        window.baixarArquivoWeb(`Backup_Manutencao_${backup.createdAt || Date.now()}.json`, 'application/json', texto);
    }
};

window.escolherRedeDuplicadaParaManter = function(grupo) {
    return [...grupo].sort((a, b) => {
        const aLocal = String(a.id || '').startsWith('local_') ? 1 : 0;
        const bLocal = String(b.id || '').startsWith('local_') ? 1 : 0;
        if (aLocal !== bLocal) return aLocal - bLocal;

        const aCreated = Number(a.createdAt) || Number.MAX_SAFE_INTEGER;
        const bCreated = Number(b.createdAt) || Number.MAX_SAFE_INTEGER;
        if (aCreated !== bCreated) return aCreated - bCreated;

        return String(a.id || '').localeCompare(String(b.id || ''));
    })[0];
};

window.obterGruposDuplicadosBanco = function() {
    const grupos = new Map();
    (Array.isArray(window.redesEmMemoria) ? window.redesEmMemoria : []).forEach((rede) => {
        if (!rede || !rede.ssid) return;
        const assinatura = window.obterAssinaturaDuplicataRede(rede);
        if (!assinatura || assinatura.startsWith('||||')) return;
        if (!grupos.has(assinatura)) grupos.set(assinatura, []);
        grupos.get(assinatura).push(rede);
    });

    return Array.from(grupos.entries())
        .filter(([, redes]) => redes.length > 1)
        .map(([assinatura, redes]) => {
            const manter = window.escolherRedeDuplicadaParaManter(redes);
            return {
                assinatura,
                manter,
                remover: redes.filter(rede => rede !== manter),
                redes
            };
        })
        .sort((a, b) => b.remover.length - a.remover.length);
};

window.obterPossiveisDuplicatasBanco = function() {
    const grupos = new Map();
    (Array.isArray(window.redesEmMemoria) ? window.redesEmMemoria : []).forEach((rede) => {
        if (!rede || !rede.ssid) return;
        const ssid = window.normalizarRedeTexto(rede.ssid);
        if (!ssid) return;
        if (!grupos.has(ssid)) grupos.set(ssid, []);
        grupos.get(ssid).push(rede);
    });

    return Array.from(grupos.values())
        .filter(redes => redes.length > 1)
        .map(redes => ({
            ssid: redes[0]?.ssid || 'Rede sem nome',
            redes: [...redes].sort((a, b) => {
                const senhaCompare = String(a.senha || '').localeCompare(String(b.senha || ''));
                if (senhaCompare !== 0) return senhaCompare;
                const bssidCompare = String(a.bssid || '').localeCompare(String(b.bssid || ''));
                if (bssidCompare !== 0) return bssidCompare;
                return String(a.id || '').localeCompare(String(b.id || ''));
            })
        }))
        .filter(grupo => {
            const assinaturas = new Set(grupo.redes.map(rede => window.obterAssinaturaDuplicataRede(rede)));
            return assinaturas.size > 1;
        })
        .sort((a, b) => String(a.ssid || '').localeCompare(String(b.ssid || ''), 'pt-BR', { sensitivity: 'base' }));
};

window.obterResumoDuplicatasBanco = function() {
    const exatas = window.obterGruposDuplicadosBanco();
    const possiveis = window.obterPossiveisDuplicatasBanco();
    return {
        gruposExatos: exatas.length,
        duplicatasExatas: exatas.reduce((total, grupo) => total + grupo.remover.length, 0),
        gruposPossiveis: possiveis.length,
        redesPossiveis: possiveis.reduce((total, grupo) => total + grupo.redes.length, 0)
    };
};

window.renderizarDuplicatasBanco = function(grupos = window.obterGruposDuplicadosBanco()) {
    const out = document.getElementById('duplicateCleanupOutput');
    if (!out) return grupos;

    const totalRemover = grupos.reduce((total, grupo) => total + grupo.remover.length, 0);
    if (!grupos.length) {
        out.innerHTML = '<div class="developer-log-item"><strong>Nenhuma duplicata exata encontrada.</strong><span>O banco local sincronizado nao tem redes com mesmo SSID, senha, BSSID e coordenadas.</span></div>';
        return grupos;
    }

    out.innerHTML = '';
    const resumo = document.createElement('div');
    resumo.className = 'developer-log-item';
    resumo.innerHTML = `<strong>${totalRemover} duplicata(s) em ${grupos.length} grupo(s)</strong><span>Uma copia sera mantida por grupo. Revise abaixo antes de remover.</span>`;
    out.appendChild(resumo);

    grupos.slice(0, 30).forEach((grupo) => {
        const item = document.createElement('div');
        item.className = 'developer-log-item warning';
        const ssid = grupo.manter?.ssid || 'Rede sem nome';
        const idsRemover = grupo.remover.map(rede => rede.id).join(', ');
        const coords = [
            window.normalizarCoordenadaDuplicata(grupo.manter?.lat),
            window.normalizarCoordenadaDuplicata(grupo.manter?.lng)
        ].filter(Boolean).join(', ');
        item.innerHTML = `<strong>${ssid}</strong><span>Manter: ${grupo.manter?.id || 'sem id'}</span><span>Remover: ${idsRemover}</span><span>Senha: ${grupo.manter?.senha || 'vazia'} | BSSID: ${grupo.manter?.bssid || 'sem BSSID'}</span><span>${coords ? `Coordenadas: ${coords}` : 'Sem coordenadas salvas'}</span><span>ID logico: ${window.obterIdLogicoRede(grupo.manter)}</span>`;
        out.appendChild(item);
    });

    if (grupos.length > 30) {
        const extra = document.createElement('div');
        extra.className = 'developer-log-item';
        extra.innerHTML = `<strong>Mais ${grupos.length - 30} grupo(s)</strong><span>A limpeza tambem considera os grupos nao exibidos aqui.</span>`;
        out.appendChild(extra);
    }

    return grupos;
};

window.analisarDuplicatasBanco = function() {
    const grupos = window.renderizarDuplicatasBanco();
    const totalRemover = grupos.reduce((total, grupo) => total + grupo.remover.length, 0);
    window.mostrarToast(totalRemover ? `${totalRemover} duplicata(s) encontrada(s).` : 'Nenhuma duplicata exata encontrada.');
    return grupos;
};

window.renderizarPossiveisDuplicatasBanco = function(grupos = window.obterPossiveisDuplicatasBanco()) {
    const out = document.getElementById('possibleDuplicateOutput');
    if (!out) return grupos;
    const resumoDuplicatas = window.obterResumoDuplicatasBanco();
    if (!grupos.length) {
        out.innerHTML = `<div class="developer-log-item success"><strong>Nenhuma possivel duplicata encontrada.</strong><span>Duplicatas exatas detectadas: ${resumoDuplicatas.duplicatasExatas}</span><span>Nao ha SSIDs repetidos com senha, BSSID ou coordenadas diferentes.</span></div>`;
        return grupos;
    }
    out.innerHTML = '';
    const resumo = document.createElement('div');
    resumo.className = 'developer-log-item warning';
    resumo.innerHTML = `<strong>${grupos.length} SSID(s) repetido(s)</strong><span>Duplicatas exatas detectadas: ${resumoDuplicatas.duplicatasExatas}</span><span>Abra o gerenciamento para excluir manualmente. A lista esta em ordem alfabetica.</span>`;
    out.appendChild(resumo);

    grupos.slice(0, 12).forEach((grupo) => {
        const item = document.createElement('div');
        item.className = 'developer-log-item';
        const linhas = grupo.redes.map((rede, index) => {
            const senha = String(rede.senha || '') || 'vazia';
            const coords = [window.normalizarCoordenadaDuplicata(rede.lat), window.normalizarCoordenadaDuplicata(rede.lng)].filter(Boolean).join(', ') || 'sem coordenadas';
            return `${index + 1}. ${rede.id || 'sem id'} | senha ${senha} | ${rede.bssid || 'sem BSSID'} | ${coords}`;
        }).join('<br>');
        item.innerHTML = `<strong>${grupo.ssid}</strong><span>${linhas}</span>`;
        out.appendChild(item);
    });
    if (grupos.length > 12) {
        const extra = document.createElement('div');
        extra.className = 'developer-log-item';
        extra.innerHTML = `<strong>Mais ${grupos.length - 12} SSID(s)</strong><span>Use Gerenciar Possiveis Duplicatas para ver todos.</span>`;
        out.appendChild(extra);
    }
    return grupos;
};

window.analisarPossiveisDuplicatasBanco = function() {
    const grupos = window.renderizarPossiveisDuplicatasBanco();
    window.mostrarToast(grupos.length ? `${grupos.length} SSID(s) para revisar.` : 'Nenhuma possivel duplicata encontrada.');
    return grupos;
};

window.abrirGerenciamentoPossiveisDuplicatas = function() {
    window.renderizarPossiveisDuplicatasBanco();
    const modal = document.getElementById('modalGerenciarDuplicatas');
    if (modal) modal.style.display = 'flex';
    window.renderizarGerenciamentoPossiveisDuplicatas();
};

window.fecharGerenciamentoPossiveisDuplicatas = function() {
    const modal = document.getElementById('modalGerenciarDuplicatas');
    if (modal) modal.style.display = 'none';
};

window.renderizarGerenciamentoPossiveisDuplicatas = function() {
    const grupos = window.obterPossiveisDuplicatasBanco();
    const resumo = window.obterResumoDuplicatasBanco();
    const summary = document.getElementById('duplicateManagerSummary');
    const out = document.getElementById('duplicateManagerOutput');
    if (summary) {
        summary.innerHTML = `Possiveis duplicatas: <strong>${resumo.gruposPossiveis}</strong> SSID(s), <strong>${resumo.redesPossiveis}</strong> rede(s). Duplicatas exatas: <strong>${resumo.duplicatasExatas}</strong> rede(s) em <strong>${resumo.gruposExatos}</strong> grupo(s).`;
    }
    if (!out) return grupos;
    out.innerHTML = '';
    if (!grupos.length) {
        out.innerHTML = '<div class="developer-log-item success"><strong>Nenhuma possivel duplicata.</strong><span>Nao ha SSIDs repetidos com dados diferentes.</span></div>';
        return grupos;
    }

    grupos.forEach((grupo) => {
        const section = document.createElement('div');
        section.className = 'duplicate-group';

        const title = document.createElement('div');
        title.className = 'duplicate-group-title';
        title.innerHTML = `<span>${grupo.ssid}</span><span class="duplicate-count-pill">${grupo.redes.length} redes</span>`;
        section.appendChild(title);

        grupo.redes.forEach((rede) => {
            const row = document.createElement('div');
            row.className = 'duplicate-network-row';

            const info = document.createElement('div');
            info.className = 'duplicate-network-info';
            const coords = [window.normalizarCoordenadaDuplicata(rede.lat), window.normalizarCoordenadaDuplicata(rede.lng)].filter(Boolean).join(', ') || 'sem coordenadas';
            info.innerHTML = `<strong>Senha: ${rede.senha || 'vazia'}</strong><span>ID: ${rede.id || 'sem id'}</span><span>BSSID: ${rede.bssid || 'sem BSSID'}</span><span>Coordenadas: ${coords}</span><span>ID logico: ${window.obterIdLogicoRede(rede)}</span>`;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = 'Excluir';
            btn.addEventListener('click', () => window.excluirRedePossivelDuplicadaManual(rede.id));

            row.appendChild(info);
            row.appendChild(btn);
            section.appendChild(row);
        });

        out.appendChild(section);
    });
    return grupos;
};

window.excluirRedePossivelDuplicadaManual = async function(id) {
    const rede = (window.redesEmMemoria || []).find(item => String(item.id || '') === String(id || ''));
    if (!rede) {
        window.mostrarToast('Rede nao encontrada.');
        return;
    }
    if (!navigator.onLine && !String(id).startsWith('local_')) {
        window.mostrarToast('Conecte a internet para excluir do Firebase.');
        return;
    }
    const confirmar = window.confirm(`Excluir manualmente esta rede?\n\nSSID: ${rede.ssid}\nSenha: ${rede.senha || 'vazia'}\nID: ${rede.id}`);
    if (!confirmar) return;

    await window.criarBackupManutencao('antes_excluir_possivel_duplicata', {
        redeId: rede.id,
        ssid: rede.ssid
    });

    try {
        if (!String(rede.id || '').startsWith('local_') && typeof window.firebaseExcluir === 'function') {
            await Promise.resolve(window.firebaseExcluir(rede.id));
        }
        window.redesEmMemoria = (window.redesEmMemoria || []).filter(item => String(item.id || '') !== String(rede.id || ''));
        await window.atualizarBackupLocal(window.redesEmMemoria);
        if (typeof window.registrarOperacaoBanco === 'function') {
            window.registrarOperacaoBanco('rede_excluida_manual_duplicata', `Rede excluida manualmente: ${rede.ssid}`, rede, {
                operacao: 'possible_duplicate_manual_delete'
            });
        }
        if (!window.mostrandoApenasProximas) window.renderizarInterface(window.redesEmMemoria);
        window.renderizarPossiveisDuplicatasBanco();
        window.renderizarGerenciamentoPossiveisDuplicatas();
        if (navigator.onLine && typeof window.carregarBancoFirebaseRest === 'function') {
            setTimeout(() => window.carregarBancoFirebaseRest('possible_duplicate_manual_delete'), 900);
        }
        window.mostrarToast('Rede excluida manualmente.');
    } catch (error) {
        console.warn('Falha ao excluir possivel duplicata', error);
        window.mostrarToast('Falha ao excluir rede.');
    }
};

window.exportarPdfPossiveisDuplicatas = async function() {
    const grupos = window.obterPossiveisDuplicatasBanco();
    const resumo = window.obterResumoDuplicatasBanco();
    if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
        window.mostrarToast('Biblioteca PDF nao carregada.');
        return;
    }

    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 36;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = margin;

    const addLine = (text, size = 10, bold = false) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(size);
        const lines = doc.splitTextToSize(String(text || ''), pageWidth - margin * 2);
        lines.forEach(line => {
            if (y > pageHeight - margin) {
                doc.addPage();
                y = margin;
            }
            doc.text(line, margin, y);
            y += size + 4;
        });
    };

    addLine('Relatorio de Possiveis Duplicatas - Wi-Fi Manager Pro', 14, true);
    addLine(`Gerado em: ${new Date().toLocaleString('pt-BR')}`);
    addLine(`Duplicatas exatas: ${resumo.duplicatasExatas} rede(s) em ${resumo.gruposExatos} grupo(s).`);
    addLine(`Possiveis duplicatas: ${resumo.gruposPossiveis} SSID(s), ${resumo.redesPossiveis} rede(s).`);
    y += 8;

    if (!grupos.length) addLine('Nenhuma possivel duplicata encontrada.', 11, true);

    grupos.forEach((grupo) => {
        addLine(`SSID: ${grupo.ssid} (${grupo.redes.length} redes)`, 12, true);
        grupo.redes.forEach((rede, index) => {
            const coords = [window.normalizarCoordenadaDuplicata(rede.lat), window.normalizarCoordenadaDuplicata(rede.lng)].filter(Boolean).join(', ') || 'sem coordenadas';
            addLine(`${index + 1}. ID: ${rede.id || 'sem id'}`);
            addLine(`   Senha: ${rede.senha || 'vazia'}`);
            addLine(`   BSSID: ${rede.bssid || 'sem BSSID'}`);
            addLine(`   Coordenadas: ${coords}`);
            addLine(`   ID logico: ${window.obterIdLogicoRede(rede)}`);
        });
        y += 6;
    });

    const arrayBuffer = doc.output('arraybuffer');
    const base64 = window.arrayBufferParaBase64(arrayBuffer);
    await window.salvarArquivoExportado(
        `Possiveis_Duplicatas_WiFi_${Date.now()}.pdf`,
        'application/pdf',
        base64,
        new Blob([arrayBuffer], { type: 'application/pdf' })
    );
};
window.removerDuplicatasBanco = async function() {
    if (!navigator.onLine) {
        window.mostrarToast('Conecte a internet para remover duplicatas do Firebase.');
        return;
    }

    const grupos = window.renderizarDuplicatasBanco();
    const redesRemover = grupos.flatMap(grupo => grupo.remover);
    if (!redesRemover.length) {
        window.mostrarToast('Nenhuma duplicata exata para remover.');
        return;
    }

    const confirmar = window.confirm(`Remover ${redesRemover.length} rede(s) duplicada(s) do banco? Uma copia sera mantida por grupo.`);
    if (!confirmar) return;

    await window.criarBackupManutencao('antes_remover_duplicatas', {
        grupos: grupos.length,
        remover: redesRemover.length
    });

    const out = document.getElementById('duplicateCleanupOutput');
    if (out) {
        out.innerHTML = `<div class="developer-log-item"><strong>Removendo duplicatas...</strong><span>${redesRemover.length} rede(s) na fila.</span></div>`;
    }

    let removidas = 0;
    let falhas = 0;
    for (const rede of redesRemover) {
        const id = String(rede.id || '');
        if (!id) continue;
        try {
            if (!id.startsWith('local_') && typeof window.firebaseExcluir === 'function') {
                await Promise.resolve(window.firebaseExcluir(id));
            }
            window.redesEmMemoria = (window.redesEmMemoria || []).filter(item => String(item.id || '') !== id);
            removidas++;
        } catch (error) {
            falhas++;
            console.warn('Falha ao remover duplicata', id, error);
        }
    }

    if (typeof window.registrarLogEvento === 'function') {
        window.registrarLogEvento('duplicatas_removidas', `${removidas} duplicata(s) removida(s) do Firebase`, {
            removidas,
            falhas,
            operacao: 'dedupe_cleanup',
            ids: redesRemover.map(rede => rede.id)
        });
    }

    window.redesEmMemoria = window.deduplicarListaRedes(window.redesEmMemoria || []);
    await window.atualizarBackupLocal(window.redesEmMemoria);
    if (!window.mostrandoApenasProximas) window.renderizarInterface(window.redesEmMemoria);
    window.renderizarDuplicatasBanco();
    window.atualizarContador(navigator.onLine ? 'sincronizando' : 'offline');

    if (navigator.onLine && typeof window.carregarBancoFirebaseRest === 'function') {
        setTimeout(() => window.carregarBancoFirebaseRest('dedupe_cleanup'), 1200);
    }

    window.mostrarToast(falhas ? `${removidas} removidas, ${falhas} falha(s).` : `${removidas} duplicata(s) removida(s).`);
};

window.encontrarRedeMesmoCadastro = function(ssid, senha, bssid = null) {
    const ssidNovo = window.normalizarRedeTexto(ssid);
    const senhaNova = String(senha || '');
    const bssidNovo = typeof window.normalizarWifiBssid === 'function'
        ? window.normalizarWifiBssid(bssid)
        : window.normalizarRedeTexto(bssid);

    return (window.redesEmMemoria || []).find((rede) => {
        if (window.normalizarRedeTexto(rede.ssid) !== ssidNovo) return false;
        if (String(rede.senha || '') !== senhaNova) return false;
        const bssidExistente = typeof window.normalizarWifiBssid === 'function'
            ? window.normalizarWifiBssid(rede.bssid)
            : window.normalizarRedeTexto(rede.bssid);
        if (bssidNovo && bssidExistente && bssidNovo !== bssidExistente) return false;
        if (bssidNovo && !bssidExistente) return false;
        return true;
    });
};

window.obterLogDeviceId = function() {
    let deviceId = localStorage.getItem(window.APP_LOG_DEVICE_KEY);
    if (!deviceId) {
        deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        localStorage.setItem(window.APP_LOG_DEVICE_KEY, deviceId);
    }
    return deviceId;
};

window.normalizarListaLogEventos = function(log) {
    const porId = new Map();
    (Array.isArray(log) ? log : []).forEach((evento) => {
        if (!evento) return;
        const timestamp = Number(evento.timestamp || (evento.dados && evento.dados.timestamp) || Date.now());
        const id = String(evento.id || ('log_' + timestamp + '_' + Math.random().toString(36).slice(2, 8)));
        porId.set(id, {
            ...evento,
            id,
            timestamp,
            dataIso: evento.dataIso || new Date(timestamp).toISOString(),
            dataLocal: evento.dataLocal || new Date(timestamp).toLocaleString('pt-BR'),
            dados: evento.dados || {}
        });
    });

    return Array.from(porId.values())
        .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))
        .slice(0, window.APP_LOG_LIMIT || 300);
};

window.obterLogEventos = function() {
    try {
        const log = JSON.parse(localStorage.getItem(window.APP_LOG_KEY) || '[]');
        return window.normalizarListaLogEventos(log);
    } catch (error) {
        return [];
    }
};

window.salvarLogEventos = function(log) {
    const normalizado = window.normalizarListaLogEventos(log);
    localStorage.setItem(window.APP_LOG_KEY, JSON.stringify(normalizado));
    return normalizado;
};

window.obterLogsPendentes = function() {
    try {
        const log = JSON.parse(localStorage.getItem(window.APP_LOG_PENDING_KEY) || '[]');
        return window.normalizarListaLogEventos(log);
    } catch (error) {
        return [];
    }
};

window.salvarLogsPendentes = function(log) {
    const normalizado = window.normalizarListaLogEventos(log);
    localStorage.setItem(window.APP_LOG_PENDING_KEY, JSON.stringify(normalizado));
    return normalizado;
};

window.adicionarLogPendente = function(evento) {
    window.salvarLogsPendentes([evento, ...window.obterLogsPendentes()]);
};

window.removerLogPendente = function(id) {
    window.salvarLogsPendentes(window.obterLogsPendentes().filter(evento => evento.id !== id));
};

window.mesclarLogEventos = function(eventos) {
    const merged = window.salvarLogEventos([
        ...window.obterLogEventos(),
        ...(Array.isArray(eventos) ? eventos : [])
    ]);
    if (typeof window.renderizarLogDesenvolvedor === 'function') {
        window.renderizarLogDesenvolvedor();
    }
    return merged;
};

window.sincronizarLogsPendentes = async function() {
    if (typeof window.firebasePushLog !== 'function' || !navigator.onLine) return;
    const pendentes = window.obterLogsPendentes();
    for (const evento of pendentes) {
        try {
            await window.firebasePushLog(evento);
            window.removerLogPendente(evento.id);
        } catch (error) {
            break;
        }
    }
};

window.prepararMigracaoLogGlobal = function() {
    if (localStorage.getItem(window.APP_LOG_MIGRATED_KEY) === 'true') return;
    const locais = window.obterLogEventos();
    if (locais.length > 0) {
        window.salvarLogsPendentes([...window.obterLogsPendentes(), ...locais]);
    }
    localStorage.setItem(window.APP_LOG_MIGRATED_KEY, 'true');
};

window.registrarLogEvento = function(tipo, mensagem, dados = {}) {
    const timestamp = Number(dados.timestamp || dados.createdAt) || Date.now();
    const evento = {
        id: 'log_' + timestamp + '_' + Math.random().toString(36).slice(2, 8),
        tipo,
        mensagem,
        timestamp,
        dataIso: new Date(timestamp).toISOString(),
        dataLocal: new Date(timestamp).toLocaleString('pt-BR'),
        deviceId: window.obterLogDeviceId(),
        runtime: window.isNativeRuntime() ? 'apk' : 'pwa',
        dados
    };
    window.mesclarLogEventos([evento]);
    window.adicionarLogPendente(evento);

    if (navigator.onLine && typeof window.firebasePushLog === 'function') {
        Promise.resolve(window.firebasePushLog(evento))
            .then(() => window.removerLogPendente(evento.id))
            .catch(() => {});
    }

    return evento;
};

window.registrarOperacaoBanco = function(tipo, mensagem, rede = {}, dados = {}) {
    if (typeof window.registrarLogEvento !== 'function') return null;
    const payload = {
        redeId: rede?.id || dados.redeId || null,
        ssid: rede?.ssid || dados.ssid || null,
        bssid: rede?.bssid || dados.bssid || null,
        local: !!String(rede?.id || dados.redeId || '').startsWith('local_'),
        online: navigator.onLine,
        ...dados
    };
    return window.registrarLogEvento(tipo, mensagem, payload);
};

window.getRedeLogTimestamp = function(rede) {
    if (!rede) return 0;
    const id = String(rede.id || '');
    const ssid = String(rede.ssid || '');
    const senha = String(rede.senha || '');
    const eventos = window.obterLogEventos();
    const evento = eventos.find(item => {
        if (item.tipo !== 'rede_adicionada') return false;
        const dados = item.dados || {};
        if (id && String(dados.redeId || '') === id) return true;
        return String(dados.ssid || '') === ssid && String(dados.senha || '') === senha;
    });
    return evento ? Number(evento.timestamp) || 0 : 0;
};

window.renderizarLogDesenvolvedor = function() {
    const out = document.getElementById('appLogOutput');
    if (!out) return;
    const log = window.obterLogEventos();
    if (!log.length) {
        out.textContent = 'Sem eventos registrados.';
        return;
    }
    out.innerHTML = '';
    log.slice(0, 80).forEach(evento => {
        const item = document.createElement('div');
        item.className = 'developer-log-item';
        const title = document.createElement('strong');
        title.textContent = evento.mensagem || evento.tipo || 'Evento';
        const meta = document.createElement('span');
        meta.textContent = evento.dataLocal || new Date(evento.timestamp || Date.now()).toLocaleString('pt-BR');
        item.appendChild(title);
        item.appendChild(meta);
        out.appendChild(item);
    });
};

window.carregarLogDesenvolvedor = async function() {
    const out = document.getElementById('appLogOutput');
    if (out) {
        out.innerHTML = '<div class="developer-log-item"><strong>Carregando logs...</strong><span>Buscando apenas os eventos recentes.</span></div>';
    }
    if (navigator.onLine && typeof window.carregarLogsFirebaseRecentes === 'function') {
        try {
            await window.carregarLogsFirebaseRecentes(120);
            return;
        } catch (error) {
            console.warn('Falha ao carregar logs recentes.', error);
            if (out) {
                out.innerHTML = '<div class="developer-log-item warning"><strong>Falha ao carregar nuvem.</strong><span>Mostrando logs locais deste dispositivo.</span></div>';
            }
        }
    }
    window.renderizarLogDesenvolvedor();
};

window.limparLogDesenvolvedor = async function() {
    localStorage.removeItem(window.APP_LOG_KEY);
    localStorage.removeItem(window.APP_LOG_PENDING_KEY);
    window.renderizarLogDesenvolvedor();
    if (navigator.onLine && typeof window.firebaseLimparLogs === 'function') {
        try {
            await window.firebaseLimparLogs();
            window.mostrarToast('Log global limpo.');
            return;
        } catch (error) {
            window.mostrarToast('Log local limpo. Falha ao limpar nuvem.');
            return;
        }
    }
    window.mostrarToast('Log local limpo.');
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
    out.classList.toggle('compact-mode', !!window.modoCompacto);
    if (btn) btn.innerHTML = window.modoCompacto ? '&#9776;' : '&#9636;';
};

window.resolverTemaApp = function(theme = window.appThemeMode) {
    if (theme !== 'auto') return theme === 'light' ? 'light' : 'dark';
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    return 'dark';
};

window.aplicarTemaApp = function() {
    const theme = ['dark', 'light', 'auto'].includes(window.appThemeMode) ? window.appThemeMode : 'auto';
    const resolvedTheme = window.resolverTemaApp(theme);
    const html = document.documentElement;
    html.dataset.theme = theme;
    html.dataset.resolvedTheme = resolvedTheme;
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', resolvedTheme === 'light' ? '#f4f6fb' : '#0d0e18');

    document.querySelectorAll('[data-theme-option]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.themeOption === theme);
    });
};

window.definirTemaApp = function(theme) {
    window.appThemeMode = ['dark', 'light', 'auto'].includes(theme) ? theme : 'auto';
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
    const homeRouter = document.getElementById('btnHomeManageRouter');

    if (homeRouter && !native) {
        homeRouter.disabled = false;
        homeRouter.onclick = () => {
            if (typeof window.abrirModalGerenciarRoteador === 'function') {
                window.abrirModalGerenciarRoteador();
            }
        };
    }

    if (bottomWifi && native) {
        bottomWifi.innerHTML = '<span class="nav-icon">&#128246;</span><span class="nav-label">Scanner</span><small>Wi-Fi</small>';
        bottomWifi.onclick = () => {
            if (typeof window.abrirModalWifiReal === 'function') window.abrirModalWifiReal();
        };
        bottomWifi.removeAttribute('data-radar-button');
    } else if (bottomWifi) {
        bottomWifi.innerHTML = '<span class="nav-icon">&#8982;</span><span class="nav-label">Radar</span><small>GPS</small>';
        bottomWifi.onclick = abrirRadar;
        bottomWifi.setAttribute('data-radar-button', 'true');
    }

    if (drawerWifi) {
        drawerWifi.innerHTML = '<span class="drawer-icon">&#8982;</span><span>Radar</span>';
        drawerWifi.onclick = abrirRadar;
        drawerWifi.setAttribute('data-radar-button', 'true');
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
        return window.obterRedesRecentes(base);
    }
    return base;
};

window.obterRedesRecentes = function(lista, limite = 10) {
    return (Array.isArray(lista) ? lista : [])
        .map(rede => ({ rede, timestamp: window.getRedeRecentTimestamp(rede) }))
        .filter(item => item.timestamp > 0)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limite)
        .map(item => item.rede);
};

window.getRedeRecentTimestamp = function(rede) {
    if (!rede) return 0;
    const logTimestamp = window.getRedeLogTimestamp(rede);
    if (logTimestamp > 0) return logTimestamp;

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
    const recent = window.obterRedesRecentes(redes).length;

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
            if (routerBtn) routerBtn.disabled = false;
            if (saveBtn) saveBtn.disabled = true;
        } else if (current && current.connected && current.ssid) {
            if (labelEl) labelEl.textContent = 'Rede Atual';
            ssidEl.textContent = current.ssid;
            metaEl.textContent = `${current.level || 'Sinal n/d'} dBm${current.bssid ? ' - ' + current.bssid : ''}`;
            if (routerBtn) routerBtn.disabled = false;
            if (saveBtn) saveBtn.disabled = !!(window.redesEmMemoria || []).find(rede => rede.ssid === current.ssid);
        } else {
            if (labelEl) labelEl.textContent = 'Rede Atual';
            ssidEl.textContent = 'Sem Wi-Fi conectado';
            metaEl.textContent = 'Abra Redes para escanear redes proximas';
            if (routerBtn) routerBtn.disabled = !document.body.classList.contains('pwa-runtime');
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
            const network = {
                ssid: rede.ssid,
                bssid: rede.bssid || '',
                capabilities: rede.senha ? '[WPA2-PSK]' : ''
            };
            conectar.textContent = typeof window.obterRotuloAcaoRedeSalvaAndroid === 'function'
                ? window.obterRotuloAcaoRedeSalvaAndroid(network, [rede])
                : 'Abrir Wi-Fi';
            conectar.addEventListener('click', () => {
                if (typeof window.acionarRedeSalvaNoAndroid === 'function') {
                    window.acionarRedeSalvaNoAndroid(rede, network, conectar);
                    return;
                }
                window.conectarRedeWifiReal(rede, network, conectar, { forceSwitch: true });
            });
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

window.mostrarSobreApp = function() {
    window.mostrarToast('Wi-Fi Manager Pro\nDesenvolvido por Rai Dias');
    if (typeof window.fecharMenuLateral === 'function') window.fecharMenuLateral();
};

window.abrirModalGerenciarRoteador = function() {
    if (typeof window.fecharMenuLateral === 'function') window.fecharMenuLateral();
    const modal = document.getElementById('modalGerenciarRoteadorPwa');
    if (modal) modal.style.display = 'flex';
};

window.fecharModalGerenciarRoteador = function() {
    const modal = document.getElementById('modalGerenciarRoteadorPwa');
    if (modal) modal.style.display = 'none';
};

window.abrirEnderecoRoteador = function(ipOuUrl) {
    const entrada = String(ipOuUrl || '').trim();
    if (!entrada) {
        window.mostrarToast('Digite o IP do roteador.');
        return;
    }

    const valor = entrada.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const ipv4 = valor.match(/^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/);
    if (!ipv4) {
        window.mostrarToast('IP invalido. Exemplo: 192.168.1.1');
        return;
    }

    const octetos = valor.split(':')[0].split('.').map(Number);
    if (octetos.some(num => Number.isNaN(num) || num < 0 || num > 255)) {
        window.mostrarToast('IP invalido. Cada bloco precisa estar entre 0 e 255.');
        return;
    }

    window.open(`http://${valor}`, '_blank', 'noopener,noreferrer');
    window.fecharModalGerenciarRoteador();
};

window.abrirModal = function() {
    window.novaRedeBssidSugerida = null;
    window.novaRedeWifiSugerida = null;
    window.novaRedeConectarAposCadastro = false;
    document.getElementById('modalNovaRede').style.display = 'flex';
    window.validarSenhaNovaModal();
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
    const btnSalvar = document.getElementById('btnSalvarModal');
    if (btnSalvar) {
        btnSalvar.disabled = false;
        btnSalvar.innerText = 'Salvar';
        delete btnSalvar.dataset.saving;
    }
};

window.validarSenhaNovaModal = function() {
    const senhaInput = document.getElementById('novaSenha');
    const btnSalvar = document.getElementById('btnSalvarModal');
    if (!senhaInput || !btnSalvar) return true;

    const senha = senhaInput.value.trim();
    const senhaValida = senha.length >= 8;
    senhaInput.setCustomValidity(senhaValida || senha.length === 0 ? '' : 'A senha precisa ter no minimo 8 caracteres.');
    btnSalvar.disabled = !senhaValida;
    return senhaValida;
};

window.filtrar = function() { 
    const v = document.getElementById('searchInput').value.toLowerCase(); 
    document.querySelectorAll('.card').forEach(c => c.style.display = c.dataset.nomeRede.includes(v) ? 'flex' : 'none'); 
};

window.abrirAbaDesenvolvedor = function(tab = 'import') {
    document.querySelectorAll('[data-dev-tab-button]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.devTabButton === tab);
    });
    document.querySelectorAll('[data-dev-tab-panel]').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.devTabPanel === tab);
    });

    if (tab === 'log') window.renderizarLogDesenvolvedor();
    if (tab === 'duplicates') {
        window.renderizarDuplicatasBanco();
        window.renderizarPossiveisDuplicatasBanco();
    }
    if (tab === 'diagnostic') window.renderizarEstadoDiagnosticoFirebase();
    if (tab === 'history') window.renderizarHistoricoRede();
    if (tab === 'maintenance') window.renderizarBackupManutencao();
};

window.renderizarEstadoDiagnosticoFirebase = function(resultado = null) {
    const out = document.getElementById('firebaseDiagnosticOutput');
    if (!out) return;
    const estado = typeof window.getFirebaseDiagnosticState === 'function'
        ? window.getFirebaseDiagnosticState()
        : {};
    const lastSync = estado.lastSyncAt ? new Date(estado.lastSyncAt).toLocaleString('pt-BR') : 'sem sincronizacao registrada';
    const classe = resultado && resultado.ok === false ? 'danger' : 'success';
    out.innerHTML = `<div class="developer-log-item ${classe}"><strong>Estado atual</strong><span>Modo: ${estado.mode || 'indefinido'}</span><span>Ultima sync: ${lastSync}</span><span>Total recebido: ${estado.lastTotal ?? 'n/d'} | Origem: ${estado.lastOrigin || 'n/d'}</span><span>${estado.lastError ? 'Ultimo erro: ' + estado.lastError : 'Sem erro registrado'}</span></div>`;
    if (resultado) {
        const item = document.createElement('div');
        item.className = `developer-log-item ${resultado.ok ? 'success' : 'danger'}`;
        item.innerHTML = `<strong>Teste ${resultado.ok ? 'aprovado' : 'falhou'}</strong><span>Leitura: ${resultado.read ? 'OK' : 'Falhou'}</span><span>Escrita: ${resultado.write ? 'OK' : 'Falhou'}</span><span>Exclusao: ${resultado.delete ? 'OK' : 'Falhou'}</span><span>${resultado.error || 'Firebase respondeu normalmente.'}</span>`;
        out.appendChild(item);
    }
};

window.testarDiagnosticoFirebase = async function() {
    const out = document.getElementById('firebaseDiagnosticOutput');
    if (out) out.innerHTML = '<div class="developer-log-item"><strong>Testando Firebase...</strong><span>Verificando leitura, escrita e exclusao.</span></div>';
    let resultado;
    if (typeof window.executarDiagnosticoFirebase === 'function') {
        resultado = await window.executarDiagnosticoFirebase();
    } else {
        resultado = { ok: false, read: false, write: false, delete: false, error: 'Diagnostico Firebase ainda nao inicializado.' };
    }
    window.renderizarEstadoDiagnosticoFirebase(resultado);
    window.mostrarToast(resultado.ok ? 'Firebase OK.' : 'Firebase com falha no diagnostico.');
};

window.renderizarHistoricoRede = function() {
    const input = document.getElementById('historySearchInput');
    const out = document.getElementById('networkHistoryOutput');
    if (!out) return;
    const termo = String(input?.value || '').trim().toLowerCase();
    if (!termo) {
        out.innerHTML = '<div class="developer-log-item"><strong>Historico por rede</strong><span>Digite SSID ou ID para filtrar eventos do log global.</span></div>';
        return;
    }

    const eventos = window.obterLogEventos().filter(evento => {
        const dados = evento.dados || {};
        return String(dados.redeId || '').toLowerCase().includes(termo)
            || String(dados.ssid || '').toLowerCase().includes(termo)
            || String(evento.mensagem || '').toLowerCase().includes(termo);
    });

    const redes = (window.redesEmMemoria || []).filter(rede => {
        return String(rede.id || '').toLowerCase().includes(termo)
            || String(rede.ssid || '').toLowerCase().includes(termo);
    });

    out.innerHTML = '';
    if (redes.length) {
        const resumo = document.createElement('div');
        resumo.className = 'developer-log-item success';
        resumo.innerHTML = `<strong>${redes.length} rede(s) encontrada(s)</strong><span>${redes.slice(0, 5).map(rede => `${rede.ssid} (${rede.id})`).join('<br>')}</span>`;
        out.appendChild(resumo);
    }

    if (!eventos.length) {
        const vazio = document.createElement('div');
        vazio.className = 'developer-log-item';
        vazio.innerHTML = '<strong>Nenhum evento encontrado.</strong><span>O log global pode nao ter eventos antigos dessa rede.</span>';
        out.appendChild(vazio);
        return;
    }

    eventos.slice(0, 80).forEach(evento => {
        const item = document.createElement('div');
        item.className = 'developer-log-item';
        const dados = evento.dados || {};
        item.innerHTML = `<strong>${evento.mensagem || evento.tipo}</strong><span>${evento.dataLocal || new Date(evento.timestamp || Date.now()).toLocaleString('pt-BR')}</span><span>ID: ${dados.redeId || 'n/d'} | SSID: ${dados.ssid || 'n/d'}</span><span>Tipo: ${evento.tipo || 'evento'}</span>`;
        out.appendChild(item);
    });
};

window.abrirModalAvancado = function() { 
    window.fecharMenuLateral();
    document.getElementById('modalAvancado').style.display = 'flex'; 
    const inputOculta = document.getElementById('listaInputOculta');
    inputOculta.value = window.redesEmMemoria.map(r => `* ${r.ssid}: ${r.senha}`).join('\n\n');
    window.renderizarLogDesenvolvedor();
    window.renderizarBackupManutencao();
    window.renderizarEstadoDiagnosticoFirebase();
    window.abrirAbaDesenvolvedor('import');
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

// MANUTENÃ‡ÃƒO / HARD RESET
window.hardResetPWA = async function() {
    if(!confirm("Atencao: Isso vai limpar o cache interno e atualizar o App para a versao mais recente. Deseja continuar?")) return;
    
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
    
    alert("App atualizado! Ele sera reiniciado agora.");
    window.location.reload(true);
};

// BANCO DE DADOS LOCAL (IndexedDB)
window.initDB = function() {
    return new Promise((resolve, reject) => {
        let encerrado = false;
        const timeout = setTimeout(() => {
            if (encerrado) return;
            encerrado = true;
            reject(new Error('Tempo esgotado ao abrir o banco local.'));
        }, 2500);
        const finalizar = (fn, valor) => {
            if (encerrado) return;
            encerrado = true;
            clearTimeout(timeout);
            fn(valor);
        };
        const request = indexedDB.open('WiFiManagerDB_v9', 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('redes')) {
                db.createObjectStore('redes', { keyPath: 'id' });
            }
        };
        request.onsuccess = () => finalizar(resolve, request.result);
        request.onerror = () => finalizar(reject, request.error || new Error('Falha ao abrir o banco local.'));
        request.onblocked = () => finalizar(reject, new Error('Banco local bloqueado por outra sessao.'));
    });
};

window.salvarNoIndexedDB = async function(lista) {
    try {
        const db = await window.initDB();
        const tx = db.transaction('redes', 'readwrite');
        const store = tx.objectStore('redes');
        store.clear(); 
        (Array.isArray(lista) ? lista : []).forEach(item => store.put(item));
        return await new Promise((resolve, reject) => {
            let encerrado = false;
            const timeout = setTimeout(() => {
                if (encerrado) return;
                encerrado = true;
                reject(new Error('Tempo esgotado ao salvar no banco local.'));
            }, 2500);
            const finalizar = (fn, valor) => {
                if (encerrado) return;
                encerrado = true;
                clearTimeout(timeout);
                fn(valor);
            };
            tx.oncomplete = () => finalizar(resolve, true);
            tx.onerror = () => finalizar(reject, tx.error || new Error('Falha ao salvar no banco local.'));
            tx.onabort = () => finalizar(reject, tx.error || new Error('Gravacao local cancelada.'));
        });
    } catch (e) {
        console.warn('Falha ao salvar no IndexedDB.', e);
        try {
            localStorage.setItem('wifi_pro_backup_indexeddb_fallback_v1', JSON.stringify(Array.isArray(lista) ? lista : []));
        } catch (fallbackError) {}
        return false;
    }
};

window.lerDoIndexedDB = async function() {
    try {
        const db = await window.initDB();
        const tx = db.transaction('redes', 'readonly');
        const store = tx.objectStore('redes');
        const request = store.getAll();
        return await new Promise(resolve => {
            let encerrado = false;
            const fallback = () => {
                try {
                    return JSON.parse(localStorage.getItem('wifi_pro_backup_indexeddb_fallback_v1') || '[]');
                } catch (fallbackError) {
                    return [];
                }
            };
            const timeout = setTimeout(() => {
                if (encerrado) return;
                encerrado = true;
                resolve(fallback());
            }, 2500);
            const finalizar = (valor) => {
                if (encerrado) return;
                encerrado = true;
                clearTimeout(timeout);
                resolve(valor);
            };
            request.onsuccess = () => finalizar(request.result || []);
            request.onerror = () => finalizar(fallback());
            tx.onabort = () => finalizar(fallback());
        });
    } catch (e) {
        try {
            return JSON.parse(localStorage.getItem('wifi_pro_backup_indexeddb_fallback_v1') || '[]');
        } catch (fallbackError) {
            return [];
        }
    }
};

window.atualizarBackupLocal = async function(lista) {
    await window.salvarNoIndexedDB(lista);
    const txtBackup = lista.map(r => `* ${r.ssid}: ${r.senha}`).join('\n\n');
    const inputOculta = document.getElementById('listaInputOculta');
    if(inputOculta) inputOculta.value = txtBackup; 
};

// SINCRONIZAÃ‡ÃƒO E CONTADORES
window.atualizarContador = function(modo, totalNuvem = 0) {
    const el = document.getElementById('statusContador');
    if(!el) return;
    
    const pendentesCriacao = window.redesEmMemoria.filter(r => String(r.id).startsWith('local_')).length;
    const pendentesExclusao = JSON.parse(localStorage.getItem('wifi_pro_deletes_v1') || '[]').length;
    const pendentesUpdate = Object.keys(JSON.parse(localStorage.getItem('wifi_pro_updates_v1') || '{}')).length;
    
    const totalPendentes = pendentesCriacao + pendentesExclusao + pendentesUpdate;
    const total = window.redesEmMemoria.length;
    
    let avisoPendentes = totalPendentes > 0 ? `<span style="color:#F59E0B; font-weight:bold; background:rgba(245, 158, 11, 0.15); padding:3px 8px; border-radius:6px; margin-left: 5px; border: 1px solid rgba(245, 158, 11, 0.3);">Pendentes: ${totalPendentes}</span>` : '';

    if (modo === 'offline') {
        el.innerHTML = `<span style="color:var(--text-muted);">Offline (${total})</span> ${avisoPendentes}`;
    } else if (modo === 'local') {
        el.innerHTML = `<span style="color:var(--success);">Local (${total})</span> ${avisoPendentes}`;
    } else if (modo === 'sincronizando') {
        el.innerHTML = `<span style="color:var(--warning);">Sincronizando...</span> ${avisoPendentes}`;
    } else if (modo === 'sincronizado') {
        el.innerHTML = `<span style="color:var(--success);">Online (${totalNuvem})</span>`;
    }
};

window.sincronizarPendentes = async function() {
    if (typeof window.firebasePush !== 'function') return;

    let filaExclusao = JSON.parse(localStorage.getItem('wifi_pro_deletes_v1') || '[]');
    if (filaExclusao.length > 0) {
        filaExclusao.forEach(id => {
            if(typeof window.firebaseExcluir === 'function') window.firebaseExcluir(id);
            window.registrarLogEvento('sync_exclusao_enviada', `Exclusao sincronizada: ${id}`, {
                redeId: id,
                operacao: 'delete'
            });
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
            window.registrarLogEvento('sync_update_enviado', `Atualizacao sincronizada: ${id}`, {
                redeId: id,
                campos: Object.keys(toUpdate),
                operacao: 'update'
            });
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
            window.registrarOperacaoBanco('sync_criacao_enviada', `Rede local enviada para nuvem: ${rede.ssid}`, rede, {
                operacao: 'create'
            });
        });
    }
};

// EVENTOS BASE DO APLICATIVO
window.addEventListener('online', () => {
    window.atualizarContador('local');
    if (typeof window.sincronizarLogsPendentes === 'function') window.sincronizarLogsPendentes();
    if (typeof window.firebasePush === 'function') window.sincronizarPendentes();
});

window.addEventListener('offline', () => { window.atualizarContador('offline'); });

if (window.matchMedia) {
    const themeMedia = window.matchMedia('(prefers-color-scheme: light)');
    const refreshAutoTheme = () => {
        if (window.appThemeMode === 'auto') window.aplicarTemaApp();
    };
    if (themeMedia.addEventListener) {
        themeMedia.addEventListener('change', refreshAutoTheme);
    } else if (themeMedia.addListener) {
        themeMedia.addListener(refreshAutoTheme);
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    window.aplicarTemaApp();
    window.aplicarModoDesenvolvedor();
    window.aplicarRuntimeLayout();
    window.aplicarViewMode(); 

    window.renderizarInterface(window.redesEmMemoria || []);
    window.atualizarContador(navigator.onLine ? 'local' : 'offline');
    window.atualizarDashboardLayout();
    window.mostrarTelaApp(window.appCurrentView);

    const carregarBancoLocalAoAbrir = async () => {
        try {
        const dadosLocal = await window.lerDoIndexedDB();
        if (dadosLocal && dadosLocal.length > 0) {
            window.redesEmMemoria = window.deduplicarListaRedes(dadosLocal);
            if (window.redesEmMemoria.length !== dadosLocal.length) {
                window.registrarLogEvento('duplicata_removida', `${dadosLocal.length - window.redesEmMemoria.length} duplicata(s) removida(s) ao abrir o app`, {
                    removidas: dadosLocal.length - window.redesEmMemoria.length
                });
                window.atualizarBackupLocal(window.redesEmMemoria);
            }
            window.renderizarInterface(window.redesEmMemoria);
            if (typeof window.atualizarPreScanWifiComBanco === 'function') {
                window.atualizarPreScanWifiComBanco();
            }
            window.atualizarContador(navigator.onLine ? 'local' : 'offline');
        }
        } catch (e) {
            console.warn('Falha ao carregar banco local na abertura.', e);
        } finally {
            window.atualizarDashboardLayout();
        }
    };

    setTimeout(carregarBancoLocalAoAbrir, 0);
    
    // CORREÃ‡ÃƒO 1: QR CODE LENGTH OVERFLOW
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
                        // FunÃ§Ã£o para escapar caracteres especiais no formato Wi-Fi
                        const escapeWiFiChar = (str) => {
                            return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/:/g, '\\:').replace(/"/g, '\\"');
                        };
                        
                        const ssid = escapeWiFiChar(entry.target.dataset.ssid);
                        const pass = escapeWiFiChar(entry.target.dataset.pass);
                        
                        // Formato Wi-Fi padrÃ£o com escape de caracteres especiais
                        const wifiString = window.criarWifiQrPayload(entry.target.dataset.ssid, entry.target.dataset.pass);
                        
                        // Tenta com diferentes nÃ­veis de correÃ§Ã£o (M Ã© melhor para dados grandes)
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
                                // Tenta o prÃ³ximo nÃ­vel
                                continue;
                            }
                        }
                        
                        if (!gerado) {
                            throw new Error("Falha em todos os niveis de correcao");
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

// OPERAÃ‡Ã•ES DE REDE (CRUD)
window.renderizarInterface = function(lista, radar = false) {
    const out = document.getElementById('output');
    if(!out) return;
    out.innerHTML = '';
    lista.forEach(r => {
        const div = document.createElement('div');
        div.className = 'card'; div.dataset.nomeRede = r.ssid.toLowerCase();
        
        // CORREÃ‡ÃƒO 2: Parsing de GPS para o Radar funcionar
        const latF = parseFloat(String(r.lat).replace(',', '.'));
        const distBadge = (radar && !isNaN(latF)) ? `<div class="badge-geo" style="background:rgba(16, 185, 129, 0.1); color:var(--success); border-color:rgba(16, 185, 129, 0.3);">A ${Math.round(r.d)}m</div>` : (r.lat ? `<div class="badge-geo">Local Salvo</div>` : '');
        
        const btnMapa = r.lat ? "Editar Local" : "Add Local";
        const corMapa = r.lat ? "var(--geo)" : "#6366F1";

        div.innerHTML = `
            <div class="card-info">
                ${distBadge}
                <h3>${r.ssid}</h3>
                <p>${r.senha}</p>
            </div>
            <div class="qrcode" data-ssid="${r.ssid}" data-pass="${r.senha}">Gerando...</div>
            <div class="card-actions">
                <button class="btn-mini" style="background:var(--btn-copy-bg);color:var(--text-main)" onclick="copy('${r.senha}')">&#128203; Copiar</button>
                <button class="btn-mini" style="background:var(--success);color:#fff" onclick="compartilharRede('${r.ssid}', '${r.senha}')">&#128279; Compartilhar</button>
                <button class="btn-mini" style="background:${corMapa}; color:#fff;" onclick="window.abrirMapaParaRede('${r.id}','${r.ssid}','${r.lat}','${r.lng}')">${btnMapa}</button>
                <button class="btn-mini" style="background:var(--warning); color:#fff;" onclick="abrirModalEditar('${r.id}')">&#9998; Editar</button>
            </div>`;
        out.appendChild(div);
        if(window.observer) window.observer.observe(div.querySelector('.qrcode'));
    });
};

window.renderizarInterface = function(lista, radar = false) {
    const out = document.getElementById('output');
    if (!out) return;
    if (!radar && Array.isArray(lista) && typeof window.deduplicarListaRedes === 'function') {
        const listaDeduplicada = window.deduplicarListaRedes(lista);
        if (lista === window.redesEmMemoria && listaDeduplicada.length !== lista.length) {
            const removidas = lista.length - listaDeduplicada.length;
            window.redesEmMemoria = listaDeduplicada;
            window.atualizarBackupLocal(window.redesEmMemoria);
            window.registrarLogEvento('duplicata_removida', `${removidas} duplicata(s) removida(s) ao atualizar a lista`, {
                removidas
            });
        }
        lista = listaDeduplicada;
    }
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

        actions.appendChild(criarBotao('Copiar', 'var(--btn-copy-bg)', 'var(--text-main)', () => window.copy(senha)));
        actions.appendChild(criarBotao('Compartilhar', 'var(--success)', '#fff', () => window.compartilharRede(ssid, senha)));
        actions.appendChild(criarBotao(r.lat ? 'Editar Local' : 'Add Local', r.lat ? 'var(--geo)' : '#6366F1', '#fff', () => window.abrirMapaParaRede(r.id, ssid, r.lat, r.lng)));
        actions.appendChild(criarBotao('Editar', 'var(--warning)', '#fff', () => window.abrirModalEditar(r.id)));

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
        msg.innerText = !window.redeDuplicadaAtual.lat ? "Esta rede ja existe sem localizacao." : "Esta rede ja existe com localizacao.";
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
    if(p.length < 8) { window.mostrarToast("A senha deve ter no minimo 8 caracteres!"); return; }

    const id = window.redeEditandoAtual.id;
    const index = window.redesEmMemoria.findIndex(r => r.id === id);
    const redeAntes = index !== -1 ? { ...window.redesEmMemoria[index] } : { ...window.redeEditandoAtual };
    
    if(index !== -1) {
        window.redesEmMemoria[index].ssid = s;
        window.redesEmMemoria[index].senha = p;
        window.redesEmMemoria[index].logicalId = window.obterIdLogicoRede(window.redesEmMemoria[index]);
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
    window.registrarOperacaoBanco('rede_editada', `Rede editada: ${redeAntes.ssid || s}`, {
        ...redeAntes,
        id,
        ssid: s,
        senha: p
    }, {
        ssidAnterior: redeAntes.ssid || null,
        ssidNovo: s,
        senhaAlterada: String(redeAntes.senha || '') !== p
    });
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
    window.registrarOperacaoBanco('rede_exclusao_solicitada', `Exclusao solicitada: ${rede.ssid}`, rede);
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
    window.registrarOperacaoBanco('rede_exclusao_desfeita', `Exclusao desfeita: ${window.redePendenteExclusao.ssid}`, window.redePendenteExclusao);
    window.renderizarInterface(window.redesEmMemoria);
    window.atualizarContador(navigator.onLine ? 'sincronizando' : 'offline');
    window.redePendenteExclusao = null;
    document.getElementById('toast-undo').className = '';
    window.mostrarToast("Acao desfeita!");
};

window.confirmarExclusaoDefinitiva = function() {
    if (!window.redePendenteExclusao) return;
    const id = window.redePendenteExclusao.id;
    const redeExcluida = { ...window.redePendenteExclusao };
    if (navigator.onLine && typeof window.firebaseExcluir === 'function' && !id.toString().startsWith('local_')) {
        window.firebaseExcluir(id);
    } else if (!id.toString().startsWith('local_')) {
        let filaExclusao = JSON.parse(localStorage.getItem('wifi_pro_deletes_v1') || '[]');
        if(!filaExclusao.includes(id)) filaExclusao.push(id);
        localStorage.setItem('wifi_pro_deletes_v1', JSON.stringify(filaExclusao));
    }
    window.registrarOperacaoBanco('rede_excluida', `Rede excluida: ${redeExcluida.ssid}`, redeExcluida);
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
                window.mostrarToast("Coordenadas invalidas! Use o formato: -23.55, -46.63");
                return;
            }
        } else {
            window.mostrarToast("Coordenadas invalidas! Use o formato: -23.55, -46.63");
            return;
        }
    } 
    // PRIORIDADE 2: GPS do celular (apenas se checkbox marcado e sem coordenadas manuais)
    else if (usarGeo) {
        btnGeo.innerText = "Obtendo GPS..."; btnGeo.disabled = true;
        try {
            const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, {
                enableHighAccuracy: true, timeout: 7000 
            }));
            lat = pos.coords.latitude; 
            lng = pos.coords.longitude;
        } catch(e) { 
            window.mostrarToast("GPS falhou. Verifique as permissoes."); 
            btnGeo.innerText = "Adicionar GPS Agora"; 
            btnGeo.disabled = false;
            return;
        }
    }
    // PRIORIDADE 3: Sem localizaÃ§Ã£o (campo vazio e checkbox desmarcado)
    // Neste caso, lat e lng permanecem null, o que Ã© vÃ¡lido

    const id = window.redeDuplicadaAtual.id;
    const index = window.redesEmMemoria.findIndex(r => r.id === id);
    const redeAtualizada = index !== -1 ? window.redesEmMemoria[index] : window.redeDuplicadaAtual;
    if (index !== -1) {
        window.redesEmMemoria[index].lat = lat;
        window.redesEmMemoria[index].lng = lng;
    }

    // SincronizaÃ§Ã£o com Firebase ou Fila de Updates
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
    window.registrarOperacaoBanco('localizacao_atualizada', `Localizacao atualizada: ${redeAtualizada.ssid}`, {
        ...redeAtualizada,
        lat,
        lng
    }, {
        lat,
        lng,
        origem: coordManual ? 'manual' : (usarGeo ? 'gps' : 'sem_localizacao')
    });
    window.renderizarInterface(window.redesEmMemoria);
    window.fecharModal();
    btnGeo.innerText = "Adicionar GPS Agora"; 
    btnGeo.disabled = false;
    
    const msgSucesso = lat && lng ? "Localizacao adicionada com sucesso!" : "Rede atualizada sem localizacao!";
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
    if(p.length < 8) {
        window.validarSenhaNovaModal();
        window.mostrarToast("A senha precisa ter no minimo 8 caracteres.");
        return;
    }
    
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
                window.mostrarToast("Coordenadas invalidas! Use o formato: -23.55, -46.63");
                return;
            }
        } else {
            window.mostrarToast("Coordenadas invalidas! Use o formato: -23.55, -46.63");
            return;
        }
    } 
    // PRIORIDADE 2: GPS do celular (apenas se checkbox marcado e sem coordenadas manuais)
    else if (usarGeo) {
        btnSalvar.innerText = "Obtendo GPS..."; 
        btnSalvar.disabled = true;
        try {
            const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, {
                enableHighAccuracy: true, timeout: 7000 
            }));
            lat = pos.coords.latitude; 
            lng = pos.coords.longitude;
        } catch(e) { 
            window.mostrarToast("GPS falhou. Rede salva sem localizacao.");
            // Continua salvando sem localizaÃ§Ã£o
        }
    }
    // PRIORIDADE 3: Sem localizaÃ§Ã£o (campo vazio e checkbox desmarcado)
    // Neste caso, lat e lng permanecem null, o que Ã© vÃ¡lido

    const bssid = typeof window.normalizarWifiBssid === 'function'
        ? window.normalizarWifiBssid(window.novaRedeBssidSugerida)
        : String(window.novaRedeBssidSugerida || '').trim().toLowerCase();
    const contextoWifiCadastro = window.novaRedeWifiSugerida ? { ...window.novaRedeWifiSugerida } : null;
    const conectarAposCadastro = !!window.novaRedeConectarAposCadastro;

    if (btnSalvar?.dataset.saving === 'true') return;
    if (btnSalvar) {
        btnSalvar.dataset.saving = 'true';
        btnSalvar.disabled = true;
        btnSalvar.innerText = "Salvando...";
    }

    window.deduplicarRedesMemoria();
    const redeJaExistente = window.encontrarRedeMesmoCadastro(s, p, bssid || null);
    if (redeJaExistente) {
        window.renderizarInterface(window.redesEmMemoria);
        window.fecharModal();
        if (btnSalvar) {
            btnSalvar.innerText = "Salvar";
            btnSalvar.disabled = false;
            delete btnSalvar.dataset.saving;
        }
        window.mostrarToast("Esta rede ja estava salva.");
        return;
    }

    const metaCriacao = window.criarMetadadosCadastroRede();
    const logicalId = window.obterIdLogicoRede({ ssid: s, senha: p, lat, lng, bssid: bssid || null });
    let novoId = 'local_' + metaCriacao.createdAt; 
    if (navigator.onLine && typeof window.firebasePush === 'function') {
        const key = window.firebasePush(s, p, lat, lng, bssid || null, { ...metaCriacao, logicalId });
        if (key) novoId = key;
    }

    const novaRede = { id: novoId, ssid: s, senha: p, lat, lng, bssid: bssid || null, logicalId, ...metaCriacao };
    window.redesEmMemoria.push(novaRede);
    window.registrarLogEvento('rede_adicionada', `Rede adicionada: ${s}`, {
        redeId: novoId,
        ssid: s,
        senha: p,
        bssid: bssid || null,
        createdAt: metaCriacao.createdAt,
        timestamp: metaCriacao.createdAt
    });
    window.deduplicarRedesMemoria();
    window.redesEmMemoria.sort((a, b) => a.ssid.localeCompare(b.ssid));
    await window.atualizarBackupLocal(window.redesEmMemoria);
    window.renderizarInterface(window.redesEmMemoria);
    if (typeof window.atualizarEstadoWifiComBanco === 'function') {
        window.atualizarEstadoWifiComBanco();
    }
    window.fecharModal(); 
    btnSalvar.innerText = "Salvar"; 
    btnSalvar.disabled = false;
    delete btnSalvar.dataset.saving;
    const conectando = await window.tentarConectarRedeRecemCadastrada(novaRede, contextoWifiCadastro, conectarAposCadastro);
    if (conectando) return;
    
    const msgSucesso = lat && lng ? "Rede salva com localizacao!" : "Rede salva sem localizacao!";
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
                    window.registrarLogEvento('rede_adicionada', `Rede adicionada por importacao: ${s}`, {
                        redeId: 'local_' + metaImportacao.createdAt,
                        ssid: s,
                        senha: p,
                        createdAt: metaImportacao.createdAt,
                        timestamp: metaImportacao.createdAt
                    });
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
            const camposAtualizados = [];
            if (bssid && !window.normalizarBssidImportacao(existente.bssid)) {
                existente.bssid = bssid;
                mudou = true;
                camposAtualizados.push('bssid');
            }
            if (rede.lat !== null && rede.lng !== null && (!existente.lat || !existente.lng)) {
                existente.lat = rede.lat;
                existente.lng = rede.lng;
                mudou = true;
                camposAtualizados.push('lat', 'lng');
            }
            if (mudou) {
                atualizados++;
                window.registrarOperacaoBanco('rede_atualizada_importacao', `Rede atualizada por importacao: ${existente.ssid}`, existente, {
                    campos: camposAtualizados,
                    origem: 'importacao'
                });
            }
            return;
        }

        const metaImportacao = window.criarMetadadosCadastroRede(Date.now() + adicionados);
        const redeIdImportada = 'local_' + metaImportacao.createdAt + '_' + adicionados;
        window.redesEmMemoria.push({
            id: redeIdImportada,
            ssid: rede.ssid,
            senha: rede.senha,
            bssid: bssid || null,
            lat: rede.lat ?? null,
            lng: rede.lng ?? null,
            ...metaImportacao,
            logicalId: window.obterIdLogicoRede({
                ssid: rede.ssid,
                senha: rede.senha,
                bssid: bssid || null,
                lat: rede.lat ?? null,
                lng: rede.lng ?? null
            })
        });
        window.registrarLogEvento('rede_adicionada', `Rede adicionada por importacao: ${rede.ssid}`, {
            redeId: redeIdImportada,
            ssid: rede.ssid,
            senha: rede.senha,
            bssid: bssid || null,
            createdAt: metaImportacao.createdAt,
            timestamp: metaImportacao.createdAt
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

    await window.criarBackupManutencao('antes_importar_texto', {
        redesImportadas: redes.length
    });
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

        await window.criarBackupManutencao('antes_importar_arquivo', {
            arquivo: file.name,
            redesImportadas: redes.length
        });
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
    if (typeof window.jspdf === 'undefined') return alert("Biblioteca PDF nao carregada.");
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
    const title = 'Wi-Fi: ' + ssid;
    const text = `Rede: ${ssid}\nSenha: ${senha}`;

    const plugin = typeof window.getPluginExportacaoNativa === 'function' ? window.getPluginExportacaoNativa() : null;
    if (plugin && typeof plugin.shareText === 'function') {
        try {
            await plugin.shareText({ title, text });
            return;
        } catch (error) {
            console.warn('Compartilhamento nativo falhou:', error);
        }
    }

    if (navigator.share) {
        try {
            await navigator.share({ title, text });
            return;
        } catch (error) {
            console.warn('Compartilhamento web falhou:', error);
        }
    }

    try {
        await navigator.clipboard.writeText(text);
        window.mostrarToast("Dados copiados para compartilhar.");
    } catch (error) {
        window.mostrarToast("Compartilhamento nao suportado.");
    }
};

