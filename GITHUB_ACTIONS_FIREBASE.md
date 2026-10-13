# Publicação automática no Firebase Hosting

O workflow `.github/workflows/firebase-hosting.yml` publica a branch `main` no projeto `wifi-manager-pro-44487`. **Ele só funcionará depois da configuração da identidade Google Cloud**.

## Autenticação sem chave JSON (recomendado)
1. No Google Cloud, criar uma service account dedicada ao deploy, com permissões mínimas necessárias para Firebase Hosting.
2. Configurar Workload Identity Federation para o repositório `RDPlayer16/Senhas-do-wifi`, restringindo o atributo de repositório e a branch `main`.
3. Em GitHub > Settings > Secrets and variables > Actions > Variables, adicionar:
   - `GCP_WORKLOAD_IDENTITY_PROVIDER` — identificador completo do provider.
   - `GCP_DEPLOY_SERVICE_ACCOUNT` — email da service account.
4. Em Settings > Environments, criar `firebase-hosting-production`, com revisão obrigatória se o plano permitir.
5. Rodar manualmente o workflow em Actions e conferir a URL principal.

Não salvar tokens, arquivos de service account ou credenciais no repositório. Não dar permissões de administrador do Realtime Database à conta de deploy.

## Observações
- Este workflow não altera as regras nem os dados do Realtime Database.
- O GitHub Pages existente continua ativo até a desativação manual.
- Após incorporar o PR à `main`, o workflow poderá disparar automaticamente. Se as variáveis ainda não existirem, a publicação falhará sem alterar o site já publicado.
- Validar o site principal e a segurança do banco antes de tornar o repositório privado.
