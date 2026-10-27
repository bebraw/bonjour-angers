const assert=require('node:assert/strict');
const E=require('../dist/focus-engine.js');

const turns=ids=>ids.map(id=>({id,direction:'en-fr'}));
const entry=(state,id)=>state.cohort.find(word=>word.id===id);
const frozen=value=>{Object.freeze(value);for(const child of Object.values(value))if(child&&typeof child==='object')frozen(child);return value;};
function stateIsSound(state){
 assert.equal(state.turn,state.cohort.reduce((n,word)=>n+word.attempts,0),'turn count records actual graded attempts');
 assert.ok(state.cohort.every(word=>word.attempts<=E.MAX_ATTEMPTS),'a difficult word cannot exceed the effort cap');
 assert.deepEqual(E.restore(state),state,'every generated state survives validated resume');
}
function scheduled(state,now){
 const next=E.next(state,now);
 stateIsSound(next.state);
 return next;
}

assert.throws(()=>E.create([]));
assert.throws(()=>E.create(turns(['a','b','c','d','e','f'])));
assert.throws(()=>E.create([{id:'same',direction:'en-fr'},{id:'same',direction:'article'}]),/Invalid focus word/);
assert.throws(()=>E.create([{id:'unknown',direction:'not-a-track'}]));
const initial=E.create(turns(['a','b','c']));
assert.ok(E.restore(initial,(id,direction)=>['a','b','c'].includes(id)&&direction==='en-fr'));
assert.equal(E.restore(initial,()=>false),null,'removed or ineligible words invalidate the local focus set');
const malformed=[
 null,[],{...initial,version:2},{...initial,turn:1},{...initial,turn:NaN},{...initial,waitUntil:30000},
 {...initial,cohort:[...initial.cohort,{...initial.cohort[0],direction:'article'}]},
 {...initial,cohort:[{...initial.cohort[0],status:'complete'},...initial.cohort.slice(1)]},
 {...initial,cohort:[{...initial.cohort[0],successes:1},...initial.cohort.slice(1)]},
 {...initial,cohort:[{...initial.cohort[0],lastAt:1},...initial.cohort.slice(1)]},
 {...initial,cohort:[{...initial.cohort[0],noBuffer:'yes'},...initial.cohort.slice(1)]}
];
for(const raw of malformed)assert.equal(E.restore(raw),null,'malformed saved focus state is rejected');
const immutable=frozen(E.create(turns(['a','b','c']))),before=JSON.stringify(immutable);
const first=E.next(immutable,1000);
const afterFirst=E.record(first.state,first.item,{ok:true},1000);
assert.equal(JSON.stringify(immutable),before,'planning and grading never mutate the prior state');
assert.equal(entry(afterFirst,'a').successes,1);
assert.equal(entry(afterFirst,'a').status,'active','one success is insufficient to remove a word');
stateIsSound(afterFirst);
const corrupted=structuredClone(afterFirst);corrupted.cohort[0].lastTurn=corrupted.turn;assert.equal(E.restore(corrupted),null);
assert.throws(()=>E.next(initial,-1));assert.throws(()=>E.record(initial,initial.cohort[0],{ok:true},Infinity));
console.log('PASS: valid cohort boundaries, unique words across skills, strict saved-state integrity, immutable planning and grading');

let state=E.create(turns(['a','b','c','d','e'])),now=100000;
const sequence=[];
for(let step=0;step<40;step++){
 const next=scheduled(state,now);state=next.state;
 if(next.done)break;
 assert.ok(next.item,'five usable words provide intervening prompts without a forced pause');
 const prior=sequence.lastIndexOf(next.item.id);
 if(prior>=0)assert.ok(sequence.length-prior>=3,'repeat retrieval has at least two intervening prompts');
 assert.equal(next.item.focusBuffer,false,'balanced success needs no extra spacing prompts');
 sequence.push(next.item.id);state=E.record(state,next.item,{ok:true},now++);stateIsSound(state);
}
assert.equal(sequence.length,15,'five words each receive three unaided retrievals');
assert.deepEqual(E.summary(state),{remaining:0,complete:5,rest:0,skipped:0,total:5,recalls:15});
assert.equal(E.next(state,now).done,true);
console.log('PASS: fixed five-word set, repeated retrieval after first success, separated attempts and accurate final completion counts');

state=E.create(turns(['target','b','c']));now=200000;
const targetResults=[{ok:true},{ok:true,hinted:true},{ok:true},{ok:false,revealed:true},{ok:true},{ok:true},{ok:true}];
const expectedSuccesses=[1,0,1,0,1,2,3];let targetAttempt=0;
for(let step=0;step<50;step++){
 const next=scheduled(state,now);state=next.state;
 if(next.done)break;
 if(!next.item){now=next.waitUntil;continue;}
 const result=next.item.id==='target'?targetResults[targetAttempt]:{ok:true};
 state=E.record(state,next.item,result,now++);stateIsSound(state);
 if(next.item.id==='target'){
  assert.equal(entry(state,'target').successes,expectedSuccesses[targetAttempt]);targetAttempt++;
 }
}
assert.equal(targetAttempt,7);
assert.equal(entry(state,'target').status,'complete');
assert.equal(entry(state,'target').credited,true,'a hinted first correct answer is still recorded for the single-credit guard');
assert.equal(E.summary(state).complete,3);
console.log('PASS: wrong, revealed and hinted answers reset clean recall progress; later unaided retrievals can still finish the set');

function beforeBuffer(){
 let current=E.create(turns(['hard','easy-a','easy-b'])),time=300000;
 for(let step=0;step<40;step++){
  const next=scheduled(current,time);current=next.state;
  if(next.item?.focusBuffer)return {state:current,item:next.item,now:time};
  assert.equal(next.done,false);
  if(!next.item){time=next.waitUntil;continue;}
  current=E.record(current,next.item,{ok:next.item.id!=='hard'},time++);stateIsSound(current);
 }
 throw Error('Narrowed cohort never produced a spacing prompt');
}
let narrowed=beforeBuffer();
assert.equal(E.summary(narrowed.state).remaining,1);
assert.equal(E.summary(narrowed.state).complete,2);
assert.equal(entry(narrowed.state,narrowed.item.id).status,'complete');
const repeated=E.record(narrowed.state,narrowed.item,{ok:true},narrowed.now);
assert.equal(entry(repeated,narrowed.item.id).status,'complete','a successful spacing prompt preserves its completed status');
assert.equal(entry(repeated,narrowed.item.id).successes,3);
const reopened=E.record(narrowed.state,narrowed.item,{ok:false},narrowed.now);
assert.equal(entry(reopened,narrowed.item.id).status,'active','a failed spacing prompt honestly reopens the word');
assert.equal(E.summary(reopened).remaining,2);
state=narrowed.state;now=narrowed.now;const tail=[];
for(let step=0;step<50;step++){
 const next=scheduled(state,now);state=next.state;
 if(next.done)break;
 if(!next.item){now=next.waitUntil;continue;}
 const prior=tail.lastIndexOf(next.item.id);if(prior>=0)assert.ok(tail.length-prior>=3,'narrowing preserves separated word retrievals');
 tail.push(next.item.id);state=E.record(state,next.item,{ok:next.item.id!=='hard'},now++);stateIsSound(state);
}
assert.equal(entry(state,'hard').attempts,8);assert.equal(entry(state,'hard').status,'rest');
assert.deepEqual(E.summary(state),{remaining:0,complete:2,rest:1,skipped:0,total:3,recalls:6});
assert.equal(E.next(state,now).done,true,'the last difficult word cannot trap the learner indefinitely');
console.log('PASS: narrowing with familiar spacing prompts, reopened mistakes, bounded effort and separate completed/resting outcomes');

state=E.create(turns(['only']));now=400000;
let next=E.next(state,now);state=E.record(next.state,next.item,{ok:true},now);
next=scheduled(state,now+1);assert.equal(next.item,null);assert.equal(next.waitUntil,now+30000);
const paused=E.restore(next.state);assert.ok(paused);
assert.equal(E.next(paused,now+29999).item,null,'a reload cannot bypass the short separation');
assert.equal(E.next(paused,now-1000).waitUntil,now+30000,'a backward wall clock does not turn the pause into immediate repetition');
next=E.next(paused,now+30000);assert.equal(next.item.id,'only');
state=E.record(next.state,next.item,{ok:true},now+30000);
next=E.next(state,now+30001);assert.equal(next.item,null);
next=E.next(next.state,now+60000);state=E.record(next.state,next.item,{ok:true},now+60000);
assert.equal(E.next(state,now+60000).done,true);
let two=E.create(turns(['a','b']));next=E.next(two,500000);two=E.record(next.state,next.item,{ok:true},500000);
next=E.next(two,499000);assert.equal(next.item.id,'b');two=E.record(next.state,next.item,{ok:true},499000);
assert.equal(entry(two,'b').lastAt,500000,'graded timestamps do not move backward');stateIsSound(two);
console.log('PASS: persisted singleton pauses, timer boundaries, clock changes and distinct-word alternation');

state=E.create(turns(['skip-a','skip-b','skip-c']));
const skipped=E.skip(state,E.next(state,600000).item,600000);
assert.equal(skipped.turn,0);assert.equal(entry(skipped,'skip-a').attempts,0);assert.equal(entry(skipped,'skip-a').status,'skipped');
assert.equal(E.next(skipped,600000).item.id,'skip-b');stateIsSound(skipped);
state=skipped;
for(const id of ['skip-b','skip-c'])state=E.skip(state,{id,direction:'en-fr'},600000);
assert.equal(E.next(state,600000).done,true);assert.equal(E.summary(state).skipped,3);
assert.equal(E.summary(state).complete,0,'unavailable audio is not counted as successful recall');

narrowed=beforeBuffer();state=narrowed.state;now=narrowed.now;
const blocked=new Set();let skips=0;
for(let step=0;step<50;step++){
 const planned=scheduled(state,now);state=planned.state;
 if(planned.done)break;
 if(!planned.item){now=planned.waitUntil;continue;}
 assert.equal(blocked.has(planned.item.id),false,'a completed word with unavailable audio is not offered again as a spacer');
 if(planned.item.focusBuffer){
  const before=structuredClone(state),word=planned.item.id;
  state=E.skip(state,planned.item,now);
  assert.equal(entry(state,word).status,'complete');assert.equal(entry(state,word).successes,3);
  assert.equal(entry(state,word).attempts,entry(before,word).attempts);assert.equal(state.turn,before.turn);
  assert.equal(entry(state,word).noBuffer,true);assert.equal(entry(E.restore(state),word).noBuffer,true,'the audio suppression survives reopening');
  blocked.add(word);skips++;
 }else state=E.record(state,planned.item,{ok:false},now++);
 stateIsSound(state);
}
assert.equal(skips,2);
assert.equal(E.summary(state).complete,2,'technical audio failure does not revoke earlier successful recalls');
assert.equal(E.summary(state).rest,1);assert.equal(E.summary(state).skipped,0);assert.equal(E.next(state,now).done,true);
console.log('PASS: active audio skips remain non-scoring; skipped completed spacers retain achievement, persist suppression and cannot loop');
