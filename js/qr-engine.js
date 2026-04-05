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

// UTILITÁRIO: Converte DataURL (Base64) puro para um Objeto File, limpando metadados nativos
function dataURLtoFile(dataurl, filename) {
    let arr = dataurl.split(','),
        mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), 
        n = bstr.length, 
        u8arr = new Uint8Array(n);
        
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    
    return new File([u8arr], filename, {type: mime});
}

// CORREÇÃO HYPEROS: Forçar extração via toDataURL em vez de toBlob para garantir limpeza
function processarImagemParaQR(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Dimensões táticas (400px a 600px é o ponto doce para leitura de QR sem travar a CPU)
                const MAX_WIDTH = 500;
                const MAX_HEIGHT = 500;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                
                // Fundo branco para matar canais alpha invisíveis (Problema comum em prints cortados do Android)
                ctx.fillStyle = "#FFFFFF";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, width, height);
                
                try {
                    // Extrai a imagem recodificada do zero, forçando JPEG.
                    // Isso elimina os perfis de cor bugados da galeria MIUI.
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                    const cleanFile = dataURLtoFile(dataUrl, "qr_hyperos_clean.jpg");
                    resolve(cleanFile);
                } catch (e) {
                    reject(new Error("Falha na conversão DataURL."));
                }
            };
            img.onerror = () => reject(new Error("Erro ao carregar imagem na memória"));
            img.src = event.target.result;
        };
        reader.onerror = () => reject(new Error("Erro ao ler arquivo do celular"));
        reader.readAsDataURL(file);
    });
}

window.escanearImagemQR = async function(e, target = 'novo') {
    window.scanTarget = target;
    if (e.target.files.length == 0) return;
    const originalFile = e.target.files[0];
    
    if (typeof Html5Qrcode === 'undefined') { alert("Erro: Biblioteca QR não carregada."); return; }
    window.mostrarToast("Processando imagem (Otimizado)...");

    const tempDiv = document.createElement("div");
    tempDiv.id = "temp-qr-reader";
    tempDiv.style.position = "absolute";
    tempDiv.style.top = "-9999px";
    document.body.appendChild(tempDiv);

    const html5QrCode = new Html5Qrcode("temp-qr-reader");

    try {
        // TENTATIVA 1: Passar pelo filtro de lavagem de metadados
        const cleanFile = await processarImagemParaQR(originalFile);
        
        const qrCodeMessage = await html5QrCode.scanFile(cleanFile, true);
        window.processarTextoQR(qrCodeMessage, window.scanTarget);
        
    } catch (err1) {
        console.warn("Falha no arquivo limpo:", err1);
        
        try {
            // TENTATIVA 2 (Fallback): Enviar o arquivo bruto. 
            const msg = await html5QrCode.scanFile(originalFile, false); // Tenta false (sem API nativa)
            window.processarTextoQR(msg, window.scanTarget);
            
        } catch (err2) {
            console.error("Falha no arquivo original:", err2);
            window.mostrarToast("QR Code não reconhecido. Corte as bordas e tente novamente.");
        }
    } finally {
        html5QrCode.clear();
        if(document.body.contains(tempDiv)) {
            document.body.removeChild(tempDiv);
        }
        e.target.value = ''; // Reseta o input
    }
};

window.fecharScanner = function(voltarParaModalAnterior = false) {
    if (window.scannerInstancia) { 
        window.scannerInstancia.clear(); 
    } 
    document.getElementById('modalScanner').style.display = 'none'; 
    
    if (voltarParaModalAnterior) {
        if (window.scanTarget === 'editar' && window.redeEditandoAtual) {
            document.getElementById('modalEditarRede').style.display = 'flex';
        } else if (window.scanTarget === 'novo') {
            document.getElementById('modalNovaRede').style.display = 'flex';
        }
    }
};
