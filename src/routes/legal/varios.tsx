import { Link } from 'react-router-dom';
import { Lista, MarcoLegal, Seccion, Tabla } from '../../components/MarcoLegal';

const CONTACTO = 'gestionjulex@gmail.com';

export function Accesibilidad() {
  return (
    <MarcoLegal
      ceja="Accesibilidad"
      titulo="Qué se ha hecho y qué falta"
      intro={
        <p>
          Información honesta sobre la accesibilidad de JULEX. No se declara una conformidad que no se
          ha auditado. Versión 1 · 11 de noviembre de 2026.
        </p>
      }
    >
      <Seccion titulo="Compromiso">
        <p>
          JULEX quiere que se pueda usar con una mano, con el móvil del barbero y también con lector de
          pantalla. No hay una certificación de conformidad con la norma UNE-EN 301549: no se ha hecho
          una auditoría externa.
        </p>
      </Seccion>

      <Seccion titulo="Lo que ya está">
        <Lista
          items={[
            'Interfaz en español, con textos claros y sin abreviaturas innecesarias.',
            'Objetivos táctiles amplios y navegación por teclado en escritorio.',
            'Contraste alto entre el texto y el fondo; el color de marca nunca es el único indicador.',
            'Etiquetas en los campos y avisos leídos como alertas por los lectores de pantalla.',
            'Los desplegables y diálogos funcionan con teclado y se pueden cerrar con Escape.',
          ]}
        />
      </Seccion>

      <Seccion titulo="Limitaciones conocidas">
        <Lista
          items={[
            'Las fotografías decorativas no llevan descripción larga; sí llevan texto alternativo las que informan.',
            'Algunos textos legales son largos: no hay versión en lectura fácil todavía.',
            'El contraste del texto más pequeño sobre papel puede no llegar al nivel AAA.',
            'No se ha probado con todos los lectores de pantalla ni con todos los navegadores.',
          ]}
        />
      </Seccion>

      <Seccion titulo="Contacto y reclamaciones">
        <p>
          Si algo no se puede usar o se entiende mal, escribe a{' '}
          <a href={`mailto:${CONTACTO}`} className="underline decoration-line underline-offset-2">
            {CONTACTO}
          </a>{' '}
          contando qué pasa y con qué dispositivo. Se intentará resolver o dar una alternativa.
        </p>
      </Seccion>
    </MarcoLegal>
  );
}

export function Creditos() {
  return (
    <MarcoLegal
      ceja="Créditos"
      titulo="Imágenes y recursos"
      intro={
        <p>
          Qué hay en las fotos del producto y con qué licencia. Versión 1 · 11 de noviembre de 2026.
        </p>
      }
    >
      <Seccion titulo="Fotografías de archivo">
        <Tabla
          cabecera={['Archivo', 'Original', 'Autoría', 'Licencia']}
          filas={[
            [
              'manos.webp',
              'Barber cutting hair with comb. Back view of man in barber shop',
              'Nenad Stojkovic · Wikimedia Commons',
              'CC BY 2.0',
            ],
            [
              'tienda.webp',
              'Pingpank Barber Shop, 413 Bleecker Street, Manhattan, 1938',
              'New York Public Library',
              'Dominio público',
            ],
          ]}
        />
        <p>
          Las dos están reveladas en duotono para que formen un mismo sistema. La atribución de la
          fotografía de las manos se mantiene visible en esta página, como exige su licencia.
        </p>
      </Seccion>

      <Seccion titulo="Ilustraciones generadas con IA">
        <p>
          La imagen de portada y las cuatro de los oficios se generaron con inteligencia artificial
          para JULEX, se recortaron y se revelaron en el mismo duotono. No se les atribuye una
          exclusividad jurídica que no esté verificada.
        </p>
        <Lista
          items={[
            'Portada: cuaderno de citas y llavero JULEX.',
            'Oficios: barbería, peluquería, salón de uñas y estudio de tatuaje.',
          ]}
        />
      </Seccion>

      <Seccion titulo="Tipografía y software">
        <p>
          Fraunces y Manrope, con licencia SIL Open Font License. React, Vite, Tailwind y las demás
          dependencias mantienen sus licencias originales.
        </p>
      </Seccion>

      <Seccion titulo="Más información">
        <p>
          El aviso legal está en{' '}
          <Link to="/aviso-legal" className="underline decoration-line underline-offset-2">
            aviso legal
          </Link>{' '}
          y la privacidad en{' '}
          <Link to="/privacidad" className="underline decoration-line underline-offset-2">
            privacidad
          </Link>
          .
        </p>
      </Seccion>
    </MarcoLegal>
  );
}
