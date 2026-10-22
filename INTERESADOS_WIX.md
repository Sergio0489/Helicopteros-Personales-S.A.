# Interesados y consultas: Wix, WhatsApp y seguimiento

El Director conserva una vista completa. Cada contacto se identifica por correo normalizado; las consultas web tienen identificadores propios para evitar duplicados al reintentarse la entrega.

## Acceso por usuario

El Director puede asignar un área individual desde **Interesados y consultas → Accesos de Antonio y Fernando**. Este permiso complementa el cargo y no modifica los permisos administrativos existentes de otros módulos.

- Charters: registro y seguimiento de consultas de esa área.
- Cursos de pilotos: registro, cursos, seguimiento y constancia de autorización de avisos de esa área.
- Los usuarios necesitan un correo verificado, un cargo Administrativo o Gerente confirmado y una concesión individual vigente vinculada al correo.
- Un administrativo sin concesión individual no recibe acceso al CRM.
- Deshabilitar, unificar o cambiar la identidad/cargo de una cuenta invalida su acceso cuando deja de cumplir estas condiciones.
- Cada área tiene notas, responsable, estado y fecha de seguimiento separados. La identidad básica del contacto es común. La vista por área no devuelve notas ni consultas del otro servicio.
- El Director puede ver el seguimiento de ambas áreas. La matrícula solo se comprueba en el servidor; la vista del personal no recibe el expediente de estudiantes mediante este módulo.

## Alta de una cuenta administrativa

El formulario del Director permite autorizar la creación o confirmación del cargo Administrativo cuando no hay un cargo confirmado. Conserva el cargo de un administrativo o gerente existente. Una cuenta nueva se crea **sin contraseña**, sin marcar el correo como verificado y sin enviar invitaciones.

El titular debe entrar en Apps HP, usar **Olvidé mi contraseña**, establecer su clave en el enlace de Firebase, iniciar sesión y verificar su correo. Después puede completar su perfil. Nunca hay que compartir la contraseña con el Director ni con soporte.

## Registro manual

Desde **Interesados y consultas → Registrar consulta**, anotar nombre, correo, teléfono, interés, consulta, estado y próximo seguimiento. El canal predeterminado es WhatsApp. Los usuarios de área reciben su interés y responsable predeterminados.

Una consulta manual con texto queda en el historial, junto con las consultas web. Guardar un contacto no crea una matrícula ni una cuenta del interesado. La autorización de nuevos cursos exige una constancia expresa; una consulta por WhatsApp no constituye autorización.

## Wix

Los formularios autorizados del sitio envían los datos mediante una automatización HTTP al receptor privado `wixInterests`. La credencial está en un secreto de Firebase y en la automatización de Wix; nunca se guarda en archivos públicos. La lista de formularios y sus áreas está en la configuración privada del receptor.

Se conservan los controles del sitio y formulario, tamaño, fecha, correo, consentimiento y deduplicación. Los reintentos no generan consultas repetidas. El registro no envía campañas por sí mismo.

## Verificación

### Conexión de formularios antiguos de HP Flight School

Estado al 22/10/2026: preparación de código y pruebas locales; sin acceso autorizado a Wix en esta sesión. No se verificaron identificadores ni campos reales de Escuela, no se modificó el secreto, no se desplegó esta revisión y no se activó ninguna automatización. La activación previa de Charters consta en el PR #11; no se comprobó de nuevo en vivo.

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
7. Antes de enviar pruebas reales, revisar y deshabilitar para ellas notificaciones, respuestas, campañas e integraciones secundarias de Wix. Usar exclusivamente una identidad sintética y un buzón de pruebas controlado por la empresa, nunca un contacto real. Comprobar un envío por cada formulario, otro sin aceptación, uno con aceptación solo si existe esa casilla, y el reintento del mismo envío con ID y fecha originales. Verificar en Apps HP nombre, correo, teléfono, curso, consulta, fecha y origen; el reintento debe dejar una sola consulta. Probar también Charters y el mismo correo ficticio en ambas áreas: contacto común, historiales y permisos separados. Comparar antes/después usuarios, estudiantes y matrículas: ningún alta automática. No importar históricos.

Pendiente externo: acceso Wix, inventario de IDs y campos reales, texto/versionado de consentimiento si corresponde, configuración privada, despliegue y prueba Wix → Firebase → Apps HP. Las pruebas locales usan el manejador HTTP real con Firebase simulado; no sustituyen esa comprobación.

Validación local adicional: `node --test tests/wix-school.cjs` cubre los campos conservados, mapeo exacto, consentimiento, recepción HTTP, deduplicación, separación por área y escrituras limitadas a `prospects`. No envía correos ni llama servicios reales.

Ejecutar las pruebas de `tests/prospect-access.cjs`, `tests/prospects.cjs`, `tests/permissions-endpoint.cjs`, `tests/identity-merge.cjs` y `tests/registration-lifecycle.cjs`. Las pruebas de navegador requieren el ejecutable compatible de Playwright. Publicar la función `accounts:accountRegistration` y los archivos estáticos antes de configurar los usuarios reales.

