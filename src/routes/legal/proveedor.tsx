import { Link } from 'react-router-dom';
import { Lista, MarcoLegal, Seccion, Tabla } from '../../components/MarcoLegal';

const CONTACTO = 'gestionjulex@gmail.com';

export function AvisoLegal() {
  return (
    <MarcoLegal
      ceja="Aviso legal"
      titulo="Quién está detrás de JULEX"
      intro={
        <p>
          Información del titular del sitio y reglas básicas de uso. Versión 1 · 11 de noviembre de
          2026.
        </p>
      }
    >
      <Seccion titulo="Identificación del titular">
        <p>
          El titular de este sitio web y prestador del servicio JULEX es <strong>Alexander Acero</strong>,
          con NIF <strong>18508170R</strong> y domicilio en <strong>Alicante</strong>, España. Puedes
          contactar para consultas, soporte, privacidad y reclamaciones en{' '}
          <a href={`mailto:${CONTACTO}`} className="underline decoration-line underline-offset-2">
            {CONTACTO}
          </a>
          .
        </p>
        <p>
          El sitio es <strong>julex.pages.dev</strong>. Esta identificación corresponde a una persona
          física: no se declara una sociedad ni una inscripción registral que no exista.
        </p>
      </Seccion>

      <Seccion titulo="Qué es JULEX">
        <p>
          JULEX es una herramienta para que negocios profesionales gestionen citas, turnos, fichas de
          clientes, visitas, fidelización y llaveros identificativos. Las funciones disponibles
          dependen de lo contratado y de la configuración de cada local.
        </p>
        <p>
          El servicio profesional —barbería, peluquería, manicura, tatuaje u otro— lo presta el
          establecimiento que aparece identificado en su página de reserva o en la tarjeta del
          cliente. JULEX pone la herramienta y responde de sus propias obligaciones; no sustituye al
          establecimiento en la atención presencial.
        </p>
      </Seccion>

      <Seccion titulo="Uso de la web">
        <Lista
          items={[
            'Usa la web de forma lícita y respetando los derechos de otras personas.',
            'No accedas a cuentas o fichas ajenas, no compartas accesos sin autorización y no manipules reservas.',
            'Las cuentas profesionales solo las puede usar personal autorizado por el negocio.',
            'Los enlaces de tarjetas y llaveros son personales: consérvalos con cuidado y no los publiques.',
          ]}
        />
      </Seccion>

      <Seccion titulo="Propiedad intelectual y contenidos">
        <p>
          Los contenidos y elementos de la web pertenecen a sus respectivos titulares. El acceso al
          sitio no concede autorización general para reutilizarlos fuera de los usos permitidos por la
          ley o por su licencia.
        </p>
        <p>
          Los recursos de terceros y las imágenes generadas con inteligencia artificial se identifican
          en <Link to="/creditos" className="underline decoration-line underline-offset-2">créditos</Link>.
        </p>
      </Seccion>

      <Seccion titulo="Disponibilidad y enlaces">
        <p>
          JULEX procura mantener la web disponible y corregir sus errores. Puede haber interrupciones
          por mantenimiento, incidencias o causas externas, que se gestionan según las condiciones
          contratadas.
        </p>
        <p>
          Los enlaces a sitios de terceros dan acceso a información o servicios ajenos, con sus propias
          condiciones. Esa mención no excluye las responsabilidades que legalmente correspondan.
        </p>
      </Seccion>

      <Seccion titulo="Contratación, privacidad y reclamaciones">
        <p>
          La contratación profesional se rige por las{' '}
          <Link to="/condiciones" className="underline decoration-line underline-offset-2">
            condiciones de JULEX
          </Link>{' '}
          y por la orden de servicio aceptada. El tratamiento de datos se explica en la{' '}
          <Link to="/privacidad" className="underline decoration-line underline-offset-2">
            política de privacidad
          </Link>{' '}
          y el almacenamiento en dispositivos, en la{' '}
          <Link to="/cookies" className="underline decoration-line underline-offset-2">
            política de cookies
          </Link>
          .
        </p>
        <p>
          Para consultas o reclamaciones sobre JULEX escribe a{' '}
          <a href={`mailto:${CONTACTO}`} className="underline decoration-line underline-offset-2">
            {CONTACTO}
          </a>
          . Las incidencias del servicio presencial se dirigen al establecimiento identificado, sin
          perjuicio de los derechos que correspondan a cada parte.
        </p>
      </Seccion>
    </MarcoLegal>
  );
}

export function Privacidad() {
  return (
    <MarcoLegal
      ceja="Privacidad"
      titulo="Qué hace JULEX con tus datos"
      intro={
        <p>
          Esta política cubre los tratamientos propios de JULEX como proveedor del software. Los datos
          de los clientes de un local se rigen por la política de privacidad de ese local. Versión 1 ·
          11 de noviembre de 2026.
        </p>
      }
    >
      <Seccion titulo="Responsable y contacto">
        <p>
          El responsable es <strong>Alexander Acero</strong>, NIF 18508170R, domicilio en Alicante,
          España. Para derechos de protección de datos:{' '}
          <a href={`mailto:${CONTACTO}`} className="underline decoration-line underline-offset-2">
            {CONTACTO}
          </a>
          . No hay delegado de protección de datos designado.
        </p>
      </Seccion>

      <Seccion titulo="Qué tratamos y para qué">
        <Tabla
          cabecera={['Finalidad', 'Datos', 'Base jurídica']}
          filas={[
            [
              'Atender una consulta o preparar una contratación',
              'Nombre, contacto y contenido de la consulta',
              'Medidas precontractuales o interés legítimo',
            ],
            [
              'Crear y mantener la cuenta del negocio',
              'Correo, credenciales (las gestiona el sistema de autenticación) y configuración del local',
              'Ejecución del contrato',
            ],
            [
              'Facturar y cumplir obligaciones fiscales',
              'Identificación fiscal y domicilio del negocio, importes',
              'Contrato y obligación legal',
            ],
            [
              'Soporte y seguridad',
              'Datos de la cuenta, registros técnicos de acceso y errores',
              'Interés legítimo en prestar y proteger el servicio',
            ],
            [
              'Datos de los clientes del local',
              'Los que el local guarda en su cuenta (fichas, visitas, citas, llaveros)',
              'JULEX actúa como encargado del tratamiento; decide el local',
            ],
          ]}
        />
      </Seccion>

      <Seccion titulo="Datos de los clientes de cada local">
        <p>
          Cada negocio es el responsable de las fichas de sus clientes. JULEX las aloja y las trata
          solo siguiendo sus instrucciones, según el acuerdo de encargo. No las usa para fines
          propios ni las vende.
        </p>
      </Seccion>

      <Seccion titulo="Proveedores y destinatarios">
        <p>Para prestar el servicio se usan estos proveedores, que actúan como encargados:</p>
        <Lista
          items={[
            <>
              <strong>Supabase</strong> (base de datos y autenticación), con el proyecto alojado en la
              región de Fráncfort (Unión Europea).
            </>,
            <>
              <strong>Cloudflare</strong> (alojamiento de la web y red de distribución), con presencia
              global.
            </>,
          ]}
        />
        <p>
          No se venden datos ni se ceden a terceros con fines publicitarios. Además de esos
          proveedores, solo se comunican datos cuando lo exige la ley o una autoridad competente.
        </p>
      </Seccion>

      <Seccion titulo="Transferencias internacionales">
        <p>
          El tratamiento principal está en la Unión Europea. Algunos proveedores son sociedades
          estadounidenses y pueden realizar accesos o tratamientos fuera del Espacio Económico
          Europeo, amparados en las garantías de sus contratos de encargo y en las cláusulas
          contractuales tipo. Puedes pedir información sobre esas garantías en el correo de contacto.
        </p>
      </Seccion>

      <Seccion titulo="Cuánto tiempo">
        <Tabla
          cabecera={['Dato', 'Plazo']}
          filas={[
            ['Visitas y fidelización', 'Mientras el cliente esté activo y hasta un año después'],
            ['Reservas no atendidas', 'Seis meses'],
            ['Facturación', 'Cinco años, por obligación mercantil y fiscal'],
            ['Registros técnicos y de seguridad', 'Noventa días'],
            ['Copias de seguridad', 'Treinta días'],
            ['Solicitudes de derechos', 'El tiempo necesario para atenderlas y acreditar su resolución'],
          ]}
        />
      </Seccion>

      <Seccion titulo="Tus derechos">
        <p>
          Puedes pedir acceso, rectificación, supresión, oposición, limitación y portabilidad, y
          retirar los permisos que hayas dado, escribiendo a{' '}
          <a href={`mailto:${CONTACTO}`} className="underline decoration-line underline-offset-2">
            {CONTACTO}
          </a>
          . Se responde en el plazo máximo de un mes.
        </p>
        <p>
          Si crees que no se ha atendido bien, puedes reclamar ante la Agencia Española de Protección
          de Datos (aepd.es). En lo que se refiere a las fichas de clientes de un local, el responsable
          es ese local: su política y su contacto están en la página legal de cada establecimiento.
        </p>
      </Seccion>

      <Seccion titulo="Decisiones automatizadas y cambios">
        <p>
          No se toman decisiones con efectos jurídicos basadas únicamente en tratamientos
          automatizados. La lista de espera y el reparto de sillas son reglas del propio local, no
          perfiles comerciales.
        </p>
        <p>
          Cuando cambien el producto, los proveedores o la normativa, se actualizará esta página con
          su versión y fecha.
        </p>
      </Seccion>
    </MarcoLegal>
  );
}

export function Cookies() {
  return (
    <MarcoLegal
      ceja="Cookies y almacenamiento"
      titulo="Lo que se guarda en tu dispositivo"
      intro={
        <p>
          JULEX no usa cookies de publicidad ni de analítica. Solo guarda en el navegador lo necesario
          para que la aplicación funcione. Versión 1 · 11 de noviembre de 2026.
        </p>
      }
    >
      <Seccion titulo="Qué hay guardado y para qué">
        <Tabla
          cabecera={['Elemento', 'Dónde', 'Para qué', 'Duración']}
          filas={[
            [
              'sb-<ref>-auth-token',
              'localStorage',
              'Mantener la sesión del negocio',
              'Según la configuración de Supabase; se borra al cerrar sesión',
            ],
            [
              'julex.pin.<token>',
              'sessionStorage',
              'Recordar el PIN mientras dura la pestaña',
              'Hasta cerrar la pestaña',
            ],
            [
              'julex-v7 y anteriores',
              'Cache Storage (service worker)',
              'Guardar los ficheros de la aplicación para que cargue rápido y funcione sin conexión',
              'Hasta que se sustituye por una versión nueva',
            ],
            [
              'julex.demo.v1',
              'localStorage',
              'Datos de demostración, solo en la versión de prueba',
              'Hasta borrarlo o reiniciar la demo',
            ],
          ]}
        />
      </Seccion>

      <Seccion titulo="Por qué no hay banner">
        <p>
          No hay analítica, ni publicidad, ni seguimiento de terceros. Todo lo que se guarda es
          necesario para la función que pides: mantener tu sesión, recordar el PIN de la pestaña o
          servir la aplicación. Si algún día se añade una finalidad distinta, se pedirá permiso antes
          y esta página lo dirá.
        </p>
      </Seccion>

      <Seccion titulo="Cómo borrarlo">
        <p>
          Puedes borrar estos datos desde las opciones de tu navegador. Si borras la sesión, tendrás
          que volver a entrar; si borras la caché, la aplicación se descargará de nuevo; si borras los
          datos de la demo, se pierden los cambios de prueba.
        </p>
        <p>
          En el móvil no hay que hacer nada especial: al cerrar sesión se elimina la sesión y el PIN de
          esa pestaña.
        </p>
      </Seccion>

      <Seccion titulo="Terceros">
        <p>
          La aplicación no carga scripts de terceros. Los proveedores de infraestructura (Supabase y
          Cloudflare) pueden registrar datos técnicos de la conexión, como cualquier servidor, según
          se explica en la <Link to="/privacidad" className="underline decoration-line underline-offset-2">política de privacidad</Link>.
        </p>
      </Seccion>
    </MarcoLegal>
  );
}
