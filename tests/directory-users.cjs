'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const directory=require('../functions/directory-users');

test('Director directory projects all account roles, names and contact labels without mutating account data',()=>{
 const accounts={
  pilot:{role:'Piloto',profile:{name:'Carlos Díaz',phone:'TEST-PHONE-ONE'},recordKind:'pilot',recordId:'p1'},
  manager:{role:'Administrativo',profile:{name:'Ana Morales'},recordKind:'personnel',recordId:'staff1'},
  merged:{role:'Estudiante',mergedInto:'primary'}
 },users=[
  {uid:'pilot',displayName:'Carlos',email:'carlos@example.test',phoneNumber:'TEST-PHONE-TWO',emailVerified:true},
  {uid:'manager',email:'ana@example.test',emailVerified:true},
  {uid:'unassigned',email:'new@example.test',disabled:true},
  {uid:'merged',email:'old@example.test'}
 ],before=structuredClone(accounts);
 const result=directory.page(users,accounts,'next-page','director');
 assert.deepEqual(result.users.map(user=>[user.name,user.role]),[
  ['Carlos Díaz','Piloto'],['Ana Morales','Administrativo'],['new@example.test','Sin cargo']
 ]);
 assert.equal(result.users[0].phone,'TEST-PHONE-ONE');
 assert.equal(result.users[2].disabled,true);
 assert.equal(result.nextPageToken,'next-page');
 assert.deepEqual(accounts,before,'the read-only directory projection must not modify account records');
});

test('Director account is labelled Director even if the stored role is stale',()=>{
 const result=directory.page([{uid:'director',email:'sergio@example.test'}],{director:{role:'Piloto'}},null,'director');
 assert.equal(result.users[0].role,'Director');
});
