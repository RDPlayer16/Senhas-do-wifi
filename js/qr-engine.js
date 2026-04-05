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
        window.mostrarToast("QR Code inválido para Wi-Fi.");
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

// CORREÇÃO: Blindagem para Androids/Xiaomi que não enviam MIME Type
function processarImagemParaQR(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // 600px garante performance máxima em processadores mais simples
                const MAX_WIDTH = 600;
                const MAX_HEIGHT = 600;
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
                
                // Preenche com fundo branco absoluto para evitar bugs de PNG com Alpha do HyperOS
                ctx.fillStyle = "#FFFFFF";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Desenha o print redimensionado por cima
                ctx.drawImage(img, 0, 0, width, height);
                
                // FORÇA o padrão JPEG universal, ignorando o formato bizarro que a galeria possa ter mandado
                const safeMimeType = 'image/jpeg';
                
                canvas.toBlob((blob) => {
                    if(blob) {
                        // Cria um novo arquivo seguro
                        resolve(new File([blob], "qr_processado_seguro.jpg", { type: safeMimeType }));
                    } else {
                        reject(new Error("Falha ao criar Blob do Canvas"));
                    }
                }, safeMimeType, 0.95);
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
    
    if (typeof Html5Qrcode === 'undefined') { alert("Conecte-se à internet para carregar o escâner."); return; }
    window.mostrarToast("Processando print...");

    try {
        // 1. Passa a imagem pelo filtro do Canvas blindado
        const optimizedFile = await processarImagemParaQR(originalFile);

        const tempDiv = document.createElement("div");
        tempDiv.id = "temp-qr-reader";
        tempDiv.style.position = "absolute";
        tempDiv.style.top = "-9999px";
        document.body.appendChild(tempDiv);

        const html5QrCode = new Html5Qrcode("temp-qr-reader");

        // 2. Escaneia o arquivo JPG limpo e leve
        html5QrCode.scanFile(optimizedFile, true)
        .then(qrCodeMessage => {
            window.processarTextoQR(qrCodeMessage, window.scanTarget);
            html5QrCode.clear();
            document.body.removeChild(tempDiv);
        })
        .catch(err => {
            // Fallback: Se o otimizado falhar, tenta o arquivo original (PC geralmente cai aqui se a imagem for minúscula)
            html5QrCode.scanFile(originalFile, true)
            .then(msg => {
                window.processarTextoQR(msg, window.scanTarget);
                html5QrCode.clear();
                document.body.removeChild(tempDiv);
            })
            .catch(finalErr => {
                window.mostrarToast("Nenhum QR encontrado. Tente recortar as bordas da foto.");
                html5QrCode.clear();
                document.body.removeChild(tempDiv);
            });
        });

    } catch (processError) {
        window.mostrarToast("Erro interno: " + processError.message);
    } finally {
        e.target.value = ''; // Reseta o input file para permitir selecionar a mesma imagem de novo se precisar
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
