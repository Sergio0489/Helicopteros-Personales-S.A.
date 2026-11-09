// Append to each existing school page; preserve other page handlers.
// Legacy Wix Forms: /hpflightschooldivision and /escueladepilotos.
// The native form must contain checkbox1 (optional, initially unchecked)
// and courseConsentVersion (read-only, hidden, default hpfs-cursos-email-v1).
$w.onReady(function () {
  const version = "hpfs-cursos-email-v1";
  $w("#courseConsentVersion").value = version;
  $w("#checkbox1").checked = false;
  $w("#checkbox1").required = false;
  $w("#wixForms1").onWixFormSubmit((event) => {
    const versionField = event.fields.find(field => field.id === "courseConsentVersion");
    if (versionField) versionField.fieldValue = version;
    return event.fields;
  });
});
