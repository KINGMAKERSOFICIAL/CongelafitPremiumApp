import { Suspense, lazy } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { About } from './screens/About';
import { Affiliate } from './screens/Affiliate';
import { Backup } from './screens/Backup';
import { Browse } from './screens/Browse';
import { Category } from './screens/Category';
import { Favorites } from './screens/Favorites';
import { Freezer } from './screens/Freezer';
import { FreezerForm } from './screens/FreezerForm';
import { Guide, Guides } from './screens/Guides';
import { Home } from './screens/Home';
import { Label } from './screens/Label';
import { More } from './screens/More';
import { NotFound } from './screens/NotFound';
import { Planner } from './screens/Planner';
import { Recipe } from './screens/Recipe';
import { Search } from './screens/Search';
import { ShopItems } from './screens/ShopItems';
import { Shopping } from './screens/Shopping';

const Admin = lazy(() => import('./screens/Admin').then((m) => ({ default: m.Admin })));

export default function AuthenticatedApp() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="receitas" element={<Browse />} />
          <Route path="categoria/:id" element={<Category />} />
          <Route path="receita/:id" element={<Recipe />} />
          <Route path="buscar" element={<Search />} />
          <Route path="favoritos" element={<Favorites />} />
          <Route path="freezer" element={<Freezer />} />
          <Route path="freezer/novo" element={<FreezerForm />} />
          <Route path="freezer/editar/:id" element={<FreezerForm />} />
          <Route path="freezer/etiqueta/:id" element={<Label />} />
          <Route path="planner" element={<Planner />} />
          <Route path="compras" element={<Shopping />} />
          <Route path="guias" element={<Guides />} />
          <Route path="guias/:id" element={<Guide />} />
          <Route path="itens" element={<ShopItems />} />
          <Route path="afiliado" element={<Affiliate />} />
          <Route
            path="admin"
            element={
              <Suspense
                fallback={
                  <div className="page">
                    <div className="card pad-card">
                      <p className="small">Carregando painel administrativo…</p>
                    </div>
                  </div>
                }
              >
                <Admin />
              </Suspense>
            }
          />
          <Route path="mais" element={<More />} />
          <Route path="backup" element={<Backup />} />
          <Route path="sobre" element={<About />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
