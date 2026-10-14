const assert=require('node:assert/strict'),v=require('../functions/pilot-validity');
assert.equal(v.monthEnd('02/2028'),'2028-02-29');assert.equal(v.monthEnd('02/2027'),'2027-02-28');assert.equal(v.monthEnd('2026-12'),'2026-12-31');assert.equal(v.monthEnd('13/2026'),'');
const p={nombre:'Ana',instructorExpiry:'2026-11-30'};
for(const [date,level]of [['2026-10-30','ok'],['2026-10-31','warn'],['2026-11-25','orange']])assert.equal(v.alerts(p,'','',Date.parse(date+'T17:00:00Z'))[0].level,level);
assert.equal(v.alerts(p,'','',Date.parse('2026-11-30T17:00:59Z'))[0].level,'orange');assert.equal(v.alerts(p,'','',Date.parse('2026-11-30T17:01:00Z'))[0].level,'danger');
assert.throws(()=>v.assertAssignment([p],['Ana'],'2026-11-30','12:01'),/No se puede asignar/);v.assertAssignment([p],['Ana'],'2026-11-30','12:00');
assert.throws(()=>v.validateChanges({pilotos:[p],itinerarios:[]},{itinerarios:[{id:1,piloto:'Ana',fecha:'2026-12-01',horaInicio:'08:00'}]}),/No se puede asignar/);
assert.throws(()=>v.validateChanges({pilotos:[p],school:{registry:{entries:[]}}},{school:{registry:{entries:[{id:1,copilot:'Ana',date:'2026-12-01'}]}}}),/No se puede asignar/);
console.log('PASS leap months, yellow/orange boundaries, Panama noon cutoff, schedule and copilot enforcement');
