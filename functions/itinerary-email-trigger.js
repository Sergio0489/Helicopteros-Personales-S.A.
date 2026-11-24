'use strict';
const {onValueCreated}=require('firebase-functions/v2/database');
const {defineSecret}=require('firebase-functions/params');
const {getDatabase}=require('firebase-admin/database');
const {getAuth}=require('firebase-admin/auth');
const logger=require('firebase-functions/logger');
const mail=require('./prospect-email');
const itineraryEmail=require('./itinerary-email');
const DIRECTOR_UID=require('./role-ids').DIRECTOR_UID;
const config=defineSecret('HP_PROSPECT_EMAIL_CONFIG');

async function saveDeliveryStatus(db,id,publication,recipients){
 const snapshot=await db.ref('itineraryEmailDeliveries/'+id).get(),summary=itineraryEmail.deliverySummary(id,publication,recipients,snapshot.val()||{});
 if(!recipients.length){summary.reviewCount=1;summary.code='recipients-empty';}
 await db.ref('dashboard/itineraryEmailStatus/'+id).set(summary);
}
exports.emailPublishedItinerary=onValueCreated({
 ref:'/dashboard/itineraryEmailOutbox/{publicationId}',instance:'helicopteros-personales-default-rtdb',
 region:'us-central1',minInstances:0,maxInstances:2,concurrency:4,timeoutSeconds:120,retry:true,secrets:[config]
},async event=>{
 const db=getDatabase(),publication=event.data.val(),id=event.params.publicationId;
 if(!publication||publication.id!==id)throw Error('Evento de publicación del horario no válido.');
 const [accounts,cfg]=await Promise.all([db.ref('accountRequests').get().then(snapshot=>snapshot.val()||{}),Promise.resolve(mail.smtpConfiguration(config.value()))]);
 const recipients=await itineraryEmail.recipients(publication,accounts,getAuth(),DIRECTOR_UID);
 if(!recipients.length){
  await saveDeliveryStatus(db,id,publication,recipients);
  logger.error('El horario publicado no tiene destinatarios con correo válido.',{publicationId:id});
  if(publication.draft===true||publication.notificationType==='aircraft-status')throw Error('El aviso de horario está pendiente: no se pudieron verificar sus destinatarios.');
  await db.ref('dashboard/itineraryEmailOutbox/'+id).remove();return;
 }
 const transport=require('nodemailer').createTransport(cfg.transport);let deliveryError=null;
 try{
  try{await itineraryEmail.deliver({db,event,from:cfg.from,recipients,send:message=>transport.sendMail(message),report:(code,deliveryId,diagnostics)=>logger.error('Aviso de horario pendiente de revisión.',{code,deliveryId,...diagnostics})});}catch(error){deliveryError=error;}
  await saveDeliveryStatus(db,id,publication,recipients);
  for(const followup of deliveryError?[]:publication.followups||[]){
   const followupRecipients=await itineraryEmail.recipients(followup,accounts,getAuth(),DIRECTOR_UID);
   if(!followupRecipients.length){await saveDeliveryStatus(db,followup.id,followup,followupRecipients);deliveryError=Error('El horario actualizado está pendiente: no se pudieron verificar sus destinatarios.');break;}
   const followupEvent={data:{val:()=>followup},params:{publicationId:followup.id}};
   try{await itineraryEmail.deliver({db,event:followupEvent,from:cfg.from,recipients:followupRecipients,send:message=>transport.sendMail(message),report:(code,deliveryId,diagnostics)=>logger.error('Horario actualizado pendiente de revisión.',{code,deliveryId,...diagnostics})});}catch(error){deliveryError=error;}
   await saveDeliveryStatus(db,followup.id,followup,followupRecipients);
   if(deliveryError)break;
  }
 }catch(error){deliveryError=error;}
 finally{transport.close();}
 if(deliveryError)throw deliveryError;
 await db.ref('dashboard/itineraryEmailOutbox/'+id).remove();
});
