(function () {
    window.nativeWifiUltimoScan = [];
    window.wifiPreScanUltimasRedes = [];
    window.wifiPreScanExecutado = false;
    window.wifiAtualConexao = null;
    window.wifiRealtimeListener = null;
    window.wifiRealtimeErrorListener = null;
    window.wifiRealtimeAtivo = false;
    window.wifiScanEmAndamento = false;
    window.wifiPromptSsidIgnorado = null;
    window.wifiBssidPromptKey = null;
    window.wifiCurrentPromptTimer = null;
    window.wifiBssidMismatchPromptKey = null;
    window.wifiSugestaoAutomaticaKey = null;
    window.wifiLocalizacaoPromptKey = null;
    window.wifiLocalizacaoIgnoradaKey = null;

    function getWifiPlugin() {
        if (!window.Capacitor) return null;
        if (window.Capacitor.Plugins && window.Capacitor.Plugins.WifiNative) {
            return window.Capacitor.Plugins.WifiNative;
        }
        if (typeof window.Capacitor.registerPlugin === 'function') {
            return window.WifiNativePluginProxy || (window.WifiNativePluginProxy = window.Capacitor.registerPlugin('WifiNative'));
        }
        return null;
    }

    function isNativeWifiAvailable() {
        return !!(getWifiPlugin() && window.Capacitor && window.Capacitor.isNativePlatform());
    }

    function normalizarBssid(bssid) {
        let value = String(bssid || '').trim().toLowerCase().replace(/\s+/g, '').replace(/-/g, ':');
        if (/^[0-9a-f]{12}$/.test(value)) {
            value = value.match(/.{1,2}/g).join(':');
        }
        if (!value || value === '02:00:00:00:00:00' || value === '00:00:00:00:00:00') return '';
        return /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/.test(value) ? value : '';
    }

    window.normalizarWifiBssid = normalizarBssid;

    function mesmoSsid(a, b) {
        return String(a || '') === String(b || '');
    }

    function getNetworkSsid(networkOrSsid) {
        return typeof networkOrSsid === 'string' ? networkOrSsid : String((networkOrSsid && networkOrSsid.ssid) || '');
    }

    function getNetworkBssid(networkOrSsid) {
        return typeof networkOrSsid === 'string' ? '' : normalizarBssid(networkOrSsid && networkOrSsid.bssid);
    }

    function getRedeBssid(rede) {
        return normalizarBssid(rede && rede.bssid);
    }

    function redeTemLocalizacao(rede) {
        const lat = parseFloat(String(rede && rede.lat).replace(',', '.'));
        const lng = parseFloat(String(rede && rede.lng).replace(',', '.'));
        return Number.isFinite(lat) && Number.isFinite(lng);
    }

    function redesComMesmoSsid(ssid) {
        return (window.redesEmMemoria || []).filter(rede => mesmoSsid(rede.ssid, ssid));
    }

    function redesSalvasCompativeis(networkOrSsid) {
        const ssid = getNetworkSsid(networkOrSsid);
        const bssid = getNetworkBssid(networkOrSsid);
        const mesmoNome = redesComMesmoSsid(ssid);

        if (!bssid) return mesmoNome;

        const exatas = mesmoNome.filter(rede => getRedeBssid(rede) === bssid);
        if (exatas.length) return exatas;

        const semBssid = mesmoNome.filter(rede => !getRedeBssid(rede));
        const bssidDiferente = mesmoNome.filter(rede => {
            const redeBssid = getRedeBssid(rede);
            return redeBssid && redeBssid !== bssid;
        });
        return [...semBssid, ...bssidDiferente];
    }

    function redesSemLocalizacaoCompativeis(networkOrSsid) {
        const candidatos = redesSalvasCompativeis(networkOrSsid);
        const bssid = getNetworkBssid(networkOrSsid);

        if (bssid) {
            const exatas = candidatos.filter(rede => getRedeBssid(rede) === bssid);
            if (exatas.length) return exatas.filter(rede => !redeTemLocalizacao(rede));
        }

        return candidatos.filter(rede => !redeTemLocalizacao(rede));
    }

    function findRedeSalva(networkOrSsid) {
        return redesSalvasCompativeis(networkOrSsid)[0] || null;
    }

    function temMatchExatoBssid(network, candidatos = redesSalvasCompativeis(network)) {
        const bssid = getNetworkBssid(network);
        return !!bssid && candidatos.some(rede => getRedeBssid(rede) === bssid);
    }

    function deveEscolherRede(network, candidatos = redesSalvasCompativeis(network)) {
        return candidatos.length > 1 && !temMatchExatoBssid(network, candidatos);
    }

    function correspondeConexaoAtual(networkOrRede) {
        const connection = window.wifiAtualConexao;
        if (!connection || !connection.connected || !connection.ssid) return false;

        const ssid = getNetworkSsid(networkOrRede);
        if (!mesmoSsid(ssid, connection.ssid)) return false;

        const connectionBssid = normalizarBssid(connection.bssid);
        const targetBssid = getNetworkBssid(networkOrRede) || getRedeBssid(networkOrRede);
        if (connectionBssid && targetBssid) return connectionBssid === targetBssid;

        return true;
    }

    function rotuloAcaoRedeSalva(network, candidatos) {
        if (correspondeConexaoAtual(network)) return 'Abrir Wi-Fi';
        if (temBssidDiferenteDoAtual(network, candidatos)) return 'Corrigir';
        return deveEscolherRede(network, candidatos) ? 'Escolher' : 'Adicionar';
    }

    function ordenarRedesWifi(networks) {
        return [...networks].sort((left, right) => {
            const leftSaved = findRedeSalva(left) ? 1 : 0;
            const rightSaved = findRedeSalva(right) ? 1 : 0;
            if (leftSaved !== rightSaved) return rightSaved - leftSaved;

            const leftLevel = Number(left.level);
            const rightLevel = Number(right.level);
            const safeLeftLevel = Number.isNaN(leftLevel) ? -999 : leftLevel;
            const safeRightLevel = Number.isNaN(rightLevel) ? -999 : rightLevel;
            if (safeLeftLevel !== safeRightLevel) return safeRightLevel - safeLeftLevel;

            return String(left.ssid || '').localeCompare(String(right.ssid || ''));
        });
    }

    function formatarHorarioAtualizacao() {
        return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function formatarSeguranca(capabilities) {
        const caps = String(capabilities || '').toUpperCase();
        if (caps.includes('WEP')) return 'WEP';
        if (caps.includes('SAE') || caps.includes('WPA3')) return 'WPA3';
        if (caps.includes('WPA')) return 'WPA/WPA2';
        return 'Aberta';
    }

    function formatarSinal(level) {
        const value = Number(level);
        if (Number.isNaN(value)) return 'Sinal n/d';
        if (value >= -55) return 'Sinal forte';
        if (value >= -70) return 'Sinal bom';
        return 'Sinal fraco';
    }

    function formatarDbm(level) {
        if (typeof window.formatarWifiDbm === 'function') return window.formatarWifiDbm(level);
        const value = Number(level);
        if (!Number.isFinite(value)) return 'Sinal n/d';
        return `${Math.round(value)} dBm`;
    }

    function normalizarConexaoAtual(connection) {
        if (!connection || typeof connection !== 'object') return connection;
        const level = Number(connection.level);
        const rssi = Number(connection.rssi);
        if (!Number.isFinite(level) && Number.isFinite(rssi)) {
            connection.level = rssi;
        } else if (Number.isFinite(level) && !Number.isFinite(rssi)) {
            connection.rssi = level;
        }
        return connection;
    }

    function setResumo(texto) {
        const resumo = document.getElementById('wifiNativeResumo');
        if (resumo) resumo.textContent = texto;
    }

    function limparResultado() {
        const out = document.getElementById('wifiNativeOutput');
        if (out) out.innerHTML = '';
    }

    function mostrarMensagem(texto) {
        const out = document.getElementById('wifiNativeOutput');
        if (!out) return;
        out.innerHTML = '';
        const div = document.createElement('div');
        div.className = 'wifi-empty';
        div.textContent = texto;
        out.appendChild(div);
    }

    function criarContextoCadastro(networkOrSsid, bssid = '', conectarAposSalvar = false) {
        const network = typeof networkOrSsid === 'object' && networkOrSsid ? networkOrSsid : {};
        const ssid = getNetworkSsid(networkOrSsid);
        return {
            ssid,
            bssid: normalizarBssid(network.bssid || bssid) || '',
            capabilities: String(network.capabilities || ''),
            level: network.level !== undefined ? network.level : null,
            conectarAposSalvar: !!conectarAposSalvar
        };
    }

    function abrirCadastroSsid(ssid, bssid = '', network = null, options = {}) {
        esconderPromptRedeAtual();
        window.fecharModalWifiReal();
        if (typeof window.abrirModal === 'function') window.abrirModal();
        const contexto = criarContextoCadastro(network || ssid, bssid, !!options.conectarAposSalvar);
        window.novaRedeBssidSugerida = contexto.bssid || null;
        window.novaRedeWifiSugerida = contexto;
        window.novaRedeConectarAposCadastro = contexto.conectarAposSalvar;

        const ssidInput = document.getElementById('novoSSID');
        const senhaInput = document.getElementById('novaSenha');

        if (ssidInput) ssidInput.value = ssid || '';
        if (senhaInput) {
            senhaInput.value = '';
            setTimeout(() => senhaInput.focus(), 100);
        }
        if (typeof window.checarDuplicadoModal === 'function') window.checarDuplicadoModal();
        if (typeof window.validarSenhaNovaModal === 'function') window.validarSenhaNovaModal();
    }

    function esconderPromptRedeAtual() {
        const prompt = document.getElementById('wifiCurrentPrompt');
        if (window.wifiCurrentPromptTimer) {
            clearTimeout(window.wifiCurrentPromptTimer);
            window.wifiCurrentPromptTimer = null;
        }
        if (prompt) prompt.classList.remove('show');
        if (typeof window.atualizarElevacaoBotaoFlutuante === 'function') {
            window.atualizarElevacaoBotaoFlutuante();
        }
    }

    function mostrarPromptTemporizado(prompt) {
        if (!prompt) return;
        if (window.wifiCurrentPromptTimer) clearTimeout(window.wifiCurrentPromptTimer);
        prompt.classList.remove('show');
        void prompt.offsetWidth;
        mostrarPromptTemporizado(prompt);
        if (typeof window.atualizarElevacaoBotaoFlutuante === 'function') {
            window.atualizarElevacaoBotaoFlutuante();
        }
        window.wifiCurrentPromptTimer = setTimeout(() => {
            esconderPromptRedeAtual();
        }, 10000);
    }

    function chavePromptLocalizacao(connection, candidatos) {
        const ids = (candidatos || []).map(rede => rede.id || rede.ssid).join(',');
        return `${connection && connection.ssid ? connection.ssid : ''}|${normalizarBssid(connection && connection.bssid) || 'ssid'}|${ids}`;
    }

    async function escolherRedeParaLocalizacao(connection, candidatos) {
        if (!candidatos.length) return null;
        if (candidatos.length === 1) return candidatos[0];

        const bssid = normalizarBssid(connection && connection.bssid);
        if (bssid) {
            const exatas = candidatos.filter(rede => getRedeBssid(rede) === bssid);
            if (exatas.length === 1) return exatas[0];
        }

        return escolherRedeEmPopup(
            `Adicionar local de ${connection.ssid}`,
            'Existem redes salvas com o mesmo nome. Escolha qual cadastro deve receber a localizacao atual.',
            candidatos
        );
    }

    async function adicionarLocalizacaoRedeAtual(rede, connection, button = null) {
        if (!rede || !rede.id) return;

        const originalText = button ? button.textContent : '';
        if (button) {
            button.disabled = true;
            button.textContent = 'Obtendo GPS...';
        }

        try {
            const pos = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 9000,
                maximumAge: 0
            }));
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            await salvarPatchRede(rede, { lat, lng });
            window.wifiLocalizacaoIgnoradaKey = null;
            esconderPromptRedeAtual();
            if (typeof window.mostrarToast === 'function') {
                window.mostrarToast('Localizacao adicionada a rede atual.');
            }
            if (connection) renderizarConexaoAtual(connection);
        } catch (error) {
            if (typeof window.mostrarToast === 'function') {
                window.mostrarToast('GPS falhou. Verifique a permissao de localizacao.');
            }
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = originalText || 'Adicionar local';
            }
        }
    }

    function mostrarPromptLocalizacaoRedeAtual(connection, candidatos) {
        const prompt = document.getElementById('wifiCurrentPrompt');
        const ssidEl = document.getElementById('wifiCurrentPromptSsid');
        const addButton = document.getElementById('btnWifiCurrentPromptAdd');
        const dismissButton = document.getElementById('btnWifiCurrentPromptDismiss');
        const labelEl = prompt ? prompt.querySelector('.wifi-current-prompt-copy span') : null;
        const helperEl = prompt ? prompt.querySelector('.wifi-current-prompt-copy small') : null;

        if (!prompt || !ssidEl || !addButton || !dismissButton || !connection || !candidatos.length) return;

        const key = chavePromptLocalizacao(connection, candidatos);
        if (window.wifiLocalizacaoIgnoradaKey === key) {
            esconderPromptRedeAtual();
            return;
        }

        window.wifiLocalizacaoPromptKey = key;
        if (labelEl) labelEl.textContent = 'Rede atual sem localizacao';
        ssidEl.textContent = connection.ssid;
        if (helperEl) helperEl.textContent = 'Esta rede ja esta salva no banco. Adicione o GPS atual para ela aparecer corretamente no mapa.';
        addButton.textContent = 'Adicionar local';
        dismissButton.textContent = 'Agora nao';
        addButton.onclick = async () => {
            const rede = await escolherRedeParaLocalizacao(connection, candidatos);
            if (rede) await adicionarLocalizacaoRedeAtual(rede, connection, addButton);
        };
        dismissButton.onclick = () => {
            window.wifiLocalizacaoIgnoradaKey = key;
            esconderPromptRedeAtual();
        };
        mostrarPromptTemporizado(prompt);
    }

    function atualizarPromptRedeAtual(connection = window.wifiAtualConexao) {
        const prompt = document.getElementById('wifiCurrentPrompt');
        const ssidEl = document.getElementById('wifiCurrentPromptSsid');
        const addButton = document.getElementById('btnWifiCurrentPromptAdd');
        const dismissButton = document.getElementById('btnWifiCurrentPromptDismiss');
        const labelEl = prompt ? prompt.querySelector('.wifi-current-prompt-copy span') : null;
        const helperEl = prompt ? prompt.querySelector('.wifi-current-prompt-copy small') : null;

        if (!prompt || !ssidEl || !addButton || !dismissButton) return;

        if (!isNativeWifiAvailable() || !connection || !connection.connected || !connection.ssid) {
            esconderPromptRedeAtual();
            return;
        }

        const ssid = connection.ssid;
        if (findRedeSalva(connection)) {
            const semLocalizacao = redesSemLocalizacaoCompativeis(connection);
            if (semLocalizacao.length) {
                mostrarPromptLocalizacaoRedeAtual(connection, semLocalizacao);
                return;
            }
            esconderPromptRedeAtual();
            return;
        }

        if (window.wifiPromptSsidIgnorado === ssid) {
            esconderPromptRedeAtual();
            return;
        }

        if (labelEl) labelEl.textContent = 'Rede atual nao salva';
        ssidEl.textContent = ssid;
        if (helperEl) helperEl.textContent = 'Adicione esta rede ao banco para usar a conexao rapida depois.';
        addButton.textContent = 'Adicionar';
        dismissButton.textContent = 'Agora nao';
        addButton.onclick = () => abrirCadastroSsid(ssid, connection.bssid, connection, { conectarAposSalvar: false });
        dismissButton.onclick = () => {
            window.wifiPromptSsidIgnorado = ssid;
            esconderPromptRedeAtual();
        };
        prompt.classList.add('show');
    }

    function criarBotaoCadastrar(network) {
        const button = document.createElement('button');
        button.className = 'btn-mini wifi-action-secondary';
        button.type = 'button';
        button.textContent = 'Cadastrar';
        button.addEventListener('click', () => abrirCadastroSsid(network.ssid, network.bssid, network, { conectarAposSalvar: true }));
        return button;
    }

    function criarBotaoConectar(network, candidatos) {
        const button = document.createElement('button');
        button.className = 'btn-mini wifi-action-primary';
        button.type = 'button';
        button.textContent = rotuloAcaoRedeSalva(network, candidatos);
        button.addEventListener('click', async () => {
            if (correspondeConexaoAtual(network)) {
                const redeAtual = candidatos[0] || { ssid: network.ssid, senha: '', bssid: network.bssid || '' };
                await window.conectarRedeWifiReal(redeAtual, network, button, { forceSwitch: true });
                return;
            }

            const redeEscolhida = await escolherRedeParaNetwork(network, candidatos);
            const rede = await corrigirBssidSeNecessario(redeEscolhida, network);
            if (rede) await window.adicionarRedeNoCelular(rede, network, button);
        });
        return button;
    }

    function senhaResumo(senha) {
        const value = String(senha || '');
        if (value.length <= 4) return 'senha curta';
        return `${value.slice(0, 2)}...${value.slice(-2)}`;
    }

    function escolherRedeEmPopup(titulo, descricao, redes) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'wifi-choice-overlay';

            const modal = document.createElement('div');
            modal.className = 'wifi-choice-modal';

            const h3 = document.createElement('h3');
            h3.textContent = titulo;

            const p = document.createElement('p');
            p.textContent = descricao;

            const list = document.createElement('div');
            list.className = 'wifi-choice-list';

            const close = (rede) => {
                overlay.remove();
                resolve(rede || null);
            };

            redes.forEach((rede, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'wifi-choice-option';

                const title = document.createElement('strong');
                title.textContent = `${rede.ssid} ${index + 1}`;

                const meta = document.createElement('span');
                const bssid = getRedeBssid(rede);
                meta.textContent = `${senhaResumo(rede.senha)}${bssid ? ' - ' + bssid : ' - sem BSSID'}`;

                button.appendChild(title);
                button.appendChild(meta);
                button.addEventListener('click', () => close(rede));
                list.appendChild(button);
            });

            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'wifi-choice-cancel';
            cancel.textContent = 'Cancelar';
            cancel.addEventListener('click', () => close(null));

            modal.appendChild(h3);
            modal.appendChild(p);
            modal.appendChild(list);
            modal.appendChild(cancel);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
        });
    }

    function temBssidDiferenteDoAtual(network, candidatos = redesSalvasCompativeis(network)) {
        const bssidAtual = normalizarBssid(network && network.bssid);
        if (!bssidAtual || temMatchExatoBssid(network, candidatos)) return false;
        return candidatos.some(rede => {
            const salvo = getRedeBssid(rede);
            return salvo && salvo !== bssidAtual;
        });
    }

    function abrirPopupCorrecaoBssid(rede, bssidAtual) {
        return new Promise((resolve) => {
            const bssidSalvo = getRedeBssid(rede);
            if (!rede || !bssidAtual || !bssidSalvo || bssidSalvo === bssidAtual) {
                resolve('use');
                return;
            }

            const overlay = document.createElement('div');
            overlay.className = 'wifi-choice-overlay';

            const modal = document.createElement('div');
            modal.className = 'wifi-choice-modal';

            const title = document.createElement('h3');
            title.textContent = 'BSSID errado?';

            const desc = document.createElement('p');
            desc.textContent = `Esta rede esta salva com ${bssidSalvo}, mas o roteador encontrado usa ${bssidAtual}.`;

            const list = document.createElement('div');
            list.className = 'wifi-choice-list';
            let autoCloseTimer = null;

            const close = (acao) => {
                if (autoCloseTimer) {
                    clearTimeout(autoCloseTimer);
                    autoCloseTimer = null;
                }
                overlay.remove();
                resolve(acao || 'cancel');
            };

            const criarOpcao = (label, detail, action) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'wifi-choice-option';
                const strong = document.createElement('strong');
                strong.textContent = label;
                const span = document.createElement('span');
                span.textContent = detail;
                button.appendChild(strong);
                button.appendChild(span);
                button.addEventListener('click', () => close(action));
                list.appendChild(button);
            };

            criarOpcao('Corrigir BSSID', `Trocar para ${bssidAtual}.`, 'fix');
            criarOpcao('Remover BSSID', 'Deixar esta senha sem roteador fixo.', 'remove');
            criarOpcao('Usar mesmo assim', 'Tentar adicionar sem alterar o cadastro.', 'use');

            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'wifi-choice-cancel';
            cancel.textContent = 'Cancelar';
            cancel.addEventListener('click', () => close('cancel'));

            const progress = document.createElement('div');
            progress.className = 'wifi-choice-progress';
            const progressBar = document.createElement('span');
            progress.appendChild(progressBar);

            modal.appendChild(title);
            modal.appendChild(desc);
            modal.appendChild(list);
            modal.appendChild(cancel);
            modal.appendChild(progress);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            autoCloseTimer = setTimeout(() => close('cancel'), 10000);
        });
    }

    async function corrigirBssidSeNecessario(rede, network) {
        const bssidAtual = normalizarBssid(network && network.bssid);
        const bssidSalvo = getRedeBssid(rede);
        if (!rede || !bssidAtual || !bssidSalvo || bssidSalvo === bssidAtual) return rede;

        const acao = await abrirPopupCorrecaoBssid(rede, bssidAtual);
        if (acao === 'cancel') return null;
        if (acao === 'fix') {
            await salvarPatchRede(rede, { bssid: bssidAtual });
            return { ...rede, bssid: bssidAtual };
        }
        if (acao === 'remove') {
            await salvarPatchRede(rede, { bssid: null });
            return { ...rede, bssid: null, __wifiIgnoreBssid: true };
        }
        return rede;
    }

    async function escolherRedeParaNetwork(network, candidatos = redesSalvasCompativeis(network)) {
        if (!candidatos.length) return null;
        if (!deveEscolherRede(network, candidatos)) return candidatos[0];

        return escolherRedeEmPopup(
            `Escolha ${network.ssid}`,
            'Existem redes salvas com o mesmo nome. Selecione qual senha deseja usar.',
            candidatos
        );
    }

    function criarLinha(network) {
        const candidatos = redesSalvasCompativeis(network);
        const rede = candidatos[0] || null;
        const row = document.createElement('div');
        row.className = rede ? 'wifi-row wifi-row-saved' : 'wifi-row';

        const info = document.createElement('div');
        info.className = 'wifi-row-info';

        const top = document.createElement('div');
        top.className = 'wifi-row-top';

        const ssid = document.createElement('strong');
        ssid.textContent = network.ssid;

        const badge = document.createElement('span');
        badge.className = rede ? 'wifi-badge wifi-badge-saved' : 'wifi-badge';
        badge.textContent = rede ? (candidatos.length > 1 ? 'Opcoes' : 'Salva') : 'Nao salva';

        top.appendChild(ssid);
        top.appendChild(badge);

        const meta = document.createElement('div');
        meta.className = 'wifi-row-meta';
        const bssid = normalizarBssid(network.bssid);
        meta.textContent = `${formatarSeguranca(network.capabilities)} - ${formatarSinal(network.level)} - ${formatarDbm(network.level)}${bssid ? ' - ' + bssid : ''}`;

        info.appendChild(top);
        info.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'wifi-row-actions';
        actions.appendChild(rede ? criarBotaoConectar(network, candidatos) : criarBotaoCadastrar(network));

        row.appendChild(info);
        row.appendChild(actions);
        return row;
    }

    function criarSecaoWifi(titulo, networks, className) {
        const section = document.createElement('div');
        section.className = `wifi-section ${className || ''}`.trim();

        const header = document.createElement('div');
        header.className = 'wifi-section-header';

        const title = document.createElement('span');
        title.textContent = titulo;

        const count = document.createElement('strong');
        count.textContent = String(networks.length);

        header.appendChild(title);
        header.appendChild(count);
        section.appendChild(header);

        networks.forEach(network => section.appendChild(criarLinha(network)));
        return section;
    }

    function renderizarConexaoAtual(connection) {
        const card = document.getElementById('wifiCurrentCard');
        const ssidEl = document.getElementById('wifiCurrentSsid');
        const statusEl = document.getElementById('wifiCurrentStatus');
        const action = document.getElementById('btnWifiCurrentSave');
        const routerAction = document.getElementById('btnRouterAdmin');

        if (!card || !ssidEl || !statusEl || !action) return;

        card.className = 'wifi-current';
        action.style.display = 'none';
        action.onclick = null;
        if (routerAction) {
            routerAction.style.display = 'none';
            routerAction.onclick = null;
        }

        if (!isNativeWifiAvailable()) {
            card.classList.add('wifi-current-muted');
            ssidEl.textContent = 'Disponivel apenas no APK';
            statusEl.textContent = 'A rede atual so pode ser lida no Android.';
            esconderPromptRedeAtual();
            return;
        }

        if (!connection || !connection.connected || !connection.ssid) {
            card.classList.add('wifi-current-muted');
            ssidEl.textContent = 'Sem Wi-Fi conectado';
            statusEl.textContent = 'Ao abrir o app assim, ele procura redes proximas com senha salva.';
            esconderPromptRedeAtual();
            return;
        }

        const candidatos = redesSalvasCompativeis(connection);
        const rede = candidatos[0] || null;
        const semLocalizacao = rede ? redesSemLocalizacaoCompativeis(connection) : [];
        ssidEl.textContent = connection.ssid;
        if (routerAction) {
            routerAction.textContent = 'Gerenciar roteador';
            routerAction.style.display = 'flex';
            routerAction.onclick = () => window.abrirGerenciadorRoteador();
        }

        if (rede) {
            card.classList.add('wifi-current-saved');
            const bssid = normalizarBssid(connection.bssid);
            statusEl.textContent = semLocalizacao.length
                ? `${formatarDbm(connection.level)}${bssid ? ' - ' + bssid : ''} - salva sem localizacao.`
                : getRedeBssid(rede)
                ? `${formatarDbm(connection.level)}${bssid ? ' - ' + bssid : ''} - salva com BSSID no banco.`
                : `${formatarDbm(connection.level)}${bssid ? ' - ' + bssid : ''} - salva sem BSSID no banco.`;
            if (semLocalizacao.length) {
                action.textContent = 'Adicionar local';
                action.style.display = 'flex';
                action.onclick = async () => {
                    const escolhida = await escolherRedeParaLocalizacao(connection, semLocalizacao);
                    if (escolhida) await adicionarLocalizacaoRedeAtual(escolhida, connection, action);
                };
            }
            if (bssid && !getRedeBssid(rede)) {
                oferecerAssociacaoBssid(connection, candidatos);
            }
        } else {
            card.classList.add('wifi-current-missing');
            const bssid = normalizarBssid(connection.bssid);
            statusEl.textContent = `${formatarDbm(connection.level)}${bssid ? ' - ' + bssid : ''} - ainda nao salva no banco.`;
            action.textContent = 'Salvar atual';
            action.style.display = 'flex';
            action.onclick = () => abrirCadastroSsid(connection.ssid, connection.bssid, connection, { conectarAposSalvar: false });
        }

        atualizarPromptRedeAtual(connection);
        if (typeof window.atualizarDashboardLayout === 'function') {
            window.atualizarDashboardLayout();
        }
    }

    async function salvarPatchRede(rede, patch) {
        if (!rede || !rede.id) return;

        const id = rede.id;
        const index = (window.redesEmMemoria || []).findIndex(item => item.id === id);
        if (index !== -1) {
            window.redesEmMemoria[index] = { ...window.redesEmMemoria[index], ...patch };
        }

        if (navigator.onLine && typeof window.firebaseAtualizarObjeto === 'function' && !String(id).startsWith('local_')) {
            window.firebaseAtualizarObjeto(id, patch);
        } else if (!String(id).startsWith('local_')) {
            const filaUpdate = JSON.parse(localStorage.getItem('wifi_pro_updates_v1') || '{}');
            if (!filaUpdate[id]) filaUpdate[id] = {};
            Object.assign(filaUpdate[id], patch);
            localStorage.setItem('wifi_pro_updates_v1', JSON.stringify(filaUpdate));
        }

        if (typeof window.atualizarBackupLocal === 'function') {
            await window.atualizarBackupLocal(window.redesEmMemoria);
        }
        if (typeof window.registrarOperacaoBanco === 'function') {
            const redeAtualizada = (window.redesEmMemoria || []).find(item => item.id === id) || rede;
            const atualizouLocalizacao = patch.lat !== undefined || patch.lng !== undefined;
            const tipo = patch.bssid !== undefined
                ? 'bssid_associado'
                : (atualizouLocalizacao ? 'localizacao_atualizada' : 'rede_atualizada');
            const mensagem = patch.bssid !== undefined
                ? `BSSID associado: ${redeAtualizada.ssid}`
                : (atualizouLocalizacao ? `Localizacao atualizada: ${redeAtualizada.ssid}` : `Rede atualizada: ${redeAtualizada.ssid}`);
            window.registrarOperacaoBanco(tipo, mensagem, redeAtualizada, {
                campos: Object.keys(patch || {}),
                patch
            });
        }
        if (!window.mostrandoApenasProximas && typeof window.renderizarInterface === 'function') {
            window.renderizarInterface(window.redesEmMemoria);
        }
        if (window.nativeWifiUltimoScan.length) {
            window.renderizarWifiReal(window.nativeWifiUltimoScan);
        }
    }

    async function associarBssidRedeSalva(rede, bssid) {
        const limpo = normalizarBssid(bssid);
        if (!rede || !limpo) return;
        await salvarPatchRede(rede, { bssid: limpo });
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast('BSSID associado a rede salva.');
        }
    }

    async function oferecerAssociacaoBssid(connection, candidatos = redesSalvasCompativeis(connection)) {
        const bssid = normalizarBssid(connection && connection.bssid);
        const ssid = connection && connection.ssid;
        if (!ssid || !bssid) return;

        const semBssid = candidatos.filter(rede => !getRedeBssid(rede));
        if (!semBssid.length) return;

        const promptKey = `${ssid}|${bssid}`;
        if (window.wifiBssidPromptKey === promptKey) return;
        window.wifiBssidPromptKey = promptKey;

        let rede = semBssid[0];
        if (semBssid.length > 1) {
            rede = await escolherRedeEmPopup(
                `Associar ${ssid}`,
                `Escolha qual cadastro deve receber o BSSID ${bssid}.`,
                semBssid
            );
            if (!rede) return;
        }

        const ok = confirm(`A rede "${ssid}" esta salva sem BSSID.\n\nDeseja associar este roteador (${bssid}) a ela?`);
        if (ok) {
            await associarBssidRedeSalva(rede, bssid);
        }
    }

    async function agendarAssociacaoBssidAposConexao(rede, network) {
        if (!rede || getRedeBssid(rede)) return;
        const esperado = normalizarBssid(network && network.bssid);
        const tentativas = [2500, 6500, 11000];

        tentativas.forEach(delay => {
            setTimeout(async () => {
                const connection = await window.verificarWifiAtual({ silent: true });
                if (!connection || !connection.connected || !mesmoSsid(connection.ssid, rede.ssid)) return;
                const atual = normalizarBssid(connection.bssid);
                if (!atual) return;
                if (esperado && atual !== esperado) return;
                await oferecerAssociacaoBssid(connection, [rede]);
            }, delay);
        });
    }

    function agendarAvisoBssidErradoAposTentativa(rede, network) {
        if (rede && rede.__wifiIgnoreBssid) return;
        const esperado = normalizarBssid(network && network.bssid) || getRedeBssid(rede);
        if (!rede || !esperado) return;

        [8000, 14000].forEach(delay => {
            setTimeout(async () => {
                const connection = await window.verificarWifiAtual({ silent: true });
                if (!connection || !connection.connected || !mesmoSsid(connection.ssid, rede.ssid)) return;
                const atual = normalizarBssid(connection.bssid);
                if (!atual || atual === esperado) return;

                const promptKey = `${rede.id || rede.ssid}|${esperado}|${atual}`;
                if (window.wifiBssidMismatchPromptKey === promptKey) return;
                window.wifiBssidMismatchPromptKey = promptKey;

                const corrigida = await corrigirBssidSeNecessario(rede, { ...network, bssid: atual });
                if (corrigida && typeof window.mostrarToast === 'function') {
                    window.mostrarToast('BSSID verificado.');
                }
            }, delay);
        });
    }

    window.abrirGerenciadorRoteador = async function(desktop = false) {
        if (typeof window.fecharMenuLateral === 'function') window.fecharMenuLateral();
        const plugin = getWifiPlugin();
        if (!plugin || !isNativeWifiAvailable()) {
            window.mostrarToast('Gerenciador disponivel apenas no APK Android.');
            return;
        }

        try {
            const gateway = await plugin.getRouterGateway();
            if (!gateway || !gateway.available || !gateway.url) {
                window.mostrarToast('Gateway do roteador nao encontrado.');
                return;
            }

            await plugin.openRouterAdmin({ url: gateway.url, desktop });
        } catch (error) {
            const msg = error && error.message ? error.message : 'Falha ao abrir o roteador.';
            window.mostrarToast(msg);
        }
    };

    function abrirModalComRedesSalvasProximas(redesSalvas) {
        window.abrirModalWifiReal({
            networks: redesSalvas,
            summary: `Voce tem senha salva para ${redesSalvas.length} rede(s) proxima(s).`
        });
    }

    function redesSalvasDoScan(networks) {
        return networks.filter(network => findRedeSalva(network));
    }

    function melhorRedeSalvaDoScan(networks) {
        const salvas = redesSalvasDoScan(networks);
        return ordenarRedesWifi(salvas)[0] || null;
    }

    async function sugerirConexaoAutomatica(networks) {
        if (!Array.isArray(networks) || !networks.length) return;
        if (window.wifiAtualConexao && window.wifiAtualConexao.connected) return;

        const melhor = melhorRedeSalvaDoScan(networks);
        if (!melhor) return;

        const key = `${melhor.ssid}|${normalizarBssid(melhor.bssid) || 'ssid'}`;
        if (window.wifiSugestaoAutomaticaKey === key) return;
        window.wifiSugestaoAutomaticaKey = key;

        const candidatos = redesSalvasCompativeis(melhor);
        if (!candidatos.length) return;

        const sinal = formatarSinal(melhor.level).toLowerCase();
        const ok = confirm(`Rede salva proxima encontrada:\n\n${melhor.ssid} (${sinal})\n\nDeseja adicionar ao celular agora?`);
        if (!ok) return;

        const redeEscolhida = await escolherRedeParaNetwork(melhor, candidatos);
        const rede = await corrigirBssidSeNecessario(redeEscolhida, melhor);
        if (rede) {
            await window.adicionarRedeNoCelular(rede, melhor, null);
        }
    }

    function aplicarResultadoScan(result, options = {}) {
        const networks = Array.isArray(result && result.networks) ? result.networks : [];
        window.nativeWifiUltimoScan = networks;
        window.wifiPreScanUltimasRedes = networks;

        const updatedAt = formatarHorarioAtualizacao();
        window.renderizarWifiReal(networks, { updatedAt });

        if (result && result.fresh === false && networks.length) {
            const salvas = networks.filter(network => findRedeSalva(network)).length;
            const fonte = result.source === 'throttled' ? 'Android limitou o scan, usando resultado recente' : 'resultado recente do Android';
            setResumo(`${networks.length} redes encontradas - ${salvas} salvas no banco - ${fonte}`);
        }

        if (options.manual && !networks.length) {
            mostrarMensagem('Nenhuma rede encontrada.');
        }
    }

    window.renderizarWifiReal = function(networks, options = {}) {
        const out = document.getElementById('wifiNativeOutput');
        if (!out) return;
        out.innerHTML = '';
        if (typeof window.atualizarDashboardLayout === 'function') {
            window.atualizarDashboardLayout();
        }

        if (!networks.length) {
            mostrarMensagem(options.emptyMessage || 'Nenhuma rede encontrada.');
            if (options.summary) setResumo(options.summary);
            return;
        }

        const redesOrdenadas = ordenarRedesWifi(networks);
        const redesSalvas = redesOrdenadas.filter(network => findRedeSalva(network));
        const outrasRedes = redesOrdenadas.filter(network => !findRedeSalva(network));
        const salvas = redesSalvas.length;
        const atualizado = options.updatedAt ? ` - atualizado ${options.updatedAt}` : '';
        setResumo(options.summary || `${redesOrdenadas.length} redes encontradas - ${salvas} salvas no banco${atualizado}`);

        if (redesSalvas.length) {
            out.appendChild(criarSecaoWifi('Salvas no banco', redesSalvas, 'wifi-section-saved'));
        }
        if (outrasRedes.length) {
            out.appendChild(criarSecaoWifi('Outras redes', outrasRedes, 'wifi-section-other'));
        }
    };

    window.verificarWifiAtual = async function(options = {}) {
        const plugin = getWifiPlugin();

        if (!isNativeWifiAvailable()) {
            renderizarConexaoAtual(null);
            return null;
        }

        if (!options.silent) {
            const ssidEl = document.getElementById('wifiCurrentSsid');
            const statusEl = document.getElementById('wifiCurrentStatus');
            if (ssidEl) ssidEl.textContent = 'Verificando...';
            if (statusEl) statusEl.textContent = 'Lendo a rede conectada no Android.';
        }

        try {
            const connection = normalizarConexaoAtual(await plugin.getCurrentConnection());
            window.wifiAtualConexao = connection;
            renderizarConexaoAtual(connection);
            return connection;
        } catch (error) {
            window.wifiAtualConexao = null;
            renderizarConexaoAtual(null);
            if (!options.silent && typeof window.mostrarToast === 'function') {
                window.mostrarToast(error && error.message ? error.message : 'Nao foi possivel ler a rede atual.');
            }
            return null;
        }
    };

    async function executarScanWifiReal(options = {}) {
        const button = document.getElementById('btnScanWifiNative');
        const plugin = getWifiPlugin();
        const manual = options.manual === true;
        const silent = options.silent === true;
        const clear = options.clear === true;

        if (window.wifiScanEmAndamento) return;

        if (!isNativeWifiAvailable()) {
            setResumo('Disponivel apenas no APK Android.');
            mostrarMensagem('Instale o APK no celular para escanear redes reais.');
            renderizarConexaoAtual(null);
            return;
        }

        window.wifiScanEmAndamento = true;

        if (button && manual) {
            button.disabled = true;
            button.textContent = 'Atualizando...';
        }

        if (!silent) setResumo('Atualizando redes Wi-Fi...');
        if (clear) limparResultado();

        try {
            await window.verificarWifiAtual({ silent: true });
            const result = await plugin.scanNetworks();
            aplicarResultadoScan(result, { manual });
        } catch (error) {
            const msg = error && error.message ? error.message : 'Falha ao escanear Wi-Fi.';
            if (!silent) {
                setResumo(msg);
                if (!window.nativeWifiUltimoScan.length) mostrarMensagem(msg);
                if (typeof window.mostrarToast === 'function') window.mostrarToast(msg);
            }
        } finally {
            window.wifiScanEmAndamento = false;
            if (button && manual) {
                button.disabled = false;
                button.textContent = 'Atualizar agora';
            }
        }
    }

    async function iniciarAtualizacaoWifiTempoReal() {
        await pararAtualizacaoWifiTempoReal();

        const plugin = getWifiPlugin();
        if (!isNativeWifiAvailable()) return;

        window.wifiRealtimeAtivo = true;
        setResumo('Monitorando redes Wi-Fi em tempo real...');

        try {
            window.wifiRealtimeListener = await plugin.addListener('wifiScanUpdate', async (result) => {
                if (!window.wifiRealtimeAtivo) return;
                await window.verificarWifiAtual({ silent: true });
                aplicarResultadoScan(result);
            });

            window.wifiRealtimeErrorListener = await plugin.addListener('wifiScanError', (error) => {
                if (!window.wifiRealtimeAtivo) return;
                const message = error && error.message ? error.message : 'Falha no monitor Wi-Fi.';
                setResumo(message);
            });

            await plugin.startRealtimeScan();
        } catch (error) {
            window.wifiRealtimeAtivo = false;
            setResumo(error && error.message ? error.message : 'Falha ao iniciar monitor Wi-Fi.');
            executarScanWifiReal({ silent: true });
        }
    }

    async function pararAtualizacaoWifiTempoReal() {
        window.wifiRealtimeAtivo = false;

        const listener = window.wifiRealtimeListener;
        const errorListener = window.wifiRealtimeErrorListener;
        window.wifiRealtimeListener = null;
        window.wifiRealtimeErrorListener = null;

        if (listener && typeof listener.remove === 'function') {
            await listener.remove();
        }
        if (errorListener && typeof errorListener.remove === 'function') {
            await errorListener.remove();
        }

        const plugin = getWifiPlugin();
        if (plugin && typeof plugin.stopRealtimeScan === 'function') {
            plugin.stopRealtimeScan().catch(() => {});
        }
    }

    window.escanearWifiReal = async function() {
        await executarScanWifiReal({ manual: true });
    };

    async function abrirWifiDepoisDeAdicionar(plugin, rede, result) {
        if (!plugin || typeof plugin.openWifiSettings !== 'function') return;

        const operacaoCancelada = result && result.method === 'ACTION_WIFI_ADD_NETWORKS' && result.saved === false;
        if (operacaoCancelada) return;

        try {
            await plugin.openWifiSettings({ ssid: rede && rede.ssid ? rede.ssid : '' });
        } catch (error) {
            console.warn('Rede adicionada, mas nao foi possivel abrir o Wi-Fi do Android.', error);
            if (typeof window.mostrarToast === 'function') {
                window.mostrarToast('Rede adicionada. Abra o Wi-Fi do Android para trocar.');
            }
        }
    }

    window.adicionarRedeNoCelular = async function(rede, network, button) {
        const plugin = getWifiPlugin();
        if (!plugin || typeof plugin.saveNetwork !== 'function') {
            window.mostrarToast('Funcao de salvar no Android indisponivel nesta versao do APK.');
            return;
        }

        if (!rede || !rede.ssid) {
            window.mostrarToast('Rede invalida para adicionar ao celular.');
            return;
        }

        const originalText = button ? button.textContent : '';
        if (button) {
            button.disabled = true;
            button.textContent = 'Adicionando...';
        }

        try {
            const bssid = rede && rede.__wifiIgnoreBssid ? '' : (normalizarBssid(network && network.bssid) || getRedeBssid(rede));
            const result = await plugin.saveNetwork({
                ssid: rede.ssid,
                password: rede.senha || '',
                capabilities: (network && network.capabilities) || (rede.senha ? '[WPA2-PSK]' : ''),
                bssid
            });

            if (result && result.method === 'ACTION_WIFI_ADD_NETWORKS') {
                window.mostrarToast(result.saved ? 'Rede adicionada no Android.' : 'Operacao cancelada no Android.');
            } else if (result && result.suggested) {
                window.mostrarToast('Rede salva como sugestao no Android.');
            } else if (result && result.saved) {
                window.mostrarToast('Rede adicionada ao celular.');
            } else {
                window.mostrarToast('Solicitacao enviada ao Android.');
            }

            if (button) button.textContent = 'Abrindo Wi-Fi...';
            await abrirWifiDepoisDeAdicionar(plugin, rede, result);
            agendarAvisoBssidErradoAposTentativa(rede, network);
        } catch (error) {
            const msg = error && error.message ? error.message : 'Falha ao adicionar rede no celular.';
            window.mostrarToast(msg);
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = originalText || 'Adicionar ao celular';
            }
        }
    };

    window.isRedeWifiAtual = function(networkOrRede) {
        return correspondeConexaoAtual(networkOrRede);
    };

    window.obterRotuloAcaoRedeSalvaAndroid = function(networkOrRede, candidatos = null) {
        const lista = Array.isArray(candidatos) ? candidatos : redesSalvasCompativeis(networkOrRede);
        return rotuloAcaoRedeSalva(networkOrRede, lista);
    };

    window.acionarRedeSalvaNoAndroid = async function(rede, network, button) {
        const alvo = network || {
            ssid: rede && rede.ssid,
            bssid: rede && rede.bssid,
            capabilities: rede && rede.senha ? '[WPA2-PSK]' : ''
        };

        if (correspondeConexaoAtual(alvo)) {
            return window.conectarRedeWifiReal(rede, alvo, button, { forceSwitch: true });
        }

        return window.adicionarRedeNoCelular(rede, alvo, button);
    };

    window.conectarRedeWifiReal = async function(rede, network, button, options = {}) {
        const plugin = getWifiPlugin();
        if (!plugin) {
            window.mostrarToast('Plugin nativo indisponivel.');
            return;
        }

        const originalText = button ? button.textContent : '';
        if (button) {
            button.disabled = true;
            button.textContent = 'Abrindo...';
        }

        try {
            const bssid = rede && rede.__wifiIgnoreBssid ? '' : (normalizarBssid(network && network.bssid) || getRedeBssid(rede));
            const payload = {
                ssid: rede.ssid,
                password: rede.senha,
                capabilities: (network && network.capabilities) || '',
                bssid
            };
            const deveTrocarAgora = options.forceSwitch !== false && typeof plugin.switchNetwork === 'function';
            let result;

            if (deveTrocarAgora) {
                try {
                    result = await plugin.switchNetwork(payload);
                } catch (switchError) {
                    console.warn('Nao foi possivel abrir a troca pelo Android.', switchError);
                    throw switchError;
                }
            } else {
                result = await plugin.connectNetwork(payload);
            }

            if (options.switchAfterSave && typeof plugin.switchNetwork === 'function') {
                try {
                    result = await plugin.switchNetwork(payload);
                } catch (switchError) {
                    console.warn('Rede salva, mas a troca direta nao foi concluida.', switchError);
                }
            }

            if (result && (result.method === 'ACTION_WIFI_PANEL' || result.method === 'ACTION_WIFI_SETTINGS')) {
                window.mostrarToast('Selecione a rede salva na tela Wi-Fi do Android.');
            } else if (result && result.method === 'WifiNetworkSuggestionSwitch') {
                window.mostrarToast('Troca normal solicitada ao Android.');
            } else if (result && result.method === 'ACTION_WIFI_ADD_NETWORKS') {
                window.mostrarToast(result.saved ? 'Rede aprovada no Android.' : 'Operacao cancelada no Android.');
            } else if (result && result.suggested) {
                window.mostrarToast('Rede sugerida ao Android para conexao.');
            } else if (result && result.connected) {
                window.mostrarToast('Rede salva/conectada.');
            } else {
                window.mostrarToast('Solicitacao enviada ao Android.');
            }

            agendarAssociacaoBssidAposConexao(rede, network);
            agendarAvisoBssidErradoAposTentativa(rede, network);
        } catch (error) {
            const msg = error && error.message ? error.message : 'Falha ao conectar.';
            window.mostrarToast(msg);
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = originalText || 'Abrir Wi-Fi';
            }
        }
    };

    window.iniciarPreScanWifiSeDesconectado = async function() {
        if (window.wifiPreScanExecutado || !isNativeWifiAvailable()) return;
        window.wifiPreScanExecutado = true;

        const plugin = getWifiPlugin();
        const connection = await window.verificarWifiAtual({ silent: true });
        if (connection && connection.connected) return;

        try {
            const result = await plugin.scanNetworks();
            const networks = Array.isArray(result.networks) ? result.networks : [];
            window.nativeWifiUltimoScan = networks;
            window.wifiPreScanUltimasRedes = networks;

            const salvas = redesSalvasDoScan(networks);
            if (salvas.length) {
                abrirModalComRedesSalvasProximas(salvas);
                await sugerirConexaoAutomatica(networks);
            }
        } catch (error) {
            console.warn('Pre-scan Wi-Fi ignorado:', error);
        }
    };

    window.atualizarPreScanWifiComBanco = function() {
        if (typeof window.atualizarEstadoWifiComBanco === 'function') {
            window.atualizarEstadoWifiComBanco();
        }

        if (!window.wifiPreScanUltimasRedes.length) return;
        if (window.wifiAtualConexao && window.wifiAtualConexao.connected) return;

        const salvas = redesSalvasDoScan(window.wifiPreScanUltimasRedes);
        if (salvas.length) {
            abrirModalComRedesSalvasProximas(salvas);
            sugerirConexaoAutomatica(window.wifiPreScanUltimasRedes).catch(() => {});
        }
    };

    window.atualizarEstadoWifiComBanco = function() {
        if (window.wifiAtualConexao) {
            renderizarConexaoAtual(window.wifiAtualConexao);
        }
        if (window.nativeWifiUltimoScan.length) {
            window.renderizarWifiReal(window.nativeWifiUltimoScan);
        }
    };

    window.abrirModalWifiReal = function(options = {}) {
        if (typeof window.fecharMenuLateral === 'function') window.fecharMenuLateral();
        const modal = document.getElementById('modalWifiReal');
        if (!modal) return;

        modal.style.display = 'flex';
        setResumo('Pronto para escanear.');
        window.verificarWifiAtual();

        if (options.networks) {
            window.renderizarWifiReal(options.networks, { summary: options.summary });
            iniciarAtualizacaoWifiTempoReal();
            return;
        }

        if (window.nativeWifiUltimoScan.length) {
            window.renderizarWifiReal(window.nativeWifiUltimoScan);
        }
        iniciarAtualizacaoWifiTempoReal();
    };

    window.fecharModalWifiReal = function() {
        pararAtualizacaoWifiTempoReal().catch(() => {});
        const modal = document.getElementById('modalWifiReal');
        if (modal) modal.style.display = 'none';
    };

    window.addEventListener('DOMContentLoaded', () => {
        renderizarConexaoAtual(null);
        setTimeout(() => window.verificarWifiAtual({ silent: true }), 800);
        setTimeout(() => window.iniciarPreScanWifiSeDesconectado(), 2500);
    });
})();
