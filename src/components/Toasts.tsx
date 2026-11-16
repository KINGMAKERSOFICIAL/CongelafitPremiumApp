import { Link } from 'react-router-dom';
import { dismiss, useToasts } from '../lib/toast';

export function Toasts() {
  const list = useToasts();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.text}</span>
          {t.to && (
            <Link to={t.to} onClick={() => dismiss(t.id)}>
              {t.linkLabel ?? 'Ver'}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
