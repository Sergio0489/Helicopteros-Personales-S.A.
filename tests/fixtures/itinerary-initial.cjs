const E=require('../../functions/itinerary-engine');
const {slots,fleet,defaultTypeRules,sourceSnapshot}=E;
function initial(){
 const aircraft=fleet.map((a,i)=>({id:a[0],model:a[1],category:a[2],color:a[3],status:i===2?'mantenimiento':i===9?'grounded':i===10?'sin registrar':'operativo',rank:i+1,night:false,pilots:i===1?['b','a','d','c']:['a','b','c','d'],slots:structuredClone(slots)}));
 const pilots=[{id:'a',name:'Piloto A',categories:['Monomotor','Multimotor'],valid:true},{id:'b',name:'Piloto B',categories:['Monomotor','Multimotor'],valid:true},{id:'c',name:'Piloto C',categories:['Monomotor'],valid:true},{id:'d',name:'Piloto D',categories:['Monomotor','Multimotor','Helicóptero'],valid:true}];
 aircraft.forEach(a=>{a.pilots=a.pilots.filter(id=>pilots.some(p=>p.id===id&&p.categories.includes(a.category)));});
 const requests=[
 {id:'q1',pilot:'b',aircraft:'HP1907',slot:'b1',start:'06:30',end:'09:30',flightType:'privado',created:1,note:'Mismo avión solicitado por varios pilotos; el cierre redistribuye.'},
 {id:'q2',pilot:'a',aircraft:'HP1907',slot:'b1',start:'06:30',end:'09:30',flightType:'privado',created:2,note:'Prioridad de piloto aplicada en la aeronave asignada.'},
 {id:'q3',pilot:'c',aircraft:'HP1907',slot:'b1',start:'06:30',end:'09:30',flightType:'ifr',created:3,note:'Solicita IFR: se asignará HP1579 o HP1815.'},
 {id:'q4',pilot:'b',aircraft:'HP1579',slot:'b2',start:'09:30',end:'12:30',flightType:'solo',created:4,note:'La matrícula solicitada es una preferencia; prevalece el tipo de vuelo.'},
 {id:'q5',pilot:'a',aircraft:'HP1579',slot:'b3',start:'12:30',end:'15:30',flightType:'solo',created:5,note:'Ejemplo de reparto entre las tres aeronaves para vuelo solo.'},
 {id:'q6',pilot:'a',aircraft:'HP880BL',slot:'b2',start:'09:30',end:'12:30',flightType:'multi',created:6,note:'Excepción para pilotos: HP880BL se publica con la matrícula, piloto y horas solicitados, sin aplicar prioridades.'},
 {id:'q7',pilot:'d',aircraft:'HP1579',slot:'b3',start:'12:30',end:'15:30',flightType:'solo',created:7,note:'HP1784 queda como última opción para vuelo solo.'},
 {id:'q8',pilot:'b',aircraft:'HP1579',slot:'b3',start:'12:30',end:'15:30',flightType:'solo',created:8,note:'La prioridad de pilotos se consulta en la aeronave de destino.'},
 {id:'q9',pilot:'a',aircraft:'HP1907',slot:'b4',start:'15:30',end:'18:30',flightType:'ifr',created:9,note:'Solo HP1579 y HP1815 pueden recibir una solicitud IFR.'}
 ];
 requests.forEach(q=>{q.sourceSlots=sourceSnapshot(aircraft.find(a=>a.id===q.aircraft),q);});
 return {nightEnabled:false,students:[{id:'st1',name:'Estudiante A'},{id:'st2',name:'Estudiante B'},{id:'st3',name:'Estudiante C'}],typeRules:defaultTypeRules(),now:'2026-10-29T18:00:00-05:00',published:false,aircraft,pilots,requests,confirmed:[{id:'fixed-1',aircraft:'HP1819',slot:'b1',pilot:'d',start:'06:30',end:'09:30',fixed:true},{id:'fixed-2',aircraft:'HP1186',slot:'b2',pilot:'d',start:'09:30',end:'12:30',flightType:'privado',fixed:true}],cancelled:[],maxBlocks:0,date:'2026-10-30'};
}

module.exports=initial;
