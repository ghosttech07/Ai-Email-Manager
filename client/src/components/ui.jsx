import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, CircleAlert, Clock, Hourglass, RotateCw, Star } from 'lucide-react';
import { OWNERS, eventWhen, firstName, initials, tint, waited } from '../lib.js';

/** The one status mark of the product: who owns the reply. */
export function OwnerTag({ owner, clientName, long = false }) {
  const o = OWNERS[owner];
  const label = owner === 'client' && clientName ? (long ? `${firstName(clientName)} to reply` : firstName(clientName)) : long ? o.label : o.short;
  return <span className={`owner o-${owner}`}>{label}</span>;
}

export function Avatar({ name, small }) {
  return <span className={`avatar ${small ? 'sm' : ''}`} style={tint(name)} aria-hidden="true">{initials(name)}</span>;
}

/** A button with a popover menu. Closes on outside click and Escape. */
export function Menu({ trigger, children, align = 'left' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && <div className={`menu ${align === 'right' ? 'right' : ''}`} role="menu" onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}

/** Change who owns the reply. The AI's own choice stays visible so a correction is a choice, not a guess. */
export function OwnerMenu({ thread, clientName, onPick, onReclassify }) {
  const options = ['assistant', 'client', 'none'];
  return (
    <Menu
      trigger={({ toggle, open }) => (
        <button className={`owner o-${thread.responsibility}`} onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label={`Reply owner: ${OWNERS[thread.responsibility].label}. Change`}>
          {thread.responsibility === 'client' ? `${firstName(clientName)} to reply` : OWNERS[thread.responsibility].label}
          <ChevronDown />
        </button>
      )}
    >
      <div className="menu-label">Who should reply?</div>
      {options.map((o) => (
        <button key={o} className={`menu-item o-${o}`} role="menuitem" onClick={() => onPick(o)}>
          <span className="dot" />
          {o === 'client' ? `${firstName(clientName)} to reply` : OWNERS[o].label}
          {thread.ai.responsibility === o && <span className="small muted">AI's pick</span>}
          {thread.responsibility === o && <Check className="check" />}
        </button>
      ))}
      <div className="menu-rule" />
      <button className="menu-item" role="menuitem" onClick={onReclassify}><RotateCw size={14} /> Ask the AI again</button>
    </Menu>
  );
}

export function Dialog({ title, onClose, children, footer }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function BlockError({ message, onRetry }) {
  return (
    <div className="block-error" role="alert">
      <CircleAlert />
      <span>{message}</span>
      {onRetry && <button onClick={onRetry}>Retry</button>}
    </div>
  );
}

/** Loading rows keep the real row's pitch so nothing shifts when data lands. */
export function SkeletonRows({ count = 5, height = 52 }) {
  return Array.from({ length: count }, (_, i) => (
    <div key={i} className="line" style={{ minHeight: height }} aria-hidden="true">
      <div className="line-main" style={{ gap: 8 }}>
        <span className="skeleton" style={{ width: `${38 + ((i * 17) % 30)}%` }} />
        <span className="skeleton" style={{ width: `${60 + ((i * 11) % 30)}%`, height: 10 }} />
      </div>
    </div>
  ));
}

/** Small grey facts under a row: a deadline, a meeting, waiting, important. */
export function ThreadFlags({ thread }) {
  const deadline = thread.ai.events.find((e) => e.kind === 'deadline');
  const meeting = thread.ai.events.find((e) => e.kind === 'meeting');
  return (
    <>
      {thread.waiting && <span className="flag"><Hourglass /> Waiting {waited(thread.lastMessageAt)}</span>}
      {deadline && thread.responsibility !== 'none' && <span className="flag urgent"><Clock /> Due {eventWhen(deadline).replace(/^T/, 't')}</span>}
      {!deadline && meeting && <span className="flag"><Clock /> {eventWhen(meeting)}</span>}
      {thread.important && <span className="flag star" title="Important"><Star fill="currentColor" /><span className="sr-only">Important</span></span>}
    </>
  );
}
