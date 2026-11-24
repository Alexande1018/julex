import { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useDb } from './lib/store';
import { Toaster, Wordmark } from './components/ui';
import { arrancarSesion, haySupabase, vigilarSesion } from './lib/acceso';

// Lo que se abre al tocar el llavero (y la portada) va en el paquete principal;
// el resto se descarga solo cuando se visita.
import Landing from './routes/Landing';
import BarberoLogin from './routes/BarberoLogin';
import Tarjeta from './routes/Tarjeta';
import Cita from './routes/Cita';
import Nfc from './routes/Nfc';

const Cola = lazy(() => import('./routes/Cola'));
const Ficha = lazy(() => import('./routes/Ficha'));
const Alta = lazy(() => import('./routes/Alta'));
const Clientes = lazy(() => import('./routes/Clientes'));
const Agenda = lazy(() => import('./routes/Agenda'));
const Panel = lazy(() => import('./routes/Panel'));
const Recepcion = lazy(() => import('./routes/Recepcion'));
const Ajustes = lazy(() => import('./routes/Ajustes'));
const Admin = lazy(() => import('./routes/Admin'));
const AdminLocal = lazy(() => import('./routes/AdminLocal'));
const Legal = lazy(() => import('./routes/Legal'));
const AltaNegocio = lazy(() => import('./routes/AltaNegocio'));
const Funciones = lazy(() => import('./routes/Funciones'));
const NoEncontrado = lazy(() => import('./routes/NoEncontrado'));
const AvisoLegal = lazy(() =>
  import('./routes/legal/proveedor').then((m) => ({ default: m.AvisoLegal })),
);
const Cookies = lazy(() =>
  import('./routes/legal/proveedor').then((m) => ({ default: m.Cookies })),
);
const Privacidad = lazy(() =>
  import('./routes/legal/proveedor').then((m) => ({ default: m.Privacidad })),
);
const Condiciones = lazy(() =>
  import('./routes/legal/contratos').then((m) => ({ default: m.Condiciones })),
);
const Encargo = lazy(() =>
  import('./routes/legal/contratos').then((m) => ({ default: m.Encargo })),
);
const Accesibilidad = lazy(() =>
  import('./routes/legal/varios').then((m) => ({ default: m.Accesibilidad })),
);
const Creditos = lazy(() =>
  import('./routes/legal/varios').then((m) => ({ default: m.Creditos })),
);
const LocalLegal = lazy(() =>
  import('./routes/legal/local').then((m) => ({ default: m.LocalLegal })),
);
const LocalPrivacidad = lazy(() =>
  import('./routes/legal/local').then((m) => ({ default: m.LocalPrivacidad })),
);
const LocalReservas = lazy(() =>
  import('./routes/legal/local').then((m) => ({ default: m.LocalReservas })),
);
const LocalFidelizacion = lazy(() =>
  import('./routes/legal/local').then((m) => ({ default: m.LocalFidelizacion })),
);

function Cargando() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ivory">
      <span className="eyebrow">Cargando…</span>
    </div>
  );
}

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
      <Suspense fallback={<Cargando />}>
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
        <Route
          path="/panel/recepcion"
          element={
            <Requiere>
              <Recepcion />
            </Requiere>
          }
        />
        <Route path="/barbero/alta" element={<Alta />} />

        <Route path="/nfc/:token" element={<Nfc />} />
        <Route path="/c/:token" element={<Tarjeta />} />
        <Route path="/c/:token/cita" element={<Cita />} />
        <Route path="/cita/:slug" element={<Cita />} />

        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/local/:id" element={<AdminLocal />} />
        <Route path="/alta" element={<AltaNegocio />} />
        <Route path="/funciones" element={<Funciones />} />
        <Route path="/legal" element={<Legal />} />
        <Route path="/aviso-legal" element={<AvisoLegal />} />
        <Route path="/privacidad" element={<Privacidad />} />
        <Route path="/cookies" element={<Cookies />} />
        <Route path="/condiciones" element={<Condiciones />} />
        <Route path="/encargo-tratamiento" element={<Encargo />} />
        <Route path="/creditos" element={<Creditos />} />
        <Route path="/accesibilidad" element={<Accesibilidad />} />
        <Route path="/local/:slug/legal" element={<LocalLegal />} />
        <Route path="/local/:slug/privacidad" element={<LocalPrivacidad />} />
        <Route path="/local/:slug/reservas" element={<LocalReservas />} />
        <Route path="/local/:slug/fidelizacion" element={<LocalFidelizacion />} />
        <Route path="*" element={<NoEncontrado />} />
        </Routes>
      </Suspense>
      <Toaster />
    </>
  );
}
