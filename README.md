# Helicopteros-Personales-S.A.

## Cotizaciones de Charters Panamá

La sección **Cotizaciones** permite registrar el cliente, referencia, servicio e importe de un pago concreto (abono, saldo o pago total) y revisar la aceptación recibida desde Wix. Usa el acceso actual a Charters del personal y el acceso del Director; no concede funciones adicionales a usuarios de Escuela.

El formulario de aceptación se conecta a `wixInterests` con una entrada privada `kind: "quoteAcceptance"`. La configuración existente conserva su credencial y los formularios de consultas. La evidencia contractual se guarda separada de los interesados y del consentimiento comercial de cursos: no dispara el aviso genérico de consultas, genera enlaces ni confirma pagos o reservas.

La app solo muestra una aceptación coincidente cuando las dos casillas fueron afirmativas y coinciden referencia, correo, importe, revisión material de la cotización y versiones de las políticas. Cambiar los datos materiales exige una nueva aceptación. Los envíos recibidos antes de registrar una cotización se muestran para revisión y no se vinculan retroactivamente como una aceptación vigente. El personal no puede fabricar ni editar esa evidencia desde el formulario de cotizaciones.

Antes de compartir un enlace de pago, se comprueba la aceptación y se verifica que el enlace tenga el mismo importe. La generación y el envío del enlace siguen siendo manuales.

Pruebas específicas: `node --test tests/quotes.cjs tests/quotes-browser.cjs`. La interfaz de navegador se prueba con datos ficticios y sin acceso a cuentas reales. La conexión externa requiere una comprobación aparte desde el formulario publicado hasta la cotización de prueba en Apps HP. El despliegue del receptor y `accountRegistration` debe preceder a la interfaz y a la activación de la nueva automatización de Wix.
