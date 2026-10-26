/* Pure progress projection shared by browser and authenticated sync Worker. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AngersSyncModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const WORD_IDS = Object.freeze(["hello","thanks","please","excuse","yes","no","today","tomorrow","now","here","there","open","closed","name","help","station","train","tram","ticket","platform","departure","arrival","reservation","hotel","bedroom","key","address","left","right","straight","coffee","tea","water","bread","croissant","set-menu","menu","table","bill","jug","dish","dessert","vegetarian","without","takeaway","conference","presentation","badge","registration","meeting-room","break","question","answer","research","field","programme","poster","university","researcher","chat","goodbye","good-evening","see-you-soon","okay","understand","speak","repeat-verb","slowly","wait","buy","price","shop","pharmacy","doctor","hospital","toilets","help-noun","emergency","phone","battery","charger","wifi","clock-time","morning","afternoon","evening","yesterday","week","day","rain","sun","hot","cold","one","two","three","four","five","six","seven","eight","nine","ten","twenty","how-much","bus","transport-stop","airport","taxi","car","bicycle","on-foot","street-map","street","town-square","city-centre","bridge","river","entrance","exit","near","far-from","opposite","next-to","behind","in-front-of","cross","turn","go","come","return-trip","one-way","delay","connection","final-stop","driver","passenger","suitcase","luggage-item","passport","hotel-reception","floor","lift","stairs","shower","towel","breakfast","stay","overnight-stay","available","lunch","dinner","restaurant-server","bakery","restaurant","counter","terrace","drinking-glass","cup","plate","fork","knife","spoon","napkin","salt","pepper","sugar","milk","butter","cheese","egg","chicken","fish","meat","vegetables","salad","soup","rice","pasta","potato","apple","juice","beer","wine","bottle","sparkling-water","still-water","portion","food-order","order-food","pay","bank-card","cash","separate-bill","eat-in","lecture","session","workshop","meeting","seminar","speaker","audience","attendee","organizer","colleague","student","professor","laboratory","team","project","topic","title","abstract","scientific-paper","result","method","data","experiment","analysis","conclusion","source","reference","graph","slide","screen","microphone","projector","cable","socket","computer","link","website","email","business-card","appointment","date","time-slot","duration","present","send"]);
  const QUESTION_IDS = Object.freeze(['hello','station','right','ticket','coffee','here','bill','water','name','repeat','talk','english']);
  const TRACKS = Object.freeze(['en-fr','fr-en','context','listen']);
  const TOPICS = Object.freeze(['travel','food','conference']);
  const WORDS = new Set(WORD_IDS), QUESTIONS = new Set(QUESTION_IDS);
  const MAX_CUSTOM = 100, MAX_COUNT = 1000000000, MAX_TIME = 8640000000000000;
  const MAX_SNAPSHOT_BYTES = 1000000, MAX_OPERATION_BYTES = 1050000;
  const DAY = 86400000;
  const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;
  const CUSTOM_ID = /^own-[a-z0-9-]{1,80}$/;
  const FORBIDDEN = new Set(['__proto__','constructor','prototype']);
  const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
  function record(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(label+' must be an object');
    const proto=Object.getPrototypeOf(value);
    if (proto!==Object.prototype && proto!==null) throw new TypeError(label+' must be a plain object');
    for (const key of Object.keys(value)) if(FORBIDDEN.has(key)) throw new TypeError('Unsafe key in '+label);
    return value;
  }
  function boundedJSON(value, max, label) {
    let text;
    try {text=JSON.stringify(value);} catch {throw new TypeError(label+' is not JSON');}
    if(typeof text!=='string'||new TextEncoder().encode(text).length>max) throw new TypeError(label+' is too large');
  }
  function number(value, max, label, fallback=0) {
    if(value===undefined) return fallback;
    if(!Number.isSafeInteger(value)||value<0||value>max) throw new TypeError('Invalid '+label);
    return value;
  }
  function identifier(value,label) {
    if(typeof value!=='string'||!ID.test(value)||FORBIDDEN.has(value)) throw new TypeError('Invalid '+label);
    return value;
  }
  function wordId(value) {
    if(typeof value!=='string'||(!WORDS.has(value)&&!CUSTOM_ID.test(value))) throw new TypeError('Unknown word ID');
    return value;
  }
  function track(value) {if(!TRACKS.includes(value))throw new TypeError('Unknown learning track');return value;}
  function day(value) {
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new TypeError('Invalid practice day');
    const date=new Date(value+'T00:00:00.000Z');
    if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw new TypeError('Invalid practice day');
    return value;
  }
  function bool(value,label) {if(typeof value!=='boolean')throw new TypeError('Invalid '+label);return value;}
  function text(value,max,label,required=false) {
    if(value===undefined&&!required)return '';
    if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new TypeError('Invalid '+label);
    return value.trim();
  }
  function customWord(raw) {
    const w=record(raw,'custom word');
    if(typeof w.id!=='string'||!CUSTOM_ID.test(w.id))throw new TypeError('Invalid personal word ID');
    return {id:w.id,category:'custom',fr:text(w.fr,100,'French word',true),en:text(w.en,100,'English meaning',true),
      usage:text(w.usage,240,'usage note'),pronunciation:'',example:'',exampleEn:'',frAccepted:[],enAccepted:[]};
  }
  function emptyState() {
    return {version:1,epoch:'initial',app:{xp:0,answers:{},days:[],complete:[],day:1},
      vocab:{progress:{},introduced:{},custom:[]},deletedCustom:{}};
  }
  function sanitizeProgress(raw) {
    const p=record(raw,'word progress');
    const streak=number(p.streak,5,'word streak');
    return {right:number(p.right,MAX_COUNT,'correct count'),wrong:number(p.wrong,MAX_COUNT,'wrong count'),streak,
      strength:number(p.strength,100,'word strength',streak*20),due:number(p.due,MAX_TIME,'review date'),last:number(p.last,MAX_TIME,'practice date')};
  }
  function sanitizeAnswer(raw) {
    const a=record(raw,'scenario answer'),right=number(a.right,MAX_COUNT,'scenario correct count'),miss=number(a.miss,MAX_COUNT,'scenario wrong count');
    return {right,miss,attempts:Math.max(number(a.attempts,2*MAX_COUNT,'scenario attempts'),right+miss),
      streak:number(a.streak,2,'scenario streak',Math.min(2,Math.max(0,right-miss)))};
  }
  function array(raw,label,max) {
    if(raw===undefined)return [];
    if(!Array.isArray(raw)||raw.length>max)throw new TypeError('Invalid '+label);
    return raw;
  }
  function sanitizeSnapshot(raw) {
    record(raw,'snapshot');boundedJSON(raw,MAX_SNAPSHOT_BYTES,'snapshot');
    if(raw.version!==undefined&&raw.version!==1)throw new TypeError('Unsupported snapshot version');
    const clean=emptyState();
    if(raw.epoch!==undefined)clean.epoch=identifier(raw.epoch,'epoch');
    const app=raw.app===undefined?{}:record(raw.app,'app progress');
    const vocab=raw.vocab===undefined?{}:record(raw.vocab,'vocabulary progress');
    clean.app.xp=number(app.xp,MAX_COUNT*100,'XP');
    clean.app.day=number(app.day,7,'trip day',1);if(clean.app.day<1)throw new TypeError('Invalid trip day');
    clean.app.days=[...new Set(array(app.days,'practice days',10000).map(day))].sort();
    clean.app.complete=TOPICS.filter(t=>array(app.complete,'completed scenarios',3).includes(t));
    if(app.complete!==undefined&&app.complete.some(t=>!TOPICS.includes(t)))throw new TypeError('Unknown scenario');
    if(app.answers!==undefined) {
      const answers=record(app.answers,'scenario answers');
      for(const id of Object.keys(answers)) {if(!QUESTIONS.has(id))throw new TypeError('Unknown scenario question');clean.app.answers[id]=sanitizeAnswer(answers[id]);}
    }
    const deleted=raw.deletedCustom===undefined?{}:record(raw.deletedCustom,'deleted personal words');
    if(Object.keys(deleted).length>10000)throw new TypeError('Too many personal word tombstones');
    for(const id of Object.keys(deleted)) {if(!CUSTOM_ID.test(id))throw new TypeError('Invalid deleted word ID');clean.deletedCustom[id]=number(deleted[id],MAX_TIME,'deletion date');}
    const custom=array(vocab.custom,'personal words',MAX_CUSTOM).map(customWord),seen=new Set();
    for(const w of custom) {if(seen.has(w.id))throw new TypeError('Duplicate personal word ID');seen.add(w.id);if(!own(clean.deletedCustom,w.id))clean.vocab.custom.push(w);}
    const permitted=id=>WORDS.has(id)||(seen.has(id)&&!own(clean.deletedCustom,id));
    if(vocab.progress!==undefined) {
      const progress=record(vocab.progress,'vocabulary records');
      if(Object.keys(progress).length>WORD_IDS.length+MAX_CUSTOM)throw new TypeError('Too many vocabulary records');
      for(const id of Object.keys(progress)) {
        wordId(id);if(!permitted(id))continue;
        const p=record(progress[id],'word tracks'),tracks={};
        for(const key of Object.keys(p)){track(key);tracks[key]=sanitizeProgress(p[key]);}
        clean.vocab.progress[id]=tracks;
      }
    }
    if(vocab.introduced!==undefined) {
      const introduced=record(vocab.introduced,'introduced words');
      if(Object.keys(introduced).length>(WORD_IDS.length+MAX_CUSTOM)*3)throw new TypeError('Too many word introductions');
      for(const key of Object.keys(introduced)) {
        const parts=key.split('|');wordId(parts[0]);
        if(parts.length>2||(parts.length===2&&!['context','listen'].includes(parts[1])))throw new TypeError('Invalid introduction key');
        if(permitted(parts[0]))clean.vocab.introduced[key]=number(introduced[key],MAX_TIME,'introduction date');
      }
    }
    clean.vocab.custom.sort((a,b)=>a.id.localeCompare(b.id));
    return clean;
  }
  function validateOperation(raw) {
    const op=record(raw,'operation');boundedJSON(op,MAX_OPERATION_BYTES,'operation');
    const clean={id:identifier(op.id,'operation ID'),epoch:identifier(op.epoch,'epoch'),kind:op.kind,
      at:number(op.at,MAX_TIME,'operation date'),payload:{}};
    if(op.at===undefined)throw new TypeError('Missing operation date');
    const p=op.payload===undefined?{}:record(op.payload,'operation payload');
    switch(op.kind) {
      case 'baseline':case 'import':clean.payload={snapshot:sanitizeSnapshot(p.snapshot)};break;
      case 'vocab.attempt':clean.payload={wordId:wordId(p.wordId),track:track(p.track),ok:bool(p.ok,'answer result'),
        retry:p.retry===undefined?false:bool(p.retry,'retry flag'),cooldown:p.cooldown===undefined?false:bool(p.cooldown,'cooldown flag'),day:day(p.day)};break;
      case 'app.scenario':
        if(!QUESTIONS.has(p.questionId))throw new TypeError('Unknown scenario question');
        clean.payload={questionId:p.questionId,ok:bool(p.ok,'answer result'),day:day(p.day)};break;
      case 'app.complete':if(!TOPICS.includes(p.topic))throw new TypeError('Unknown scenario');clean.payload={topic:p.topic};break;
      case 'vocab.introduced':
        clean.payload={wordId:wordId(p.wordId)};
        if(p.track!==undefined){if(!['context','listen'].includes(p.track))throw new TypeError('Invalid introduction track');clean.payload.track=p.track;}break;
      case 'custom.put':clean.payload={word:customWord(p.word)};break;
      case 'custom.delete':
        if(typeof p.wordId!=='string'||!CUSTOM_ID.test(p.wordId))throw new TypeError('Invalid personal word ID');
        clean.payload={wordId:p.wordId};break;
      case 'reset':break;
      default:throw new TypeError('Unknown operation kind');
    }
    return clean;
  }
  function mergeSnapshots(state,incoming) {
    for(const [id,date]of Object.entries(incoming.deletedCustom))state.deletedCustom[id]=Math.max(state.deletedCustom[id]||0,date);
    if(Object.keys(state.deletedCustom).length>10000)throw new TypeError('Personal word deletion limit reached');
    const custom=new Map(state.vocab.custom.map(w=>[w.id,w]));
    for(const word of incoming.vocab.custom)if(!custom.has(word.id))custom.set(word.id,word);
    state.vocab.custom=[...custom.values()].filter(w=>!own(state.deletedCustom,w.id)).sort((a,b)=>a.id.localeCompare(b.id));
    if(state.vocab.custom.length>MAX_CUSTOM)throw new TypeError('Personal word limit reached');
    const customIds=new Set(state.vocab.custom.map(w=>w.id));
    for(const [id,records]of Object.entries(incoming.vocab.progress)) {
      if(own(state.deletedCustom,id)||(!WORDS.has(id)&&!customIds.has(id)))continue;
      if(!state.vocab.progress[id])state.vocab.progress[id]={};
      for(const [key,p]of Object.entries(records)) {
        const current=state.vocab.progress[id][key];
        if(!current){state.vocab.progress[id][key]={...p};continue;}
        const newest=p.last>current.last?p:current;
        const tie=p.last===current.last;
        state.vocab.progress[id][key]={right:Math.max(current.right,p.right),wrong:Math.max(current.wrong,p.wrong),
          streak:tie?Math.min(current.streak,p.streak):newest.streak,
          strength:tie?Math.min(current.strength,p.strength):newest.strength,
          due:tie?Math.min(current.due,p.due):newest.due,last:Math.max(current.last,p.last)};
      }
    }
    for(const [key,date]of Object.entries(incoming.vocab.introduced))if(!own(state.deletedCustom,key.split('|')[0]))state.vocab.introduced[key]=Math.max(state.vocab.introduced[key]||0,date);
    for(const id of Object.keys(state.deletedCustom)) {
      delete state.vocab.progress[id];delete state.vocab.introduced[id];delete state.vocab.introduced[id+'|context'];delete state.vocab.introduced[id+'|listen'];
    }
    state.app.xp=Math.max(state.app.xp,incoming.app.xp);
    state.app.day=Math.max(state.app.day,incoming.app.day);
    state.app.days=[...new Set([...state.app.days,...incoming.app.days])].sort().slice(-10000);
    state.app.complete=TOPICS.filter(t=>state.app.complete.includes(t)||incoming.app.complete.includes(t));
    for(const [id,a]of Object.entries(incoming.app.answers)) {
      const current=state.app.answers[id];
      if(!current){state.app.answers[id]={...a};continue;}
      state.app.answers[id]={right:Math.max(current.right,a.right),miss:Math.max(current.miss,a.miss),
        attempts:Math.max(current.attempts,a.attempts,Math.max(current.right,a.right)+Math.max(current.miss,a.miss)),streak:Math.min(current.streak,a.streak)};
    }
    return state;
  }
  function interval(strength) {return strength>=100?30*DAY:strength>=80?14*DAY:strength>=60?7*DAY:strength>=40?3*DAY:strength>=20?DAY:10*60000;}
  function addDay(state,date) {if(!state.app.days.includes(date))state.app.days.push(date);state.app.days.sort();if(state.app.days.length>10000)state.app.days=state.app.days.slice(-10000);}
  function usableWord(state,id) {return WORDS.has(id)||(!own(state.deletedCustom,id)&&state.vocab.custom.some(w=>w.id===id));}
  function applyValidated(state,op) {
    // Reset wins over unsynchronized operations from an earlier learning epoch.
    if(op.epoch!==state.epoch)return state;
    const p=op.payload;
    switch(op.kind) {
      case 'baseline':case 'import':return mergeSnapshots(state,p.snapshot);
      case 'reset': {
        const clean=emptyState();clean.epoch=op.id;clean.vocab.custom=state.vocab.custom;clean.deletedCustom=state.deletedCustom;return clean;
      }
      case 'custom.put': {
        if(own(state.deletedCustom,p.word.id))return state;
        const index=state.vocab.custom.findIndex(w=>w.id===p.word.id);
        if(index<0){if(state.vocab.custom.length>=MAX_CUSTOM)throw new TypeError('Personal word limit reached');state.vocab.custom.push(p.word);}
        else state.vocab.custom[index]=p.word;
        state.vocab.custom.sort((a,b)=>a.id.localeCompare(b.id));break;
      }
      case 'custom.delete': {
        const id=p.wordId;if(!own(state.deletedCustom,id)&&Object.keys(state.deletedCustom).length>=10000)throw new TypeError('Personal word deletion limit reached');state.deletedCustom[id]=Math.max(state.deletedCustom[id]||0,op.at);
        state.vocab.custom=state.vocab.custom.filter(w=>w.id!==id);delete state.vocab.progress[id];
        delete state.vocab.introduced[id];delete state.vocab.introduced[id+'|context'];delete state.vocab.introduced[id+'|listen'];break;
      }
      case 'vocab.introduced': {
        if(!usableWord(state,p.wordId))return state;
        state.vocab.introduced[p.wordId]=Math.max(state.vocab.introduced[p.wordId]||0,op.at);
        if(p.track)state.vocab.introduced[p.wordId+'|'+p.track]=Math.max(state.vocab.introduced[p.wordId+'|'+p.track]||0,op.at);break;
      }
      case 'vocab.attempt': {
        if(!usableWord(state,p.wordId))return state;
        const records=state.vocab.progress[p.wordId]||(state.vocab.progress[p.wordId]={});
        const current=records[p.track]||{right:0,wrong:0,streak:0,strength:0,due:0,last:0};
        const next={...current,last:Math.max(op.at,current.last)};
        if(p.ok){next.right=Math.min(MAX_COUNT,next.right+1);next.streak=Math.min(5,next.streak+1);next.strength=Math.min(100,next.strength+(p.retry?5:20));next.due=Math.min(MAX_TIME,next.last+(p.retry?10*60000:interval(next.strength)));if(!p.retry)state.app.xp=Math.min(MAX_COUNT*100,state.app.xp+5);}
        else{next.wrong=Math.min(MAX_COUNT,next.wrong+1);next.streak=0;next.strength=Math.max(0,next.strength-30);next.due=Math.min(MAX_TIME,next.last+(p.cooldown?10*60000:0));}
        records[p.track]=next;addDay(state,p.day);break;
      }
      case 'app.scenario': {
        const a=state.app.answers[p.questionId]||{right:0,miss:0,attempts:0,streak:0};
        a.attempts=Math.min(MAX_COUNT*2,a.attempts+1);if(p.ok){a.right=Math.min(MAX_COUNT,a.right+1);a.streak=Math.min(2,a.streak+1);state.app.xp=Math.min(MAX_COUNT*100,state.app.xp+10);}else{a.miss=Math.min(MAX_COUNT,a.miss+1);a.streak=0;}
        state.app.answers[p.questionId]=a;addDay(state,p.day);break;
      }
      case 'app.complete':if(!state.app.complete.includes(p.topic))state.app.complete=TOPICS.filter(t=>t===p.topic||state.app.complete.includes(t));break;
    }
    return state;
  }
  function applyOperation(rawState,rawOperation) {return applyValidated(sanitizeSnapshot(rawState),validateOperation(rawOperation));}
  function project(rawBase,rawOperations) {
    if(!Array.isArray(rawOperations)||rawOperations.length>20000)throw new TypeError('Invalid operation list');
    let state=sanitizeSnapshot(rawBase);const seen=new Set();
    for(const raw of rawOperations){const op=validateOperation(raw);if(seen.has(op.id))continue;seen.add(op.id);state=applyValidated(state,op);}
    return state;
  }
  return Object.freeze({emptyState,sanitizeSnapshot,validateOperation,applyOperation,project,
    WORD_IDS,QUESTION_IDS,TRACKS,TOPICS,MAX_CUSTOM,MAX_SNAPSHOT_BYTES,MAX_OPERATION_BYTES});
});
