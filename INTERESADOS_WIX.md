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

Ejecutar las pruebas de `tests/prospect-access.cjs`, `tests/prospects.cjs`, `tests/permissions-endpoint.cjs`, `tests/identity-merge.cjs` y `tests/registration-lifecycle.cjs`. Las pruebas de navegador requieren el ejecutable compatible de Playwright. Publicar la función `accounts:accountRegistration` y los archivos estáticos antes de configurar los usuarios reales.
