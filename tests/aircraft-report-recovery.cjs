'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{PREFIX,TTL,MAX_PENDING,createStore}=require('../aircraft-report-recovery');
const uid='pilot-fixture',aircraft='HP-1784',description='Vibración en el rotor de cola',at=Date.UTC(2026,10,4,12);
const id=number=>number.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111';
const key=(who,identifier)=>PREFIX+encodeURIComponent(who)+':'+identifier;
function storage(){
 const records=new Map();
 return {get length(){return records.size;},key:index=>[...records.keys()][index]??null,getItem:name=>records.get(name)??null,setItem(name,value){records.set(name,String(value));},removeItem:name=>records.delete(name)};
}
function fixture(){const local=storage();let now=at;return {local,store:who=>createStore({uid:who||uid,storage:local,now:()=>now}),advance:delta=>now+=delta};}
const fresh=(number,extra={})=>({id:id(number),aircraft,description,isNew:true,...extra});

test('a reload recovers the original content and UUID without extending its retention',()=>{
 const f=fixture(),original=f.store().prepare(fresh(1,{description:'  '+description+'  '}));
 assert.equal(original.description,description);assert.equal(original.createdAt,at);assert.equal(original.expiresAt,at+TTL);
 f.advance(5000);const reopened=f.store(),recovered=reopened.list(' hp-1784 ')[0];assert.deepEqual(recovered,original);
 assert.deepEqual(reopened.prepare({...recovered,isNew:false}),original);
 recovered.description='Otro texto';assert.equal(reopened.list()[0].description,description,'callers receive copies rather than mutable storage records');
});

test('retrying cannot change the content or silently create a replacement after expiry',()=>{
 const f=fixture(),store=f.store(),original=store.prepare(fresh(1));
 assert.throws(()=>store.prepare({...original,description:'Otro problema',isNew:false}),/texto original/);
 assert.throws(()=>store.prepare({...original,description:' '+description,isNew:false}),/descripción/);
 assert.throws(()=>store.prepare({...original,aircraft:'HP-1819',isNew:false}),/texto original/);
 assert.equal(store.list().length,1);
 f.advance(TTL);assert.deepEqual(store.list(),[]);assert.equal(f.local.getItem(key(uid,id(1))),null);
 assert.throws(()=>store.prepare({...original,isNew:false}),/24 horas/);assert.deepEqual(store.list(),[]);
});

test('modified information requires an explicit new report and does not overwrite the pending original',()=>{
 const f=fixture(),store=f.store(),original=store.prepare(fresh(1));
 assert.throws(()=>store.prepare(fresh(2)),/Recupéralo/);
 assert.throws(()=>store.prepare({...fresh(2),isNew:false,description:'Otra falla del rotor'}),/No se reenvió/);
 const changed=store.prepare(fresh(2,{description:'Otra falla del rotor'}));
 assert.notEqual(changed.id,original.id);assert.equal(store.list().length,2);assert.deepEqual(store.list().find(item=>item.id===original.id),original);
});

test('UID boundaries isolate reports and confirmation removes only its matching snapshot',()=>{
 const f=fixture(),first=f.store('pilot'),other=f.store('pilot:other'),a=first.prepare(fresh(1)),b=other.prepare(fresh(1,{description:'Otro piloto ficticio'}));
 assert.deepEqual(first.list(),[a]);assert.deepEqual(other.list(),[b]);
 assert.throws(()=>first.complete({...a,description:b.description}),/confirmación/);assert.equal(first.list().length,1);assert.equal(other.list().length,1);
 assert.equal(first.complete(a),true);assert.equal(first.complete(a),false);assert.deepEqual(first.list(),[]);assert.deepEqual(other.list(),[b]);
});

test('another pilot cannot clean up or be blocked by expired and corrupt entries owned by the first pilot',()=>{
 const f=fixture(),first=f.store('pilotA'),other=f.store('pilotB'),expired=first.prepare(fresh(1));f.advance(TTL);
 const corruptKey=key('pilotA',id(2));f.local.setItem(corruptKey,'synthetic corrupt record');
 const current=other.prepare(fresh(3)),oldText=f.local.getItem(key('pilotA',expired.id)),remove=f.local.removeItem;
 f.local.removeItem=name=>{if(name.startsWith(PREFIX+encodeURIComponent('pilotA')+':'))throw Error('another user cleanup must not run');return remove(name);};
 assert.deepEqual(other.list(),[current]);
 assert.equal(f.local.getItem(key('pilotA',expired.id)),oldText);assert.equal(f.local.getItem(corruptKey),'synthetic corrupt record');
 f.local.removeItem=remove;assert.deepEqual(first.list(),[]);
 assert.equal(f.local.getItem(key('pilotA',expired.id)),null);assert.equal(f.local.getItem(corruptKey),null);assert.deepEqual(other.list(),[current]);
});

test('an old confirmation cannot delete a later snapshot even if its UUID was reused',()=>{
 const f=fixture(),store=f.store(),old=store.prepare(fresh(1));f.advance(TTL);
 const replacement=store.prepare(fresh(1));assert.notEqual(replacement.createdAt,old.createdAt);
 assert.throws(()=>store.complete(old),/confirmación/);assert.deepEqual(store.list(),[replacement]);
 assert.equal(store.complete(replacement),true);assert.deepEqual(store.list(),[]);
});

test('the per-pilot limit refuses another report without evicting any pending entry',()=>{
 const f=fixture(),store=f.store();
 for(let number=1;number<=MAX_PENDING;number++)store.prepare(fresh(number,{description:description+' '+number}));
 const before=store.list();assert.equal(before.length,MAX_PENDING);
 assert.throws(()=>store.prepare(fresh(MAX_PENDING+1,{description:'Nuevo reporte diferente'})),/20 reportes/);assert.deepEqual(store.list(),before);
 assert.deepEqual(store.prepare({...before[0],isNew:false}),before[0]);
 const other=f.store('other-pilot');assert.equal(other.prepare(fresh(MAX_PENDING+1)).id,id(MAX_PENDING+1));
});

test('expired and malformed records are purged without exposing or deleting another valid user record',()=>{
 const f=fixture(),mine=f.store(),other=f.store('other-pilot'),old=mine.prepare(fresh(1));f.advance(TTL-1);
 const valid=other.prepare(fresh(2));f.advance(1);
 const forged={v:1,uid,id:id(3),aircraft,description,createdAt:at,expiresAt:at+TTL*2};
 f.local.setItem(key(uid,id(3)),JSON.stringify(forged));
 f.local.setItem(key(uid,id(4)),'broken json');
 f.local.setItem(key(uid,id(5)),JSON.stringify({...forged,id:id(5),createdAt:at+TTL+1,expiresAt:at+TTL*2+1}));
 f.local.setItem(key(uid,id(6)),JSON.stringify({...forged,uid:'other-pilot',id:id(6),createdAt:at+TTL,expiresAt:at+TTL*2}));
 f.local.setItem('unrelated-setting','keep');
 assert.deepEqual(mine.list(),[]);assert.equal(f.local.getItem(key(uid,old.id)),null);assert.equal(f.local.getItem(key(uid,id(3))),null);assert.equal(f.local.getItem(key(uid,id(4))),null);assert.equal(f.local.getItem(key(uid,id(5))),null);assert.equal(f.local.getItem(key(uid,id(6))),null);
 assert.deepEqual(other.list(),[valid]);assert.equal(f.local.getItem('unrelated-setting'),'keep');
});

test('storage failures are errors rather than missing recovery data or permission to submit',()=>{
 const f=fixture(),saved=f.store().prepare(fresh(1));
 for(const method of ['getItem','setItem','removeItem']){
  const broken=Object.create(f.local);broken[method]=()=>{throw Error('synthetic storage failure');};const store=createStore({uid,storage:broken,now:()=>at});
  if(method==='getItem')assert.throws(()=>store.list(),/almacenamiento local/);
  if(method==='setItem')assert.throws(()=>store.prepare(fresh(2,{description:'Otro reporte diferente'})),/almacenamiento local/);
  if(method==='removeItem')assert.throws(()=>store.complete(saved),/almacenamiento local/);
 }
 assert.deepEqual(f.store().list(),[saved]);
 const ignored=storage();ignored.setItem=()=>{};assert.throws(()=>createStore({uid,storage:ignored,now:()=>at}).prepare(fresh(2)),/almacenamiento local/);
});

test('unavailable browser storage is detected on use without breaking store construction',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 try{
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('synthetic denied access');}});
  const store=createStore({uid,now:()=>at});assert.throws(()=>store.list(),/almacenamiento local/);
 }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
 const invalid={getItem(){return null;},setItem(){},removeItem(){},key(){return null;}};
 assert.throws(()=>createStore({uid,storage:invalid,now:()=>at}).prepare(fresh(1)),/almacenamiento local/);
});

test('expiry cleanup must remove the old snapshot and leaves a concurrent replacement alone',()=>{
 const f=fixture(),saved=f.store().prepare(fresh(1));f.advance(TTL);
 const remove=f.local.removeItem;f.local.removeItem=()=>{};
 assert.throws(()=>f.store().list(),/almacenamiento local/);assert.notEqual(f.local.getItem(key(uid,saved.id)),null);
 f.local.removeItem=remove;assert.deepEqual(f.store().list(),[]);
 const original=JSON.stringify({v:1,uid,...saved}),replacement=JSON.stringify({v:1,uid,...saved,createdAt:at+TTL,expiresAt:at+TTL*2});
 f.local.setItem(key(uid,saved.id),original);
 const get=f.local.getItem;let count=0;
 f.local.getItem=name=>{if(name===key(uid,saved.id)&&++count===2)f.local.setItem(name,replacement);return get(name);};
 assert.deepEqual(f.store().list(),[]);assert.equal(get(key(uid,saved.id)),replacement);
 assert.deepEqual(f.store().list(),[{...saved,createdAt:at+TTL,expiresAt:at+TTL*2}]);
});

test('oversized or invalid input never creates a storage entry',()=>{
 const f=fixture(),store=f.store();
 for(const invalid of [fresh(1,{description:'a'.repeat(1001)}),fresh(1,{description:'abc'}),fresh(1,{aircraft:'other'}),fresh(1,{id:'bad'}),fresh(1,{id:[id(1)]}),fresh(1,{description:{text:description}})])assert.throws(()=>store.prepare(invalid));
 assert.deepEqual(store.list(),[]);assert.throws(()=>createStore({uid:'',storage:f.local}));
 const normal=store.prepare(fresh(1,{aircraft:'HP1186'}));assert.equal(normal.aircraft,'HP1186');
});

test('cross-tab limit checks roll back only the new entry when the last slot is filled concurrently',()=>{
 const f=fixture(),store=f.store();
 for(let number=1;number<MAX_PENDING;number++)store.prepare(fresh(number,{description:description+' '+number}));
 const set=f.local.setItem.bind(f.local);let inserted=false;
 f.local.setItem=(name,value)=>{set(name,value);if(!inserted){inserted=true;set(key(uid,id(99)),JSON.stringify({v:1,uid,id:id(99),aircraft,description:'Otro reporte de otra pestaña',createdAt:at,expiresAt:at+TTL}));}};
 assert.throws(()=>store.prepare(fresh(20,{description:'Reporte de esta pestaña'})),/20 reportes/);
 assert.equal(f.local.getItem(key(uid,id(20))),null);assert.notEqual(f.local.getItem(key(uid,id(99))),null);assert.equal(store.list().length,MAX_PENDING);
});
