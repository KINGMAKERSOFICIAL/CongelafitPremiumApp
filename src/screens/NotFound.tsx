import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="page empty-page">
      <h1>Não encontramos essa página</h1>
      <p>A receita ou categoria pode ter mudado de lugar.</p>
      <Link className="btn" to="/">
        Voltar ao início
      </Link>
    </div>
  );
}
