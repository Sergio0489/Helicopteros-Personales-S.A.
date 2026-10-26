'use strict';
(()=>{
 const key=()=>{const uid=window.firebase?.auth().currentUser?.uid;return uid?'hp:last-page:'+uid:null;};
 function read(){try{const k=key();return k?JSON.parse(sessionStorage.getItem(k)||'null'):null;}catch{return null;}}
 function write(value){try{const k=key();if(k)sessionStorage.setItem(k,JSON.stringify(value));}catch{}}
 function tabKey(tab){if(tab.id)return 'id:'+tab.id;const label=(tab.querySelector('.tab-reg')||tab).cloneNode(true);label.querySelectorAll('small,.tab-badge').forEach(e=>e.remove());return 'label:'+label.textContent.trim().replace(/\s+/g,' ');}
 let observer;
 function installDirector(){
  observer?.disconnect();const saved=read(),tabs=[...document.querySelectorAll('#sidebar-tabs .aircraft-tab')];
  if(saved?.mode==='director'&&document.getElementById(saved.panel)){
   const target=tabs.find(t=>tabKey(t)===saved.tab);
   if(target){const group=target.closest('details');if(group)group.open=true;target.click();}
  }
  const record=()=>{const panel=document.querySelector('.aircraft-panel.active'),tab=document.querySelector('#sidebar-tabs .aircraft-tab.active');if(panel&&tab)write({mode:'director',panel:panel.id,tab:tabKey(tab)});};
  observer=new MutationObserver(record);observer.observe(document.getElementById('content-area'),{attributes:true,attributeFilter:['class'],subtree:true});record();
  window.addEventListener('pagehide',record);
 }
 function rememberRole(page,aircraft){const old=read();write({mode:'role',page,aircraft:aircraft??(old?.mode==='role'?old.aircraft:null)});}
 window.PageMemory={read,write,installDirector,rememberRole};
})();
