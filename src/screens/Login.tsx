import { useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

const base = import.meta.env.BASE_URL;

export function Login() {
  const { login, firstAccess, config } = useAuth();
  const [mode, setMode] = useState<'login' | 'first'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Informe um e-mail válido.');
      return;
    }

    if (mode === 'first') {
      if (password.length < 6) {
        setError('A senha precisa ter pelo menos 6 caracteres.');
        return;
      }
      if (password !== confirm) {
        setError('As senhas não conferem.');
        return;
      }
    } else if (!password) {
      setError('Digite sua senha.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        await login(cleanEmail, password);
      } else {
        await firstAccess(cleanEmail, password, name.trim() || undefined);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NEEDS_PASSWORD_SETUP') {
        setMode('first');
        setPassword('');
        setConfirm('');
        setInfo(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card card">
        <div className="auth-brand">
          <img src={`${base}icons/logo-mark.png`} alt="" width={58} height={37} />
          <div>
            <span className="brand-name">
              CONGELA<span>FIT</span> <em>PREMIUM</em>
            </span>
            <p className="small">Área de Membros · Acesso via Kiwify</p>
          </div>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Tipo de acesso">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`auth-tab ${mode === 'login' ? 'on' : ''}`}
            onClick={() => {
              setMode('login');
              setError('');
              setInfo('');
            }}
          >
            <Icon name="lock" size={16} /> Entrar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'first'}
            className={`auth-tab ${mode === 'first' ? 'on' : ''}`}
            onClick={() => {
              setMode('first');
              setError('');
              setInfo('');
            }}
          >
            <Icon name="spark" size={16} /> Primeiro acesso
          </button>
        </div>

        {info && (
          <div className="callout ok" role="status">
            <Icon name="check" size={18} />
            <div>
              <b>Compra confirmada na Kiwify</b>
              <p>{info}</p>
            </div>
          </div>
        )}

        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="auth-email">E-mail da conta / compra Kiwify</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              placeholder="seuemail@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {mode === 'first' && (
            <div className="field">
              <label htmlFor="auth-name">Seu nome (opcional)</label>
              <input
                id="auth-name"
                type="text"
                autoComplete="name"
                placeholder="Como prefere ser chamado"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="auth-pass">{mode === 'first' ? 'Crie sua senha (mín. 6 caracteres)' : 'Senha'}</label>
            <input
              id="auth-pass"
              type="password"
              autoComplete={mode === 'first' ? 'new-password' : 'current-password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {mode === 'first' && (
            <div className="field">
              <label htmlFor="auth-confirm">Confirmar senha</label>
              <input
                id="auth-confirm"
                type="password"
                autoComplete="new-password"
                placeholder="Repita a senha"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
          )}

          {error && (
            <p className="form-err" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn auth-submit" disabled={busy}>
            <Icon name={mode === 'first' ? 'check' : 'lock'} size={18} />
            {busy ? 'Verificando…' : mode === 'first' ? 'Ativar acesso e entrar' : 'Entrar na área de membros'}
          </button>
        </form>

        <div className="auth-foot">
          <p className="small">
            {mode === 'login'
              ? 'Acabou de comprar na Kiwify? Use a aba "Primeiro acesso" com o mesmo e-mail da compra para criar sua senha.'
              : 'Seu acesso é liberado automaticamente assim que a Kiwify confirma o pagamento.'}
          </p>
          {config.kiwifyCheckoutUrl && (
            <a
              href={config.kiwifyCheckoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn ghost sm"
            >
              <Icon name="external" size={16} /> Ainda não tenho acesso · Comprar na Kiwify
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
