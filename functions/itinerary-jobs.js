'use strict';
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {getDatabase}=require('firebase-admin/database');
const {scheduled,scheduledDraft}=require('./itinerary-service');
exports.draftDailyItinerary=onSchedule({schedule:'0 20 * * *',timeZone:'America/Panama',region:'us-central1',minInstances:0,maxInstances:1,retryCount:3},event=>scheduledDraft(getDatabase(),event.scheduleTime||new Date().toISOString()));
exports.publishDailyItinerary=onSchedule({schedule:'15 20 * * *',timeZone:'America/Panama',region:'us-central1',minInstances:0,maxInstances:1,retryCount:3},event=>scheduled(getDatabase(),event.scheduleTime||new Date().toISOString()));
exports.emailModifiedItinerary=onSchedule({schedule:'* * * * *',timeZone:'America/Panama',region:'us-central1',minInstances:0,maxInstances:1,retryCount:3},event=>require('./itinerary-service').flushModified(getDatabase(),event.scheduleTime||new Date().toISOString()));
