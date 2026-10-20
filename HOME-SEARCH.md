# Inicio personalizado y búsqueda general

## Inicio

La opción INICIO aparece primero en la navegación. En una sesión sin página recordada, se abre el inicio. Al actualizar se mantiene la última página autorizada y la aeronave seleccionada; el nuevo inicio no reemplaza esa recuperación.

Los accesos se ordenan según el cargo, sin ampliar permisos:

- Director: pendientes, horario, estadísticas, usuarios e historial.
- Gerente: pendientes, horario, estadísticas, saldos e itinerario.
- Administrativo: bitácoras, pagos, expedientes e itinerario.
- Piloto: horario, itinerario, bitácoras y pilotos.
- Mecánico: pendientes, aeronaves y horario.
- Contabilidad: pagos, saldos, expedientes y estadísticas.
- Estudiante: su expediente/estado de cuenta y las páginas autorizadas. El servidor mantiene la vinculación por correo verificado; no se hace vinculación por nombre.

Solo se muestran los accesos autorizados. Los usuarios sin páginas asignadas conservan el flujo de acceso pendiente. El inicio no es una nueva fuente de permisos ni permite operaciones administrativas adicionales.

## Búsqueda

Botón «Buscar en la app…» y atajo Ctrl/⌘ K. Busca desde dos caracteres, tolera tildes y separadores en matrículas, admite filtro de categoría, flechas/Enter y Escape. Muestra como máximo 40 resultados, indicando el total y cuándo precisar la búsqueda.

Categorías: páginas, aeronaves, pilotos, estudiantes/clientes, bitácoras, recibos, vuelos, documentos y tareas de mantenimiento. No indexa contraseñas, archivos adjuntos, datos de usuarios administrativos, historial de cambios ni expedientes eliminados. Encontrar una página no concede acceso a sus cuadros ocultos.

Los resultados llevan al expediente, aeronave, bitácora, recibo o día de itinerario correspondiente; documentos y mantenimiento abren su sección en la aeronave. Los vuelos consultados únicamente mediante Horario del día llevan a esa página, conservando su funcionamiento normal y la confirmación de cambios de fecha.

## Seguridad y consumo

- Director: índice construido en memoria con el dashboard ya cargado, sin lecturas adicionales.
- Otros cargos: se usa el endpoint existente `access` con `layout: main`, que verifica usuario, rol y permisos y devuelve datos filtrados mediante `boxView`. La búsqueda nunca consulta directamente la RTDB ni obtiene el dashboard completo sin filtrar.
- El modelo aplica además una lista explícita de campos y permisos de página/cuadro. Para Estudiante, el servidor ya limita los expedientes al vínculo verificado. La búsqueda no usa nombres para conceder acceso.
- Horario mantiene el filtro por aeronave y el permiso separado de tripulación.
- El índice se obtiene al buscar por primera vez y se reutiliza durante la visita (hasta 60 segundos entre aperturas). Se invalida con un intento de guardado. Escribir o cambiar el filtro no consulta Firebase por cada tecla. Puede haber una segunda consulta para Horario cuando no se dispone de Itinerario.
- Índice y términos no se guardan en localStorage ni en Firebase. La navegación vuelve a validar el acceso en el servidor.
- La comunicación del iframe exige la ventana y el canal correspondiente. Los resultados solo abren páginas previamente autorizadas; no ejecutan acciones de escritura.

## Pruebas

`home-search-model.cjs`: prioridades, coincidencias con tildes y matrículas, campos/páginas ocultos, vinculación del estudiante y aeronaves/tripulación de Horario.

`home-search-browser.cjs`: inicio de seis cargos y Director, memoria al actualizar, móvil, apertura de estudiantes/pilotos/aeronaves/recibos/bitácoras, navegación por teclado y cero escrituras por búsqueda/navegación. Verifica que escribir más texto no genere más solicitudes.

También se ejecutaron las regresiones de navegación, borradores, edición por permisos e impresión/exportación.

No requiere despliegue de funciones ni cambios de reglas Firebase.
