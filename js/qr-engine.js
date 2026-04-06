window.processarTextoQR = function(text, target) {
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
                window.checarDuplicadoModal(); 
                window.mostrarToast("QR Code importado!");
            }
        }
    } else {
        window.mostrarToast("QR Code lido, mas não é um formato Wi-Fi válido.");
    }
};

window.abrirScannerCamera = function(target = 'novo') {
    window.scanTarget = target;
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
        window.processarTextoQR(text, window.scanTarget);
    }, () => {});
};

// FILTRO DE NITIDEZ (SHARPEN) - Destrói os artefatos de compressão da MIUI
function sharpenCanvas(ctx, w, h, mix) {
    const weights = [0, -1, 0, -1, 5, -1, 0, -1, 0];
    const katet = Math.round(Math.sqrt(weights.length));
    const half = (katet * 0.5) | 0;
    const dstData = ctx.createImageData(w, h);
    const dstBuff = dstData.data;
    const srcBuff = ctx.getImageData(0, 0, w, h).data;
    const ystep = w * 4;

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
                
                // Redimensionamento seguro (Não muito pequeno, não muito grande)
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
                
                // Fundo branco e desenho normal
                ctx.fillStyle = "#FFFFFF";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                // Aplica a nitidez matemática para consertar o borrado da galeria MIUI
                sharpenCanvas(ctx, canvas.width, canvas.height, 1.0); 

                try {
                    // PNG não possui compressão destrutiva, garantindo que a nitidez não será perdida no PWA
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
    
    window.fecharModal(); 
    window.fecharModalEditar();
    document.getElementById('modalScanner').style.display = 'flex';
    document.getElementById('reader').innerHTML = '<div style="padding: 30px; text-align: center; color: white;">Extraindo dados nítidos...</div>';
    
    window.mostrarToast("Restaurando nitidez da imagem...");

    const html5QrCode = new Html5Qrcode("reader");

    try {
        // Tenta com a imagem afiada e limpa em formato PNG (Para combater o blur do HyperOS)
        const sharpFile = await processarImagemParaQR(originalFile);
        const qrCodeMessage = await html5QrCode.scanFile(sharpFile, true);
        window.processarTextoQR(qrCodeMessage, window.scanTarget);
        
    } catch (err1) {
        console.warn("Falha no arquivo PNG afiado. Tentando bruto.", err1);
        try {
            // Fallback bruto.
            const msg = await html5QrCode.scanFile(originalFile, true); 
            window.processarTextoQR(msg, window.scanTarget);
        } catch (err2) {
            console.error("Falha total:", err2);
            window.mostrarToast("QR Code não reconhecido. A compressão da galeria destruiu o código.");
        }
    } finally {
        html5QrCode.clear();
        window.fecharScanner(true);
        e.target.value = '';
    }
};

window.fecharScanner = function(voltarParaModalAnterior = false) {
    if (window.scannerInstancia) { 
        window.scannerInstancia.clear(); 
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
