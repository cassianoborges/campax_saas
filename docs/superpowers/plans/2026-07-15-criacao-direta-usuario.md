# Criação Direta de Usuário — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Superadmin cria um novo usuário diretamente na tela `/admin/usuarios`, definindo e-mail, senha (gerada ou digitada) e papel — sem depender de e-mail de convite ou de deploy de Edge Function no Supabase.

**Architecture:** Um novo endpoint `POST /api/users/create` é adicionado ao Express já existente em `camera-status-api.cjs` (já implantado via PM2). Ele valida que quem chama é `superadmin` (via RPC `get_my_role` com o JWT do chamador), depois usa a service role key para criar o usuário no Supabase Auth já confirmado (`email_confirm: true`) e faz upsert do perfil em `profiles`. O frontend troca `InviteUserDialog` por `CreateUserDialog` (com campo de senha) e `useUsers.ts` passa a chamar esse novo endpoint em vez do Edge Function `invite-user`, que é removido.

**Tech Stack:** Express (`camera-status-api.cjs`, CommonJS), `@supabase/supabase-js` (já presente no `package.json` raiz), `dotenv` (novo), React + TanStack Query + shadcn/ui no frontend.

## Global Constraints

- Este repositório não tem framework de testes (`grep`/`find` não acharam Jest/Vitest nem arquivos `*.test.*`). Verificação é manual, via `curl` e navegador — não introduza um test runner novo para esta feature.
- `dotenv` deve ser adicionado apenas ao `package.json` da raiz (não existe `package.json` próprio para `camera-status-api.cjs`).
- Nunca imprima o valor de `SUPABASE_SERVICE_KEY` no terminal, em commits ou nesta conversa — os comandos que o copiam devem redirecionar direto para o arquivo de destino.
- Siga o padrão já usado por `mediamtx-sync` (`dotenv.config()` + arquivo `.env` próprio com `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`) em vez de inventar um mecanismo novo de configuração.
- Não altere `supabase/migrations/`, RLS ou `ecosystem.config.cjs` — fora de escopo (ver spec).

---

### Task 1: Configuração — dotenv e `.env.camera-status-api`

**Files:**
- Modify: `package.json`
- Create: `.env.camera-status-api.example`
- Create: `.env.camera-status-api` (não commitado com placeholder — ver Step 4)

**Interfaces:**
- Produces: arquivo `.env.camera-status-api` na raiz do projeto com as chaves `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, carregável via `require('dotenv').config({ path: '.env.camera-status-api' })`. A Task 2 depende deste arquivo existir com valores reais.

- [ ] **Step 1: Adicionar `dotenv` ao `package.json`**

Em `package.json`, dentro de `"dependencies"`, adicione a linha logo depois de `"date-fns": "^3.6.0",` (ordem alfabética):

```json
    "date-fns": "^3.6.0",
    "dotenv": "^16.3.1",
    "embla-carousel-react": "^8.6.0",
```

- [ ] **Step 2: Instalar a dependência**

Run: `npm install`
Expected: termina sem erro; `package-lock.json` é atualizado e `node_modules/dotenv` passa a existir.

- [ ] **Step 3: Criar o arquivo de exemplo (documentação, sem segredo real)**

Create `.env.camera-status-api.example`:

```
# Supabase (mesmos valores usados em mediamtx-sync/.env)
SUPABASE_URL=https://mzqthywvdavavviqbolm.supabase.co
SUPABASE_SERVICE_KEY=sua_service_role_key_aqui
SUPABASE_ANON_KEY=sua_anon_key_aqui
```

- [ ] **Step 4: Criar o `.env.camera-status-api` real, copiando valores existentes sem exibi-los**

`SUPABASE_URL` e `SUPABASE_SERVICE_KEY` já existem em `mediamtx-sync/.env`; `SUPABASE_ANON_KEY` é o mesmo valor de `VITE_SUPABASE_PUBLISHABLE_KEY` no `.env` da raiz. Rode exatamente este comando (ele nunca imprime os valores, só grava no arquivo):

```bash
{
  grep '^SUPABASE_URL=' mediamtx-sync/.env
  grep '^SUPABASE_SERVICE_KEY=' mediamtx-sync/.env
  printf 'SUPABASE_ANON_KEY=%s\n' "$(grep '^VITE_SUPABASE_PUBLISHABLE_KEY=' .env | cut -d= -f2- | tr -d '\"')"
} > .env.camera-status-api
```

- [ ] **Step 5: Verificar que o dotenv carrega as três chaves**

Run:

```bash
node -e "
require('dotenv').config({ path: '.env.camera-status-api' });
console.log(
  Boolean(process.env.SUPABASE_URL),
  Boolean(process.env.SUPABASE_SERVICE_KEY),
  Boolean(process.env.SUPABASE_ANON_KEY)
);
"
```

Expected output: `true true true`

- [ ] **Step 6: Commit**

Este repositório já versiona `.env` e `mediamtx-sync/.env` com segredos reais (prática existente, não introduzida por este plano) — seguimos o mesmo padrão aqui para consistência.

```bash
git add package.json package-lock.json .env.camera-status-api.example .env.camera-status-api
git commit -m "chore: add dotenv config for camera-status-api Supabase access"
```

---

### Task 2: Endpoint `POST /api/users/create` em `camera-status-api.cjs`

**Files:**
- Modify: `camera-status-api.cjs`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` de `process.env` (produzidos na Task 1).
- Produces: rota `POST /api/users/create` — body `{ email, password, role, full_name?, numero_whatsapp?, agente_ia? }`, header `Authorization: Bearer <jwt>`. Resposta de sucesso `{ success: true, user_id: string }` (200); erros `{ error: string }` (401/403/400/500). A Task 3 (`useUsers.ts`) depende deste contrato exato.

- [ ] **Step 1: Adicionar os requires e o carregamento do `.env.camera-status-api`**

Em `camera-status-api.cjs`, logo depois das linhas 1-3 (`require('express')`, `require('net')`, `require('cors')`), adicione:

```javascript
const express = require('express');
const net = require('net');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.camera-status-api') });
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.CAMERA_STATUS_PORT || 3001;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
```

(isso substitui as linhas 1-6 originais, que eram `const express = require('express');` / `const net = require('net');` / `const cors = require('cors');` / linha em branco / `const app = express();` / `const PORT = process.env.CAMERA_STATUS_PORT || 3001;`)

- [ ] **Step 2: Adicionar a rota `POST /api/users/create`**

Insira este bloco logo depois do fechamento da rota `/api/camera/check-multiple` (depois do `});` que fecha essa rota, antes do comentário `/** * GET /health ... */`):

```javascript
/**
 * POST /api/users/create
 * Superadmin cria um novo usuário diretamente, com senha definida na hora
 * (sem e-mail de convite). Requer Authorization: Bearer <jwt de superadmin>.
 */
app.post('/api/users/create', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Authorization header required' });
        }

        const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: roleData, error: roleError } = await callerClient.rpc('get_my_role');
        if (roleError || roleData !== 'superadmin') {
            return res.status(403).json({ error: 'Unauthorized: superadmin required' });
        }

        const { email, password, role, full_name, numero_whatsapp, agente_ia } = req.body;
        if (!email || !password || !role) {
            return res.status(400).json({ error: 'email, password and role are required' });
        }

        const { data: callerData } = await callerClient.auth.getUser();
        const creatorId = callerData.user?.id ?? null;

        const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: full_name || null },
        });

        if (createError) {
            return res.status(400).json({ error: createError.message });
        }

        const { error: profileError } = await adminClient
            .from('profiles')
            .upsert({
                id: createdUser.user.id,
                email,
                full_name: full_name || null,
                role,
                invited_by: creatorId,
                numero_whatsapp: numero_whatsapp || null,
                agente_ia: agente_ia || false,
            });

        if (profileError) {
            return res.status(400).json({ error: profileError.message });
        }

        res.json({ success: true, user_id: createdUser.user.id });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: error.message });
    }
});

```

- [ ] **Step 3: Subir o servidor localmente**

Run: `node camera-status-api.cjs &`
Expected: log `🎥 Camera Status API running on port 3001` (guarde o PID exibido pelo shell / use `jobs -p` para poder derrubar depois).

- [ ] **Step 4: Verificar 401 sem header de autenticação**

Run:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/users/create \
  -X POST -H "Content-Type: application/json" -d '{}'
```

Expected: `401`

- [ ] **Step 5: Verificar 403 com token inválido**

Run:

```bash
curl -s http://localhost:3001/api/users/create \
  -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer token-invalido" -d '{}'
```

Expected: corpo `{"error":"Unauthorized: superadmin required"}`

- [ ] **Step 6: Derrubar o servidor local**

Run: `kill %1` (ou `pkill -f camera-status-api.cjs`)

- [ ] **Step 7: Commit**

```bash
git add camera-status-api.cjs
git commit -m "feat: add POST /api/users/create endpoint to camera-status-api"
```

---

### Task 3: Frontend — `useUsers.ts` chama o novo endpoint; remove o Edge Function

**Files:**
- Modify: `src/hooks/useUsers.ts`
- Delete: `supabase/functions/invite-user/` (diretório inteiro)

**Interfaces:**
- Consumes: `POST /api/users/create` (contrato definido na Task 2); `import.meta.env.VITE_CAMERA_STATUS_API_URL` (já existe, mesmo padrão de `src/services/cameraStatusService.ts:22`).
- Produces: `useUsers()` retorna `{ users, isLoading, updateRole, toggleActive, createUser }` — `createUser.mutateAsync({ email, password, role, full_name?, numero_whatsapp?, agente_ia? })`. A Task 4 (`CreateUserDialog.tsx`) depende deste nome e desta assinatura.

- [ ] **Step 1: Substituir o conteúdo de `src/hooks/useUsers.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { UserRole } from './useRole';

export type ProfileRow = Tables<'profiles'>;

const CAMERA_STATUS_API_URL = import.meta.env.VITE_CAMERA_STATUS_API_URL || 'http://localhost:3001';

export function useUsers() {
    const queryClient = useQueryClient();

    const { data: users = [], isLoading } = useQuery({
        queryKey: ['users'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data as ProfileRow[];
        },
    });

    const updateRole = useMutation({
        mutationFn: async ({ userId, role }: { userId: string; role: UserRole }) => {
            const { error } = await supabase
                .from('profiles')
                .update({ role })
                .eq('id', userId);
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    });

    const toggleActive = useMutation({
        mutationFn: async ({ userId, is_active }: { userId: string; is_active: boolean }) => {
            const { error } = await supabase
                .from('profiles')
                .update({ is_active })
                .eq('id', userId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            queryClient.invalidateQueries({ queryKey: ['profile'] });
        },
    });

    const createUser = useMutation({
        mutationFn: async ({
            email,
            password,
            role,
            full_name,
            numero_whatsapp,
            agente_ia,
        }: {
            email: string;
            password: string;
            role: UserRole;
            full_name?: string;
            numero_whatsapp?: string;
            agente_ia?: boolean;
        }) => {
            const { data: { session } } = await supabase.auth.getSession();

            const resp = await fetch(`${CAMERA_STATUS_API_URL}/api/users/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({ email, password, role, full_name, numero_whatsapp, agente_ia }),
            });

            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.error || 'Erro ao criar usuário');
            }

            return resp.json();
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    });

    return { users, isLoading, updateRole, toggleActive, createUser };
}
```

- [ ] **Step 2: Remover o Edge Function não utilizado**

Run: `git rm -r supabase/functions/invite-user`

- [ ] **Step 3: Checar erros de tipo**

Run: `npx tsc --noEmit`
Expected: nenhum erro relacionado a `useUsers.ts` (outros arquivos ainda referenciando `inviteUser`/`InviteUserDialog` vão aparecer aqui até a Task 4 — isso é esperado nesta etapa intermediária; confirme que não há erro *novo* fora desses).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useUsers.ts
git commit -m "feat: replace invite-user Edge Function call with direct camera-status-api endpoint"
```

---

### Task 4: Frontend — `CreateUserDialog.tsx` substitui `InviteUserDialog.tsx`

**Files:**
- Create: `src/components/CreateUserDialog.tsx`
- Delete: `src/components/InviteUserDialog.tsx`

**Interfaces:**
- Consumes: `useUsers().createUser` (Task 3), `UserRole` de `@/hooks/useRole`.
- Produces: componente `CreateUserDialog` (export nomeado), sem props. A Task 5 (`UserManagement.tsx`) depende deste nome de import.

- [ ] **Step 1: Criar `src/components/CreateUserDialog.tsx`**

```tsx
import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { UserPlus, RefreshCw, Copy, CheckCircle2 } from 'lucide-react';
import { useUsers } from '@/hooks/useUsers';
import { UserRole } from '@/hooks/useRole';
import { useToast } from '@/hooks/use-toast';

const ROLE_LABELS: Record<UserRole, string> = {
    superadmin: 'Superadmin',
    admin: 'Admin',
    operador: 'Operador',
    viewer: 'Visualizador',
};

function generatePassword(length = 16): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
    const values = new Uint32Array(length);
    crypto.getRandomValues(values);
    return Array.from(values, (v) => chars[v % chars.length]).join('');
}

export function CreateUserDialog() {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<'form' | 'success'>('form');
    const [email, setEmail] = useState('');
    const [fullName, setFullName] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<UserRole>('viewer');
    const [whatsapp, setWhatsapp] = useState('');
    const [agenteIa, setAgenteIa] = useState(false);
    const { createUser } = useUsers();
    const { toast } = useToast();

    const resetForm = () => {
        setEmail('');
        setFullName('');
        setPassword('');
        setRole('viewer');
        setWhatsapp('');
        setAgenteIa(false);
        setStep('form');
    };

    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen);
        if (!isOpen) resetForm();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) return;

        try {
            await createUser.mutateAsync({
                email,
                password,
                role,
                full_name: fullName || undefined,
                numero_whatsapp: whatsapp || undefined,
                agente_ia: agenteIa,
            });
            setStep('success');
        } catch (err: unknown) {
            toast({
                title: 'Erro ao criar usuário',
                description: err instanceof Error ? err.message : 'Tente novamente.',
                variant: 'destructive',
            });
        }
    };

    const copyPassword = () => {
        navigator.clipboard.writeText(password);
        toast({ title: 'Senha copiada!' });
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button className="bg-gold text-background hover:bg-gold/90">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Criar Usuário
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-heading">
                        {step === 'success' ? 'Usuário criado com sucesso!' : 'Criar Novo Usuário'}
                    </DialogTitle>
                </DialogHeader>

                {step === 'success' ? (
                    <div className="py-4 space-y-5">
                        <div className="flex flex-col items-center gap-2 pb-2">
                            <CheckCircle2 className="w-12 h-12 text-green-500" />
                            <p className="text-center text-muted-foreground text-sm">
                                Repasse o e-mail e a senha abaixo para o novo usuário.
                            </p>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted-foreground uppercase tracking-wide">E-mail</label>
                            <p className="font-medium text-foreground">{email}</p>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-muted-foreground uppercase tracking-wide">Senha</label>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 font-mono text-sm bg-secondary rounded-lg py-2.5 px-3 text-gold">
                                    {password}
                                </div>
                                <Button variant="outline" size="icon" onClick={copyPassword}>
                                    <Copy className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                        <Button className="w-full" onClick={() => handleOpenChange(false)}>
                            Concluir
                        </Button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                        <div className="space-y-1">
                            <Label htmlFor="create-email">E-mail *</Label>
                            <Input
                                id="create-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="usuario@empresa.com"
                                required
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="create-name">Nome completo</Label>
                            <Input
                                id="create-name"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                placeholder="Opcional"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="create-password">Senha *</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="create-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Digite ou gere uma senha"
                                    required
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    title="Gerar senha"
                                    onClick={() => setPassword(generatePassword())}
                                >
                                    <RefreshCw className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="create-whatsapp">WhatsApp</Label>
                            <Input
                                id="create-whatsapp"
                                type="tel"
                                value={whatsapp}
                                onChange={(e) => setWhatsapp(e.target.value)}
                                placeholder="+55 62 99999-9999"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="create-role">Papel</Label>
                            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                                <SelectTrigger id="create-role">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                                        <SelectItem key={r} value={r}>
                                            {ROLE_LABELS[r]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                            <div>
                                <Label htmlFor="create-agente-ia" className="text-sm font-medium">
                                    Agente IA
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    Habilitar integração com agente de inteligência artificial
                                </p>
                            </div>
                            <Switch
                                id="create-agente-ia"
                                checked={agenteIa}
                                onCheckedChange={setAgenteIa}
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => handleOpenChange(false)}
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={createUser.isPending}
                                className="bg-gold text-background hover:bg-gold/90"
                            >
                                {createUser.isPending ? 'Criando...' : 'Criar usuário'}
                            </Button>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
```

- [ ] **Step 2: Remover o componente antigo**

Run: `git rm src/components/InviteUserDialog.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/components/CreateUserDialog.tsx
git commit -m "feat: add CreateUserDialog with password field, replacing InviteUserDialog"
```

---

### Task 5: Conectar `UserManagement.tsx`, instalar e reiniciar em produção

**Files:**
- Modify: `src/pages/UserManagement.tsx:2` e `:88`

**Interfaces:**
- Consumes: `CreateUserDialog` de `@/components/CreateUserDialog` (Task 4).

- [ ] **Step 1: Trocar o import**

Em `src/pages/UserManagement.tsx`, linha 2:

```diff
-import { InviteUserDialog } from '@/components/InviteUserDialog';
+import { CreateUserDialog } from '@/components/CreateUserDialog';
```

- [ ] **Step 2: Trocar o uso do componente**

Em `src/pages/UserManagement.tsx`, linha 88:

```diff
-                <InviteUserDialog />
+                <CreateUserDialog />
```

- [ ] **Step 3: Checar tipos e lint do projeto inteiro**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros (nenhuma referência restante a `InviteUserDialog` ou `inviteUser` deve sobrar em `src/`).

Run adicional para confirmar que não sobrou nada:
```bash
grep -rn "InviteUserDialog\|inviteUser" src/
```
Expected: nenhum resultado.

- [ ] **Step 4: Commit**

```bash
git add src/pages/UserManagement.tsx
git commit -m "feat: wire CreateUserDialog into UserManagement page"
```

- [ ] **Step 5: Build de produção local (sanity check)**

Run: `npm run build`
Expected: build termina sem erro (confirma que a troca de import não quebrou o bundle).

- [ ] **Step 6: Verificação manual end-to-end**

Este diretório já é o servidor de produção (confirmado via `pm2 list`: `camera-status-api` e `campax-frontend` já rodam daqui). Rode:

```bash
pm2 restart camera-status-api
```

Não é necessário reiniciar `campax-frontend` agora — só depois que o frontend for rebuildado e implantado com as mudanças das Tasks 3-5 (fora do escopo deste plano decidir *quando* fazer o deploy do frontend; confirme com o usuário antes de reiniciar `campax-frontend` em produção).

No navegador, logado como superadmin em `/admin/usuarios`:
1. Clique em "Criar Usuário", preencha e-mail, clique em "Gerar senha", escolha papel `viewer`, envie.
2. Confirme a tela de sucesso mostrando e-mail + senha, copie a senha.
3. Faça logout e tente logar em `/admin` com esse e-mail + a senha copiada — deve entrar com sucesso e ver o dashboard (sem acesso a `/admin/usuarios`, já que é `viewer`).
4. Volte como superadmin, confirme que o novo usuário aparece na lista com o papel correto.
5. Repita criando um segundo usuário digitando a senha manualmente (sem usar "Gerar senha"), confirme que também funciona.

Não há passo de commit aqui — esta é a verificação final de que a feature funciona ponta a ponta em produção.
