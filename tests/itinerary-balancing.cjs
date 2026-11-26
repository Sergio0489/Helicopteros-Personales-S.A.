'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const root = process.cwd();
const E = require(root + '/functions/itinerary-engine');
const M = require(root + '/functions/itinerary-model');
const initial = require(root + '/tests/fixtures/itinerary-initial.cjs');

const base = () => {
  const state = initial();
  state.requests = [];
  state.confirmed = [];
  state.cancelled = [];
  return state;
};

const request = (id, pilot, type = 'privado', aircraft = 'HP1907') => ({
  id, pilot, flightType: type, aircraft, slot: 'b1', start: '06:30', end: '09:30',
  created: Number(id.slice(1)) || 1,
});

const assigned = result => result.results.filter(q => q.status === 'assigned');

test('balanced mode gives competing compatible requests distinct monomotors before repeating', () => {
  const state = base();
  state.requests = ['a', 'b', 'c', 'd'].map((pilot, i) => request(`q${i + 1}`, pilot));
  const before = structuredClone(state);
  const result = E.simulate(state);

  assert.equal(assigned(result).length, 4);
  assert.equal(new Set(result.assignments.map(q => q.aircraft)).size, 4);
  for (let i = 0; i < result.assignments.length; i++) {
    for (let j = i + 1; j < result.assignments.length; j++) {
      const left = result.assignments[i];
      const right = result.assignments[j];
      if (left.aircraft === right.aircraft || left.pilot === right.pilot) {
        assert.equal(E.overlaps(left, right), false);
      }
    }
  }
  assert.deepEqual(state, before);
});

test('manual aircraft and pilot orders remain effective without relaxing compatibility', () => {
  const state = base();
  state.prioritySettings = {
    aircraftMode: 'priority', pilotMode: 'manual', hourPeriod: 'honorarios',
    pilotOrder: ['b', 'a', 'c', 'd'],
  };
  state.typeRules.privado = ['HP1907', 'HP1784', 'HP1819'];
  state.requests = [request('q1', 'a'), request('q2', 'b')];

  const byPilot = Object.fromEntries(E.simulate(state).assignments.map(q => [q.pilot, q.aircraft]));
  assert.deepEqual(byPilot, { b: 'HP1907', a: 'HP1784' });
});

test('scheduled hours compare the selected Honorarios cycle or calendar month', () => {
  const date = '2026-11-23';
  const now = '2026-11-23T08:00:00-05:00';
  const fleet = Object.fromEntries(E.fleet.map(([id]) => [
    id === 'HP1186' ? id : id.replace(/^HP/, 'HP_'), { status: 'operativo' },
  ]));
  const data = {
    fleet,
    pilotos: [
      { id: 'a', nombre: 'Piloto A', email: 'a@example.test' },
      { id: 'b', nombre: 'Piloto B', email: 'b@example.test' },
    ],
    itinerarios: [
      { fecha: '2026-11-05', pilotId: 'a', piloto: 'Piloto A', aeronave: 'HP-1784', horaInicio: '08:00', horaFin: '10:30' },
      { fecha: '2026-11-20', pilotId: 'b', piloto: 'Piloto B', aeronave: 'HP-1784', horaInicio: '08:00', horaFin: '09:00' },
    ],
    school: { students: [], registry: { clients: [] } },
    itinerary: {
      version: 1,
      config: {
        prioritySettings: { aircraftMode: 'priority', pilotMode: 'hours', hourPeriod: 'honorarios' },
        typeRules: { privado: ['HP1784', 'HP1819'] },
      },
      days: {},
    },
  };

  for (const [hourPeriod, winner, priorMinutes] of [
    ['honorarios', 'a', [0, 60]],
    ['month', 'b', [150, 60]],
  ]) {
    data.itinerary.config.prioritySettings.hourPeriod = hourPeriod;
    const before = structuredClone(data);
    const state = M.stateFor(data, date, now);
    const suffix = hourPeriod === 'month' ? 'Month' : 'Honorarios';
    assert.deepEqual(
      state.pilots.map(p => p[`periodPriorMinutes${suffix}`]),
      priorMinutes,
    );

    state.requests = [
      request('q1', 'a', 'privado', 'HP1784'),
      request('q2', 'b', 'privado', 'HP1784'),
    ];
    const result = E.simulate(state);
    assert.equal(result.assignments.find(q => q.aircraft === 'HP1784').pilot, winner);
    assert.deepEqual(data, before);
  }
});

test('inspection projections use recent positive history and do not mutate real counters or logs', () => {
  const date = '2026-11-23';
  const now = '2026-11-23T08:00:00-05:00';
  const logs = [];
  for (let offset = 1; offset <= 56; offset++) {
    const day = new Date(Date.parse(`${date}T12:00:00Z`) - offset * 86400000);
    logs.push({ fecha: day.toISOString().slice(0, 10), hv: 1 });
  }
  const fleet = Object.fromEntries(E.fleet.map(([id]) => [
    id === 'HP1186' ? id : id.replace(/^HP/, 'HP_'), { status: 'operativo' },
  ]));
  fleet.HP_1784 = {
    status: 'operativo', horas_acum_50: 48, horas_acum_100: 60,
    bitacora_horas: [...structuredClone(logs), { fecha: date, hv: 99 }, { fecha: '2026-11-24', hv: 100 }],
  };
  fleet.HP_1819 = {
    status: 'operativo', horas_acum_50: 45, horas_acum_100: 60,
    bitacora_horas: structuredClone(logs),
  };
  const data = {
    fleet,
    pilotos: [{ id: 'a', nombre: 'Piloto Ficticio', email: 'a@example.test' }],
    itinerarios: [],
    school: { students: [], registry: { clients: [] } },
    itinerary: {
      version: 1,
      config: {
        prioritySettings: { aircraftMode: 'balanced', pilotMode: 'hours', hourPeriod: 'honorarios' },
        typeRules: { privado: ['HP1819', 'HP1784', 'HP1907'] },
      },
      days: {},
    },
  };
  const before = structuredClone(data);
  const state = M.stateFor(data, date, now);
  const left = state.aircraft.find(a => a.id === 'HP1784').inspectionPlan;
  const right = state.aircraft.find(a => a.id === 'HP1819').inspectionPlan;

  assert.equal(left.remaining50, 2);
  assert.equal(right.remaining50, 5);
  assert.deepEqual(left.weekdayHours, [1, 1, 1, 1, 1, 1, 1]);
  state.requests = [request('q1', 'a')];
  const stateBeforeSimulation = structuredClone(state);
  const result = E.simulate(state);

  assert.equal(result.assignments[0].aircraft, 'HP1784');
  assert.match(result.assignments[0].reason, /inspecciones próximas/);
  assert.deepEqual(state, stateBeforeSimulation);
  assert.deepEqual(data, before);
});
