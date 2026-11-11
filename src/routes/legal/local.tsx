import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Lista, MarcoLegal, Seccion, Tabla } from '../../components/MarcoLegal';
import { cargarLocal, type LocalPublico } from '../../lib/publico';
import { vocabulario } from '../../lib/vocabulario';

const CONTACTO = 'gestionjulex@gmail.com';

/** Carga el local por su slug y pinta el marco común. */
function useLocal() {
  const { slug } = useParams();
  const [local, setLocal] = useState<LocalPublico | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    cargarLocal(slug ?? '')
      .then((l) => {
        if (vivo) setLocal(l);
      })
      .catch(() => undefined)
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [slug]);

  return { local, cargando, slug };
}

function NoExiste() {
  return (
    <MarcoLegal
      ceja="Local"
      titulo="Este local no está disponible"
      intro={<p>El enlace puede estar incompleto o el establecimiento ya no está dado de alta.</p>}
    >
      <p className="text-[13px] text-ink-soft">
        <Link to="/" className="underline decoration-line underline-offset-2">
          Volver al inicio
        </Link>
      </p>
    </MarcoLegal>
  );
}

function Cargando() {
  return (
    <div className="grain flex min-h-dvh items-center justify-center bg-ivory">
      <p className="font-serif text-[19px] text-ink">Abriendo…</p>
    </div>
  );
}

/** Identidad del negocio: quién presta el servicio y con qué contacto. */
export function LocalLegal() {
  const { local, cargando } = useLocal();
  if (cargando) return <Cargando />;
  if (!local) return <NoExiste />;
  const v = vocabulario(local.tipo);

  return (
    <MarcoLegal
      ceja={`${v.etiqueta} · identidad`}
      titulo={local.nombre}
      volver={`/cita/${local.slug}`}
      volverTexto="Volver a la reserva"
      intro={
        <p>
          Quién presta el servicio y cómo reclamar. El servicio de {v.servicioMin} lo presta este
          establecimiento; JULEX solo pone la herramienta.
        </p>
      }
    >
      <Seccion titulo="Titular del establecimiento">
        <Tabla
          cabecera={['Dato', 'Valor']}
          filas={[
            ['Nombre', local.nombre],
            ['Domicilio', local.domicilioLegal || 'No facilitado por el establecimiento'],
            [
              'Correo de contacto',
              local.correoLegal || 'No facilitado; escribe a ' + CONTACTO,
            ],
            ['Dirección del local', local.direccion || 'No facilitada'],
            ['Teléfono', local.telefono || 'No facilitado'],
          ]}
        />
      </Seccion>

      <Seccion titulo="Qué hace JULEX aquí">
        <p>
          JULEX es el software que este negocio usa para sus citas, sus fichas y sus llaveros. La
          atención, el precio del servicio y la calidad son responsabilidad del establecimiento.
        </p>
        <p>
          Las reclamaciones sobre el servicio presencial se dirigen al establecimiento. Las que tengan
          que ver con el funcionamiento del software se pueden enviar también a {CONTACTO}.
        </p>
      </Seccion>

      <Seccion titulo="Documentos de este local">
        <Lista
          items={[
            <Link to={`/local/${local.slug}/privacidad`} className="underline decoration-line underline-offset-2">
              Privacidad y derechos
            </Link>,
            <Link to={`/local/${local.slug}/reservas`} className="underline decoration-line underline-offset-2">
              Reservas y cancelaciones
            </Link>,
            <Link to={`/local/${local.slug}/fidelizacion`} className="underline decoration-line underline-offset-2">
              Fidelización y llavero
            </Link>,
          ]}
        />
      </Seccion>
    </MarcoLegal>
  );
}

/** Privacidad del establecimiento, que es el responsable de las fichas. */
export function LocalPrivacidad() {
  const { local, cargando } = useLocal();
  if (cargando) return <Cargando />;
  if (!local) return <NoExiste />;
  const correo = local.correoLegal || CONTACTO;

  return (
    <MarcoLegal
      ceja="Privacidad del establecimiento"
      titulo={`Cómo trata ${local.nombre} tus datos`}
      volver={`/local/${local.slug}/legal`}
      volverTexto="Identidad del local"
      intro={
        <p>
          El responsable es el establecimiento, no JULEX. JULEX aloja los datos por su cuenta y solo
          los trata siguiendo sus instrucciones.
        </p>
      }
    >
      <Seccion titulo="Quién trata tus datos">
        <p>
          <strong>{local.nombre}</strong>, con domicilio en{' '}
          {local.domicilioLegal || 'el de su establecimiento'}. Para derechos y consultas:{' '}
          <a href={`mailto:${correo}`} className="underline decoration-line underline-offset-2">
            {correo}
          </a>
          .
        </p>
      </Seccion>

      <Seccion titulo="Qué datos y para qué">
        <Tabla
          cabecera={['Para qué', 'Qué datos', 'Base jurídica']}
          filas={[
            ['Atenderte y gestionar tus citas', 'Nombre, teléfono si lo das, servicio y fechas', 'Ejecución del servicio'],
            [
              'Recordar cómo te atendemos',
              'Preferencias y notas de atención que le cuentes',
              'Tu permiso, que puedes retirar',
            ],
            [
              'Fidelización',
              'Visitas y recompensas',
              'Tu permiso al darte de alta en el programa',
            ],
            ['Avisarte de tu cita o tu turno', 'Contacto', 'El propio servicio que pides'],
            ['Promociones', 'Contacto', 'Tu permiso, separado y opcional'],
          ]}
        />
        <p>
          No necesitas crear ninguna cuenta. Todo lo opcional está desmarcado y puedes cambiarlo desde
          tu tarjeta.
        </p>
      </Seccion>

      <Seccion titulo="Quién más los ve">
        <p>
          El personal autorizado de {local.nombre}. Como proveedor tecnológico, JULEX (Alexander
          Acero) trata los datos como encargado, con Supabase para la base de datos y Cloudflare para
          el alojamiento. No se venden ni se ceden para publicidad.
        </p>
      </Seccion>

      <Seccion titulo="Tu enlace y tu llavero">
        <p>
          Tu tarjeta se abre con un enlace o acercando tu llavero al móvil. Ese enlace es una llave:
          no lo publiques ni se lo pases a quien no quieras dar acceso. Puedes protegerlo con un PIN
          desde «Mis datos»; entonces, sin el PIN, solo se ve que la tarjeta está protegida.
        </p>
        <p>
          Si pierdes el llavero, pide que lo retiren: deja de funcionar para siempre y no se reasigna.
        </p>
      </Seccion>

      <Seccion titulo="Cuánto tiempo">
        <p>
          Mientras seas cliente activo y hasta un año después de tu última visita. Las visitas se
          conservan sin tus datos si pides la supresión, para las obligaciones contables del local.
        </p>
      </Seccion>

      <Seccion titulo="Tus derechos">
        <p>
          Puedes acceder, rectificar, suprimir, oponerte, limitar y portar tus datos, y retirar
          cualquier permiso. Desde tu tarjeta puedes descargar una copia y solicitar la baja; también
          escribiendo a{' '}
          <a href={`mailto:${correo}`} className="underline decoration-line underline-offset-2">
            {correo}
          </a>
          . Se responde en un mes.
        </p>
        <p>
          Cuando pides la baja, se apagan tus comunicaciones al momento y el local tiene un mes para
          anonimizar o bloquear la ficha. Si crees que no se ha atendido bien, puedes reclamar ante la
          Agencia Española de Protección de Datos.
        </p>
      </Seccion>

      <Seccion titulo="Lo que no se debe guardar aquí">
        <p>
          Las notas son para cómo te atienden, no para tu historial médico. No se piden ni se admiten
          alergias, medicación, diagnósticos, religión, origen ni vida sexual.
        </p>
      </Seccion>
    </MarcoLegal>
  );
}

export function LocalReservas() {
  const { local, cargando } = useLocal();
  if (cargando) return <Cargando />;
  if (!local) return <NoExiste />;
  const v = vocabulario(local.tipo);

  return (
    <MarcoLegal
      ceja="Reservas y cancelaciones"
      titulo={`Cómo reservar en ${local.nombre}`}
      volver={`/cita/${local.slug}`}
      volverTexto="Volver a la reserva"
      intro={<p>Reglas de la cita: cuándo queda confirmada, cómo se cancela y qué pasa si cambia.</p>}
    >
      <Seccion titulo="Cómo se pide">
        <p>
          Eliges {v.servicioMin}, día y hora entre los huecos disponibles de {local.nombre}. Al
          confirmar, la cita queda <strong>confirmada</strong> y con su puesto asignado. No hay ningún
          cobro online.
        </p>
        <p>
          Te atendemos en {local.direccion || 'el domicilio del establecimiento'}.
          {local.telefono ? ` Teléfono: ${local.telefono}.` : ''}
        </p>
      </Seccion>

      <Seccion titulo="Precio">
        <p>
          El precio del servicio es el que aparece en la reserva y lo fija el establecimiento. El pago
          se hace en el local, salvo que se acuerde otra cosa.
        </p>
      </Seccion>

      <Seccion titulo="Cancelar o cambiar">
        <p>
          Puedes cancelar desde tu tarjeta hasta <strong>dos horas antes</strong>. Después, avisa por
          teléfono o en el local: se intentará reorganizar la agenda.
        </p>
        <p>
          Si el establecimiento tiene que cambiar o anular la cita, te avisará con la mayor antelación
          posible y te ofrecerá otro hueco.
        </p>
      </Seccion>

      <Seccion titulo="Si llegas tarde o no vienes">
        <p>
          Un retraso puede acortar el servicio para no retrasar al siguiente. Si no vienes, la cita
          queda como no atendida. Las condiciones de cada local pueden añadir reglas propias, que se
          dirán antes de reservar.
        </p>
      </Seccion>

      <Seccion titulo="Reclamaciones">
        <p>
          Las reclamaciones sobre la cita se dirigen a {local.nombre}
          {local.correoLegal ? `, en ${local.correoLegal}` : ''}. Las que tengan que ver con el
          funcionamiento de la herramienta, a {CONTACTO}.
        </p>
      </Seccion>
    </MarcoLegal>
  );
}

export function LocalFidelizacion() {
  const { local, cargando } = useLocal();
  if (cargando) return <Cargando />;
  if (!local) return <NoExiste />;
  const v = vocabulario(local.tipo);
  const meta = Math.max(1, local.fidelidadMeta);

  return (
    <MarcoLegal
      ceja="Fidelización y llavero"
      titulo={`El programa de ${local.nombre}`}
      volver={`/cita/${local.slug}`}
      volverTexto="Volver a la reserva"
      intro={
        <p>
          Reglas del programa de fidelización y de tu llavero. Participar es opcional y puedes darte
          de baja cuando quieras.
        </p>
      }
    >
      <Seccion titulo="Cómo funciona">
        <p>
          Cada visita registrada cuenta. Al llegar a <strong>{meta}</strong> {v.serviciosMin} se genera
          una recompensa que el local puede aplicar en tu siguiente visita.
        </p>
      </Seccion>

      <Seccion titulo="Tu tarjeta">
        <p>
          Tu tarjeta muestra tus {v.serviciosMin}, tus recompensas y tu próxima cita. Se abre con el
          llavero o con el enlace que te dio el local. Puedes ponerle un PIN para que nadie la vea si
          lo pierdes.
        </p>
      </Seccion>

      <Seccion titulo="El llavero">
        <p>
          El llavero no guarda tus datos: solo una dirección. Al vincularlo, queda unido a tu ficha.
          Si se pierde, se retira y deja de funcionar para siempre; tu historial no se pierde.
        </p>
      </Seccion>

      <Seccion titulo="Cambios y fin del programa">
        <p>
          El local puede ajustar la meta o las condiciones, avisando. Puedes dejar de participar desde
          tu tarjeta retirando el permiso de fidelización, sin que afecte a tu historial.
        </p>
      </Seccion>
    </MarcoLegal>
  );
}
