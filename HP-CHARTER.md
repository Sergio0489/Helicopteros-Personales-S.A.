# HP CHARTER, personal y organigramas

HP CHARTER comparte el formato institucional de Escuela: organigrama, certificados con vencimientos e información institucional. La estructura inicial usa los cinco cargos de la referencia; los responsables se asignan desde la aplicación. No se incluyen datos privados del personal en los archivos públicos.

## Datos y sincronización

- `school.charter.information`: cargos, nombres libres o referencias `personRef: {kind, id}`, catálogo de certificados e información institucional.
- `school.charter.certificates`: fechas por identificador estable, independiente de Escuela.
- `school.personnel`: expedientes de personal. Datos personales, cargo, fecha de inicio y observaciones; no contiene credenciales aeronáuticas.
- `school.information.people[*].personRef`: los organigramas de Escuela y HP CHARTER pueden apuntar a personal, pilotos o estudiantes.
- Seleccionar una opción del autocompletado guarda la referencia. Escribir otro texto guarda un nombre libre. Los nombres se resuelven al visualizar y el servidor los actualiza antes de filtrar los datos por permisos; no expone el expediente de origen al lector del organigrama.
- Si se vincula un registro antiguo sin ID, se asigna un UUID en la misma operación de guardado. No se modifica su cargo de usuario ni sus permisos.
- Eliminar un certificado requiere confirmación y elimina también su fecha. El marcador `certificatesEmpty` impide restaurar certificados iniciales cuando se elimina el último.
- Pendientes incorpora certificados de HP CHARTER y respeta su cuadro de permisos. Mantiene los umbrales institucionales existentes de Escuela.

## Permisos y guardado

Directores administran los cargos y estructura institucional, agregan o eliminan certificados. Otros cargos pueden obtener lectura del organigrama, edición de fechas y lectura/edición de personal mediante cuadros separados. Los permisos se comprueban también en el servidor. No se conceden nuevos accesos de edición por defecto.

Todos los cambios usan el guardado existente con revisión optimista e historial. Los formularios de personal se integran con recuperación de borradores; el buscador general incluye personal únicamente con acceso a su cuadro.

## Publicación

GitHub Pages sirve la interfaz. Para habilitar la proyección y los nuevos permisos del backend, desplegar desde la copia actualizada:

```bash
cd ~/hp-registro
git pull --ff-only origin main
firebase deploy --only functions:accounts --project helicopteros-personales
```

No hay migración masiva ni cambios en las reglas de la base de datos.

## Verificación

`tests/company-model.cjs` comprueba referencias, eliminación durable, validación y permisos. `tests/company-browser.cjs` prueba altas, ediciones, organigramas, alertas y vista móvil con datos ficticios, además de lectura y edición por cargo. Se conservan pruebas de Escuela, guardado por permisos, borradores y búsqueda.
