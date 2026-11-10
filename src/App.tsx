import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useDb } from './lib/store';
import { Toaster, Wordmark } from './components/ui';
import { arrancarSesion, haySupabase, vigilarSesion } from './lib/acceso';
import Landing from './routes/Landing';
import BarberoLogin from './routes/BarberoLogin';
import Cola from './routes/Cola';
import Ficha from './routes/Ficha';
import Alta from './routes/Alta';
import Clientes from './routes/Clientes';
import Agenda from './routes/Agenda';
import Panel from './routes/Panel';
import Ajustes from './routes/Ajustes';
import Tarjeta from './routes/Tarjeta';
import Cita from './routes/Cita';
import Nfc from './routes/Nfc';
import Admin from './routes/Admin';
import Legal from './routes/Legal';
import NoEncontrado from './routes/NoEncontrado';

function Requiere({ children }: { children: React.ReactNode }) {
  const db = useDb();
  const loc = useLocation();
  if (!db.sesion) {
    const next = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/barbero/login?next=${next}`} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const [listo, setListo] = useState(!haySupabase);

  useEffect(() => {
    if (!haySupabase) return;
    let montado = true;
    arrancarSesion()
      .catch((e) => console.error('arranque', e))
      .finally(() => {
        if (montado) setListo(true);
      });
    const soltar = vigilarSesion();
    return () => {
      montado = false;
      soltar();
    };
  }, []);

  if (!listo) {
    return (
      <div className="grain flex min-h-dvh flex-col items-center justify-center gap-5 bg-ivory">
        <Wordmark />
        <span className="eyebrow">Abriendo tu barbería</span>
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />

        <Route path="/barbero/login" element={<BarberoLogin />} />
        <Route path="/barbero" element={<Navigate to="/barbero/cola" replace />} />
        <Route
          path="/barbero/cola"
          element={
            <Requiere>
              <Cola />
            </Requiere>
          }
        />
        <Route
          path="/barbero/clientes"
          element={
            <Requiere>
              <Clientes />
            </Requiere>
          }
        />
        <Route
          path="/barbero/clientes/:id"
          element={
            <Requiere>
              <Ficha />
            </Requiere>
          }
        />
        <Route
          path="/barbero/agenda"
          element={
            <Requiere>
              <Agenda />
            </Requiere>
          }
        />
        <Route
          path="/barbero/panel"
          element={
            <Requiere>
              <Panel />
            </Requiere>
          }
        />
        <Route
          path="/barbero/ajustes"
          element={
            <Requiere>
              <Ajustes />
            </Requiere>
          }
        />
        <Route path="/barbero/alta" element={<Alta />} />

        <Route path="/nfc/:token" element={<Nfc />} />
        <Route path="/c/:token" element={<Tarjeta />} />
        <Route path="/c/:token/cita" element={<Cita />} />
        <Route path="/cita/:slug" element={<Cita />} />

        <Route path="/admin" element={<Admin />} />
        <Route path="/legal" element={<Legal />} />
        <Route path="*" element={<NoEncontrado />} />
      </Routes>
      <Toaster />
    </>
  );
}
