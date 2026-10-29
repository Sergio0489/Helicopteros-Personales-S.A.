# Interesados y consultas: Wix, WhatsApp y seguimiento

El Director conserva una vista completa. Cada contacto se identifica por correo normalizado; las consultas web tienen identificadores propios para evitar duplicados al reintentarse la entrega.

## Acceso por usuario

El Director conserva acceso completo. Para el personal existen dos mecanismos de autorización, descritos también en [PERMISOS.md](PERMISOS.md#interesados-y-consultas-por-cargo). En ambos casos la cuenta debe estar habilitada, no estar marcada como unificada en otra cuenta y tener el correo verificado y el cargo confirmado.

### Concesión individual por área

Desde **Interesados y consultas → Accesos de Antonio y Fernando**, el Director puede asignar una concesión individual a un usuario con cargo **Administrativo o Gerente** confirmado. Debe estar vigente y vinculada al correo actual del usuario. Complementa el cargo y no modifica los permisos existentes de otros módulos.

- **Charters:** consulta, registro y seguimiento de esa área.
- **Cursos de pilotos (Escuela):** consulta, registro, cursos, seguimiento y constancia de autorización de avisos de esa área.

La concesión permite consultar, editar y exportar únicamente el área asignada; no tiene selectores independientes de edición o exportación. Se utiliza **solo si no existe una configuración explícita de la página `interesados` para el cargo del usuario**. En ese caso, un administrativo sin concesión individual vigente no tiene acceso al CRM.

### Permisos generales del cargo Administrativo

Desde **Perfil → Roles y permisos → Administrativo**, el Director configura **Interesados y consultas** y su cuadro **Contactos y consultas de Charters y Escuela**. La interfaz habilita este ajuste cuando el servidor anuncia la capacidad `prospectRolePermissions`.

Una configuración explícita de esta página se evalúa antes de las concesiones individuales. Con permiso de consulta, **todos los administrativos con cargo confirmado y correo verificado que cumplan las condiciones de cuenta anteriores pueden consultar ambas áreas, aunque no tengan concesión individual**. Este mecanismo es exclusivo de Administrativo; no concede acceso general al cargo Gerente ni facultades para administrar usuarios o permisos.

El alcance abarca Charters y Escuela porque la matriz autoriza un único cuadro para los contactos y consultas de ambos servicios; no selecciona un área por usuario. Por ejemplo, un administrativo con una concesión individual de Charters pasa a poder consultar también Escuela si se autoriza la consulta por cargo. Antes de guardar este cambio, el Director debe confirmar ese alcance global.

| Operación | Condición en la matriz por cargo |
| --- | --- |
| Consultar | Consulta habilitada en la página y en el cuadro. |
| Editar o registrar consultas | Consulta y edición habilitadas en la página y en el cuadro. |
| Exportar CSV compatible con Excel | Consulta y exportación habilitadas en la página y en el cuadro; no requiere edición. |

La consulta no concede edición ni exportación automáticamente. Desactivar edición o exportación bloquea esa operación aunque exista una concesión individual anterior que la permitiera.

### Prioridad y revocaciones

- **Sin configuración explícita de `interesados`:** se conserva el mecanismo individual por área. Si la concesión falta, deja de estar vigente o no corresponde al correo actual, ese mecanismo no autoriza el acceso.
- **Con configuración explícita:** rige la política del cargo para esta página, sin sumar derechos de concesiones individuales. «Sin acceso» en la página o en el cuadro impide acceder, aunque el usuario conserve una concesión individual anterior. Quitar o cambiar una concesión individual tampoco limita el acceso general que siga autorizado por el cargo.
- **Revocar no equivale a borrar la configuración:** una denegación explícita mantiene bloqueado el acceso anterior. Si se elimina la configuración de `interesados`, vuelven a evaluarse las concesiones individuales que sigan vigentes; por eso no debe eliminarse una denegación para revocar el acceso.
- **Guardar permisos de otras páginas** sin modificar Interesados conserva tanto la ausencia de configuración CRM como cualquier autorización o denegación explícita existente. No migra, modifica ni revoca las concesiones individuales.
- Deshabilitar una cuenta, marcarla como unificada en otra o perder la verificación del correo impide acceder. Los cambios de identidad o cargo se evalúan según el mecanismo aplicable: la concesión individual exige coincidencia de correo y cargo Administrativo o Gerente confirmado; el permiso general exige cargo Administrativo confirmado.
- El servidor comprueba la identidad, el cargo y los permisos vigentes en cada solicitud y rechaza consultas, escrituras o exportaciones no autorizadas, también desde sesiones ya abiertas. Actualizar la página permite reflejar los permisos actuales en la interfaz; no sustituye la comprobación del servidor.

### Información visible

Cada área mantiene notas, responsable, estado y fecha de seguimiento separados; la identidad básica del contacto es común. **La vista con concesión individual** no devuelve notas ni consultas del otro servicio. **La vista general de Administrativo y la del Director** pueden consultar contactos, historiales y seguimientos de ambas áreas. La matrícula se comprueba en el servidor; este módulo no entrega al personal el expediente de estudiantes.

Estas reglas se corresponden con `functions/prospect-access.js` (selección y prioridad del mecanismo), `functions/boxes.js` (consulta, edición y exportación), `functions/index.js` (comprobación por solicitud) y `box-permissions-ui.js` (conservación de la política CRM al guardar otras páginas).

## Alta de una cuenta administrativa

El formulario del Director permite autorizar la creación o confirmación del cargo Administrativo cuando no hay un cargo confirmado. Conserva el cargo de un administrativo o gerente existente. Una cuenta nueva se crea **sin contraseña**, sin marcar el correo como verificado y sin enviar invitaciones.

El titular debe entrar en Apps HP, usar **Olvidé mi contraseña**, establecer su clave en el enlace de Firebase, iniciar sesión y verificar su correo. Después puede completar su perfil. Nunca hay que compartir la contraseña con el Director ni con soporte.

Crear o confirmar el cargo y verificar el correo no evita la política general: si Administrativo ya tiene consulta autorizada en Interesados, la cuenta podrá acceder a ambas áreas; si existe un «Sin acceso» explícito, la concesión individual guardada no lo anula.

## Registro manual

Con permiso de edición, desde **Interesados y consultas → Registrar consulta**, anotar nombre, correo, teléfono, interés, consulta, estado y próximo seguimiento. El canal predeterminado es WhatsApp. Los usuarios con concesión individual por área reciben su interés y responsable predeterminados. Un administrativo con permiso general de solo consulta no puede registrar ni editar contactos.

Una consulta manual con texto queda en el historial, junto con las consultas web. Guardar un contacto no crea una matrícula ni una cuenta del interesado. La autorización de nuevos cursos exige una constancia expresa; una consulta por WhatsApp no constituye autorización.

## Wix

Los formularios autorizados del sitio envían los datos mediante una automatización HTTP al receptor privado `wixInterests`. La credencial está en un secreto de Firebase y en la automatización de Wix; nunca se guarda en archivos públicos. La lista de formularios y sus áreas está en la configuración privada del receptor.

Se conservan los controles del sitio y formulario, tamaño, fecha, correo, consentimiento y deduplicación. Los reintentos no generan consultas repetidas. El registro no envía campañas por sí mismo.

## Verificación

### Conexión de formularios antiguos de HP Flight School

Estado al 22/10/2026, actualizado tras conectar Wix: se verificaron los dos formularios antiguos de Escuela mediante el esquema dinámico del disparador y sus páginas públicas. Se crearon, validaron con resultado VALID y comprobaron por lectura posterior dos automatizaciones INACTIVE: **Apps HP - Escuela - Contacto** y **Apps HP - Escuela - Contacto 2**. Los ID reales de formulario, claves de campos y credencial permanecen dentro de Wix; deben añadirse a la configuración privada de Firebase, sin publicarlos en este archivo. Charters se comprobó ACTIVE y no fue modificado.

| Formulario verificado | Página | Campos reales | Campos ausentes |
| --- | --- | --- | --- |
| Contacto | /hpflightschooldivision | Nombre, Email, Edad, Mensaje | Teléfono, curso, consentimiento comercial |
| Contacto 2 | /escueladepilotos | Nombre, Email, Edad (placeholder: Escribe el asunto), Mensaje | Teléfono, curso, consentimiento comercial |

Ambas conexiones inactivas mapean nombre, correo, mensaje y los valores nativos estables submissionId/submissionTime al receptor existente; incluyen sitio y formulario exactos. No se importa Edad ni se interpreta el asunto como curso. No se envía courseUpdates. No se han agregado campos al sitio. El origen y los campos disponibles están comprobados; no se ha ejecutado el flujo real ni se ha verificado visualmente el editor de automatizaciones. Firebase no tiene herramientas de administración ni sesión CLI disponible en este entorno, por lo que el secreto no se leyó ni modificó y no se desplegó esta revisión.

1. En el sitio correcto de Wix, inventariar todos los formularios existentes de Escuela: página, nombre, generación (antiguo/nuevo), ID del sitio, ID real del formulario y claves/tipos reales de sus campos. Revisar la configuración del formulario, sin exportar contactos ni envíos reales. No usar nombres visibles como identificadores.
2. Registrar para cada formulario la correspondencia siguiente a partir de su esquema y de una vista previa con datos ficticios. Si falta correo, nombre, fecha original o ID estable del envío, resolverlo antes de activar; el receptor los exige.

| Parámetro del receptor | Campo que debe verificarse en Wix |
| --- | --- |
| siteId / formId | Literales exactos del sitio y formulario autorizado |
| submissionId | ID dinámico único del envío; conservarlo en cada reintento |
| submittedAt | Fecha original ISO 8601; nunca la fecha de ejecución |
| name | Nombre completo; combinar nombre y apellido si están separados |
| email | Correo del interesado |
| phone | Teléfono/WhatsApp, como texto |
| requestedCourse | Valor original del curso solicitado, como texto |
| interest | Texto original de la consulta, separado del curso |
| courseUpdates | Omitir si no hay casilla específica; enviar true únicamente con aceptación expresa |
| token | Secreto privado existente; nunca en URL, repositorio o navegador |

3. En `HP_WIX_INTERESTS_CONFIG`, conservar token, sitio y entradas actuales de Charters. Agregar únicamente los ID de Escuela comprobados con `area: "school"`. Si existen varios sitios, detenerse: el receptor actual autoriza un solo `siteId`; no sustituirlo perdiendo Charters. El siguiente fragmento es ilustrativo y NO debe activarse con sus marcadores:

```json
{
  "ID_REAL_VERIFICADO_EN_WIX": {
    "area": "school",
    "courseMap": {"VALOR_EXACTO_DEL_CAMPO_VERIFICADO": "privado"}
  }
}
```

`courseMap` es opcional: convierte valores exactos de `requestedCourse` a uno de `privado`, `comercial`, `ifr`, `multimotor`, `rpa`, `instructor`. Un valor no mapeado se conserva en el historial sin adivinar su clasificación. También se admite `courses` como array de esos códigos; no enviarlo como texto. El curso solicitado no se deduce de la consulta libre.

4. Sin casilla específica de avisos de nuevos cursos, omitir `courseUpdates`, `consentVersion` y `consentStatement`. Si la casilla existe, comprobar que sea opcional y no preseleccionada; guardar en la configuración privada su texto exacto y versión, y mapear únicamente la respuesta afirmativa al booleano true. No convertir aceptación de privacidad, términos, campo no vacío o solicitud de información en consentimiento comercial. Charters no admite cursos ni autorización de Escuela.
5. Crear una automatización por formulario con el disparador correspondiente a su generación y condición por ID exacto. Acción HTTP POST a la URL desplegada de `wixInterests`; cuerpo plano o bajo `data`, sin mezclar ambos. Revisar Preview request body con valores ficticios y guardar como borrador hasta terminar la comprobación. No duplicar la automatización de Charters.
6. Tras integrar y desplegar la revisión del codebase existente que exporta `wixInterests`, actualizar el secreto por un canal privado y volver a desplegar la función para que use su nueva versión. No imprimir ni copiar credenciales al chat. No cambiar otras funciones ni proyectos.
7. Antes de enviar pruebas reales, revisar y deshabilitar para ellas notificaciones, respuestas, campañas e integraciones secundarias de Wix. Usar exclusivamente una identidad sintética y un buzón de pruebas controlado por la empresa, nunca un contacto real. Comprobar un envío por cada formulario, otro sin aceptación, uno con aceptación solo si existe esa casilla, y el reintento del mismo envío con ID y fecha originales. Verificar en Apps HP nombre, correo, teléfono, curso, consulta, fecha y origen; el reintento debe dejar una sola consulta. Probar también Charters y el mismo correo ficticio en ambas áreas: contacto común e historiales separados por área, con visibilidad limitada para concesiones individuales y de ambas áreas para el acceso general autorizado. Comparar antes/después usuarios, estudiantes y matrículas: ningún alta automática. No importar históricos.

Pendiente externo: autorizar los dos ID comprobados en la configuración privada de Firebase, integrar/desplegar esta revisión, revisar visualmente las conexiones inactivas y ejecutar la prueba Wix → Firebase → Apps HP antes de activar. Teléfono y curso solo podrán registrarse desde los formularios si se agregan esos campos; el consentimiento requiere además una casilla expresa y su texto/versionado. No activar todavía las conexiones creadas. Las pruebas locales usan el manejador HTTP real con Firebase simulado; no sustituyen esa comprobación.

Validación local adicional: `node --test tests/wix-school.cjs` cubre los campos conservados, mapeo exacto, consentimiento, recepción HTTP, deduplicación, separación por área y escrituras limitadas a `prospects`. No envía correos ni llama servicios reales.

### Verificación de accesos y publicación documental

Ejecutar las pruebas de `tests/prospect-access.cjs`, `tests/prospects.cjs`, `tests/permissions-endpoint.cjs`, `tests/identity-merge.cjs` y `tests/registration-lifecycle.cjs`. `tests/prospect-access.cjs` cubre los dos mecanismos, la prioridad de la denegación explícita y las 64 combinaciones de consulta, edición y exportación en página/cuadro. Las pruebas de navegador `tests/prospect-role-matrix.cjs` y `tests/prospect-permissions-browser.cjs` comprueban además la conservación de permisos al guardar otras páginas, la visibilidad por área, el acceso general y las revocaciones en sesiones abiertas. Usan Firebase simulado y requieren Playwright con un navegador compatible.

Según la [comprobación de compatibilidad del 29/10/2026](PERMISOS.md#compatibilidad-del-despliegue-confirmada-por-código--29102026), el backend activo ya contiene las capacidades necesarias para estos permisos. Esta corrección documental solo requiere PR, comprobaciones y publicación web; no requiere redesplegar `accountRegistration`, cambiar reglas ni reconfigurar usuarios o permisos. Para cambios futuros, seguir la comprobación previa de [Activación](PERMISOS.md#activación). Las pruebas que modifiquen permisos generales del cargo deben realizarse en un proyecto aislado, porque afectarían a todos los administrativos reales. La validación autenticada en Firebase real continúa pendiente según `PERMISOS.md`; las pruebas simuladas no la sustituyen.

