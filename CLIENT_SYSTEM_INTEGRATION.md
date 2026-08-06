# Integracao do sistema cliente

Fluxo definido:

1. Usuario entra no `master` pela rota `/login`.
2. O `master` autentica o usuario.
3. Se o usuario for do tipo `client`, o `master` redireciona para `VITE_FROTAK_CLIENT_APP_URL`.
4. A URL do sistema cliente recebe:
   - `sso_token`: token de acesso gerado pelo master ou token Firebase.
   - `client_id`: ID do cliente no master.
   - `client_name`: nome do cliente.
   - `source=frotak-master`.

Exemplo:

```txt
http://localhost:5174?sso_token=TOKEN&client_id=cli-001&client_name=Transportadora%20Vale%20Verde&source=frotak-master
```

No sistema cliente, a primeira tela deve:

1. Ler `sso_token` e `client_id` da URL.
2. Validar o token no backend ou no Firebase.
3. Criar a sessao local do cliente.
4. Limpar os parametros da URL.
5. Enviar o usuario para o dashboard do sistema cliente.

Modo atual:

- `VITE_FROTAK_AUTH_PROVIDER=local`: fluxo funcional para desenvolvimento.
- `VITE_FROTAK_AUTH_PROVIDER=firebase`: usa Firebase Auth e repassa o ID token para o cliente.

Para producao, a validacao do `sso_token` deve acontecer no backend ou via Firebase Admin SDK.
