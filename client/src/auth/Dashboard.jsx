import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowRight, ArrowUpRight, Bell, ChefHat, CircleDollarSign, ClipboardList, CookingPot, Leaf, PackageCheck, Sparkles, TrendingDown, TrendingUp, Utensils, Wheat } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiFetch } from './api.js';
import './dashboard.css';
import './dashboard-premium.css';

const number = value => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 1 });
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
const todayIn = timezone => new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'Asia/Kolkata' }).format(new Date());
const shiftDate = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const COLORS = ['#176b45', '#63a36f', '#a6c98b', '#d0dfbb', '#e6c47a', '#8fa98b'];

export default function Dashboard({ outletId, onNavigate, timezone = 'Asia/Kolkata' }) {
  const [to] = useState(() => todayIn(timezone));
  const from = shiftDate(to, -29);
  const tomorrow = shiftDate(to, 1);
  const analytics = useQuery({ queryKey: ['analytics', outletId, from, to], queryFn: () => apiFetch(`/analytics?outletId=${encodeURIComponent(outletId)}&from=${from}&to=${to}`), enabled: Boolean(outletId) });
  const logs = useQuery({ queryKey: ['dashboard-logs', outletId, from, to], queryFn: () => apiFetch(`/logs?outletId=${encodeURIComponent(outletId)}&limit=6`), enabled: Boolean(outletId) });
  const forecast = useQuery({ queryKey: ['dashboard-forecast', outletId, tomorrow], queryFn: () => apiFetch(`/forecasts?outletId=${encodeURIComponent(outletId)}&date=${tomorrow}`), enabled: Boolean(outletId) });
  const data = analytics.data?.data;
  const records = logs.data?.data || [];
  const metrics = data?.metrics;
  const derived = useMemo(() => {
    const firstVisibleDate = shiftDate(to, -6);
    const trend = (data?.trend || []).filter(row => row.label >= firstVisibleDate).map(row => ({ ...row, label: new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${row.label}T12:00:00Z`)) }));
    const categories = (data?.wasteByCategory || []).map(row => ({ name: row.name, value: row.waste }));
    return { consumed: data?.metrics?.consumed || 0, trend, categories };
  }, [data, to]);
  const forecastRows = forecast.data?.data || [];
  const prepared = metrics?.prepared || 0;
  const waste = metrics?.waste || 0;
  const wasteRate = metrics?.wasteRate ?? null;
  const reduction = metrics?.priorWasteRate > 0 && wasteRate !== null ? ((metrics.priorWasteRate - wasteRate) / metrics.priorWasteRate) * 100 : null;
  const wasteItems = [...(data?.topItems || [])].sort((a, b) => b.waste - a.waste).slice(0, 5);
  const highestCategory = derived.categories[0];

  if (analytics.isPending || logs.isPending) return <DashboardState title="Preparing your dashboard" message="Loading this outlet's recent food records and analytics." loading/>;
  if (analytics.isError || logs.isError) return <DashboardState title="Dashboard could not load" message={analytics.error?.message || logs.error?.message || 'Please try again.'} retry={() => { analytics.refetch(); logs.refetch(); }}/>;

  return <div className="ww-dashboard">
    <div className="dashboard-welcome-row"><div><span className="dashboard-overline"><span className="dashboard-status-dot"/> OUTLET OVERVIEW</span><h1>Your kitchen at a glance</h1><p>See what your team prepared, what was consumed and where a little planning can help.</p></div><div className="dashboard-range-chip"><Activity size={14}/><span>Last 30 days</span><i>{data?.outlet?.name || 'Current outlet'}</i></div></div>
    <section className="ww-kpi-grid" aria-label="Kitchen performance summary">
      <Kpi icon={CookingPot} title="Food prepared" value={`${number(prepared)} kg`} detail={`${metrics?.recordCount || 0} logged item services`} tone="forest"/>
      <Kpi icon={Utensils} title="Food consumed" value={`${number(metrics?.consumed)} kg`} detail="Prepared minus unserved leftovers" tone="sage"/>
      <Kpi icon={Wheat} title="Food wasted" value={`${number(waste)} kg`} detail={`${wasteRate === null ? 'No rate yet' : `${(wasteRate * 100).toFixed(1)}% of prepared`}`} tone="amber"/>
      <Kpi icon={TrendingDown} title="Waste reduction" value={reduction === null ? '--' : `${Math.abs(reduction).toFixed(1)}%`} detail={reduction === null ? 'Needs a previous period to compare' : reduction >= 0 ? 'Lower waste rate vs previous period' : 'Waste rate rose vs previous period'} tone={reduction !== null && reduction < 0 ? 'rose' : 'lime'} trend={reduction}/>
    </section>
    <div className="ww-dashboard-grid">
      <ChartCard title="Food waste trend" subtitle="Recorded leftovers over the last 7 days" icon={TrendingDown} className="chart-wide"><ResponsiveContainer width="100%" height="100%"><LineChart data={derived.trend} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}><CartesianGrid stroke="#edf2ea" strokeDasharray="4 5" vertical={false}/><XAxis dataKey="label" tick={{ fontSize: 10, fill: '#839087' }} axisLine={false} tickLine={false}/><YAxis tick={{ fontSize: 9, fill: '#99a39b' }} axisLine={false} tickLine={false} allowDecimals={false}/><Tooltip formatter={value => [`${number(value)} kg`, 'Waste']} contentStyle={{ border: '1px solid #e7ede5', borderRadius: 11, fontSize: 11 }}/><Line type="monotone" dataKey="waste" name="Waste" stroke="#176b45" strokeWidth={3} dot={{ r: 3, fill: '#176b45', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive animationDuration={700}/></LineChart></ResponsiveContainer></ChartCard>
      <ChartCard title="Prepared vs consumed" subtitle="Daily quantities, last 7 days" icon={ChefHat}><ResponsiveContainer width="100%" height="100%"><BarChart data={derived.trend} margin={{ top: 10, right: 4, left: -20, bottom: 0 }}><CartesianGrid stroke="#edf2ea" strokeDasharray="4 5" vertical={false}/><XAxis dataKey="label" tick={{ fontSize: 9, fill: '#839087' }} axisLine={false} tickLine={false}/><YAxis tick={{ fontSize: 8, fill: '#99a39b' }} axisLine={false} tickLine={false} allowDecimals={false}/><Tooltip formatter={value => [`${number(value)} kg`]} contentStyle={{ border: '1px solid #e7ede5', borderRadius: 11, fontSize: 10 }}/><Bar dataKey="prepared" name="Prepared" fill="#a8c996" radius={[5,5,0,0]}/><Bar dataKey="consumed" name="Consumed" fill="#176b45" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></ChartCard>
      <ChartCard title="Waste by food category" subtitle="Unserved leftovers and plate waste" icon={PackageCheck}><div className="ww-donut-content">{derived.categories.length ? <><div className="ww-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={derived.categories} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={3} stroke="none">{derived.categories.map((row,index)=><Cell key={row.name} fill={COLORS[index % COLORS.length]}/>)}</Pie><Tooltip formatter={value => [`${number(value)} kg`, 'Waste']} contentStyle={{ border: '1px solid #e7ede5', borderRadius: 10, fontSize: 10 }}/></PieChart></ResponsiveContainer><div className="ww-donut-center"><strong>{number(waste)}</strong><span>kg waste</span></div></div><ul className="ww-category-list">{derived.categories.slice(0,5).map((row,index)=><li key={row.name}><i style={{ background: COLORS[index % COLORS.length] }}/><span>{row.name}</span><strong>{number(row.value)} kg</strong></li>)}</ul></> : <DashboardEmpty compact message="Category breakdown appears after food records are entered."/>}</div></ChartCard>
      <section className="ww-panel ww-waste-list"><PanelTitle icon={Wheat} title="Most wasted food items" subtitle="Ranked by recorded waste quantity"/>{wasteItems.length ? <div className="ww-ranked-list">{wasteItems.map((item,index)=><div className="ww-rank-row" key={item.itemId || item.name}><span className="ww-rank-number">0{index+1}</span><div className="ww-rank-main"><strong>{item.name}</strong><div className="ww-progress"><span style={{ width: `${Math.max(5, wasteItems[0].waste ? item.waste / wasteItems[0].waste * 100 : 0)}%` }}/></div></div><b>{number(item.waste)} <small>{item.unit}</small></b></div>)}</div> : <DashboardEmpty compact message="Your highest-waste items will appear here once logs are available."/>}</section>
      <section className="ww-insight-card"><div className="ww-insight-orb"><Sparkles size={18}/></div><div className="ww-insight-copy"><span>WASTEWISE INTELLIGENCE</span><h2>Your Smart Insight</h2>{data?.insights?.length ? <><strong>{data.insights[0].title}</strong><p>{data.insights[0].message}</p></> : highestCategory ? <><strong>{highestCategory.name} is your largest waste category</strong><p>{number(highestCategory.value)} kg has been recorded across this period. Review recent preparation before adjusting tomorrow's plan.</p></> : <p>Keep adding daily food records. WasteWise will surface evidence-based patterns as your outlet builds enough comparable history.</p>}</div><button type="button" aria-label="View recommendations" onClick={() => onNavigate?.('plan')}><ArrowRight size={17}/></button></section>
      <section className="ww-forecast-card"><div className="ww-forecast-top"><span className="ww-forecast-icon"><Sparkles size={17}/></span><span className="ww-forecast-tag">TOMORROW'S PLAN</span><ArrowUpRight size={16}/></div><h2>Upcoming prediction</h2>{forecast.isLoading ? <p className="ww-forecast-muted">Checking saved forecast...</p> : forecastRows.length ? <><strong className="ww-forecast-total">{number(forecastRows.reduce((sum,row)=>sum + Number(row.finalQuantity ?? row.recommendedQuantity ?? 0),0))} <small>total recommended units</small></strong><p>{forecastRows.slice(0,3).map(row=>`${row.item.name} ${number(row.recommendedQuantity)} ${row.item.unit}`).join(' ? ')}</p></> : <p className="ww-forecast-muted">No forecast has been saved for tomorrow yet. Generate a plan to see item-by-item demand.</p>}<button type="button" className="ww-forecast-button" onClick={() => onNavigate?.('plan')}>View AI Forecast <ArrowRight size={15}/></button></section>
      <section className="ww-panel ww-activity-panel"><div className="ww-panel-heading"><PanelTitle icon={ClipboardList} title="Recent activity" subtitle="Latest records from this outlet"/><button type="button" className="ww-view-all" onClick={() => onNavigate?.('entry')}>View records <ArrowRight size={14}/></button></div>{logs.isLoading ? <DashboardEmpty compact message="Loading recent food records..."/> : records.length ? <div className="ww-activity-table-wrap"><table className="ww-activity-table"><thead><tr><th>Date</th><th>Food item</th><th>Prepared</th><th>Leftover</th></tr></thead><tbody>{records.slice(0,6).map(row=><tr key={row._id}><td>{new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${row.date}T12:00:00Z`))}</td><td><span className="ww-food-avatar"><Leaf size={13}/></span><span>{row.item?.name || 'Archived item'}<small>{row.meal}</small></span></td><td>{number(row.prepared)} {row.item?.unit || ''}</td><td>{number(row.unservedLeftover)} {row.item?.unit || ''}</td></tr>)}</tbody></table></div> : <DashboardEmpty compact message="No daily food records yet. Add your first service entry to start building this dashboard." action="Add daily entry" onAction={() => onNavigate?.('entry')}/>}</section>
    </div>
  </div>;
}

function Kpi({ icon: Icon, title, value, detail, tone, trend }) {
  return <article className={`ww-kpi-card kpi-${tone}`}><span className="ww-kpi-icon"><Icon size={18}/></span><span className="ww-kpi-title">{title}</span><strong>{value}</strong><small>{trend !== undefined ? <>{trend === null ? <Activity size={12}/> : trend >= 0 ? <TrendingDown size={12}/> : <TrendingUp size={12}/>} {detail}</> : detail}</small></article>;
}
function ChartCard({ title, subtitle, icon: Icon, className='', children }) { return <section className={`ww-panel ww-chart-panel ${className}`}><PanelTitle icon={Icon} title={title} subtitle={subtitle}/><div className="ww-chart-body">{children}</div></section>; }
function PanelTitle({ icon: Icon, title, subtitle }) { return <div className="ww-panel-title"><span className="ww-panel-icon"><Icon size={16}/></span><div><h2>{title}</h2><p>{subtitle}</p></div></div>; }
function DashboardEmpty({ message, compact, action, onAction }) { return <div className={`ww-dashboard-empty${compact?' compact':''}`}><span><Leaf size={17}/></span><p>{message}</p>{action&&<button type="button" onClick={onAction}>{action}<ArrowRight size={13}/></button>}</div>; }
function DashboardState({ title, message, loading, retry }) { return <div className="ww-dashboard-state"><span>{loading?<span className="ops-loader"/>:<Leaf size={20}/>}</span><h2>{title}</h2><p>{message}</p>{retry&&<button type="button" className="ops-secondary" onClick={retry}>Try again</button>}</div>; }
