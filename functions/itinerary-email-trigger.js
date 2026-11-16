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

exports.emailPublishedItinerary=onValueCreated({
 ref:'/dashboard/itineraryEmailOutbox/{publicationId}',instance:'helicopteros-personales-default-rtdb',
 region:'us-central1',minInstances:0,maxInstances:2,concurrency:4,timeoutSeconds:120,retry:true,secrets:[config]
},async event=>{
 const db=getDatabase(),publication=event.data.val(),id=event.params.publicationId;
 if(!publication||publication.id!==id)throw Error('Evento de publicación del horario no válido.');
 const [accounts,cfg]=await Promise.all([db.ref('accountRequests').get().then(snapshot=>snapshot.val()||{}),Promise.resolve(mail.smtpConfiguration(config.value()))]);
 const recipients=await itineraryEmail.recipients(publication,accounts,getAuth(),DIRECTOR_UID);
 if(!recipients.length){logger.error('El horario publicado no tiene destinatarios con correo válido.',{publicationId:id});await db.ref('dashboard/itineraryEmailOutbox/'+id).remove();return;}
 const transport=require('nodemailer').createTransport(cfg.transport);
 try{
  await itineraryEmail.deliver({db,event,from:cfg.from,recipients,send:message=>transport.sendMail(message),report:(code,deliveryId)=>logger.error('Aviso de horario pendiente de revisión.',{code,deliveryId})});
 }finally{transport.close();}
 await db.ref('dashboard/itineraryEmailOutbox/'+id).remove();
});
