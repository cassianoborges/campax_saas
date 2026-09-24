# Mobile Responsive Admin + Sala de Velório Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin panel and the velorio viewing page usable on mobile screens, without changing desktop behavior, navigation, or business logic.

**Architecture:** Pure Tailwind CSS class changes plus one new piece of local UI state (drawer open/closed) in `AdminLayout`. No new dependencies — reuse the existing shadcn `Sheet` component (`src/components/ui/sheet.tsx`) for the mobile off-canvas nav. No backend/API changes.

**Tech Stack:** React 18 + TypeScript + Vite, Tailwind CSS, shadcn/ui (Radix), lucide-react icons.

## Global Constraints

- Desktop (`md:` breakpoint, i.e. ≥768px) must remain pixel-identical to current behavior. Every change is additive via responsive Tailwind prefixes or `md:`-guarded overrides.
- No changes to routes, permissions (`isSuperadmin`, `isOperador`, `isAdmin`), or data-fetching hooks.
- No automated test suite exists in this repo (`npm run lint` and `npm run build` are the only repo-level checks — see `package.json`). Each task's verification step uses these plus a manual resize check; there is a final cross-page manual verification task.
- Spec: `docs/superpowers/specs/2026-07-03-mobile-responsive-admin-velorio-design.md`.

---

### Task 1: Admin sidebar becomes a mobile drawer

**Files:**
- Modify: `src/components/AdminLayout.tsx` (full rewrite)

**Interfaces:**
- Consumes: `src/components/ui/sheet.tsx` exports `Sheet`, `SheetContent` (existing, no changes).
- Produces: `AdminLayout({ children, activeSection })` — same public signature as before. No consumer (`AdminDashboard.tsx`, `CameraManagement.tsx`, etc.) needs to change.

- [ ] **Step 1: Replace the full contents of `src/components/AdminLayout.tsx`**

```tsx
import { ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Sheet, SheetContent } from '@/components/ui/sheet';
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

interface AdminLayoutProps {
    children: ReactNode;
    activeSection: ActiveSection;
}

export function AdminLayout({ children, activeSection }: AdminLayoutProps) {
    const navigate = useNavigate();
    const { signOut, isSuperadmin } = useAuth();
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

    const handleLogout = async () => {
        await signOut();
        navigate('/admin');
    };

    const goTo = (path: string) => {
        navigate(path);
        setIsMobileNavOpen(false);
    };

    const navItem = (
        section: ActiveSection,
        label: string,
        path: string,
        Icon: React.ElementType,
    ) => (
        <Button
            variant="ghost"
            className={`w-full justify-start ${
                activeSection === section
                    ? 'text-gold bg-gold/10'
                    : 'text-cream/70 hover:bg-gold/10 hover:text-gold'
            }`}
            onClick={() => goTo(path)}
        >
            <Icon className="w-4 h-4 mr-3" />
            {label}
        </Button>
    );

    const sidebarContent = (
        <>
            <div className="flex items-center gap-3 mb-10">
                <div className="w-12 h-12 flex items-center justify-center">
                    <img
                        src="https://mzqthywvdavavviqbolm.supabase.co/storage/v1/object/public/campax_img/Logcampax.png"
                        alt="Logo Campax"
                        className="w-full h-full object-contain"
                    />
                </div>
                <div>
                    <h2 className="font-heading text-cream text-lg">Velório Online</h2>
                    <p className="text-cream/50 text-xs">Administração</p>
                </div>
            </div>

            <nav className="flex-1 space-y-2">
                {navItem('dashboard',   'Dashboard',  '/admin/dashboard',   LayoutDashboard)}
                {navItem('velorios',    'Velórios',   '/admin/velorios',    Calendar)}
                {navItem('salas',       'Salas',      '/admin/salas',       Building2)}
                {navItem('cameras',     'Câmeras',    '/admin/cameras',     Camera)}
                {navItem('relatorios',  'Relatórios', '/admin/relatorios',  FileText)}
                {isSuperadmin && navItem('usuarios', 'Usuários', '/admin/usuarios', UserCog)}
            </nav>

            <Button
                variant="ghost"
                className="w-full justify-start text-cream/50 hover:bg-destructive/20 hover:text-destructive"
                onClick={handleLogout}
            >
                <LogOut className="w-4 h-4 mr-3" />
                Sair
            </Button>
        </>
    );

    return (
        <div className="min-h-screen bg-background">
            {/* Desktop sidebar — unchanged from previous behavior */}
            <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 gradient-elegant border-r border-gold/20 p-6 flex-col">
                {sidebarContent}
            </aside>

            {/* Mobile top bar */}
            <header className="md:hidden fixed top-0 left-0 right-0 h-16 gradient-elegant border-b border-gold/20 flex items-center justify-between px-4 z-40">
                <div className="flex items-center gap-2">
                    <img
                        src="https://mzqthywvdavavviqbolm.supabase.co/storage/v1/object/public/campax_img/Logcampax.png"
                        alt="Logo Campax"
                        className="w-8 h-8 object-contain"
                    />
                    <h2 className="font-heading text-cream text-base">Velório Online</h2>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-cream hover:bg-gold/10 hover:text-gold"
                    onClick={() => setIsMobileNavOpen(true)}
                    aria-label="Abrir menu"
                >
                    <Menu className="w-5 h-5" />
                </Button>
            </header>

            {/* Mobile drawer */}
            <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
                <SheetContent
                    side="left"
                    className="w-72 border-gold/20 p-6 flex flex-col text-cream"
                    style={{ background: 'var(--gradient-elegant)' }}
                >
                    {sidebarContent}
                </SheetContent>
            </Sheet>

            <main className="p-8 pt-20 md:pt-8 md:ml-64">
                {children}
            </main>
        </div>
    );
}
```

- [ ] **Step 2: Verify lint and build pass**

Run: `npm run lint && npm run build`
Expected: both commands exit with status 0, no TypeScript or ESLint errors.

- [ ] **Step 3: Manual check with dev server**

Run: `npm run dev`, open the app, log in, navigate to `/admin/dashboard`.
- At a desktop width (≥1024px): sidebar is fixed and visible exactly as before, no top bar.
- Resize below 768px (or use devtools mobile emulation at 375px): fixed sidebar disappears, a top bar with logo + hamburger icon appears; tapping the hamburger opens the drawer from the left; tapping a nav item inside the drawer navigates and closes the drawer; tapping outside the drawer (overlay) or the X closes it without navigating.

- [ ] **Step 4: Commit**

```bash
git add src/components/AdminLayout.tsx
git commit -m "feat: make admin sidebar a mobile drawer"
```

---

### Task 2: Stack admin page headers on mobile

`AdminDashboard.tsx`'s header (`src/pages/AdminDashboard.tsx:33-36`) has only a title/subtitle and no action button, so it never squeezes on narrow screens — it is intentionally left out of this task.

**Files:**
- Modify: `src/pages/CameraManagement.tsx:94-99`
- Modify: `src/pages/VelorioManagement.tsx:343-348`
- Modify: `src/pages/SalaManagement.tsx:106-111`
- Modify: `src/pages/UserManagement.tsx:83-89`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed elsewhere — purely visual className changes.

- [ ] **Step 1: `src/pages/CameraManagement.tsx` — stack header, allow action row to wrap**

Change:
```tsx
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl text-foreground mb-2">Câmeras</h1>
          <p className="text-muted-foreground">Gerencie as câmeras de transmissão</p>
        </div>
        <div className="flex items-center gap-3">
```
To:
```tsx
      <header className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-foreground mb-2">Câmeras</h1>
          <p className="text-muted-foreground">Gerencie as câmeras de transmissão</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
```

- [ ] **Step 2: `src/pages/VelorioManagement.tsx` — stack header**

Change:
```tsx
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl text-foreground mb-2">Velórios</h1>
          <p className="text-muted-foreground">Gerencie os velórios e transmissões</p>
        </div>
```
To:
```tsx
      <header className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-foreground mb-2">Velórios</h1>
          <p className="text-muted-foreground">Gerencie os velórios e transmissões</p>
        </div>
```

- [ ] **Step 3: `src/pages/SalaManagement.tsx` — stack header**

Change:
```tsx
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl text-foreground mb-2">Salas de Velório</h1>
          <p className="text-muted-foreground">Gerencie as salas e as câmeras de cada uma</p>
        </div>
```
To:
```tsx
      <header className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-foreground mb-2">Salas de Velório</h1>
          <p className="text-muted-foreground">Gerencie as salas e as câmeras de cada uma</p>
        </div>
```

- [ ] **Step 4: `src/pages/UserManagement.tsx` — stack header**

Change:
```tsx
            <header className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="font-heading text-3xl text-foreground mb-2">Usuários</h1>
                    <p className="text-muted-foreground">Gerencie os usuários internos do sistema</p>
                </div>
                <InviteUserDialog />
            </header>
```
To:
```tsx
            <header className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="font-heading text-3xl text-foreground mb-2">Usuários</h1>
                    <p className="text-muted-foreground">Gerencie os usuários internos do sistema</p>
                </div>
                <InviteUserDialog />
            </header>
```

- [ ] **Step 5: Verify lint and build pass**

Run: `npm run lint && npm run build`
Expected: both commands exit with status 0.

- [ ] **Step 6: Manual check**

At 375px width, open `/admin/cameras`, `/admin/velorios`, `/admin/salas`, `/admin/usuarios`: title and subtitle sit above the action button(s), nothing is cut off or overlapping. At ≥1024px all four headers look exactly as before (title left, button right, same row).

- [ ] **Step 7: Commit**

```bash
git add src/pages/CameraManagement.tsx src/pages/VelorioManagement.tsx src/pages/SalaManagement.tsx src/pages/UserManagement.tsx
git commit -m "fix: stack admin page headers on mobile"
```

---

### Task 3: Let list-card action rows wrap instead of overflowing

**Files:**
- Modify: `src/pages/CameraManagement.tsx:198-199,210`
- Modify: `src/pages/VelorioManagement.tsx:544,591`
- Modify: `src/pages/SalaManagement.tsx:243`
- Modify: `src/pages/UserManagement.tsx:140-142,177`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed elsewhere — purely visual className changes.

- [ ] **Step 1: `src/pages/CameraManagement.tsx` — camera list row**

Change:
```tsx
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
```
To:
```tsx
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4 min-w-0">
```

(The right-hand action button group at line 234, `<div className="flex items-center gap-2">`, is left unchanged — 2-3 fixed-size icon buttons fit fine once the row can wrap.)

- [ ] **Step 2: `src/pages/VelorioManagement.tsx` — velorio list row**

Change (around line 544):
```tsx
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
```
To:
```tsx
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1 min-w-0">
```

Change (around line 591), the action button group:
```tsx
                    <div className="flex items-center gap-2">
```
To:
```tsx
                    <div className="flex items-center gap-2 flex-wrap">
```

- [ ] **Step 3: `src/pages/SalaManagement.tsx` — sala list row**

Change:
```tsx
                <CardContent className="p-4 flex items-center justify-between">
```
To:
```tsx
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
```

- [ ] **Step 4: `src/pages/UserManagement.tsx` — user list row**

Change (around line 140):
```tsx
                                    <div
                                        key={u.id}
                                        className={`flex items-center justify-between p-4 rounded-lg border ${
                                            u.is_active
                                                ? 'bg-secondary/30 border-border'
                                                : 'bg-muted/30 border-dashed border-border opacity-60'
                                        }`}
                                    >
```
To:
```tsx
                                    <div
                                        key={u.id}
                                        className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border ${
                                            u.is_active
                                                ? 'bg-secondary/30 border-border'
                                                : 'bg-muted/30 border-dashed border-border opacity-60'
                                        }`}
                                    >
```

Change (around line 177), the right-hand controls group:
```tsx
                                        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
```
To:
```tsx
                                        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap sm:flex-shrink-0 sm:ml-4">
```

- [ ] **Step 5: Verify lint and build pass**

Run: `npm run lint && npm run build`
Expected: both commands exit with status 0.

- [ ] **Step 6: Manual check**

At 375px width, open `/admin/cameras`, `/admin/velorios`, `/admin/salas`, `/admin/usuarios` with at least one existing row of data: no row causes horizontal page scrolling; action icon buttons and (for Usuários) the role `Select` are all reachable without being clipped. At ≥1024px all rows look exactly as before (single horizontal line).

- [ ] **Step 7: Commit**

```bash
git add src/pages/CameraManagement.tsx src/pages/VelorioManagement.tsx src/pages/SalaManagement.tsx src/pages/UserManagement.tsx
git commit -m "fix: allow admin list-card action rows to wrap on mobile"
```

---

### Task 4: Make hover-only buttons reachable on touch

**Files:**
- Modify: `src/pages/VelorioManagement.tsx:106-116`
- Modify: `src/pages/VelorioViewing.tsx:165-174`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed elsewhere — purely visual className changes.

- [ ] **Step 1: `src/pages/VelorioManagement.tsx` — delete-homenagem button in `HomenagensDialog`**

Change:
```tsx
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                  onClick={() => handleDelete(h.id)}
                  disabled={isDeleting}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
```
To:
```tsx
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                  onClick={() => handleDelete(h.id)}
                  disabled={isDeleting}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
```

- [ ] **Step 2: `src/pages/VelorioViewing.tsx` — fullscreen button on each camera tile**

Change:
```tsx
                              <button
                                onClick={(e) => {
                                  const container = (e.currentTarget as HTMLElement).closest('.group');
                                  container?.requestFullscreen?.();
                                }}
                                className="text-white/70 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                                title="Tela cheia"
                              >
```
To:
```tsx
                              <button
                                onClick={(e) => {
                                  const container = (e.currentTarget as HTMLElement).closest('.group');
                                  container?.requestFullscreen?.();
                                }}
                                className="text-white/70 hover:text-white transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100"
                                title="Tela cheia"
                              >
```

- [ ] **Step 3: Verify lint and build pass**

Run: `npm run lint && npm run build`
Expected: both commands exit with status 0.

- [ ] **Step 4: Manual check**

On a touch-emulated mobile viewport (devtools device toolbar, no mouse hover): open a velório with homenagens as an admin — the trash icon next to each message is visible without hovering. Open the velório viewing page with at least one live camera — the fullscreen icon on the camera tile is visible without hovering. At ≥1024px (desktop, mouse), both buttons are hidden until hovering the row/tile, same as before.

- [ ] **Step 5: Commit**

```bash
git add src/pages/VelorioManagement.tsx src/pages/VelorioViewing.tsx
git commit -m "fix: show hover-only action buttons by default on touch devices"
```

---

### Task 5: Let the velorio viewing header wrap on narrow screens

**Files:**
- Modify: `src/pages/VelorioViewing.tsx:73-104`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed elsewhere — purely visual className changes.

- [ ] **Step 1: Change the header container and right-hand group to allow wrapping**

Change:
```tsx
      <header className="border-b border-gold/20 bg-primary/95 backdrop-blur-sm sticky top-0 z-10 flex-shrink-0">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="text-cream hover:text-gold hover:bg-primary"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Sair
          </Button>

          <div className="flex items-center gap-3">
```
To:
```tsx
      <header className="border-b border-gold/20 bg-primary/95 backdrop-blur-sm sticky top-0 z-10 flex-shrink-0">
        <div className="container mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="text-cream hover:text-gold hover:bg-primary"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Sair
          </Button>

          <div className="flex items-center gap-3 flex-wrap">
```

- [ ] **Step 2: Verify lint and build pass**

Run: `npm run lint && npm run build`
Expected: both commands exit with status 0.

- [ ] **Step 3: Manual check**

At 320–375px width, open a velório viewing page (public link with a valid token): the "Sair" button, visitor counter, live status, and "Compartilhar" button wrap onto a second line instead of squeezing into one row or overflowing. At ≥1024px the header looks exactly as before (single row).

- [ ] **Step 4: Commit**

```bash
git add src/pages/VelorioViewing.tsx
git commit -m "fix: allow velorio viewing header to wrap on narrow screens"
```

---

### Task 6: Full cross-page manual verification

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Walk every touched page at 375px, 768px, and 1280px widths**

Pages: `/admin/dashboard`, `/admin/cameras`, `/admin/velorios`, `/admin/salas`, `/admin/usuarios`, and a velório viewing page (`/velorio/:id` or via public token entry).

For each: confirm no horizontal page scrollbar, no overlapping text/buttons, the admin drawer opens/closes correctly on mobile, and the 1280px view is unchanged from before this plan (compare against `git stash` of the pre-change branch if in doubt).

- [ ] **Step 3: Run final lint/build pass**

Run: `npm run lint && npm run build`
Expected: both commands exit with status 0.

- [ ] **Step 4: Report results to the user**

Summarize what was checked and any residual issues found (do not fix new issues outside this plan's scope without flagging them first).
