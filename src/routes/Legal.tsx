import { Link } from 'react-router-dom';
import { MarcoLegal, Seccion } from '../components/MarcoLegal';

const DOCUMENTOS = [
  {
    to: '/aviso-legal',
    titulo: 'Aviso legal',
    texto: 'Quién es el titular de JULEX, reglas de uso y reclamaciones.',
  },
  {
    to: '/privacidad',
    titulo: 'Privacidad de JULEX',
    texto: 'Qué datos trata el proveedor, para qué, con quién y cuánto tiempo.',
  },
  {
    to: '/cookies',
    titulo: 'Cookies y almacenamiento',
    texto: 'Qué se guarda en tu dispositivo y por qué no hay banner.',
  },
  {
    to: '/condiciones',
    titulo: 'Condiciones profesionales',
    texto: 'Precio, cuota, llaveros, baja y responsabilidad del servicio.',
  },
  {
    to: '/encargo-tratamiento',
    titulo: 'Encargo de tratamiento',
    texto: 'El acuerdo entre cada negocio y JULEX sobre los datos de sus clientes.',
  },
  {
    to: '/creditos',
    titulo: 'Créditos',
    texto: 'Autoría y licencias de las imágenes y los recursos.',
  },
  {
    to: '/accesibilidad',
    titulo: 'Accesibilidad',
    texto: 'Qué se ha hecho, qué falta y cómo avisar de una barrera.',
  },
];

export default function Legal() {
  return (
    <MarcoLegal
      ceja="Textos legales"
      titulo="Privacidad, condiciones y datos"
      intro={
        <p>
          Todo lo que JULEX publica por escrito, en un solo sitio. Cada local tiene además sus propias
          páginas de identidad, privacidad, reservas y fidelización, enlazadas desde su reserva.
        </p>
      }
    >
      <Seccion titulo="Documentos">
        <ul className="divide-y divide-line-soft rounded-[3px] border border-line bg-paper px-3.5">
          {DOCUMENTOS.map((d) => (
            <li key={d.to}>
              <Link to={d.to} className="group block py-3">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-serif text-[16px] leading-tight text-ink">{d.titulo}</span>
                  <span aria-hidden className="text-faint transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted">{d.texto}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo="Los textos no son un dictamen">
        <p>
          Esta página es la base del servicio y se actualiza cuando cambian el producto, los
          proveedores o la normativa. No sustituye la revisión de un profesional antes de contratar
          con un local real.
        </p>
      </Seccion>
    </MarcoLegal>
  );
}
