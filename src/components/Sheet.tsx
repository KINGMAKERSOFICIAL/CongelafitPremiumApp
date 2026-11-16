import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Janela modal (folha que sobe no celular, caixa central no computador). Usa <dialog>: Esc e foco já funcionam. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`sheet ${wide ? 'wide' : ''}`}
      aria-label={title}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="sheet-in">
          <header className="sheet-head">
            <h2>{title}</h2>
            <button type="button" className="icon-btn sm" onClick={onClose} aria-label="Fechar">
              <Icon name="close" size={18} />
            </button>
          </header>
          <div className="sheet-body">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel,
  danger = true,
  onYes,
  onNo,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <Sheet open={open} onClose={onNo} title={title}>
      <p className="sheet-msg">{message}</p>
      <div className="sheet-actions">
        <button type="button" className="btn ghost" onClick={onNo}>
          Cancelar
        </button>
        <button type="button" className={`btn ${danger ? 'danger' : ''}`} onClick={onYes}>
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
