import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { HostEmpresaGate } from "./components/HostEmpresaGate";
import { HOST_SLUG } from "./lib/hostEmpresa";
import PublicAccess from "./pages/PublicAccess";
import VelorioViewing from "./pages/VelorioViewing";
import SalaPublicLink from "./pages/SalaPublicLink";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import CameraManagement from "./pages/CameraManagement";
import SalaManagement from "./pages/SalaManagement";
import VelorioManagement from "./pages/VelorioManagement";
import ReportsHub from "./pages/ReportsHub";
import AccessReports from "./pages/AccessReports";
import VelorioAudit from "./pages/VelorioAudit";
import VisitantesReport from "./pages/VisitantesReport";
import UserManagement from "./pages/UserManagement";
import SettingsHub from "./pages/SettingsHub";
import HomenagensTemplatesManagement from "./pages/HomenagensTemplatesManagement";
import NotFound from "./pages/NotFound";
import PlatformEmpresas from "./pages/platform/PlatformEmpresas";
import PlatformEmpresaNova from "./pages/platform/PlatformEmpresaNova";
import PlatformEmpresaDetalhe from "./pages/platform/PlatformEmpresaDetalhe";
import PlatformModelos from "./pages/platform/PlatformModelos";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <HostEmpresaGate>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<PublicAccess />} />
            <Route path="/velorio/:id" element={<VelorioViewing />} />
            <Route path="/:hashEmpresa/:salaSlug" element={<SalaPublicLink />} />
            {/* Subdomain only (spec 08): /<sala> without the hash. On app2 a one-segment URL stays NotFound. */}
            {HOST_SLUG && <Route path="/:salaSlug" element={<SalaPublicLink />} />}

            {/* Admin Routes */}
            <Route path="/admin" element={<AdminLogin />} />
            <Route path="/admin/dashboard" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/salas" element={<ProtectedRoute><SalaManagement /></ProtectedRoute>} />
            <Route path="/admin/cameras" element={<ProtectedRoute><CameraManagement /></ProtectedRoute>} />
            <Route path="/admin/velorios" element={<ProtectedRoute><VelorioManagement /></ProtectedRoute>} />

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

            {/* Platform (platform_admin only) — generic address only; a subdomain sends it to its own login */}
            {HOST_SLUG ? (
              <Route path="/platform/*" element={<Navigate to="/admin" replace />} />
            ) : (
              <>
                <Route path="/platform" element={<ProtectedRoute scope="platform"><PlatformEmpresas /></ProtectedRoute>} />
                <Route path="/platform/empresas/nova" element={<ProtectedRoute scope="platform"><PlatformEmpresaNova /></ProtectedRoute>} />
                <Route path="/platform/empresas/:id" element={<ProtectedRoute scope="platform"><PlatformEmpresaDetalhe /></ProtectedRoute>} />
                <Route path="/platform/modelos-homenagem" element={<ProtectedRoute scope="platform"><PlatformModelos /></ProtectedRoute>} />
              </>
            )}

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </HostEmpresaGate>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
