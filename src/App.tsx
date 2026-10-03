import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { ThemeModeProvider } from './theme/ThemeModeContext'
import { CameraSelectionProvider } from './state/CameraSelectionContext'
import { TicketsProvider } from './state/TicketsContext'
import { TicketQueryProvider } from './state/TicketQueryContext'
import { IntegrationsProvider } from './state/IntegrationsContext'
import AppShell from './layout/AppShell'
import LoginPage from './pages/LoginPage'
import EarthModule from './modules/earth/EarthModule'
import ModulePlaceholder from './modules/ModulePlaceholder'
import Administration from './modules/admin/Administration'
import { MODULES } from './layout/modules'

function RequireAuth() {
  const { currentUser } = useAuth()
  if (!currentUser) return <Navigate to="/login" replace />
  return <Outlet />
}

export default function App() {
  return (
    <ThemeModeProvider>
      <AuthProvider>
        <CameraSelectionProvider>
          <TicketsProvider>
            <IntegrationsProvider>
              <TicketQueryProvider>
                <BrowserRouter>
                  <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route element={<RequireAuth />}>
                      <Route element={<AppShell />}>
                        <Route path="/earth" element={<EarthModule />} />
                        <Route path="/administration" element={<Administration />} />
                        {MODULES.filter((m) => m.id !== 'earth' && m.id !== 'administration').map((m) => (
                          <Route key={m.id} path={m.path} element={<ModulePlaceholder moduleId={m.id} />} />
                        ))}
                      </Route>
                    </Route>
                    <Route path="*" element={<Navigate to="/earth" replace />} />
                  </Routes>
                </BrowserRouter>
              </TicketQueryProvider>
            </IntegrationsProvider>
          </TicketsProvider>
        </CameraSelectionProvider>
      </AuthProvider>
    </ThemeModeProvider>
  )
}
