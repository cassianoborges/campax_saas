# Livro de Presença (Registrar Homenagem pelo link público) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a public visitor register a homage (name, WhatsApp, e-mail, relationship, message) for a velório directly from the sala's public link page, with no token/login required, and without ever seeing the Mural or who else is present/online.

**Architecture:** A new `RegistrarHomenagemDialog` component drives a 3-screen flow (Identificação → Homenagem → Sucesso) reusing existing infrastructure end to end: screen 1 writes to `velorio_visitantes` (via `useRegisterVisitante`) and, when needed, `terms_acceptances` (via `useRecordTermsAcceptance`) — the exact same two writes `PublicAccess.tsx`'s `handleRegisterVisitor` already does; screen 2 writes to `velorio_homenagens` (via `useSubmitHomenagem`) — the exact same write `MuralHomenagens.tsx` already does. No new table, column, or RLS policy. The dialog is triggered from a new button on `SalaPublicLink.tsx`, a page that requires no token. Along the way, two small duplicated blocks (`getSavedVisitor`/`saveVisitor` and the `(00) 00000-0000` phone formatter) are extracted into shared `src/lib` modules so the new component doesn't add a third copy.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query, Supabase (Postgres + RLS + PostgREST), shadcn/ui (`Dialog`, `Checkbox`, `Textarea`). No new npm dependencies, no new database migration.

**Spec:** `docs/superpowers/specs/2026-09-04-livro-presenca-design.md`

## Global Constraints

- No new Supabase migration, table, column, or RLS policy — this plan only reads/writes `velorio_visitantes`, `velorio_homenagens`, and `terms_acceptances` through their existing services/hooks (`registerVisitante`, `submitHomenagem`, `recordTermsAcceptance`, `hasAcceptedCurrentTerms`). Do not modify any file under `supabase/migrations/`.
- The person filling this flow is **never** shown the Mural (`velorio_homenagens` list), the "Livro de Presenças" sheet (`VisitantesCounter`), or the online-now indicator (`OnlineCounter`/`usePresence`) as part of it. The flow never calls `usePresence` and never navigates to `/velorio/:id`.
- The project has no automated test runner (no `test` script, no vitest/jest config). Verification per task uses `npm run build` (TypeScript compile) and `npm run lint`; the final task is manual browser verification via the `run` skill. Do not add a test framework as part of this plan.
- Reuse `getUserAgent()` / `getClientIP()` from `src/services/accessLogsService.ts` as-is; do not modify them. Do not call `logVelorioAccess` from this flow — it is specific to the token-entry path and does not apply here (there is no token).
- Follow the validation copy and thresholds already established in `src/pages/PublicAccess.tsx`'s "Identificação do Visitante" screen exactly (nome required, celular ≥ 10 digits after stripping non-digits, terms checkbox required when re-acceptance is needed) — this is a second entry point into the same identification contract, not a new one.

---

### Task 1: Extract shared `visitorStorage` and phone-mask utilities

**Files:**
- Create: `src/lib/visitorStorage.ts`
- Modify: `src/lib/phoneMask.ts`
- Modify: `src/pages/PublicAccess.tsx`
- Modify: `src/components/MuralHomenagens.tsx`

**Interfaces:**
- Produces: `getSavedVisitor(): SavedVisitor | null`, `saveVisitor(data: SavedVisitor): void`, and `interface SavedVisitor { nome: string; celular: string; email: string; }` from `src/lib/visitorStorage.ts` — consumed by this task's two modified files and by Task 2's `RegistrarHomenagemDialog.tsx`.
- Produces: `formatCelular(value: string): string` added to `src/lib/phoneMask.ts` (alongside the existing `formatWhatsapp`) — consumed by this task's `PublicAccess.tsx` and by Task 2's `RegistrarHomenagemDialog.tsx`.

- [ ] **Step 1: Create the shared visitor-storage module**

Create `src/lib/visitorStorage.ts`:

```ts
const VISITOR_KEY = 'campax_visitor';

export interface SavedVisitor {
  nome: string;
  celular: string;
  email: string;
}

export function getSavedVisitor(): SavedVisitor | null {
  try {
    const raw = localStorage.getItem(VISITOR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveVisitor(data: SavedVisitor): void {
  localStorage.setItem(VISITOR_KEY, JSON.stringify(data));
}
```

- [ ] **Step 2: Add the phone-mask formatter**

In `src/lib/phoneMask.ts`, add this export below the existing `formatWhatsapp` function (do not modify `formatWhatsapp` itself):

```ts
export function formatCelular(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
```

- [ ] **Step 3: Point `PublicAccess.tsx` at the shared modules**

In `src/pages/PublicAccess.tsx`, replace this block (the local duplicate, currently right after the `Step` type and before `formatCelular`):

```ts
const VISITOR_KEY = 'campax_visitor';

interface SavedVisitor {
  nome: string;
  celular: string;
  email: string;
}

function getSavedVisitor(): SavedVisitor | null {
  try {
    const raw = localStorage.getItem(VISITOR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveVisitor(data: SavedVisitor) {
  localStorage.setItem(VISITOR_KEY, JSON.stringify(data));
}

const formatCelular = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};
```

with nothing (delete it entirely — both functions and the local type move to the shared modules).

Then add this import to the top import block, right after the existing `import { TermsDialog } from '@/components/TermsDialog';` line:

```ts
import { getSavedVisitor, saveVisitor } from '@/lib/visitorStorage';
import { formatCelular } from '@/lib/phoneMask';
```

- [ ] **Step 4: Point `MuralHomenagens.tsx` at the shared module**

In `src/components/MuralHomenagens.tsx`, replace this block (currently right after the imports):

```ts
const VISITOR_KEY = 'campax_visitor';

interface SavedVisitor {
  nome: string;
  celular: string;
  email: string;
}

function getSavedVisitor(): SavedVisitor | null {
  try {
    const raw = localStorage.getItem(VISITOR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
```

with nothing (delete it entirely).

Then add this import to the top of the file, after the last existing import (`import { useToast } from '@/hooks/use-toast';`):

```ts
import { getSavedVisitor } from '@/lib/visitorStorage';
```

- [ ] **Step 5: Verify the project builds and lints**

Run: `npm run build && npm run lint`
Expected: both succeed with no errors — confirms both files now resolve `getSavedVisitor`/`saveVisitor`/`formatCelular` from the shared modules with identical behavior (the extracted functions are byte-for-byte the same logic, just relocated).

- [ ] **Step 6: Commit**

```bash
git add src/lib/visitorStorage.ts src/lib/phoneMask.ts src/pages/PublicAccess.tsx src/components/MuralHomenagens.tsx
git commit -m "$(cat <<'EOF'
refactor: extract shared visitorStorage and phone-mask utilities

getSavedVisitor/saveVisitor and the (00) 00000-0000 phone formatter were
duplicated in PublicAccess.tsx and MuralHomenagens.tsx. Extracted ahead of
adding a third consumer (the upcoming Livro de Presença dialog).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VZ6Wp1sCWKnwZfobm3DxBf
EOF
)"
```

---

### Task 2: `RegistrarHomenagemDialog` component

**Files:**
- Create: `src/components/RegistrarHomenagemDialog.tsx`

**Interfaces:**
- Consumes: `getSavedVisitor`, `saveVisitor`, `SavedVisitor` (Task 1's `src/lib/visitorStorage.ts`); `formatCelular` (Task 1's `src/lib/phoneMask.ts`); `useRegisterVisitante` (`src/hooks/useVisitantes.ts`, existing); `hasAcceptedCurrentTerms` (`src/services/termsAcceptanceService.ts`, existing); `useRecordTermsAcceptance` (`src/hooks/useTermsAcceptance.ts`, existing); `useSubmitHomenagem` (`src/hooks/useHomenagens.ts`, existing); `getUserAgent`, `getClientIP` (`src/services/accessLogsService.ts`, existing); `TermsDialog` (`src/components/TermsDialog.tsx`, existing); `useToast` (`src/hooks/use-toast`, existing); shadcn `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogTrigger`, `Button`, `Input`, `Label`, `Textarea`, `Checkbox`.
- Produces: `RegistrarHomenagemDialog({ velorio_id: string; velorio_nome: string; trigger: ReactNode })` React component. Consumed by Task 3 (`SalaPublicLink.tsx`).

- [ ] **Step 1: Create the component**

Create `src/components/RegistrarHomenagemDialog.tsx`:

```tsx
import { ReactNode, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { TermsDialog } from '@/components/TermsDialog';
import { UserRound, Phone, Mail, Heart, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRegisterVisitante } from '@/hooks/useVisitantes';
import { useRecordTermsAcceptance } from '@/hooks/useTermsAcceptance';
import { hasAcceptedCurrentTerms } from '@/services/termsAcceptanceService';
import { useSubmitHomenagem } from '@/hooks/useHomenagens';
import { getUserAgent, getClientIP } from '@/services/accessLogsService';
import { getSavedVisitor, saveVisitor } from '@/lib/visitorStorage';
import { formatCelular } from '@/lib/phoneMask';

type Step = 'identificacao' | 'homenagem' | 'sucesso';

interface RegistrarHomenagemDialogProps {
  velorio_id: string;
  velorio_nome: string;
  trigger: ReactNode;
}

export function RegistrarHomenagemDialog({ velorio_id, velorio_nome, trigger }: RegistrarHomenagemDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('identificacao');
  const [nome, setNome] = useState('');
  const [celular, setCelular] = useState('');
  const [email, setEmail] = useState('');
  const [needsTermsCheckbox, setNeedsTermsCheckbox] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [parentesco, setParentesco] = useState('');
  const [mensagem, setMensagem] = useState('');

  const { toast } = useToast();
  const { mutateAsync: registerVisitanteMutate, isPending: isRegistering } = useRegisterVisitante();
  const { mutateAsync: recordTermsAcceptanceMutate, isPending: isRecordingTerms } = useRecordTermsAcceptance();
  const { mutate: submitHomenagemMutate, isPending: isSubmittingHomenagem } = useSubmitHomenagem();

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (!nextOpen) {
      setStep('identificacao');
      setParentesco('');
      setMensagem('');
      return;
    }

    const saved = getSavedVisitor();
    if (saved) {
      setNome(saved.nome);
      setCelular(saved.celular);
      setEmail(saved.email);
      try {
        const accepted = await hasAcceptedCurrentTerms(saved.celular);
        setNeedsTermsCheckbox(!accepted);
        setTermsAccepted(accepted);
      } catch {
        setNeedsTermsCheckbox(true);
        setTermsAccepted(false);
      }
    } else {
      setNome('');
      setCelular('');
      setEmail('');
      setNeedsTermsCheckbox(true);
      setTermsAccepted(false);
    }
  };

  const handleSubmitIdentificacao = async () => {
    const celularDigits = celular.replace(/\D/g, '');

    if (!nome.trim()) {
      toast({ title: 'Nome obrigatório', description: 'Por favor, informe seu nome.', variant: 'destructive' });
      return;
    }
    if (celularDigits.length < 10) {
      toast({ title: 'Celular inválido', description: 'Informe um número de celular válido com DDD.', variant: 'destructive' });
      return;
    }
    if (needsTermsCheckbox && !termsAccepted) {
      toast({ title: 'Termos de Uso', description: 'Você precisa aceitar os Termos de Uso para continuar.', variant: 'destructive' });
      return;
    }

    try {
      const visitante = { nome: nome.trim(), celular: celular.trim(), email: email.trim() || undefined };
      const writes: Promise<unknown>[] = [registerVisitanteMutate({ velorio_id, ...visitante })];

      if (needsTermsCheckbox) {
        const userAgent = getUserAgent();
        const ipAddress = await getClientIP();
        writes.push(
          recordTermsAcceptanceMutate({
            velorio_id,
            ...visitante,
            ip_address: ipAddress || undefined,
            user_agent: userAgent,
          })
        );
      }

      await Promise.all(writes);
      saveVisitor({ nome: visitante.nome, celular: visitante.celular, email: visitante.email ?? '' });
      setStep('homenagem');
    } catch {
      toast({
        title: 'Erro ao registrar',
        description: 'Não foi possível salvar seus dados. Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const handleSubmitHomenagem = () => {
    if (!mensagem.trim()) {
      toast({ title: 'Mensagem vazia', description: 'Escreva uma mensagem antes de enviar.', variant: 'destructive' });
      return;
    }

    submitHomenagemMutate(
      {
        velorio_id,
        autor_nome: nome.trim(),
        parentesco: parentesco.trim() || undefined,
        mensagem: mensagem.trim(),
      },
      {
        onSuccess: () => setStep('sucesso'),
        onError: () => {
          toast({
            title: 'Erro ao enviar',
            description: 'Não foi possível enviar sua homenagem. Tente novamente.',
            variant: 'destructive',
          });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        {step === 'identificacao' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserRound className="w-5 h-5 text-gold" />
                Identificação
              </DialogTitle>
              <DialogDescription>
                Velório de <span className="font-medium text-foreground">{velorio_nome}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rh-nome">Nome completo *</Label>
                <div className="relative">
                  <UserRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="rh-nome"
                    placeholder="Seu nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rh-celular">Celular (WhatsApp) *</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="rh-celular"
                    type="tel"
                    placeholder="(00) 00000-0000"
                    value={celular}
                    onChange={(e) => setCelular(formatCelular(e.target.value))}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rh-email">
                  E-mail <span className="text-muted-foreground text-xs">(opcional)</span>
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="rh-email"
                    type="email"
                    placeholder="seuemail@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {needsTermsCheckbox && (
                <div className="flex items-start gap-2 pt-2">
                  <Checkbox
                    id="rh-terms"
                    checked={termsAccepted}
                    onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                    className="mt-0.5"
                  />
                  <span className="text-sm font-normal leading-snug text-muted-foreground">
                    <Label htmlFor="rh-terms">Li e aceito os</Label>{' '}
                    <TermsDialog
                      trigger={
                        <button type="button" className="text-gold underline underline-offset-2">
                          Termos de Uso e a Política de Privacidade de Imagem
                        </button>
                      }
                    />
                  </span>
                </div>
              )}

              <Button
                variant="gold"
                size="lg"
                className="w-full"
                onClick={handleSubmitIdentificacao}
                disabled={isRegistering || isRecordingTerms}
              >
                {isRegistering || isRecordingTerms ? 'Salvando...' : 'Continuar'}
              </Button>
            </div>
          </>
        )}

        {step === 'homenagem' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-gold" />
                Sua homenagem
              </DialogTitle>
              <DialogDescription>
                Velório de <span className="font-medium text-foreground">{velorio_nome}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rh-parentesco">
                  Parentesco <span className="text-muted-foreground text-xs">(opcional)</span>
                </Label>
                <Input
                  id="rh-parentesco"
                  placeholder="Ex: Amigo, Sobrinho, Colega de trabalho"
                  value={parentesco}
                  onChange={(e) => setParentesco(e.target.value)}
                  maxLength={30}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rh-mensagem">Homenagem *</Label>
                <Textarea
                  id="rh-mensagem"
                  placeholder="Escreva uma mensagem de carinho..."
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  className="min-h-[120px] resize-none"
                  maxLength={500}
                />
              </div>

              <Button
                variant="gold"
                size="lg"
                className="w-full"
                onClick={handleSubmitHomenagem}
                disabled={isSubmittingHomenagem || !mensagem.trim()}
              >
                {isSubmittingHomenagem ? 'Enviando...' : 'Registrar Homenagem'}
              </Button>
            </div>
          </>
        )}

        {step === 'sucesso' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-gold" />
                Homenagem registrada
              </DialogTitle>
              <DialogDescription className="sr-only">
                Sua homenagem foi registrada com sucesso
              </DialogDescription>
            </DialogHeader>

            <div className="text-center py-4">
              <p className="text-foreground">
                Obrigado por prestar seus respeitos à memória de{' '}
                <span className="font-medium">{velorio_nome}</span>.
              </p>
            </div>

            <Button variant="gold" size="lg" className="w-full" onClick={() => handleOpenChange(false)}>
              Fechar
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify the project builds and lints**

Run: `npm run build && npm run lint`
Expected: both succeed with no errors — confirms all imports resolve (`useSubmitHomenagem` from `useHomenagens.ts`, `useRegisterVisitante` from `useVisitantes.ts`, etc. all already exist) and the `Promise<unknown>[]` array of `registerVisitanteMutate`/`recordTermsAcceptanceMutate` calls type-checks.

- [ ] **Step 3: Commit**

```bash
git add src/components/RegistrarHomenagemDialog.tsx
git commit -m "$(cat <<'EOF'
feat: add RegistrarHomenagemDialog for the public Livro de Presença

3-screen dialog (Identificação → Homenagem → Sucesso) that lets a visitor
register a homage without a token, reusing velorio_visitantes,
velorio_homenagens and terms_acceptances exactly as PublicAccess.tsx and
MuralHomenagens.tsx already do. Not yet wired to any page.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VZ6Wp1sCWKnwZfobm3DxBf
EOF
)"
```

---

### Task 3: Wire the button into `SalaPublicLink.tsx`

**Files:**
- Modify: `src/pages/SalaPublicLink.tsx`

**Interfaces:**
- Consumes: `RegistrarHomenagemDialog({ velorio_id: string; velorio_nome: string; trigger: ReactNode })` from Task 2.

- [ ] **Step 1: Add the import**

In `src/pages/SalaPublicLink.tsx`, add this import after the existing `import NotFound from './NotFound';` line:

```ts
import { RegistrarHomenagemDialog } from '@/components/RegistrarHomenagemDialog';
```

- [ ] **Step 2: Add the button below "Acessar transmissão"**

Replace:
```tsx
            <Button variant="gold" className="w-full mt-2" onClick={() => navigate('/')}>
              Acessar transmissão
            </Button>
          </div>
        ) : (
```
with:
```tsx
            <Button variant="gold" className="w-full mt-2" onClick={() => navigate('/')}>
              Acessar transmissão
            </Button>
            <RegistrarHomenagemDialog
              velorio_id={velorio.id}
              velorio_nome={velorio.nome_falecido}
              trigger={
                <Button variant="outline-gold" className="w-full mt-3">
                  Registrar Homenagem
                </Button>
              }
            />
          </div>
        ) : (
```

This sits inside the `{velorio ? (...) : (...)}` branch, so the button only renders when there is an `atual` or `próximo` velório — matching `velorio.id` and `velorio.nome_falecido`, both already destructured at the top of the component (`const velorio = atual ?? proximo;`).

- [ ] **Step 3: Verify the project builds and lints**

Run: `npm run build && npm run lint`
Expected: both succeed with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/SalaPublicLink.tsx
git commit -m "$(cat <<'EOF'
feat: add Registrar Homenagem button to the public sala link page

Lets a visitor register a homage for the current/next velório straight
from /:hashEmpresa/:salaSlug, with no token required.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VZ6Wp1sCWKnwZfobm3DxBf
EOF
)"
```

---

### Task 4: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Launch the app**

Use the `run` skill to start the dev server (`npm run dev`, port 8080) and open it in a browser.

- [ ] **Step 2: Find a sala with a current or upcoming velório**

In `/admin/velorios`, confirm there is a velório with status `Agendado` or `Ao Vivo` linked to a sala, and note that sala's slug (`/admin` → Salas management, or check `sala_velorio.slug` in Supabase Studio). Navigate to `/:hashEmpresa/:salaSlug` (the `VITE_EMPRESA_HASH` value from `.env`) for that sala.

- [ ] **Step 3: Verify the button and first-time identification**

Confirm the "Registrar Homenagem" button appears below "Acessar transmissão". Click it — the dialog opens on the "Identificação" screen with the fields empty and the terms checkbox visible. Try clicking "Continuar" with nothing filled: confirm the "Nome obrigatório" toast appears. Fill nome and an invalid celular (e.g. `123`): confirm the "Celular inválido" toast appears. Fill a valid celular but leave the terms checkbox unchecked: confirm the "Termos de Uso" toast appears.

- [ ] **Step 4: Verify the nested Terms dialog**

Click "Termos de Uso e a Política de Privacidade de Imagem" inside the dialog. Confirm a second dialog opens on top showing the full terms text, is scrollable, and can be closed without closing the outer "Identificação" dialog underneath it.

- [ ] **Step 5: Verify identification submits and advances to the homenagem screen**

Check the terms checkbox, fill a real-looking nome/celular/email, click "Continuar". Confirm the dialog advances to "Sua homenagem" (parentesco + mensagem fields). In Supabase Studio (Table Editor or SQL Editor, authenticated), confirm one new row exists in `velorio_visitantes` with that `celular`/`nome`, and one new row in `terms_acceptances` with `terms_version = '1.0'` and a non-null `document_hash`/`accepted_at`.

- [ ] **Step 6: Verify the homenagem screen and success confirmation**

Try clicking "Registrar Homenagem" with the message field empty: confirm the "Mensagem vazia" toast. Fill parentesco and a message, submit. Confirm the dialog advances to "Homenagem registrada" with the thank-you text — no list of other homages or presences is shown anywhere in this dialog. In Supabase Studio, confirm one new row exists in `velorio_homenagens` with that `autor_nome`/`parentesco`/`mensagem`.

- [ ] **Step 7: Verify the flow returns to the public page, not to the transmissão**

Click "Fechar". Confirm the dialog closes and the browser is still on `/:hashEmpresa/:salaSlug` — there was no navigation to `/velorio/:id` at any point in this flow.

- [ ] **Step 8: Verify the homage is visible in the Mural, but only to someone actually watching**

In a **different** browser tab, go through the normal token-entry flow (`/`, enter the token for the same velório) to reach `/velorio/:id`. Confirm the message just submitted appears in the Mural de Homenagens sidebar (this proves the write landed in the shared `velorio_homenagens` table and the existing realtime subscription picks it up) — this is a verification step for the developer, not something the public-link visitor sees.

- [ ] **Step 9: Verify returning-visitor recognition**

Reopen the "Registrar Homenagem" dialog on `/:hashEmpresa/:salaSlug` (same browser/localStorage as Steps 3-7). Confirm the Identificação screen now opens pre-filled with the same nome/celular/email, and the terms checkbox does **not** appear (since `hasAcceptedCurrentTerms` now returns `true` for that celular/version) — clicking "Continuar" goes straight to the homenagem screen.

- [ ] **Step 10: Final report**

Report to the user: confirm all checks above passed, and note the test rows left in `velorio_visitantes`, `terms_acceptances`, and `velorio_homenagens` from this session (all real inserts to existing append-friendly/public tables — nothing to clean up, matching how the terms-acceptance feature's own verification was left in place).
