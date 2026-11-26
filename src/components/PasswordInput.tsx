import { useState, type InputHTMLAttributes } from 'react';
import { Icon } from './Icon';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="pass-wrap">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="pass-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visible}
        title={visible ? 'Ocultar senha' : 'Mostrar senha'}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} size={18} />
      </button>
    </div>
  );
}
