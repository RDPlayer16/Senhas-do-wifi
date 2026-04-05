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

window.escanearImagemQR = function(e, target = 'novo') {
    window.scanTarget = target;
    if (e.target.files.length == 0) return;
    const file = e.target.files[0];
    
    if (typeof Html5Qrcode === 'undefined') { alert("Conecte-se à internet para carregar o escâner."); return; }
    window.mostrarToast("Analisando imagem...");

    const tempDiv = document.createElement("div");
    tempDiv.id = "temp-qr-reader";
    tempDiv.style.position = "absolute";
    tempDiv.style.top = "-9999px";
    document.body.appendChild(tempDiv);

    const html5QrCode = new Html5Qrcode("temp-qr-reader");

    html5QrCode.scanFile(file, true)
    .then(qrCodeMessage => {
        window.processarTextoQR(qrCodeMessage, window.scanTarget);
        html5QrCode.clear();
        document.body.removeChild(tempDiv);
    })
    .catch(err => {
        window.mostrarToast("Nenhum QR encontrado ou a imagem está muito embaçada.");
        html5QrCode.clear();
        document.body.removeChild(tempDiv);
    });

    e.target.value = ''; 
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