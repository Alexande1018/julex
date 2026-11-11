import { Link } from 'react-router-dom';
import { Lista, MarcoLegal, Seccion, Tabla } from '../../components/MarcoLegal';

const CONTACTO = 'gestionjulex@gmail.com';

export function Condiciones() {
  return (
    <MarcoLegal
      ceja="Condiciones profesionales"
      titulo="Lo que contratas y lo que cuesta"
      intro={
        <p>
          Estas condiciones son entre JULEX y el negocio, no entre el negocio y su cliente. Al
          contratar declaras que actúas en el ámbito de tu actividad profesional. Versión 1 · 11 de
          noviembre de 2026.
        </p>
      }
    >
      <Seccion titulo="Partes y objeto">
        <p>
          Prestador: Alexander Acero, NIF 18508170R, Alicante, España, {CONTACTO}. Cliente: el negocio
          que acepta estas condiciones y su orden de servicio.
        </p>
        <p>
          JULEX presta una herramienta para gestionar citas, turnos, fichas de clientes, visitas,
          fidelización y llaveros. No presta el servicio de barbería, peluquería, manicura ni tatuaje:
          eso lo hace el establecimiento con sus propios medios y responsabilidad.
        </p>
      </Seccion>

      <Seccion titulo="Alta, precio y cuota">
        <p className="font-serif text-[15px] leading-snug text-ink">
          Una cuota que nunca supera los 40 €/mes. Incluye hasta 40 llaveros activos. A partir de ahí,
          cada llavero nuevo cuesta 1 € una sola vez, sin aumentar la cuota mensual.
        </p>
        <Tabla
          cabecera={['Concepto', 'Importe', 'Cuándo']}
          filas={[
            ['Alta', '30 € + IVA', 'Una vez, al contratar; incluye 15 llaveros y el primer mes'],
            [
              'Cuota mensual',
              '15 €/mes + IVA como mínimo; 1 € más por cada llavero activo a partir del decimoquinto, hasta un tope de 40 €/mes',
              'Desde el día 1 del mes siguiente al alta',
            ],
            [
              'Llavero adicional',
              '1 € + IVA, una sola vez por llavero, desde el decimosexto',
              'Al pedirlo; no se repite',
            ],
          ]}
        />
        <p>
          Ejemplos: con los 15 del alta se pagan 15 €/mes. Con 30 llaveros, 30 €/mes y 15 € una sola
          vez por los quince que no venían incluidos. Con 50, 40 €/mes (tope) y 35 € una sola vez. Con
          100, 40 €/mes y 85 € una sola vez.
        </p>
        <p>
          Los importes se facturan con el IVA que corresponda. La cuota se devenga por meses completos
          naturales y no se prorratea por días. El alta incluye el primer mes: la primera factura de
          cuota es la del mes siguiente.
        </p>
        <p>
          El recuento de llaveros activos se toma el día 1 de cada mes. Un llavero retirado no cuenta.
          Un llavero extra se cobra una sola vez, aunque después se desvincule y se vuelva a usar.
        </p>
      </Seccion>

      <Seccion titulo="Duración, renovación y baja">
        <p>
          El contrato dura mientras el servicio esté activo y se renueva por meses. No hay
          permanencia. Puedes darte de baja escribiendo a {CONTACTO}; la baja surte efecto al final del
          mes en curso, salvo que pidas el cierre inmediato.
        </p>
        <p>
          JULEX puede suspender el servicio por impago, avisando antes, y resolver el contrato por
          incumplimiento grave. En ambos casos se conservan los datos el tiempo necesario para
          atender responsabilidades y luego se borran o se devuelven.
        </p>
        <p>
          Si la cuota no se paga, el servicio pasa por tres avisos antes de cortarse: el día del
          vencimiento se avisa y todo sigue; entre el octavo y el decimoquinto día el local queda en
          solo lectura (puede consultar, no crear ni editar), aunque sus clientes pueden seguir
          reservando y usando su tarjeta; a partir del decimoquinto día se suspende el acceso, se
          ocultan sus páginas públicas y sus llaveros dejan de abrir. Al regularizar el pago se
          reactiva todo, llaveros incluidos, sin volver a grabarlos.
        </p>
      </Seccion>

      <Seccion titulo="Llaveros">
        <p>
          Los 15 llaveros del alta se entregan grabados con una dirección única. Son del negocio y no
          se reasignan: un llavero retirado queda muerto para siempre. Los defectos de fabricación se
          sustituyen avisando en el plazo de un mes desde la entrega.
        </p>
        <p>
          Los pedidos adicionales van de <strong>5 en 5 llaveros como mínimo</strong>. Cada llavero por
          encima de los 40 activos se cobra a 1 € + IVA una sola vez.
        </p>
        <p>
          El grabado se hace con el dominio que JULEX indique en ese momento. Cambiar de dominio
          obliga a grabar llaveros nuevos, y eso no está incluido en la cuota.
        </p>
      </Seccion>

      <Seccion titulo="Obligaciones del negocio">
        <Lista
          items={[
            'Usar la herramienta conforme a la ley y a estas condiciones.',
            'Informar a sus clientes del tratamiento de sus datos y de sus derechos, con la información que JULEX pone a su disposición.',
            'No introducir datos de salud ni otras categorías especiales en las notas.',
            'Mantener la confidencialidad de sus accesos y avisar de cualquier uso no autorizado.',
            'Responder de las citas, precios y servicios que publique en su página.',
          ]}
        />
      </Seccion>

      <Seccion titulo="Soporte, disponibilidad y cambios">
        <p>
          El soporte se atiende por correo en días laborables. JULEX procura la máxima disponibilidad,
          pero no garantiza un servicio ininterrumpido: hay mantenimientos, incidencias y causas
          externas. Los cambios importantes se avisan con antelación razonable.
        </p>
      </Seccion>

      <Seccion titulo="Datos, salida y exportación">
        <p>
          El negocio es el responsable de los datos de sus clientes y JULEX los trata como encargado,
          según el{' '}
          <Link to="/encargo-tratamiento" className="underline decoration-line underline-offset-2">
            acuerdo de encargo
          </Link>
          . El negocio puede pedir una copia completa de sus datos a JULEX en cualquier momento; se
          entrega en un archivo JSON. Al terminar, se devuelven o se borran en el plazo acordado, salvo lo
          que la ley obligue a conservar.
        </p>
      </Seccion>

      <Seccion titulo="Responsabilidad">
        <p>
          JULEX responde de los daños directos que cause su servicio, con el límite de las cuotas
          abonadas en los doce meses anteriores, salvo dolo o negligencia grave. No responde del lucro
          cesante ni de los daños que vengan del uso que el negocio haga de la herramienta.
        </p>
        <p>
          El negocio responde frente a sus clientes del servicio presencial y del uso que haga de los
          datos.
        </p>
      </Seccion>

      <Seccion titulo="Ley aplicable y reclamaciones">
        <p>
          Se aplica la ley española. Cualquier reclamación se dirige primero a {CONTACTO}; las partes
          intentarán resolverlo de buena fe y, si no, acudirán a los juzgados de Alicante.
        </p>
      </Seccion>
    </MarcoLegal>
  );
}

export function Encargo() {
  return (
    <MarcoLegal
      ceja="Encargo de tratamiento"
      titulo="Acuerdo entre el negocio y JULEX"
      intro={
        <p>
          Este acuerdo forma parte de las condiciones profesionales. El negocio es responsable del
          tratamiento y JULEX, encargado. Versión 1 · 11 de noviembre de 2026.
        </p>
      }
    >
      <Seccion titulo="Partes y objeto">
        <p>
          Responsable: el negocio que contrata JULEX. Encargado: Alexander Acero, NIF 18508170R,
          Alicante, España, {CONTACTO}. El objeto es el tratamiento de los datos de los clientes del
          negocio necesarios para prestar el servicio: fichas, visitas, citas, fidelización y
          llaveros.
        </p>
      </Seccion>

      <Seccion titulo="Duración y alcance">
        <p>
          El acuerdo dura mientras el servicio esté activo y cubre el tiempo necesario para devolver o
          borrar los datos al terminar. JULEX solo trata los datos siguiendo las instrucciones del
          negocio, que quedan documentadas en estas condiciones y en el uso normal del producto.
        </p>
      </Seccion>

      <Seccion titulo="Instrucciones y obligaciones del negocio">
        <Lista
          items={[
            'El negocio decide qué datos guarda y para qué; JULEX no los usa para fines propios.',
            'El negocio responde de la licitud de los datos que introduce y de informar a sus clientes.',
            'El negocio se compromete a no introducir datos de salud ni otras categorías especiales.',
            'El negocio debe mantener sus accesos protegidos y comunicar cualquier incidente que detecte.',
          ]}
        />
      </Seccion>

      <Seccion titulo="Confidencialidad y personal">
        <p>
          JULEX mantiene la confidencialidad de los datos y limita el acceso a quien lo necesita para
          prestar el servicio. El personal con acceso está sujeto a deber de confidencialidad.
        </p>
      </Seccion>

      <Seccion titulo="Seguridad">
        <p>Medidas técnicas y organizativas aplicadas:</p>
        <Lista
          items={[
            'Aislamiento por local en la base de datos (RLS): cada negocio solo ve lo suyo.',
            'Acceso con cuenta y contraseña; las claves se guardan cifradas.',
            'Cifrado en tránsito (HTTPS) y copias de seguridad del proveedor.',
            'PIN opcional en la tarjeta del cliente y retirada inmediata del llavero si se pierde.',
            'Registro de accesos del proveedor y revisión de dependencias.',
          ]}
        />
      </Seccion>

      <Seccion titulo="Subencargados y transferencias">
        <p>
          Subencargados actuales: <strong>Supabase</strong> (base de datos y autenticación, región de
          Fráncfort) y <strong>Cloudflare</strong> (alojamiento y red de distribución). Se avisará de
          cualquier cambio con antelación. Algunos tratamientos pueden implicar accesos fuera del
          Espacio Económico Europeo, amparados en las garantías de sus contratos.
        </p>
      </Seccion>

      <Seccion titulo="Asistencia en derechos e incidentes">
        <p>
          JULEX ayuda al negocio a atender los derechos de sus clientes: la tarjeta permite descargar
          los datos y solicitar la baja, y el panel del local permite anonimizar o bloquear la ficha.
        </p>
        <p>
          Si se produce una brecha de seguridad que afecte a los datos, JULEX avisará al negocio sin
          demora indebida y, en todo caso, en las 72 horas siguientes a tener conocimiento, con la
          información disponible para que el negocio pueda cumplir sus obligaciones.
        </p>
      </Seccion>

      <Seccion titulo="Fin del servicio">
        <p>
          Al terminar, JULEX devuelve los datos en un formato exportable y los borra en el plazo de
          treinta días, salvo los que deba conservar por obligación legal. Las copias de seguridad se
          van sustituyendo en su ciclo de treinta días.
        </p>
      </Seccion>

      <Seccion titulo="Aceptación">
        <p>
          La aceptación de las condiciones profesionales al contratar incluye este acuerdo. El negocio
          puede conservar una copia desde su panel o pidiéndola a {CONTACTO}.
        </p>
      </Seccion>
    </MarcoLegal>
  );
}
