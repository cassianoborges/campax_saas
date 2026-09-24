# Link Público Fixo por Sala de Velório — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each `sala_velorio` a fixed public URL (`/:hashEmpresa/:salaSlug`) that shows which velório is currently live in that room (or the next scheduled one), without exposing the stream — accessing the stream still requires the existing 6-character token flow at `/`.

**Architecture:** One new DB column (`sala_velorio.slug`, unique, auto-generated from the room's name, editable in `/admin/salas`). A fixed env-configured `EMPRESA_HASH` string gates the new public route. A new read-only hook (`useSalaPublicLink`) resolves, client-side, which velório in a sala is "Ao Vivo" right now (or the next "Agendado" one) using the same date-comparison logic already used by `getVelorioStatus` in `useVelorios.ts` — no new RLS is needed, since `sala_velorio` and `velorios` are already fully public-readable (`USING (true)`, confirmed in `001_initial_schema.sql:143` and `013_add_sala_velorio.sql`). A new page (`SalaPublicLink.tsx`) renders that info and a button that navigates to `/` (blank — no token pre-filled).

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query, `@supabase/supabase-js`, shadcn/ui, Tailwind, React Router v6.

**Spec:** `docs/superpowers/specs/2026-09-01-link-publico-sala-design.md`

## Global Constraints

- This repo has no test runner (confirmed via `grep`/`find` — no Jest/Vitest/`*.test.*`, no `ts-node`/`tsx` in `node_modules/.bin`). Verification is `npx tsc --noEmit`, `npm run build`, manual Node one-off scripts (service-role key from `.env.camera-status-api`), and manual browser checks.
- The live Supabase project (`mzqthywvdavavviqbolm.supabase.co`) has no DDL-capable RPC and no local Postgres connection string — migrations are applied by hand via the Supabase Dashboard SQL Editor (same constraint documented in the prior `2026-07-16-whatsapp-responsavel-sala.md` plan).
- No multi-tenant data model — `EMPRESA_HASH` is a fixed, single string for this installation, not a DB entity. Do not create an `empresas` table.
- The public sala page never exposes or pre-fills a `token_acesso`. Its only call to action navigates to `/` with no query params.
- No changes to the visitor-registration flow, mural de homenagens, presence/visit counters, or access logging (`velorio_access_logs`) — all of that stays exclusive to the existing `PublicAccess.tsx` → `/velorio/:id` path.
- `sala_velorio` and `velorios` public SELECT RLS already covers every column with no per-row filter (`USING (true)`) — no RLS migration is needed for this feature.

---

### Task 1: Migration — add `sala_velorio.slug`

**Files:**
- Create: `supabase/migrations/019_add_sala_slug.sql`

**Interfaces:**
- Produces: column `sala_velorio.slug` (`VARCHAR(255)`, `NOT NULL`, `UNIQUE`). Tasks 2, 4, and 5 depend on this column existing in the live database.

- [ ] **Step 1: Preview current sala names (to sanity-check the backfill before running it)**

Run:

```bash
node -e "
require('dotenv').config({ path: '.env.camera-status-api' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
admin.from('sala_velorio').select('id, nome_sala_velorio').then(({ data, error }) => {
  console.log(data, error);
});
"
```

Expected: a list of existing salas (or an empty array if none exist yet) and `error: null`. Note the names — you'll compare them against the generated slugs in Step 4.

- [ ] **Step 2: Create the migration file**

Create `supabase/migrations/019_add_sala_slug.sql`:

```sql
-- ============================================
-- CAMPAX - SLUG DA SALA DE VELÓRIO
-- Migration: 019_add_sala_slug
-- Description: Adiciona um slug URL-safe a sala_velorio, usado no link
--   público fixo por sala (/:hashEmpresa/:salaSlug). Gerado a partir do
--   nome existente, com backfill para as salas já cadastradas.
-- ============================================

CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE sala_velorio ADD COLUMN slug VARCHAR(255);

-- Backfill: minúsculas, sem acento, não-alfanumérico vira "_"
UPDATE sala_velorio
SET slug = regexp_replace(
             regexp_replace(lower(unaccent(nome_sala_velorio)), '[^a-z0-9]+', '_', 'g'),
             '(^_+|_+$)', '', 'g'
           );

-- Resolve colisão entre salas com nomes que geram o mesmo slug
UPDATE sala_velorio sv
SET slug = sv.slug || '_' || substr(sv.id::text, 1, 4)
WHERE EXISTS (
  SELECT 1 FROM sala_velorio sv2
  WHERE sv2.slug = sv.slug AND sv2.id <> sv.id
);

ALTER TABLE sala_velorio
  ALTER COLUMN slug SET NOT NULL,
  ADD CONSTRAINT sala_velorio_slug_unique UNIQUE (slug);

COMMENT ON COLUMN sala_velorio.slug IS 'Identificador amigável para URL pública (ex: sala_uruacu), gerado a partir do nome, editável no admin';
```

- [ ] **Step 3: Apply the migration to the live database**

1. Open the Supabase Dashboard for project `mzqthywvdavavviqbolm` → **SQL Editor**.
2. Paste the exact contents of `supabase/migrations/019_add_sala_slug.sql` (from Step 2).
3. Run it.

Expected: `Success. No rows returned.`

- [ ] **Step 4: Verify every sala got a unique, non-null slug**

Run:

```bash
node -e "
require('dotenv').config({ path: '.env.camera-status-api' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
admin.from('sala_velorio').select('id, nome_sala_velorio, slug').then(({ data, error }) => {
  console.log(data, error);
  const slugs = (data || []).map(s => s.slug);
  console.log('any null?', slugs.some(s => !s));
  console.log('any duplicate?', new Set(slugs).size !== slugs.length);
});
"
```

Expected: every row has a non-empty `slug` matching its name (e.g. `"Sala Uruaçu"` → `"sala_uruacu"`), `any null? false`, `any duplicate? false`, `error: null`.

- [ ] **Step 5: Verify the unique constraint actually rejects duplicates**

```bash
node -e "
require('dotenv').config({ path: '.env.camera-status-api' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
(async () => {
  const { data: first } = await admin.from('sala_velorio').select('slug').limit(1).single();
  const { error } = await admin.from('sala_velorio').insert([{ nome_sala_velorio: 'TESTE PLANO SLUG DUPLICADO', slug: first.slug }]);
  console.log('expected unique_violation error:', error);
})();
"
```

Expected: `error` is not null and its `code` is `23505` (`duplicate key value violates unique constraint "sala_velorio_slug_unique"`).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/019_add_sala_slug.sql
git commit -m "$(cat <<'EOF'
feat: add slug column to sala_velorio

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uovy4YvXkE7dxEpnLfrN8U
EOF
)"
```

---

### Task 2: `useSalasVelorio.ts` — type the new field + friendlier duplicate-slug error

**Files:**
- Modify: `src/hooks/useSalasVelorio.ts`

**Interfaces:**
- Consumes: column `sala_velorio.slug` (Task 1).
- Produces: `SalaVelorio.slug: string` and `SalaVelorioFormData.slug: string`. Task 4 depends on both field names.

- [ ] **Step 1: Add `slug` to the `SalaVelorio` interface**

Find (`src/hooks/useSalasVelorio.ts:5-17`):

```typescript
export interface SalaVelorio {
    id: string;
    nome_sala_velorio: string;
    endereco: string | null;
    bairro: string | null;
    cep: string | null;
    cidade: string | null;
    estado: string | null;
    responsavel_sala_velorio: string | null;
    whatsapp_responsavel_sala_velorio: string | null;
    google_maps_url: string | null;
    created_at: string;
    updated_at: string;
```

Replace with:

```typescript
export interface SalaVelorio {
    id: string;
    nome_sala_velorio: string;
    slug: string;
    endereco: string | null;
    bairro: string | null;
    cep: string | null;
    cidade: string | null;
    estado: string | null;
    responsavel_sala_velorio: string | null;
    whatsapp_responsavel_sala_velorio: string | null;
    google_maps_url: string | null;
    created_at: string;
    updated_at: string;
```

- [ ] **Step 2: Add `slug` to the `SalaVelorioFormData` interface**

Find (`src/hooks/useSalasVelorio.ts:31-42`):

```typescript
export interface SalaVelorioFormData {
    nome_sala_velorio: string;
    endereco?: string | null;
```

Replace with:

```typescript
export interface SalaVelorioFormData {
    nome_sala_velorio: string;
    slug: string;
    endereco?: string | null;
```

- [ ] **Step 3: Show a friendly toast when the slug is already taken**

Find (`src/hooks/useSalasVelorio.ts:111-117`, inside `createSala`):

```typescript
        onError: (error: Error) => {
            toast({
                title: "Erro ao criar sala",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const updateSala = useMutation({
```

Replace with:

```typescript
        onError: (error: { message: string; code?: string }) => {
            const isDuplicateSlug = error.code === '23505';
            toast({
                title: "Erro ao criar sala",
                description: isDuplicateSlug
                    ? "Esse link já está em uso por outra sala — escolha outro."
                    : error.message,
                variant: "destructive",
            });
        },
    });

    const updateSala = useMutation({
```

- [ ] **Step 4: Same friendly toast for `updateSala`**

Find (`src/hooks/useSalasVelorio.ts:172-178`, inside `updateSala`):

```typescript
        onError: (error: Error) => {
            toast({
                title: "Erro ao atualizar sala",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const deleteSala = useMutation({
```

Replace with:

```typescript
        onError: (error: { message: string; code?: string }) => {
            const isDuplicateSlug = error.code === '23505';
            toast({
                title: "Erro ao atualizar sala",
                description: isDuplicateSlug
                    ? "Esse link já está em uso por outra sala — escolha outro."
                    : error.message,
                variant: "destructive",
            });
        },
    });

    const deleteSala = useMutation({
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: errors about `SalaFormData`/`emptyForm` in `src/pages/SalaManagement.tsx` missing `slug` (that file is fixed in Task 4) — no errors reported *inside* `useSalasVelorio.ts` itself.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useSalasVelorio.ts
git commit -m "$(cat <<'EOF'
feat: type sala slug and surface duplicate-slug error

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uovy4YvXkE7dxEpnLfrN8U
EOF
)"
```

---

### Task 3: Fixed `EMPRESA_HASH` config

**Files:**
- Create: `src/lib/empresaHash.ts`
- Modify: `.env`

**Interfaces:**
- Produces: `EMPRESA_HASH: string` (exported constant). Tasks 4 and 6 depend on this export.

- [ ] **Step 1: Generate a fixed hash for this installation**

Run:

```bash
openssl rand -hex 4
```

This prints an 8-character hex string (e.g. `a3f9c21b`). Use it in the next step — this is the fixed, opaque prefix used in every sala's public URL for this installation (not a secret, just meant to be non-guessable).

- [ ] **Step 2: Add it to `.env`**

Open `.env` and add a new line (using the value generated in Step 1, replacing the example below):

```
VITE_EMPRESA_HASH="a3f9c21b"
```

- [ ] **Step 3: Create `src/lib/empresaHash.ts`**

```typescript
export const EMPRESA_HASH = import.meta.env.VITE_EMPRESA_HASH as string;
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/empresaHash.ts .env
git commit -m "$(cat <<'EOF'
feat: add fixed EMPRESA_HASH config for public sala links

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uovy4YvXkE7dxEpnLfrN8U
EOF
)"
```

---

### Task 4: `slugify` utility + `SalaManagement.tsx` — slug field, link preview, card display

**Files:**
- Create: `src/lib/slugify.ts`
- Modify: `src/pages/SalaManagement.tsx`

**Interfaces:**
- Consumes: `SalaVelorio.slug` / `SalaVelorioFormData.slug` (Task 2), `EMPRESA_HASH` (Task 3).
- Produces: `slugify(text: string): string`, exported from `src/lib/slugify.ts` — reusable by any future admin form that needs a URL-safe slug.

- [ ] **Step 1: Create `src/lib/slugify.ts`**

```typescript
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
```

- [ ] **Step 2: Add `slug` and a manual-edit tracking flag to `SalaFormData`/`emptyForm`**

Find (`src/pages/SalaManagement.tsx:21-45`):

```typescript
interface SalaFormData {
  nome_sala_velorio: string;
  endereco: string;
  bairro: string;
  cep: string;
  cidade: string;
  estado: string;
  responsavel_sala_velorio: string;
  whatsapp_responsavel_sala_velorio: string;
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
  whatsapp_responsavel_sala_velorio: '',
  google_maps_url: '',
  camera_ids: [],
};
```

Replace with:

```typescript
interface SalaFormData {
  nome_sala_velorio: string;
  slug: string;
  endereco: string;
  bairro: string;
  cep: string;
  cidade: string;
  estado: string;
  responsavel_sala_velorio: string;
  whatsapp_responsavel_sala_velorio: string;
  google_maps_url: string;
  camera_ids: string[];
}

const emptyForm: SalaFormData = {
  nome_sala_velorio: '',
  slug: '',
  endereco: '',
  bairro: '',
  cep: '',
  cidade: '',
  estado: '',
  responsavel_sala_velorio: '',
  whatsapp_responsavel_sala_velorio: '',
  google_maps_url: '',
  camera_ids: [],
};
```

- [ ] **Step 3: Import `slugify` and `EMPRESA_HASH`, add the manual-edit flag state**

Find (`src/pages/SalaManagement.tsx:7-8`):

```typescript
import { useSalasVelorio, SalaVelorio } from '@/hooks/useSalasVelorio';
import { formatWhatsapp } from '@/lib/phoneMask';
```

Replace with:

```typescript
import { useSalasVelorio, SalaVelorio } from '@/hooks/useSalasVelorio';
import { formatWhatsapp } from '@/lib/phoneMask';
import { slugify } from '@/lib/slugify';
import { EMPRESA_HASH } from '@/lib/empresaHash';
```

Find (`src/pages/SalaManagement.tsx:53-55`):

```typescript
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSalaId, setEditingSalaId] = useState<string | null>(null);
  const [formData, setFormData] = useState<SalaFormData>(emptyForm);
```

Replace with:

```typescript
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSalaId, setEditingSalaId] = useState<string | null>(null);
  const [formData, setFormData] = useState<SalaFormData>(emptyForm);
  const [slugEditadoManualmente, setSlugEditadoManualmente] = useState(false);
```

- [ ] **Step 4: Reset the flag on create, set it on edit**

Find (`src/pages/SalaManagement.tsx:57-61`):

```typescript
  const openCreateDialog = () => {
    setEditingSalaId(null);
    setFormData(emptyForm);
    setIsDialogOpen(true);
  };
```

Replace with:

```typescript
  const openCreateDialog = () => {
    setEditingSalaId(null);
    setFormData(emptyForm);
    setSlugEditadoManualmente(false);
    setIsDialogOpen(true);
  };
```

Find (`src/pages/SalaManagement.tsx:63-78`):

```typescript
  const openEditDialog = (sala: SalaVelorio) => {
    setEditingSalaId(sala.id);
    setFormData({
      nome_sala_velorio: sala.nome_sala_velorio,
      endereco: sala.endereco ?? '',
      bairro: sala.bairro ?? '',
      cep: sala.cep ?? '',
      cidade: sala.cidade ?? '',
      estado: sala.estado ?? '',
      responsavel_sala_velorio: sala.responsavel_sala_velorio ?? '',
      whatsapp_responsavel_sala_velorio: sala.whatsapp_responsavel_sala_velorio ?? '',
      google_maps_url: sala.google_maps_url ?? '',
      camera_ids: sala.sala_velorio_cameras?.map((sc) => sc.camera_id) || [],
    });
    setIsDialogOpen(true);
  };
```

Replace with:

```typescript
  const openEditDialog = (sala: SalaVelorio) => {
    setEditingSalaId(sala.id);
    setFormData({
      nome_sala_velorio: sala.nome_sala_velorio,
      slug: sala.slug,
      endereco: sala.endereco ?? '',
      bairro: sala.bairro ?? '',
      cep: sala.cep ?? '',
      cidade: sala.cidade ?? '',
      estado: sala.estado ?? '',
      responsavel_sala_velorio: sala.responsavel_sala_velorio ?? '',
      whatsapp_responsavel_sala_velorio: sala.whatsapp_responsavel_sala_velorio ?? '',
      google_maps_url: sala.google_maps_url ?? '',
      camera_ids: sala.sala_velorio_cameras?.map((sc) => sc.camera_id) || [],
    });
    setSlugEditadoManualmente(true);
    setIsDialogOpen(true);
  };
```

- [ ] **Step 5: Add the slug field to the form, right under the name field**

Find (`src/pages/SalaManagement.tsx:133-140`):

```tsx
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Nome da Sala *</label>
                  <Input
                    value={formData.nome_sala_velorio}
                    onChange={(e) => setFormData({ ...formData, nome_sala_velorio: e.target.value })}
                    placeholder="Ex: Sala Ouro"
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Endereço</label>
```

Replace with:

```tsx
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Nome da Sala *</label>
                  <Input
                    value={formData.nome_sala_velorio}
                    onChange={(e) => {
                      const nome = e.target.value;
                      setFormData({
                        ...formData,
                        nome_sala_velorio: nome,
                        slug: slugEditadoManualmente ? formData.slug : slugify(nome),
                      });
                    }}
                    placeholder="Ex: Sala Ouro"
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Link público da sala</label>
                  <Input
                    value={formData.slug}
                    onChange={(e) => {
                      setSlugEditadoManualmente(true);
                      setFormData({ ...formData, slug: slugify(e.target.value) });
                    }}
                    placeholder="sala_ouro"
                  />
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {window.location.origin}/{EMPRESA_HASH}/{formData.slug || '...'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Endereço</label>
```

- [ ] **Step 6: Show the public link on the sala card, with a copy button**

Find (`src/pages/SalaManagement.tsx:12`):

```typescript
import { Building2, Plus, Pencil, Trash2, X, Save, MapPin, Camera } from 'lucide-react';
```

Replace with:

```typescript
import { Building2, Plus, Pencil, Trash2, X, Save, MapPin, Camera, Link2, Copy } from 'lucide-react';
```

Find (`src/pages/SalaManagement.tsx:274-290`):

```tsx
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground">{sala.nome_sala_velorio}</h3>
                      {enderecoParts && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          {enderecoParts}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        {sala.responsavel_sala_velorio && <span>Responsável: {sala.responsavel_sala_velorio}</span>}
                        {sala.whatsapp_responsavel_sala_velorio && <span>WhatsApp: {sala.whatsapp_responsavel_sala_velorio}</span>}
                        <span className="flex items-center gap-1">
                          <Camera className="w-3 h-3" />
                          {cameraCount} câmera(s)
                        </span>
                      </div>
                    </div>
```

Replace with:

```tsx
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground">{sala.nome_sala_velorio}</h3>
                      {enderecoParts && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          {enderecoParts}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        {sala.responsavel_sala_velorio && <span>Responsável: {sala.responsavel_sala_velorio}</span>}
                        {sala.whatsapp_responsavel_sala_velorio && <span>WhatsApp: {sala.whatsapp_responsavel_sala_velorio}</span>}
                        <span className="flex items-center gap-1">
                          <Camera className="w-3 h-3" />
                          {cameraCount} câmera(s)
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1 truncate">
                        <Link2 className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{window.location.origin}/{EMPRESA_HASH}/{sala.slug}</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/${EMPRESA_HASH}/${sala.slug}`);
                            toast({ title: "Link copiado" });
                          }}
                          className="text-gold hover:underline flex-shrink-0 flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          Copiar
                        </button>
                      </div>
                    </div>
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: build finishes with `✓ built in ...s`, no errors.

- [ ] **Step 9: Manual browser verification**

1. Run `npm run dev`, log in as an operador, go to `/admin/salas`.
2. Click "Nova Sala", type "Sala Uruaçu" in the name field: confirm the "Link público da sala" field auto-fills with `sala_uruacu` and the preview line below shows the full URL.
3. Edit the slug field directly to `sala_uruacu_2`, then change the name field again: confirm the slug does **not** get overwritten (manual edit wins).
4. Save. Confirm the new card shows the link `.../<EMPRESA_HASH>/sala_uruacu_2` and clicking "Copiar" copies exactly that URL (paste it somewhere to check).
5. Create a second sala also named "Sala Uruaçu": confirm the auto-suggested slug collides and saving shows the toast "Esse link já está em uso por outra sala — escolha outro." Change the slug and save successfully.
6. Edit an existing sala: confirm its saved slug shows pre-filled and stays put when you tweak only the name.
7. Delete both test salas created in this step.

- [ ] **Step 10: Commit**

```bash
git add src/lib/slugify.ts src/pages/SalaManagement.tsx
git commit -m "$(cat <<'EOF'
feat: add public link slug field to sala admin form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uovy4YvXkE7dxEpnLfrN8U
EOF
)"
```

---

### Task 5: `useSalaPublicLink` hook

**Files:**
- Create: `src/hooks/useSalaPublicLink.ts`

**Interfaces:**
- Consumes: columns `sala_velorio.slug`/`nome_sala_velorio`/`cidade`/`estado` (Task 1 + existing schema), `velorios.sala_velorio_id`/`nome_falecido`/`data_inicio`/`data_fim`/`data_sepultamento` (existing schema).
- Produces: `useSalaPublicLink(salaSlug: string | undefined)` returning a TanStack Query result whose `data` is `SalaPublicLinkData | null`, and the exported types `SalaPublicLinkVelorio` / `SalaPublicLinkData`. Task 6 depends on this hook and both type names.

- [ ] **Step 1: Create `src/hooks/useSalaPublicLink.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SalaPublicLinkVelorio {
  id: string;
  nome_falecido: string;
  data_inicio: string;
  data_fim: string;
  data_sepultamento: string | null;
}

export interface SalaPublicLinkData {
  sala: {
    id: string;
    nome_sala_velorio: string;
    cidade: string | null;
    estado: string | null;
  };
  atual: SalaPublicLinkVelorio | null;
  proximo: SalaPublicLinkVelorio | null;
}

function isAoVivo(v: SalaPublicLinkVelorio, now: Date): boolean {
  return now >= new Date(v.data_inicio) && now <= new Date(v.data_fim);
}

export function useSalaPublicLink(salaSlug: string | undefined) {
  return useQuery({
    queryKey: ['sala_public_link', salaSlug],
    queryFn: async (): Promise<SalaPublicLinkData | null> => {
      if (!salaSlug) return null;

      const { data: sala, error: salaError } = await supabase
        .from('sala_velorio')
        .select('id, nome_sala_velorio, cidade, estado')
        .eq('slug', salaSlug)
        .maybeSingle();

      if (salaError) throw salaError;
      if (!sala) return null;

      const { data: velorios, error: veloriosError } = await supabase
        .from('velorios')
        .select('id, nome_falecido, data_inicio, data_fim, data_sepultamento')
        .eq('sala_velorio_id', sala.id);

      if (veloriosError) throw veloriosError;

      const now = new Date();
      const todos = (velorios ?? []) as SalaPublicLinkVelorio[];
      const aoVivos = todos.filter((v) => isAoVivo(v, now));

      const atual = aoVivos.length > 0
        ? aoVivos.reduce((maisRecente, v) =>
            new Date(v.data_inicio) > new Date(maisRecente.data_inicio) ? v : maisRecente
          )
        : null;

      let proximo: SalaPublicLinkVelorio | null = null;
      if (!atual) {
        const agendados = todos
          .filter((v) => new Date(v.data_inicio) > now)
          .sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime());
        proximo = agendados[0] ?? null;
      }

      return { sala, atual, proximo };
    },
    enabled: !!salaSlug,
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors from this file.

- [ ] **Step 3: Manual verification against the live database**

Create a temporary sala with one "Ao Vivo" velório and one future "Agendado" velório, and confirm the resolution logic picks the right one:

```bash
node -e "
require('dotenv').config({ path: '.env.camera-status-api' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
(async () => {
  const { data: sala } = await admin
    .from('sala_velorio')
    .insert([{ nome_sala_velorio: 'TESTE PLANO HOOK', slug: 'teste_plano_hook' }])
    .select()
    .single();

  const now = new Date();
  const umaHoraAtras = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const emUmaHora = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const amanha = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const amanhaFim = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString();

  const { data: aoVivo } = await admin.from('velorios').insert([{
    nome_falecido: 'Fulano (ao vivo)', sala_velorio_id: sala.id,
    data_inicio: umaHoraAtras, data_fim: emUmaHora,
    token_acesso: 'HK1' + Date.now().toString().slice(-3), status: 'Ao Vivo',
  }]).select().single();

  const { data: agendado } = await admin.from('velorios').insert([{
    nome_falecido: 'Ciclano (agendado)', sala_velorio_id: sala.id,
    data_inicio: amanha, data_fim: amanhaFim,
    token_acesso: 'HK2' + Date.now().toString().slice(-3), status: 'Agendado',
  }]).select().single();

  // Reimplementa a mesma query do hook (o hook roda no browser com a chave anon)
  const { data: sVel } = await admin.from('sala_velorio').select('id, nome_sala_velorio, cidade, estado').eq('slug', 'teste_plano_hook').maybeSingle();
  const { data: vel } = await admin.from('velorios').select('id, nome_falecido, data_inicio, data_fim, data_sepultamento').eq('sala_velorio_id', sVel.id);
  console.log('sala:', sVel);
  console.log('velorios:', vel);

  await admin.from('velorios').delete().in('id', [aoVivo.id, agendado.id]);
  await admin.from('sala_velorio').delete().eq('id', sala.id);
  console.log('CLEANED UP');
})();
"
```

Expected: `sala` returns the temp sala, `velorios` lists both rows with the right timestamps, and cleanup runs without error. This confirms the raw queries the hook relies on return the right shape — the picking logic (`atual`/`proximo`) itself is exercised end-to-end in Task 6's browser check.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSalaPublicLink.ts
git commit -m "$(cat <<'EOF'
feat: add useSalaPublicLink hook to resolve a sala's current velório

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uovy4YvXkE7dxEpnLfrN8U
EOF
)"
```

---

### Task 6: `SalaPublicLink.tsx` page + route

**Files:**
- Create: `src/pages/SalaPublicLink.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useSalaPublicLink` + `SalaPublicLinkData` (Task 5), `EMPRESA_HASH` (Task 3).

- [ ] **Step 1: Create `src/pages/SalaPublicLink.tsx`**

```tsx
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CrossIcon, CandleIcon } from '@/components/icons/MemorialIcons';
import { useSalaPublicLink } from '@/hooks/useSalaPublicLink';
import { EMPRESA_HASH } from '@/lib/empresaHash';
import NotFound from './NotFound';

function formatDateHora(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

const SalaPublicLink = () => {
  const { hashEmpresa, salaSlug } = useParams<{ hashEmpresa: string; salaSlug: string }>();
  const navigate = useNavigate();
  const hashValido = hashEmpresa === EMPRESA_HASH;
  const { data, isLoading } = useSalaPublicLink(hashValido ? salaSlug : undefined);

  if (!hashValido) {
    return <NotFound />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen gradient-soft flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return <NotFound />;
  }

  const { sala, atual, proximo } = data;
  const cidadeEstado = [sala.cidade, sala.estado].filter(Boolean).join('/');
  const velorio = atual ?? proximo;

  return (
    <div className="min-h-screen gradient-soft flex items-center justify-center p-6">
      <div className="text-center max-w-md w-full">
        <CrossIcon />
        <h1 className="font-heading text-2xl text-foreground mt-4 mb-1">{sala.nome_sala_velorio}</h1>
        {cidadeEstado && <p className="text-muted-foreground text-sm mb-6">{cidadeEstado}</p>}

        {velorio ? (
          <div className="bg-card rounded-lg shadow-soft p-6 text-left">
            <div className="flex items-center gap-2 mb-3">
              <CandleIcon />
              <span className="text-xs uppercase tracking-wide text-gold">
                {atual ? 'Velório em andamento' : 'Próximo velório'}
              </span>
            </div>
            <p className="font-heading text-xl text-foreground mb-2">{velorio.nome_falecido}</p>
            <p className="text-sm text-muted-foreground mb-1">
              Início: {formatDateHora(velorio.data_inicio)}
            </p>
            {velorio.data_sepultamento && (
              <p className="text-sm text-muted-foreground mb-4">
                Sepultamento: {formatDateHora(velorio.data_sepultamento)}
              </p>
            )}
            <Button variant="gold" className="w-full mt-2" onClick={() => navigate('/')}>
              Acessar transmissão
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground mt-6">Nenhum velório em andamento no momento.</p>
        )}
      </div>
    </div>
  );
};

export default SalaPublicLink;
```

- [ ] **Step 2: Register the route in `src/App.tsx`**

Find (`src/App.tsx:7-8`):

```typescript
import PublicAccess from "./pages/PublicAccess";
import VelorioViewing from "./pages/VelorioViewing";
```

Replace with:

```typescript
import PublicAccess from "./pages/PublicAccess";
import VelorioViewing from "./pages/VelorioViewing";
import SalaPublicLink from "./pages/SalaPublicLink";
```

Find (`src/App.tsx:32-34`):

```tsx
          {/* Public Routes */}
          <Route path="/" element={<PublicAccess />} />
          <Route path="/velorio/:id" element={<VelorioViewing />} />
```

Replace with:

```tsx
          {/* Public Routes */}
          <Route path="/" element={<PublicAccess />} />
          <Route path="/velorio/:id" element={<VelorioViewing />} />
          <Route path="/:hashEmpresa/:salaSlug" element={<SalaPublicLink />} />
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build finishes with `✓ built in ...s`, no errors.

- [ ] **Step 5: Manual browser verification**

Use the sala(s) created in Task 4's Step 9 (or create a fresh temporary one) and, via `/admin/velorios`, create test velórios assigned to it:

1. Sala with a velório whose `data_inicio`/`data_fim` bracket "now": visit `/{EMPRESA_HASH_value}/{slug}` (use the value you put in `.env` in Task 3). Confirm it shows "Velório em andamento", the right `nome_falecido`, and the start time. Click "Acessar transmissão": confirm it navigates to `/` with an **empty** token field (check the URL bar has no `?token=`).
2. Same sala, but now only a future-dated velório: reload the page, confirm it shows "Próximo velório" with the correct future date.
3. Same sala with no velórios at all (delete/reassign the test ones): reload, confirm it shows "Nenhum velório em andamento no momento." with no card.
4. Visit `/wrong-hash/{slug}`: confirm a 404 page renders.
5. Visit `/{EMPRESA_HASH_value}/no-such-slug`: confirm a 404 page renders.
6. Clean up any test velórios/salas created for this check.

- [ ] **Step 6: Commit**

```bash
git add src/pages/SalaPublicLink.tsx src/App.tsx
git commit -m "$(cat <<'EOF'
feat: add public per-sala landing page and route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uovy4YvXkE7dxEpnLfrN8U
EOF
)"
```

---

### Task 7: Documentation — `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Add the new route to the routes table**

Find:

```
/                          → PublicAccess (token entry)
/velorio/:id               → VelorioViewing (stream page, public)
```

Replace with:

```
/                          → PublicAccess (token entry)
/velorio/:id               → VelorioViewing (stream page, public)
/:hashEmpresa/:salaSlug     → SalaPublicLink (fixed public link per sala — shows current/next velório, links to token entry)
```

- [ ] **Step 2: Document `VITE_EMPRESA_HASH`**

Find:

```
**Frontend (`.env`):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_CAMERA_STATUS_API_URL` (defaults to `http://localhost:3001`)
```

Replace with:

```
**Frontend (`.env`):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_CAMERA_STATUS_API_URL` (defaults to `http://localhost:3001`), `VITE_EMPRESA_HASH` (fixed, opaque prefix for this installation's public per-sala links, e.g. `/:hashEmpresa/:salaSlug` — not a secret, just avoids guessable URLs; this is a single-tenant system, not multi-tenant)
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: document the public per-sala link route and env var

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uovy4YvXkE7dxEpnLfrN8U
EOF
)"
```

---

### Task 8: Production build and deploy

**Files:** none (build + PM2 restart only)

**Interfaces:** none — this task ships Tasks 1–7's combined changes.

- [ ] **Step 1: Full type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors, `dist/` regenerated.

- [ ] **Step 2: Confirm the built bundle contains the new UI copy**

```bash
grep -l "Velório em andamento" dist/assets/*.js
grep -l "Link público da sala" dist/assets/*.js
```

Expected: both commands print the same `dist/assets/index-*.js` filename.

- [ ] **Step 3: Confirm the production server's `.env` has `VITE_EMPRESA_HASH`**

If the production deployment checks out this repo fresh (`git pull` picks up the `.env` change from Task 3 automatically). If the production server keeps its own separately-maintained `.env` (not just a `git pull`ed copy), manually add the same `VITE_EMPRESA_HASH` line there before rebuilding — confirm with the user which is the case for this deployment before proceeding, since getting this wrong means every sala's public link 404s in production.

- [ ] **Step 4: Restart the frontend PM2 process**

This restarts the process serving the live site (`campax-frontend-velorio`, port 8080) — confirm with the user before running in a live session, per this project's deployment norms.

Run: `pm2 restart campax-frontend-velorio`
Expected: PM2 reports the process restarted and `status: online`.

- [ ] **Step 5: Smoke-test the live site**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/
```

Expected: `200`.

- [ ] **Step 6: Smoke-test one real public sala link**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8080/<EMPRESA_HASH_value>/<a-real-sala-slug>"
```

Expected: `200` (the SPA shell always returns 200 — the actual 404/data rendering happens client-side; confirm the real content in a browser as in Task 6 Step 5).
