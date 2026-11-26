import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ConfirmSheet } from '../components/Sheet';
import { backupFileName, parseBackup } from '../lib/backup';
import { clearAllData, exportData, importData } from '../lib/store';
import { toast } from '../lib/toast';

export function Backup() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const save = () => {
    const backup = exportData();
    const count = Object.keys(backup.data).length;
    if (count === 0) {
      toast('Ainda não há dados para salvar.');
      return;
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Backup salvo.');
  };

  const onFile = async (file: File | undefined) => {
    setError('');
    if (!file) return;
    if (file.size > 5_000_000) {
      setError('Arquivo grande demais para ser um backup do app.');
      return;
    }
    const res = parseBackup(await file.text());
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.count === 0) {
      setError('O backup não tem nenhum dado para restaurar.');
      return;
    }
    setPending(res.data);
  };

  return (
    <div className="page narrow">
      <div className="crumbs">
        <Link to="/mais">Mais</Link> <Icon name="arrow" size={12} /> <span>Backup</span>
      </div>
      <header className="page-head">
        <h1>Backup dos dados</h1>
        <p>
          Seus dados (freezer, planner, lista de compras, favoritas) já ficam salvos automaticamente no seu
          banco de dados protegido do CongelaFit. Você também pode baixar uma cópia extra para guardar fora
          da nuvem.
        </p>
      </header>

      <section className="card backup-card">
        <h2>
          <Icon name="download" size={20} /> Salvar cópia
        </h2>
        <p>Baixa um arquivo com tudo que você registrou no app.</p>
        <button type="button" className="btn" onClick={save}>
          <Icon name="download" size={18} /> Salvar backup
        </button>
      </section>

      <section className="card backup-card">
        <h2>
          <Icon name="upload" size={20} /> Restaurar cópia
        </h2>
        <p>
          Escolha um arquivo de backup do CongelaFit Premium. Ele substitui os dados atuais deste aparelho.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr"
          aria-label="Arquivo de backup"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={18} /> Escolher arquivo
        </button>
        {error && (
          <p className="form-err" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="card backup-card">
        <h2>
          <Icon name="trash" size={20} /> Apagar tudo
        </h2>
        <p>Remove freezer, planner, lista de compras, favoritas e marcações de receitas deste aparelho.</p>
        <button type="button" className="btn ghost danger" onClick={() => setConfirmClear(true)}>
          <Icon name="trash" size={18} /> Apagar dados
        </button>
      </section>

      <p className="small foot-note">
        Seus registros ficam protegidos e criptografados na sua conta CongelaFit e sincronizam ao entrar em
        outro celular, tablet ou computador.
      </p>

      <ConfirmSheet
        open={pending !== null}
        title="Restaurar este backup?"
        message={`Os dados atuais deste aparelho serão substituídos por ${pending ? Object.keys(pending).length : 0} registros do arquivo.`}
        confirmLabel="Restaurar"
        onNo={() => setPending(null)}
        onYes={() => {
          if (pending) importData(pending);
          setPending(null);
          toast('Backup restaurado.');
        }}
      />
      <ConfirmSheet
        open={confirmClear}
        title="Apagar todos os dados?"
        message="Essa ação não pode ser desfeita. Se quiser guardar uma cópia, salve um backup antes."
        confirmLabel="Apagar tudo"
        onNo={() => setConfirmClear(false)}
        onYes={() => {
          clearAllData();
          setConfirmClear(false);
          toast('Dados apagados.');
        }}
      />
    </div>
  );
}
