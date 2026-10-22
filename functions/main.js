'use strict';
Object.assign(exports,require('./index'));
const {onValueCreated}=require('firebase-functions/v2/database');
const {getDatabase}=require('firebase-admin/database');
const {deliver}=require('./audit');
const options={instance:'helicopteros-personales-default-rtdb',region:'us-central1',minInstances:0,maxInstances:2,retry:true};
exports.auditDashboard=onValueCreated({...options,ref:'/dashboard/auditPending/{id}/meta'},event=>deliver(getDatabase(),event,'dashboard/auditPending'));
exports.auditAccounts=onValueCreated({...options,ref:'/accountRequests/{uid}/auditPending/{id}/meta'},event=>deliver(getDatabase(),event,'accountRequests/'+event.params.uid+'/auditPending'));


Object.assign(exports,require('./wix-interests'));
