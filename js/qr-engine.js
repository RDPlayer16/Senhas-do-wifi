window.processarTextoQR = function(text, target, origem = 'manual') {
    if (text.toUpperCase().startsWith("WIFI:")) {
        let s = "", p = ""; const pts = text.substring(5).split(";");
        for (let pt of pts) { 
            if (pt.toUpperCase().startsWith("S:")) s = pt.substring(2); 
            else if (pt.toUpperCase().startsWith("P:")) p = pt.substring(2); 
        }
        if (s) { 
            if (target === 'editar') {
                document.getElementById('editSSID').value = s; 
                document.getElementById('editSenha').value = p; 
                window.mostrarToast("Novos dados importados do QR!");
            } else {
                document.getElementById('novoSSID').value = s; 
                document.getElementById('novaSenha').value = p; 
                const conectarAposSalvar = origem === 'camera';
                window.novaRedeBssidSugerida = null;
                window.novaRedeWifiSugerida = conectarAposSalvar ? {
                    ssid: s,
                    bssid: '',
                    capabilities: p ? '[WPA2-PSK]' : '',
                    level: null,
                    conectarAposSalvar: true
                } : null;
                window.novaRedeConectarAposCadastro = conectarAposSalvar;
                window.checarDuplicadoModal(); 
                if (typeof window.validarSenhaNovaModal === 'function') window.validarSenhaNovaModal();
                window.mostrarToast("QR Code importado!");
            }
        }
    } else {
        window.mostrarToast("QR Code lido, mas não é um formato Wi-Fi válido.");
    }
};

function getQrNativePlugin() {
    if (!window.Capacitor) return null;
    if (window.Capacitor.Plugins && window.Capacitor.Plugins.WifiNative) {
        return window.Capacitor.Plugins.WifiNative;
    }
    if (typeof window.Capacitor.registerPlugin === 'function') {
        return window.WifiNativePluginProxy || (window.WifiNativePluginProxy = window.Capacitor.registerPlugin('WifiNative'));
    }
    return null;
}

function isQrNativeCameraAvailable() {
    return !!(getQrNativePlugin() && window.Capacitor && window.Capacitor.isNativePlatform());
}

async function garantirPermissaoCameraNativa() {
    if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) {
        return true;
    }

    const plugin = getQrNativePlugin();
    if (!plugin || typeof plugin.requestCameraPermission !== 'function') {
        return true;
    }

    try {
        const result = await plugin.requestCameraPermission();
        return !!(result && result.granted);
    } catch (error) {
        console.warn("Permissao de camera nao concedida:", error);
        return false;
    }
}

function aguardar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function descreverErroCamera(error) {
    const texto = String((error && (error.message || error.name)) || error || "");
    if (/notallowed|permission|denied/i.test(texto)) {
        return "A camera esta permitida no Android, mas o WebView recusou o video. Feche outros apps de camera e tente novamente.";
    }
    if (/notfound|not found|no camera|devicesnotfound/i.test(texto)) {
        return "Nenhuma camera foi encontrada pelo scanner.";
    }
    if (/notreadable|trackstart|could not start|in use|source/i.test(texto)) {
        return "A camera parece estar em uso por outro aplicativo. Feche outros apps de camera e tente de novo.";
    }
    if (/overconstrained|constraint|facingmode/i.test(texto)) {
        return "A camera do aparelho nao aceitou a configuracao solicitada. Tente novamente.";
    }
    return texto ? `Erro da camera: ${texto.substring(0, 120)}` : "Nao foi possivel iniciar a camera.";
}

async function obterCamerasQrDisponiveis() {
    if (typeof Html5Qrcode === 'undefined' || typeof Html5Qrcode.getCameras !== 'function') {
        return [];
    }

    try {
        const cameras = await Html5Qrcode.getCameras();
        return Array.isArray(cameras) ? cameras.filter(camera => camera && camera.id) : [];
    } catch (error) {
        console.warn("Nao foi possivel listar cameras:", error);
        return [];
    }
}

function montarTentativasCamera(cameras) {
    const tentativas = [];
    const ids = new Set();
    const cameraTraseira = cameras.find(camera => /back|rear|environment|traseir|posterior|0/i.test(camera.label || camera.id || ""));

    const adicionarCamera = (camera) => {
        if (!camera || !camera.id || ids.has(camera.id)) return;
        ids.add(camera.id);
        tentativas.push({ alvo: camera.id, nome: camera.label || "camera detectada" });
    };

    adicionarCamera(cameraTraseira);
    cameras.forEach(adicionarCamera);
    tentativas.push({ alvo: { facingMode: "environment" }, nome: "camera traseira" });
    tentativas.push({ alvo: { facingMode: { ideal: "environment" } }, nome: "camera traseira flexivel" });
    tentativas.push({ alvo: { facingMode: "user" }, nome: "camera frontal" });
    return tentativas;
}

function configScannerQr() {
    return {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        disableFlip: false,
        showTorchButtonIfSupported: true,
        showZoomSliderIfSupported: true
    };
}

async function limparTentativaScanner(scanner) {
    if (!scanner) return;
    try {
        if (typeof scanner.stop === 'function') {
            await scanner.stop();
        }
    } catch (error) {}
    try {
        if (typeof scanner.clear === 'function') {
            scanner.clear();
        }
    } catch (error) {}
}

async function iniciarScannerQrAoVivo(reader, onSuccess) {
    const cameras = await obterCamerasQrDisponiveis();
    const tentativas = montarTentativasCamera(cameras);
    const erros = [];

    for (const tentativa of tentativas) {
        reader.innerHTML = `<div style="padding: 18px; text-align: center; color: white;">Abrindo ${tentativa.nome}...</div>`;
        await aguardar(180);

        const scanner = new Html5Qrcode("reader");
        window.scannerInstancia = scanner;

        try {
            await scanner.start(tentativa.alvo, configScannerQr(), onSuccess, () => {});
            return scanner;
        } catch (error) {
            console.warn(`Falha ao iniciar ${tentativa.nome}:`, error);
            erros.push(error);
            await limparTentativaScanner(scanner);
            if (window.scannerInstancia === scanner) {
                window.scannerInstancia = null;
            }
            await aguardar(220);
        }
    }

    throw new Error(descreverErroCamera(erros[erros.length - 1]));
}

function base64ToFile(base64, fileName, mimeType) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], fileName, { type: mimeType || 'image/jpeg' });
}

async function escanearQrComCameraNativa(target) {
    const plugin = getQrNativePlugin();
    if (!plugin || typeof plugin.captureQrPhoto !== 'function') return false;
    if (typeof Html5Qrcode === 'undefined') {
        window.mostrarToast("Biblioteca QR nao carregada.");
        return true;
    }

    window.fecharModal();
    window.fecharModalEditar();
    document.getElementById('modalScanner').style.display = 'flex';
    document.getElementById('reader').innerHTML = '<div style="padding: 30px; text-align: center; color: white;">Abrindo camera nativa...</div>';

    const html5QrCode = new Html5Qrcode("reader");
    try {
        const photo = await plugin.captureQrPhoto();
        document.getElementById('reader').innerHTML = '<div style="padding: 30px; text-align: center; color: white;">Lendo QR da foto...</div>';
        const file = base64ToFile(photo.base64, photo.fileName || 'qr_native.jpg', photo.mimeType || 'image/jpeg');

        try {
            const sharpFile = await processarImagemParaQR(file);
            const msg = await html5QrCode.scanFile(sharpFile, true);
            window.processarTextoQR(msg, target, 'camera');
        } catch (err1) {
            const msg = await html5QrCode.scanFile(file, true);
            window.processarTextoQR(msg, target, 'camera');
        }
    } catch (error) {
        const msg = error && error.message ? error.message : "QR Code nao reconhecido pela camera nativa.";
        window.mostrarToast(msg);
    } finally {
        try {
            await html5QrCode.clear();
        } catch (e) {}
        window.fecharScanner(true);
    }

    return true;
}

window.abrirScannerCamera = function(target = 'novo') {
    window.scanTarget = target;
    if (isQrNativeCameraAvailable()) {
        escanearQrComCameraNativa(target);
        return;
    }
    if (typeof Html5QrcodeScanner === 'undefined') { alert("Conecte-se à internet para usar o scanner."); return; }
    window.fecharModal(); 
    window.fecharModalEditar();
    
    document.getElementById('modalScanner').style.display = 'flex';
    
    window.scannerInstancia = new Html5QrcodeScanner("reader", { 
        fps: 10, 
        qrbox: {width: 250, height: 250},
        supportedScanTypes: [0] 
    }, false);
    
    window.scannerInstancia.render((text) => {
        window.fecharScanner(true);
        window.processarTextoQR(text, window.scanTarget, 'camera');
    }, () => {});
};

// FILTRO DE NITIDEZ (SHARPEN) - Destrói os artefatos de compressão da MIUI
window.abrirScannerCamera = async function(target = 'novo') {
    window.scanTarget = target;
    if (typeof Html5Qrcode === 'undefined') { alert("Biblioteca QR nao carregada."); return; }

    const cameraLiberada = await garantirPermissaoCameraNativa();
    if (!cameraLiberada) {
        window.mostrarToast("Permissao da camera negada. Libere a camera nas permissoes do app.");
        return;
    }

    window.fecharModal();
    window.fecharModalEditar();

    const modal = document.getElementById('modalScanner');
    const reader = document.getElementById('reader');
    modal.style.display = 'flex';
    reader.innerHTML = '<div style="padding: 18px; text-align: center; color: white;">Abrindo scanner...</div>';

    let finalizado = false;

    try {
        await iniciarScannerQrAoVivo(
            reader,
            (text) => {
                if (finalizado) return;
                finalizado = true;
                window.fecharScanner(true);
                window.processarTextoQR(text, window.scanTarget, 'camera');
            }
        );
    } catch (error) {
        console.error("Falha ao iniciar scanner ao vivo:", error);
        window.mostrarToast(error && error.message ? error.message : "Nao foi possivel abrir o scanner.");
        window.fecharScanner(true);
    }
};

function sharpenCanvas(ctx, w, h, mix) {
    const weights = [0, -1, 0, -1, 5, -1, 0, -1, 0];
    const katet = Math.round(Math.sqrt(weights.length));
    const half = (katet * 0.5) | 0;
    const dstData = ctx.createImageData(w, h);
    const dstBuff = dstData.data;
    const srcBuff = ctx.getImageData(0, 0, w, h).data;

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const dstOff = (y * w + x) * 4;
            let r = 0, g = 0, b = 0;

            for (let cy = 0; cy < katet; cy++) {
                for (let cx = 0; cx < katet; cx++) {
                    const scy = y + cy - half;
                    const scx = x + cx - half;
                    const srcOff = (scy * w + scx) * 4;
                    const wt = weights[cy * katet + cx];

                    r += srcBuff[srcOff] * wt;
                    g += srcBuff[srcOff + 1] * wt;
                    b += srcBuff[srcOff + 2] * wt;
                }
            }

            dstBuff[dstOff] = r * mix + srcBuff[dstOff] * (1 - mix);
            dstBuff[dstOff + 1] = g * mix + srcBuff[dstOff + 1] * (1 - mix);
            dstBuff[dstOff + 2] = b * mix + srcBuff[dstOff + 2] * (1 - mix);
            dstBuff[dstOff + 3] = srcBuff[dstOff + 3];
        }
    }
    ctx.putImageData(dstData, 0, 0);
}

function processarImagemParaQR(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                } else {
                    if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                }

                canvas.width = Math.floor(width);
                canvas.height = Math.floor(height);
                
                ctx.fillStyle = "#FFFFFF";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                sharpenCanvas(ctx, canvas.width, canvas.height, 1.0); 

                try {
                    const dataUrl = canvas.toDataURL('image/png');
                    let arr = dataUrl.split(','), mime = arr[0].match(/:(.*?);/)[1], bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
                    while(n--) { u8arr[n] = bstr.charCodeAt(n); }
                    resolve(new File([u8arr], "qr_sharp.png", {type: mime}));
                } catch (e) {
                    reject(new Error("Falha na conversão final."));
                }
            };
            img.onerror = () => reject(new Error("Erro ao carregar imagem"));
            img.src = event.target.result;
        };
        reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
        reader.readAsDataURL(file);
    });
}

window.escanearImagemQR = async function(e, target = 'novo') {
    window.scanTarget = target;
    if (e.target.files.length == 0) return;
    const originalFile = e.target.files[0];
    
    if (typeof Html5Qrcode === 'undefined') { alert("Erro: Biblioteca QR não carregada."); return; }
    
    // Oculta os modais iniciais para focar no processamento
    window.fecharModal(); 
    window.fecharModalEditar();
    
    document.getElementById('modalScanner').style.display = 'flex';
    document.getElementById('reader').innerHTML = '<div style="padding: 30px; text-align: center; color: white;">Extraindo dados da imagem...</div>';
    
    window.mostrarToast("Analisando imagem...");

    const html5QrCode = new Html5Qrcode("reader");

    try {
        const sharpFile = await processarImagemParaQR(originalFile);
        const qrCodeMessage = await html5QrCode.scanFile(sharpFile, true);
        window.processarTextoQR(qrCodeMessage, window.scanTarget, 'galeria');
        
    } catch (err1) {
        console.warn("Falha no arquivo PNG afiado. Tentando bruto.", err1);
        try {
            const msg = await html5QrCode.scanFile(originalFile, true); 
            window.processarTextoQR(msg, window.scanTarget, 'galeria');
        } catch (err2) {
            console.error("Falha total:", err2);
            window.mostrarToast("QR Code não reconhecido na imagem.");
        }
    } finally {
        html5QrCode.clear();
        window.fecharScanner(true);
        e.target.value = ''; // Reseta o input de arquivo
    }
};

window.fecharScanner = function(voltarParaModalAnterior = false) {
    const scanner = window.scannerInstancia;
    window.scannerInstancia = null;
    if (scanner) {
        try {
            if (typeof scanner.stop === 'function') {
                scanner.stop().then(() => {
                    if (typeof scanner.clear === 'function') scanner.clear();
                }).catch(() => {
                    if (typeof scanner.clear === 'function') scanner.clear();
                });
            } else if (typeof scanner.clear === 'function') {
                scanner.clear();
            }
        } catch (e) {}
    }
    document.getElementById('modalScanner').style.display = 'none'; 
    document.getElementById('reader').innerHTML = ''; 
    
    if (voltarParaModalAnterior) {
        if (window.scanTarget === 'editar' && window.redeEditandoAtual) {
            document.getElementById('modalEditarRede').style.display = 'flex';
        } else if (window.scanTarget === 'novo') {
            document.getElementById('modalNovaRede').style.display = 'flex';
        }
    }
};
