'use strict';
// Isolated browser regressions: synthetic records only; no cloud/auth scripts or network.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
let browser;
before(async () => {
  browser = await chromium.launch({
    ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
});
after(async () => { await browser?.close(); });

function fixture() {
  const pilots = ['Zulu Piloto', 'álvaro Piloto', 'Beatriz Piloto'].map((nombre, i) => ({
    id: `p${i}`, authUid: `pilot-user-${i}`, nombre, email: `pilot${i}@example.test`,
    identity: `P-${i}`, numeroLicencia: `LIC-${i}`, licenseTypes: ['Instructor', 'RPA'],
    tipo: 'Instructor, RPA', instructorRatings: ['Monomotor'], rpaInstructor: true,
    instructorExpiry: '2031-01-01', rpaInstructorExpiry: '2031-02-01',
    medico: '2031-03-31', medicoClase: 'Primera',
    verificaciones: ['charter', 'instruction', 'both'].map((service, j) => ({
      id: `v${i}-${j}`, nombre: `HP${i}${j}`, modelo: 'PA 28', service,
      fecha: '2031-04-01', notes: `Original ${i}-${j}`,
    })),
  }));
  const students = ['Zulema Estudiante', 'Álvaro Estudiante', 'Beatriz Estudiante'].map((name, i) => ({
    id: `s${i}`, authUid: `student-user-${i}`, name, identity: `S-${i}`,
    email: `student${i}@example.test`, phone: `6000000${i}`, createdDate: '2026-01-01',
    stage: 'Interesado', funding: 'Propio', medicalClass: 'Segunda',
    medicalExpiry: '2031-05-31', obtainedCredentials: ['Privado'], history: [],
    courses: [{ id: `course${i}`, type: 'privado', status: 'Por iniciar',
      startDate: '2026-01-01', licenseDate: '', budgets: { matricula: 10000, material: 2000, teoria: 3000 },
      payments: [{ id: `payment${i}`, fee: 'matricula', cents: 10000, date: '2026-01-01' }], flights: [],
    }], registryFlights: [], extraPayments: [],
  }));
  const clients = ['Zulu Charter', 'Álamo Charter', 'Bravo Charter'].map((name, i) => ({
    id: `c${i}`, authUid: `client-user-${i}`, name, identity: `C-${i}`,
    email: `client${i}@example.test`, flights: [], payments: [],
  }));
  return { fleet: {}, pilotos: pilots, itinerarios: [], school: {
    version: 1, students, rates: { Simulador: { cents: 9000 } }, intakes: [], brochureUrl: '',
    registry: { entries: [], clients, destinations: [] }, paymentReceipts: [],
  } };
}
async function app(t, width = 1440) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  const errors = [];
  page.setDefaultTimeout(6000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', async d => { errors.push(d.message()); await d.dismiss(); });
  await page.route('**/*', route => route.fulfill({ body: '' }));
  await page.clock.install({ time: new Date('2026-10-19T18:00:00Z') });
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  await page.setContent(html);
  await page.evaluate(initial => {
    crypto.randomUUID ||= () => `test-${Math.random().toString(36).slice(2)}`;
    window.CLOUD_INITIAL = initial;
    window.writes = [];
    window.cloudWrite = async next => { window.writes.push(structuredClone(next)); };
    window.showCloudError = e => { throw e; };
    window.getPaymentReceivers = () => [{ uid: 'test-receiver', label: 'Receptor de prueba' }];
  }, fixture());
  for (const file of ['functions/boxes.js', 'dashboard.js', 'students.js', 'registro.js', 'pilots-ui.js', 'box-ui.js']) {
    await page.addScriptTag({ path: path.join(root, file) });
  }
  await page.addStyleTag({ path: path.join(root, 'students.css') });
  await page.evaluate(() => {
    document.getElementById('access-screen').hidden = true;
    document.getElementById('dashboard-app').hidden = false;
    pilotosTab.click();
    closeDrawer();
  });
  t.after(async () => { await page.close(); assert.deepEqual(errors, [], 'No browser errors or unexpected alerts'); });
  assert.equal(await page.evaluate(() => writes.length), 0, 'Rendering must not save anything');
  return page;
}
const snapshot = page => page.evaluate(() => structuredClone(previewData));
async function submit(page) {
  const count = await page.evaluate(() => writes.length);
  await page.locator('dialog[open] button[type=submit]').click();
  await page.waitForFunction(n => writes.length > n, count);
  await page.locator('dialog.school-dialog').waitFor({ state: 'detached' });
}
async function changeInput(page, locator, value) {
  const count = await page.evaluate(() => writes.length);
  await locator.fill(value);
  await locator.dispatchEvent('change');
  await page.waitForFunction(n => writes.length > n, count);
}
async function showPanel(page, id) {
  await page.evaluate(id => {
    document.querySelectorAll('.aircraft-panel').forEach(p => p.classList.toggle('active', p.id === id));
    closeDrawer();
  }, id);
}
async function pilotOrder(page, expected = [1, 2, 0]) {
  assert.deepEqual(await page.locator('[data-pilot-select]').evaluateAll(nodes => nodes.map(n => Number(n.dataset.pilotSelect))), expected);
  const data = await snapshot(page);
  assert.deepEqual(await page.locator('#pilotos-list input[placeholder="Nombre del piloto"]').evaluateAll(nodes => nodes.map(n => n.value)), expected.map(i => data.pilotos[i].nombre));
  assert.deepEqual(data.pilotos.map(p => p.id), ['p0', 'p1', 'p2'], 'Stored pilot order must not change');
}
function onlyPilot(before, after, index) {
  const expected = structuredClone(before);
  expected.pilotos[index] = after.pilotos[index];
  assert.deepEqual(after, expected, 'Only the selected pilot may change');
  assert.equal(after.pilotos[index].authUid, before.pilotos[index].authUid);
  assert.equal(after.pilotos[index].id, before.pilotos[index].id);
}
function onlyStudent(before, after, index) {
  const expected = structuredClone(before);
  expected.school.students[index] = after.school.students[index];
  assert.deepEqual(after, expected, 'Only the selected student may change');
  assert.equal(after.school.students[index].authUid, before.school.students[index].authUid);
  assert.equal(after.school.students[index].id, before.school.students[index].id);
}

for (const width of [1440, 390]) test(`Pilot edits preserve original indices in both views (${width}px)`, async t => {
  const page = await app(t, width);
  await pilotOrder(page);
  // Every visual position differs from the stored index. Exercise each record.
  for (const index of [1, 2, 0]) {
    await page.locator(`[data-pilot-select="${index}"]`).click();
    let before = await snapshot(page);
    await page.click('[data-pilot-action=licenses]');
    await page.fill('dialog [name=numeroLicencia]', `UPDATED-${index}`);
    await page.fill('dialog [name=instructorExpiry]', '02/01/2032');
    await page.fill('dialog [name=rpaInstructorExpiry]', '03/02/2032');
    await submit(page);
    let after = await snapshot(page);
    onlyPilot(before, after, index);
    assert.equal(after.pilotos[index].numeroLicencia, `UPDATED-${index}`);
    assert.equal(after.pilotos[index].rpaInstructorExpiry, '2032-02-03');
    const row = () => page.locator('#pilotos-list > div').filter({ has: page.locator(`input[onchange*="pilotosData[${index}].nombre"]`) });
    assert.equal(await row().locator('input[onchange*=".instructorExpiry="]').inputValue(), '02/01/2032');

    before = after;
    await page.click('[data-pilot-action=documents]');
    await page.fill('dialog [name=medico]', '02/2032');
    await submit(page);
    after = await snapshot(page);
    onlyPilot(before, after, index);
    assert.equal(after.pilotos[index].medico, '2032-02-29');
    assert.equal(await row().locator('input[onchange*=".medico="]').inputValue(), '29/02/2032');

    before = after;
    await page.click('[data-pilot-action="verification:2"]');
    await page.fill('dialog [name=fecha]', '04/04/2032');
    await page.fill('dialog [name=notes]', `Changed verification ${index}`);
    await submit(page);
    after = await snapshot(page);
    onlyPilot(before, after, index);
    assert.deepEqual(after.pilotos[index].verificaciones.slice(0, 2), before.pilotos[index].verificaciones.slice(0, 2));
    assert.equal(after.pilotos[index].verificaciones[2].fecha, '2032-04-04');
    const bothDates = () => row().locator('input[onchange*="verificaciones[2]"]');
    assert.deepEqual(await bothDates().evaluateAll(nodes => nodes.map(n => n.value)), ['2032-04-04', '2032-04-04']);
    // Edit through each service column; both are the same verification, original index 2.
    for (const [column, date] of [[0, '05/05/2033'], [1, '06/06/2033']]) {
      before = after;
      await changeInput(page, bothDates().nth(column), date);
      after = await snapshot(page);
      onlyPilot(before, after, index);
      assert.deepEqual(after.pilotos[index].verificaciones.slice(0, 2), before.pilotos[index].verificaciones.slice(0, 2));
      assert.deepEqual(await bothDates().evaluateAll(nodes => nodes.map(n => n.value)), [date.split('/').reverse().join('-'), date.split('/').reverse().join('-')]);
      assert.match(await page.locator('[data-pilot-profile] .pilot-verification').nth(2).innerText(), new RegExp(date));
    }
    for (const key of ['instructorExpiry', 'rpaInstructorExpiry', 'medico']) {
      before = after;
      await changeInput(page, row().locator(`input[onchange*=".${key}="]`), '07/07/2033');
      after = await snapshot(page);
      onlyPilot(before, after, index);
      assert.equal(after.pilotos[index][key], key === 'medico' ? '2033-07-31' : '2033-07-07');
    }
    before = after;
    await page.click('[data-pilot-action=personal]');
    await page.fill('dialog [name=celular]', `6999999${index}`);
    await submit(page);
    after = await snapshot(page);
    onlyPilot(before, after, index);
    assert.equal(after.pilotos[index].celular, `6999999${index}`);
    assert.deepEqual(after.pilotos[index].verificaciones, before.pilotos[index].verificaciones);
    await pilotOrder(page);
  }
});

test('Renaming a pilot reorders both views and immediately refreshes linked selectors', async t => {
  const page = await app(t);
  await showPanel(page, 'panel-registro');
  await page.fill('#registro-form [name=book]', 'UNSAVED-DRAFT');
  await showPanel(page, 'panel-pilotos');
  await page.click('[data-pilot-select="0"]');
  let before = await snapshot(page);
  await changeInput(page, page.locator('#pilotos-list input[onchange*="pilotosData[0].nombre"]'), 'Aarón Piloto');
  onlyPilot(before, await snapshot(page), 0);
  await pilotOrder(page, [0, 1, 2]);
  assert.equal(await page.locator('[data-pilot-select][aria-pressed=true]').getAttribute('data-pilot-select'), '0');
  assert.equal(await page.locator('#flight-pilot option[value="Aarón Piloto"]').count(), 1);
  assert.equal(await page.locator('#registro-pilots option[value="Aarón Piloto"]').count(), 1);
  assert.equal(await page.locator('#registro-pilots option[value="Zulu Piloto"]').count(), 0);
  assert.equal(await page.inputValue('#registro-form [name=book]'), 'UNSAVED-DRAFT');
  before = await snapshot(page);
  await page.click('[data-pilot-action=personal]');
  await page.fill('dialog [name=nombre]', 'Zoe Piloto');
  await submit(page);
  onlyPilot(before, await snapshot(page), 0);
  await pilotOrder(page);
  await page.fill('[data-pilot-search]', 'Beatriz');
  assert.equal(await page.locator('[data-pilot-select]').count(), 1);
  await page.click('[data-pilot-select="2"]');
  before = await snapshot(page);
  await page.click('[data-pilot-action=documents]');
  await page.fill('dialog [name=medico]', '09/2034');
  await submit(page);
  onlyPilot(before, await snapshot(page), 2);
  assert.equal((await snapshot(page)).pilotos[2].medico, '2034-09-30');
});

test('Sorted and filtered students edit only their own profile, credentials and course', async t => {
  const page = await app(t);
  await showPanel(page, 'panel-estudiantes');
  assert.deepEqual(await page.locator('#school-student-list [data-student]').evaluateAll(nodes => nodes.map(n => n.dataset.student)), ['s1', 's2', 's0']);
  for (const index of [1, 2, 0]) {
    await page.click(`#school-student-list [data-student="s${index}"]`);
    const before = await snapshot(page);
    await page.click('[data-action=edit-student]');
    await page.fill('dialog [name=phone]', `6888888${index}`);
    await page.fill('dialog [name=medicalExpiryMonth]', '02/2032');
    await page.check('dialog [name=obtainedCredential][value=IFR]');
    await submit(page);
    const after = await snapshot(page);
    onlyStudent(before, after, index);
    assert.equal(after.school.students[index].medicalExpiry, '2032-02-29');
    assert.deepEqual(after.school.students[index].obtainedCredentials, ['Privado', 'IFR']);
    assert.equal(after.school.students[index].phone, `6888888${index}`);
    assert.equal(after.school.students[index].birthDate, '', 'An absent birth date must stay empty');
    assert.equal(after.school.students[index].enrolledDate, '', 'An absent enrollment date must stay empty');
    assert.deepEqual(after.school.students[index].courses, before.school.students[index].courses);
    await page.click(`[data-action=edit-course][data-course="course${index}"]`);
    await page.fill('dialog [name=licenseNumber]', `COURSE-LIC-${index}`);
    await submit(page);
    const withCourse = await snapshot(page);
    onlyStudent(after, withCourse, index);
    assert.equal(withCourse.school.students[index].courses[0].licenseNumber, `COURSE-LIC-${index}`);
    assert.equal(withCourse.school.students[index].courses[0].licenseDate, '', 'Do not invent a license date');
    assert.equal(withCourse.school.students[index].courses[0].endDate, '', 'Do not invent a completion date');
    assert.deepEqual(withCourse.school.students[index].courses[0].payments, after.school.students[index].courses[0].payments);
  }
  await page.click('#school-student-list [data-student="s0"]');
  const before = await snapshot(page);
  await page.click('[data-action=edit-student]');
  await page.fill('dialog [name=name]', 'Aarón Estudiante');
  await submit(page);
  onlyStudent(before, await snapshot(page), 0);
  assert.deepEqual(await page.locator('#school-student-list [data-student]').evaluateAll(nodes => nodes.map(n => n.dataset.student)), ['s0', 's1', 's2']);
  await page.fill('#school-search', 'Beatriz');
  assert.equal(await page.locator('#school-student-list [data-student]').count(), 1);
  await page.click('#school-student-list [data-student="s2"]');
  assert.match(await page.locator('#school-student-profile h2').innerText(), /Beatriz/);
  assert.deepEqual((await snapshot(page)).school.students.map(s => s.id), ['s0', 's1', 's2']);
  assert.equal(await page.locator('#registro-people option[value^="Aarón Estudiante"]').count(), 1);
});

test('Sorted client cards route statements and payments to the selected client only', async t => {
  const page = await app(t);
  await showPanel(page, 'panel-estudiantes');
  await page.click('[data-action=view][data-view=clients]');
  assert.deepEqual(await page.locator('[data-action=client-statement]').evaluateAll(nodes => nodes.map(n => n.dataset.client)), ['c1', 'c2', 'c0']);
  for (const index of [1, 2, 0]) {
    const before = await snapshot(page);
    const client = before.school.registry.clients[index];
    await page.click(`[data-action=client-statement][data-client="c${index}"]`);
    assert.match(await page.locator('dialog').innerText(), new RegExp(client.name));
    await page.locator('dialog [data-close]').first().click();
    await page.locator('dialog').waitFor({ state: 'detached' });
    await page.click(`[data-action=client-payment][data-client="c${index}"]`);
    assert.match(await page.locator('dialog h3').innerText(), new RegExp(client.name));
    await page.fill('dialog [name=serviceName]', 'Chárter');
    await page.fill('dialog [name=amount]', String(100 + index));
    await submit(page);
    await page.locator('dialog [data-receipt-close]').click();
    await page.locator('dialog').waitFor({ state: 'detached' });
    const after = await snapshot(page);
    const expected = structuredClone(before);
    expected.school.registry.clients[index] = after.school.registry.clients[index];
    for (const key of ['paymentReceipts', 'lastReceiptSequence', 'paymentReceiverNames']) expected.school[key] = after.school[key];
    assert.deepEqual(after, expected, 'Payment must not change any other person or registry entry');
    const receipt = after.school.paymentReceipts.at(-1);
    assert.equal(receipt.personKey, `client:c${index}`);
    assert.equal(receipt.personName, client.name);
    assert.equal(after.school.registry.clients[index].payments.at(-1).receiptId, receipt.id);
    assert.equal(receipt.totalCents, (100 + index) * 100);
  }
  assert.deepEqual((await snapshot(page)).school.registry.clients.map(c => c.id), ['c0', 'c1', 'c2']);
});

test('Linked flight corrections preserve person/course IDs after alphabetical selection', async t => {
  const page = await app(t);
  // Build consistent synthetic registry/ledger pairs with the real preparation function.
  await page.evaluate(() => {
    previewData.school.students[2].courses[0].type = 'ifr';
    for (const kind of ['student', 'client']) for (const i of [0, 1, 2]) {
      const person = kind === 'student' ? previewData.school.students[i] : previewData.school.registry.clients[i];
      const result = Registro.math.prepareRegistration(previewData, {
        aircraft: 'Simulador', book: `${kind}-${i}`, date: '19/10/2026', pilot: 'Beatriz Piloto',
        person: person.name, operationType: kind === 'student' ? 'instruction' : 'charter',
        origin: 'Prueba', destinations: ['Prueba'], hours: '1.0', rate: '90.00', charge: 'on', out: '0', back: '0',
      }, `entry-${kind}-${i}`);
      previewData = result.next;
    }
    School.refresh(); Registro.refresh();
  });
  for (const kind of ['student', 'client']) for (const index of [1, 2, 0]) {
    const id = `entry-${kind}-${index}`;
    const before = await snapshot(page);
    if (kind === 'student') {
      await showPanel(page, 'panel-estudiantes');
      await page.click(`#school-student-list [data-student="s${index}"]`);
      if (index === 2) {
        await page.locator('.school-ledger summary').click();
        const linked = before.school.students[index].courses[0].flights.find(f => f.registryId === id);
        await page.click(`[data-action=void][data-kind=flights][data-entry="${linked.id}"]`);
      } else await page.click(`[data-action=registry-edit][data-entry="${id}"]`);
    } else {
      await showPanel(page, 'panel-registro');
      await page.click(`[data-edit-registry="${id}"]`);
    }
    await page.fill('dialog [name=hours]', '1.5');
    await page.fill('dialog [name=reason]', `Corrección sintética ${id}`);
    await submit(page);
    const after = await snapshot(page);
    const entryIndex = before.school.registry.entries.findIndex(e => e.id === id);
    const entry = after.school.registry.entries[entryIndex];
    const target = kind === 'student' ? after.school.students[index] : after.school.registry.clients[index];
    const flight = (entry.courseId ? target.courses.find(c => c.id === entry.courseId).flights : kind === 'student' ? target.registryFlights : target.flights).find(f => f.registryId === id);
    assert.equal(entry.courseId, kind === 'student' && index === 2 ? 'course2' : '');
    assert.equal(entry.personId, `${kind === 'student' ? 's' : 'c'}${index}`);
    assert.equal(entry.personKind, kind);
    assert.equal(entry.hours100, 150);
    assert.equal(flight.hours100, 150);
    assert.equal(flight.costCents, entry.costCents);
    const expected = structuredClone(before);
    expected.school.registry.entries[entryIndex] = entry;
    if (kind === 'student') expected.school.students[index] = target;
    else expected.school.registry.clients[index] = target;
    assert.deepEqual(after, expected, 'Only the chosen registry entry and linked ledger may change');
  }
});


test('Editing optional student/course dates never invents today as their value', async t => {
  const page = await app(t);
  // Isolate the optional-date regression from the separately tested derived-stage issue.
  await page.evaluate(() => {
    previewData.school.students.forEach(s => { s.stage = 'En formación'; });
    School.refresh();
  });
  await showPanel(page, 'panel-estudiantes');
  await page.click('#school-student-list [data-student="s1"]');
  const before = await snapshot(page);
  await page.click('[data-action=edit-student]');
  assert.equal(await page.inputValue('dialog [name=birthDate]'), '');
  assert.equal(await page.inputValue('dialog [name=enrolledDate]'), '');
  await page.fill('dialog [name=phone]', 'TEST-PHONE');
  await submit(page);
  onlyStudent(before, await snapshot(page), 1);
  await page.click('[data-action=edit-course][data-course="course1"]');
  assert.equal(await page.inputValue('dialog [name=endDate]'), '');
  assert.equal(await page.inputValue('dialog [name=licenseDate]'), '');
  await page.fill('dialog [name=licenseNumber]', 'TEST-OPTIONAL');
  await submit(page);
  const after = await snapshot(page);
  onlyStudent(before, after, 1);
  assert.equal(after.school.students[1].courses[0].licenseDate, '');
});
