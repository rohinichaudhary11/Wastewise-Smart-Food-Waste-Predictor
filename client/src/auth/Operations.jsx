import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDownload, apiFetch } from './api.js';
import Dashboard from './Dashboard.jsx';
import DailyFoodEntry from './DailyFoodEntry.jsx';
import { AccuracyPage, TomorrowPlan } from './Forecasting.jsx';
import { RecommendationsPage, WasteAnalyticsPage } from './InsightsPages.jsx';
import './operations.css';

const meals = ['breakfast', 'lunch', 'snacks', 'dinner'];
const eventTypes = [
  ['holiday', 'Holiday'], ['exam', 'Exam day'], ['college_event', 'College event'],
  ['vacation', 'Vacation'], ['special_menu', 'Special menu']
];
const today = () => new Date().toLocaleDateString('en-CA');
const mealName = meal => meal.charAt(0).toUpperCase() + meal.slice(1);

export default function Operations({ outletsQuery, role, initialView = 'dashboard', onNavigate, hideNavigation = false, timezone }) {
  const [view, setView] = useState(initialView);
  const [notice, setNotice] = useState('');
  const outlets = outletsQuery.data?.data || [];
  const [outletId, setOutletId] = useState('');
  const cache = useQueryClient();
  useEffect(() => setView(initialView), [initialView]);
  useEffect(() => {
    if (!outletId && outlets.length) setOutletId(outlets[0]._id);
    if (outletId && !outlets.some(outlet => outlet._id === outletId) && outlets.length) setOutletId(outlets[0]._id);
  }, [outletId, outlets]);
  const notify = async message => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['menu'] }),
      cache.invalidateQueries({ queryKey: ['logs'] }),
      cache.invalidateQueries({ queryKey: ['calendar'] })
    ]);
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3500);
  };
  const activeOutlet = outlets.find(outlet => outlet._id === outletId);
  const pageCopy = ({
    dashboard: ['Kitchen overview', 'A clear view of today’s records and the patterns behind better preparation.'],
    entry: ['Daily Food Entry', 'Record today’s food preparation and consumption to improve tomorrow’s predictions.'],
    plan: ['Tomorrow’s Smart Forecast', 'Review demand estimates built from this outlet’s own service history.'],
    analytics: ['Waste Analytics', 'Understand where food waste happens and discover opportunities to reduce it.'],
    recommendations: ['Smart Recommendations', 'Small preparation changes can create a big environmental impact.'],
    reports: ['History & Reports', 'Review recorded services and export your weekly summary.'],
    menu: ['Menu Management', 'Manage the food items and preparation units for this outlet.'],
    calendar: ['Kitchen Calendar', 'Add events that can affect service demand.'],
    csv: ['Import & Export', 'Move daily service records with a validated CSV workflow.']
  })[view] || ['Kitchen Operations', 'Manage daily service records for this outlet.'];
  const sections = [['plan', 'Tomorrow’s plan'], ['dashboard', 'Dashboard'], ['accuracy', 'Accuracy'], ['reports', 'Weekly report'], ['entry', 'Daily entry'], ['menu', 'Menu'], ['calendar', 'Calendar'], ['csv', 'CSV import / export']];
  return <section className="operations-shell" aria-label="Daily operations">
    <div className="ops-heading"><div><span className="eyebrow">WASTEWISE WORKSPACE</span><h2>{pageCopy[0]}</h2><p>{pageCopy[1]}</p></div><label className="outlet-picker"><span>Outlet</span><select value={outletId} onChange={event => setOutletId(event.target.value)} disabled={outletsQuery.isPending || outlets.length === 0} aria-label="Active outlet">{outlets.map(outlet => <option key={outlet._id} value={outlet._id}>{outlet.name}</option>)}</select></label></div>
    {!hideNavigation&&<nav className="ops-nav" aria-label="Kitchen operations sections">{sections.map(([key, label]) => <button key={key} type="button" className={view === key ? 'active' : ''} aria-current={view === key ? 'page' : undefined} onClick={() => { setNotice(''); setView(key); onNavigate?.(key); }}>{label}</button>)}</nav>}
    {outletsQuery.isPending ? <StatePanel title="Loading outlets" message="Getting your organisation locations." loading/> : outletsQuery.isError ? <StatePanel title="Outlets could not load" message={outletsQuery.error.message} retry={outletsQuery.refetch}/> : outlets.length === 0 ? <StatePanel title="Add an outlet first" message="An outlet is needed before you can add menu items or daily records."/> : <>
      {view === 'plan' && <TomorrowPlan outletId={outletId} timezone={activeOutlet?.timezone} role={role}/>}
      {view === 'accuracy' && <AccuracyPage outletId={outletId} timezone={activeOutlet?.timezone}/>}
      {view === 'reports' && <WeeklyReport outletId={outletId} timezone={activeOutlet?.timezone}/>}
      {view === 'entry' && <DailyFoodEntry outletId={outletId} timezone={activeOutlet?.timezone || timezone} onSaved={notify} onManageMenu={() => { setView('menu'); onNavigate?.('menu'); }}/>}
      {view === 'dashboard' && <Dashboard outletId={outletId} role={role} onNavigate={section => { setView(section); onNavigate?.(section); }} timezone={activeOutlet?.timezone || timezone}/>}
      {view === 'analytics' && <WasteAnalyticsPage outletId={outletId} timezone={activeOutlet?.timezone || timezone}/>}
      {view === 'recommendations' && <RecommendationsPage outletId={outletId} timezone={activeOutlet?.timezone || timezone}/>}
      {view === 'menu' && <MenuPage outletId={outletId} role={role} onSaved={notify}/>}
      {view === 'calendar' && <CalendarPage outletId={outletId} outlets={outlets} role={role} onSaved={notify}/>}
      {view === 'csv' && <CsvPage outletId={outletId} onImported={notify}/>}
    </>}
    {notice && <div className="ops-notice" role="status">{notice}</div>}
  </section>;
}

function WeeklyReport({ outletId, timezone }) {
  const [weekOf, setWeekOf] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'Asia/Kolkata' }).format(new Date()));
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  useEffect(() => setWeekOf(new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'Asia/Kolkata' }).format(new Date())), [timezone]);
  const download = async event => {
    event.preventDefault(); setError(''); setDownloading(true);
    try {
      const result = await apiDownload(`/reports/weekly?outletId=${encodeURIComponent(outletId)}&weekOf=${encodeURIComponent(weekOf)}`);
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a'); link.href = url; link.download = result.filename; link.click();
      URL.revokeObjectURL(url);
    } catch (reason) { setError(reason.message); }
    finally { setDownloading(false); }
  };
  return <section className="ops-panel"><PanelHeading title="Weekly PDF report" detail="Download a shareable summary of kitchen preparation, recorded waste, cost and sell-outs."/>
    <form className="ops-form" onSubmit={download}><div className="ops-form-grid"><label>Choose any date in the week<input type="date" required value={weekOf} onChange={event => setWeekOf(event.target.value)}/></label></div>
      <p className="field-hint">The report covers Monday through Sunday in the outlet’s calendar dates. Waste cost uses current menu item costs and is an estimate.</p>
      {error && <div className="form-alert" role="alert">{error}</div>}
      <button className="ops-primary" type="submit" disabled={downloading || !outletId}>{downloading ? 'Preparing report…' : 'Download weekly PDF'}</button>
    </form>
  </section>;
}

export function MenuManagement({ outlets = [], role, onSaved }) {
  const [outletId, setOutletId] = useState('');
  useEffect(() => {
    if (!outletId && outlets.length) setOutletId(outlets[0]._id);
    if (outletId && !outlets.some(outlet => outlet._id === outletId) && outlets.length) setOutletId(outlets[0]._id);
  }, [outletId, outlets]);
  if (!outlets.length) return <StatePanel title="No outlet available" message="Add an outlet before creating menu items."/>;
  return <section className="content-card menu-management-card"><div className="card-heading"><div><h2>Menu items</h2><p>Add the foods your kitchen prepares so they can be selected in Daily Food Entry.</p></div><label className="menu-outlet-select"><span>Outlet</span><select value={outletId} onChange={event => setOutletId(event.target.value)} aria-label="Menu outlet">{outlets.map(outlet => <option key={outlet._id} value={outlet._id}>{outlet.name}</option>)}</select></label></div><MenuPage outletId={outletId} role={role} onSaved={onSaved}/></section>;
}

function MenuPage({ outletId, role, onSaved }) {
  const admin = role === 'admin';
  const [editing, setEditing] = useState(null);
  const items = useQuery({ queryKey: ['menu', outletId, admin ? 'all' : 'active'], queryFn: () => apiFetch(`/menu-items?outletId=${encodeURIComponent(outletId)}&includeInactive=${admin}`), enabled: Boolean(outletId) });
  const activeItems = items.data?.data || [];
  return <section className="ops-panel"><PanelHeading title="Menu items" detail="Portion units, cost and batch size are used by later forecasting."/>
    {admin && <MenuEditor outletId={outletId} item={editing} onCancel={() => setEditing(null)} onSaved={async message => { setEditing(null); await onSaved(message); }}/>}
    {items.isPending ? <StatePanel title="Loading menu" message="Fetching menu items for this outlet." loading/> : items.isError ? <StatePanel title="Menu could not load" message={items.error.message} retry={items.refetch}/> : activeItems.length === 0 ? <StatePanel title="No menu items yet" message={admin ? 'Add the items your kitchen prepares at this outlet.' : 'Ask an administrator to add menu items for this outlet.'}/> : <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Item</th><th>Category</th><th>Unit</th><th>Cost / unit</th><th>Batch size</th><th>Shelf life</th>{admin && <th>Actions</th>}</tr></thead><tbody>{activeItems.map(item => <tr key={item._id}><td><strong>{item.name}</strong><small className="ops-id">ID {item._id}</small>{item.isSafelyReusable && <small className="item-tag">Reusable</small>}</td><td>{item.category}</td><td>{item.unit}</td><td>₹{Number(item.costPerUnit).toFixed(2)}</td><td>{item.batchSize} {item.unit}</td><td>{item.shelfLifeHours} h</td>{admin && <td className="ops-actions"><button type="button" onClick={() => { setEditing(item); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button><ArchiveMenuItem item={item} onArchived={onSaved}/></td>}</tr>)}</tbody></table></div>}
  </section>;
}

function MenuEditor({ outletId, item, onCancel, onSaved }) {
  const [error, setError] = useState('');
  const initial = useMemo(() => item ? { name: item.name, category: item.category, unit: item.unit, costPerUnit: item.costPerUnit, batchSize: item.batchSize, shelfLifeHours: item.shelfLifeHours, isSafelyReusable: item.isSafelyReusable } : { name: '', category: '', unit: 'plate', costPerUnit: '', batchSize: '', shelfLifeHours: 4, isSafelyReusable: false }, [item]);
  const [values, setValues] = useState(initial);
  useEffect(() => setValues(initial), [initial]);
  const save = useMutation({ mutationFn: () => apiFetch(item ? `/menu-items/${item._id}` : '/menu-items', { method: item ? 'PATCH' : 'POST', body: JSON.stringify(item ? values : { ...values, outletId }) }), onSuccess: () => { setError(''); onSaved(item ? 'Menu item updated.' : 'Menu item added.'); }, onError: reason => setError(reason.message) });
  const set = (field, value) => setValues(current => ({ ...current, [field]: value }));
  return <form className="ops-form menu-editor" onSubmit={event => { event.preventDefault(); setError(''); save.mutate(); }}>
    <div className="ops-form-title"><h3>{item ? 'Edit menu item' : 'Add a menu item'}</h3>{item && <button className="text-button" type="button" onClick={onCancel}>Cancel</button>}</div>
    <div className="ops-form-grid">
      <label>Item name<input required minLength="2" maxLength="100" value={values.name} onChange={event => set('name', event.target.value)} placeholder="e.g. Steamed rice"/></label>
      <label>Category<input required minLength="2" maxLength="60" value={values.category} onChange={event => set('category', event.target.value)} placeholder="e.g. Grains"/></label>
      <label>Unit<select value={values.unit} onChange={event => set('unit', event.target.value)}>{['kg', 'litre', 'plate', 'piece'].map(unit => <option key={unit}>{unit}</option>)}</select></label>
      <label>Cost per unit (₹)<input required type="number" min="0" max="1000000" step="0.01" value={values.costPerUnit} onChange={event => set('costPerUnit', event.target.value)} placeholder="0.00"/></label>
      <label>Batch size<input required type="number" min="0.001" max="1000000" step="0.001" value={values.batchSize} onChange={event => set('batchSize', event.target.value)} placeholder="10"/></label>
      <label>Shelf life (hours)<input required type="number" min="0" max="8760" step="1" value={values.shelfLifeHours} onChange={event => set('shelfLifeHours', event.target.value)}/></label>
    </div>
    <label className="ops-check"><input type="checkbox" checked={values.isSafelyReusable} onChange={event => set('isSafelyReusable', event.target.checked)}/> Leftovers can be safely reused</label>
    {error && <p className="ops-error" role="alert">{error}</p>}
    <button className="ops-primary" type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : item ? 'Save changes' : 'Add menu item'}</button>
  </form>;
}

function ArchiveMenuItem({ item, onArchived }) {
  const [error, setError] = useState('');
  const mutation = useMutation({ mutationFn: () => apiFetch(`/menu-items/${item._id}`, { method: 'DELETE' }), onSuccess: () => { setError(''); onArchived('Menu item archived.'); }, onError: reason => setError(reason.message) });
  return <><button type="button" className="danger-text" onClick={() => { if (window.confirm(`Archive ${item.name}? Existing daily logs will remain available.`)) mutation.mutate(); }} disabled={mutation.isPending}>{mutation.isPending ? 'Archiving…' : 'Archive'}</button>{error && <span className="ops-error">{error}</span>}</>;
}

function CalendarPage({ outletId, outlets, role, onSaved }) {
  const canEdit = role === 'admin' || role === 'manager';
  const [date, setDate] = useState(today());
  const [type, setType] = useState('holiday');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [eventOutletId, setEventOutletId] = useState('');
  const [error, setError] = useState('');
  const events = useQuery({ queryKey: ['calendar', outletId], queryFn: () => apiFetch(`/calendar?outletId=${encodeURIComponent(outletId)}&from=${today()}&to=${new Date(`${today()}T00:00:00`).getFullYear() + 1}-12-31&limit=200`), enabled: Boolean(outletId) });
  const create = useMutation({ mutationFn: () => apiFetch('/calendar', { method: 'POST', body: JSON.stringify({ date, type, title, notes, outletId: eventOutletId || null }) }), onSuccess: async () => { setTitle(''); setNotes(''); setError(''); await onSaved('Calendar event saved.'); }, onError: reason => setError(reason.message) });
  const remove = useMutation({ mutationFn: eventId => apiFetch(`/calendar/${eventId}`, { method: 'DELETE' }), onSuccess: () => onSaved('Calendar event removed.'), onError: reason => setError(reason.message) });
  return <section className="ops-panel"><PanelHeading title="Calendar context" detail="Mark holidays, exams, campus events, vacations and special menus."/>
    {canEdit && <form className="ops-form event-form" onSubmit={event => { event.preventDefault(); setError(''); create.mutate(); }}><div className="ops-form-grid">
      <label>Date<input type="date" required value={date} onChange={event => setDate(event.target.value)}/></label>
      <label>Context<select value={type} onChange={event => setType(event.target.value)}>{eventTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Title<input required minLength="2" maxLength="120" value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Midterm examinations"/></label>
      <label>Applies to<select value={eventOutletId} onChange={event => setEventOutletId(event.target.value)}><option value="">All outlets</option>{outlets.map(outlet => <option key={outlet._id} value={outlet._id}>{outlet.name}</option>)}</select></label>
    </div><label>Notes<textarea rows="2" maxLength="500" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Optional details for tomorrow's planning"/></label>{error && <p className="ops-error" role="alert">{error}</p>}<button className="ops-primary" type="submit" disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Add calendar event'}</button></form>}
    {events.isPending ? <StatePanel title="Loading calendar" message="Fetching upcoming events." loading/> : events.isError ? <StatePanel title="Calendar could not load" message={events.error.message} retry={events.refetch}/> : (events.data?.data?.length || 0) === 0 ? <StatePanel title="No upcoming events" message="Add dates that can affect food demand, such as exams or holidays."/> : <div className="event-list">{events.data.data.map(event => <article className="event-row" key={event._id}><div className={`event-mark event-${event.type}`}/><div className="event-main"><span>{new Date(`${event.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span><h3>{event.title}</h3><small>{eventTypes.find(([value]) => value === event.type)?.[1]} · {event.outlet?.name || 'All outlets'}{event.notes && ` · ${event.notes}`}</small></div>{canEdit && <button className="danger-text" type="button" onClick={() => { if (window.confirm(`Remove ${event.title}?`)) remove.mutate(event._id); }}>Remove</button>}</article>)}</div>}
  </section>;
}

function CsvPage({ outletId, onImported }) {
  const cache = useQueryClient();
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [exportDate, setExportDate] = useState('');
  const [exportMeal, setExportMeal] = useState('');
  const [exportOutlet, setExportOutlet] = useState(outletId);
  useEffect(() => setExportOutlet(outletId), [outletId]);
  const preview = useMutation({ mutationFn: () => apiFetch('/logs/import/preview', { method: 'POST', body: fileText, headers: { 'Content-Type': 'text/csv' } }), onSuccess: data => { setError(''); setResult(data); }, onError: reason => setError(reason.message) });
  const commit = useMutation({ mutationFn: () => apiFetch('/logs/import', { method: 'POST', body: fileText, headers: { 'Content-Type': 'text/csv' } }), onSuccess: async data => { setResult({ ...result, committed: data }); await cache.invalidateQueries({ queryKey: ['logs'] }); await onImported(`${data.imported} row(s) imported; ${data.errors.length} row error(s).`); }, onError: reason => setError(reason.message) });
  const chooseFile = async event => {
    const file = event.target.files?.[0];
    setError(''); setResult(null); setFileText(''); setFileName('');
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Choose a CSV file smaller than 5 MB.'); event.target.value = ''; return; }
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') { setError('Choose a .csv file.'); event.target.value = ''; return; }
    setFileText(await file.text()); setFileName(file.name);
  };
  const exportParams = new URLSearchParams();
  if (exportOutlet) exportParams.set('outletId', exportOutlet);
  if (exportDate) exportParams.set('date', exportDate);
  if (exportMeal) exportParams.set('meal', exportMeal);
  const exportHref = `/api/v1/logs/export?${exportParams.toString()}`;
  return <section className="ops-panel"><PanelHeading title="CSV import and export" detail="Preview row-level errors and duplicates before importing daily logs."/>
    <div className="csv-columns"><section className="csv-card"><h3>Import daily logs</h3><p>Use the template columns exactly. Copy outlet IDs from the Outlets list and menu item IDs from the Menu tab. Imports accept up to 500 rows and never overwrite an existing daily record.</p><a className="ops-secondary download-link" href="/api/v1/logs/template">Download CSV template</a><label className="file-picker">CSV file<input type="file" accept=".csv,text/csv" onChange={chooseFile}/></label>{fileName && <p className="selected-file">Selected: {fileName}</p>}{error && <p className="ops-error" role="alert">{error}</p>}{fileText && <button className="ops-primary" type="button" onClick={() => preview.mutate()} disabled={preview.isPending}>{preview.isPending ? 'Checking rows…' : 'Preview import'}</button>}
      {result && <div className="csv-preview" aria-live="polite"><div className="preview-summary"><strong>{result.readyRows} ready</strong><span>{result.errors.length} error(s) or duplicate(s)</span><span>{result.totalRows} total</span></div><div className="preview-rows">{result.rows.map(row => <div className="preview-row" key={row.row}><span>Row {row.row}</span><span className={`preview-status ${row.status}`}>{row.status}</span><span>{row.errors?.join(' ') || row.data?.date || ''}</span></div>)}</div>{result.committed ? <p className="success-copy">Imported {result.committed.imported} row(s). Review {result.committed.errors.length} row error(s) above.</p> : result.readyRows > 0 && <button className="ops-primary" type="button" onClick={() => commit.mutate()} disabled={commit.isPending}>{commit.isPending ? 'Importing…' : `Import ${result.readyRows} valid row(s)`}</button>}</div>}
    </section><section className="csv-card"><h3>Export daily logs</h3><p>Download a filtered CSV. Spreadsheet formula-like values are escaped on export.</p><label>Outlet<select value={exportOutlet} onChange={event => setExportOutlet(event.target.value)}><option value="">All accessible outlets</option>{outletId && <option value={outletId}>Current outlet</option>}</select></label><label>Date<input type="date" value={exportDate} onChange={event => setExportDate(event.target.value)}/></label><label>Meal<select value={exportMeal} onChange={event => setExportMeal(event.target.value)}><option value="">All meals</option>{meals.map(value => <option key={value} value={value}>{mealName(value)}</option>)}</select></label><a className="ops-primary download-link" href={exportHref}>Export CSV</a></section></div>
    <div className="synthetic-note"><strong>Synthetic demo data</strong><span>The fixed-seed generator is provided in <code>data/generate_demo_data.py</code>. Synthetic data is separate from live kitchen logs and must stay labelled when used in demonstrations or reports.</span></div>
  </section>;
}

function PanelHeading({ title, detail }) { return <div className="ops-panel-heading"><h2>{title}</h2><p>{detail}</p></div>; }
function StatePanel({ title, message, loading, retry }) { return <div className="ops-state" role={retry ? 'alert' : undefined}>{loading && <span className="ops-loader"/>}<strong>{title}</strong><p>{message}</p>{retry && <button type="button" className="text-button" onClick={retry}>Try again</button>}</div>; }
