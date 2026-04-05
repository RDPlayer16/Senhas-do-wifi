window.iniciarFirebaseSeguro = async function() {
    try {
        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js");
        const { getDatabase, ref, onValue, push, set, remove, update } = await import("https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js");

        const config = {
            apiKey: "AIzaSyCqDSP5SAZdMrHYvyeq9z9lZDp3UTcKu7Y",
            authDomain: "wifi-manager-pro-44487.firebaseapp.com",
            projectId: "wifi-manager-pro-44487",
            storageBucket: "wifi-manager-pro-44487.firebasestorage.app",
            messagingSenderId: "653885032085",
            appId: "1:653885032085:web:3a443b20ad2c6c26067d9c",
            measurementId: "G-NFF0SWFB9P"
        };

        const app = initializeApp(config);
        const db = getDatabase(app);
        const redesRef = ref(db, 'redes_wifi');

        window.firebasePush = function(s, p, lat, lng) {
            const novaRedeRef = push(redesRef);
            set(novaRedeRef, { ssid: s, senha: p, lat, lng }).catch(()=>{});
            return novaRedeRef.key;
        };

        window.firebaseExcluir = function(id) {
            remove(ref(db, 'redes_wifi/' + id)).catch(()=>{});
        };

        window.firebaseAtualizar = function(id, lat, lng) {
            update(ref(db, 'redes_wifi/' + id), { lat, lng }).catch(()=>{});
        };

        window.firebaseEditarCredenciais = function(id, ssid, senha) {
            update(ref(db, 'redes_wifi/' + id), { ssid, senha }).catch(()=>{});
        };

        window.firebaseAtualizarObjeto = function(id, obj) {
            update(ref(db, 'redes_wifi/' + id), obj).catch(()=>{});
        };

        const connectedRef = ref(db, '.info/connected');
        onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
                window.sincronizarPendentes();
            }
        });

        onValue(redesRef, (snapshot) => {
            const dados = snapshot.val();
            let listaNuvem = [];
            if (dados) {
                listaNuvem = Object.keys(dados).map(c => ({ id: c, ...dados[c] }));
            }

            const filaExclusao = JSON.parse(localStorage.getItem('wifi_pro_deletes_v1') || '[]');
            listaNuvem = listaNuvem.filter(r => !filaExclusao.includes(r.id));

            const filaUpdate = JSON.parse(localStorage.getItem('wifi_pro_updates_v1') || '{}');
            listaNuvem = listaNuvem.map(r => {
                if(filaUpdate[r.id]) {
                    if(filaUpdate[r.id].lat !== undefined) { r.lat = filaUpdate[r.id].lat; r.lng = filaUpdate[r.id].lng; }
                    if(filaUpdate[r.id].ssid !== undefined) { r.ssid = filaUpdate[r.id].ssid; r.senha = filaUpdate[r.id].senha; }
                }
                return r;
            });

            if (window.redePendenteExclusao) {
                listaNuvem = listaNuvem.filter(r => r.id !== window.redePendenteExclusao.id);
            }

            const pendentesLocais = window.redesEmMemoria.filter(r => String(r.id).startsWith('local_'));
            listaNuvem = [...listaNuvem, ...pendentesLocais];

            listaNuvem.sort((a, b) => a.ssid.localeCompare(b.ssid));
            
            if (!window.mostrandoApenasProximas) { 
                window.renderizarInterface(listaNuvem); 
            } else { 
                window.redesEmMemoria = listaNuvem; 
            }
            
            if (window.salvarNoIndexedDB) {
                window.salvarNoIndexedDB(listaNuvem);
            }
            
            window.atualizarContador('sincronizado', listaNuvem.length);
        });

    } catch (error) {
        console.warn("Modo Offline ativado: Firebase não carregou.", error);
        window.atualizarContador('offline');
    }
};

if (navigator.onLine) {
    window.iniciarFirebaseSeguro();
}