'use strict';
const {onValueCreated}=require('firebase-functions/v2/database');
const {defineSecret}=require('firebase-functions/params');
const {getDatabase}=require('firebase-admin/database');
const logger=require('firebase-functions/logger');
const email=require('./prospect-email');
const config=defineSecret('HP_PROSPECT_EMAIL_CONFIG');

exports.emailProspectInquiry=onValueCreated({
 ref:'/prospects/inquiries/{contactId}/{inquiryId}',instance:'helicopteros-personales-default-rtdb',
 region:'us-central1',minInstances:0,maxInstances:2,concurrency:4,timeoutSeconds:120,retry:true,secrets:[config]
},async event=>{
 const cfg=email.configuration(config.value());
 const transport=require('nodemailer').createTransport(cfg.transport);
 try{
  await email.deliver({db:getDatabase(),event,from:cfg.from,send:mail=>transport.sendMail(mail),
   report:(code,deliveryId)=>logger.error('Aviso de interesado pendiente de revisión.',{code,deliveryId})});
 }finally{transport.close();}
});
