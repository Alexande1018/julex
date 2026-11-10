import { Link } from 'react-router-dom';
import { btnClases } from '../components/ui';

export default function NoEncontrado() {
  return (
    <div className="grain flex min-h-dvh flex-col bg-ivory">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.24em] text-faint">JULEX</span>
        <p className="num mt-6 font-serif text-[52px] leading-none text-ink/15">404</p>
        <h1 className="mt-2 font-serif text-[25px] leading-tight text-ink">Esta página no existe</h1>
        <p className="mt-2.5 max-w-[38ch] text-[13px] leading-relaxed text-ink-soft">
          El enlace puede estar mal escrito o haber cambiado. Nada se ha roto: tus datos siguen donde
          estaban.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link to="/" className={btnClases('primary', 'md')}>
            Ir al inicio
          </Link>
          <Link to="/barbero/cola" className={btnClases('outline', 'md')}>
            La cola del día
          </Link>
        </div>
      </div>
    </div>
  );
}
