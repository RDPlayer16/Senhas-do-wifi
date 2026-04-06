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
    
    // Deixa o modal de scan visível e com dimensões reais
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

// Limpa metadados e redimensiona pesados prints do HyperOS
function processarImagemParaQR(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                const MAX_WIDTH = 500;
                const MAX_HEIGHT = 500;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                } else {
                    if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                }

                canvas.width = width;
                canvas.height = height;
                
                ctx.fillStyle = "#FFFFFF";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, width, height);
                
                try {
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                    let arr = dataUrl.split(','), mime = arr[0].match(/:(.*?);/)[1], bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
                    while(n--) { u8arr[n] = bstr.charCodeAt(n); }
                    resolve(new File([u8arr], "qr_hyperos_clean.jpg", {type: mime}));
                } catch (e) {
                    reject(new Error("Falha na conversão DataURL."));
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
    
    // O pulo do gato: Abre o modal de câmera (mesmo para arquivo) para garantir que a div #reader tenha dimensões físicas no DOM do Redmi
    window.fecharModal(); 
    window.fecharModalEditar();
    document.getElementById('modalScanner').style.display = 'flex';
    document.getElementById('reader').innerHTML = '<div style="padding: 30px; text-align: center; color: white;">Processando arquivo...</div>';
    
    window.mostrarToast("Processando imagem...");

    // Usa o container oficial com dimensões já pintadas
    const html5QrCode = new Html5Qrcode("reader");

    try {
        const cleanFile = await processarImagemParaQR(originalFile);
        
        // Usa a engine oficial para ler o arquivo limpo
        const qrCodeMessage = await html5QrCode.scanFile(cleanFile, true);
        window.processarTextoQR(qrCodeMessage, window.scanTarget);
        
    } catch (err1) {
        console.warn("Falha no arquivo limpo, tentando bruto:", err1);
        
        try {
            // Fallback para arquivo original (ex: S23 ou PC que não precisam de limpeza)
            const msg = await html5QrCode.scanFile(originalFile, false); 
            window.processarTextoQR(msg, window.scanTarget);
            
        } catch (err2) {
            console.error("Falha no arquivo original:", err2);
            window.mostrarToast("QR Code não reconhecido. Corte as bordas da foto.");
        }
    } finally {
        html5QrCode.clear();
        // Volta para o modal de origem
        window.fecharScanner(true);
        e.target.value = '';
    }
};

window.fecharScanner = function(voltarParaModalAnterior = false) {
    if (window.scannerInstancia) { 
        window.scannerInstancia.clear(); 
    } 
    document.getElementById('modalScanner').style.display = 'none'; 
    document.getElementById('reader').innerHTML = ''; // Limpa resquícios
    
    if (voltarParaModalAnterior) {
        if (window.scanTarget === 'editar' && window.redeEditandoAtual) {
            document.getElementById('modalEditarRede').style.display = 'flex';
        } else if (window.scanTarget === 'novo') {
            document.getElementById('modalNovaRede').style.display = 'flex';
        }
    }
};
