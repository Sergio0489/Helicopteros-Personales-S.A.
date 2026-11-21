'use strict';

const message = 'Tu identidad está pendiente de revisión por el Director. No puedes consultar ni modificar datos de la aplicación hasta que se resuelva.';

function pending(account) {
  const flag = account?.identityReviewPending;
  // Missing/false is the normal state. Malformed flags fail closed.
  return (flag !== undefined && flag !== null && flag !== false) || account?.syncStatus === 'duplicate-identity';
}

function allowsRequest(account, action) {
  return !pending(account) || action === 'submit' || action === 'status';
}

module.exports = { pending, allowsRequest, message };
