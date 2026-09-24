# Banco de Homenagens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Configurações" section to the admin with a CRUD for reusable homage-message templates ("Banco de Homenagens"), and let the velório form fill its existing "Mensagem de Homenagem" textarea from a dropdown of those templates.

**Architecture:** One migration creates `homenagens_templates` (título + mensagem, RLS: `viewer+` reads, `admin+` writes). A new hook `useHomenagensTemplates.ts` follows the exact TanStack Query shape of `useCameras.ts`. Two new pages — `SettingsHub.tsx` (a card-grid hub, mirroring `ReportsHub.tsx`) and `HomenagensTemplatesManagement.tsx` (a dialog-based CRUD list, mirroring `CameraManagement.tsx`) — are wired into `AdminLayout.tsx`'s nav (gated `isAdmin`) and `App.tsx`'s routes (gated `requiredRole="admin"`). `VelorioManagement.tsx` gets one new `Select` above the existing Textarea: picking a template copies its `mensagem` into `formData.mensagem_homenagem` (still freely editable afterward); picking "+ Adicionar nova mensagem" opens the CRUD page in a new tab, leaving the velório dialog untouched. No changes to `VelorioFormData`'s shape, `Velorio` type, or `VelorioViewing.tsx` — `mensagem_homenagem` stays a plain string regardless of where its value came from.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query, `@supabase/supabase-js` v2, shadcn/ui (`Select`, `Dialog`, `Card`, `Textarea`), Tailwind, `lucide-react`, `react-router-dom` v6.

## Global Constraints

- This repo has no test runner (no Jest/Vitest, no `*.test.*` files) — do not introduce one. Verification is `npx tsc --noEmit -p tsconfig.app.json` (bare `npx tsc --noEmit` at the repo root checks zero files — root `tsconfig.json` is a solution file with `"files": []`), `npm run build`, manual Node one-off scripts against the real Supabase project (service-role key from `.env.camera-status-api`), and manual browser checks.
- The live Supabase project (`mzqthywvdavavviqbolm.supabase.co`) has no DDL-capable RPC (`exec_sql` does not exist) and there is no local Postgres connection string — migration SQL must be applied by hand through the Supabase Dashboard → SQL Editor.
- The 3 real accounts in `profiles` (`admin@velorio.com`, `cpd@serpos.com.br`, `cvsuporte@gmail.com`) are all `role=superadmin` today — none is `operador` or `viewer`. Verifying that `operador` can read-but-not-write the new table requires a **temporary** test profile (created and deleted within Task 1's verification step), using the magic-link technique already used for this project: `supabase.auth.admin.generateLink({type:'magiclink', email})` (service role) → `anonClient.auth.verifyOtp({type:'magiclink', token_hash})` to mint a real session for a role you don't have a password for.
- `homenagens_templates` (this feature, admin-authored reusable message *templates*) is unrelated to the existing visitor tribute wall (`velorio_homenagens` table, `useHomenagens.ts`, `homenagensService.ts`, `MuralHomenagens.tsx`, per-velório messages written by visitors). Do not touch that table, hook, service, or component. Naming in this plan (`useHomenagensTemplates`, `homenagens_templates`) is chosen specifically to avoid colliding with those names.
- No changes to `Velorio`/`VelorioFormData` (`src/hooks/useVelorios.ts`) or `VelorioViewing.tsx` — `mensagem_homenagem` already exists as a plain string field end to end; this feature only changes *how* the admin fills it in.
- Out of scope (per spec): editing/deleting templates from inside the velório form; realtime sync of the templates list across browser tabs; any change to the visitor mural; search/pagination/categories in the templates list; additional Settings sections beyond Banco de Homenagens.

---

### Task 1: Migration — `homenagens_templates` table + RLS

**Files:**
- Create: `supabase/migrations/017_add_homenagens_templates.sql`

**Interfaces:**
- Produces: table `homenagens_templates` (`id`, `titulo`, `mensagem`, `created_at`, `updated_at`), RLS policies (`viewer+` SELECT, `admin+` INSERT/UPDATE/DELETE). Task 2 depends on this table and column names existing in the live database.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/017_add_homenagens_templates.sql`:

```sql
-- ============================================
-- CAMPAX - BANCO DE HOMENAGENS
-- Migration: 017_add_homenagens_templates
-- Description: Mensagens de homenagem reutilizáveis, cadastradas pelo
--   admin e escolhidas via dropdown no cadastro de velório.
-- ============================================

CREATE TABLE homenagens_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo     VARCHAR(255) NOT NULL,
  mensagem   TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE homenagens_templates IS 'Mensagens de homenagem reutilizáveis, cadastradas pelo admin e escolhidas via dropdown no cadastro de velório (diferente do mural velorio_homenagens, onde cada visitante escreve a própria mensagem)';

CREATE TRIGGER update_homenagens_templates_updated_at BEFORE UPDATE ON homenagens_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE homenagens_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Viewer+ pode ler banco de homenagens"
  ON homenagens_templates FOR SELECT TO authenticated
  USING (user_has_role('viewer'));

CREATE POLICY "Admin+ pode criar mensagens no banco de homenagens"
  ON homenagens_templates FOR INSERT TO authenticated
  WITH CHECK (user_has_role('admin'));

CREATE POLICY "Admin+ pode editar mensagens no banco de homenagens"
  ON homenagens_templates FOR UPDATE TO authenticated
  USING (user_has_role('admin'))
  WITH CHECK (user_has_role('admin'));

CREATE POLICY "Admin+ pode excluir mensagens no banco de homenagens"
  ON homenagens_templates FOR DELETE TO authenticated
  USING (user_has_role('admin'));
```

- [ ] **Step 2: Verify the table doesn't exist yet**

```bash
node -e "
require('dotenv').config({ path: '.env.camera-status-api' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
(async () => {
  const { error } = await admin.from('homenagens_templates').select('*').limit(1);
  console.log('error (expected: relation does not exist):', error?.message);
})();
"
```

Expected: an error mentioning the relation doesn't exist — confirms it's safe to apply Step 3.

- [ ] **Step 3: Apply the migration to the live database**

1. Open the Supabase Dashboard for project `mzqthywvdavavviqbolm` → **SQL Editor**.
2. Paste the exact contents of `supabase/migrations/017_add_homenagens_templates.sql` from Step 1.
3. Run it.

Expected: `Success. No rows returned.`

- [ ] **Step 4: Verify the table now exists and basic CRUD works (service-role, bypasses RLS)**

```bash
node -e "
require('dotenv').config({ path: '.env.camera-status-api' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
(async () => {
  const { data: created, error: insertError } = await admin
    .from('homenagens_templates')
    .insert([{ titulo: 'TESTE PLANO', mensagem: 'Mensagem de teste do plano.' }])
    .select()
    .single();
  console.log('insert error:', insertError, 'created:', created);

  const { data: fetched, error: selectError } = await admin
    .from('homenagens_templates')
    .select('*')
    .eq('id', created.id)
    .single();
  console.log('select error:', selectError, 'fetched:', fetched);

  await admin.from('homenagens_templates').delete().eq('id', created.id);
  console.log('CLEANED UP');
})();
"
```

Expected: `insert error: null`, `created` has `titulo: 'TESTE PLANO'`, `select error: null`, `fetched` matches, then `CLEANED UP`.

- [ ] **Step 5: Verify RLS — `operador` can read but not write, `admin` can write**

This creates a **temporary** auth user + profile with `role='operador'`, mints a real session for it via magic link (no password needed), exercises the policies as that role, then deletes everything it created:

```bash
node -e "
require('dotenv').config({ path: '.env.camera-status-api' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

(async () => {
  const email = 'teste-plano-operador-' + Date.now() + '@example.com';

  const { data: userData, error: createUserError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createUserError) throw createUserError;
  const userId = userData.user.id;

  await admin.from('profiles').update({ role: 'operador' }).eq('id', userId);

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError) throw linkError;

  const { data: sessionData, error: otpError } = await anonClient.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  });
  if (otpError) throw otpError;

  const operadorClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: \`Bearer \${sessionData.session.access_token}\` } },
  });

  const { data: readData, error: readError } = await operadorClient.from('homenagens_templates').select('*');
  console.log('operador SELECT error (expected: null):', readError);
  console.log('operador SELECT rows (expected: array, possibly empty):', readData);

  const { data: writeData, error: writeError } = await operadorClient
    .from('homenagens_templates')
    .insert([{ titulo: 'NAO DEVERIA EXISTIR', mensagem: 'x' }])
    .select();
  console.log('operador INSERT error (expected: RLS violation or null data):', writeError, writeData);

  const { data: adminCreated, error: adminInsertError } = await admin
    .from('homenagens_templates')
    .insert([{ titulo: 'TESTE PLANO RLS', mensagem: 'Mensagem de teste RLS.' }])
    .select()
    .single();
  console.log('service-role INSERT error (expected: null):', adminInsertError);

  await admin.from('homenagens_templates').delete().eq('id', adminCreated.id);
  await admin.auth.admin.deleteUser(userId);
  console.log('CLEANED UP');
})();
"
```

Expected: `operador SELECT error: null` with an array (proves `viewer+`/`operador` can read), `operador INSERT` fails (either `writeError` is non-null, or `writeData` is an empty array with no error — Postgres RLS silently returns 0 rows for a blocked `INSERT ... RETURNING` under PostgREST rather than always throwing, so check both), `service-role INSERT error: null`, then `CLEANED UP`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/017_add_homenagens_templates.sql
git commit -m "feat: add homenagens_templates table with role-gated RLS"
```

---

### Task 2: `useHomenagensTemplates.ts` — hook

**Files:**
- Create: `src/hooks/useHomenagensTemplates.ts`

**Interfaces:**
- Consumes: `homenagens_templates` table (Task 1).
- Produces: `HomenagemTemplate { id, titulo, mensagem, created_at, updated_at }`, `HomenagemTemplateFormData { titulo, mensagem }`, and `useHomenagensTemplates()` returning `{ templates, isLoading, error, createTemplate, updateTemplate, deleteTemplate }`. Tasks 4 and 7 depend on these exact names.

- [ ] **Step 1: Create the hook file**

Create `src/hooks/useHomenagensTemplates.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';

export interface HomenagemTemplate {
    id: string;
    titulo: string;
    mensagem: string;
    created_at: string;
    updated_at: string;
}

export interface HomenagemTemplateFormData {
    titulo: string;
    mensagem: string;
}

export function useHomenagensTemplates() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const { data: templates, isLoading, error } = useQuery({
        queryKey: ['homenagens_templates'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('homenagens_templates')
                .select('*')
                .order('titulo', { ascending: true });

            if (error) throw error;
            return data as HomenagemTemplate[];
        },
    });

    const createTemplate = useMutation({
        mutationFn: async (formData: HomenagemTemplateFormData) => {
            const { data, error } = await supabase
                .from('homenagens_templates')
                .insert([formData])
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['homenagens_templates'] });
            toast({
                title: "Mensagem criada",
                description: "Nova mensagem adicionada ao banco de homenagens.",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Erro ao criar mensagem",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const updateTemplate = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: HomenagemTemplateFormData }) => {
            const { data: updated, error } = await supabase
                .from('homenagens_templates')
                .update(data)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return updated;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['homenagens_templates'] });
            toast({
                title: "Mensagem atualizada",
                description: "As alterações foram salvas.",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Erro ao atualizar mensagem",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const deleteTemplate = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('homenagens_templates')
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['homenagens_templates'] });
            toast({
                title: "Mensagem excluída",
                description: "A mensagem foi removida do banco de homenagens.",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Erro ao excluir mensagem",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    return {
        templates: templates ?? [],
        isLoading,
        error,
        createTemplate,
        updateTemplate,
        deleteTemplate,
    };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useHomenagensTemplates.ts
git commit -m "feat: add useHomenagensTemplates hook"
```

---

### Task 3: `SettingsHub.tsx` — Configurações landing page

**Files:**
- Create: `src/pages/SettingsHub.tsx`

**Interfaces:**
- Produces: default-exported `SettingsHub` component. Task 6 routes to it.

- [ ] **Step 1: Create the page**

Create `src/pages/SettingsHub.tsx`:

```tsx
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, MessageSquareHeart, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SettingsHub = () => {
    const navigate = useNavigate();

    const settings = [
        {
            id: 'homenagens',
            title: 'Banco de Homenagens',
            description: 'Mensagens de homenagem reutilizáveis para o cadastro de velórios',
            details: 'Cadastre mensagens-modelo com título e texto. Elas ficam disponíveis como dropdown no cadastro de velório, para preencher a Mensagem de Homenagem sem digitar do zero.',
            icon: MessageSquareHeart,
            color: 'text-pink-600',
            bgColor: 'bg-pink-50 dark:bg-pink-950',
            route: '/admin/configuracoes/homenagens',
        },
    ];

    return (
        <div className="min-h-screen gradient-soft">
            <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            onClick={() => navigate('/admin/dashboard')}
                            className="hover:bg-primary/10"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Voltar
                        </Button>
                        <div>
                            <h1 className="font-heading text-2xl text-foreground">
                                Configurações
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Gerencie as configurações do sistema
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8">
                <div className="max-w-5xl mx-auto space-y-6">
                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {settings.map((setting) => {
                            const Icon = setting.icon;
                            return (
                                <Card
                                    key={setting.id}
                                    className="hover:shadow-lg transition-all duration-300 cursor-pointer group border-2 hover:border-gold/30"
                                    onClick={() => navigate(setting.route)}
                                >
                                    <CardHeader>
                                        <div className="flex items-start justify-between mb-4">
                                            <div className={`p-3 rounded-lg ${setting.bgColor}`}>
                                                <Icon className={`w-6 h-6 ${setting.color}`} />
                                            </div>
                                        </div>
                                        <CardTitle className="font-heading text-xl mb-2 flex items-center justify-between">
                                            <span>{setting.title}</span>
                                            <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-gold group-hover:translate-x-1 transition-all" />
                                        </CardTitle>
                                        <CardDescription className="text-base">
                                            {setting.description}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            {setting.details}
                                        </p>
                                        <Button
                                            variant="outline"
                                            className="w-full mt-4 group-hover:bg-gold/10 group-hover:border-gold transition-colors"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(setting.route);
                                            }}
                                        >
                                            Acessar
                                            <ArrowRight className="w-4 h-4 ml-2" />
                                        </Button>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default SettingsHub;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors (this page isn't routed yet — Task 6 wires it in — so this only confirms the file itself compiles).

- [ ] **Step 3: Commit**

```bash
git add src/pages/SettingsHub.tsx
git commit -m "feat: add SettingsHub page"
```

---

### Task 4: `HomenagensTemplatesManagement.tsx` — CRUD page

**Files:**
- Create: `src/pages/HomenagensTemplatesManagement.tsx`

**Interfaces:**
- Consumes: `useHomenagensTemplates`, `HomenagemTemplate`, `HomenagemTemplateFormData` (Task 2).
- Produces: default-exported `HomenagensTemplatesManagement` component. Task 6 routes to it.

- [ ] **Step 1: Create the page**

Create `src/pages/HomenagensTemplatesManagement.tsx`:

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { AdminLayout } from '@/components/AdminLayout';
import { useHomenagensTemplates, HomenagemTemplate } from '@/hooks/useHomenagensTemplates';
import { useAuth } from '@/hooks/useAuth';
import { MessageSquareHeart, Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const HomenagensTemplatesManagement = () => {
  const { templates, isLoading, createTemplate, updateTemplate, deleteTemplate } = useHomenagensTemplates();
  const { isAdmin } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<HomenagemTemplate | null>(null);
  const [formData, setFormData] = useState({ titulo: '', mensagem: '' });

  const openCreateDialog = () => {
    setEditingTemplate(null);
    setFormData({ titulo: '', mensagem: '' });
    setIsDialogOpen(true);
  };

  const openEditDialog = (template: HomenagemTemplate) => {
    setEditingTemplate(template);
    setFormData({ titulo: template.titulo, mensagem: template.mensagem });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.titulo || !formData.mensagem) return;

    if (editingTemplate) {
      await updateTemplate.mutateAsync({ id: editingTemplate.id, data: formData });
    } else {
      await createTemplate.mutateAsync(formData);
    }

    setIsDialogOpen(false);
    setFormData({ titulo: '', mensagem: '' });
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta mensagem?')) {
      await deleteTemplate.mutateAsync(id);
    }
  };

  return (
    <AdminLayout activeSection="configuracoes">
      <header className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-foreground mb-2">Banco de Homenagens</h1>
          <p className="text-muted-foreground">Mensagens de homenagem reutilizáveis no cadastro de velório</p>
        </div>
        {isAdmin && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="gold" onClick={openCreateDialog}>
                <Plus className="w-4 h-4 mr-2" />
                Nova Mensagem
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-heading">
                  {editingTemplate ? 'Editar Mensagem' : 'Nova Mensagem'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Título</label>
                  <Input
                    value={formData.titulo}
                    onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                    placeholder="Ex: Mensagem para idosos"
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Mensagem</label>
                  <Textarea
                    value={formData.mensagem}
                    onChange={(e) => setFormData({ ...formData, mensagem: e.target.value })}
                    placeholder="Texto completo da homenagem..."
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  <X className="w-4 h-4 mr-2" />
                  Cancelar
                </Button>
                <Button variant="gold" onClick={handleSave}>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </header>

      <div className="grid gap-4">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando mensagens...</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquareHeart className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Nenhuma mensagem cadastrada</p>
          </div>
        ) : (
          templates.map((template) => (
            <Card key={template.id} className="shadow-soft hover:shadow-elegant transition-shadow min-w-0">
              <CardContent className="p-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground">{template.titulo}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">{template.mensagem}</p>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(template)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(template.id)}
                      className="hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </AdminLayout>
  );
};

export default HomenagensTemplatesManagement;
```

Note: `activeSection="configuracoes"` will not type-check until Task 5 adds `'configuracoes'` to `AdminLayout`'s `ActiveSection` union — that's expected and resolved by the end of Task 5. If executing tasks out of order, re-run the type-check in Task 5 to confirm both files agree.

- [ ] **Step 2: Commit**

```bash
git add src/pages/HomenagensTemplatesManagement.tsx
git commit -m "feat: add HomenagensTemplatesManagement CRUD page"
```

Skip a standalone type-check here: `activeSection="configuracoes"` isn't a valid `ActiveSection` value until Task 5 adds it, so `npx tsc --noEmit -p tsconfig.app.json` would fail for a reason unrelated to this task's own code. Task 5 Step 3 runs the type-check once both files agree.

---

### Task 5: `AdminLayout.tsx` — Configurações nav item

**Files:**
- Modify: `src/components/AdminLayout.tsx:1-22, 26, 76-82`

**Interfaces:**
- Consumes: `useAuth().isAdmin` (already exists, `src/hooks/useAuth.ts:83`).
- Produces: `ActiveSection` including `'configuracoes'`. Task 4's `activeSection="configuracoes"` and Task 6's routes both depend on this.

- [ ] **Step 1: Add the `Settings` icon import and the `'configuracoes'` section**

Find:

```tsx
import {
    LayoutDashboard,
    Building2,
    Camera,
    Calendar,
    LogOut,
    FileText,
    UserCog,
    Menu,
} from 'lucide-react';

type ActiveSection = 'dashboard' | 'salas' | 'velorios' | 'cameras' | 'relatorios' | 'usuarios';
```

Replace with:

```tsx
import {
    LayoutDashboard,
    Building2,
    Camera,
    Calendar,
    LogOut,
    FileText,
    UserCog,
    Settings,
    Menu,
} from 'lucide-react';

type ActiveSection = 'dashboard' | 'salas' | 'velorios' | 'cameras' | 'relatorios' | 'usuarios' | 'configuracoes';
```

- [ ] **Step 2: Destructure `isAdmin` and add the gated nav item**

Find:

```tsx
    const navigate = useNavigate();
    const { signOut, isSuperadmin } = useAuth();
```

Replace with:

```tsx
    const navigate = useNavigate();
    const { signOut, isSuperadmin, isAdmin } = useAuth();
```

Find:

```tsx
                {navItem('relatorios',  'Relatórios', '/admin/relatorios',  FileText)}
                {isSuperadmin && navItem('usuarios', 'Usuários', '/admin/usuarios', UserCog)}
```

Replace with:

```tsx
                {navItem('relatorios',  'Relatórios', '/admin/relatorios',  FileText)}
                {isAdmin && navItem('configuracoes', 'Configurações', '/admin/configuracoes', Settings)}
                {isSuperadmin && navItem('usuarios', 'Usuários', '/admin/usuarios', UserCog)}
```

- [ ] **Step 3: Type-check (validates Task 4's `activeSection="configuracoes"` too)**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/AdminLayout.tsx
git commit -m "feat: add Configurações nav item gated by isAdmin"
```

---

### Task 6: `App.tsx` — routes

**Files:**
- Modify: `src/App.tsx:1-52`

**Interfaces:**
- Consumes: `SettingsHub` (Task 3), `HomenagensTemplatesManagement` (Task 4).
- Produces: routes `/admin/configuracoes` and `/admin/configuracoes/homenagens`, both `requiredRole="admin"`.

- [ ] **Step 1: Import the two new pages**

Find:

```tsx
import ReportsHub from "./pages/ReportsHub";
import AccessReports from "./pages/AccessReports";
import VelorioAudit from "./pages/VelorioAudit";
import VisitantesReport from "./pages/VisitantesReport";
import UserManagement from "./pages/UserManagement";
import NotFound from "./pages/NotFound";
```

Replace with:

```tsx
import ReportsHub from "./pages/ReportsHub";
import AccessReports from "./pages/AccessReports";
import VelorioAudit from "./pages/VelorioAudit";
import VisitantesReport from "./pages/VisitantesReport";
import UserManagement from "./pages/UserManagement";
import SettingsHub from "./pages/SettingsHub";
import HomenagensTemplatesManagement from "./pages/HomenagensTemplatesManagement";
import NotFound from "./pages/NotFound";
```

- [ ] **Step 2: Add the two routes, between Reports and User management**

Find:

```tsx
          {/* Reports Routes */}
          <Route path="/admin/relatorios" element={<ProtectedRoute><ReportsHub /></ProtectedRoute>} />
          <Route path="/admin/relatorios/acessos" element={<ProtectedRoute><AccessReports /></ProtectedRoute>} />
          <Route path="/admin/relatorios/auditoria" element={<ProtectedRoute><VelorioAudit /></ProtectedRoute>} />
          <Route path="/admin/relatorios/visitantes" element={<ProtectedRoute><VisitantesReport /></ProtectedRoute>} />

          {/* User management (superadmin only) */}
          <Route path="/admin/usuarios" element={<ProtectedRoute requiredRole="superadmin"><UserManagement /></ProtectedRoute>} />
```

Replace with:

```tsx
          {/* Reports Routes */}
          <Route path="/admin/relatorios" element={<ProtectedRoute><ReportsHub /></ProtectedRoute>} />
          <Route path="/admin/relatorios/acessos" element={<ProtectedRoute><AccessReports /></ProtectedRoute>} />
          <Route path="/admin/relatorios/auditoria" element={<ProtectedRoute><VelorioAudit /></ProtectedRoute>} />
          <Route path="/admin/relatorios/visitantes" element={<ProtectedRoute><VisitantesReport /></ProtectedRoute>} />

          {/* Settings (admin+ only) */}
          <Route path="/admin/configuracoes" element={<ProtectedRoute requiredRole="admin"><SettingsHub /></ProtectedRoute>} />
          <Route path="/admin/configuracoes/homenagens" element={<ProtectedRoute requiredRole="admin"><HomenagensTemplatesManagement /></ProtectedRoute>} />

          {/* User management (superadmin only) */}
          <Route path="/admin/usuarios" element={<ProtectedRoute requiredRole="superadmin"><UserManagement /></ProtectedRoute>} />
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build finishes with `✓ built in ...s`, no errors.

- [ ] **Step 5: Manual browser verification — routing and role gating**

1. Run `npm run dev`, log in as one of the real accounts (all are `superadmin`, which is `admin+`).
2. Confirm "Configurações" appears in the sidebar nav, between "Relatórios" and "Usuários".
3. Click it: confirm `/admin/configuracoes` shows the "Banco de Homenagens" card.
4. Click the card: confirm `/admin/configuracoes/homenagens` loads the (currently empty) CRUD page with a "Nova Mensagem" button.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add /admin/configuracoes routes"
```

---

### Task 7: `HomenagensTemplatesManagement.tsx` end-to-end CRUD verification

**Files:** none (manual verification only — the page was built in Task 4, wired to routes in Task 6)

**Interfaces:** none — validates Tasks 2, 4, and 6 together.

- [ ] **Step 1: Create, edit, and delete a template through the UI**

1. On `/admin/configuracoes/homenagens`, click "Nova Mensagem", fill Título "Mensagem para idosos" and Mensagem "Uma vida dedicada à família e ao trabalho, deixando um legado de amor.", save.
2. Confirm the toast "Mensagem criada" appears and the card shows up in the list with the title and a truncated preview of the message.
3. Click the pencil icon, change the título to "Mensagem para idosos (editado)", save. Confirm the toast "Mensagem atualizada" and the updated title in the list.
4. Click the trash icon, confirm the browser `confirm()` dialog, confirm. Confirm the toast "Mensagem excluída" and the card disappears.

- [ ] **Step 2: Recreate two templates for Task 8's manual test**

Create two templates that Task 8 will use from the velório form:
- Título "Mensagem para idosos", Mensagem "Uma vida dedicada à família e ao trabalho, deixando um legado de amor."
- Título "Mensagem para jovens", Mensagem "Uma vida interrompida cedo demais, mas cheia de sonhos e alegria."

Leave both in place for Task 8.

---

### Task 8: `VelorioManagement.tsx` — dropdown integration

**Files:**
- Modify: `src/pages/VelorioManagement.tsx:1-17, 234-236, 584-591`

**Interfaces:**
- Consumes: `useHomenagensTemplates`, `HomenagemTemplate` (Task 2).

- [ ] **Step 1: Import `useHomenagensTemplates` and the `Select` components**

Find:

```tsx
import { useVelorios, getVelorioStatus } from '@/hooks/useVelorios';
import { useSalasVelorio } from '@/hooks/useSalasVelorio';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useHomenagens, useDeleteHomenagem } from '@/hooks/useHomenagens';
import { usePresenceMultiple } from '@/hooks/usePresenceMultiple';
import { useVisitantes } from '@/hooks/useVisitantes';
import { exportVisitantesToCSV, downloadCSV } from '@/services/visitantesService';
import { uploadFotoFalecido } from '@/services/storageService';
```

Replace with:

```tsx
import { useVelorios, getVelorioStatus } from '@/hooks/useVelorios';
import { useSalasVelorio } from '@/hooks/useSalasVelorio';
import { useHomenagensTemplates } from '@/hooks/useHomenagensTemplates';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useHomenagens, useDeleteHomenagem } from '@/hooks/useHomenagens';
import { usePresenceMultiple } from '@/hooks/usePresenceMultiple';
import { useVisitantes } from '@/hooks/useVisitantes';
import { exportVisitantesToCSV, downloadCSV } from '@/services/visitantesService';
import { uploadFotoFalecido } from '@/services/storageService';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
```

(`useHomenagens`/`useDeleteHomenagem` on the line above are the **existing** visitor-mural hooks used elsewhere in this same file — leave them untouched; `useHomenagensTemplates` is the new, unrelated hook from Task 2.)

- [ ] **Step 2: Call the hook inside the component**

Find:

```tsx
const VelorioManagement = () => {
  const { toast } = useToast();
  const { isOperador, isAdmin } = useAuth();
  const { velorios, isLoading: veloriosLoading, createVelorio, updateVelorio, deleteVelorio } = useVelorios();
  const { salas, isLoading: salasLoading } = useSalasVelorio();
```

Replace with:

```tsx
const VelorioManagement = () => {
  const { toast } = useToast();
  const { isOperador, isAdmin } = useAuth();
  const { velorios, isLoading: veloriosLoading, createVelorio, updateVelorio, deleteVelorio } = useVelorios();
  const { salas, isLoading: salasLoading } = useSalasVelorio();
  const { templates: homenagensTemplates } = useHomenagensTemplates();
```

- [ ] **Step 3: Add the `Select` above the existing "Mensagem de Homenagem" `Textarea`**

Find:

```tsx
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Mensagem de Homenagem</label>
                      <Textarea
                        value={formData.mensagem_homenagem}
                        onChange={(e) => setFormData({ ...formData, mensagem_homenagem: e.target.value })}
                        placeholder="Um trecho especial sobre a vida do(a) falecido(a)..."
                      />
                    </div>
```

Replace with:

```tsx
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">
                        Escolher do banco de homenagens
                      </label>
                      <Select
                        value=""
                        onValueChange={(value) => {
                          if (value === '__nova__') {
                            window.open('/admin/configuracoes/homenagens', '_blank');
                            return;
                          }
                          const template = homenagensTemplates.find((t) => t.id === value);
                          if (template) {
                            setFormData({ ...formData, mensagem_homenagem: template.mensagem });
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar uma mensagem pronta (opcional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {homenagensTemplates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.titulo}</SelectItem>
                          ))}
                          <SelectItem value="__nova__">+ Adicionar nova mensagem</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Mensagem de Homenagem</label>
                      <Textarea
                        value={formData.mensagem_homenagem}
                        onChange={(e) => setFormData({ ...formData, mensagem_homenagem: e.target.value })}
                        placeholder="Um trecho especial sobre a vida do(a) falecido(a)..."
                      />
                    </div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build finishes with `✓ built in ...s`, no errors.

- [ ] **Step 6: Manual browser verification**

Using the two templates created in Task 7 Step 2:

1. Open `/admin/velorios`, click "Novo Velório".
2. Confirm the "Escolher do banco de homenagens" dropdown lists both "Mensagem para idosos" and "Mensagem para jovens", plus "+ Adicionar nova mensagem" at the bottom.
3. Select "Mensagem para idosos": confirm the Textarea below is immediately filled with its full text.
4. Edit the Textarea's text (append a sentence): confirm the edit sticks and the dropdown itself doesn't revert or fight the edit.
5. Fill in the required fields (nome, datas, sala) and save: confirm the edited (not the original template) text is what's stored — reopen the velório for editing and confirm the Textarea shows your edited version.
6. Open a new "Novo Velório" dialog again, click "+ Adicionar nova mensagem" in the dropdown: confirm it opens `/admin/configuracoes/homenagens` in a **new tab**, and that the original tab's dialog is still open with any previously-entered fields intact (nothing was reset or closed).
7. Create a velório leaving the dropdown untouched and typing the message by hand (existing behavior): confirm it still saves correctly.

- [ ] **Step 7: Commit**

```bash
git add src/pages/VelorioManagement.tsx
git commit -m "feat: add banco de homenagens dropdown to velório form"
```

---

### Task 9: Clean up manual test data

**Files:** none

**Interfaces:** none.

- [ ] **Step 1: Delete the manual-test velórios and templates**

Via the admin UI:
- `/admin/velorios`: delete the test velório(s) created in Task 8 Step 6.
- `/admin/configuracoes/homenagens`: delete "Mensagem para idosos" and "Mensagem para jovens" (or keep them if you'd like real starter content — confirm with the user before deleting anything they might want to keep).

- [ ] **Step 2: Full type-check and build, one last time**

Run: `npx tsc --noEmit -p tsconfig.app.json && npm run build`
Expected: no errors, `dist/` regenerated.
