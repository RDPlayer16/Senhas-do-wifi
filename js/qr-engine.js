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

// MOTOR DE TRATAMENTO AGRESSIVO PARA PROCESSADORES SEM ACELERAÇÃO
function processarImagemParaQR(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                const MAX_WIDTH = 600;
                const MAX_HEIGHT = 600;
                let width = img.width;
                let height = img.height;

                // Mantém proporção
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
                
                // --- ALGORITMO DE BINARIZAÇÃO (THRESHOLD) ---
                // Força a imagem a ficar Preto e Branco puro. Remove ruído para o parser JS.
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {
                    // Calcula luminosidade do pixel
                    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                    // Define o ponto de corte (128 = meio termo)
                    const color = avg > 128 ? 255 : 0; 
                    
                    data[i] = color;     // Red
                    data[i + 1] = color; // Green
                    data[i + 2] = color; // Blue
                    // data[i + 3] é o Alpha, não mexemos para manter 100% opaco
                }
                ctx.putImageData(imageData, 0, 0);
                // ---------------------------------------------
                
                try {
                    // Exporta como JPEG sem compressão destrutiva
                    const dataUrl = canvas.toDataURL('image/jpeg', 1.0);
                    let arr = dataUrl.split(','), mime = arr[0].match(/:(.*?);/)[1], bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
                    while(n--) { u8arr[n] = bstr.charCodeAt(n); }
                    resolve(new File([u8arr], "qr_binario.jpg", {type: mime}));
                } catch (e) {
                    reject(new Error("Falha na conversão Binária."));
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
    document.getElementById('reader').innerHTML = '<div style="padding: 30px; text-align: center; color: white;">Extraindo dados binários...</div>';
    
    window.mostrarToast("Analisando contraste...");

    const html5QrCode = new Html5Qrcode("reader");

    try {
        // Tenta com a imagem Preto e Branco (Foco em CPUs fracas)
        const pureBlackWhiteFile = await processarImagemParaQR(originalFile);
        const qrCodeMessage = await html5QrCode.scanFile(pureBlackWhiteFile, true);
        window.processarTextoQR(qrCodeMessage, window.scanTarget);
        
    } catch (err1) {
        console.warn("Falha no arquivo PB. Tentando bruto.", err1);
        try {
            // Tenta bruto (Foco em imagens já limpas/aparelhos fortes)
            const msg = await html5QrCode.scanFile(originalFile, true); 
            window.processarTextoQR(msg, window.scanTarget);
        } catch (err2) {
            console.error("Falha total:", err2);
            window.mostrarToast("QR Code não reconhecido. Certifique-se que o código está nítido.");
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
