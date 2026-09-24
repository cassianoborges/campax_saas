# WhatsApp do Responsável pela Sala de Velório — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a celular/WhatsApp field to the responsável of a `sala_velorio` (physical room), editable in `/admin/salas`, and surface it as a clickable WhatsApp link on the public velório viewing page.

**Architecture:** One new DB column (`sala_velorio.whatsapp_responsavel_sala_velorio`) applied via a new migration file. The admin form (`SalaManagement.tsx`) and its hook (`useSalasVelorio.ts`) get a new field alongside the existing `responsavel_sala_velorio` name field. The public page's data hook (`useVelorios.ts`) picks up both the name and the new WhatsApp column through its nested `sala_velorio` select, and `VelorioViewing.tsx` renders a conditional `api.whatsapp.com/send?phone=...` link.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query, `@supabase/supabase-js`, shadcn/ui, Tailwind. No test framework in this repo (confirmed via `grep`/`find` — no Jest/Vitest/`*.test.*`); verification is manual, via Node one-off scripts against the real Supabase project and `npx tsc --noEmit` / `npm run build`.

## Global Constraints

- This repo has no test runner — do not introduce one. Verification is `npx tsc --noEmit`, `npm run build`, and manual Node scripts using the service-role key from `.env.camera-status-api`.
- No RLS changes: `sala_velorio`'s existing policies (`SELECT *` for `viewer+`, `INSERT`/`UPDATE` for `operador+`, public `SELECT true`) already cover any new column added to the table.
- The new column is nullable, free-text (`VARCHAR(20)`) — no phone-format validation, matching every other WhatsApp field already in this codebase (`profiles.numero_whatsapp`, `velorios.contato_whatsapp_responsavel`).
- Out of scope: anything touching `velorios.responsavel_velorio_nome` / `velorios.contato_whatsapp_responsavel` (the *velório's* responsável — a separate, already-implemented feature).
- This project's live Supabase project (`mzqthywvdavavviqbolm.supabase.co`) is not reachable via DDL through `supabase-js` (no `exec_sql`-style RPC exists, confirmed by probing) and there is no local Postgres connection string available — the migration SQL must be applied manually through the Supabase Dashboard SQL Editor (Task 1, Step 3).

---

### Task 1: Migration — add the column

**Files:**
- Create: `supabase/migrations/015_add_sala_velorio_whatsapp.sql`

**Interfaces:**
- Produces: column `sala_velorio.whatsapp_responsavel_sala_velorio` (`VARCHAR(20)`, nullable). Tasks 2 and 4 depend on this column existing in the live database.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/015_add_sala_velorio_whatsapp.sql`:

```sql
-- ============================================
-- CAMPAX - WHATSAPP DO RESPONSÁVEL PELA SALA
-- Migration: 015_add_sala_velorio_whatsapp
-- Description: Adiciona o celular/WhatsApp do responsável pela sala de
--   velório (campo de nome já existe desde a migration 013).
-- ============================================

ALTER TABLE sala_velorio
  ADD COLUMN whatsapp_responsavel_sala_velorio VARCHAR(20);

COMMENT ON COLUMN sala_velorio.whatsapp_responsavel_sala_velorio IS 'WhatsApp do responsável pela sala (sala_velorio.responsavel_sala_velorio)';
```

- [ ] **Step 2: Verify the column does not already exist**

Run:

```bash
node -e "
require('dotenv').config({ path: '.env.camera-status-api' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
admin.from('sala_velorio').select('*').limit(1).then(({ data, error }) => {
  console.log(data && data[0] ? Object.keys(data[0]) : data, error);
});
"
```

Expected: a list of column names that does **not** include `whatsapp_responsavel_sala_velorio` (confirms the migration hasn't run yet, so Step 3 is safe to apply).

- [ ] **Step 3: Apply the migration to the live database**

There is no local Postgres connection string or DDL-capable RPC available for this project (verified: `admin.rpc('exec_sql', ...)` returns `PGRST202`, function not found). Apply it by hand:

1. Open the Supabase Dashboard for project `mzqthywvdavavviqbolm` → **SQL Editor**.
2. Paste the exact contents of `supabase/migrations/015_add_sala_velorio_whatsapp.sql` (from Step 1).
3. Run it.

Expected: `Success. No rows returned.`

- [ ] **Step 4: Verify the column now exists**

Run the same command from Step 2:

```bash
node -e "
require('dotenv').config({ path: '.env.camera-status-api' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
admin.from('sala_velorio').select('*').limit(1).then(({ data, error }) => {
  console.log(data && data[0] ? Object.keys(data[0]) : data, error);
});
"
```

Expected: the column list now includes `whatsapp_responsavel_sala_velorio`, and `error` is `null`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/015_add_sala_velorio_whatsapp.sql
git commit -m "feat: add whatsapp_responsavel_sala_velorio column to sala_velorio"
```

---

### Task 2: `useSalasVelorio.ts` — add the field to the hook's types

**Files:**
- Modify: `src/hooks/useSalasVelorio.ts:5-38`

**Interfaces:**
- Consumes: column `sala_velorio.whatsapp_responsavel_sala_velorio` (Task 1).
- Produces: `SalaVelorio.whatsapp_responsavel_sala_velorio: string | null` and `SalaVelorioFormData.whatsapp_responsavel_sala_velorio?: string | null`. Task 3 depends on both field names.

- [ ] **Step 1: Add the field to the `SalaVelorio` interface**

In `src/hooks/useSalasVelorio.ts`, find:

```typescript
    responsavel_sala_velorio: string | null;
    created_at: string;
```

Replace with:

```typescript
    responsavel_sala_velorio: string | null;
    whatsapp_responsavel_sala_velorio: string | null;
    created_at: string;
```

- [ ] **Step 2: Add the field to the `SalaVelorioFormData` interface**

In the same file, find:

```typescript
    responsavel_sala_velorio?: string | null;
    camera_ids?: string[];
```

Replace with:

```typescript
    responsavel_sala_velorio?: string | null;
    whatsapp_responsavel_sala_velorio?: string | null;
    camera_ids?: string[];
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (the hook already does `select('*')` / spreads the whole form object into `insert`/`update`, so no other change is needed in this file).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSalasVelorio.ts
git commit -m "feat: type whatsapp_responsavel_sala_velorio in useSalasVelorio"
```

---

### Task 3: `SalaManagement.tsx` — form field and card display

**Files:**
- Modify: `src/pages/SalaManagement.tsx`

**Interfaces:**
- Consumes: `SalaVelorio.whatsapp_responsavel_sala_velorio` / `SalaVelorioFormData.whatsapp_responsavel_sala_velorio` (Task 2).

- [ ] **Step 1: Add the field to `SalaFormData` and `emptyForm`**

In `src/pages/SalaManagement.tsx`, find:

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
  whatsapp_responsavel_sala_velorio: string;
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
      whatsapp_responsavel_sala_velorio: sala.whatsapp_responsavel_sala_velorio ?? '',
      camera_ids: sala.sala_velorio_cameras?.map((sc) => sc.camera_id) || [],
```

- [ ] **Step 3: Turn the single "Responsável" input into a two-column row with a WhatsApp field**

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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-muted-foreground mb-2">Responsável</label>
                    <Input
                      value={formData.responsavel_sala_velorio}
                      onChange={(e) => setFormData({ ...formData, responsavel_sala_velorio: e.target.value })}
                      placeholder="Nome do responsável"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-muted-foreground mb-2">WhatsApp do Responsável</label>
                    <Input
                      type="tel"
                      value={formData.whatsapp_responsavel_sala_velorio}
                      onChange={(e) => setFormData({ ...formData, whatsapp_responsavel_sala_velorio: e.target.value })}
                      placeholder="+55 62 99999-9999"
                    />
                  </div>
                </div>
```

- [ ] **Step 4: Show the WhatsApp field in the sala card listing**

Find:

```tsx
                        {sala.responsavel_sala_velorio && <span>Responsável: {sala.responsavel_sala_velorio}</span>}
```

Replace with:

```tsx
                        {sala.responsavel_sala_velorio && <span>Responsável: {sala.responsavel_sala_velorio}</span>}
                        {sala.whatsapp_responsavel_sala_velorio && <span>WhatsApp: {sala.whatsapp_responsavel_sala_velorio}</span>}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification — round-trip through the real hook logic**

This repo has no test framework, so verify the write path directly against the live database using the same `insert`/`update` shape `useSalasVelorio.ts` uses (service-role key bypasses RLS, which is fine here — we're only checking the column round-trips correctly, RLS itself is untouched by this change):

```bash
node -e "
require('dotenv').config({ path: '.env.camera-status-api' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
(async () => {
  const { data: created, error: createErr } = await admin
    .from('sala_velorio')
    .insert([{ nome_sala_velorio: 'TESTE PLANO WHATSAPP', responsavel_sala_velorio: 'Fulano', whatsapp_responsavel_sala_velorio: '+55 62 99999-0000' }])
    .select()
    .single();
  console.log('CREATED', created, createErr);

  const { data: fetched } = await admin.from('sala_velorio').select('*').eq('id', created.id).single();
  console.log('FETCHED whatsapp field:', fetched.whatsapp_responsavel_sala_velorio);

  await admin.from('sala_velorio').delete().eq('id', created.id);
  const { data: afterDelete } = await admin.from('sala_velorio').select('id').eq('id', created.id).maybeSingle();
  console.log('CLEANED UP, remaining row:', afterDelete);
})();
"
```

Expected: `FETCHED whatsapp field: +55 62 99999-0000` and `CLEANED UP, remaining row: null`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/SalaManagement.tsx
git commit -m "feat: add WhatsApp field to sala responsável form and card"
```

---

### Task 4: `useVelorios.ts` — expose the field through the public velório query

**Files:**
- Modify: `src/hooks/useVelorios.ts:19-73`

**Interfaces:**
- Consumes: column `sala_velorio.whatsapp_responsavel_sala_velorio` (Task 1).
- Produces: `Velorio.sala_velorio.responsavel_sala_velorio: string | null | undefined` and `Velorio.sala_velorio.whatsapp_responsavel_sala_velorio: string | null | undefined`. Task 5 depends on both field names being present on `velorio.sala_velorio`.

- [ ] **Step 1: Add both fields to the `Velorio` type's nested `sala_velorio`**

Find:

```typescript
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
    sala_velorio?: {
        id: string;
        nome_sala_velorio: string;
        endereco?: string | null;
        bairro?: string | null;
        cidade?: string | null;
        estado?: string | null;
        cep?: string | null;
        responsavel_sala_velorio?: string | null;
        whatsapp_responsavel_sala_velorio?: string | null;
        sala_velorio_cameras?: {
```

- [ ] **Step 2: Add both columns to `VELORIO_SELECT`**

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
    responsavel_sala_velorio,
    whatsapp_responsavel_sala_velorio,
    sala_velorio_cameras (
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification — confirm the nested select actually returns the new columns**

```bash
node -e "
require('dotenv').config({ path: '.env.camera-status-api' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
(async () => {
  const { data: sala } = await admin
    .from('sala_velorio')
    .insert([{ nome_sala_velorio: 'TESTE PLANO VELORIO SELECT', responsavel_sala_velorio: 'Ciclana', whatsapp_responsavel_sala_velorio: '+55 62 98888-0000' }])
    .select()
    .single();
  const { data: velorio } = await admin
    .from('velorios')
    .insert([{ nome_falecido: 'Teste Plano', data_inicio: new Date().toISOString(), data_fim: new Date().toISOString(), token_acesso: 'TST' + Date.now().toString().slice(-3), sala_velorio_id: sala.id, status: 'Agendado' }])
    .select()
    .single();

  const select = \`*, sala_velorio ( id, nome_sala_velorio, responsavel_sala_velorio, whatsapp_responsavel_sala_velorio )\`;
  const { data: fetched, error } = await admin.from('velorios').select(select).eq('id', velorio.id).single();
  console.log('sala_velorio nested fields:', fetched.sala_velorio, error);

  await admin.from('velorios').delete().eq('id', velorio.id);
  await admin.from('sala_velorio').delete().eq('id', sala.id);
  console.log('CLEANED UP');
})();
"
```

Expected: `sala_velorio nested fields:` includes `responsavel_sala_velorio: 'Ciclana'` and `whatsapp_responsavel_sala_velorio: '+55 62 98888-0000'`, `error: null`, followed by `CLEANED UP`.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useVelorios.ts
git commit -m "feat: select sala responsável name and WhatsApp in useVelorios"
```

---

### Task 5: `VelorioViewing.tsx` — public WhatsApp link

**Files:**
- Modify: `src/pages/VelorioViewing.tsx`

**Interfaces:**
- Consumes: `velorio.sala_velorio.responsavel_sala_velorio` / `velorio.sala_velorio.whatsapp_responsavel_sala_velorio` (Task 4).

- [ ] **Step 1: Add the `Phone` icon to the existing lucide-react import**

Find (line 9):

```typescript
import { ArrowLeft, Video, Radio, Share2, Maximize } from 'lucide-react';
```

Replace with:

```typescript
import { ArrowLeft, Video, Radio, Share2, Maximize, Phone } from 'lucide-react';
```

- [ ] **Step 2: Render the conditional WhatsApp link below the sala name/address block**

Find:

```tsx
          <div className="flex items-center justify-center gap-2 text-cream/60 mb-1">
            <CandleIcon />
            <p className="text-base">{sala?.nome_sala_velorio}</p>
          </div>
          {enderecoCompleto && (
            <p className="text-cream/50 text-sm mb-1">{enderecoCompleto}</p>
          )}
```

Replace with:

```tsx
          <div className="flex items-center justify-center gap-2 text-cream/60 mb-1">
            <CandleIcon />
            <p className="text-base">{sala?.nome_sala_velorio}</p>
          </div>
          {enderecoCompleto && (
            <p className="text-cream/50 text-sm mb-1">{enderecoCompleto}</p>
          )}
          {sala?.responsavel_sala_velorio && sala?.whatsapp_responsavel_sala_velorio && (
            <a
              href={`https://api.whatsapp.com/send?phone=${sala.whatsapp_responsavel_sala_velorio.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-cream/60 hover:text-gold text-sm mb-1"
            >
              <Phone className="w-3 h-3" />
              Falar com {sala.responsavel_sala_velorio} (responsável pela sala)
            </a>
          )}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build finishes with `✓ built in ...s`, no errors.

- [ ] **Step 5: Manual browser verification**

1. In `/admin/salas`, edit an existing sala (or create a temporary one) and fill in both "Responsável" and "WhatsApp do Responsável".
2. Create (or reuse) a velório assigned to that sala, in status `Ao Vivo` or `Agendado`.
3. Open the public link (`/?token=<token_acesso>` → the velório viewing page) in a browser.
4. Confirm the line "Falar com **[nome]** (responsável pela sala)" appears under the sala name/address, and clicking it opens `https://api.whatsapp.com/send?phone=<digits-only>` with the correct number.
5. Edit the sala again and clear the WhatsApp field; reload the public page; confirm the link no longer appears (no dangling label, no broken link).

- [ ] **Step 6: Commit**

```bash
git add src/pages/VelorioViewing.tsx
git commit -m "feat: show sala responsável WhatsApp link on public velório page"
```

---

### Task 6: Production build and deploy

**Files:** none (build + PM2 restart only)

**Interfaces:** none — this task ships Tasks 1–5's combined changes.

- [ ] **Step 1: Full type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors, `dist/` regenerated.

- [ ] **Step 2: Confirm the built bundle contains the new UI copy**

```bash
grep -l "WhatsApp do Responsável" dist/assets/*.js
grep -l "responsável pela sala" dist/assets/*.js
```

Expected: both commands print the same `dist/assets/index-*.js` filename.

- [ ] **Step 3: Restart the frontend PM2 process**

This restarts the process serving the live site (`campax-frontend`, port 8080) — confirm with the user before running in a live session, per this project's deployment norms.

Run: `pm2 restart campax-frontend`
Expected: PM2 reports the process restarted and `status: online`.

- [ ] **Step 4: Smoke-test the live site**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/
```

Expected: `200`.
