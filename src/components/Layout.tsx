import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { summarize } from '../lib/freezer';
import { useFreezer, useShopLines, useToday } from '../lib/hooks';
import { Icon } from './Icon';
import { Shield } from './Shield';
import { Toasts } from './Toasts';

const base = import.meta.env.BASE_URL;

export function Layout() {
  const { pathname } = useLocation();
  const today = useToday();
  const { items } = useFreezer();
  const shop = useShopLines();
  const alerts = summarize(items, today);
  const freezerBadge = alerts.soon + alerts.expired;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const links = [
    { to: '/', label: 'Início', icon: 'home', end: true, badge: 0 },
    { to: '/receitas', label: 'Receitas', icon: 'book', badge: 0 },
    { to: '/freezer', label: 'Freezer', icon: 'snow', badge: freezerBadge },
    { to: '/planner', label: 'Planner', icon: 'calendar', badge: 0 },
    { to: '/compras', label: 'Compras', icon: 'cart', badge: shop.open },
  ];
  const extra = [
    { to: '/guias', label: 'Guias' },
    { to: '/mais', label: 'Mais' },
  ];

  return (
    <div className="app">
      <a
        href="#conteudo"
        className="skip"
        onClick={(e) => {
          // HashRouter usa o hash para rotas: o atalho só move o foco.
          e.preventDefault();
          document.getElementById('conteudo')?.focus();
        }}
      >
        Pular para o conteúdo
      </a>
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="CongelaFit Premium — início">
          <img src={`${base}icons/logo-mark.png`} alt="" width={44} height={28} />
          <span className="brand-name">
            CONGELA<span>FIT</span> <em>PREMIUM</em>
          </span>
        </NavLink>
        <nav className="topnav" aria-label="Principal">
          {[...links, ...extra.map((e) => ({ ...e, end: false, badge: 0 }))].map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={'end' in l ? l.end : false}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              {l.label}
              {l.badge ? <i className="badge">{l.badge}</i> : null}
            </NavLink>
          ))}
        </nav>
        <Link to="/mais" className="icon-btn menu-btn" aria-label="Mais opções">
          <Icon name="menu" size={20} />
        </Link>
      </header>
      <main className="main" id="conteudo" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="foot">
        <img src={`${base}icons/logo-mark.png`} alt="" width={40} height={25} />
        <p>
          <b>CongelaFit</b> · <a href="https://congelafit.store">congelafit.store</a>
        </p>
      </footer>
      <Toasts />
      <Shield />
      <nav className="tabbar" aria-label="Principal">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon name={l.icon} size={22} />
            <span>{l.label}</span>
            {l.badge ? <i className="badge">{l.badge}</i> : null}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
