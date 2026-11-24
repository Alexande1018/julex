# Conectar con Meta · pasos exactos

Esto es lo único que falta para que un cliente real pueda usar la recepción por
WhatsApp. Se hace **una vez** para toda la plataforma JULEX; después, cada
barbería conecta su número en tres clics desde el panel.

Tiempo realista: una tarde de trabajo, más el tiempo que tarde Meta en revisar
la app (de un día a dos semanas).

> El panel de Meta cambia de sitio los botones cada pocos meses. Lo que no
> cambia son los **cuatro datos** que hay que conseguir y lo que hay que
> configurar. Si un nombre de menú no coincide, busca la sección por el dato.

---

## 0. Antes de empezar, ten a mano

- Una cuenta de **Meta Business** (la del negocio, no la personal).
- Un **dominio propio** para JULEX (Meta lo pide para la política de privacidad
  y para el webhook). El de `pages.dev` sirve para probar, pero no para
  producción.
- La **política de privacidad publicada** en ese dominio, que mencione:
  mensajería por WhatsApp, el encargado del tratamiento (JULEX) y el proveedor
  del modelo (DeepSeek).

---

## 1. Crear la app

1. Entra en <https://developers.facebook.com/apps/> con la cuenta de Business.
2. **Crear aplicación** → tipo **Business**.
3. Nombre: `JULEX`. Correo de contacto: el del negocio.
4. Anota en un sitio seguro:
   - **App ID** → será `META_APP_ID`
   - **App Secret** (en *Configuración de la app → Básica*) → será
     `META_APP_SECRET`

## 2. Añadir WhatsApp a la app

1. En el panel de la app, **Añadir producto** → **WhatsApp** → *Configurar*.
2. Meta crea una cuenta de prueba con un número de pruebas. Sirve para
   entender el flujo, no para vender.
3. En **WhatsApp → Configuración de la API** anota el `phone_number_id` de
   prueba: es el que usa el webhook para saber a qué línea ha llegado el
   mensaje.

## 3. Webhook (el paso que más se olvida)

1. En **WhatsApp → Configuración → Webhook**, *Editar*.
2. **URL de devolución de llamada**:

   ```
   https://<proyecto>.supabase.co/functions/v1/wa-webhook
   ```

3. **Token de verificación**: una frase larga y aleatoria. La misma que pongas
   en el secreto `WA_VERIFY_TOKEN`. Meta la llama una vez para comprobar que la
   URL es tuya.
4. Suscríbete al campo **`messages`**. Sin esto, la URL se verifica pero no
   llega ningún mensaje.
5. Comprobación: al guardar, Meta debe decir *«La URL de devolución de llamada
   se ha verificado»*. Si falla, es que `wa-webhook` no está desplegada o que
   el `WA_VERIFY_TOKEN` no coincide.

## 4. Permisos para varias empresas (Tech Provider)

Sin esto, cada barbería tendría que configurar la app entera ella misma.

1. En el panel de la app, **WhatsApp → Inicio** → solicita el alta como
   **Tech Provider** (o *proveedor de tecnología*).
2. Pide **acceso avanzado** a dos permisos:
   - `whatsapp_business_messaging` (mandar mensajes)
   - `whatsapp_business_management` (gestionar números y plantillas)
3. Meta pide una **verificación del negocio** (documentos de la empresa) y una
   descripción de para qué usas los permisos. La descripción honesta que
   funciona: *«Plataforma de gestión para pequeños comercios: el local conecta
   su propio número y su asistente contesta a sus clientes con su agenda»*.

## 5. Embedded Signup (los «tres clics» del dueño)

1. En **WhatsApp → Embedded Signup** (o *Configuración → Embedded Signup*),
   crea una **configuración**.
2. Anota su identificador → será `META_CONFIG_ID`.
3. Dominio de vuelta: el del panel, por ejemplo
   `https://panel.julex.es/panel/recepcion` → será `WA_REDIRECT_URI`.
4. Comprobación: con todo cargado, el botón «Conectar WhatsApp» del panel debe
   abrir una ventana de Meta donde el dueño entra con **su** cuenta, elige su
   número y vuelve solo.

## 6. Plantilla de recordatorio

Los recordatorios son el único mensaje que se manda fuera de la conversación,
así que van con plantilla aprobada. Se da de alta **por negocio**, no una vez
para todos, porque Meta aprueba por cuenta de WhatsApp.

1. **WhatsApp Manager → Plantillas de mensaje → Crear plantilla**.
2. Categoría: **Utilidad**. Nombre: `recordatorio_cita`. Idioma: **español**.
3. Cuerpo, con cuatro variables en este orden exacto:

   ```
   Hola {{1}}, te esperamos el {{3}} para {{2}} en {{4}}.
   Si no puedes venir, respóndeme por aquí y lo cambiamos.
   ```

4. Las de utilidad suelen aprobarse en minutos.

## 7. Los ocho secretos

Se cargan con `supabase secrets set NOMBRE=valor`:

| Secreto | De dónde sale |
|---|---|
| `META_APP_ID` | Paso 1 |
| `META_APP_SECRET` | Paso 1 |
| `META_CONFIG_ID` | Paso 5 |
| `WA_REDIRECT_URI` | Paso 5 |
| `WA_VERIFY_TOKEN` | Lo eliges tú (paso 3) |
| `WA_APP_SECRET` | El mismo valor que `META_APP_SECRET`: con él se valida la firma de cada mensaje |
| `CRON_SECRET` | Lo eliges tú, largo y aleatorio |
| `ASISTENTE_LLM_KEY` | La clave de DeepSeek (ya existía) |

Y en el editor SQL, una vez:

```sql
insert into config_secreta (clave, valor) values
  ('wa_cron_url', 'https://<proyecto>.supabase.co/functions/v1/wa-cron'),
  ('wa_cron_secreto', '<el mismo CRON_SECRET>')
on conflict (clave) do update set valor = excluded.valor;
```

## 8. Orden de despliegue

```bash
supabase db push                                                    # 0031 a 0036
supabase secrets set META_APP_ID=... META_APP_SECRET=... META_CONFIG_ID=...
supabase secrets set WA_REDIRECT_URI=... WA_VERIFY_TOKEN=... WA_APP_SECRET=...
supabase secrets set CRON_SECRET=...
supabase functions deploy asistente wa-webhook wa-cron wa-onboarding wa-simular
npm run preflight          # comprueba tablas y funciones nuevas
```

## 9. Primera prueba de verdad

1. En el panel, **Conectar WhatsApp** con un número de pruebas.
2. La línea nace **en modo prueba**. Escríbele desde el móvil del local:
   debe contestar con el nombre del asistente y los servicios reales.
3. Prueba: «¿tenéis hueco el viernes?», «cámbiame la cita», «¿cuánto cuesta
   corte y barba?».
4. Mira el panel: conversaciones, citas, consumo del mes.
5. Cuando te convenza, **«Atender a todos mis clientes»** → y ya está
   trabajando.

## 10. Qué puede salir mal

| Síntoma | Causa casi siempre |
|---|---|
| Meta no verifica la URL del webhook | `wa-webhook` sin desplegar, `WA_VERIFY_TOKEN` distinto o el proyecto dormido |
| Llega el mensaje y no contesta nadie | Falta suscribir el campo `messages`, o la línea está en `pausa`, o el número no está autorizado en modo prueba |
| «No se ha podido suscribir el número» al conectar | La app no tiene `whatsapp_business_management` en acceso avanzado |
| El recordatorio falla con `132001` | La plantilla no existe o no está aprobada todavía |
| Contesta pero no reserva | El hueco se comprobó contra la agenda de otro local, o el servicio no está activo en Ajustes |
| Todo bien en pruebas y nada en real | Otra app (o el móvil) sigue conectado al mismo número: un número, una sesión |

## 11. Coste que hay que vigilar

- Los **1.000 mensajes de servicio gratis al mes por número** cubren de sobra a
  una barbería.
- Lo que se paga son las **plantillas de utilidad** (recordatorios) y la IA.
- Los topes ya están puestos: 300 conversaciones y 1.500 mensajes al mes por
  local, visibles en el panel.

Antes de vender el complemento conviene leer la **política de proveedores de IA**
de Meta: puede cambiar cómo se facturan los mensajes que genera un agente, y es
una decisión de negocio, no de código.
