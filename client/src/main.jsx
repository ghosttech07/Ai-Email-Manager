import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import { InboxProvider, SessionProvider, ToastProvider, useSession } from './state.jsx';
import { Shell } from './components/Shell.jsx';
import { Welcome } from './pages/Welcome.jsx';
import { Onboarding } from './pages/Onboarding.jsx';
import { Overview } from './pages/Overview.jsx';
import { InboxPage } from './pages/Inbox.jsx';
import { SettingsPage } from './pages/Settings.jsx';
import { ClientView } from './pages/ClientView.jsx';

/** Signed-in area. People who have not connected a mailbox yet are sent through onboarding. */
function Workspace() {
  const { status, user } = useSession();
  if (status === 'loading') return <div className="onboard"><span className="muted">Opening your workspace…</span></div>;
  if (status === 'anonymous') return <Navigate to="/" replace />;
  if (!user.onboarded) return <Navigate to="/onboarding" replace />;
  return <InboxProvider><Shell /></InboxProvider>;
}

function Entry() {
  const { status, user } = useSession();
  if (status === 'loading') return <div className="onboard"><span className="muted">Opening your workspace…</span></div>;
  if (status === 'ready') return <Navigate to={user.onboarded ? '/app' : '/onboarding'} replace />;
  return <Welcome />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <Routes>
            <Route path="/" element={<Entry />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/app" element={<Workspace />}>
              <Route index element={<Overview />} />
              <Route path="inbox" element={<Navigate to="/app/inbox/inbox" replace />} />
              <Route path="inbox/:segment/:threadId?" element={<InboxPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="/c/:token" element={<ClientView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
