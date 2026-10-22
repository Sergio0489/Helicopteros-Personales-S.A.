'use strict';
const {onRequest}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const {getDatabase}=require('firebase-admin/database');
const prospects=require('./prospects');
const config=defineSecret('HP_WIX_INTERESTS_CONFIG');
exports.wixInterests=onRequest({region:'us-central1',cors:false,minInstances:0,maxInstances:2,secrets:[config]},async(req,res)=>{
 res.set('Cache-Control','no-store');
 if(req.method!=='POST'){res.status(405).end();return;}
 let cfg;try{cfg=prospects.authorizedConfig(config.value());}catch{res.status(503).json({error:'Integración pendiente de configuración.'});return;}
 const now=new Date().toISOString();let input;
 try{input=prospects.webhookInput(req.body,cfg,now);}
 catch(error){res.status(error.status||400).json({error:error.status===401?'No autorizado.':'No se pudo aceptar el envío. Revisa su formato y configuración.'});return;}
 try{res.json(await prospects.receive(getDatabase(),input,now));}
 catch{res.status(503).json({error:'No se confirmó el guardado. Reintenta el mismo envío.'});}
});
