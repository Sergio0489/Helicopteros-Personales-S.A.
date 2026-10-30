'use strict';
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {getDatabase}=require('firebase-admin/database');
const {scheduled}=require('./itinerary-service');
exports.publishDailyItinerary=onSchedule({schedule:'15 20 * * *',timeZone:'America/Panama',region:'us-central1',minInstances:0,maxInstances:1,retryCount:3},event=>scheduled(getDatabase(),event.scheduleTime||new Date().toISOString()));
