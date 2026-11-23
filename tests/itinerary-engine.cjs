Warning: truncated output (original token count: 10439)
Total output lines: 526

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
test('competing pilots follow priorities while the last unopposed request keeps its aircraft',()=>{
 const s=base();s.requests=['a','b','c'].map((p,i)=>request('q'+(i+1),p));
 const r=H.simulate(s);assert.equal(assigned(r).length,3);
 assert.ok(assigned(r).every(q=>['HP1784','HP1819','HP1907'].includes(q.assignedAircraft)));
 assert.equal(assigned(r).find(q=>q.id==='q3').assignedAircraft,'HP1907');
 for(let i=0;i<r.assignments.length;i++)for(let j=i+1;j<r.assignments.length;j++){const a=r.assignments[i],b=r.assignments[j];if(a.aircraft===b.aircraft||a.pilot===b.pilot)assert.equal(H.overlaps(a,b),false);}
});
test('IFR never assigned outside HP1579 and HP1815',()=>{
 const s=base();s.requests=['a','b','c'].map((p,i)=>request('q'+(i+1),p,'ifr'));
 const r=H.simulate(s);assert.equal(assigned(r).length,3);
 assert.ok(assigned(r).every(q=>['HP1579','HP1815'].includes(q.assignedAircraft)));
 for(let i=0;i<r.assignments.length;i++)for(let j=i+1;j<r.assignments.length;j++){const a=r.assignments[i],b=r.assignments[j];if(a.aircraft===b.aircraft||a.pilot===b.pilot)assert.equal(H.overlaps(a,b),false);}
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
 const r=H.simulate(s);assert.equal(assigned(r).length,4);
 assert.ok(assigned(r).every(q=>['HP1819','HP1907','HP1784'].includes(q.assignedAircraft)));
 for(let i=0;i<r.assignments.length;i++)for(let j=i+1;j<r.assignments.length;j++){const a=r.assignments[i],b=r.assignments[j];if(a.aircraft===b.aircraft||a.pilot===b.pilot)assert.equal(H.overlaps(a,b),false);}
});
test('restricted flights considered before general flights to preserve their equipment',()=>{
 const s=base();s.typeRules.ifr=['HP1815','HP1579'];s.typeRules.privado=['HP1815','HP1784','HP1819'];
 s.requests=[request('q1','a'),request('q2','c','ifr')];
 const r=H.simulate(s);assert.equal(r.results.find(q=>q.id==='q2').status,'assigned');
 assert.ok(r.results.find(q=>q.id==='q2').assignedAircraft==='HP1815'||r.results.find(q=>q.id==='q2').assignedAircraft==='HP1579');
 assert.equal(r.results.find(q=>q.id==='q1').status,'assigned');
 for(let i=0;i<r.assignments.length;i++)for(let j=i+1;j<r.assignments.length;j++){const a=r.assignments[i],b=r.assignments[j];if(a.aircraft===b.aircraft||a.pilot===b.pilot)assert.equal(H.overlaps(a,b),false);}
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
 const s=base();s.aircraft.find(a=>a.id==='HP1784').idleDays=3;s.requests=[request('q1','a')];
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
 const s=base();s.aircraft.find(a=>a.id==='HP1784').idleDays=3;s.requests=[{...request('q1','a'),end:'08:00'},{...request('q2','b'),start:'08:00'}];
 const r=H.simulate(s);assert.equal(assigned(r).length,2);assert.equal(new Set(assigned(r).map(q=>q.assignedAircraft)).size,2);
 assert.deepEqual(assigned(r).map(q=>[q.start,q.end]),[['06:30','08:00'],['08:00','09:30']]);
});
test('whole long reservation blocks intersecting flight on aircraft and pilot',()=>{
 const s=base();s.requests=[{...request('q1','a'),end:'12:30'},{...request('q2','b'),start:'09:30',end:'12:30'},{...request('q3','a'),star…5439 tokens truncated…hedules,'2026-10-29T20:00:00-05:00');
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
test('manual-review reasons explain category restrictions even when compatible aircraft are available',()=>{
 const now='2026-10-29T20:30:00-05:00';
 for(const row of [
  {aircraft:'HP880BL',alternative:'HP18BLM',reason:'Multimotor: la asignación se conserva y requiere revisión manual del Director; no se reasigna automáticamente.'},
  {aircraft:'HP11BL',alternative:'HP_TEST_HELI',reason:'Helicóptero: la asignación se conserva y requiere revisión manual del Director; no se reasigna automáticamente.'}
 ]){
  const s=base();s.published=true;const source=s.aircraft.find(a=>a.id===row.aircraft);source.status='grounded';
  let alternative=s.aircraft.find(a=>a.id===row.alternative);
  if(!alternative){alternative={...structuredClone(source),id:row.alternative,status:'operativo'};s.aircraft.push(alternative);}
  s.typeRules.socio=[...new Set([...s.typeRules.socio,alternative.id])];
  const flight={...request('q1','d','socio',row.aircraft),fixed:true,socioName:'Vuelo ficticio'};
  assert.equal(H.compatible(s,flight,alternative),true);assert.equal(H.flightAvailable(alternative,flight,s.date),true);
  s.confirmed=[flight];const original=structuredClone(flight),r=H.reallocatePublished(s,row.aircraft,'operativo',now);
  assert.equal(r.changes[0].kind,'review');assert.equal(r.changes[0].reason,row.reason);
  assert.deepEqual(r.changes[0].before,original);assert.equal(r.changes[0].after.aircraft,row.aircraft);
  assert.equal(r.flights[0].aircraft,row.aircraft);assert.equal(r.flights[0].pilot,original.pilot);
  assert.equal(r.flights[0].conditional,true);assert.equal(r.flights[0].relocationPending,true);
  assert.equal(Object.hasOwn(r.flights[0],'relocation'),false);
 }
 const mono=base();mono.published=true;mono.aircraft.find(a=>a.id==='HP1579').status='grounded';mono.aircraft.find(a=>a.id==='HP1815').status='mantenimiento';
 mono.confirmed=[{...request('q2','c','ifr','HP1579'),fixed:true}];
 const blocked=H.reallocatePublished(mono,'HP1579','operativo',now);
 assert.equal(blocked.changes[0].kind,'review');
 assert.equal(blocked.changes[0].reason,'Sin aeronave operativa compatible y libre en el mismo horario.');
 assert.equal(blocked.flights[0].aircraft,'HP1579');
});
test('relocation cannot alter history, begin before publication or repeat an unchanged status',()=>{
 const s=base();s.aircraft.find(a=>a.id==='HP1907').status='grounded';s.confirmed=[{...request('q1','a'),fixed:true}];
 assert.equal(H.reallocatePublished(s,'HP1907','operativo','2026-10-29T20:30:00-05:00').changes.length,0);
 s.published=true;assert.equal(H.reallocatePublished(s,'HP1907','grounded','2026-10-29T20:30:00-05:00').changes.length,0);
 assert.equal(H.reallocatePublished(s,'HP1907','operativo','2026-10-30T10:00:00-05:00').changes.length,0);
 const active=H.reallocatePublished(s,'HP1907','operativo','2026-10-30T07:00:00-05:00');assert.equal(active.changes[0].kind,'review');assert.equal(active.flights[0].aircraft,'HP1907');
});
