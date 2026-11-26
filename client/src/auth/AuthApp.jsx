import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Activity, ArrowRight, Building2, Check, CircleAlert, Leaf, LogOut, Moon, Plus, ShieldCheck, Sun, Users, BarChart3, ChefHat, Clock3, Sparkles, Sprout, TrendingDown, Utensils, Menu, X, MoveUpRight, Recycle, ChevronRight, Eye, EyeOff, LockKeyhole, LayoutDashboard, ClipboardEdit, BrainCircuit, ChartNoAxesCombined, Lightbulb, History, Settings as SettingsIcon, Search, Bell } from 'lucide-react';
import { apiFetch, fetchSession, signIn, signOut, signUp } from './api.js';
import { loginSchema, outletSchema, registerSchema, userSchema } from './schemas.js';
import Operations, { MenuManagement } from './Operations.jsx';
import './polish.css';
import './theme.css';
import './landing.css';
import './auth-premium.css';
import './app-shell.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 } } });
const timezones = ['Asia/Kolkata', ...[...new Set(Intl.supportedValuesOf?.('timeZone') || ['America/Los_Angeles', 'America/New_York', 'Europe/London', 'Europe/Paris', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'])].filter(timezone => timezone !== 'Asia/Kolkata').sort()];

export default function AuthApp() {
  return <QueryClientProvider client={queryClient}><BrowserRouter><Routes>
    <Route path="/" element={<LandingPage/>}/>
    <Route path="/login" element={<AuthPage mode="login"/>}/>
    <Route path="/register" element={<AuthPage mode="register"/>}/>
    <Route path="/app/*" element={<SessionGate/>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></BrowserRouter></QueryClientProvider>;
}

function SessionGate() {
  const session = useQuery({ queryKey: ['session'], queryFn: fetchSession });
  if (session.isPending) return <main className="screen-center"><div className="loading-mark"><Leaf size={20}/></div><p>Opening your workspace…</p></main>;
  if (session.isError && session.error?.status === 401) return <Navigate to="/login" replace/>;
  if (session.isError) return <main className="screen-center"><div className="loading-mark"><CircleAlert size={19}/></div><p>{session.error.message}</p><button className="small-button" onClick={() => session.refetch()}>Try again</button></main>;
  return <Workspace session={session.data}/>;
}

function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  return <main className="landing-page">
    <header className="landing-nav"><a className="landing-brand" href="#home" aria-label="WasteWise home"><span className="landing-brand-icon"><Leaf size={19}/></span><span>WasteWise</span></a>
      <button className="landing-menu-toggle" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen?<X size={21}/>:<Menu size={21}/>}</button>
      <nav className={menuOpen?'landing-links is-open':'landing-links'} aria-label="Main navigation"><a href="#home" onClick={closeMenu}>Home</a><a href="#features" onClick={closeMenu}>Features</a><a href="#how-it-works" onClick={closeMenu}>How It Works</a><a href="#about" onClick={closeMenu}>About</a><Link className="nav-login" to="/login" onClick={closeMenu}>Login</Link><Link className="button button-primary nav-cta" to="/register" onClick={closeMenu}>Get Started <ArrowRight size={15}/></Link></nav>
    </header>
    <section className="hero-section" id="home"><div className="hero-produce produce-left" aria-hidden="true"/><div className="hero-produce produce-right" aria-hidden="true"/><div className="hero-copy"><div className="hero-kicker"><span><Sparkles size={13}/></span> INTELLIGENCE FOR A MORE THOUGHTFUL KITCHEN</div><h1>Prepare smarter.<br/><em>Waste less.</em></h1><p>Turn everyday food data into smarter preparation decisions with AI-powered food waste prediction.</p><div className="hero-actions"><Link className="button button-primary" to="/register">Get Started <ArrowRight size={16}/></Link><Link className="button button-secondary" to="/app">Explore Dashboard <ChevronRight size={16}/></Link></div><div className="hero-trust"><div className="trust-avatars"><span>R</span><span>M</span><span>K</span><span><Sprout size={13}/></span></div><span>Made for the people who feed people</span></div></div>
      <div className="hero-visual" aria-label="Illustrative WasteWise analytics dashboard preview"><div className="visual-orbit orbit-one"/><div className="visual-orbit orbit-two"/><div className="floating-leaf leaf-one"><Sprout size={23}/></div><div className="floating-leaf leaf-two"><Leaf size={18}/></div><div className="preview-card"><div className="preview-top"><div><span className="preview-label">KITCHEN OVERVIEW</span><h3>Good afternoon, team <span>✦</span></h3></div><span className="preview-date"><span/> Live preview</span></div><div className="preview-metrics"><div className="preview-metric"><span>Food waste</span><strong>−18.4%</strong><small><TrendingDown size={12}/> this month</small></div><div className="preview-metric"><span>Food saved</span><strong>128 <i>kg</i></strong><small className="metric-positive"><Sprout size={12}/> and counting</small></div></div><div className="chart-panel"><div className="chart-heading"><span>Preparation vs. demand</span><span className="chart-period">Last 7 days⌄</span></div><div className="chart-legend"><span><i className="legend-prepared"/>Prepared</span><span><i className="legend-demand"/>Consumed</span></div><div className="chart-wrap"><div className="chart-y-labels"><span>100</span><span>75</span><span>50</span><span>25</span></div><svg viewBox="0 0 440 130" role="img" aria-label="Illustrative preparation and demand trend chart"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#a8d2a9" stopOpacity=".42"/><stop offset="1" stopColor="#a8d2a9" stopOpacity="0"/></linearGradient></defs><path className="chart-grid" d="M0 14H440M0 47H440M0 80H440M0 113H440"/><path d="M0 40 C25 35 32 52 63 46 S104 28 125 39 S170 61 188 48 S228 24 250 34 S294 53 314 40 S352 22 376 34 S413 51 440 25 L440 130 L0 130Z" fill="url(#chartFill)"/><path className="line-prepared" d="M0 40 C25 35 32 52 63 46 S104 28 125 39 S170 61 188 48 S228 24 250 34 S294 53 314 40 S352 22 376 34 S413 51 440 25"/><path className="line-demand" d="M0 66 C25 58 40 70 63 62 S103 50 125 56 S164 72 188 65 S227 49 250 58 S292 70 314 59 S354 45 376 52 S413 69 440 48"/><circle cx="314" cy="40" r="4" className="chart-point"/></svg><div className="chart-days"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div></div></div><div className="forecast-strip"><span className="forecast-icon"><Sparkles size={15}/></span><div><small>AI PREP PLAN · TOMORROW</small><strong>Rice <b>42 kg</b><i>↑</i> <span>Balanced forecast</span></strong></div><ArrowRight size={15}/></div><span className="preview-note">Illustrative product preview</span></div><div className="visual-caption"><span className="caption-icon"><Recycle size={16}/></span><span><strong>Better planning,</strong> one meal at a time.</span></div></div></section>
    <section className="impact-section" aria-labelledby="impact-heading"><div className="impact-intro"><span className="section-kicker">SMALLER FOOTPRINT. BIGGER IMPACT.</span><h2 id="impact-heading">Every smart choice adds up.</h2></div><div className="impact-grid"><ImpactStat value="128 kg" label="Food saved" note="Illustrative sample" icon={<Sprout size={18}/>}/><ImpactStat value="₹24.6k" label="Money saved" note="Illustrative sample" icon={<TrendingDown size={18}/>}/><ImpactStat value="18.4%" label="Waste reduced" note="Illustrative sample" icon={<Recycle size={18}/>}/><ImpactStat value="12+" label="Organizations supported" note="Illustrative sample" icon={<Building2 size={18}/>}/></div><p className="illustrative-note">Sample figures are illustrative and do not represent measured customer results.</p></section>
    <section className="features-section" id="features"><div className="section-heading"><span className="section-kicker">A CLEARER VIEW OF YOUR KITCHEN</span><h2>Good decisions start<br/>with the right ingredients.</h2><p>Bring preparation, demand and leftovers into one simple rhythm.</p></div><div className="feature-grid"><FeatureCard icon={<Utensils/>} number="01" title="Daily food tracking" copy="Log preparation, leftovers and plate waste in one quick daily workflow." tone="mint"/><FeatureCard icon={<Sparkles/>} number="02" title="AI-based demand prediction" copy="Use your outlet’s history to forecast tomorrow’s likely food demand." tone="lavender"/><FeatureCard icon={<BarChart3/>} number="03" title="Waste analytics" copy="See patterns across meals, weekdays and menu items to understand what’s changing." tone="peach"/><FeatureCard icon={<ChefHat/>} number="04" title="Smart preparation recommendations" copy="Get clear quantity guidance with a range and a reason your team can review." tone="blue"/></div></section>
    <section className="steps-section" id="how-it-works"><div className="steps-heading"><span className="section-kicker">A SIMPLE DAILY PRACTICE</span><h2>From kitchen notes<br/>to better tomorrows.</h2><p>Start with the records you already know. WasteWise helps turn them into a more confident plan.</p><Link className="text-link" to="/register">Start your workspace <ArrowRight size={15}/></Link></div><div className="steps-list"><Step number="01" icon={<Utensils/>} title="Enter daily food data" copy="Record what you prepared, served and had left over."/><Step number="02" icon={<BarChart3/>} title="Understand what happened" copy="Explore consumption and leftover patterns by item and meal."/><Step number="03" icon={<Sparkles/>} title="Plan tomorrow’s requirements" copy="Review demand forecasts and suggested preparation ranges."/><Step number="04" icon={<Sprout/>} title="Make every ingredient count" copy="Use the plan, learn from the result and keep improving."/></div></section>
    <section className="sustainability-section" id="about"><div className="sustainability-art"><div className="sun-disc"/><div className="hill hill-back"/><div className="hill hill-front"/><div className="illustration-plant plant-a"><span/><i/><b/></div><div className="illustration-plant plant-b"><span/><i/><b/></div><div className="illustration-plant plant-c"><span/><i/><b/></div><div className="illustration-plate"><span><Leaf size={30}/></span><small>GROW WITH CARE</small></div><div className="art-spark spark-a">✳</div><div className="art-spark spark-b">✦</div></div><div className="sustainability-copy"><span className="section-kicker">GOOD FOR YOUR KITCHEN, BETTER FOR OUR PLANET</span><h2>Make room for<br/><em>more good food.</em></h2><p>Food is too valuable to waste. With a clearer view of what your kitchen needs, your team can make thoughtful preparation decisions every day.</p><div className="sustainability-points"><span><Check size={15}/> Better-informed preparation</span><span><Check size={15}/> Less avoidable food waste</span><span><Check size={15}/> A habit your whole team can share</span></div><Link className="button button-primary" to="/register">Make a thoughtful start <ArrowRight size={15}/></Link></div></section>
    <section className="closing-cta"><div className="cta-decoration cta-decoration-one"/><div className="cta-decoration cta-decoration-two"/><span className="section-kicker">YOUR KITCHEN’S NEXT GOOD IDEA</span><h2>Tomorrow starts with<br/>what you know today.</h2><p>Bring your kitchen’s daily story into focus with WasteWise.</p><Link className="button button-light" to="/register">Get Started <ArrowRight size={16}/></Link></section>
    <footer className="landing-footer"><div className="footer-main"><div className="footer-brand-column"><a className="landing-brand" href="#home"><span className="landing-brand-icon"><Leaf size={19}/></span><span>WasteWise</span></a><p>Smarter preparation for a less wasteful world.</p><div className="footer-social"><a href="mailto:hello@wastewise.app" aria-label="Email WasteWise"><Activity size={16}/></a><a href="https://www.linkedin.com/" target="_blank" rel="noreferrer" aria-label="LinkedIn"><Users size={16}/></a><a href="https://www.instagram.com/" target="_blank" rel="noreferrer" aria-label="Instagram"><Sprout size={16}/></a></div></div><div className="footer-links"><div><strong>Explore</strong><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#about">About WasteWise</a></div><div><strong>Get started</strong><Link to="/register">Create workspace</Link><Link to="/login">Login</Link><a href="mailto:hello@wastewise.app">Contact</a></div></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} WasteWise</span><span>Thoughtful kitchens. A lighter footprint. <Leaf size={13}/></span></div></footer>
  </main>;
}

function ImpactStat({ value, label, note, icon }) { return <div className="impact-stat"><span className="impact-icon">{icon}</span><strong>{value}</strong><span>{label}</span><small>{note}</small></div>; }
function FeatureCard({ icon, number, title, copy, tone }) {
  const cardRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    const card = cardRef.current;
    if (!card || isVisible) return undefined;
    if (!('IntersectionObserver' in window)) { setIsVisible(true); return undefined; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); }
    }, { threshold: 0.18, rootMargin: '0px 0px -36px 0px' });
    observer.observe(card);
    return () => observer.disconnect();
  }, [isVisible]);
  return <article ref={cardRef} className={`feature-card tone-${tone}${isVisible ? ' is-visible' : ''}`}><div className="feature-card-top"><span className="feature-icon">{icon}</span><span>{number}</span></div><h3>{title}</h3><p>{copy}</p><a href="#how-it-works" aria-label={`Learn how ${title.toLowerCase()} works`}><MoveUpRight size={16}/></a></article>;
}
function Step({ number, icon, title, copy }) { return <div className="step-row"><span className="step-number">{number}</span><span className="step-icon">{icon}</span><div><h3>{title}</h3><p>{copy}</p></div><Clock3 className="step-check" size={17}/></div>; }

function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const schema = isRegister ? registerSchema : loginSchema;
  const form = useForm({ resolver: zodResolver(schema), defaultValues: isRegister ? { organisationName: '', outletName: 'Main kitchen', organisationType: 'restaurant', dailyServingCapacity: '', name: '', email: '', password: '', confirmPassword: '', timezone: 'Asia/Kolkata' } : { organisationSlug: '', email: '', password: '', rememberMe: false } });
  const mutation = useMutation({
    mutationFn: values => {
      if (!isRegister) return signIn(values);
      const { confirmPassword: _confirmPassword, ...registration } = values;
      return signUp(registration);
    },
    onSuccess: async () => {
      try { const session = await fetchSession(); cache.setQueryData(['session'], session); navigate('/app', { replace: true }); }
      catch (e) { setError(e.message); }
    },
    onError: e => setError(e.message)
  });
  return <main className="auth-layout auth-premium">
    <section className="auth-panel-wrap"><div className="auth-panel">
      <Link className="auth-brand" to="/" aria-label="WasteWise home"><span className="brand-icon"><Leaf size={19}/></span><strong>WasteWise</strong></Link>
      <div className="auth-heading"><span className="eyebrow">{isRegister ? 'A SMARTER START FOR YOUR KITCHEN' : 'YOUR KITCHEN, IN BETTER BALANCE'}</span><h2>{isRegister ? 'Start Reducing Food Waste.' : 'Welcome Back!'}</h2><p>{isRegister ? 'Create your organisation workspace and make every meal count.' : 'Sign in to manage your food preparation intelligently.'}</p></div>
      <form className="auth-form premium-form" onSubmit={form.handleSubmit(values => { setError(''); setNotice(''); mutation.mutate(values); })} noValidate>
        {isRegister ? <>
          <Field label="Organization name" name="organisationName" form={form} placeholder="e.g. North Campus Dining"/>
          <SelectField label="Organization type" name="organisationType" form={form} options={[{ value: 'restaurant', label: 'Restaurant' }, { value: 'college-canteen', label: 'College Canteen' }]}/>
          <Field label="Full name" name="name" form={form} placeholder="Your name" autoComplete="name"/>
          <Field label="Email address" name="email" form={form} type="email" placeholder="you@yourkitchen.com" autoComplete="email"/>
          <Field label="Daily serving capacity" name="dailyServingCapacity" form={form} type="number" placeholder="e.g. 250" min="1"/>
          <div className="auth-form-pair"><PasswordField label="Password" name="password" form={form} visible={passwordVisible} onToggle={() => setPasswordVisible(value => !value)} autoComplete="new-password"/><PasswordField label="Confirm password" name="confirmPassword" form={form} visible={confirmVisible} onToggle={() => setConfirmVisible(value => !value)} autoComplete="new-password"/></div>
          <div className="auth-form-pair"><TimezoneField form={form}/><Field label="First kitchen" name="outletName" form={form} placeholder="Main kitchen"/></div>
          <p className="auth-role-note"><ShieldCheck size={14}/> Workspace creators start as administrators. You can add manager and kitchen staff roles from Settings.</p>
        </> : <>
          <Field label="Workspace slug" name="organisationSlug" form={form} placeholder="north-campus-dining" hint="Your workspace URL name, provided by your administrator."/>
          <Field label="Email address" name="email" form={form} type="email" placeholder="you@yourkitchen.com" autoComplete="email"/>
          <PasswordField label="Password" name="password" form={form} visible={passwordVisible} onToggle={() => setPasswordVisible(value => !value)} autoComplete="current-password"/>
          <div className="auth-login-options"><label className="remember-option"><input type="checkbox" {...form.register('rememberMe')}/> <span>Remember me</span></label><button type="button" className="forgot-link" onClick={() => setNotice('For a password reset, please contact your WasteWise workspace administrator.')}>Forgot password?</button></div>
        </>}
        {notice&&<div role="status" className="auth-inline-notice"><CircleAlert size={15}/>{notice}</div>}
        {error&&<div role="alert" className="form-alert"><CircleAlert size={15}/>{error}</div>}
        <button className="action-button auth-submit" type="submit" disabled={mutation.isPending}>{mutation.isPending?'Please wait…':isRegister?'Create Account':'Sign In'}<ArrowRight size={16}/></button>
      </form>
      <div className="auth-switch">{isRegister?'Already have a WasteWise workspace?':'New to WasteWise?'} <Link to={isRegister?'/login':'/register'}>{isRegister?'Login':'Create Account'}</Link></div>
      <p className="auth-privacy"><ShieldCheck size={13}/> Your organisation data stays private to your workspace.</p>
    </div></section>
    <section className="auth-story auth-premium-story"><Link className="brand-lockup" to="/"><span className="brand-icon"><Leaf size={20}/></span><span>WasteWise</span></Link><div className="auth-story-art"><img src="/images/produce-left.jpg" alt="Fresh greens and vegetables ready to be prepared"/><span className="art-leaf leaf-floating-one"><Leaf size={22}/></span><span className="art-leaf leaf-floating-two"><Sprout size={20}/></span><span className="art-glow"/></div><div className="story-copy"><span className="eyebrow">SMARTER PREPARATION. LESS WASTE.</span><h1>Every meal planned wisely is a step towards a <em>waste-free future.</em></h1><p>Good food deserves a thoughtful kitchen. Make tomorrow’s preparation a little smarter, one service at a time.</p><div className="story-rule"/><span className="story-caption"><ShieldCheck size={15}/> Private, organisation-scoped workspaces</span></div><div className="story-foot">Built for the people who feed people.</div></section>
  </main>;
}

function Field({ label, name, form, type = 'text', placeholder, hint, autoComplete, min }) {
  const error = form.formState.errors[name]?.message;
  const id = `field-${name}`;
  return <label className="form-field" htmlFor={id}><span>{label}</span><input id={id} type={type} min={min} placeholder={placeholder} autoComplete={autoComplete} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} {...form.register(name)}/>{hint&&<small id={`${id}-hint`}>{hint}</small>}{error&&<small className="field-error" id={`${id}-error`}>{error}</small>}</label>;
}

function SelectField({ label, name, form, options }) {
  const error = form.formState.errors[name]?.message;
  const id = `field-${name}`;
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const selectedValue = form.watch(name);
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === selectedValue));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);
  const choose = index => {
    form.setValue(name, options[index].value, { shouldValidate: true, shouldDirty: true });
    setActiveIndex(index);
    setOpen(false);
  };
  const handleKeyDown = event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { setActiveIndex(selectedIndex); setOpen(true); return; }
      setActiveIndex(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (event.key === 'Home' && open) { event.preventDefault(); setActiveIndex(0); }
    else if (event.key === 'End' && open) { event.preventDefault(); setActiveIndex(options.length - 1); }
    else if ((event.key === 'Enter' || event.key === ' ') && open) { event.preventDefault(); choose(activeIndex); }
    else if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); }
  };
  return <div className="form-field auth-select-field"><span id={`${id}-label`}>{label}</span><input type="hidden" {...form.register(name)}/><div className="auth-select-shell" ref={rootRef}><button id={id} type="button" className="auth-select-trigger" role="combobox" aria-labelledby={`${id}-label`} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-listbox`} aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onClick={() => { setActiveIndex(selectedIndex); setOpen(value => !value); }} onKeyDown={handleKeyDown}><span>{options[selectedIndex]?.label}</span><ChevronRight className={open ? 'select-chevron is-open' : 'select-chevron'} size={15}/></button>{open&&<div className="auth-select-menu" id={`${id}-listbox`} role="listbox" aria-labelledby={`${id}-label`}>{options.map((option,index)=><button key={option.value} id={`${id}-option-${index}`} type="button" role="option" aria-selected={selectedValue === option.value} data-active={activeIndex === index} className="auth-select-option" onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(index)}>{option.label}{selectedValue === option.value&&<Check size={15}/>}</button>)}</div>}</div>{error&&<small className="field-error" id={`${id}-error`}>{error}</small>}</div>;
}

function PasswordField({ label, name, form, visible, onToggle, autoComplete }) {
  const error = form.formState.errors[name]?.message;
  const id = `field-${name}`;
  return <div className="form-field"><label htmlFor={id}>{label}</label><div className="password-input-wrap"><LockKeyhole size={15}/><input id={id} type={visible ? 'text' : 'password'} placeholder="At least 8 characters" autoComplete={autoComplete} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} {...form.register(name)}/><button type="button" className="password-visibility" onClick={onToggle} aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible}>{visible ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div>{error&&<small className="field-error" id={`${id}-error`}>{error}</small>}</div>;
}

function TimezoneField({ form }) {
  const field = form.register('timezone');
  return <label className="form-field" htmlFor="field-timezone"><span>Kitchen time zone</span><input id="field-timezone" aria-label="Kitchen time zone" list="kitchen-timezone-options" autoComplete="off" {...field}/><datalist id="kitchen-timezone-options">{timezones.map(timezone => <option key={timezone} value={timezone}/>)}</datalist><small>Asia/Kolkata is listed first. Type a region or city to see matching time zones.</small></label>;
}

function Workspace({ session }) {
  const location = useLocation();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [theme, setTheme] = useState(() => window.localStorage.getItem('wastewise-theme') === 'dark' ? 'dark' : 'light');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const activeSection = location.pathname.split('/')[2] || 'dashboard';
  const toggleTheme = () => setTheme(current => {
    const next = current === 'dark' ? 'light' : 'dark';
    window.localStorage.setItem('wastewise-theme', next);
    return next;
  });
  const admin = session.user.role === 'admin';
  const outlets = useQuery({ queryKey: ['outlets'], queryFn: () => apiFetch('/outlets') });
  const users = useQuery({ queryKey: ['users'], queryFn: () => apiFetch('/users'), enabled: admin });
  const logout = async () => {
    try { await signOut(); }
    catch (error) { if (error.status !== 401) { setNotice(`Could not sign out: ${error.message}`); return; } }
    cache.clear();
    window.location.assign('/login');
  };
  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'daily-entry', label: 'Daily Food Entry', icon: ClipboardEdit },
    { key: 'ai-predictions', label: 'AI Predictions', icon: BrainCircuit },
    { key: 'waste-analytics', label: 'Waste Analytics', icon: ChartNoAxesCombined },
    { key: 'recommendations', label: 'Recommendations', icon: Lightbulb },
    { key: 'history-reports', label: 'History & Reports', icon: History },
    { key: 'settings', label: 'Settings', icon: SettingsIcon }
  ];
  const operationView = ({ 'daily-entry': 'entry', 'ai-predictions': 'plan', 'waste-analytics': 'analytics', recommendations: 'recommendations', 'history-reports': 'reports' })[activeSection] || 'dashboard';
  const goToOperation = view => {
    const path = ({ entry: '/app/daily-entry', plan: '/app/ai-predictions', dashboard: '/app/dashboard', analytics: '/app/waste-analytics', reports: '/app/history-reports', accuracy: '/app/waste-analytics', menu: '/app/settings', calendar: '/app/settings', csv: '/app/history-reports' })[view] || '/app/dashboard';
    setMobileOpen(false);
    navigate(path);
  };
  const firstName = session.user.name.split(' ')[0];
  const timezone = session.organisation.timezone || 'Asia/Kolkata';
  const dateLabel = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone }).format(new Date());
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(new Date()));
  const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';

  return <div className={`app-shell theme-${theme}`}>
    <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} hidden={!mobileOpen}/>
    <aside className={`app-sidebar${mobileOpen ? ' mobile-open' : ''}`}>
      <Link className="app-brand" to="/app/dashboard" onClick={() => setMobileOpen(false)}><span className="app-brand-mark"><Leaf size={20}/></span><span>WasteWise<small>SMART FOOD INSIGHTS</small></span></Link>
      <span className="sidebar-section-label">WORKSPACE</span>
      <nav className="app-sidebar-nav" aria-label="Main navigation">{navItems.map(({ key, label, icon: Icon }) => <Link key={key} to={`/app/${key}`} className={`app-sidebar-link${activeSection === key ? ' active' : ''}`} aria-current={activeSection === key ? 'page' : undefined} onClick={() => setMobileOpen(false)}><Icon size={17}/><span>{label}</span>{key === 'ai-predictions'&&<span className="nav-ai-dot"/>}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-impact"><span><Sprout size={15}/> Less waste, more good.</span><small>One thoughtful service at a time.</small></div><button className="app-sidebar-link sidebar-logout" type="button" onClick={logout}><LogOut size={17}/><span>Logout</span></button></div>
    </aside>
    <div className="app-main">
      <header className="app-topbar"><div className="topbar-mobile"><button className="mobile-menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20}/></button><Link className="app-brand compact-brand" to="/app/dashboard"><span className="app-brand-mark"><Leaf size={18}/></span><span>WasteWise</span></Link></div>
        <div className="topbar-heading"><span>{dateLabel}</span><strong>Good {greeting}, {firstName}!</strong></div>
        <div className="topbar-actions"><button className="topbar-icon-button" type="button" aria-label="Open history and reports" title="History and reports" onClick={() => navigate('/app/history-reports')}><Search size={17}/></button><button className="topbar-icon-button" type="button" aria-label="View alerts" title="Waste alerts" onClick={() => navigate('/app/waste-analytics')}><Bell size={17}/><i/></button><div className="topbar-organisation"><span>{session.organisation.name}</span><small>{session.organisation.slug}</small></div><div className="topbar-profile" title={`${session.user.name} - ${roleName(session.user.role)}`}><span className="profile-avatar">{session.user.name.split(' ').map(part => part[0]).slice(0,2).join('').toUpperCase()}</span><span className="profile-name">{session.user.name}</span></div><button className="theme-toggle app-theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>{theme === 'dark'?<Sun size={15}/>:<Moon size={15}/>}</button></div>
      </header>
      <main className="app-page-content">
        {activeSection === 'settings' ? <SettingsView session={session} outlets={outlets} users={users} admin={admin} setNotice={setNotice} cache={cache}/> : <Operations key={activeSection} outletsQuery={outlets} role={session.user.role} initialView={operationView} hideNavigation onNavigate={goToOperation} timezone={timezone}/>}
        {notice&&<div className="notice-bar" role="status"><Check size={15}/>{notice}<button aria-label="Dismiss notice" onClick={() => setNotice('')}>?</button></div>}
      </main>
    </div>
  </div>;
}

function SettingsView({ session, outlets, users, admin, setNotice, cache }) {
  return <section className="settings-view"><div className="settings-view-heading"><span className="eyebrow">WORKSPACE PREFERENCES</span><h1>Settings</h1><p>Manage your organisation, outlets and team access.</p></div>
    <section className="settings-org-card"><span className="settings-org-icon"><Building2 size={20}/></span><div><small>ORGANIZATION</small><h2>{session.organisation.name}</h2><p><code>{session.organisation.slug}</code><span>{session.organisation.timezone}</span><span>Currency ? INR</span></p></div><span className="settings-role-chip"><ShieldCheck size={14}/>{roleName(session.user.role)}</span></section>
    <div className="settings-grid"><section className="content-card"><div className="card-heading"><div><h2>Outlets</h2><p>Your organisation locations</p></div><span className="count-badge">{outlets.data?.data?.length ?? '?'}</span></div>{outlets.isPending?<LoadingLine/>:outlets.isError?<InlineError message={outlets.error.message} onRetry={outlets.refetch}/>:<div className="outlet-list">{outlets.data.data.map(outlet=><div className="outlet-row" key={outlet._id}><span className="outlet-symbol"><Building2 size={15}/></span><div><strong>{outlet.name}</strong><small>{outlet.timezone}</small></div><span className={`status-pill ${outlet.isActive?'status-active':'status-inactive'}`}>{outlet.isActive?'Active':'Paused'}</span></div>)}</div>}{admin&&<CreateOutlet onCreated={async()=>{await cache.invalidateQueries({queryKey:['outlets']});setNotice('Outlet added.');}}/>}</section>
      <section className="content-card team-card"><div className="card-heading"><div><h2>Team access</h2><p>People and roles in this workspace</p></div><span className="count-badge">{users.data?.data?.length ?? (admin?'?':'')}</span></div>{admin?<>{users.isPending?<LoadingLine/>:users.isError?<InlineError message={users.error.message} onRetry={users.refetch}/>:<div className="user-list">{users.data.data.map(user=><UserRow key={user.id} user={user} currentUserId={session.user.id} onSaved={async()=>{await cache.invalidateQueries({queryKey:['users']});setNotice('Team access updated.');}}/>)}</div>}<CreateUser onCreated={async()=>{await cache.invalidateQueries({queryKey:['users']});setNotice('Team member added.');}}/></>:<div className="team-access-note"><Users size={17}/><span>Team member access is managed by your organisation administrator.</span></div>}</section></div>
    {outlets.isPending?<LoadingLine/>:outlets.isError?<InlineError message={outlets.error.message} onRetry={outlets.refetch}/>:<MenuManagement outlets={outlets.data?.data||[]} role={session.user.role} onSaved={async message=>{await cache.invalidateQueries({queryKey:['menu']});setNotice(message);}}/>}
  </section>;
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
  return <form className="inline-form" onSubmit={form.handleSubmit(values => { setError(''); mutation.mutate(values); })}><div className="form-pair"><Field label="Add team member" name="name" form={form} placeholder="Full name"/><Field label="Email" name="email" form={form} type="email" placeholder="person@kitchen.com"/></div><div className="form-pair second-pair"><div><Field label="Temporary password" name="password" form={form} type="password" placeholder="At least 8 characters"/><small className="form-help">Share it with the team member through a secure channel.</small></div><label className="form-field"><span>Role</span><select {...form.register('role')}><option value="staff">Kitchen staff</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label></div>{error&&<div className="inline-error" role="alert">{error}</div>}<button className="small-button" type="submit" disabled={mutation.isPending}><Plus size={14}/>{mutation.isPending?'Adding…':'Add team member'}</button></form>;
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
