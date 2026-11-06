'use strict';
// These records recover an unconfirmed submission; they are never server writes.
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.AircraftReportRecovery=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const PREFIX='hp:aircraft-report:v1:',TTL=24*60*60*1000,MAX_PENDING=20,MAX_DESCRIPTION=1000,MAX_RECORD=8192;
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 const FIELDS=['v','uid','id','aircraft','description','createdAt','expiresAt'];
 class RecoveryError extends Error{}
 const validUid=uid=>typeof uid==='string'&&uid.length>0&&uid.length<=128;
 const validAircraft=aircraft=>typeof aircraft==='string'&&/^HP[-_]?[A-Z0-9]{1,16}$/.test(aircraft);
 const validDescription=description=>typeof description==='string'&&description===description.trim()&&description.length>=5&&description.length<=MAX_DESCRIPTION;
 const keyFor=(uid,id)=>PREFIX+encodeURIComponent(uid)+':'+id;
 const copy=record=>({id:record.id,aircraft:record.aircraft,description:record.description,createdAt:record.createdAt,expiresAt:record.expiresAt});
 function createStore({uid,storage,now=Date.now}={}){
  try{if(!validUid(uid))throw Error();encodeURIComponent(uid);}catch{throw new RecoveryError('No se pudo identificar al piloto para recuperar sus reportes.');}
  const ownPrefix=PREFIX+encodeURIComponent(uid)+':';
  function use(operation){
   try{
    const local=storage===undefined?globalThis.localStorage:storage;
    if(!local||!['getItem','setItem','removeItem','key'].every(method=>typeof local[method]==='function'))throw Error();
    const at=now();if(!Number.isSafeInteger(at)||at<0||!Number.isSafeInteger(at+TTL))throw Error();
    return operation(local,at);
   }catch(error){
    if(error instanceof RecoveryError)throw error;
    throw new RecoveryError('No se pudo acceder al almacenamiento local de reportes. Revisa este dispositivo antes de enviar.');
   }
  }
  function read(local,at){
   // Snapshot keys before removal: deleting a Storage entry changes its indexes.
   const length=local.length;if(!Number.isSafeInteger(length)||length<0)throw Error();
   const keys=[];for(let index=0;index<length;index++){const key=local.key(index);if(typeof key==='string'&&key.startsWith(ownPrefix))keys.push(key);}
   const records=[];
   for(const key of keys){
    const text=local.getItem(key);if(text===null)continue;
    let record,valid=false;
    try{
     record=typeof text==='string'&&text.length<=MAX_RECORD?JSON.parse(text):null;
     valid=!!record&&typeof record==='object'&&!Array.isArray(record)&&Object.keys(record).length===FIELDS.length&&FIELDS.every(field=>Object.hasOwn(record,field))&&
      record.v===1&&validUid(record.uid)&&typeof record.id==='string'&&UUID.test(record.id)&&validAircraft(record.aircraft)&&validDescription(record.description)&&
      Number.isSafeInteger(record.createdAt)&&record.createdAt>=0&&record.createdAt<=at&&Number.isSafeInteger(record.expiresAt)&&record.expiresAt===record.createdAt+TTL&&
      key===keyFor(record.uid,record.id)&&record.expiresAt>at;
    }catch{}
    if(!valid){
     // Leave a replacement from another tab untouched while cleaning up.
     if(local.getItem(key)===text){local.removeItem(key);if(local.getItem(key)===text)throw Error();}
    }else records.push(record);
   }
   return records;
  }
  function identity(input,isNew){
   if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.id!=='string'||!UUID.test(input.id))throw new RecoveryError('El identificador del reporte pendiente no es válido.');
   const aircraft=isNew&&typeof input.aircraft==='string'?input.aircraft.trim().toUpperCase():input.aircraft;
   const description=isNew&&typeof input.description==='string'?input.description.trim():input.description;
   if(!validAircraft(aircraft)||!validDescription(description))throw new RecoveryError('Selecciona una aeronave y conserva una descripción de entre 5 y 1000 caracteres.');
   return {id:input.id,aircraft,description};
  }
  function matching(record,input){return record.aircraft===input.aircraft&&record.description===input.description;}
  function list(aircraft){
   if(aircraft!==undefined){aircraft=typeof aircraft==='string'?aircraft.trim().toUpperCase():aircraft;if(!validAircraft(aircraft))throw new RecoveryError('La aeronave del reporte no es válida.');}
   return use((local,at)=>read(local,at).filter(record=>record.uid===uid&&(aircraft===undefined||record.aircraft===aircraft)).sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id)).map(copy));
  }
  function prepare(input){
   const isNew=input?.isNew===true,requested=identity(input,isNew);
   return use((local,at)=>{
    const own=read(local,at).filter(record=>record.uid===uid),existing=own.find(record=>record.id===requested.id);
    if(existing){
     if(!matching(existing,requested))throw new RecoveryError('El reporte pendiente conserva su texto original. Para modificarlo, crea un reporte nuevo.');
     return copy(existing);
    }
    if(!isNew)throw new RecoveryError('El reporte pendiente ya no está disponible en este dispositivo o venció su conservación de 24 horas. No se reenvió.');
    if(own.some(record=>matching(record,requested)))throw new RecoveryError('Ya existe este reporte pendiente. Recupéralo para reintentar el envío original.');
    if(own.length>=MAX_PENDING)throw new RecoveryError('Hay 20 reportes pendientes en este dispositivo. Confirma uno de los anteriores antes de crear otro.');
    const record={v:1,uid,...requested,createdAt:at,expiresAt:at+TTL},key=keyFor(uid,record.id),text=JSON.stringify(record);
    if(text.length>MAX_RECORD)throw new RecoveryError('El reporte es demasiado grande para conservarlo en este dispositivo.');
    local.setItem(key,text);
    if(local.getItem(key)!==text)throw Error();
    // A different tab may have filled the last slot while this one was writing.
    if(read(local,at).filter(item=>item.uid===uid).length>MAX_PENDING){
     if(local.getItem(key)===text)local.removeItem(key);
     throw new RecoveryError('Hay 20 reportes pendientes en este dispositivo. Confirma uno de los anteriores antes de crear otro.');
    }
    return copy(record);
   });
  }
  function complete(input){
   const requested=identity(input,false);
   return use((local,at)=>{
    const existing=read(local,at).find(record=>record.uid===uid&&record.id===requested.id);
    if(!existing)return false;
    if(!matching(existing,requested)||['createdAt','expiresAt'].some(field=>Object.hasOwn(input,field)&&input[field]!==existing[field]))throw new RecoveryError('La confirmación no corresponde al contenido del reporte pendiente.');
    const key=keyFor(uid,requested.id);local.removeItem(key);if(local.getItem(key)!==null)throw Error();return true;
   });
  }
  return {list,prepare,complete};
 }
 return Object.freeze({PREFIX,TTL,MAX_PENDING,MAX_DESCRIPTION,createStore});
});
