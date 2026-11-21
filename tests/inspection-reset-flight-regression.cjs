'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const History = require('../functions/inspection-history');
const { protect } = require('../functions/inspection-resets');

function clone(value) {
  return structuredClone(value);
}

function extractFunction(source, name, nextName, context) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`\nfunction ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `No se encontró ${name} en su archivo fuente.`);
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.__testFunction = ${name};`, context);
  return context.__testFunction;
}

function loadAircraftHelpers() {
  const context = vm.createContext({
    structuredClone,
    window: { HPInspectionHistory: History },
    fleet: [{ reg: 'HP1784', type: 'fixed' }],
    arr: value => Array.isArray(value) ? value : [],
    fmt: value => (Number(value || 0) / 100).toFixed(2),
    decodeAircraft: value => structuredClone(value || {}),
    isDualTAC: () => false,
    hasDualMeters: () => false,
    applyDualComponentChange() {},
    isMultimotor: () => false,
    fleetRecordReg: aircraft => aircraft.audit_aircraft_reg || '',
    inspectionResetOffsets: (aircraft, limit) => History.resetEvents(aircraft, limit).map(event => event.offset),
    recomputeInspectionAccumulators: aircraft => History.rebuild(aircraft),
    vencimientoComponents: () => []
  });
  const dashboard = fs.readFileSync(require.resolve('../dashboard.js'), 'utf8');
  const registro = fs.readFileSync(require.resolve('../registro.js'), 'utf8');
  const adjustRecordedHours = extractFunction(dashboard, 'adjustRecordedHours', 'adjustDualAircraftComponents', context);
  const reverseAircraftRecord = extractFunction(registro, 'reverseAircraftRecord', 'prepareDeletion', context);
  return { adjustRecordedHours, reverseAircraftRecord };
}

test('deleting a pre-reset flight then correcting the next flight counts it after the reset', () => {
  const { adjustRecordedHours, reverseAircraftRecord } = loadAircraftHelpers();
  const reset = {
    id: 'fixture-reset-50',
    limitHours: 50,
    before: '10.00',
    after: '0.00',
    hour_offset: 1,
    effective_hour_offset: 1,
    reason: 'Fixture de regresión',
    createdAt: '2026-11-20T12:00:00.000Z',
    fecha: '20/11/2026',
    hora: '7:00 a. m.'
  };
  const before = {
    tac_anterior: '110.00',
    horas_acum_50: '0.00',
    horas_totales: '0.00',
    horas_acum_100: '10.00',
    horas_limite: '10.00',
    ciclos_totales: '10.00',
    ciclos_limite: '10.00',
    bitacora_vencimientos: [],
    bitacora_inspecciones: [],
    bitacora_reinicios_inspeccion: [reset],
    bitacora_tac: [{
      id: 'tac-before-reset',
      registryId: 'flight-before-reset',
      hour_index: 0,
      fecha: '20/11/2026',
      hora: '8:00 a. m.',
      anterior: '100.00',
      actual: '110.00',
      hv: '10.00',
      modificaciones: []
    }],
    bitacora_horas: [{
      registryId: 'flight-before-reset',
      tac_id: 'tac-before-reset',
      fecha: '20/11/2026',
      hora: '8:00 a. m.',
      hv: '10.00',
      acum: '10.00'
    }]
  };
  const entry = {
    id: 'flight-before-reset',
    aircraft: 'HP1784',
    tacPrevious100: 10000,
    tacCurrent100: 11000,
    hours100: 1000
  };

  // Use the production reversal helper on fictitious records; the immutable audit
  // offset remains intact while only the effective reset boundary shifts.
  const afterDelete = reverseAircraftRecord('HP1784', before, entry, { tac_anterior: '100.00' });
  assert.equal(afterDelete.bitacora_horas.length, 0);
  assert.equal(afterDelete.bitacora_reinicios_inspeccion[0].hour_offset, 1);
  assert.equal(afterDelete.bitacora_reinicios_inspeccion[0].effective_hour_offset, 0);
  assert.equal(afterDelete.bitacora_reinicios_inspeccion[0].reason, 'Fixture de regresión');
  assert.equal(afterDelete.horas_acum_50, '0.00');
  assert.equal(afterDelete.horas_acum_100, '0.00');
  assert.doesNotThrow(() => protect({ fleet: { HP1784: before } }, { fleet: { HP1784: afterDelete } }, { role: 'Director' }));

  // A subsequent normal flight is allowed for a non-Director and starts after
  // the corrected effective boundary.
  const afterNewFlight = clone(afterDelete);
  afterNewFlight.bitacora_tac.push({
    id: 'tac-after-reset',
    registryId: 'flight-after-reset',
    hour_index: 0,
    fecha: '20/11/2026',
    hora: '9:00 a. m.',
    anterior: '100.00',
    actual: '110.00',
    hv: '10.00',
    modificaciones: []
  });
  afterNewFlight.bitacora_horas.push({
    registryId: 'flight-after-reset',
    tac_id: 'tac-after-reset',
    fecha: '20/11/2026',
    hora: '9:00 a. m.',
    hv: '10.00',
    acum: '10.00'
  });
  afterNewFlight.ciclos_totales = '10.00';
  afterNewFlight.ciclos_limite = '10.00';
  afterNewFlight.horas_acum_50 = '10.00';
  afterNewFlight.horas_totales = '10.00';
  afterNewFlight.horas_acum_100 = '10.00';
  afterNewFlight.horas_limite = '10.00';
  History.rebuild(afterNewFlight);
  assert.doesNotThrow(() => protect(
    { fleet: { HP1784: afterDelete } },
    { fleet: { HP1784: afterNewFlight } },
    { role: 'Gerente' }
  ));

  // Correcting that post-reset flight from 10 to 20 hours must update the
  // linked log and both maintenance counters, with no negative or stale value.
  const corrected = clone(afterNewFlight);
  const tac = corrected.bitacora_tac[0];
  adjustRecordedHours(corrected, tac, 10);
  tac.actual = '120.00';
  tac.hv = '20.00';
  assert.equal(corrected.bitacora_horas[0].hv, '20.00');
  assert.equal(corrected.horas_acum_50, '20.00');
  assert.equal(corrected.horas_totales, '20.00');
  assert.equal(corrected.horas_acum_100, '20.00');
  assert.equal(corrected.horas_limite, '20.00');
  assert.doesNotThrow(() => protect(
    { fleet: { HP1784: afterNewFlight } },
    { fleet: { HP1784: corrected } },
    { role: 'Director' }
  ));
  assert.throws(() => protect(
    { fleet: { HP1784: afterNewFlight } },
    { fleet: { HP1784: corrected } },
    { role: 'Gerente' }
  ), /Solo el Director puede reiniciar o corregir acumulados/);
});
