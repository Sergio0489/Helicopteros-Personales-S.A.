'use strict';

function page(users,accounts={},nextPageToken=null,directorUid=''){
 const rows=[];
 for(const user of users||[]){
  const account=accounts[user.uid]||{};
  if(account.mergedInto)continue;
  const profile=account.profile||{};
  rows.push({
   uid:String(user.uid||''),
   name:String(profile.name||user.displayName||user.email||'Usuario sin nombre').trim(),
   email:String(user.email||account.email||''),
   phone:String(profile.phone||user.phoneNumber||''),
   role:user.uid===directorUid?'Director':String(account.role||'Sin cargo'),
   recordKind:String(account.recordKind||''),
   recordId:String(account.recordId||''),
   verified:!!user.emailVerified,
   disabled:!!user.disabled
  });
 }
 return {users:rows,nextPageToken:nextPageToken||null};
}

module.exports={page};
