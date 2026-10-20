import { useEffect, useState } from 'preact/hooks';
import { useApp } from '../App';
import type { Collection } from '../types';
import { resizeImage, slugify } from '../util';

export function Categories() {
  const { api, toast, changed } = useApp();
  const [rows, setRows] = useState<Collection[] | null>(null);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.listCollections().then(setRows).catch(e => toast(e.message, 'error'));
  useEffect(() => { load(); }, []);

  const save = async (e: Event) => {
    e.preventDefault();
    if (!editing) return;
    const slug = editing.slug || slugify(editing.name);
    if (!slug) return toast('Give the category a name.', 'error');
    if (rows!.some(r => r.slug === slug && r.id !== editing.id)) return toast('Another category already uses that web address.', 'error');
    setBusy(true);
    try { await api.saveCollection({ ...editing, slug }); changed(); toast('Category saved'); setEditing(null); await load(); }
    catch (err) { toast((err as Error).message, 'error'); }
    finally { setBusy(false); }
  };

  const move = async (i: number, dir: -1 | 1) => {
    const a = [...rows!];
    [a[i], a[i + dir]] = [a[i + dir], a[i]];
    setRows(a);
    try { await Promise.all(a.map((c, k) => (c.sort !== k ? api.saveCollection({ ...c, sort: k }) : null))); changed(); await load(); }
    catch (err) { toast((err as Error).message, 'error'); }
  };

  const remove = async (c: Collection) => {
    if (!confirm(`Delete the “${c.name}” category? Its products stay, they just won’t be in this category.`)) return;
    try { await api.deleteCollection(c.id!); changed(); toast('Category deleted'); await load(); }
    catch (err) { toast((err as Error).message, 'error'); }
  };

  const upload = async (file: File | undefined) => {
    if (!file || !editing) return;
    try { const url = await api.uploadImage(await resizeImage(file, 940, 0.9), 'categories'); setEditing({ ...editing, image: url }); }
    catch (err) { toast((err as Error).message, 'error'); }
  };

  return (
    <section>
      <a href="#/products" class="back">← Products</a>
      <div class="head-row">
        <h1>Categories</h1>
        <button class="btn primary" onClick={() => setEditing({ name: '', slug: '', image: null, sort: rows?.length ?? 0 })}>+ Add category</button>
      </div>
      <p class="muted">These are the circles on the Home and Shop pages, in this order.</p>

      {editing && (
        <form class="card" onSubmit={save}>
          <h2>{editing.id ? 'Edit category' : 'New category'}</h2>
          <label>Name<input required value={editing.name} onInput={e => setEditing({ ...editing, name: e.currentTarget.value, slug: editing.id ? editing.slug : slugify(e.currentTarget.value) })} /></label>
          <p class="muted small">Web address: /products-list/collections/{editing.slug || slugify(editing.name) || '…'}</p>
          <div class="tile-edit">
            {editing.image ? <img src={editing.image} alt="" width="120" height="120" /> : <span class="noimg tile" />}
            <label class="btn small">{editing.image ? 'Change picture' : 'Add picture'}<input type="file" accept="image/*" hidden onChange={e => upload(e.currentTarget.files?.[0])} /></label>
          </div>
          <p class="muted small">Use a square picture. The current ones are pink circles with the name written on them.</p>
          <div class="savebar inline">
            <button type="button" class="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button class="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save category'}</button>
          </div>
        </form>
      )}

      {!rows ? <p class="muted">Loading…</p> : (
        <ul class="list">
          {rows.map((c, i) => (
            <li class="row">
              {c.image ? <img src={c.image} alt="" width="56" height="56" class="thumb round" /> : <span class="noimg thumb round" />}
              <div class="main"><strong>{c.name}</strong><span class="muted small">/{c.slug}</span></div>
              <div class="actions">
                <button class="icon" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button class="icon" title="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button class="btn small" onClick={() => setEditing(c)}>Edit</button>
                <button class="icon" title="Delete" onClick={() => remove(c)}>✕</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
