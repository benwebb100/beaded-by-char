import { useEffect, useState } from 'preact/hooks';
import { go, useApp } from '../App';
import type { Collection, Option, Price, Product } from '../types';
import { htmlToText, newId, resizeImage, syncVariants, textToHtml, variantLabel } from '../util';

const blank = (): Product => ({
  name: '', description: '', visible: true, images: [], options: [], collection_ids: [],
  prices: [{ option_value_ids: [], amount: 0, track_inventory: true, quantity: 1, allow_out_of_stock: false, active: true }],
});

export function ProductEdit({ id }: { id?: string }) {
  const { api, toast, changed } = useApp();
  const [p, setP] = useState<Product | null>(id ? null : blank());
  const [text, setText] = useState('');
  const [cats, setCats] = useState<Collection[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api.listCollections().then(setCats).catch(() => {});
    if (id) api.getProduct(id).then(x => { setP(x); setText(htmlToText(x.description)); }).catch(e => toast(e.message, 'error'));
  }, [id]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!p) return <p class="muted">Loading…</p>;
  const set = (patch: Partial<Product>) => { setP({ ...p, ...patch }); setDirty(true); };
  const setOptions = (options: Option[]) => set({ options, prices: syncVariants(options, p.prices, p.options) });
  const setPrice = (i: number, patch: Partial<Price>) => set({ prices: p.prices.map((x, k) => (k === i ? { ...x, ...patch } : x)) });

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(files.length);
    const added: string[] = [];
    for (const f of Array.from(files)) {
      try { added.push(await api.uploadImage(await resizeImage(f), p.id ?? 'new')); }
      catch (e) { toast(`${f.name}: ${(e as Error).message}`, 'error'); }
      setUploading(n => n - 1);
    }
    setP(prev => ({ ...prev!, images: [...prev!.images, ...added] }));   // other edits may have happened meanwhile
    setDirty(true);
  };
  const moveImage = (i: number, to: number) => { const a = [...p.images]; const [x] = a.splice(i, 1); a.splice(to, 0, x); set({ images: a }); };

  const save = async (e: Event) => {
    e.preventDefault();
    if (!p.name.trim()) return toast('Give the product a name.', 'error');
    if (p.options.some(o => !o.name.trim() || !o.values.length)) return toast('Each option needs a name and at least one choice.', 'error');
    if (p.prices.some(x => !(x.amount >= 0))) return toast('Every option needs a price.', 'error');
    setBusy(true);
    try {
      const savedId = await api.saveProduct({ ...p, description: textToHtml(text) });
      setDirty(false);
      changed();
      toast('Saved');
      if (!id) go(`/products/${savedId}`);
      else setP(await api.getProduct(savedId));
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!id || !confirm(`Delete “${p.name}” for good? Past orders keep their details. To take it off the website for now, untick “Show on website” instead.`)) return;
    try { await api.deleteProduct(id); changed(); toast('Product deleted'); go('/products'); }
    catch (e) { toast((e as Error).message, 'error'); }
  };

  return (
    <form onSubmit={save}>
      <a href="#/products" class="back">← Products</a>
      <div class="head-row">
        <h1>{id ? p.name || 'Product' : 'New product'}</h1>
        {id && p.visible && <a class="link" target="_blank" href={`/product-details/product/${id}`}>View on website ↗</a>}
      </div>

      <div class="grid2">
        <div>
          <div class="card">
            <label>Name<input required value={p.name} onInput={e => set({ name: e.currentTarget.value })} /></label>
            <label>Description<textarea rows={7} value={text} placeholder="Leave a blank line between paragraphs" onInput={e => { setText(e.currentTarget.value); setDirty(true); }} /></label>
            <label class="check"><input type="checkbox" checked={p.visible} onChange={e => set({ visible: e.currentTarget.checked })} /> Show on website</label>
          </div>

          <div class="card">
            <h2>Photos</h2>
            <p class="muted small">The first photo is the main one.</p>
            <div class="photos">
              {p.images.map((src, i) => (
                <figure>
                  <img src={src} alt="" width="110" height="110" />
                  <figcaption>
                    {i > 0 && <button type="button" class="icon" title="Move left" onClick={() => moveImage(i, i - 1)}>←</button>}
                    {i > 0 && <button type="button" class="icon" title="Make main photo" onClick={() => moveImage(i, 0)}>★</button>}
                    <button type="button" class="icon" title="Remove" onClick={() => set({ images: p.images.filter((_, k) => k !== i) })}>✕</button>
                  </figcaption>
                </figure>
              ))}
              <label class="add-photo">
                {uploading ? `Uploading ${uploading}…` : '+ Add photos'}
                <input type="file" accept="image/*" multiple hidden onChange={e => { addPhotos(e.currentTarget.files); e.currentTarget.value = ''; }} />
              </label>
            </div>
          </div>

          <div class="card">
            <h2>Categories</h2>
            <div class="checks">
              {cats.map(c => (
                <label class="check">
                  <input type="checkbox" checked={p.collection_ids.includes(c.id!)}
                    onChange={e => set({ collection_ids: e.currentTarget.checked ? [...p.collection_ids, c.id!] : p.collection_ids.filter(x => x !== c.id) })} />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div class="card">
            <h2>Options</h2>
            <p class="muted small">For things like scent or colour. Leave empty if there’s only one version.</p>
            {p.options.map((o, i) => (
              <div class="option">
                <div class="option-head">
                  <input placeholder="Option name, e.g. Scent" value={o.name} onInput={e => setOptions(p.options.map((x, k) => (k === i ? { ...x, name: e.currentTarget.value } : x)))} />
                  <button type="button" class="icon" title="Remove option" onClick={() => setOptions(p.options.filter((_, k) => k !== i))}>✕</button>
                </div>
                <div class="chips">
                  {o.values.map(v => (
                    <span class="chip">{v.name}<button type="button" title={`Remove ${v.name}`} onClick={() => setOptions(p.options.map((x, k) => (k === i ? { ...x, values: x.values.filter(y => y.id !== v.id) } : x)))}>✕</button></span>
                  ))}
                  <input class="chip-input" placeholder="Add a choice, press Enter" onKeyDown={e => {
                    if (e.key !== 'Enter' && e.key !== ',') return;
                    e.preventDefault();
                    const name = e.currentTarget.value.trim();
                    if (!name || o.values.some(v => v.name.toLowerCase() === name.toLowerCase())) return;
                    e.currentTarget.value = '';
                    setOptions(p.options.map((x, k) => (k === i ? { ...x, values: [...x.values, { id: newId(), name }] } : x)));
                  }} />
                </div>
              </div>
            ))}
            {p.options.length < 3 && <button type="button" class="btn small" onClick={() => setOptions([...p.options, { id: newId(), name: '', values: [] }])}>+ Add option</button>}
          </div>

          <div class="card">
            <h2>{p.options.length ? 'Prices and stock for each choice' : 'Price and stock'}</h2>
            <div class="variants">
              {p.prices.map((x, i) => (
                <div class={`variant ${x.active ? '' : 'off'}`}>
                  {p.options.length > 0 && <strong class="vname">{variantLabel(p.options, x.option_value_ids) || '—'}</strong>}
                  <label class="inline">Price $<input type="number" min="0" step="0.01" inputmode="decimal" required value={x.amount} onInput={e => setPrice(i, { amount: Number(e.currentTarget.value) })} /></label>
                  <label class="check"><input type="checkbox" checked={x.track_inventory} onChange={e => setPrice(i, { track_inventory: e.currentTarget.checked, quantity: e.currentTarget.checked ? (x.quantity ?? 0) : x.quantity })} /> Track stock</label>
                  {x.track_inventory && <label class="inline">In stock<input type="number" min="0" step="1" inputmode="numeric" value={x.quantity ?? 0} onInput={e => setPrice(i, { quantity: Math.max(0, Math.floor(Number(e.currentTarget.value))) })} /></label>}
                  {x.track_inventory && <label class="check"><input type="checkbox" checked={x.allow_out_of_stock} onChange={e => setPrice(i, { allow_out_of_stock: e.currentTarget.checked })} /> Keep selling at 0 (made to order)</label>}
                  {p.options.length > 0 && <label class="check"><input type="checkbox" checked={x.active} onChange={e => setPrice(i, { active: e.currentTarget.checked })} /> Available</label>}
                </div>
              ))}
              {p.prices.length === 0 && <p class="muted">Add at least one choice to each option.</p>}
            </div>
          </div>
        </div>
      </div>

      <div class="savebar">
        {id && <button type="button" class="btn danger" onClick={remove}>Delete</button>}
        <span class="spacer" />
        {dirty && <span class="muted small">Unsaved changes</span>}
        <button class="btn primary" disabled={busy || uploading > 0}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}
