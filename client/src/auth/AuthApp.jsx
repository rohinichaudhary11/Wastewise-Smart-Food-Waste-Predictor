import { useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Activity, ArrowRight, Building2, Check, CircleAlert, Leaf, LogOut, Plus, ShieldCheck, Users } from 'lucide-react';
import { apiFetch, fetchSession, signIn, signOut, signUp } from './api.js';
import { loginSchema, outletSchema, registerSchema, userSchema } from './schemas.js';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 } } });

export default function AuthApp() {
  return <QueryClientProvider client={queryClient}><BrowserRouter><Routes>
    <Route path="/login" element={<AuthPage mode="login"/>}/>
    <Route path="/register" element={<AuthPage mode="register"/>}/>
    <Route path="*" element={<SessionGate/>}/>
  </Routes></BrowserRouter></QueryClientProvider>;
}

function SessionGate() {
  const session = useQuery({ queryKey: ['session'], queryFn: fetchSession });
  if (session.isPending) return <main className="screen-center"><div className="loading-mark"><Leaf size={20}/></div><p>Opening your workspace…</p></main>;
  if (session.isError && session.error?.status === 401) return <Navigate to="/login" replace/>;
  if (session.isError) return <main className="screen-center"><div className="loading-mark"><CircleAlert size={19}/></div><p>{session.error.message}</p><button className="small-button" onClick={() => session.refetch()}>Try again</button></main>;
  return <Workspace session={session.data}/>;
}

function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [error, setError] = useState('');
  const schema = isRegister ? registerSchema : loginSchema;
  const form = useForm({ resolver: zodResolver(schema), defaultValues: isRegister ? { organisationName: '', outletName: 'Main kitchen', name: '', email: '', password: '', timezone: 'Asia/Kolkata' } : { organisationSlug: '', email: '', password: '' } });
  const mutation = useMutation({
    mutationFn: values => isRegister ? signUp(values) : signIn(values),
    onSuccess: async () => {
      try { const session = await fetchSession(); cache.setQueryData(['session'], session); navigate('/', { replace: true }); }
      catch (e) { setError(e.message); }
    },
    onError: e => setError(e.message)
  });
  return <main className="auth-layout"><section className="auth-story"><div className="brand-lockup"><div className="brand-icon"><Leaf size={20}/></div><span>wastewise</span></div><div className="story-copy"><span className="eyebrow">SMARTER KITCHENS START HERE</span><h1>Good food deserves<br/><em>a thoughtful kitchen.</em></h1><p>Bring your team together around the daily details that help your kitchen waste less.</p><div className="story-rule"/><span className="story-caption"><ShieldCheck size={15}/> Private, organisation-scoped workspaces</span></div><div className="story-foot">Built for people who feed people.</div></section><section className="auth-panel-wrap"><div className="auth-panel"><div className="auth-mobile-brand"><div className="brand-icon"><Leaf size={18}/></div><strong>wastewise</strong></div><div className="auth-heading"><span className="eyebrow">{isRegister ? 'GET YOUR KITCHEN STARTED' : 'WELCOME BACK'}</span><h2>{isRegister ? 'Create your workspace' : 'Sign in to WasteWise'}</h2><p>{isRegister ? 'Set up your organisation and invite your team later.' : 'Your kitchen is right where you left it.'}</p></div><form className="auth-form" onSubmit={form.handleSubmit(values => { setError(''); mutation.mutate(values); })} noValidate>{isRegister&&<><Field label="Organisation name" name="organisationName" form={form} placeholder="e.g. North Campus Dining"/><Field label="First outlet" name="outletName" form={form} placeholder="Main kitchen"/><Field label="Your name" name="name" form={form} placeholder="Jamie Davis"/></>} {!isRegister&&<Field label="Workspace slug" name="organisationSlug" form={form} placeholder="north-campus-dining" hint="Ask your organisation admin if you don't know it."/>}<Field label="Work email" name="email" form={form} type="email" placeholder="you@yourkitchen.com" autoComplete="email"/><Field label="Password" name="password" form={form} type="password" placeholder={isRegister?'At least 12 characters':'Enter your password'} autoComplete={isRegister?'new-password':'current-password'}/>{isRegister&&<Field label="Kitchen time zone" name="timezone" form={form} placeholder="Asia/Kolkata"/>}{error&&<div role="alert" className="form-alert"><CircleAlert size={15}/>{error}</div>}<button className="action-button" type="submit" disabled={mutation.isPending}>{mutation.isPending?'Please wait…':isRegister?'Create workspace':'Sign in'}<ArrowRight size={16}/></button></form><div className="auth-switch">{isRegister?'Already have a workspace?':'Setting up WasteWise for the first time?'} <Link to={isRegister?'/login':'/register'}>{isRegister?'Sign in':'Create workspace'}</Link></div><p className="auth-privacy">By continuing, your organisation data stays private to your workspace.</p></div></section></main>;
}

function Field({ label, name, form, type = 'text', placeholder, hint, autoComplete }) {
  const error = form.formState.errors[name]?.message;
  const id = `field-${name}`;
  return <label className="form-field" htmlFor={id}><span>{label}</span><input id={id} type={type} placeholder={placeholder} autoComplete={autoComplete} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} {...form.register(name)}/>{hint&&<small id={`${id}-hint`}>{hint}</small>}{error&&<small className="field-error" id={`${id}-error`}>{error}</small>}</label>;
}

function Workspace({ session }) {
  const cache = useQueryClient();
  const [notice, setNotice] = useState('');
  const admin = session.user.role === 'admin';
  const outlets = useQuery({ queryKey: ['outlets'], queryFn: () => apiFetch('/outlets') });
  const users = useQuery({ queryKey: ['users'], queryFn: () => apiFetch('/users'), enabled: admin });
  const logout = async () => {
    try { await signOut(); }
    catch (error) {
      if (error.status !== 401) { setNotice(`Could not sign out: ${error.message}`); return; }
    }
    cache.clear();
    window.location.assign('/login');
  };
  return <main className="workspace-page"><header className="workspace-header"><Link className="brand-lockup" to="/"><div className="brand-icon"><Leaf size={19}/></div><span>wastewise</span></Link><div className="workspace-person"><div className="person-avatar">{session.user.name.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase()}</div><div className="person-meta"><strong>{session.user.name}</strong><span>{roleName(session.user.role)}</span></div><button className="logout-button" onClick={logout}><LogOut size={15}/> Sign out</button></div></header><div className="workspace-content"><div className="welcome-row"><div><span className="eyebrow"><span className="online-dot"/> WORKSPACE ACCESS</span><h1>Welcome, {session.user.name.split(' ')[0]}.</h1><p>Your organisation workspace is ready for your team.</p></div><span className="role-chip"><ShieldCheck size={14}/>{roleName(session.user.role)}</span></div><section className="org-card"><div className="org-emblem"><Building2 size={20}/></div><div className="org-details"><span>YOUR ORGANISATION</span><h2>{session.organisation.name}</h2><p><code>{session.organisation.slug}</code><i>·</i>{session.organisation.timezone}<i>·</i>Currency INR (₹)</p></div><div className="org-secure"><ShieldCheck size={17}/><span>Private workspace</span></div></section><div className="workspace-grid"><section className="content-card"><div className="card-heading"><div><h2>Outlets</h2><p>Locations within your organisation</p></div><span className="count-badge">{outlets.data?.data?.length ?? '—'}</span></div>{outlets.isPending?<LoadingLine/>:outlets.isError?<InlineError message={outlets.error.message} onRetry={outlets.refetch}/>:<div className="outlet-list">{outlets.data.data.map(outlet=><div className="outlet-row" key={outlet._id}><span className="outlet-symbol"><Building2 size={15}/></span><div><strong>{outlet.name}</strong><small>{outlet.timezone}</small></div><span className={`status-pill ${outlet.isActive?'status-active':'status-inactive'}`}>{outlet.isActive?'Active':'Paused'}</span></div>)}</div>}{admin&&<CreateOutlet onCreated={async()=>{await cache.invalidateQueries({queryKey:['outlets']});setNotice('Outlet added to your organisation.');}}/>}</section><section className="content-card team-card"><div className="card-heading"><div><h2>Team access</h2><p>People and roles in this workspace</p></div><span className="count-badge">{users.data?.data?.length ?? (admin?'—':'')}</span></div>{admin?<>{users.isPending?<LoadingLine/>:users.isError?<InlineError message={users.error.message} onRetry={users.refetch}/>:<div className="user-list">{users.data.data.map(user=><UserRow key={user.id} user={user} currentUserId={session.user.id} onSaved={async()=>{await cache.invalidateQueries({queryKey:['users']});setNotice('Team access updated.');}}/>)}</div>}<CreateUser onCreated={async()=>{await cache.invalidateQueries({queryKey:['users']});setNotice('Team member added.');}}/></>:<div className="team-access-note"><Users size={17}/><span>Team member access is managed by your organisation administrator.</span></div>}</section></div>{notice&&<div className="notice-bar" role="status"><Check size={15}/>{notice}<button aria-label="Dismiss notice" onClick={()=>setNotice('')}>×</button></div>}<footer className="workspace-footer"><span><Activity size={14}/> Phase 1 · Secure workspace foundation</span><span>WasteWise <i>·</i> Less waste starts with good records.</span></footer></div></main>;
}

function CreateOutlet({ onCreated }) {
  const [error, setError] = useState('');
  const form = useForm({ resolver: zodResolver(outletSchema), defaultValues: { name: '', timezone: 'Asia/Kolkata' } });
  const mutation = useMutation({ mutationFn: values => apiFetch('/outlets', { method: 'POST', body: JSON.stringify(values) }), onSuccess: () => { form.reset({ name: '', timezone: 'Asia/Kolkata' }); setError(''); onCreated(); }, onError: e => setError(e.message) });
  return <form className="inline-form" onSubmit={form.handleSubmit(values => { setError(''); mutation.mutate(values); })}><div className="form-pair"><Field label="Add an outlet" name="name" form={form} placeholder="e.g. Library café"/><Field label="Time zone" name="timezone" form={form} placeholder="Asia/Kolkata"/></div>{error&&<div className="inline-error" role="alert">{error}</div>}<button className="small-button" type="submit" disabled={mutation.isPending}><Plus size={14}/>{mutation.isPending?'Adding…':'Add outlet'}</button></form>;
}

function CreateUser({ onCreated }) {
  const [error, setError] = useState('');
  const form = useForm({ resolver: zodResolver(userSchema), defaultValues: { name: '', email: '', password: '', role: 'staff' } });
  const mutation = useMutation({ mutationFn: values => apiFetch('/users', { method: 'POST', body: JSON.stringify(values) }), onSuccess: () => { form.reset({ name: '', email: '', password: '', role: 'staff' }); setError(''); onCreated(); }, onError: e => setError(e.message) });
  return <form className="inline-form" onSubmit={form.handleSubmit(values => { setError(''); mutation.mutate(values); })}><div className="form-pair"><Field label="Add team member" name="name" form={form} placeholder="Full name"/><Field label="Email" name="email" form={form} type="email" placeholder="person@kitchen.com"/></div><div className="form-pair second-pair"><div><Field label="Temporary password" name="password" form={form} type="password" placeholder="At least 12 characters"/><small className="form-help">Share it with the team member through a secure channel.</small></div><label className="form-field"><span>Role</span><select {...form.register('role')}><option value="staff">Kitchen staff</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label></div>{error&&<div className="inline-error" role="alert">{error}</div>}<button className="small-button" type="submit" disabled={mutation.isPending}><Plus size={14}/>{mutation.isPending?'Adding…':'Add team member'}</button></form>;
}

function UserRow({ user, currentUserId, onSaved }) {
  const [role, setRole] = useState(user.role);
  const [active, setActive] = useState(user.isActive);
  const [error, setError] = useState('');
  const changed = role !== user.role || active !== user.isActive;
  const mutation = useMutation({ mutationFn: () => apiFetch(`/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ role, isActive: active }) }), onSuccess: () => { setError(''); onSaved(); }, onError: e => setError(e.message) });
  return <div className="user-row"><span className="user-avatar">{user.name.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase()}</span><div className="user-row-main"><strong>{user.name}{user.id===currentUserId&&<small>YOU</small>}</strong><span>{user.email}</span></div><label className="sr-only" htmlFor={`role-${user.id}`}>Role for {user.name}</label><select id={`role-${user.id}`} value={role} onChange={e=>setRole(e.target.value)} disabled={user.id===currentUserId||!active}><option value="admin">Admin</option><option value="manager">Manager</option><option value="staff">Staff</option></select>{user.id!==currentUserId&&<button className="save-role" onClick={()=>setActive(!active)}>{active?'Pause':'Restore'}</button>}{changed&&<button className="save-role" onClick={()=>mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending?'Saving…':'Save'}</button>}{error&&<span className="inline-error">{error}</span>}</div>;
}

function LoadingLine() { return <div className="loading-line"><span/>Loading workspace data</div>; }
function InlineError({ message, onRetry }) { return <div className="inline-state" role="alert"><span>{message}</span><button onClick={onRetry}>Try again</button></div>; }
function roleName(role) { return ({ admin: 'Administrator', manager: 'Manager', staff: 'Kitchen staff' })[role] || role; }
