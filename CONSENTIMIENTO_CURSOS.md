# Autorización de novedades de HP Flight School

Publicación autorizada y verificada el **09/11/2026** en Wix y Firebase. La implementación principal se integró mediante el [PR #41](https://github.com/Sergio0489/Helicopteros-Personales-S.A./pull/41). La autorización aprobada es para novedades de cursos **por correo electrónico**. No concede permiso para campañas de Charters ni para WhatsApp. Se conservaron las consultas sin aceptación y no se activaron campañas.

## Material de referencia

- [Vista previa local de ambos formularios](examples/school-consent/preview.html): casilla opcional, inicialmente vacía, consulta independiente y simulación del cuerpo de envío. No contiene credenciales ni realiza peticiones de red.
- [Configuración completamente ficticia](examples/school-consent/config.example.json): muestra el catálogo por formulario, no es una configuración de producción ni debe reemplazar el secreto existente.
- El CRM muestra la constancia de cada envío en **Historial de consultas**, y las aceptaciones y retiradas en **Historial de autorizaciones**. Este segundo historial está disponible para Escuela y para accesos generales autorizados, incluso de solo consulta. No se entrega a la concesión individual de Charters.

Texto de la casilla, versión `hpfs-cursos-email-v1`:

> Quiero recibir por correo electrónico novedades sobre próximos cursos de HP Flight School, de Helicópteros Personales S.A. Puedo retirar mi autorización en cualquier momento escribiendo a info@helicopterospersonales.com.

Ayuda visible:

> Esta autorización es opcional. Puedes enviar tu consulta sin marcar la casilla.

## Contrato de Wix → receptor

Se conservan `token`, `siteId`, `formId`, `submissionId`, `submittedAt`, `name`, `email`, `phone`, `requestedCourse`, `interest` y el array opcional `courses`.

| Campo | Regla |
| --- | --- |
| `courseUpdates` | Solo el booleano `true` o la cadena exacta `"true"` conceden autorización. Todo otro valor se interpreta como falta de aceptación nueva. |
| `consentVersion` | Versión guardada **con el envío original** y correspondiente al texto que se mostró. Para una aceptación con catálogo es obligatoria y debe pertenecer al formulario. Se recomienda enviarla también cuando la casilla quede vacía, para conservar qué texto se ofreció. |
| `consentStatement`, `channels`, `consentStatus` en el cuerpo | No tienen autoridad: el receptor obtiene texto y canal de su configuración privada. |
| `submittedAt` | Fecha original ISO 8601, conservada en reintentos. No usar la hora de ejecución de una automatización. |
| `submissionId` | Identificador original estable; un reintento conserva todos los valores originales. |

La automatización envía la consulta aunque no se marque la casilla. No se añade ninguna campaña ni suscripción general de Wix. No se deduce consentimiento de teléfono, curso, mensaje o aceptación de privacidad. El cuerpo puede ser plano o estar bajo `data`, sin combinar ambos.

Un formulario con `consentPolicies` exige una versión conocida para las aceptaciones. Una consulta sin `courseUpdates` ni versión continúa admitiéndose; registra `accepted: false`, sin inventar texto mostrado. Wix puede serializar un campo ausente como `""`: se trata como versión ausente solamente cuando no hay aceptación expresa. Una aceptación con versión vacía, una versión desconocida, espacios en blanco o un tipo incorrecto se rechazan.

## Catálogo y compatibilidad

Cada entrada autorizada de Escuela puede añadir:

```json
{
  "area": "school",
  "consentPolicies": {
    "hpfs-cursos-email-v1": {
      "statement": "Texto exacto aprobado de la casilla",
      "channels": ["email"]
    }
  }
}
```

El ejemplo completo contiene el texto aprobado. Se conservan `courseMap` y los demás campos existentes. No se cambian token, sitio, entradas de otros formularios ni Charters.

Las versiones son independientes por formulario. El primer envío que identifica una versión fija su texto y canal en `prospects/consentPolicies/<hash(formId + versión)>`, mediante transacción. Cambiar esa definición posteriormente produce un rechazo antes de modificar contactos o consultas. Una corrección requiere una versión nueva. **Se deben conservar las versiones anteriores en la configuración** para aceptar formularios abiertos y entregas retrasadas.

La versión se guarda con los datos del envío original en Wix; no se elige a partir de la versión vigente cuando se ejecute o reintente la automatización. Ambos formularios contienen un campo nativo de respuesta corta `#courseConsentVersion`, de solo lectura y oculto, con el valor predeterminado `hpfs-cursos-email-v1`. El [código publicado de las páginas](examples/school-consent/wix-page-code.js) también fija ese valor en `event.fields` antes del envío, incluso después de un envío anterior que haya limpiado el formulario. El receptor fija después su propia copia al recibirlo. La presencia de la versión se comprobó en el disparador real y en las cuatro consultas ficticias finales.

La configuración antigua `consentVersion` + `consentStatement`, sin `consentPolicies`, se mantiene para compatibilidad. No se infiere un canal a partir de su texto. Para usar varias versiones se adopta el catálogo y se identifica la versión en cada envío. No se convierte automáticamente un formulario antiguo con aceptaciones pendientes sin versión: se conserva su configuración hasta definir la transición.

## Evidencia y estado vigente

Cada consulta de Escuela recibida con esta revisión conserva `consentResponse`:

- `accepted`: aceptación expresa en ese envío, independiente del estado actual del contacto.
- `version`, `statement`, `channels`: versión, texto y canales obtenidos del servidor; vacíos cuando no consta qué texto se mostró.
- `at`, `receivedAt`: fecha original de envío y primera recepción, respectivamente, en UTC.
- `formId`, `submissionId`, `source`, `mode`: procedencia, identificadores y modalidad del contrato.

La consulta y la constancia se escriben solo si no existen. Los recibos nuevos guardan una copia normalizada de la entrada, sin token. La huella del envío usa los valores aportados, sin depender del texto de una configuración posterior ni de cambios en `courseMap`. Los reintentos recuperan esa copia y conservan la primera fecha de recepción, incluso después de interrupciones parciales.

Los recibos anteriores a esta mejora siguen reconociéndose con su huella original. No se crean constancias retroactivas para entregas ya terminadas. Si un recibo antiguo solo conserva una huella y se altera su antigua configuración, puede continuar requiriendo revisión: no es posible reconstruir el texto perdido a partir de una huella. No borrar recibos para forzar reenvíos.

`consent` sigue representando el estado vigente. Una casilla sin marcar no concede ni revoca autorización. Una aceptación web solo reemplaza una decisión anterior si su fecha es estrictamente posterior; en un empate se conserva la decisión existente.

Las transiciones se guardan en `prospects/contacts/<contacto>/consentHistory` en la **misma transacción** que modifica el consentimiento. Incluyen la decisión anterior, evidencia, origen, fecha de registro y actor para cambios manuales. Una retirada sobrevive aunque falle una escritura posterior de consulta. Editar observaciones o conservar el mismo estado no crea una transición. Un cambio de consentimiento sin consulta nueva no dispara el aviso interno de nueva consulta.

La historia completa se omite de las respuestas de listado. Se obtiene mediante `prospect-consent-history`, paginada de 20 en 20, comprobando los permisos vigentes. La concesión individual de Charters no puede obtenerla. El historial de consultas también oculta `consentResponse` para Charters, incluidos contactos de ambas áreas.

El filtro de destinatarios mantiene las exclusiones por matrícula y coincidencias ambiguas. No se crean usuarios, estudiantes ni matrículas. Las reglas de Firebase y los permisos existentes no cambian.

## Validación local

Resultado de la versión final, 09/11/2026: **300/300 pruebas aprobadas**, sin fallos, cancelaciones ni omisiones; incluye 24 pruebas nuevas de consentimiento, compatibilidad y navegador. Se revisaron capturas de escritorio y móvil. Los ejemplos de evidencia y las capturas están en `outputs/consentimiento-cursos/`. Estas pruebas son locales; la comprobación externa autorizada se documenta por separado a continuación.

```sh
node --test tests/prospect-consent.cjs tests/wix-school.cjs tests/prospects.cjs tests/prospect-access.cjs tests/prospect-email.cjs
node --test tests/prospect-consent-browser.cjs
npm run test:all
```

Los tests de navegador usan Playwright; `CHROME_BIN` permite seleccionar un navegador instalado. `HP_CONSENT_PREVIEW_DIR` permite guardar capturas locales de referencia.

Las pruebas nuevas cubren ambos formularios ficticios, valores afirmativos y no afirmativos, versiones inexistentes, texto manipulado, inmutabilidad del catálogo, reintentos concurrentes, cambio de versión, cambios en mapeo de cursos, interrupciones en contacto/consulta/recibo, compatibilidad de recibos antiguos, fechas, retirada y nueva autorización, historial manual, permisos, paginación, matrícula y aislamiento de Charters. El navegador bloquea la red y utiliza datos en memoria; no se conecta a cuentas reales. Comprueba la casilla, el receptor real con almacenamiento simulado y el historial del CRM en escritorio y móvil.

## Integración publicada de los formularios antiguos

Se añadió a cada formulario una casilla básica `#checkbox1`, opcional, no preseleccionada y con el texto exacto aprobado. No es una casilla de suscripción general de Wix. La ayuda se presenta como texto separado. La versión permanece oculta al visitante; el espacio y la disposición se revisaron en escritorio y móvil.

| Formulario | Página pública | Campo del disparador: casilla | Campo del disparador: versión |
| --- | --- | --- | --- |
| Contacto (`comp-kwgi0waz`) | [/hpflightschooldivision](https://www.charterspanama.com/hpflightschooldivision) | `field:comp-mw9jg0ay` | `field:comp-mw9jhoa6` |
| Contacto 2 (`comp-lvvtispm3`) | [/escueladepilotos](https://www.charterspanama.com/escueladepilotos) | `field:comp-mw9id9et` | `field:comp-mw9ihuoc` |

El disparador antiguo de Wix entrega la casilla marcada como la cadena **`Checked`**, comprobada con un envío ficticio en su registro de ejecución. La automatización la convierte a un booleano mediante una comparación de texto completo; un campo ausente o vacío produce `false`. El receptor conserva su contrato estricto de `true` / `"true"`.

```text
Contacto — courseUpdates:
{{if(isEmpty(var("field:comp-mw9jg0ay"));false;stringEq(var("field:comp-mw9jg0ay");"Checked"))}}
Contacto — consentVersion:
{{var("field:comp-mw9jhoa6")}}

Contacto 2 — courseUpdates:
{{if(isEmpty(var("field:comp-mw9id9et"));false;stringEq(var("field:comp-mw9id9et");"Checked"))}}
Contacto 2 — consentVersion:
{{var("field:comp-mw9ihuoc")}}
```

`stringEq` de Wix compara el texto sin distinguir mayúsculas; no acepta cualquier texto no vacío. Referencia: [expresiones de mapeo de Wix](https://dev.wix.com/docs/api-reference/business-management/automations/skills/automations-mapping-expressions).

Las dos conexiones existentes **Apps HP - Escuela - Contacto** y **Apps HP - Escuela - Contacto 2** quedaron ACTIVE, revisión 5, con validación VALID y una sola acción HTTP cada una. Se preservaron sus campos originales, credencial, URL y envoltura. Se desactivó, conservándola recuperable, la conexión antigua duplicada **Apps HP - Consultas HP Flight School**, que también recibía Contacto sin teléfono, curso ni consentimiento y competía por el mismo identificador de envío. La conexión de Charters quedó ACTIVE sin modificaciones.

En Firebase se publicó el catálogo por formulario en una nueva versión del secreto existente, conservando la credencial, sitio y entrada de Charters. Se desplegaron únicamente `wixInterests` y `accountRegistration`; después se actualizó solo `wixInterests` con la compatibilidad de versión vacía sin aceptación. La interfaz del CRM quedó publicada en GitHub Pages. No se cambiaron reglas, usuarios, permisos ni el servicio de aviso interno de consultas.

## Comprobación externa autorizada

El 09/11/2026 se enviaron cuatro casos finales desde las páginas públicas, con nombres marcados **PRUEBA FICTICIA**, correos `@example.invalid` y teléfonos ficticios. La lectura autenticada de Firebase comprobó:

| Página | Casilla | Estado nuevo | Eventos de autorización | Consultas |
| --- | --- | --- | --- | --- |
| `/hpflightschooldivision` | Marcada | `granted` | 1 | 1 |
| `/hpflightschooldivision` | Vacía | `unknown` | 0 | 1 |
| `/escueladepilotos` | Marcada | `granted` | 1 | 1 |
| `/escueladepilotos` | Vacía | `unknown` | 0 | 1 |

En los cuatro casos se conservaron teléfono, curso, versión, texto aprobado, canal email, ID de envío, fecha original y primera recepción. Se repitió directamente cada entrega con sus valores originales: las cuatro respuestas indicaron duplicado y dejaron idénticos el contacto, consulta e historial. Todos los contactos quedaron en `areas: ["school"]`. Al aplicar el código de acceso a estos registros verificados, la proyección de Charters fue nula. La interfaz y los permisos del CRM se probaron localmente con cuentas simuladas; esta comprobación no equivale a iniciar sesión en producción como personal de cada área.

El informe local `outputs/consentimiento-cursos/verificacion-publicada.json` conserva los identificadores y resultados ficticios, sin credenciales. Se conservaron además tres consultas ficticias de diagnóstico previas a las correcciones de Wix; no se alteró retroactivamente su consentimiento ni se modificaron contactos reales. Los avisos internos de consultas existentes permanecieron habilitados; no se activó ninguna campaña ni se enviaron novedades comerciales.

## Procedimiento para futuras revisiones

1. Contar con autorización del propietario para los cambios externos y las pruebas ficticias. Autorización recibida el 09/11/2026.
2. Verificar los identificadores y claves reales de ambos formularios y su versión de Wix Forms; conservar campos y automatizaciones actuales. Confirmar cómo quedará capturada la versión con el envío original.
3. Preparar el catálogo privado para ambos formularios, conservando las entradas de Charters y las versiones anteriores. Nunca copiar la credencial a este repositorio, al navegador o a un informe.
4. Publicar únicamente los componentes necesarios: el receptor `wixInterests`, el endpoint `accountRegistration` para el nuevo historial y los archivos de interfaz. La nueva pantalla depende del nuevo endpoint; no publicar primero una interfaz que lo requiera sin él. El cambio no requiere modificar reglas ni el servicio de correos.
5. Añadir las dos casillas y actualizar las automatizaciones existentes, una por formulario. Verificar el cuerpo con valores ficticios y que las consultas sin casilla sigan enviándose. No crear automatizaciones de campañas.
6. Con autorización específica para pruebas externas, comprobar ambos recorridos públicos con identidades ficticias. Revisar los avisos e integraciones existentes y no activar campañas. Verificar versión, fecha, teléfono, curso, ausencia de duplicados y separación de áreas. Las pruebas locales no sustituyen esta comprobación.

Si fuera necesario detener la captación, dejar de enviar nuevas aceptaciones y conservar el catálogo histórico para entregas pendientes; mantener el envío de consultas. No retirar del servidor versiones ya usadas ni borrar evidencia.
