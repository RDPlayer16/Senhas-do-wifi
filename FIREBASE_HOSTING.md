# Firebase Hosting — Wi-Fi Manager Pro

Projeto: `wifi-manager-pro-44487`. Este repositório é somente do Wi-Fi Manager Pro; não modificar o OLT Hub.

## Preparar e publicar (Cloud Shell ou terminal)

```bash
git clone https://github.com/RDPlayer16/Senhas-do-wifi.git
cd Senhas-do-wifi
bash scripts/prepare-hosting.sh
firebase login --no-localhost
firebase hosting:channel:deploy migracao --project wifi-manager-pro-44487 --expires 7d
```

Se o Firebase CLI não estiver instalado: `npm install -g firebase-tools`.
Para a publicação definitiva, após testes e revisão das regras do banco:
`firebase deploy --only hosting --project wifi-manager-pro-44487`.

## Segurança e validação
- O Firebase Realtime Database já usado pelo PWA não é alterado por estes arquivos.
- **Antes de divulgar o endereço**, revisar as regras do Realtime Database e a autenticação; o aplicativo contém senhas de Wi-Fi.
- O PWA usa IndexedDB/localStorage e Service Worker; mudar de origem NÃO migra dados locais.
- Confirmar backup e sincronização na origem antiga antes de usar a nova.
- Testar leitura/escrita, offline, mapas, instalação e atualizações na URL de preview.
- Só privatizar o repositório após a nova hospedagem estar funcionando.
- O GitHub Pages antigo não é modificado por este PR.
