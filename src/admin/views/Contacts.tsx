import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp } from '../App';
import type { Contact } from '../types';
import { download, fmtDate, toCsv } from '../util';

export function Contacts() {
  const { api, toast } = useApp();
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [q, setQ] = useState('');
  const [onlyNews, setOnlyNews] = useState(false);

  useEffect(() => { api.listContacts().then(setRows).catch(e => toast(e.message, 'error')); }, []);

  const shown = useMemo(() => (rows ?? []).filter(c =>
    (!onlyNews || c.newsletter) && `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(q.trim().toLowerCase())), [rows, q, onlyNews]);

  const exportCsv = () => download(`beadedbychar-${onlyNews ? 'newsletter' : 'customers'}-${new Date().toISOString().slice(0, 10)}.csv`,
    toCsv(shown.map(c => ({ first_name: c.first_name, last_name: c.last_name, email: c.email, phone: c.phone, newsletter: c.newsletter ? 'yes' : 'no', joined: c.created_at.slice(0, 10) }))));

  return (
    <section>
      <div class="head-row">
        <h1>Customers</h1>
        <button class="btn" disabled={!shown.length} onClick={exportCsv}>Download CSV</button>
      </div>
      <div class="seg">
        <button class={!onlyNews ? 'on' : ''} onClick={() => setOnlyNews(false)}>Everyone{rows ? ` (${rows.length})` : ''}</button>
        <button class={onlyNews ? 'on' : ''} onClick={() => setOnlyNews(true)}>Newsletter{rows ? ` (${rows.filter(r => r.newsletter).length})` : ''}</button>
      </div>
      <input class="search" type="search" placeholder="Search by name or email" value={q} onInput={e => setQ(e.currentTarget.value)} />
      {!rows ? <p class="muted">Loading…</p> : shown.length === 0 ? <p class="empty">Nobody matches.</p> : (
        <ul class="list">
          {shown.map(c => (
            <li class="row">
              <div class="main">
                <strong>{`${c.first_name} ${c.last_name}`.trim() || c.email}</strong>
                <a class="muted" href={`mailto:${c.email}`}>{c.email}</a>
                <span class="pills">
                  {c.newsletter && <span class="pill green">Newsletter</span>}
                  <span class="muted small">Since {fmtDate(c.created_at)}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
