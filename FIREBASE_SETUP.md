# Correção do Erro Firebase: "Expected first argument to doc() to be a CollectionReference..."

## 🔧 Problema Identificado

O erro ocorria porque o Firebase não estava sendo inicializado corretamente devido à **falta de variáveis de ambiente**.

### Mensagem de Erro Original:
```
FirebaseError: Expected first argument to doc() to be a CollectionReference, a DocumentReference or FirebaseFirestore
```

### Causa Raiz:
- O arquivo `firebase.ts` tentava inicializar o Firebase usando `import.meta.env.VITE_FIREBASE_*`
- Não havia arquivo `.env` com as configurações do Firebase
- Isso fazia com que `db` fosse `null` ou `undefined`
- Quando os services tentavam usar `doc(db, ...)`, ocorria o erro

## ✅ Correções Implementadas

### 1. **firebase.ts** - Inicialização Defensiva
- ✅ Adicionada validação das variáveis de ambiente
- ✅ Exporta flag `isFirebaseInitialized` para verificar status
- ✅ `db` agora pode ser `null` (tipo seguro)
- ✅ Mensagens de erro detalhadas no console

### 2. **Services** - Verificações de Segurança
Todos os services agora verificam se Firebase está disponível antes de usar:

- ✅ **configService.ts** - Retorna configuração padrão se Firebase não disponível
- ✅ **pcaService.ts** - Pula operações Firestore e usa apenas cache local/API
- ✅ **budgetService.ts** - Retorna dados vazios se Firebase não disponível
- ✅ **acquisitionService.ts** - Funções retornam void/array vazio sem Firebase

### 3. **Arquivos de Configuração**
- ✅ Criado `.env.example` com template das variáveis necessárias
- ✅ `.gitignore` já existente (protege arquivos `.env`)

## 🚀 Como Configurar o Firebase

### Passo 1: Criar arquivo `.env`

Na raiz do projeto, crie um arquivo chamado `.env` (copie do `.env.example`):

```bash
cp .env.example .env
```

### Passo 2: Obter Credenciais do Firebase

1. Acesse o [Firebase Console](https://console.firebase.google.com/)
2. Selecione seu projeto (ou crie um novo)
3. Vá em **Configurações do Projeto** (ícone de engrenagem) → **Geral**
4. Role até **Seus apps** e selecione o app web
5. Copie os valores de configuração

### Passo 3: Preencher o arquivo `.env`

```env
VITE_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXX
VITE_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu-projeto-id
VITE_FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

### Passo 4: Reiniciar o Servidor de Desenvolvimento

```bash
# Pare o servidor atual (Ctrl+C)
# Reinicie com:
npm run dev
```

## 🔍 Verificando se Funcionou

Após configurar, você deve ver no console do navegador:

✅ **Se configurado corretamente:**
```
[Firebase] Inicialização bem-sucedida
```

❌ **Se ainda faltam variáveis:**
```
[Firebase] Configuração inválida. Verifique as variáveis de ambiente VITE_FIREBASE_*
[Firebase] Valores recebidos: { hasApiKey: false, hasAuthDomain: false, ... }
```

## 🎯 Modo de Funcionamento

A aplicação agora funciona em **dois modos**:

### Modo COM Firebase (Completo)
- ✅ Sincronização com Firestore
- ✅ Cache persistente entre sessões
- ✅ Dados manuais salvos
- ✅ Vínculos de processos

### Modo SEM Firebase (Limitado)
- ✅ Dados locais (JSON files em `/data`)
- ✅ Sincronização LIVE com API PNCP
- ✅ Cache apenas em memória (durante a sessão)
- ⚠️ Sem persistência de alterações
- ⚠️ Sem dados manuais
- ⚠️ Sem vínculos de processos

## 📝 Notas Importantes

1. **Nunca commite o arquivo `.env`** - Ele já está no `.gitignore`
2. **Service Account Key** - O arquivo `serviceAccountKey.json` também não deve ser commitado
3. **Modo desenvolvimento** - A aplicação funciona mesmo sem Firebase, mas com funcionalidades limitadas
4. **Produção** - Configure as variáveis de ambiente no seu serviço de hospedagem (Firebase Hosting, Vercel, etc.)

## 🐛 Troubleshooting

### Erro persiste após configurar `.env`
- Certifique-se de reiniciar o servidor de desenvolvimento
- Verifique se não há espaços em branco nas variáveis
- Confirme que todas as variáveis começam com `VITE_`

### Console mostra valores `undefined`
- O arquivo `.env` deve estar na raiz do projeto (mesma pasta do `package.json`)
- Vite só lê variáveis que começam com `VITE_`
- Reinicie o servidor após criar/editar o `.env`

### Firebase configurado mas ainda não funciona
- Verifique as regras de segurança do Firestore
- Confirme que o Firestore está habilitado no projeto
- Verifique se não há erros de permissão no console

## 📞 Suporte

Se precisar de mais ajuda, forneça:
- Mensagens do console do navegador
- Output do terminal onde o `npm run dev` está rodando
- Screenshot da configuração do Firebase (sem mostrar chaves secretas!)
