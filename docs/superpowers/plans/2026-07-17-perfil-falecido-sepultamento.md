# Perfil do Falecido, Sepultamento e Localização Google — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add memorial fields to a velório (birth/death dates, a single admin-authored tribute message, a photo) and burial fields (date, cemetery name, Google Maps link), plus a Google Maps link for the velório room, and surface all of it — when filled in — on the public viewing page.

**Architecture:** One migration adds 7 nullable columns to `velorios`, 1 nullable column to `sala_velorio`, and a public Storage bucket (`falecido-fotos`) with role-gated write policies. `useVelorios.ts` / `useSalasVelorio.ts` get the new fields added to their types (no query-shape changes beyond one extra selected column). `VelorioManagement.tsx` gets two new form sections ("Sobre o falecido", "Sepultamento") plus a file input wired to a small upload helper (`storageService.ts`) that runs *after* the velório row exists (create or update), since the Storage path is keyed by `velorio.id`. `SalaManagement.tsx` gets one new text input. `VelorioViewing.tsx` renders everything conditionally — nothing shows for fields left blank.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query, `@supabase/supabase-js` v2, shadcn/ui, Tailwind, `lucide-react`.

## Global Constraints

- This repo has no test runner (no Jest/Vitest, no `*.test.*` files) — do not introduce one. Verification is `npx tsc --noEmit`, `npm run build`, manual Node one-off scripts against the real Supabase project (service-role key from `.env.camera-status-api`), and manual browser checks.
- The live Supabase project (`mzqthywvdavavviqbolm.supabase.co`) has no DDL-capable RPC (`exec_sql` does not exist) and there is no local Postgres connection string — migration SQL must be applied by hand through the Supabase Dashboard → SQL Editor.
- All 7 new `velorios` columns and the 1 new `sala_velorio` column are nullable, free-text/date, with no format validation and no cross-field date validation (e.g. falecimento vs. início) — matches every other optional/free-text field already in this codebase.
- No RLS policy changes on `velorios` or `sala_velorio`: both tables already use `SELECT *`-style public read and full authenticated write (`011_update_rls.sql` / `013_add_sala_velorio.sql`), so new columns are exposed automatically.
- Migration numbering: `supabase/migrations/015_add_falecido_sepultamento.sql` claims `015`. A separate, already-approved-but-unimplemented plan (`docs/superpowers/plans/2026-07-16-whatsapp-responsavel-sala.md`) also targets `015_add_sala_velorio_whatsapp.sql`. Whichever of the two is implemented first keeps `015`; if the other is implemented afterward, renumber it to `016` at that time.
- `mensagem_homenagem` (this feature) is unrelated to the existing visitor tribute wall (`velorio_homenagens` table, `MuralHomenagens.tsx`) — do not touch that table or component.
- Out of scope (per spec): Google Maps URL format validation, image resizing/optimization on upload, embedded map (iframe), cemetery as a reusable entity, deletion of old photos from Storage when replaced (the fixed upload path + `upsert: true` already prevents orphan accumulation).

---

### Task 1: Migration — new columns + Storage bucket

**Files:**
- Create: `supabase/migrations/015_add_falecido_sepultamento.sql`

**Interfaces:**
- Produces: columns `velorios.data_nascimento`, `velorios.data_falecimento`, `velorios.mensagem_homenagem`, `velorios.foto_falecido`, `velorios.data_sepultamento`, `velorios.local_sepultamento`, `velorios.google_maps_url_sepultamento` (all nullable); column `sala_velorio.google_maps_url` (nullable); Storage bucket `falecido-fotos` (public read, `operador+` write). Tasks 2–7 all depend on these existing in the live database.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/015_add_falecido_sepultamento.sql`:

```sql
-- ============================================
-- CAMPAX - PERFIL DO FALECIDO E SEPULTAMENTO
-- Migration: 015_add_falecido_sepultamento
-- Description: Campos memoriais (nascimento, falecimento, foto, mensagem de
--   homenagem), dados de sepultamento e localização Google da sala.
-- ============================================

ALTER TABLE velorios
  ADD COLUMN data_nascimento DATE,
  ADD COLUMN data_falecimento DATE,
  ADD COLUMN mensagem_homenagem TEXT,
  ADD COLUMN foto_falecido TEXT,
  ADD COLUMN data_sepultamento DATE,
  ADD COLUMN local_sepultamento VARCHAR(255),
  ADD COLUMN google_maps_url_sepultamento TEXT;

COMMENT ON COLUMN velorios.mensagem_homenagem IS 'Texto único de homenagem cadastrado pelo admin/família (diferente do mural velorio_homenagens, onde cada visitante deixa sua própria mensagem)';
COMMENT ON COLUMN velorios.foto_falecido IS 'URL pública da foto no bucket de Storage falecido-fotos';
COMMENT ON COLUMN velorios.local_sepultamento IS 'Nome do cemitério/local de sepultamento, texto livre';

ALTER TABLE sala_velorio
  ADD COLUMN google_maps_url TEXT;

COMMENT ON COLUMN sala_velorio.google_maps_url IS 'Link do Google Maps para a sala de velório';

-- ============================================
-- STORAGE: bucket de fotos do falecido
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('falecido-fotos', 'falecido-fotos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public pode ver fotos de falecidos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'falecido-fotos');

CREATE POLICY "Operador+ pode enviar fotos de falecidos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'falecido-fotos' AND user_has_role('operador'));

CREATE POLICY "Operador+ pode atualizar fotos de falecidos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'falecido-fotos' AND user_has_role('operador'))
  WITH CHECK (bucket_id = 'falecido-fotos' AND user_has_role('operador'));

CREATE POLICY "Operador+ pode remover fotos de falecidos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'falecido-fotos' AND user_has_role('operador'));
```

- [ ] **Step 2: Verify none of this exists yet**

Run:

```bash
node -e "
require('dotenv').config({ path: '.env.camera-status-api' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
(async () => {
  const { data: v } = await admin.from('velorios').select('*').limit(1);
  console.log('velorios columns:', v && v[0] ? Object.keys(v[0]) : v);
  const { data: s } = await admin.from('sala_velorio').select('*').limit(1);
  console.log('sala_velorio columns:', s && s[0] ? Object.keys(s[0]) : s);
  const { data: bucket, error } = await admin.storage.getBucket('falecido-fotos');
  console.log('bucket:', bucket, 'error:', error?.message);
})();
"
```

Expected: neither column list includes the new fields, and `bucket` is `null` with an error like `Bucket not found` (confirms the migration hasn't run — safe to apply Step 3).

- [ ] **Step 3: Apply the migration to the live database**

1. Open the Supabase Dashboard for project `mzqthywvdavavviqbolm` → **SQL Editor**.
2. Paste the exact contents of `supabase/migrations/015_add_falecido_sepultamento.sql` from Step 1.
3. Run it.

Expected: `Success. No rows returned.`

- [ ] **Step 4: Verify the migration applied correctly**

Run the same command from Step 2.

Expected: `velorios columns` now includes `data_nascimento`, `data_falecimento`, `mensagem_homenagem`, `foto_falecido`, `data_sepultamento`, `local_sepultamento`, `google_maps_url_sepultamento`; `sala_velorio columns` includes `google_maps_url`; `bucket` is a non-null object with `public: true` and `error` is `undefined`.

- [ ] **Step 5: Manually confirm the 4 Storage policies exist**

In the Dashboard → **Storage** → **Policies**, filter to bucket `falecido-fotos`. Confirm 4 policies are listed: "Public pode ver fotos de falecidos" (SELECT), "Operador+ pode enviar fotos de falecidos" (INSERT), "Operador+ pode atualizar fotos de falecidos" (UPDATE), "Operador+ pode remover fotos de falecidos" (DELETE). (No `exec_sql`-style RPC exists on this project to query `pg_policies` from Node, so this check is done in the Dashboard UI.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/015_add_falecido_sepultamento.sql
git commit -m "feat: add falecido/sepultamento columns and falecido-fotos storage bucket"
```

---

### Task 2: `storageService.ts` — photo upload helper

**Files:**
- Create: `src/services/storageService.ts`

**Interfaces:**
- Consumes: Storage bucket `falecido-fotos` (Task 1).
- Produces: `uploadFotoFalecido(velorioId: string, file: File): Promise<string>`. Task 6 depends on this exact name and signature.

- [ ] **Step 1: Create the service file**

Create `src/services/storageService.ts`:

```ts
import { supabase } from '@/integrations/supabase/client';

export async function uploadFotoFalecido(velorioId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${velorioId}/foto.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('falecido-fotos')
    .upload(path, file, { upsert: true });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('falecido-fotos').getPublicUrl(path);
  return data.publicUrl;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification — bucket round-trip with the real Storage config**

This mimics what `uploadFotoFalecido` does, using the service-role key directly (Node has no `File`, so a `Buffer` stands in for the upload body — the Storage API accepts both):

```bash
node -e "
require('dotenv').config({ path: '.env.camera-status-api' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
(async () => {
  const path = 'teste-plano-storage/foto.png';
  const dummy = Buffer.from('fake-image-bytes');
  const { error: uploadError } = await admin.storage.from('falecido-fotos').upload(path, dummy, { upsert: true, contentType: 'image/png' });
  console.log('upload error:', uploadError);

  const { data: pub } = admin.storage.from('falecido-fotos').getPublicUrl(path);
  console.log('public url:', pub.publicUrl);

  const res = await fetch(pub.publicUrl);
  console.log('fetch status:', res.status);

  await admin.storage.from('falecido-fotos').remove([path]);
  console.log('cleaned up');
})();
"
```

Expected: `upload error: null`, a printed public URL, `fetch status: 200`, and `cleaned up` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/storageService.ts
git commit -m "feat: add uploadFotoFalecido storage helper"
```

---

### Task 3: `useVelorios.ts` — types and query

**Files:**
- Modify: `src/hooks/useVelorios.ts:7-73`

**Interfaces:**
- Consumes: columns from Task 1.
- Produces: `Velorio.data_nascimento` / `data_falecimento` / `mensagem_homenagem` / `foto_falecido` / `data_sepultamento` / `local_sepultamento` / `google_maps_url_sepultamento` (all `string | null | undefined`); `Velorio.sala_velorio.google_maps_url: string | null | undefined`; `VelorioFormData.data_nascimento` / `data_falecimento` / `mensagem_homenagem` / `foto_falecido` / `data_sepultamento` / `local_sepultamento` / `google_maps_url_sepultamento` (all `string | undefined`, optional). Tasks 6 and 7 depend on these exact field names.

- [ ] **Step 1: Add the 7 fields to the `Velorio` interface, plus `google_maps_url` to its nested `sala_velorio`**

Find:

```typescript
export interface Velorio {
    id: string;
    nome_falecido: string;
    data_inicio: string;
    data_fim: string;
    token_acesso: string;
    sala_velorio_id: string;
    status: VelorioStatus;
    responsavel_velorio_nome?: string | null;
    contato_whatsapp_responsavel?: string | null;
    created_at: string;
    updated_at: string;
    sala_velorio?: {
        id: string;
        nome_sala_velorio: string;
        endereco?: string | null;
        bairro?: string | null;
        cidade?: string | null;
        estado?: string | null;
        cep?: string | null;
        sala_velorio_cameras?: {
```

Replace with:

```typescript
export interface Velorio {
    id: string;
    nome_falecido: string;
    data_inicio: string;
    data_fim: string;
    token_acesso: string;
    sala_velorio_id: string;
    status: VelorioStatus;
    responsavel_velorio_nome?: string | null;
    contato_whatsapp_responsavel?: string | null;
    data_nascimento?: string | null;
    data_falecimento?: string | null;
    mensagem_homenagem?: string | null;
    foto_falecido?: string | null;
    data_sepultamento?: string | null;
    local_sepultamento?: string | null;
    google_maps_url_sepultamento?: string | null;
    created_at: string;
    updated_at: string;
    sala_velorio?: {
        id: string;
        nome_sala_velorio: string;
        endereco?: string | null;
        bairro?: string | null;
        cidade?: string | null;
        estado?: string | null;
        cep?: string | null;
        google_maps_url?: string | null;
        sala_velorio_cameras?: {
```

- [ ] **Step 2: Add the 7 fields to `VelorioFormData`**

Find:

```typescript
export interface VelorioFormData {
    nome_falecido: string;
    data_inicio: string;
    data_fim: string;
    sala_velorio_id: string;
    status?: VelorioStatus;
    responsavel_velorio_nome?: string;
    contato_whatsapp_responsavel?: string;
}
```

Replace with:

```typescript
export interface VelorioFormData {
    nome_falecido: string;
    data_inicio: string;
    data_fim: string;
    sala_velorio_id: string;
    status?: VelorioStatus;
    responsavel_velorio_nome?: string;
    contato_whatsapp_responsavel?: string;
    data_nascimento?: string;
    data_falecimento?: string;
    mensagem_homenagem?: string;
    foto_falecido?: string;
    data_sepultamento?: string;
    local_sepultamento?: string;
    google_maps_url_sepultamento?: string;
}
```

- [ ] **Step 3: Add `google_maps_url` to `VELORIO_SELECT`'s nested `sala_velorio` block**

Find:

```typescript
const VELORIO_SELECT = `
  *,
  sala_velorio (
    id,
    nome_sala_velorio,
    endereco,
    bairro,
    cidade,
    estado,
    cep,
    sala_velorio_cameras (
```

Replace with:

```typescript
const VELORIO_SELECT = `
  *,
  sala_velorio (
    id,
    nome_sala_velorio,
    endereco,
    bairro,
    cidade,
    estado,
    cep,
    google_maps_url,
    sala_velorio_cameras (
```

(`*` on the outer `velorios` select already picks up the 7 new top-level columns — no other change needed there.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification — confirm the nested select returns the new columns**

```bash
node -e "
require('dotenv').config({ path: '.env.camera-status-api' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
(async () => {
  const { data: sala } = await admin
    .from('sala_velorio')
    .insert([{ nome_sala_velorio: 'TESTE PLANO PERFIL FALECIDO', google_maps_url: 'https://maps.google.com/?q=teste' }])
    .select()
    .single();

  const { data: velorio } = await admin
    .from('velorios')
    .insert([{
      nome_falecido: 'Teste Plano',
      data_inicio: new Date().toISOString(),
      data_fim: new Date(Date.now() + 3600000).toISOString(),
      token_acesso: 'TST' + Date.now().toString().slice(-3),
      sala_velorio_id: sala.id,
      status: 'Agendado',
      data_nascimento: '1950-03-12',
      data_falecimento: '2026-07-15',
      mensagem_homenagem: 'Uma vida de exemplo.',
      data_sepultamento: '2026-07-16',
      local_sepultamento: 'Cemitério Jardim da Saudade',
      google_maps_url_sepultamento: 'https://maps.google.com/?q=cemiterio',
    }])
    .select()
    .single();

  const select = \`*, sala_velorio ( id, nome_sala_velorio, google_maps_url )\`;
  const { data: fetched, error } = await admin.from('velorios').select(select).eq('id', velorio.id).single();
  console.log('fetched:', fetched, error);

  await admin.from('velorios').delete().eq('id', velorio.id);
  await admin.from('sala_velorio').delete().eq('id', sala.id);
  console.log('CLEANED UP');
})();
"
```

Expected: `fetched` includes all the inserted fields (`data_nascimento: '1950-03-12'`, etc.) plus `sala_velorio.google_maps_url: 'https://maps.google.com/?q=teste'`, `error: null`, followed by `CLEANED UP`.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useVelorios.ts
git commit -m "feat: type falecido and sepultamento fields in useVelorios"
```

---

### Task 4: `useSalasVelorio.ts` — types

**Files:**
- Modify: `src/hooks/useSalasVelorio.ts:5-38`

**Interfaces:**
- Consumes: `sala_velorio.google_maps_url` column (Task 1).
- Produces: `SalaVelorio.google_maps_url: string | null`, `SalaVelorioFormData.google_maps_url?: string | null`. Task 5 depends on both.

- [ ] **Step 1: Add the field to `SalaVelorio`**

Find:

```typescript
    responsavel_sala_velorio: string | null;
    created_at: string;
    updated_at: string;
    sala_velorio_cameras?: {
```

Replace with:

```typescript
    responsavel_sala_velorio: string | null;
    google_maps_url: string | null;
    created_at: string;
    updated_at: string;
    sala_velorio_cameras?: {
```

- [ ] **Step 2: Add the field to `SalaVelorioFormData`**

Find:

```typescript
    responsavel_sala_velorio?: string | null;
    camera_ids?: string[];
```

Replace with:

```typescript
    responsavel_sala_velorio?: string | null;
    google_maps_url?: string | null;
    camera_ids?: string[];
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (the hook does `select('*')` and spreads the whole form object into `insert`/`update`, so no other change is needed in this file).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSalasVelorio.ts
git commit -m "feat: type google_maps_url in useSalasVelorio"
```

---

### Task 5: `SalaManagement.tsx` — Google Maps link field

**Files:**
- Modify: `src/pages/SalaManagement.tsx`

**Interfaces:**
- Consumes: `SalaVelorio.google_maps_url` / `SalaVelorioFormData.google_maps_url` (Task 4).

- [ ] **Step 1: Add the field to `SalaFormData` and `emptyForm`**

Find:

```typescript
interface SalaFormData {
  nome_sala_velorio: string;
  endereco: string;
  bairro: string;
  cep: string;
  cidade: string;
  estado: string;
  responsavel_sala_velorio: string;
  camera_ids: string[];
}

const emptyForm: SalaFormData = {
  nome_sala_velorio: '',
  endereco: '',
  bairro: '',
  cep: '',
  cidade: '',
  estado: '',
  responsavel_sala_velorio: '',
  camera_ids: [],
};
```

Replace with:

```typescript
interface SalaFormData {
  nome_sala_velorio: string;
  endereco: string;
  bairro: string;
  cep: string;
  cidade: string;
  estado: string;
  responsavel_sala_velorio: string;
  google_maps_url: string;
  camera_ids: string[];
}

const emptyForm: SalaFormData = {
  nome_sala_velorio: '',
  endereco: '',
  bairro: '',
  cep: '',
  cidade: '',
  estado: '',
  responsavel_sala_velorio: '',
  google_maps_url: '',
  camera_ids: [],
};
```

- [ ] **Step 2: Prefill the field when editing a sala**

Find:

```typescript
      responsavel_sala_velorio: sala.responsavel_sala_velorio ?? '',
      camera_ids: sala.sala_velorio_cameras?.map((sc) => sc.camera_id) || [],
```

Replace with:

```typescript
      responsavel_sala_velorio: sala.responsavel_sala_velorio ?? '',
      google_maps_url: sala.google_maps_url ?? '',
      camera_ids: sala.sala_velorio_cameras?.map((sc) => sc.camera_id) || [],
```

- [ ] **Step 3: Add the form input, after the Cidade/Estado row and before Responsável**

Find:

```tsx
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Responsável</label>
                  <Input
                    value={formData.responsavel_sala_velorio}
                    onChange={(e) => setFormData({ ...formData, responsavel_sala_velorio: e.target.value })}
                    placeholder="Nome do responsável"
                  />
                </div>
```

Replace with:

```tsx
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Link do Google Maps</label>
                  <Input
                    value={formData.google_maps_url}
                    onChange={(e) => setFormData({ ...formData, google_maps_url: e.target.value })}
                    placeholder="https://maps.google.com/..."
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Responsável</label>
                  <Input
                    value={formData.responsavel_sala_velorio}
                    onChange={(e) => setFormData({ ...formData, responsavel_sala_velorio: e.target.value })}
                    placeholder="Nome do responsável"
                  />
                </div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual browser verification**

1. Run `npm run dev`, open `/admin/salas`.
2. Create or edit a sala, fill "Link do Google Maps" with `https://maps.google.com/?q=teste`, save.
3. Reopen the edit dialog for that sala: confirm the field is prefilled with the saved URL.

- [ ] **Step 6: Commit**

```bash
git add src/pages/SalaManagement.tsx
git commit -m "feat: add Google Maps link field to sala de velório form"
```

---

### Task 6: `VelorioManagement.tsx` — falecido/sepultamento form + photo upload

**Files:**
- Modify: `src/pages/VelorioManagement.tsx`

**Interfaces:**
- Consumes: `uploadFotoFalecido` (Task 2); `VelorioFormData` fields from the hook (Task 3).

- [ ] **Step 1: Add the `Textarea` and `uploadFotoFalecido` imports**

Find:

```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AdminLayout } from '@/components/AdminLayout';
import { useVelorios, getVelorioStatus } from '@/hooks/useVelorios';
import { useSalasVelorio } from '@/hooks/useSalasVelorio';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useHomenagens, useDeleteHomenagem } from '@/hooks/useHomenagens';
import { usePresenceMultiple } from '@/hooks/usePresenceMultiple';
import { useVisitantes } from '@/hooks/useVisitantes';
import { exportVisitantesToCSV, downloadCSV } from '@/services/visitantesService';
```

Replace with:

```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AdminLayout } from '@/components/AdminLayout';
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

- [ ] **Step 2: Add the 6 new text fields to the local `VelorioFormData` interface**

Find:

```typescript
interface VelorioFormData {
  nome_falecido: string;
  data_inicio: string;
  data_fim: string;
  sala_velorio_id: string;
  responsavel_velorio_nome: string;
  contato_whatsapp_responsavel: string;
}
```

Replace with:

```typescript
interface VelorioFormData {
  nome_falecido: string;
  data_inicio: string;
  data_fim: string;
  sala_velorio_id: string;
  responsavel_velorio_nome: string;
  contato_whatsapp_responsavel: string;
  data_nascimento: string;
  data_falecimento: string;
  mensagem_homenagem: string;
  data_sepultamento: string;
  local_sepultamento: string;
  google_maps_url_sepultamento: string;
}
```

(`foto_falecido` is deliberately **not** in this local form-state interface — the pending file and its preview live in separate `fotoFile`/`fotoPreviewUrl` state, since uploading needs a velório `id` that doesn't exist yet when creating.)

- [ ] **Step 3: Add `data_nascimento`…`google_maps_url_sepultamento` to the `formData` initial state, and add `fotoFile`/`fotoPreviewUrl` state**

Find:

```typescript
  const [formData, setFormData] = useState<VelorioFormData>({
    nome_falecido: '',
    data_inicio: '',
    data_fim: '',
    sala_velorio_id: '',
    responsavel_velorio_nome: '',
    contato_whatsapp_responsavel: '',
  });
  const [generatedToken, setGeneratedToken] = useState('');
```

Replace with:

```typescript
  const [formData, setFormData] = useState<VelorioFormData>({
    nome_falecido: '',
    data_inicio: '',
    data_fim: '',
    sala_velorio_id: '',
    responsavel_velorio_nome: '',
    contato_whatsapp_responsavel: '',
    data_nascimento: '',
    data_falecimento: '',
    mensagem_homenagem: '',
    data_sepultamento: '',
    local_sepultamento: '',
    google_maps_url_sepultamento: '',
  });
  const [generatedToken, setGeneratedToken] = useState('');
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreviewUrl, setFotoPreviewUrl] = useState('');
```

- [ ] **Step 4: Reset the new fields (and pending photo) in `openCreateDialog`**

Find:

```typescript
  const openCreateDialog = () => {
    setEditingVelorioId(null);
    setDialogStep('form');
    setFormData({
      nome_falecido: '',
      data_inicio: '',
      data_fim: '',
      sala_velorio_id: '',
      responsavel_velorio_nome: '',
      contato_whatsapp_responsavel: '',
    });
    setGeneratedToken('');
    setIsDialogOpen(true);
  };
```

Replace with:

```typescript
  const openCreateDialog = () => {
    setEditingVelorioId(null);
    setDialogStep('form');
    setFormData({
      nome_falecido: '',
      data_inicio: '',
      data_fim: '',
      sala_velorio_id: '',
      responsavel_velorio_nome: '',
      contato_whatsapp_responsavel: '',
      data_nascimento: '',
      data_falecimento: '',
      mensagem_homenagem: '',
      data_sepultamento: '',
      local_sepultamento: '',
      google_maps_url_sepultamento: '',
    });
    setGeneratedToken('');
    setFotoFile(null);
    setFotoPreviewUrl('');
    setIsDialogOpen(true);
  };
```

- [ ] **Step 5: Prefill the new fields (and existing photo preview) in `openEditDialog`**

Find:

```typescript
  const openEditDialog = (velorio: any) => {
    setDialogStep('form');
    setEditingVelorioId(velorio.id);
    setFormData({
      nome_falecido: velorio.nome_falecido,
      data_inicio: new Date(velorio.data_inicio).toISOString().slice(0, 16),
      data_fim: new Date(velorio.data_fim).toISOString().slice(0, 16),
      sala_velorio_id: velorio.sala_velorio_id,
      responsavel_velorio_nome: velorio.responsavel_velorio_nome ?? '',
      contato_whatsapp_responsavel: velorio.contato_whatsapp_responsavel ?? '',
    });
    setGeneratedToken(velorio.token_acesso);
    setIsDialogOpen(true);
  };
```

Replace with:

```typescript
  const openEditDialog = (velorio: any) => {
    setDialogStep('form');
    setEditingVelorioId(velorio.id);
    setFormData({
      nome_falecido: velorio.nome_falecido,
      data_inicio: new Date(velorio.data_inicio).toISOString().slice(0, 16),
      data_fim: new Date(velorio.data_fim).toISOString().slice(0, 16),
      sala_velorio_id: velorio.sala_velorio_id,
      responsavel_velorio_nome: velorio.responsavel_velorio_nome ?? '',
      contato_whatsapp_responsavel: velorio.contato_whatsapp_responsavel ?? '',
      data_nascimento: velorio.data_nascimento ?? '',
      data_falecimento: velorio.data_falecimento ?? '',
      mensagem_homenagem: velorio.mensagem_homenagem ?? '',
      data_sepultamento: velorio.data_sepultamento ?? '',
      local_sepultamento: velorio.local_sepultamento ?? '',
      google_maps_url_sepultamento: velorio.google_maps_url_sepultamento ?? '',
    });
    setGeneratedToken(velorio.token_acesso);
    setFotoFile(null);
    setFotoPreviewUrl(velorio.foto_falecido ?? '');
    setIsDialogOpen(true);
  };
```

Note: `data_nascimento`/`data_falecimento`/`data_sepultamento` are Postgres `DATE` columns, returned by PostgREST as plain `'YYYY-MM-DD'` strings — they need **no** `new Date(...).toISOString().slice(...)` conversion (that pattern is only for the `TIMESTAMPTZ` fields `data_inicio`/`data_fim`, which the `<Input type="datetime-local">` needs in a different string shape). Assigning them directly is correct for `<Input type="date">`.

- [ ] **Step 6: Add photo-file handlers and the upload helper, right before `handleSave`**

Find:

```typescript
  const handleSave = async () => {
    if (!formData.nome_falecido || !formData.data_inicio || !formData.data_fim || !formData.sala_velorio_id) {
      toast({ title: "Campos obrigatórios", description: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }

    const dataInicio = new Date(formData.data_inicio);
    const dataFim = new Date(formData.data_fim);
    if (dataFim <= dataInicio) {
      toast({ title: "Datas inválidas", description: "A data/hora de término deve ser posterior à de início.", variant: "destructive" });
      return;
    }

    const velorioData = {
      nome_falecido: formData.nome_falecido,
      data_inicio: formData.data_inicio,
      data_fim: formData.data_fim,
      sala_velorio_id: formData.sala_velorio_id,
      responsavel_velorio_nome: formData.responsavel_velorio_nome || undefined,
      contato_whatsapp_responsavel: formData.contato_whatsapp_responsavel || undefined,
    };

    if (editingVelorioId) {
      await updateVelorio.mutateAsync({ id: editingVelorioId, data: velorioData });
      setIsDialogOpen(false);
    } else {
      const result = await createVelorio.mutateAsync(velorioData);
      if (result) {
        setGeneratedToken(result.token_acesso);
        setCreatedVelorioName(formData.nome_falecido);
        setDialogStep('success');
      } else {
        setIsDialogOpen(false);
      }
    }
  };
```

Replace with:

```typescript
  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoFile(file);
    setFotoPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveFoto = () => {
    setFotoFile(null);
    setFotoPreviewUrl('');
  };

  const saveFotoIfPending = async (velorioId: string) => {
    if (!fotoFile) return;
    try {
      const fotoUrl = await uploadFotoFalecido(velorioId, fotoFile);
      await updateVelorio.mutateAsync({ id: velorioId, data: { foto_falecido: fotoUrl } });
    } catch (error) {
      toast({
        title: "Velório salvo, mas a foto não pôde ser enviada",
        description: error instanceof Error ? error.message : "Tente enviar a foto novamente ao editar o velório.",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    if (!formData.nome_falecido || !formData.data_inicio || !formData.data_fim || !formData.sala_velorio_id) {
      toast({ title: "Campos obrigatórios", description: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }

    const dataInicio = new Date(formData.data_inicio);
    const dataFim = new Date(formData.data_fim);
    if (dataFim <= dataInicio) {
      toast({ title: "Datas inválidas", description: "A data/hora de término deve ser posterior à de início.", variant: "destructive" });
      return;
    }

    const velorioData = {
      nome_falecido: formData.nome_falecido,
      data_inicio: formData.data_inicio,
      data_fim: formData.data_fim,
      sala_velorio_id: formData.sala_velorio_id,
      responsavel_velorio_nome: formData.responsavel_velorio_nome || undefined,
      contato_whatsapp_responsavel: formData.contato_whatsapp_responsavel || undefined,
      data_nascimento: formData.data_nascimento || undefined,
      data_falecimento: formData.data_falecimento || undefined,
      mensagem_homenagem: formData.mensagem_homenagem || undefined,
      data_sepultamento: formData.data_sepultamento || undefined,
      local_sepultamento: formData.local_sepultamento || undefined,
      google_maps_url_sepultamento: formData.google_maps_url_sepultamento || undefined,
    };

    if (editingVelorioId) {
      await updateVelorio.mutateAsync({ id: editingVelorioId, data: velorioData });
      await saveFotoIfPending(editingVelorioId);
      setIsDialogOpen(false);
    } else {
      const result = await createVelorio.mutateAsync(velorioData);
      if (result) {
        await saveFotoIfPending(result.id);
        setGeneratedToken(result.token_acesso);
        setCreatedVelorioName(formData.nome_falecido);
        setDialogStep('success');
      } else {
        setIsDialogOpen(false);
      }
    }
  };
```

- [ ] **Step 7: Insert the "Sobre o falecido" and "Sepultamento" form sections**

Find:

```tsx
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">WhatsApp do Responsável</label>
                      <Input
                        value={formData.contato_whatsapp_responsavel}
                        onChange={(e) => setFormData({ ...formData, contato_whatsapp_responsavel: e.target.value })}
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Token de Acesso</label>
```

Replace with:

```tsx
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">WhatsApp do Responsável</label>
                      <Input
                        value={formData.contato_whatsapp_responsavel}
                        onChange={(e) => setFormData({ ...formData, contato_whatsapp_responsavel: e.target.value })}
                        placeholder="(00) 00000-0000"
                      />
                    </div>

                    <h3 className="text-sm font-medium text-foreground pt-2 border-t border-border">Sobre o falecido</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-muted-foreground mb-2">Data de Nascimento</label>
                        <Input
                          type="date"
                          value={formData.data_nascimento}
                          onChange={(e) => setFormData({ ...formData, data_nascimento: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-muted-foreground mb-2">Data de Falecimento</label>
                        <Input
                          type="date"
                          value={formData.data_falecimento}
                          onChange={(e) => setFormData({ ...formData, data_falecimento: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Foto</label>
                      <div className="flex items-center gap-3">
                        {fotoPreviewUrl && (
                          <img
                            src={fotoPreviewUrl}
                            alt="Prévia da foto"
                            className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 flex items-center gap-2">
                          <Input type="file" accept="image/*" onChange={handleFotoChange} className="flex-1" />
                          {fotoPreviewUrl && (
                            <Button type="button" variant="ghost" size="icon" onClick={handleRemoveFoto} title="Remover">
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Mensagem de Homenagem</label>
                      <Textarea
                        value={formData.mensagem_homenagem}
                        onChange={(e) => setFormData({ ...formData, mensagem_homenagem: e.target.value })}
                        placeholder="Um trecho especial sobre a vida do(a) falecido(a)..."
                      />
                    </div>

                    <h3 className="text-sm font-medium text-foreground pt-2 border-t border-border">Sepultamento</h3>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Data de Sepultamento</label>
                      <Input
                        type="date"
                        value={formData.data_sepultamento}
                        onChange={(e) => setFormData({ ...formData, data_sepultamento: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Local/Cemitério</label>
                      <Input
                        value={formData.local_sepultamento}
                        onChange={(e) => setFormData({ ...formData, local_sepultamento: e.target.value })}
                        placeholder="Nome do cemitério"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Link do Google Maps (Cemitério)</label>
                      <Input
                        value={formData.google_maps_url_sepultamento}
                        onChange={(e) => setFormData({ ...formData, google_maps_url_sepultamento: e.target.value })}
                        placeholder="https://maps.google.com/..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Token de Acesso</label>
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Build**

Run: `npm run build`
Expected: build finishes with `✓ built in ...s`, no errors.

- [ ] **Step 10: Manual browser verification**

1. Run `npm run dev`, open `/admin/velorios`, click "Novo Velório".
2. Fill the required fields, then fill Data de Nascimento, Data de Falecimento, pick a photo file (confirm a circular preview appears immediately), Mensagem de Homenagem, and all 3 Sepultamento fields. Save.
3. Confirm the success dialog appears as before (token/link unaffected).
4. Reopen the created velório for editing: confirm every new field — including the photo preview — is prefilled with what was just saved.
5. Click "Remover" next to the photo preview, save without picking a new file: confirm the dialog doesn't error (removing only clears the *pending selection*; per this plan's scope there's no "clear the saved photo" action — reopening edit will show the previously saved photo again, since `foto_falecido` itself wasn't changed).
6. Create a second velório leaving every new field blank: confirm it saves without error.

- [ ] **Step 11: Commit**

```bash
git add src/pages/VelorioManagement.tsx
git commit -m "feat: add falecido/sepultamento fields and photo upload to velório form"
```

---

### Task 7: `VelorioViewing.tsx` — public display

**Files:**
- Modify: `src/pages/VelorioViewing.tsx`

**Interfaces:**
- Consumes: `Velorio.data_nascimento` / `data_falecimento` / `mensagem_homenagem` / `foto_falecido` / `data_sepultamento` / `local_sepultamento` / `google_maps_url_sepultamento`, `Velorio.sala_velorio.google_maps_url` (Task 3).

- [ ] **Step 1: Add the `MapPin` icon and a pure date formatter (no `Date`/timezone conversion — these are date-only strings)**

Find:

```typescript
import { ArrowLeft, Video, Radio, Maximize } from 'lucide-react';

const VelorioViewing = () => {
```

Replace with:

```typescript
import { ArrowLeft, Video, Radio, Maximize, MapPin } from 'lucide-react';

function formatDateBR(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

const VelorioViewing = () => {
```

`data_nascimento`/`data_falecimento`/`data_sepultamento` come back from PostgREST as plain `'YYYY-MM-DD'` strings with no time component. Passing that straight into `new Date('2026-07-15').toLocaleDateString('pt-BR')` parses it as UTC midnight, and in a browser west of UTC (e.g. Brazil, UTC-3) that renders as the **previous day** — an off-by-one bug. `formatDateBR` avoids `Date` entirely for these fields by just re-slicing the string. (`data_inicio`/`data_fim` stay on the existing `new Date(...).toLocaleDateString('pt-BR')` path below — those are real `TIMESTAMPTZ` values with timezone info, not naive dates, so that conversion is already correct.)

- [ ] **Step 2: Add `linhaVida` and `temSepultamento` computed values**

Find:

```typescript
  const sala = velorio.sala_velorio;
  const cidadeEstado = [sala?.cidade, sala?.estado].filter(Boolean).join('/');
  const enderecoCompleto = [sala?.endereco, sala?.bairro, cidadeEstado, sala?.cep].filter(Boolean).join(' — ');
```

Replace with:

```typescript
  const sala = velorio.sala_velorio;
  const cidadeEstado = [sala?.cidade, sala?.estado].filter(Boolean).join('/');
  const enderecoCompleto = [sala?.endereco, sala?.bairro, cidadeEstado, sala?.cep].filter(Boolean).join(' — ');

  const linhaVida = [velorio.data_nascimento, velorio.data_falecimento]
    .filter((d): d is string => Boolean(d))
    .map(formatDateBR)
    .join(' — ');

  const temSepultamento = Boolean(
    velorio.data_sepultamento || velorio.local_sepultamento || velorio.google_maps_url_sepultamento
  );
```

- [ ] **Step 3: Render the photo, lifespan line, homage message, sala Maps link, and sepultamento block**

Find:

```tsx
        <div className="text-center mb-6 animate-fade-in flex-shrink-0">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full gradient-elegant mb-4 shadow-elegant">
            <CrossIcon />
          </div>
          <h1 className="font-heading text-3xl md:text-4xl text-cream mb-2">
            {velorio.nome_falecido}
          </h1>
          <div className="flex items-center justify-center gap-2 text-cream/60 mb-1">
            <CandleIcon />
            <p className="text-base">{sala?.nome_sala_velorio}</p>
          </div>
          {enderecoCompleto && (
            <p className="text-cream/50 text-sm mb-1">{enderecoCompleto}</p>
          )}
          <p className="text-cream/50 text-sm">
            {new Date(velorio.data_inicio).toLocaleDateString('pt-BR')} —{' '}
            {new Date(velorio.data_fim).toLocaleDateString('pt-BR')}
          </p>
        </div>
```

Replace with:

```tsx
        <div className="text-center mb-6 animate-fade-in flex-shrink-0">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full gradient-elegant mb-4 shadow-elegant overflow-hidden">
            {velorio.foto_falecido ? (
              <img
                src={velorio.foto_falecido}
                alt={velorio.nome_falecido}
                className="w-full h-full object-cover"
              />
            ) : (
              <CrossIcon />
            )}
          </div>
          <h1 className="font-heading text-3xl md:text-4xl text-cream mb-2">
            {velorio.nome_falecido}
          </h1>
          {linhaVida && (
            <p className="text-cream/60 text-sm mb-1">{linhaVida}</p>
          )}
          <div className="flex items-center justify-center gap-2 text-cream/60 mb-1">
            <CandleIcon />
            <p className="text-base">{sala?.nome_sala_velorio}</p>
          </div>
          {enderecoCompleto && (
            <p className="text-cream/50 text-sm mb-1 flex items-center justify-center gap-2 flex-wrap">
              <span>{enderecoCompleto}</span>
              {sala?.google_maps_url && (
                <a
                  href={sala.google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-gold hover:underline"
                >
                  <MapPin className="w-3 h-3" />
                  Ver no Google Maps
                </a>
              )}
            </p>
          )}
          <p className="text-cream/50 text-sm">
            {new Date(velorio.data_inicio).toLocaleDateString('pt-BR')} —{' '}
            {new Date(velorio.data_fim).toLocaleDateString('pt-BR')}
          </p>
          {velorio.mensagem_homenagem && (
            <p className="text-cream/80 text-sm italic max-w-2xl mx-auto mt-3">
              "{velorio.mensagem_homenagem}"
            </p>
          )}
          {temSepultamento && (
            <div className="mt-4 inline-block bg-primary/50 rounded-lg px-4 py-3 text-left">
              <p className="text-gold text-xs uppercase tracking-wide mb-1">Sepultamento</p>
              {velorio.data_sepultamento && (
                <p className="text-cream/70 text-sm">{formatDateBR(velorio.data_sepultamento)}</p>
              )}
              {velorio.local_sepultamento && (
                <p className="text-cream/70 text-sm">{velorio.local_sepultamento}</p>
              )}
              {velorio.google_maps_url_sepultamento && (
                <a
                  href={velorio.google_maps_url_sepultamento}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-gold hover:underline text-sm mt-1"
                >
                  <MapPin className="w-3 h-3" />
                  Ver no Google Maps
                </a>
              )}
            </div>
          )}
        </div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build finishes with `✓ built in ...s`, no errors.

- [ ] **Step 6: Manual browser verification**

Using the velório created in Task 6 Step 10 (all fields filled) and its `token_acesso`:

1. Open `/?token=<token_acesso>` (or `/velorio/<id>` directly), confirm:
   - The circular photo shows instead of the cross icon.
   - The lifespan line shows under the name, and the **date matches exactly what was entered** (this is the check for the timezone bug fixed in Step 1 — e.g. if you entered `2026-07-15` as Data de Falecimento, the page must show `15/07/2026`, not `14/07/2026`).
   - The italic homage message paragraph shows.
   - "Ver no Google Maps" appears next to the sala address and opens the sala's URL in a new tab.
   - The "Sepultamento" block shows date, cemetery name, and its own "Ver no Google Maps" link, opening the cemetery URL.
2. Open the second velório from Task 6 Step 10 (all new fields blank): confirm none of the new blocks render — no empty lifespan line, no stray quotes, no "Sepultamento" heading with nothing under it, no broken/empty Maps links, and the cross icon still shows (no photo).

- [ ] **Step 7: Commit**

```bash
git add src/pages/VelorioViewing.tsx
git commit -m "feat: show falecido and sepultamento info on public velório page"
```

---

### Task 8: Production build and deploy

**Files:** none (build + PM2 restart only)

**Interfaces:** none — ships Tasks 1–7's combined changes.

- [ ] **Step 1: Full type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors, `dist/` regenerated.

- [ ] **Step 2: Confirm the built bundle contains the new UI copy**

```bash
grep -l "Sobre o falecido" dist/assets/*.js
grep -l "Sepultamento" dist/assets/*.js
```

Expected: both print the same `dist/assets/index-*.js` filename.

- [ ] **Step 3: Restart the frontend PM2 process**

This restarts the process serving the live site (`campax-frontend`, port 8080) — confirm with the user before running in a live session, per this project's deployment norms.

Run: `pm2 restart campax-frontend`
Expected: PM2 reports the process restarted and `status: online`.

- [ ] **Step 4: Smoke-test the live site**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/
```

Expected: `200`.

- [ ] **Step 5: Clean up any test data left from earlier tasks**

Delete the velórios/salas created for manual verification in Tasks 5–7 (via the admin UI at `/admin/velorios` and `/admin/salas`, or the same service-role Node pattern used in earlier verification steps), so they don't clutter the real dataset.
