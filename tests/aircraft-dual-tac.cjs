'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.js'), 'utf8');
const registro = fs.readFileSync(path.join(root, 'registro.js'), 'utf8');
function between(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing source anchor: ${start}`);
  assert.notEqual(to, -1, `missing source anchor: ${end}`);
  return source.slice(from, to);
}
const dashboardModel = [
  between(dashboard, 'function isMultimotor(', '// ===== DRAWER'),
  between(dashboard, 'function tacCents(', 'function updateTAC('),
  between(dashboard, 'function adjustRecordedHours(', 'function fleetRecordReg('),
  between(dashboard, 'function fleetRecordReg(', 'async function applyRecordChange('),
  between(dashboard, 'async function applyRecordChange(', 'async function savePanelInternal('),
  between(dashboard, 'async function savePanelInternal(', 'async function savePanelLegacy('),
].join('\n');
const registroModel = [
  between(registro, 'function registry(', 'function prepareRegistration('),
  between(registro, 'function adjustDualCorrection(', 'function prepareCorrection('),
  between(registro, 'function reverseAircraftRecord(', 'function prepareDeletion('),
  between(registro, 'function prepareDeletion(', 'function deleteEntry('),
].join('\n');

function dashboardContext(state, inputs = {}) {
  const nodes = new Map();
  const getElementById = id => {
    if (nodes.has(id)) return nodes.get(id);
    const input = inputs[id] || { value: '' };
    nodes.set(id, { ...input, setCustomValidity() {}, reportValidity() {}, textContent: '', style: {}, dataset: {} });
    return nodes.get(id);
  };
  const ctx = {
    state: [state], fleet: [{ reg: 'HP-880BL' }], aircraftDirty: new Set(), structuredClone,
    document: { getElementById, querySelector: () => null },
    window: {}, saveData: async () => true,
    getFechaPanama: () => '19/11/2026', getHoraPanama: () => '10:00',
    dayNumber: value => /^\d{2}\/\d{2}\/\d{4}$/.test(value) ? 1 : NaN,
    refreshPanel() {}, updateTAC() {}, updateSummary() {}, buildResumen() {},
    updateUndoButtons() {}, renderVencimientoLog() {}, renderTACLogs() {},
    alert() {},
  };
  vm.createContext(ctx);
  vm.runInContext('\'use strict\';\n' + dashboardModel, ctx);
  return { ctx, nodes };
}
function dualLog({ id, date = '01/11/2026', leftPrevious = 10000, leftCurrent = 10200,
  rightPrevious = 10000, rightCurrent = 10100, hobbsPrevious = 10000, hobbsCurrent = 10200,
  registryId = '' } = {}) {
  return {
    id, registryId, hour_index: 0, fecha: date, hora: '09:00', hv: '2.00',
    tacLeftPrevious100: leftPrevious, tacLeftCurrent100: leftCurrent,
    tacLeftHours100: leftCurrent - leftPrevious,
    tacRightPrevious100: rightPrevious, tacRightCurrent100: rightCurrent,
    tacRightHours100: rightCurrent - rightPrevious,
    hobbsPrevious100: hobbsPrevious, hobbsCurrent100: hobbsCurrent,
    hobbsHours100: hobbsCurrent - hobbsPrevious,
  };
}
function panelFixture() {
  return {
    serial: 'HP880BL-FICTICIO', horas_acum_50: '10.00', horas_acum_100: '20.00',
    ciclos_totales: '2.00', helice1_ciclos: '2.00',
    ciclos_limite: '1.00', helice2_ciclos: '1.00',
    tac_izq_anterior: '102.00', tac_der_anterior: '101.00', hobbs_anterior: '102.00',
    tac_izq_actual: '', tac_der_actual: '', hobbs_actual: '',
    bitacora_tac: [dualLog()],
    bitacora_horas: [{ fecha: '01/11/2026', hora: '09:00', hv: '2.00', acum: '20.00', tac_id: 'direct-1' }],
    bitacora_inspecciones: [], bitacora_vencimientos: [],
  };
}

test('reproduces the pre-fix omitted aircraft argument with a synthetic state', () => {
  const { ctx } = dashboardContext(panelFixture());
  assert.throws(() => vm.runInContext('\'use strict\'; adjustDualAircraftComponents(1, 0)', ctx), error => error.name === 'TypeError');
  assert.doesNotThrow(() => ctx.adjustDualAircraftComponents(panelFixture(), 1, 0));
});

test('direct-panel date correction updates the linked log but not hours or components', async () => {
  const { ctx } = dashboardContext(panelFixture());
  const before = ctx.state[0];
  const err = await ctx.applyRecordChange('tac', 0, 0, {
    fecha: '02/11/2026', razon: 'Fecha de prueba',
    leftAnterior: '100.00', leftActual: '102.00',
    rightAnterior: '100.00', rightActual: '101.00',
    hobbsAnterior: '100.00', hobbsActual: '102.00',
  });
  assert.equal(err, '');
  assert.equal(ctx.state[0].bitacora_tac[0].fecha, '02/11/2026');
  assert.equal(ctx.state[0].bitacora_horas[0].fecha, '02/11/2026');
  assert.equal(ctx.state[0].bitacora_tac[0].modificaciones[0].antes.fecha, '01/11/2026');
  for (const field of ['horas_acum_50', 'horas_acum_100', 'ciclos_totales', 'ciclos_limite', 'helice1_ciclos', 'helice2_ciclos']) {
    assert.equal(ctx.state[0][field], before[field], field);
  }
});

test('direct-panel TAC correction from 2h/1h to zero never goes negative or double-counts', async () => {
  const { ctx } = dashboardContext(panelFixture());
  const err = await ctx.applyRecordChange('tac', 0, 0, {
    fecha: '01/11/2026', razon: 'Lecturas ficticias corregidas',
    leftAnterior: '100.00', leftActual: '100.00',
    rightAnterior: '100.00', rightActual: '100.00',
    hobbsAnterior: '100.00', hobbsActual: '102.00',
  });
  assert.equal(err, '');
  const saved = ctx.state[0];
  assert.equal(saved.bitacora_tac[0].hv, '0.00');
  assert.equal(saved.bitacora_tac[0].tacLeftCurrent100, 10000);
  assert.equal(saved.bitacora_tac[0].tacRightCurrent100, 10000);
  assert.equal(saved.bitacora_horas[0].hv, '0.00');
  assert.equal(saved.horas_acum_50, '8.00');
  assert.equal(saved.horas_acum_100, '18.00');
  for (const field of ['ciclos_totales', 'ciclos_limite', 'helice1_ciclos', 'helice2_ciclos']) assert.equal(saved[field], '0.00', field);
  assert.equal(saved.tac_izq_anterior, '100.00');
  assert.equal(saved.tac_der_anterior, '100.00');
  assert.equal(saved.hobbs_anterior, '102.00');
  assert.equal(saved.bitacora_tac[0].hobbsHours100, 200, 'Hobbs remains its own reading and does not drive maintenance totals');
  assert.equal(saved.bitacora_tac[0].modificaciones[0].antes.tacLeftCurrent100, 10200);
});

test('preloaded previous readings with blank current values do not block independent aircraft saves', async () => {
  const data = panelFixture();
  const inputs = {
    'tac-left-anterior-0': { value: '102.00' }, 'tac-left-actual-0': { value: '' },
    'tac-right-anterior-0': { value: '101.00' }, 'tac-right-actual-0': { value: '' },
    'tac-hobbs-anterior-0': { value: '102.00' }, 'tac-hobbs-actual-0': { value: '' },
    'horas_diarias-0': { value: '' }, 'horas-venc-dia-0': { value: '' },
  };
  const { ctx } = dashboardContext(data, inputs);
  let independentSave = 0;
  ctx.savePanelLegacy = async idx => { ctx.state[idx].serial = 'METADATO-GUARDADO'; independentSave++; return true; };
  assert.equal(ctx.dualTACInputValues(0).any, false);
  assert.equal(await ctx.savePanelInternal(0), true);
  assert.equal(independentSave, 1);
  assert.equal(ctx.state[0].serial, 'METADATO-GUARDADO');
  assert.equal(ctx.state[0].bitacora_tac.length, 1, 'a metadata-only save cannot append a reading');
});

function registrationContext() {
  const ctx = {
    fleet: [{ reg: 'HP-880BL', type: 'fixed' }], structuredClone,
    aircraftKey: reg => reg.replace(/[^a-zA-Z0-9]/g, '_'),
    decodeAircraft: value => structuredClone(value || {}),
    fmt: n => (Number(n || 0) / 100).toFixed(2), arr: value => Array.isArray(value) ? value : [],
    vencimientoComponents: () => [],
    getFechaPanama: () => '19/11/2026', getHoraPanama: () => '10:00',
  };
  vm.createContext(ctx);
  vm.runInContext(between(dashboard, 'function isMultimotor(', 'function isDualTAC(') + between(dashboard, 'function adjustRecordedHours(', 'function fleetRecordReg(') + between(dashboard, 'function fleetRecordReg(', 'async function applyRecordChange('), ctx);
  vm.runInContext(registroModel, ctx);
  return ctx;
}

function componentFixture() {
  return {
    audit_aircraft_reg: 'HP-880BL', horas_acum_50: '2.00', horas_acum_100: '2.00',
    ciclos_totales: '2.00', helice1_ciclos: '2.00', ciclos_limite: '1.00', helice2_ciclos: '1.00',
    bitacora_inspecciones: [], bitacora_vencimientos: [],
    bitacora_horas: [{ fecha: '01/11/2026', hora: '09:00', hv: '2.00', acum: '2.00', registryId: 'A' }],
    bitacora_tac: [],
  };
}

test('Registro correction applies maintenance max and individual engine/propeller deltas once', () => {
  const ctx = registrationContext(), d = componentFixture();
  const tac = { id: 'tac-A', registryId: 'A', hour_index: 0, fecha: '01/11/2026', hv: '2.00' };
  const oldReadings = { left: { hours: 200 }, right: { hours: 100 }, hobbs: { hours: 200 } };
  const newReadings = { left: { previous: 10000, current: 10000, hours: 0 }, right: { previous: 10000, current: 10000, hours: 0 }, hobbs: { previous: 10000, current: 10200, hours: 200 } };
  ctx.adjustDualCorrection(d, tac, oldReadings, newReadings, 'HP-880BL');
  assert.equal(d.horas_acum_50, '0.00');
  assert.equal(d.horas_acum_100, '0.00');
  assert.equal(d.bitacora_horas[0].hv, '0.00');
  for (const field of ['ciclos_totales', 'ciclos_limite', 'helice1_ciclos', 'helice2_ciclos']) assert.equal(d[field], '0.00', field);
  assert.equal(tac.tacLeftCurrent100, 10000);
  assert.equal(d.bitacora_horas[0].tacRightCurrent100, 10000);
  assert.equal(tac.hobbsHours100, 200);
});

test('deleting a 2h/1h dual reading reverses each component exactly once', () => {
  const ctx = registrationContext(), source = componentFixture();
  const tac = dualLog({ id: 'tac-A', registryId: 'A', leftPrevious: 10000, leftCurrent: 10200,
    rightPrevious: 10000, rightCurrent: 10100, hobbsPrevious: 10000, hobbsCurrent: 10200 });
  tac.hour_index = 0;
  source.bitacora_tac = [tac];
  source.bitacora_horas = [{ fecha: tac.fecha, hora: tac.hora, hv: '2.00', acum: '2.00', registryId: 'A' }];
  const entry = { id: 'A', aircraft: 'HP-880BL', tacLeftPrevious100: 10000, tacRightPrevious100: 10000,
    tacLeftHours100: 200, tacRightHours100: 100, hobbsPrevious100: 10000 };
  const restored = ctx.reverseAircraftRecord('HP-880BL', source, entry, null);
  assert.equal(restored.horas_acum_50, '0.00');
  assert.equal(restored.horas_acum_100, '0.00');
  for (const field of ['ciclos_totales', 'ciclos_limite', 'helice1_ciclos', 'helice2_ciclos']) assert.equal(restored[field], '0.00', field);
});

function deletionFixture(componentBase = 0) {
  const base = {
    fleet: {}, undoFleet: { HP_880BL: [] }, school: { students: [{ id: 'student-fixture', registryFlights: [] }], registry: { entries: [], deletedEntries: [], clients: [] } },
  };
  const initial = {
    audit_aircraft_reg: 'HP-880BL', horas_acum_50: '0.00', horas_acum_100: '0.00',
    ciclos_totales: componentBase.toFixed(2), helice1_ciclos: componentBase.toFixed(2),
    ciclos_limite: componentBase.toFixed(2), helice2_ciclos: componentBase.toFixed(2),
    tac_izq_anterior: '100.00', tac_der_anterior: '100.00', hobbs_anterior: '100.00',
    bitacora_tac: [], bitacora_horas: [], bitacora_inspecciones: [], bitacora_vencimientos: [],
  };
  let current = structuredClone(initial);
  const entries = [];
  const increments = [
    { id: 'A', date: '2026-11-01T10:00:00.000Z', left: 100, right: 50, hobbs: 100 },
    { id: 'B', date: '2026-11-02T10:00:00.000Z', left: 50, right: 100, hobbs: 100 },
    { id: 'C', date: '2026-11-03T10:00:00.000Z', left: 25, right: 25, hobbs: 25 },
  ];
  const flightRows = [];
  for (const item of increments) {
    const aircraftBefore = Object.fromEntries(['tac_izq_anterior','tac_der_anterior','hobbs_anterior','horas_acum_50','horas_acum_100','ciclos_totales','ciclos_limite','helice1_ciclos','helice2_ciclos'].map(field => [field, current[field]]));
    const leftPrevious = Math.round(Number(current.tac_izq_anterior) * 100), rightPrevious = Math.round(Number(current.tac_der_anterior) * 100), hobbsPrevious = Math.round(Number(current.hobbs_anterior) * 100);
    const tac = dualLog({ id: 'tac-' + item.id, registryId: item.id, date: item.date.slice(0,10),
      leftPrevious, leftCurrent: leftPrevious + item.left,
      rightPrevious, rightCurrent: rightPrevious + item.right,
      hobbsPrevious, hobbsCurrent: hobbsPrevious + item.hobbs });
    const left = item.left / 100, right = item.right / 100, maint = Math.max(left, right);
    tac.hv = maint.toFixed(2);
    current.horas_acum_50 = (Number(current.horas_acum_50) + maint).toFixed(2);
    current.horas_acum_100 = (Number(current.horas_acum_100) + maint).toFixed(2);
    current.ciclos_totales = (Number(current.ciclos_totales) + left).toFixed(2);
    current.helice1_ciclos = current.ciclos_totales;
    current.ciclos_limite = (Number(current.ciclos_limite) + right).toFixed(2);
    current.helice2_ciclos = current.ciclos_limite;
    current.tac_izq_anterior = ((leftPrevious + item.left) / 100).toFixed(2);
    current.tac_der_anterior = ((rightPrevious + item.right) / 100).toFixed(2);
    current.hobbs_anterior = ((hobbsPrevious + item.hobbs) / 100).toFixed(2);
    current.bitacora_horas.push({ fecha: tac.fecha, hora: '10:00', hv: maint.toFixed(2), acum: current.horas_acum_100, registryId: item.id });
    current.bitacora_tac.push({ ...tac, hour_index: current.bitacora_horas.length - 1 });
    const entry = {
      id: item.id, aircraft: 'HP-880BL', aircraftBefore, createdAt: item.date,
      personId: 'student-fixture', personKind: 'student', courseId: '',
      hours100: Math.round(maint * 100), aircraftHours100: Math.round(maint * 100),
      tacPrevious100: null, tacCurrent100: null,
      tacLeftPrevious100: tac.tacLeftPrevious100, tacLeftCurrent100: tac.tacLeftCurrent100, tacLeftHours100: tac.tacLeftHours100,
      tacRightPrevious100: tac.tacRightPrevious100, tacRightCurrent100: tac.tacRightCurrent100, tacRightHours100: tac.tacRightHours100,
      hobbsPrevious100: tac.hobbsPrevious100, hobbsCurrent100: tac.hobbsCurrent100, hobbsHours100: tac.hobbsHours100,
      modifications: [],
    };
    entries.push(entry); flightRows.push({ registryId: item.id });
  }
  base.fleet.HP_880BL = current;
  base.school.registry.entries = entries;
  base.school.students[0].registryFlights = flightRows;
  return base;
}

test('out-of-order deletion restores individual totals and the original dual-meter baseline', () => {
  const ctx = registrationContext(); let data = deletionFixture(10);
  for (const id of ['A', 'C', 'B']) data = ctx.prepareDeletion(data, id).next;
  const restored = data.fleet.HP_880BL;
  assert.equal(restored.horas_acum_50, '0.00');
  assert.equal(restored.horas_acum_100, '0.00');
  for (const field of ['ciclos_totales','ciclos_limite','helice1_ciclos','helice2_ciclos']) assert.equal(restored[field], '10.00', field);
  assert.equal(restored.tac_izq_anterior, '100.00');
  assert.equal(restored.tac_der_anterior, '100.00');
  assert.equal(restored.hobbs_anterior, '100.00');
  assert.equal(restored.bitacora_tac.length, 0);
  assert.equal(restored.bitacora_horas.length, 0);
  assert.equal(data.school.registry.entries.length, 0);
  assert.equal(data.school.registry.deletedEntries.length, 3);
});
