const test=require('node:test'),assert=require('node:assert/strict'),H={...require('../functions/itinerary-engine'),initial:require('./fixtures/itinerary-initial.cjs')};
const base=()=>{const s=H.initial();s.requests=[];s.confirmed=[];return s;};
const request=(id,pilot,type='general',aircraft='HP1907',slot='b1')=>({id,pilot,flightType:type,aircraft,slot,start:'06:30',end:'09:30',created:Number(id.slice(1))||1});
const assigned=r=>r.results.filter(q=>q.status==='assigned');
test('HP1907 restrictions and forecast boundaries are respected with solo priorities',()=>{
 for(const status of ['grounded','mantenimiento'])for(const row of [
  {release:undefined,tail:'HP1784'},
  {release:{enabled:false,date:'2026-10-30',from:'06:30'},tail:'HP1784'},
  {release:{enabled:true,date:'2026-10-31',from:'06:30'},tail:'HP1784'},
  {release:{enabled:true,date:'2026-10-30',from:'25:00'},tail:'HP1784'},
  {release:{enabled:true,date:'2026-10-30',from:'06:31'},tail:'HP1784'},
  {release:{enabled:true,date:'2026-10-30',from:'06:30'},tail:'HP1907'},
  {release:{enabled:true,date:'2026-10-30',from:'06:29'},tail:'HP1907'}
 ]){
  const s=base();s.aircraft.find(a=>a.id==='HP1819').status='grounded';
  const a=s.aircraft.find(a=>a.id==='HP1907');a.status=status;a.release=structuredClone(row.release);
  s.requests=[request('q1','a','solo')];const before=structuredClone(s),r=H.simulate(s);
  assert.equal(assigned(r)[0].assignedAircraft,row.tail,JSON.stringify({status,...row}));
  assert.equal(assigned(r)[0].conditional,row.tail==='HP1907');assert.deepEqual(s,before);
 }
});
test('predetermined hours remain editable; overlaps rejected',()=>{
 const a=H.initial().aircraft[0];
 assert.deepEqual(a.slots.map(x=>x.start+'-'+x.end),['06:30-09:30','09:30-12:30','12:30-15:30','15:30-18:30','18:30-20:00']);
 assert.equal(H.validateSlots(a.slots,false),'');
 a.slots[0].start='07:00';assert.equal(H.validateSlots(a.slots,false),'');
 a.slots[0].end='10:00';assert.match(H.validateSlots(a.slots,false),/superponen/);
 a.slots[0].end='09:30';a.slots[4].start='18:00';assert.equal(H.validateSlots(a.slots,false),'');assert.match(H.validateSlots(a.slots,true),/superponen/);
});
test('requests require operational aircraft and director-enabled night block',()=>{
 const s=base(),q=request('q1','a');const a=s.aircraft.find(a=>a.id===q.aircraft);
 a.status='mantenimiento';assert.match(H.requestError(s,q),/operativa/);
 a.status='operativo';Object.assign(q,{slot:'b5',start:'18:30',end:'20:00'});
 assert.match(H.requestError(s,q),/habilitado/);a.night=true;assert.equal(H.requestError(s,q),'');
});
test('all pilots choosing same aircraft are redistributed by priority without consent flag',()=>{
 const s=base();s.requests=['a','b','c'].map((p,i)=>request('q'+(i+1),p));
 const r=H.simulate(s);assert.equal(assigned(r).length,3);
 assert.deepEqual(assigned(r).map(q=>q.assignedAircraft),['HP1784','HP1819','HP1815']);
 for(const q of assigned(r))assert.equal(q.aircraft,'HP1907');
});
test('IFR never assigned outside HP1579 and HP1815',()=>{
 const s=base();s.requests=['a','b','c'].map((p,i)=>request('q'+(i+1),p,'ifr'));
 const r=H.simulate(s);assert.equal(assigned(r).length,2);
 assert.deepEqual(new Set(assigned(r).map(q=>q.assignedAircraft)),new Set(['HP1579','HP1815']));
 assert.equal(r.results.find(q=>q.status==='waiting').pilot,'c');
 for(const a of s.aircraft.filter(a=>['HP1579','HP1815'].includes(a.id)))a.status='grounded';
 const blocked=H.simulate(s);assert.equal(assigned(blocked).length,0);assert.ok(blocked.results.every(q=>q.status==='waiting'));
});
test('IFR follows director priorities within allowed list',()=>{
 const s=base();s.requests=[request('q1','a','ifr')];
 assert.equal(assigned(H.simulate(s))[0].assignedAircraft,'HP1579');
 s.typeRules.ifr=['HP1815','HP1579'];
 assert.equal(assigned(H.simulate(s))[0].assignedAircraft,'HP1815');
});
test('solo always tries HP1819 then HP1907 and HP1784 last despite global ranks',()=>{
 const s=base();s.requests=[request('q1','a','solo','HP1579')];
 assert.equal(assigned(H.simulate(s))[0].assignedAircraft,'HP1819');
 s.aircraft.find(a=>a.id==='HP1819').status='mantenimiento';
 assert.equal(assigned(H.simulate(s))[0].assignedAircraft,'HP1907');
 s.aircraft.find(a=>a.id==='HP1907').status='grounded';
 assert.equal(assigned(H.simulate(s))[0].assignedAircraft,'HP1784');
 s.aircraft.find(a=>a.id==='HP1784').status='grounded';
 assert.equal(H.simulate(s).results[0].status,'waiting');
});
test('simultaneous solo requests fill three permitted aircraft, then wait',()=>{
 const s=base();s.requests=['a','b','c','d'].map((p,i)=>request('q'+(i+1),p,'solo','HP1579'));
 const r=H.simulate(s);assert.equal(assigned(r).length,3);
 assert.deepEqual(new Set(assigned(r).map(q=>q.assignedAircraft)),new Set(['HP1819','HP1907','HP1784']));
 assert.equal(r.results.filter(q=>q.status==='waiting').length,1);
});
test('restricted flights considered before general flights to preserve their equipment',()=>{
 const s=base();s.typeRules.ifr=['HP1815','HP1579'];s.typeRules.privado=['HP1815','HP1784','HP1819'];
 s.requests=[request('q1','a'),request('q2','c','ifr')];
 const r=H.simulate(s);assert.equal(r.results.find(q=>q.id==='q2').assignedAircraft,'HP1815');
 assert.notEqual(r.results.find(q=>q.id==='q1').assignedAircraft,'HP1815');
});
test('HP880BL stays fixed within its requested aircraft category',()=>{
 const s=base();s.requests=[request('q1','a','multi','HP880BL')];
 const a=assigned(H.simulate(s))[0];assert.equal(s.aircraft.find(x=>x.id===a.assignedAircraft).category,'Multimotor');
});
test('only operative compatible aircraft and valid pilots assigned at cutoff',()=>{
 const s=base();s.requests=[request('q1','a')];s.aircraft.find(a=>a.id==='HP1907').status='grounded';s.aircraft[0].status='grounded';
 const r=H.simulate(s);assert.equal(assigned(r)[0].assignedAircraft,'HP1819');
 s.pilots.find(p=>p.id==='a').valid=false;assert.equal(H.simulate(s).results[0].status,'review');
});
test('destination pilot priority then oldest request decides tied candidates',()=>{
 const s=base();s.requests=[request('q1','a'),request('q2','b')];s.aircraft[0].pilots=['b','a'];
 assert.equal(assigned(H.simulate(s)).find(q=>q.assignedAircraft==='HP1784').pilot,'b');
 s.aircraft[0].pilots=[];assert.equal(assigned(H.simulate(s)).find(q=>q.assignedAircraft==='HP1784').pilot,'a');
});
test('time edits keep exact requested interval and invalidate old requests',()=>{
 const s=base();s.requests=[request('q1','a')];
 s.aircraft.find(a=>a.id==='HP1907').slots[0].start='07:00';
 assert.equal(H.simulate(s).results[0].status,'review');
 s.requests[0].start='07:00';
 const r=H.simulate(s);assert.equal(assigned(r)[0].assignedAircraft,'HP1784');
 assert.equal(assigned(r)[0].start,'07:00');
 s.aircraft[0].slots[0].start='07:00';assert.equal(assigned(H.simulate(s))[0].assignedAircraft,'HP1784');
});
test('confirmed flights, pilot conflicts, cancellations and max blocks remain protected',()=>{
 const s=H.initial(),snapshot=JSON.stringify(s),r=H.simulate(s);
 assert.deepEqual(H.simulate(s),r);assert.equal(JSON.stringify(s),snapshot);assert.equal(assigned(r).length,9);
 assert.equal(r.results.find(q=>q.id==='q6').assignedAircraft,'HP880BL');
 assert.deepEqual(r.assignments.filter(q=>q.fixed),s.confirmed);
 for(let i=0;i<r.assignments.length;i++)for(let j=i+1;j<r.assignments.length;j++){const a=r.assignments[i],b=r.assignments[j];if(a.aircraft===b.aircraft||a.pilot===b.pilot)assert.equal(H.overlaps(a,b),false)}
 s.cancelled.push('q9');s.maxBlocks=1;const limited=H.simulate(s);
 assert.ok(!limited.results.some(q=>q.id==='q9'));
 for(const p of s.pilots)assert.ok(limited.assignments.filter(q=>q.pilot===p.id).length<=Math.max(1,s.confirmed.filter(q=>q.pilot===p.id).length));
});
test('invalid flight types and unsupported category requests rejected',()=>{
 const s=base();assert.match(H.requestError(s,{...request('q1','a'),flightType:'unknown'}),/tipo de vuelo/);
 assert.match(H.requestError(s,request('q1','a','ifr','HP1186')),/monomotor/);
});

test('pilots can shorten a block or reserve across adjacent blocks',()=>{
 const s=base();const q=request('q1','a');q.start='07:15';q.end='08:45';
 assert.equal(H.requestError(s,q),'');s.requests=[q];let r=H.simulate(s);
 assert.equal(assigned(r)[0].start,'07:15');assert.equal(assigned(r)[0].end,'08:45');
 q.start='06:30';q.end='12:30';assert.equal(H.requestError(s,q),'');r=H.simulate(s);
 assert.deepEqual(r.assignments[0].coveredSlots,['b1','b2']);
});
test('short adjacent flights share a base block without overlap',()=>{
 const s=base();s.requests=[{...request('q1','a'),end:'08:00'},{...request('q2','b'),start:'08:00'}];
 const r=H.simulate(s);assert.equal(assigned(r).length,2);assert.ok(assigned(r).every(q=>q.assignedAircraft==='HP1784'));
});
test('whole long reservation blocks intersecting flight on aircraft and pilot',()=>{
 const s=base();s.requests=[{...request('q1','a'),end:'12:30'},{...request('q2','b'),start:'09:30',end:'12:30'},{...request('q3','a'),start:'10:00',end:'11:00'}];
 const r=H.simulate(s);assert.equal(r.results.find(q=>q.id==='q3').status,'waiting');
 assert.notEqual(r.results.find(q=>q.id==='q2').assignedAircraft,'HP1784');
});
test('gaps, invalid intervals and disabled night cannot be booked',()=>{
 const s=base(),a=s.aircraft.find(a=>a.id==='HP1907'),q=request('q1','a');
 a.slots[1].start='10:00';q.end='11:00';assert.match(H.requestError(s,q),/huecos/);
 q.start='09:00';q.end='08:00';assert.match(H.requestError(s,q),/posterior/);
 q.start='17:00';q.end='19:00';assert.notEqual(H.requestError(s,q),'');
 a.slots[1].start='09:30';a.night=true;assert.equal(H.requestError(s,q),'');
});
test('confirmed flight conflicts checked against actual custom interval',()=>{
 const s=base(),q=request('q1','a');s.confirmed=[{id:'existing',aircraft:'HP1907',pilot:'b',start:'10:00',end:'11:00',fixed:true}];
 q.end='10:30';assert.match(H.requestError(s,q),/cruza/);
 q.end='10:00';assert.equal(H.requestError(s,q),'');
});
test('forecast is date specific, preserves maintenance state, and rejects early starts',()=>{
 const s=base(),a=s.aircraft.find(a=>a.id==='HP1930');assert.equal(H.bookable(a,s.date),false);
 a.release={enabled:true,date:s.date,from:'11:00'};assert.equal(H.bookable(a,s.date),true);
 assert.equal(H.bookable(a,'2026-10-31'),false);assert.equal(a.status,'mantenimiento');
 const q={...request('q1','a','general','HP1930','b2'),start:'10:59',end:'12:30'};
 assert.match(H.requestError(s,q),/habilitación/);q.start='11:00';assert.equal(H.requestError(s,q),'');
 a.rank=0;s.typeRules.privado=['HP1930','HP1784'];s.requests=[q];const r=H.simulate(s);assert.equal(assigned(r)[0].assignedAircraft,'HP1930');assert.equal(assigned(r)[0].conditional,true);
 assert.equal(a.status,'mantenimiento');
 a.status='operativo';assert.equal(assigned(H.simulate(s))[0].conditional,false);
});
test('forecast cannot cover a request starting before its threshold after redistribution',()=>{
 const s=base(),a=s.aircraft.find(a=>a.id==='HP1930');a.rank=0;a.release={enabled:true,date:s.date,from:'11:00'};
 s.requests=[{...request('q1','a'),start:'10:30',end:'12:30'}];
 assert.notEqual(assigned(H.simulate(s))[0].assignedAircraft,'HP1930');
});
test('Panama reservation window boundaries and next-day-only access',()=>{
 const s=base(),q=request('q1','a');
 s.now='2026-10-29T12:00:00-05:00';assert.match(H.requestError(s,q),/cerradas/);
 s.now='2026-10-29T12:01:00-05:00';assert.equal(H.requestError(s,q),'');
 s.now='2026-10-29T19:59:59-05:00';assert.equal(H.requestError(s,q),'');
 s.now='2026-10-29T20:00:00-05:00';assert.match(H.requestError(s,q),/cerradas/);
 s.now='2026-10-29T18:00:00-05:00';s.date='2026-10-31';assert.match(H.requestError(s,q),/mañana/);
 assert.deepEqual(H.panamaClock('2026-11-01T01:00:00Z'),{date:'2026-10-31',time:'20:00',tomorrow:'2026-11-01'});
});
test('published schedule stops pilot edits while director can edit any date or time of day',()=>{
 const s=base(),q=request('q1','a');s.published=true;assert.match(H.requestError(s,q),/publicado/);
 s.date='2027-08-14';s.now='2026-10-29T23:00:00-05:00';assert.equal(H.directorFlightError(s,q),'');
 s.confirmed=[{...q,id:'edit-me',fixed:true}];
 assert.equal(H.directorFlightError(s,{...q,start:'07:00',end:'10:00'},'edit-me'),'');
 s.confirmed.push({id:'other',aircraft:'HP1907',pilot:'b',start:'09:30',end:'12:30'});
 assert.match(H.directorFlightError(s,{...q,start:'07:00',end:'10:00'},'edit-me'),/cruza/);
});

test('pilot selection is exactly all monomotors plus HP880BL',()=>{
 const s=base();assert.deepEqual(s.aircraft.filter(H.pilotCanRequest).map(a=>a.id),['HP1784','HP1819','HP1930','HP1815','HP1579','HP1907','HP880BL']);
 for(const id of ['HP18BLM','HP1186','HP1805BLM','HP11BL']){
  const a=s.aircraft.find(a=>a.id===id);a.status='operativo';
  const q=request('q1','d','general',id);assert.match(H.requestError(s,q),/director o administrativo/);
  s.requests=[q];assert.equal(assigned(H.simulate(s)).length,0);assert.equal(H.simulate(s).results[0].status,'review');
 }
});
test('administrative may manually schedule only multi and helicopters; director any aircraft',()=>{
 const s=base();s.typeRules.privado=s.aircraft.map(a=>a.id);for(const a of s.aircraft){a.status='operativo';const q=request('q1','d','general',a.id);
  assert.equal(H.directorFlightError(s,q,undefined,'director'),'');
  if(a.category==='Monomotor')assert.match(H.directorFlightError(s,q,undefined,'admin'),/cargo/);
  else assert.equal(H.directorFlightError(s,q,undefined,'admin'),'');
  assert.match(H.directorFlightError(s,q,undefined,'pilot'),/cargo/);
 }
});
test('only monomotors ever enter automatic aircraft priority order',()=>{
 const s=base();s.aircraft.find(a=>a.id==='HP880BL').rank=-10;s.aircraft.find(a=>a.id==='HP11BL').rank=-20;
 for(const type of ['general','ifr','solo'])assert.ok(H.aircraftOrder(s,type).every(a=>a.category==='Monomotor'));
});
test('HP880BL keeps exact plane, pilot and times regardless of pilot or fleet priorities',()=>{
 const s=base();const q={...request('q1','b','multi','HP880BL'),start:'07:10',end:'10:20'};
 s.requests=[q];s.aircraft.find(a=>a.id==='HP880BL').pilots=['a','d','c','b'];
 const r=H.simulate(s);assert.equal(assigned(r)[0].assignedAircraft,'HP880BL');
 const flight=r.assignments[0];assert.equal(flight.pilot,q.pilot);assert.equal(flight.start,q.start);assert.equal(flight.end,q.end);assert.equal(flight.protected,true);
 s.aircraft.find(a=>a.id==='HP880BL').status='grounded';
 const invalid=H.simulate(s);assert.equal(assigned(invalid).length,0);assert.equal(invalid.results[0].aircraft,'HP880BL');
});
test('HP880BL fixed reservation is protected from simultaneous mono priority allocation',()=>{
 const s=base();s.requests=[request('q1','a','general','HP1907'),request('q2','a','multi','HP880BL')];
 const r=H.simulate(s);assert.equal(r.results.find(q=>q.id==='q2').assignedAircraft,'HP880BL');assert.equal(r.results.find(q=>q.id==='q1').status,'waiting');
});
test('two HP880BL requests are accepted for manual review without automatic reassignment',()=>{
 const s=base(),first=request('q1','a','multi','HP880BL'),second=request('q2','b','multi','HP880BL');
 s.requests=[first];assert.equal(H.requestError(s,second),'');assert.equal(H.competingRequests(s,second).length,1);
 s.requests.push(second);const r=H.simulate(s);assert.equal(assigned(r).length,0);
 for(const row of r.results){assert.equal(row.status,'review');assert.equal(row.aircraft,'HP880BL');assert.equal(row.start,'06:30');}
});
test('manual multi and helicopter flights are published unchanged and protect pilot occupancy',()=>{
 const s=base();s.confirmed=[
 {id:'manual-multi',aircraft:'HP1186',pilot:'a',start:'06:30',end:'10:00',flightType:'general',fixed:true},
 {id:'manual-heli',aircraft:'HP11BL',pilot:'d',start:'08:00',end:'09:00',flightType:'general',fixed:true}
 ];s.requests=[request('q1','a'),{...request('q2','d'),start:'08:00',end:'10:00'}];
 const before=structuredClone(s.confirmed),r=H.simulate(s);
 assert.deepEqual(r.assignments,before);assert.ok(r.results.every(q=>q.status==='waiting'));
});

test('nine requested flight types are available in the specified order',()=>{
 assert.deepEqual(Object.values(H.flightTypes).map(t=>t.label),['Privado','Vuelo solo','XC','Maniobras comercial','IFR','Multi','Grob','Chárter','Socio']);
});
test('director per-type assignments constrain automatic monomotor selection',()=>{
 const s=base();s.typeRules.privado=['HP1907'];s.requests=[request('q1','a','privado','HP1784')];
 assert.equal(assigned(H.simulate(s))[0].assignedAircraft,'HP1907');
 s.typeRules.xc=['HP1819'];s.requests=[request('q1','a','xc','HP1784')];assert.equal(assigned(H.simulate(s))[0].assignedAircraft,'HP1819');
 s.typeRules.ifr=['HP1579'];s.requests=[request('q1','a','ifr','HP1784')];assert.equal(assigned(H.simulate(s))[0].assignedAircraft,'HP1579');
});
test('selecting Multi pins HP880BL even when a mono block was initially selected',()=>{
 const s=base(),q={...request('q1','a','multi','HP1784'),studentId:'st1'};
 assert.equal(H.requestError(s,q),'');const n=H.normalizeRequest(s,q);
 assert.equal(n.aircraft,'HP880BL');assert.equal(n.preferredAircraft,'HP1784');assert.equal(n.studentId,'st1');
 s.requests=[q];const r=H.simulate(s);assert.equal(assigned(r)[0].assignedAircraft,'HP880BL');assert.equal(r.assignments[0].studentId,'st1');assert.equal(r.assignments[0].protected,true);
});
test('Grob always assigns HP1930 and never substitutes another plane when unavailable',()=>{
 const s=base(),q=request('q1','a','grob','HP1784');s.aircraft.find(a=>a.id==='HP1930').status='operativo';
 assert.equal(H.requestError(s,q),'');s.requests=[q];assert.equal(assigned(H.simulate(s))[0].assignedAircraft,'HP1930');
 s.aircraft.find(a=>a.id==='HP1930').status='mantenimiento';assert.notEqual(H.requestError(s,q),'');assert.equal(assigned(H.simulate(s)).length,0);
});
test('director can change Multi and Grob lists without expanding pilot permissions',()=>{
 const s=base();s.typeRules.multi=['HP1186'];s.typeRules.grob=['HP1907'];
 assert.deepEqual(H.allowedForType(s,'multi'),['HP1186']);assert.deepEqual(H.allowedForType(s,'grob'),['HP1907']);
 assert.notEqual(H.requestError(s,request('q1','a','multi','HP880BL')),'');
 assert.notEqual(H.requestError(s,request('q1','a','multi','HP1784')),'');
 assert.equal(H.directorFlightError(s,request('q1','a','multi','HP1186')),'');
 s.requests=[request('q1','a','grob','HP1784')];assert.equal(assigned(H.simulate(s))[0].assignedAircraft,'HP1907');
});
test('student optional and preserved throughout automatic aircraft reassignment',()=>{
 const s=base(),q={...request('q1','a','privado','HP1907'),studentId:''};
 assert.equal(H.requestError(s,q),'');q.studentId='st2';assert.equal(H.requestError(s,q),'');s.requests=[q];
 const r=H.simulate(s);assert.equal(r.assignments[0].aircraft,'HP1784');assert.equal(r.assignments[0].studentId,'st2');assert.equal(r.results[0].studentId,'st2');
 q.studentId='missing';assert.match(H.requestError(s,q),/estudiante/);
});


test('configuration offers whole fleet except Multi and Charter category restrictions',()=>{
 const s=base();for(const type of Object.keys(H.flightTypes)){
 const offered=H.typeConfigAircraft(s,type);
 if(type==='multi')assert.deepEqual(offered.map(a=>a.id),['HP880BL','HP18BLM','HP1186','HP1805BLM']);
 else if(type==='charter')assert.deepEqual(offered.map(a=>a.id),['HP880BL','HP18BLM','HP1186','HP1805BLM','HP11BL']);
 else assert.deepEqual(offered,s.aircraft);
 }
 s.typeRules.multi=['HP1784','HP1186','HP11BL'];assert.deepEqual(H.allowedForType(s,'multi'),['HP1186']);
 s.typeRules.charter=['HP1784','HP11BL'];assert.deepEqual(H.allowedForType(s,'charter'),['HP11BL']);
});
test('each monomotor type uses its own ordered list before global aircraft rank',()=>{
 const s=base();for(const type of ['privado','solo','xc','maniobras','ifr','grob','socio']){
 s.typeRules[type]=['HP1907','HP1784'];s.requests=[{...request('q1','a',type,'HP1819'),socioName:'Socio de prueba'}];
 assert.equal(assigned(H.simulate(s))[0].assignedAircraft,'HP1907');
 s.typeRules[type].reverse();assert.equal(assigned(H.simulate(s))[0].assignedAircraft,'HP1784');
 }
});
test('nonmono priority entries never allow automatic cross-category reassignment',()=>{
 const s=base();s.aircraft.forEach(a=>a.status='operativo');s.typeRules.privado=['HP1186','HP11BL','HP1907'];s.requests=[request('q1','a','privado','HP1784')];
 assert.equal(assigned(H.simulate(s))[0].assignedAircraft,'HP1907');
 s.typeRules.privado=['HP1186','HP11BL'];assert.equal(assigned(H.simulate(s)).length,0);
});
test('Charter is director-only on multi or helicopter and immutable in automatic closure',()=>{
 const s=base();s.aircraft.forEach(a=>a.status='operativo');
 for(const id of ['HP1784','HP880BL','HP18BLM','HP1186','HP1805BLM','HP11BL']){
 const q=request('q1','d','charter',id);
 if(id==='HP1784')assert.match(H.directorFlightError(s,q),/Chárter/);else assert.equal(H.directorFlightError(s,q),'');
 assert.notEqual(H.directorFlightError(s,q,undefined,'admin'),'');assert.notEqual(H.requestError(s,q),'');
 s.requests=[q];assert.equal(H.simulate(s).results[0].status,'review');
 }
 s.requests=[];s.confirmed=[{...request('charter1','d','charter','HP11BL'),fixed:true}];
 assert.deepEqual(H.simulate(s).assignments,s.confirmed);
});
test('Socio requires name and preserves it with optional student through allocation',()=>{
 const s=base(),q={...request('q1','a','socio','HP1907'),studentId:'st1',socioName:''};
 assert.match(H.requestError(s,q),/nombre del socio/);assert.match(H.directorFlightError(s,q),/nombre del socio/);
 q.socioName='Socio de ejemplo';assert.equal(H.requestError(s,q),'');s.requests=[q];const r=H.simulate(s);
 assert.equal(r.assignments[0].socioName,'Socio de ejemplo');assert.equal(r.assignments[0].studentId,'st1');assert.equal(r.assignments[0].aircraft,'HP1784');
 q.socioName='   ';assert.equal(H.simulate(s).results[0].status,'review');
});
test('Socio on HP880BL stays fixed even if ordered below monomotors',()=>{
 const s=base(),q={...request('q1','a','socio','HP880BL'),socioName:'Socio de ejemplo'};
 assert.equal(H.requestError(s,q),'');s.requests=[q];const r=H.simulate(s);
 assert.equal(r.assignments[0].aircraft,'HP880BL');assert.equal(r.assignments[0].socioName,q.socioName);assert.equal(r.assignments[0].protected,true);
});


test('director may schedule any time on every aircraft without blocks or night checkbox',()=>{
 const s=base();s.typeRules.privado=s.aircraft.map(a=>a.id);s.aircraft.forEach(a=>{a.status='operativo';a.night=false;});
 for(const a of s.aircraft)for(const [start,end] of [['00:00','01:30'],['05:00','07:00'],['18:30','20:00'],['21:15','23:59']]){
 const q={...request('q1','d','privado',a.id),start,end,createdByRole:'director'};
 assert.equal(H.directorFlightError(s,q,undefined,'director'),'');assert.equal(H.flightAvailable(a,q,s.date),true);
 assert.notEqual(H.directorFlightError(s,q,undefined,'admin'),'');assert.notEqual(H.requestError(s,q),'');
 }
 const q={...request('q1','a','privado','HP1784'),start:'21:00',end:'22:00'};s.confirmed=[{...q,id:'taken'}];
 assert.match(H.directorFlightError(s,{...q,pilot:'b'}),/cruza/);
});
test('director may plan before forecast availability but operational eligibility stays false',()=>{
 const s=base(),a=s.aircraft.find(a=>a.id==='HP1930');a.release={enabled:true,date:s.date,from:'21:00'};
 const q={...request('q1','a','grob','HP1930'),start:'20:59',end:'23:00',createdByRole:'director'};
 assert.equal(H.directorFlightError(s,q),'');assert.equal(H.flightAvailable(a,q,s.date),false);q.start='21:00';assert.equal(H.directorFlightError(s,q),'');
 assert.equal(H.flightAvailable(a,q,s.date),true);s.confirmed=[{...q,fixed:true}];assert.deepEqual(H.simulate(s).assignments,s.confirmed);
 a.release.enabled=false;assert.equal(H.flightAvailable(a,q,s.date),false);
});


const nightFlight=(id,aircraft,pilot='a',start='18:30',end='20:00')=>({id,aircraft,pilot,start,end,flightType:'privado',createdByRole:'director',fixed:true});
test('night publication with zero or one aircraft holds night flights without touching day flights',()=>{
 const s=base(),day=nightFlight('day','HP1819','d','06:30','09:30');
 assert.equal(H.nightPublication(s,[day]).count,0);assert.deepEqual(H.nightPublication(s,[day]).blockedIds,[]);
 const flight=nightFlight('night','HP1784');const before=JSON.stringify([day,flight]);
 const p=H.nightPublication(s,[day,flight]);assert.equal(p.count,1);assert.equal(p.ready,false);assert.deepEqual(p.blockedIds,['night']);
 assert.equal(JSON.stringify([day,flight]),before);
});
test('multiple flights on the same aircraft count as one, not two',()=>{
 const s=base(),flights=[nightFlight('n1','HP1784','a','18:30','19:00'),nightFlight('n2','HP1784','b','19:00','20:00')];
 const p=H.nightPublication(s,flights);assert.equal(p.count,1);assert.deepEqual(p.blockedIds,['n1','n2']);
});
test('two assigned distinct aircraft release nocturnals across categories',()=>{
 const s=base(),flights=[nightFlight('n1','HP1784'),nightFlight('n2','HP880BL','b')];
 const p=H.nightPublication(s,flights);assert.equal(p.count,2);assert.equal(p.ready,true);assert.deepEqual(p.blockedIds,[]);
 assert.deepEqual(p.aircraft,['HP1784','HP880BL']);
});
test('pending requests, unavailable aircraft and cancelled flights do not meet the night minimum',()=>{
 const s=base(),one=nightFlight('n1','HP1784'),two=nightFlight('n2','HP1819','b');
 s.requests=[two];assert.equal(H.nightPublication(s,[one]).ready,false);
 s.aircraft.find(a=>a.id==='HP1819').status='grounded';assert.equal(H.nightPublication(s,[one,two]).count,1);
 s.aircraft.find(a=>a.id==='HP1819').status='operativo';s.cancelled.push(two.id);assert.equal(H.nightPublication(s,[one,two]).count,1);
});
test('editing or removing the second aircraft automatically rechecks the minimum',()=>{
 const s=base(),flights=[nightFlight('n1','HP1784'),nightFlight('n2','HP1819','b')];
 assert.equal(H.nightPublication(s,flights).ready,true);
 flights[1].end='18:30';flights[1].start='17:00';assert.deepEqual(H.nightPublication(s,flights).blockedIds,['n1']);
 flights.pop();assert.deepEqual(H.nightPublication(s,flights).blockedIds,['n1']);
});
test('night rule uses 18:30 boundary and preserves whole mixed and late director flights',()=>{
 assert.equal(H.isNightFlight({start:'17:00',end:'18:30'}),false);
 assert.equal(H.isNightFlight({start:'17:00',end:'18:31'}),true);
 assert.equal(H.isNightFlight({start:'21:00',end:'22:30'}),true);
 const s=base(),flights=[nightFlight('n1','HP1784','a','17:00','19:00'),nightFlight('n2','HP1819','b','21:00','22:30')];
 const before=structuredClone(flights);assert.equal(H.nightPublication(s,flights).ready,true);assert.deepEqual(flights,before);
});
test('night minimum is checked after aircraft assignment, not based on requested aircraft',()=>{
 const s=base();s.nightEnabled=true;s.aircraft.forEach(a=>a.night=true);
 s.requests=[{...request('q1','a','privado','HP1907','b5'),start:'18:30',end:'19:00'},{...request('q2','b','privado','HP1819','b5'),start:'19:00',end:'20:00'}];
 const r=H.simulate(s);assert.equal(r.assignments.length,2);assert.equal(new Set(r.assignments.map(q=>q.aircraft)).size,1);
 assert.equal(H.nightPublication(s,r.assignments).ready,false);
});

test('director plans every aircraft regardless of status without broadening other roles or changing status',()=>{
 const s=base();s.typeRules.privado=s.aircraft.map(a=>a.id);
 for(const a of s.aircraft)for(const status of ['mantenimiento','grounded','sin registrar']){
  a.status=status;a.release=null;
  const q={...request('q1','d','privado',a.id),createdByRole:'director',fixed:true};
  assert.equal(H.directorFlightError(s,q,undefined,'director'),'');
  assert.notEqual(H.directorFlightError(s,q,undefined,'admin'),'');
  assert.notEqual(H.requestError(s,q),'');
  assert.equal(a.status,status);assert.equal(a.release,null);
  assert.equal(H.flightAvailable(a,q,s.date),false);
  s.confirmed=[q];assert.deepEqual(H.simulate(s).assignments,[q]);s.confirmed=[];
 }
 const q=request('q1','d','privado','HP11BL');s.confirmed=[{...q,id:'taken'}];
 assert.match(H.directorFlightError(s,q),/cruza/);
 s.confirmed=[];s.pilots.find(p=>p.id==='d').valid=false;assert.match(H.directorFlightError(s,q),/piloto/);
});
test('director alerts begin exactly on previous Panama date and continue on flight date',()=>{
 const s=base();s.confirmed=[{...request('q1','d','charter','HP11BL'),fixed:true}];
 assert.equal(H.operationalAlerts([s],'2026-10-29T04:59:59Z').length,0);
 let alerts=H.operationalAlerts([s],'2026-10-29T05:00:00Z');
 assert.equal(alerts.length,1);assert.equal(alerts[0].when,'tomorrow');
 assert.equal(alerts[0].aircraft,'HP11BL');assert.equal(alerts[0].status,'sin registrar');
 alerts=H.operationalAlerts([s],'2026-10-30T05:00:00Z');assert.equal(alerts[0].when,'today');
 assert.equal(H.operationalAlerts([s],'2026-10-31T05:00:00Z').length,0);
});
test('forecast does not silence alerts; operational state or flight removal does',()=>{
 const s=base(),a=s.aircraft.find(a=>a.id==='HP11BL');
 s.confirmed=[{...request('q1','d','charter','HP11BL'),fixed:true}];
 a.release={enabled:true,date:s.date,from:'06:00'};
 const now='2026-10-29T18:00:00-05:00';assert.equal(H.operationalAlerts([s],now).length,1);
 a.status='operativo';assert.equal(H.operationalAlerts([s],now).length,0);
 a.status='grounded';assert.equal(H.operationalAlerts([s],now).length,1);
 s.confirmed=[];assert.equal(H.operationalAlerts([s],now).length,0);
});
test('alerts include all relevant schedule days, ignore requests and preserve input',()=>{
 const today=base(),tomorrow=base(),future=base();
 today.date='2026-10-29';future.date='2026-11-02';
 for(const day of [today,tomorrow,future])day.confirmed=[{...request('q1','d','charter','HP11BL'),fixed:true}];
 const schedules=[future,tomorrow,today],before=structuredClone(schedules);
 const alerts=H.operationalAlerts(schedules,'2026-10-29T20:00:00-05:00');
 assert.deepEqual(alerts.map(a=>a.date),['2026-10-29','2026-10-30']);
 assert.equal(new Set(alerts.map(a=>a.id)).size,2);assert.deepEqual(schedules,before);
 today.confirmed=[];tomorrow.confirmed=[];today.requests=[request('q2','a','grob','HP1930')];
 assert.equal(H.operationalAlerts(schedules,'2026-10-29T20:00:00-05:00').length,0);
});

test('director-approved request remains exact, occupies aircraft and pilot, and is never allocated twice',()=>{
 const s=base();s.requests=[{...request('q1','a'),studentId:'st1'},request('q2','b'),{...request('q3','a','privado','HP1784'),start:'07:00',end:'08:00'}];
 const before=structuredClone(s),prepared=H.prepareApproval(s,'q1');assert.equal(prepared.error,'');assert.deepEqual(s,before);
 s.confirmed.push(prepared.flight);s.requests[0].status='approved';
 const r=H.simulate(s),fixed=r.assignments.find(f=>f.sourceRequestId==='q1');
 for(const key of ['aircraft','pilot','start','end','studentId'])assert.equal(fixed[key],s.requests[0][key]);
 assert.equal(fixed.directorApproved,true);assert.equal(fixed.fixed,true);assert.equal(r.assignments.filter(f=>f.sourceRequestId==='q1'||f.id==='q1').length,1);
 assert.equal(r.results.some(q=>q.id==='q1'),false);
 assert.equal(r.assignments.some(f=>f.id==='q3'),false);
 assert.equal(r.assignments.some(f=>f.id==='q2'&&f.aircraft==='HP1907'),false);
 // Retaining the source as approved prevents a deleted or moved approval from reappearing.
 s.confirmed=[];assert.equal(H.simulate(s).assignments.some(f=>f.id==='q1'),false);
});
test('approval respects director role, publication phase, cancellation, conflicts and duplicates',()=>{
 const s=base();s.requests=[request('q1','a')];
 assert.match(H.prepareApproval(s,'q1','pilot').error,/director/);assert.match(H.prepareApproval(s,'q1','admin').error,/director/);
 s.published=true;assert.match(H.prepareApproval(s,'q1').error,/publicado/);s.published=false;
 s.cancelled.push('q1');assert.match(H.prepareApproval(s,'q1').error,/disponible/);s.cancelled=[];
 s.confirmed=[{...request('other','a','privado','HP1784'),fixed:true}];assert.match(H.prepareApproval(s,'q1').error,/cruza/);
 s.confirmed=[];s.confirmed.push(H.prepareApproval(s,'q1').flight);assert.match(H.prepareApproval(s,'q1').error,/ya fue aprobada/);
});
test('postpublication changes notify union of old/new pilot and student plus mechanics exactly once',()=>{
 const before={...request('q1','a'),studentId:'st1',date:'2026-10-30'},after={...before,aircraft:'HP1784',pilot:'b',studentId:'st2',start:'10:00',end:'11:00',date:'2026-10-31'};
 const snapshot=structuredClone([before,after]),notice=H.publishedChange(before,after,true);
 assert.equal(notice.action,'updated');assert.deepEqual(notice.recipients.map(r=>r.kind+':'+r.id),['pilot:a','student:st1','pilot:b','student:st2','group:mechanics']);
 assert.deepEqual([before,after],snapshot);assert.equal(notice.before.aircraft,'HP1907');assert.equal(notice.after.aircraft,'HP1784');
 const samePeople=H.publishedChange(before,{...before,end:'10:00'},true);assert.equal(samePeople.recipients.length,3);
 assert.equal(H.publishedChange(before,after,false),null);assert.equal(H.publishedChange(before,{...before,id:'internal-id',conditional:true},true),null);
});
test('creation and cancellation notify only actual participants, including no-student flights',()=>{
 const flight={...request('q1','a'),date:'2026-10-30'};
 const created=H.publishedChange(null,flight,true),cancelled=H.publishedChange(flight,null,true);
 assert.equal(created.action,'created');assert.equal(cancelled.action,'cancelled');
 for(const n of [created,cancelled])assert.deepEqual(n.recipients.map(r=>r.kind+':'+r.id),['pilot:a','group:mechanics']);
 assert.equal(created.before,null);assert.equal(cancelled.after,null);
});
test('daily publication announces to all and excludes withheld night flights from published count',()=>{
 const s=base();s.confirmed=[{...request('day','a','privado','HP1784'),fixed:true},nightFlight('night','HP1784')];
 const n=H.publicationNotice(s);assert.equal(n.kind,'publication');assert.equal(n.date,s.date);assert.equal(n.flightCount,1);assert.deepEqual(n.recipients,[{kind:'group',id:'all'}]);
});

test('competing mono requests are allowed, warned by actual overlap, and respect preapproval',()=>{
 const s=base(),first=request('q1','a'),second=request('q2','b');s.requests=[first];
 assert.equal(H.requestError(s,second),'');assert.equal(H.competingRequests(s,second).length,1);
 assert.equal(H.competingRequests(s,{...second,start:'09:30',end:'12:30'}).length,0);
 s.requests.push(second);const flight=H.prepareApproval(s,'q2').flight;s.confirmed.push(flight);second.status='approved';
 assert.equal(H.competingRequests(s,first).length,0);assert.match(H.requestError(s,first),/confirmado/);
 const result=H.simulate(s);assert.equal(result.assignments.find(f=>f.id===flight.id).aircraft,'HP1907');assert.notEqual(result.results.find(r=>r.id==='q1').assignedAircraft,'HP1907');
});
test('published mono status loss rehomes only future flights, preserving identity and all participants',()=>{
 const s=base();s.published=true;const a=s.aircraft.find(a=>a.id==='HP1907');a.status='mantenimiento';
 s.confirmed=[{...request('q1','a'),id:'approved-q1',sourceRequestId:'q1',studentId:'st1',fixed:true,directorApproved:true,createdByRole:'director'}];
 const before=structuredClone(s),r=H.reallocatePublished(s,'HP1907','operativo','2026-10-29T20:30:00-05:00');assert.deepEqual(s,before);
 assert.equal(r.changes.length,1);assert.equal(r.changes[0].kind,'relocated');assert.equal(r.flights[0].aircraft,'HP1784');
 for(const key of ['id','sourceRequestId','pilot','studentId','start','end','directorApproved'])assert.equal(r.flights[0][key],s.confirmed[0][key]);
 assert.equal(r.flights[0].relocation.from,'HP1907');assert.equal(H.canCancelRelocated({...s,confirmed:r.flights},r.flights[0],'a','2026-10-29T21:00:00-05:00'),true);
 assert.equal(H.canCancelRelocated(s,r.flights[0],'b','2026-10-29T21:00:00-05:00'),false);
 assert.equal(H.canCancelRelocated(s,r.flights[0],'a','2026-10-30T06:30:00-05:00'),false);
});
test('relocation respects flight type, fixed conflicts and never moves multi or helicopter',()=>{
 const s=base();s.published=true;s.aircraft.find(a=>a.id==='HP1579').status='grounded';
 s.confirmed=[{...request('q1','a','ifr','HP1579'),fixed:true},{...request('busy','b','privado','HP1815'),fixed:true}];
 let r=H.reallocatePublished(s,'HP1579','operativo','2026-10-29T20:30:00-05:00');assert.equal(r.changes[0].kind,'review');assert.equal(r.flights[0].aircraft,'HP1579');
 s.confirmed.pop();r=H.reallocatePublished(s,'HP1579','operativo','2026-10-29T20:30:00-05:00');assert.equal(r.flights[0].aircraft,'HP1815');
 for(const id of ['HP880BL','HP1186','HP11BL']){
  s.aircraft.find(a=>a.id===id).status='mantenimiento';s.confirmed=[{...request('q1','d','privado',id),fixed:true}];
  r=H.reallocatePublished(s,id,'operativo','2026-10-29T20:30:00-05:00');assert.equal(r.changes[0].kind,'review');assert.equal(r.flights[0].aircraft,id);
 }
});
test('relocation cannot alter history, begin before publication or repeat an unchanged status',()=>{
 const s=base();s.aircraft.find(a=>a.id==='HP1907').status='grounded';s.confirmed=[{...request('q1','a'),fixed:true}];
 assert.equal(H.reallocatePublished(s,'HP1907','operativo','2026-10-29T20:30:00-05:00').changes.length,0);
 s.published=true;assert.equal(H.reallocatePublished(s,'HP1907','grounded','2026-10-29T20:30:00-05:00').changes.length,0);
 assert.equal(H.reallocatePublished(s,'HP1907','operativo','2026-10-30T10:00:00-05:00').changes.length,0);
 const active=H.reallocatePublished(s,'HP1907','operativo','2026-10-30T07:00:00-05:00');assert.equal(active.changes[0].kind,'review');assert.equal(active.flights[0].aircraft,'HP1907');
});
