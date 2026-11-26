import { useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { PasswordInput } from '../components/PasswordInput';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

const base = import.meta.env.BASE_URL;

type AuthMode = 'login' | 'forgot' | 'first';

export function Login() {
  const { login, firstAccess, forgotPassword, authNotice, clearAuthNotice, config } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError('');
    setInfo('');
    clearAuthNotice();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    clearAuthNotice();

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Informe um e-mail válido.');
      return;
    }

    if (mode === 'forgot') {
      setBusy(true);
      try {
        const res = await forgotPassword(cleanEmail);
        setInfo(res.message);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível solicitar nova senha.');
      } finally {
        setBusy(false);
      }
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
      setError('Digite a senha recebida por e-mail.');
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
            <p className="small">Área de Membros · Acesso integrado à Kiwify</p>
          </div>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Tipo de acesso">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`auth-tab ${mode === 'login' ? 'on' : ''}`}
            onClick={() => switchMode('login')}
          >
            <Icon name="lock" size={16} /> Entrar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'forgot'}
            className={`auth-tab ${mode === 'forgot' ? 'on' : ''}`}
            onClick={() => switchMode('forgot')}
          >
            <Icon name="send" size={16} /> Reenviar senha
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'first'}
            className={`auth-tab ${mode === 'first' ? 'on' : ''}`}
            onClick={() => switchMode('first')}
          >
            <Icon name="spark" size={16} /> 1º acesso
          </button>
        </div>

        {authNotice && (
          <div className="callout no" role="alert">
            <Icon name="warn" size={18} />
            <div>
              <b>Acesso suspenso ou desconectado</b>
              <p>{authNotice}</p>
            </div>
          </div>
        )}

        {info && (
          <div className="callout ok" role="status">
            <Icon name="check" size={18} />
            <div>
              <b>Informação de acesso</b>
              <p>{info}</p>
            </div>
          </div>
        )}

        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="auth-email">E-mail usado na compra da Kiwify</label>
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

          {mode !== 'forgot' && (
            <div className="field">
              <label htmlFor="auth-pass">
                {mode === 'first' ? 'Crie sua senha (mín. 6 caracteres)' : 'Senha recebida por e-mail'}
              </label>
              <PasswordInput
                id="auth-pass"
                autoComplete={mode === 'first' ? 'new-password' : 'current-password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}

          {mode === 'first' && (
            <div className="field">
              <label htmlFor="auth-confirm">Confirmar senha</label>
              <PasswordInput
                id="auth-confirm"
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
            <Icon name={mode === 'forgot' ? 'send' : mode === 'first' ? 'check' : 'lock'} size={18} />
            {busy
              ? 'Processando…'
              : mode === 'forgot'
                ? 'Enviar nova senha por e-mail'
                : mode === 'first'
                  ? 'Ativar acesso e entrar'
                  : 'Entrar na área de membros'}
          </button>
        </form>

        <div className="auth-foot">
          <p className="small">
            {mode === 'login'
              ? 'Após o pagamento na Kiwify ser aprovado, seu e-mail e senha chegam automaticamente na sua caixa de entrada (confira também o spam).'
              : mode === 'forgot'
                ? 'Enviaremos uma nova senha temporária para o e-mail cadastrado caso sua assinatura/compra esteja ativa.'
                : 'Se seu pagamento na Kiwify já foi aprovado e você preferir definir sua senha agora, preencha os campos acima.'}
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
