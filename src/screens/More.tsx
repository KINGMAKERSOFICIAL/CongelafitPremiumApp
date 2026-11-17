import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { useAuth } from '../lib/auth';
import { toast } from '../lib/toast';

const ITEMS = [
  {
    to: '/itens',
    icon: 'bag',
    title: 'Itens para o dia a dia',
    text: 'Potes, balança e utensílios recomendados para preparar e congelar suas marmitas.',
  },
  {
    to: '/afiliado',
    icon: 'gift',
    title: 'Indique e ganhe na Kiwify',
    text: 'Afilie-se ao CongelaFit e ganhe comissão indicando de forma orgânica no WhatsApp.',
  },
  {
    to: '/guias',
    icon: 'shield',
    title: 'Guias',
    text: 'Congelar, descongelar, validade e rotina de marmitas.',
  },
  {
    to: '/favoritos',
    icon: 'heart',
    title: 'Receitas favoritas',
    text: 'As receitas que você marcou com o coração.',
  },
  { to: '/buscar', icon: 'search', title: 'Buscar receitas', text: 'Por prato ou ingrediente.' },
  {
    to: '/backup',
    icon: 'download',
    title: 'Backup dos dados',
    text: 'Salve ou restaure freezer, planner e lista de compras.',
  },
  {
    to: '/sobre',
    icon: 'info',
    title: 'Sobre o app',
    text: 'Como ler calorias, rendimento e o que o app guarda.',
  },
];

export function More() {
  const { user, logout, changePassword } = useAuth();
  const [passOpen, setPassOpen] = useState(false);
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [passErr, setPassErr] = useState('');
  const [saving, setSaving] = useState(false);

  const handlePass = async (e: FormEvent) => {
    e.preventDefault();
    setPassErr('');
    if (newPass.length < 6) {
      setPassErr('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setSaving(true);
    try {
      await changePassword(curPass, newPass);
      setPassOpen(false);
      setCurPass('');
      setNewPass('');
      toast('Senha atualizada com sucesso!');
    } catch (err) {
      setPassErr(err instanceof Error ? err.message : 'Erro ao atualizar senha.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Mais</p>
        <h1>Outras ferramentas</h1>
      </header>

      {user?.role === 'admin' && (
        <section className="admin-banner">
          <Link to="/admin" className="card guide-card admin-entry">
            <span className="guide-ico">
              <Icon name="chart" size={26} />
            </span>
            <div>
              <h2>Painel do Administrador</h2>
              <p>Análises de uso, Webhook da Kiwify, trocar imagens das receitas e gerenciar links afiliados.</p>
            </div>
            <Icon name="arrow" size={18} />
          </Link>
        </section>
      )}

      <ul className="guide-grid">
        {ITEMS.map((i) => (
          <li key={i.to}>
            <Link to={i.to} className="card guide-card">
              <span className="guide-ico">
                <Icon name={i.icon} size={26} />
              </span>
              <div>
                <h2>{i.title}</h2>
                <p>{i.text}</p>
              </div>
              <Icon name="arrow" size={18} />
            </Link>
          </li>
        ))}
      </ul>

      {user && (
        <section className="card account-card">
          <div className="account-info">
            <span className="guide-ico">
              <Icon name="user" size={24} />
            </span>
            <div>
              <h2>{user.name}</h2>
              <p className="small">
                {user.email} · {user.role === 'admin' ? 'Administrador' : 'Membro Kiwify ativo'}
              </p>
            </div>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                setPassErr('');
                setPassOpen(true);
              }}
            >
              <Icon name="lock" size={15} /> Alterar senha
            </button>
            <button type="button" className="btn ghost danger sm" onClick={() => void logout()}>
              <Icon name="logout" size={15} /> Sair
            </button>
          </div>
        </section>
      )}

      <p className="small foot-note">
        CongelaFit Premium · <a href="https://www.congelafit.com.br">www.congelafit.com.br</a>
      </p>

      <Sheet open={passOpen} onClose={() => setPassOpen(false)} title="Alterar senha">
        <form className="form" onSubmit={handlePass}>
          <div className="field">
            <label htmlFor="cur-pass">Senha atual</label>
            <input
              id="cur-pass"
              type="password"
              value={curPass}
              onChange={(e) => setCurPass(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-pass">Nova senha (mín. 6 caracteres)</label>
            <input
              id="new-pass"
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              required
            />
          </div>
          {passErr && (
            <p className="form-err" role="alert">
              {passErr}
            </p>
          )}
          <div className="sheet-actions">
            <button type="button" className="btn ghost" onClick={() => setPassOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn" disabled={saving}>
              <Icon name="check" size={16} /> {saving ? 'Salvando…' : 'Salvar senha'}
            </button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
