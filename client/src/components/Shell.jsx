import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import {
  AlarmClock, Archive, CalendarDays, CheckCheck, CircleHelp, ExternalLink, Hourglass, Inbox, LayoutGrid, LogOut, MailPlus,
  Menu as MenuIcon, MinusCircle, Newspaper, Search, Settings, Sparkles, Star, User, UserCheck, X,
} from 'lucide-react';
import { OWNERS, api, firstName } from '../lib.js';
import { useInbox, useSession, useToast } from '../state.jsx';
import { Avatar, Menu } from './ui.jsx';
import { AskPanel } from './AskPanel.jsx';

const OWNER_NAV = [
  { id: 'assistant', icon: UserCheck, hot: true },
  { id: 'client', icon: User },
  { id: 'review', icon: CircleHelp, hot: true },
  { id: 'none', icon: MinusCircle },
];
const VIEW_NAV = [
  { id: 'action', label: 'Action required', icon: AlarmClock, count: true },
  { id: 'waiting', label: 'Waiting for response', icon: Hourglass, count: true },
  { id: 'meetings', label: 'Meetings', icon: CalendarDays },
  { id: 'important', label: 'Important', icon: Star },
  { id: 'general', label: 'General', icon: Newspaper },
];

export function Shell() {
  const { user, signOut } = useSession();
  const { counts, accounts, query, setQuery, put } = useInbox();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const open = useMatch('/app/inbox/:segment/:threadId');
  const threadId = open?.params.threadId;
  const [navOpen, setNavOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [arriving, setArriving] = useState(false);
  const searchRef = useRef(null);
  const client = firstName(user.clientName);

  useEffect(() => setNavOpen(false), [location.pathname]);
  useEffect(() => {
    const keys = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setAsking((v) => !v); }
    };
    document.addEventListener('keydown', keys);
    return () => document.removeEventListener('keydown', keys);
  }, []);

  // Keep the open conversation when switching segment, so context is never lost.
  const seg = (id) => `/app/inbox/${id}${threadId ? `/${threadId}` : ''}`;

  function onSearch(value) {
    setQuery(value);
    if (value && !location.pathname.startsWith('/app/inbox')) navigate('/app/inbox/inbox');
  }

  async function simulateIncoming() {
    setArriving(true);
    try {
      const { thread } = await api('/simulate/incoming', { method: 'POST' });
      put(thread);
      const moved = thread.reclassified && Date.now() - new Date(thread.reclassified.at) < 5000;
      toast(
        moved
          ? `${thread.from.name} replied. AI moved it from ${OWNERS[thread.reclassified.from].label} to ${OWNERS[thread.reclassified.to].label}.`
          : `New email from ${thread.from.name}: ${thread.responsibility === 'client' ? `${client} to reply` : OWNERS[thread.responsibility].label}.`,
        { action: { label: 'Open', run: () => navigate(`/app/inbox/inbox/${thread.id}`) } },
      );
    } catch (e) {
      toast(e.message, { tone: 'error' });
    } finally {
      setArriving(false);
    }
  }

  return (
    <div className={`app ${navOpen ? 'nav-open' : ''} ${threadId ? 'in-thread' : ''}`}>
      <nav className="sidebar" aria-label="Main">
        <div className="row">
          <Link to="/app" className="brand"><img src="/mark.svg" alt="" />Handoff</Link>
          <span className="spacer" />
          <button className="icon-btn mobile-only" onClick={() => setNavOpen(false)} aria-label="Close menu"><X /></button>
        </div>
        <div className="scope">
          <Avatar name={user.clientName} />
          <div className="truncate"><b className="truncate">{user.clientName}</b><span className="small muted">Client inbox</span></div>
        </div>

        <NavLink end to="/app" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><LayoutGrid /> Overview</NavLink>
        <NavLink to={seg('inbox')} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Inbox /> Inbox {counts.unread > 0 && <span className="nav-count">{counts.unread} unread</span>}
        </NavLink>

        <div className="nav-group">Who replies</div>
        {OWNER_NAV.map(({ id, icon: Icon, hot }) => (
          <NavLink key={id} to={seg(id)} className={({ isActive }) => `nav-item o-${id} ${isActive ? 'active' : ''}`}>
            <Icon /> {id === 'client' ? `${client} to reply` : OWNERS[id].label}
            {counts[id] > 0 && <span className={`nav-count ${hot ? 'hot' : ''}`}>{counts[id]}</span>}
          </NavLink>
        ))}

        <div className="nav-group">Views</div>
        {VIEW_NAV.map(({ id, label, icon: Icon, count }) => (
          <NavLink key={id} to={seg(id)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon /> {label} {count && counts[id] > 0 && <span className="nav-count">{counts[id]}</span>}
          </NavLink>
        ))}
        <NavLink to={seg('done')} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><CheckCheck /> Done</NavLink>
        <NavLink to={seg('archived')} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Archive /> Archived</NavLink>

        <div className="sidebar-foot">
          {accounts.map((a) => (
            <div key={a.id} className="mailbox" title={a.email}>
              <span className={`status-dot ${a.status === 'synced' ? '' : a.status}`} />
              <span className="truncate">{a.email}</span>
              <span style={{ flex: 'none' }}>{a.status === 'syncing' ? `${a.progress.done}/${a.progress.total || '…'}` : a.status === 'error' ? 'Sync failed' : ''}</span>
            </div>
          ))}
          <NavLink to="/app/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ marginTop: 6 }}><Settings /> Mailboxes and settings</NavLink>
          <a className="nav-item" href={`/c/${user.clientToken}`} target="_blank" rel="noreferrer"><ExternalLink /> Open {client}'s view</a>
        </div>
      </nav>

      <header className="topbar">
        <button className="icon-btn menu-btn" onClick={() => setNavOpen(true)} aria-label="Open menu"><MenuIcon /></button>
        <div className="search">
          <Search />
          <input ref={searchRef} type="search" value={query} onChange={(e) => onSearch(e.target.value)} placeholder="Search conversations" aria-label="Search conversations" />
          <kbd>Ctrl K</kbd>
        </div>
        <button className="btn desktop-only" onClick={simulateIncoming} disabled={arriving} title="Prototype control: delivers the next sample email so you can watch the AI classify it">
          <MailPlus /> {arriving ? 'Arriving…' : 'Simulate new email'}
        </button>
        <button className="icon-btn mobile-only" onClick={simulateIncoming} disabled={arriving} aria-label="Simulate new email"><MailPlus /></button>
        <button className="btn" onClick={() => setAsking((v) => !v)} aria-expanded={asking}><Sparkles /> <span className="desktop-only">Ask</span></button>
        <Menu
          align="right"
          trigger={({ toggle }) => (
            <button onClick={toggle} aria-label="Account" style={{ border: 0, background: 'none', padding: 0, borderRadius: '50%' }}><Avatar name={user.name} /></button>
          )}
        >
          <div style={{ padding: '6px 8px' }}><b style={{ fontWeight: 600 }}>{user.name}</b><div className="small muted">{user.demo ? 'Demo workspace' : user.email}</div></div>
          <div className="menu-rule" />
          <button className="menu-item" onClick={() => navigate('/app/settings')}><Settings size={16} /> Mailboxes and settings</button>
          <button className="menu-item" onClick={signOut}><LogOut size={16} /> Log out</button>
        </Menu>
      </header>

      <main className="sheet"><Outlet /></main>

      {/* Phone: the five places people go most, within thumb reach. Hidden while reading a conversation. */}
      {!threadId && (
        <nav className="bottom-nav" aria-label="Quick navigation">
          <NavLink end to="/app" className={({ isActive }) => (isActive ? 'on' : '')}><LayoutGrid /><span>Overview</span></NavLink>
          <NavLink to="/app/inbox/inbox" className={({ isActive }) => (isActive ? 'on' : '')}><Inbox /><span>Inbox</span></NavLink>
          <NavLink to="/app/inbox/assistant" className={({ isActive }) => `o-assistant ${isActive ? 'on' : ''}`}>
            <UserCheck /><span>To reply</span>{counts.assistant > 0 && <i>{counts.assistant}</i>}
          </NavLink>
          <NavLink to="/app/inbox/client" className={({ isActive }) => (isActive ? 'on' : '')}><User /><span>{client}</span></NavLink>
          <button onClick={() => setAsking(true)}><Sparkles /><span>Ask</span></button>
        </nav>
      )}
      {asking && <AskPanel threadId={threadId} onClose={() => setAsking(false)} />}
    </div>
  );
}
