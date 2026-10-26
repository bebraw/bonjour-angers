/* Local vocabulary practice: no account, API, or network required. */
(() => {
  'use strict';
  const KEY='bonjour-angers-vocabulary-v1';
  const DAY=86400000;
  const categories={all:'All words',essentials:'Everyday essentials',travel:'Travel & getting around',food:'Cafés & restaurants',conference:'Academic conferences',custom:'My own words'};
  const directions={'en-fr':'English → French','fr-en':'French → English',mixed:'Both directions'};
  const modes={recall:'Recall',context:'Sentence',listen:'Listen & spell'};
  const tracks=['en-fr','fr-en','context','listen'];
  const trackLabel={...directions,context:'Sentence',listen:'Listen & spell'};
  const base=window.VOCABULARY_WORDS;
  const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
  let storageOK=true,host,context={},library=false,query='';
  function load() {
    const clean={progress:{},introduced:{},custom:[],settings:{mode:'recall',category:'all',direction:'en-fr',length:0,pool:'smart'},session:null};
    try {
      const saved=JSON.parse(localStorage.getItem(KEY));
      if(!saved||typeof saved!=='object')return clean;
      if(Array.isArray(saved.custom)) {
        const seen=new Set();
        clean.custom=saved.custom.filter(w=>w&&typeof w.id==='string'&&/^own-[a-z0-9-]{1,80}$/.test(w.id)&&!seen.has(w.id)&&seen.add(w.id)&&typeof w.fr==='string'&&w.fr.trim()&&w.fr.length<=100&&typeof w.en==='string'&&w.en.trim()&&w.en.length<=100).slice(0,100).map(w=>({id:w.id,category:'custom',fr:w.fr,en:w.en,pronunciation:'',example:'',exampleEn:'',usage:typeof w.usage==='string'?w.usage.slice(0,240):'',frAccepted:[],enAccepted:[]}));
      }
      const ids=new Set([...base,...clean.custom].map(w=>w.id));
      if(saved.progress&&typeof saved.progress==='object')for(const id of ids) {
        const source=saved.progress[id];if(!source||typeof source!=='object')continue;
        clean.progress[id]={};
        for(const direction of tracks) {
          const p=source[direction];if(!p||typeof p!=='object')continue;
          clean.progress[id][direction]={right:count(p.right),wrong:count(p.wrong),streak:Math.min(5,count(p.streak)),strength:Math.min(100,p.strength===undefined?Math.min(5,count(p.streak))*20:count(p.strength)),due:count(p.due),last:count(p.last)};
        }
      }
      if(saved.introduced&&typeof saved.introduced==='object')for(const id of ids)for(const suffix of ['', '|context', '|listen']){const key=id+suffix;if(count(saved.introduced[key]))clean.introduced[key]=count(saved.introduced[key]);}
      const settings=saved.settings||{};
      if(Object.hasOwn(modes,settings.mode))clean.settings.mode=settings.mode;
      if(Object.hasOwn(categories,settings.category))clean.settings.category=settings.category;
      if(Object.hasOwn(directions,settings.direction))clean.settings.direction=settings.direction;
      if([0,5,10,20].includes(settings.length))clean.settings.length=settings.length;
      if(['smart','all','tricky'].includes(settings.pool))clean.settings.pool=settings.pool;
      const s=saved.session;
      if(s&&Array.isArray(s.queue)&&s.queue.length>0&&s.queue.length<=60&&s.queue.every(i=>i&&ids.has(i.id)&&tracks.includes(i.direction)&&typeof i.retry==='boolean')&&Number.isInteger(s.index)&&s.index>=0&&s.index<=s.queue.length) {
        const answer=s.answer&&typeof s.answer.ok==='boolean'&&typeof s.answer.text==='string'?{ok:s.answer.ok,text:s.answer.text.slice(0,200),revealed:!!s.answer.revealed}:null;
        clean.session={queue:s.queue.map(i=>({id:i.id,direction:i.direction,retry:i.retry,hinted:i.hinted===true})),index:s.index,original:Math.min(20,count(s.original)),firstCorrect:count(s.firstCorrect),xp:count(s.xp),continuous:!!s.continuous,answered:count(s.answered),correctCount:count(s.correctCount),skipped:Array.isArray(s.skipped)?s.skipped.filter(id=>ids.has(id)):[],reviews:{},missedTurns:Array.isArray(s.missedTurns)?s.missedTurns.filter(i=>i&&ids.has(i.id)&&tracks.includes(i.direction)).map(i=>({id:i.id,direction:i.direction})).slice(0,ids.size*tracks.length):[],config:{...clean.settings},answer,missed:Array.isArray(s.missed)?[...new Set(s.missed.filter(id=>ids.has(id)))]:[],recalled:Array.isArray(s.recalled)?[...new Set(s.recalled.filter(id=>ids.has(id)))]:[]};
        if(s.config&&Object.hasOwn(categories,s.config.category)&&Object.hasOwn(directions,s.config.direction)&&['smart','all','tricky'].includes(s.config.pool))clean.session.config={category:s.config.category,direction:s.config.direction,pool:s.config.pool,length:0,mode:Object.hasOwn(modes,s.config.mode)?s.config.mode:'recall'};
        if(s.reviews&&typeof s.reviews==='object')for(const id of ids)for(const d of tracks){const key=id+'|'+d;if(s.reviews[key])clean.session.reviews[key]=Math.min(3,count(s.reviews[key]));}
      }
    }catch {storageOK=false;}
    return clean;
  }
  let data=load();
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(data));storageOK=true;}catch{storageOK=false;}}
  function words(){return [...base,...data.custom];}
  function progress(id,direction){return data.progress[id]?.[direction]||{right:0,wrong:0,streak:0,strength:0,due:0,last:0};}
  function summary(){let learned=0,due=0,seen=0,practiced=0;const now=Date.now();for(const w of words()){const p=tracks.map(d=>progress(w.id,d));if(p.some(x=>x.last)||data.introduced[w.id])seen++;if(p.some(x=>x.last))practiced++;if(['en-fr','fr-en'].some(d=>progress(w.id,d).strength>=80))learned++;if(p.some(x=>x.last&&x.due<=now))due++;}return {total:words().length,learned,due,practiced,new:words().length-seen};}
  function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
  function button(text,action,className='secondary'){const b=el('button',text,className);b.type='button';b.onclick=action;return b;}
  function audioButtons(word){const row=el('div',undefined,'audio-row');row.append(button('▶ Listen',()=>context.speak?.(word.fr)),button('◷ Slow',()=>context.speak?.(word.fr,true)));row.children[0].setAttribute('aria-label','Listen: '+word.fr);row.children[1].setAttribute('aria-label','Listen slowly: '+word.fr);return row;}
  function focusHeading(){const h=host.querySelector('[data-vocab-heading]');if(h){h.tabIndex=-1;h.focus({preventScroll:true});}}
  function normalize(text){return text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/œ/g,'oe').replace(/æ/g,'ae').replace(/[’']/g,'').replace(/[-‐‑]/g,' ').replace(/[.,!?;:]/g,'').replace(/\s+/g,' ').trim();}
  function matches(word,direction,input) {
    if(direction==='listen')return normalize(word.fr)===normalize(input);
    if(direction==='context')return !!word.context&&[word.context.answer,...(word.context.accepted||[])].some(t=>normalize(t)===normalize(input));
    const target=direction==='en-fr'?[word.fr,...word.frAccepted]:[word.en,...word.enAccepted];
    const forms=direction==='en-fr'?target.flatMap(t=>[t,t.replace(/^le /i,'un ').replace(/^la /i,'une ').replace(/^les /i,'des ')]):target;
    let candidates=forms.flatMap(t=>[t,t.replace(direction==='en-fr'?/^(?:le |la |les |un |une |des |l[’'])/i:/^(?:the |a |an |to )/i,'')]);
    return candidates.some(t=>normalize(t)===normalize(input));
  }
  function strengthLabel(value){return value>=80?'Well known':value>=40?'Building':value>0?'Learning':'New';}
  function stateLabel(word) {const p=(data.settings.mode==='recall'?['en-fr','fr-en']:[data.settings.mode]).map(d=>progress(word.id,d));const best=Math.max(...p.map(x=>x.strength));return strengthLabel(best)+' · '+best+'%';}
  function interval(strength){return strength>=100?30*DAY:strength>=80?14*DAY:strength>=60?7*DAY:strength>=40?3*DAY:strength>=20?DAY:10*60000;}
  function showStrength(word,item){
    const target=host.querySelector('#vocab-strength');if(!target)return;
    const p=progress(word.id,item.direction);target.replaceChildren();
    target.append(el('summary','Strength '+p.strength+' / 100'));
    const meter=el('progress');meter.max=100;meter.value=p.strength;meter.setAttribute('aria-label','Word learning strength');target.append(meter);
    if(p.last){const delay=p.due-Date.now();target.append(el('small',delay<=0?'Ready to review':delay<DAY?'Review in '+Math.max(1,Math.round(delay/60000))+' min':'Review in '+Math.max(1,Math.round(delay/DAY))+' days'));}
  }
  function directionFor(word,pool='all',direction=data.settings.direction,mode=data.settings.mode) {
    const now=Date.now();
    const available=(mode==='recall'?(direction==='mixed'?['en-fr','fr-en']:[direction]):[mode]).filter(d=>{
      const p=progress(word.id,d);
      return pool==='smart'?(!p.last||p.due<=now):pool==='tricky'?(p.wrong>0&&p.strength<80):true;
    });
    available.sort((a,b)=>{
      const pa=progress(word.id,a),pb=progress(word.id,b);
      const rank=p=>p.last&&p.due<=now?0:!p.last?1:2;
      return rank(pa)-rank(pb)||pa.strength-pb.strength;
    });
    return available[0];
  }
  function selectWords(ids,exclude=new Set(),config=data.settings) {
    const now=Date.now();
    const requested=ids?new Map(ids.map(i=>typeof i==='string'?[i,null]:[i.id,i.direction])):null;
    const pool=words().filter(w=>!exclude.has(w.id)&&(config.mode!=='context'||!!w.context)&&(requested?requested.has(w.id):config.category==='all'||w.category===config.category)).map(word=>({word,direction:requested?.get(word.id)||directionFor(word,requested?'all':config.pool,config.direction,config.mode||'recall'),random:Math.random()})).filter(x=>!!x.direction);
    pool.sort((a,b)=>{
      const rank=x=>{const p=progress(x.word.id,x.direction);return p.last&&p.due<=now?0:!p.last?1:2;};
      return rank(a)-rank(b)||(rank(a)===0?progress(a.word.id,a.direction).strength-progress(b.word.id,b.direction).strength:0)||a.random-b.random;
    });
    return pool.slice(0,config.length||10).map(x=>({id:x.word.id,direction:x.direction,retry:false}));
  }
  function startRound(ids,config=data.settings) {
    const queue=selectWords(ids,new Set(),config);
    if(!queue.length){host.querySelector('#vocab-notice').textContent='No words in this selection right now. Choose “All words, any time” or another topic.';return;}
    if(data.session&&data.session.index<data.session.queue.length&&!confirm('Replace the paused round? Answers already practiced will stay saved.'))return;
    data.session={queue,index:0,original:queue.length,firstCorrect:0,xp:0,continuous:config.length===0&&!ids,answered:0,correctCount:0,skipped:[],missedTurns:[],reviews:Object.fromEntries(queue.map(i=>[i.id+'|'+i.direction,1])),config:{...config},answer:null,missed:[],recalled:[]};library=false;persist();renderSession();focusHeading();
  }
  function reviewTurns(dueOnly){
    const now=Date.now();
    return words().flatMap(word=>{
      const available=tracks.filter(d=>d!=='context'||!!word.context).map(direction=>({id:word.id,direction,p:progress(word.id,direction)})).filter(x=>x.p.last&&(!dueOnly||x.p.due<=now));
      available.sort((a,b)=>(a.p.due>now)-(b.p.due>now)||a.p.strength-b.p.strength||a.p.due-b.p.due);
      return available.length?[available[0]]:[];
    }).sort((a,b)=>(a.p.due>now)-(b.p.due>now)||a.p.strength-b.p.strength||a.p.due-b.p.due).map(({id,direction})=>({id,direction}));
  }
  function startReview(dueOnly){
    const turns=reviewTurns(dueOnly);
    if(!turns.length){renderHome();host.querySelector('#vocab-notice').textContent=dueOnly?'No words due right now. Review learned words to practice early.':'Practice a word first, then review it here.';return;}
    startRound(turns,{category:'all',direction:'mixed',mode:'recall',length:20,pool:'all'});
  }
  function renderReviewControls(){
    const stats=summary(),target=host.querySelector('#vocab-review');if(!target)return;
    host.querySelector('#vocab-summary').textContent=stats.total+' words / '+stats.learned+' strong';
    target.replaceChildren();
    if(stats.due){const due=button('Review '+stats.due+' due '+(stats.due===1?'word':'words'),()=>startReview(true),'primary');due.id='vocab-review-due';target.append(due);}
    if(stats.practiced){const known=button('Review learned words',()=>startReview(false));known.id='vocab-review-known';target.append(known);const note=el('p',stats.due?'All topics and modes · up to 20 words per round.':'Nothing due. You can still review learned words.','metrics');target.append(note);}
  }
  function settingsSelect(label,id,options,value,onchange){const field=el('div',undefined,'vocab-field');const caption=el('label',label);caption.htmlFor=id;field.append(caption);const select=el('select');select.id=id;for(const [key,text]of Object.entries(options)){const o=el('option',text);o.value=key;select.append(o);}select.value=String(value);select.onchange=()=>{onchange(select.value);persist();};field.append(select);return field;}
  function storageNote(){if(!storageOK){const p=el('p','Storage is unavailable. This round works now, but progress may not survive closing the app.','vocab-warning');p.setAttribute('role','status');host.prepend(p);}}
  function renderHome() {
    document.body.dataset.practice='false';library=true;
    host.innerHTML='<h1>Words.</h1><p id="vocab-summary" class="metrics"></p><form id="vocab-settings" class="vocab-setup"><div class="vocab-fields" id="vocab-main-fields"></div><div class="vocab-start"></div><details class="vocab-options"><summary>Options</summary><div class="vocab-fields" id="vocab-extra-fields"></div><details class="vocab-strength-help"><summary>Strength</summary><p>Correct +20. Correct retry +5. Wrong or revealed −30. Strong words rest longer; a score of 80 is strong. Each practice mode is scored separately. These are practice scores, not measured memory probabilities.</p></details></details><p id="vocab-notice" role="status"></p></form><details class="vocab-collection"><summary>Word list</summary><label class="vocab-search-label" for="vocab-search">Search</label><input id="vocab-search" class="search" type="search" placeholder="French or English"><p id="vocab-word-count" class="metrics"></p><div id="vocab-word-list"></div></details><details class="vocab-add"><summary>Add words</summary><form id="vocab-add-form"><label>French<input name="french" lang="fr" maxlength="100" required autocomplete="off"></label><label>English<input name="english" lang="en" maxlength="100" required autocomplete="off"></label><label>Usage note (optional)<input name="usage" maxlength="240"></label><button class="primary" type="submit">Add</button><p id="vocab-add-status" role="status"></p></form></details>';
    const reviews=el('section',undefined,'vocab-review');reviews.id='vocab-review';reviews.setAttribute('aria-label','Review words');host.querySelector('#vocab-settings').before(reviews);renderReviewControls();
    host.querySelector('#vocab-main-fields').append(settingsSelect('Topic','vocab-topic',categories,data.settings.category,v=>{data.settings.category=v;renderCollection();}),settingsSelect('Mode','vocab-mode',modes,data.settings.mode,v=>{data.settings.mode=v;renderCollection();}));
    host.querySelector('#vocab-extra-fields').append(settingsSelect('Direction','vocab-direction',directions,data.settings.direction,v=>data.settings.direction=v),settingsSelect('Session length','vocab-length',{0:'Continuous',5:'5 words',10:'10 words',20:'20 words'},data.settings.length,v=>data.settings.length=+v),settingsSelect('Practice','vocab-pool',{smart:'Due + new',all:'All words',tricky:'Missed words'},data.settings.pool,v=>data.settings.pool=v));
    const start=host.querySelector('.vocab-start');
    const submit=el('button','Start','primary');submit.type='submit';start.append(submit);
    if(data.session&&data.session.index<data.session.queue.length)start.append(button('Resume',()=>{library=false;renderSession();focusHeading();},'primary'));
    host.querySelector('#vocab-settings').onsubmit=e=>{e.preventDefault();startRound();};
    host.querySelector('#vocab-search').value=query;
    host.querySelector('#vocab-search').oninput=e=>{query=e.target.value;renderCollection();};
    host.querySelector('#vocab-add-form').onsubmit=addWord;
    renderCollection();storageNote();
  }
  function renderCollection(){
    const target=host.querySelector('#vocab-word-list');if(!target)return;
    target.replaceChildren();const q=normalize(query);const list=words().filter(w=>(data.settings.category==='all'||w.category===data.settings.category)&&(data.settings.mode!=='context'||!!w.context)&&(!q||normalize(w.fr+' '+w.en).includes(q)));
    host.querySelector('#vocab-word-count').textContent=list.length+' WORDS';
    if(!list.length){target.append(el('p','No matching words. Change the topic or search, or add your own pair.','empty'));return;}
    for(const word of list){
      const card=el('details',undefined,'vocab-word');const title=el('summary');const name=el('span',word.fr);name.lang='fr';title.append(name,el('span',word.en,'vocab-word-meaning'),el('small',stateLabel(word),'vocab-word-state'));card.append(title);
      if(word.pronunciation)card.append(el('p',word.pronunciation,'phonetic'));
      if(word.example){const p=el('p',word.example);p.lang='fr';card.append(p,el('p',word.exampleEn,'translation'));}
      if(word.usage)card.append(el('p',word.usage));
      card.append(audioButtons(word));
      const p=el('p',tracks.map(d=>trackLabel[d]+': '+progress(word.id,d).strength+'% strength · '+progress(word.id,d).right+' correct').join(' · '),'metrics');card.append(p);
      if(word.category==='custom')card.append(button('Remove my word',()=>{if(!confirm('Remove this word pair and its vocabulary progress?'))return;data.custom=data.custom.filter(w=>w.id!==word.id);delete data.progress[word.id];if(data.session?.queue.some(i=>i.id===word.id))data.session=null;persist();window.LearningSync?.record('custom.delete',{wordId:word.id});renderHome();}));
      target.append(card);
    }
  }
  function addWord(event){
    event.preventDefault();const form=event.currentTarget,status=host.querySelector('#vocab-add-status');const fr=form.elements.french.value.trim(),en=form.elements.english.value.trim();
    if(!fr||!en)return;
    if(data.custom.length>=100){status.textContent='Your personal list holds up to 100 pairs. Remove one to add another.';return;}
    if(words().some(w=>normalize(w.fr)===normalize(fr)&&normalize(w.en)===normalize(en))){status.textContent='That word pair is already in your collection.';return;}
    const word={id:'own-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),category:'custom',fr,en,frAccepted:[],enAccepted:[],example:'',exampleEn:'',usage:form.elements.usage.value.trim(),pronunciation:''};
    data.custom.push(word);persist();window.LearningSync?.record('custom.put',{word});form.reset();status.textContent=storageOK?'Added to My own words. Choose that topic to practice it.':'Added for this visit; storage is unavailable.';renderCollection();
    renderReviewControls();
  }
  function needsIntroduction(word,item){
    const studied=!!data.introduced[word.id]||tracks.some(d=>progress(word.id,d).right>0);
    if(!studied)return true;
    return ['context','listen'].includes(item.direction)&&!data.introduced[word.id+'|'+item.direction]&&!progress(word.id,item.direction).last;
  }
  function usageContent(word,item,target){
    let sentence=word.example,translation=word.exampleEn;
    if(item.direction==='context'&&word.context){sentence=word.context.sentence.replace('____',word.context.answer);translation=word.context.translation;}
    if(sentence){const p=el('p',sentence,'intro-example');p.lang='fr';target.append(p,el('p',translation,'translation'));}
    if(word.usage)target.append(el('p',word.usage,'intro-usage vocab-usage'));
  }
  function spellingContent(word,item){
    const spelling=(item.direction==='context'?word.context.answer:word.fr).normalize('NFC');
    const details=el('details',undefined,'vocab-spelling');
    details.append(el('summary','Spelling & accents'));
    const form=el('p',spelling,'vocab-spelling-word');form.lang='fr';details.append(form);
    const letters=el('p',Array.from(spelling).map(letter=>/\s/u.test(letter)?' / ':letter).join(' · ').replace(/ ·  \/  · /g,' / '),'vocab-spelling-letters');letters.lang='fr';details.append(letters);
    const names={'é':'e with acute accent','è':'e with grave accent','ê':'e with circumflex','ë':'e with diaeresis','à':'a with grave accent','â':'a with circumflex','ä':'a with diaeresis','î':'i with circumflex','ï':'i with diaeresis','ô':'o with circumflex','ö':'o with diaeresis','ù':'u with grave accent','û':'u with circumflex','ü':'u with diaeresis','ç':'c with cedilla','œ':'o and e joined','æ':'a and e joined','ÿ':'y with diaeresis'};
    const accents=[...new Set(Array.from(spelling.toLowerCase()).filter(letter=>names[letter]))];
    if(accents.length)details.append(el('p',accents.map(letter=>letter+' = '+names[letter]).join('; ')+'.'));
    if(/^(?:le |un )/i.test(word.fr))details.append(el('p','Masculine singular: learn the noun with le (the) or un (a).'));
    else if(/^(?:la |une )/i.test(word.fr))details.append(el('p','Feminine singular: learn the noun with la (the) or une (a).'));
    else if(/^l[’']/i.test(word.fr))details.append(el('p','The article le or la becomes l’ before a vowel or a silent h. The apostrophe joins it to the noun.'));
    else if(/^(?:les |des )/i.test(word.fr))details.append(el('p','Plural: les means the; des means some.'));
    return details;
  }
  function learningNotes(word,item){
    const notes=el('section',undefined,'vocab-learning-notes');notes.setAttribute('aria-label','Word guide');
    if(item.direction==='context'&&normalize(word.context.answer)!==normalize(word.fr))notes.append(el('p','Dictionary form: '+word.fr,'translation'));
    if(word.pronunciation)notes.append(el('p','Say '+word.fr+': '+word.pronunciation+' (approx.)','phonetic'));
    notes.append(audioButtons(word));usageContent(word,item,notes);notes.append(spellingContent(word,item));
    return notes;
  }
  function renderIntroduction(word,item){
    document.body.dataset.practice='true';host.innerHTML='<div class="vocab-session-top"><button id="vocab-pause" class="secondary">Back</button><span class="eyebrow">NEW WORD</span></div><section class="vocab-intro" aria-labelledby="intro-word"><h1 id="intro-word" data-vocab-heading></h1><p id="intro-meaning" class="intro-meaning"></p><div id="intro-audio"></div><div id="intro-usage"></div><button id="intro-continue" class="primary">Continue</button></section>';
    host.querySelector('#vocab-pause').onclick=()=>{context.stop?.();persist();renderHome();};
    const title=host.querySelector('#intro-word');title.textContent=word.fr;title.lang='fr';title.className='intro-word';
    host.querySelector('#intro-meaning').textContent=word.en;
    host.querySelector('#intro-audio').append(audioButtons(word));
    const target=host.querySelector('#intro-usage');usageContent(word,item,target);
    if(word.pronunciation)target.append(el('p',word.pronunciation,'phonetic'));
    host.querySelector('.vocab-intro').append(spellingContent(word,item));
    host.querySelector('#intro-continue').onclick=()=>{
      context.stop?.();const s=data.session;data.introduced[word.id]=Date.now();
      if(['context','listen'].includes(item.direction))data.introduced[word.id+'|'+item.direction]=Date.now();
      const [turn]=s.queue.splice(s.index,1);s.queue.splice(Math.min(s.queue.length,s.index+2),0,turn);
      persist();window.LearningSync?.record('vocab.introduced',{wordId:word.id,...(['context','listen'].includes(item.direction)?{track:item.direction}:{})});renderSession();focusHeading();
    };
    storageNote();
  }
  function renderSession(){
    const session=data.session;
    if(!session||session.index>=session.queue.length){renderResult();return;}
    const item=session.queue[session.index],word=words().find(w=>w.id===item.id);
    if(!word){data.session=null;persist();renderHome();return;}
    if(!session.answer&&needsIntroduction(word,item)){renderIntroduction(word,item);return;}
    document.body.dataset.practice='true';
    const isListen=item.direction==='listen',isContext=item.direction==='context',toFrench=item.direction!=='fr-en';
    host.innerHTML='<div class="vocab-session-top"><button id="vocab-pause" class="secondary">Back</button><span class="eyebrow" id="vocab-turn"></span></div><section class="vocab-quiz" aria-labelledby="vocab-prompt"><div class="vocab-question-meta"></div><details id="vocab-strength" class="vocab-strength"><summary>Strength</summary></details><progress id="vocab-round-progress" aria-label="Quiz turns completed"></progress><p class="vocab-instruction"></p><h1 id="vocab-prompt" data-vocab-heading></h1><p id="vocab-prompt-translation" class="translation"></p><div id="vocab-listening"></div><form id="vocab-answer-form"><label class="sr-only" for="vocab-answer">Answer</label><input id="vocab-answer" class="search" maxlength="200" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="done"><details id="vocab-accents"><summary>Accents</summary><div></div></details><div class="vocab-answer-actions"><button id="vocab-check" class="primary" type="submit">Check</button><button id="vocab-tip" class="secondary" type="button">Tip</button><button id="vocab-reveal" class="secondary" type="button">Reveal</button></div></form><p id="vocab-tip-text" class="metrics" role="status"></p><div id="vocab-feedback" aria-live="polite"></div></section>';
    host.querySelector('#vocab-pause').onclick=()=>{context.stop?.();persist();renderHome();};
    host.querySelector('#vocab-turn').textContent=trackLabel[item.direction];
    host.querySelector('.vocab-question-meta').append(el('span',trackLabel[item.direction],'level'));host.querySelector('.vocab-quiz').dataset.mode=item.direction;
    showStrength(word,item);
    const bar=host.querySelector('#vocab-round-progress');bar.hidden=session.continuous;bar.max=session.queue.length;bar.value=session.index;
    host.querySelector('.vocab-instruction').textContent=isListen?'Type what you hear, including the article.':isContext?'Fill the gap.':toFrench?'In French:':'In English:';
    const prompt=host.querySelector('#vocab-prompt');prompt.textContent=isListen?'Listen.':isContext?word.context.sentence:toFrench?word.en:word.fr;prompt.lang=toFrench&&!isContext?'en':'fr';host.querySelector('.vocab-instruction').hidden=true;
    if(isContext)host.querySelector('#vocab-prompt-translation').textContent=word.context.translation;
    const input=host.querySelector('#vocab-answer');input.lang=toFrench?'fr':'en';input.placeholder=toFrench?'French':'English';
    if(toFrench){const row=host.querySelector('#vocab-accents>div');for(const letter of ['é','è','ê','à','ç','ù','œ']){const b=button(letter,()=>{const start=input.selectionStart??input.value.length,end=input.selectionEnd??start;input.value=input.value.slice(0,start)+letter+input.value.slice(end);input.focus();input.setSelectionRange(start+letter.length,start+letter.length);},'vocab-accent');b.setAttribute('aria-label','Insert '+letter);row.append(b);}}
    else host.querySelector('#vocab-accents').hidden=true;
    let tipVisible=false;
    function renderTip(){
      const answer=isContext?word.context.answer:toFrench?word.fr:word.en;
      const article=answer.match(toFrench?/^(le |la |les |un |une |des |l[’'])/i:/^(the |a |an |to )/i)?.[0]||'';
      const body=answer.slice(article.length);
      const hint=body.replace(/\p{L}+/gu,part=>{const letters=Array.from(part);return letters.map((letter,i)=>i===0&&letters.length>1?letter:'_').join('');});
      const letters=Array.from(body.match(/\p{L}/gu)||[]).length;
      host.querySelector('#vocab-tip-text').textContent='Tip: '+article+hint+' · '+letters+' '+(letters===1?'letter':'letters');
      host.querySelector('#vocab-tip').disabled=true;
    }
    host.querySelector('#vocab-tip').onclick=()=>{tipVisible=true;item.hinted=true;persist();renderTip();};
    let heard=!isListen,playGeneration=0;
    if(isListen){
      const audio=host.querySelector('#vocab-listening');const status=el('p','Play the word to begin.','metrics');status.setAttribute('role','status');
      const skip=button('Skip audio',()=>{if(!session.skipped.includes(word.id))session.skipped.push(word.id);advance();});skip.hidden=false;
      const play=async slow=>{
        const generation=++playGeneration;status.textContent='Playing…';
        const ok=await context.speak?.(word.fr,slow);
        if(!host.contains(status)||generation!==playGeneration)return;
        heard=ok===true;host.querySelector('#vocab-check').disabled=!!session.answer||!heard;host.querySelector('#vocab-reveal').disabled=!!session.answer||!heard;host.querySelector('#vocab-tip').disabled=!!session.answer||tipVisible||!heard;
        status.textContent=heard?'Type the French you heard.':'Audio unavailable. Skip without changing strength.';skip.hidden=false;
      };
      audio.append(button('Play',()=>play(false)),button('Slow',()=>play(true)),skip,status);
      host.querySelector('#vocab-check').disabled=true;host.querySelector('#vocab-reveal').disabled=true;host.querySelector('#vocab-tip').disabled=true;
    }
    host.querySelector('#vocab-answer-form').onsubmit=e=>{e.preventDefault();if(session.answer||!heard)return;if(!input.value.trim()){input.setAttribute('aria-invalid','true');host.querySelector('#vocab-feedback').textContent='Type an answer or reveal it.';input.focus();return;}grade(word,item,input.value,false);};
    host.querySelector('#vocab-reveal').onclick=()=>{if(isListen&&!heard)return;grade(word,item,'',true);};
    host.querySelector('#vocab-answer-form').append(host.querySelector('#vocab-accents'));host.querySelector('.vocab-quiz').append(host.querySelector('#vocab-strength'));
    if(session.answer){input.value=session.answer.text;showFeedback(word,item);}
    storageNote();
  }
  function grade(word,item,text,revealed){
    const s=data.session;if(!s||s.answer)return;
    const ok=!revealed&&matches(word,item.direction,text);s.answer={ok,text,revealed};
    const p={...progress(word.id,item.direction)};p.last=Date.now();
    s.answered=(s.answered||0)+1;
    if(ok){
      p.right++;p.streak=Math.min(5,p.streak+1);p.strength=Math.min(100,(p.strength||0)+(item.retry||item.hinted?5:20));p.due=p.last+(item.retry||item.hinted?10*60000:interval(p.strength));
      s.correctCount=(s.correctCount||0)+1;
      if(!s.recalled.includes(word.id))s.recalled.push(word.id);
      if(!item.retry&&!item.hinted){s.firstCorrect++;s.xp+=5;}
    }else{
      p.wrong++;p.streak=0;p.strength=Math.max(0,(p.strength||0)-30);p.due=p.last;
      if(!s.missed.includes(word.id))s.missed.push(word.id);
      if(!s.missedTurns.some(i=>i.id===word.id&&i.direction===item.direction))s.missedTurns.push({id:word.id,direction:item.direction});
      const key=item.id+'|'+item.direction;
      const appearances=s.continuous?(s.reviews[key]||1):s.queue.filter(i=>i.id===item.id&&i.direction===item.direction).length;
      if(appearances<3){s.queue.splice(Math.min(s.queue.length,s.index+3),0,{id:item.id,direction:item.direction,retry:true});s.reviews[key]=appearances+1;}
      else p.due=p.last+10*60000;
    }
    if(!data.progress[word.id])data.progress[word.id]={};data.progress[word.id][item.direction]=p;
    persist();context.onPractice?.(ok&&!item.retry&&!item.hinted?5:0);window.LearningSync?.record('vocab.attempt',{wordId:word.id,track:item.direction,ok,retry:!!(item.retry||item.hinted),cooldown:!ok&&p.due>p.last,day:new Date().toLocaleDateString('en-CA')});showFeedback(word,item);
    if(!storageOK)storageNote();
  }
  function showFeedback(word,item){
    const s=data.session,a=s.answer,answer=item.direction==='context'?word.context.answer:item.direction==='fr-en'?word.en:word.fr;
    const feedback=host.querySelector('#vocab-feedback');feedback.replaceChildren();
    const box=el('div',undefined,'feedback '+(a.ok?'vocab-correct':'vocab-retry'));
    box.append(el('strong',a.ok?'Correct.':'Answer:'),el('p',answer,'vocab-correct-answer'));
    if(item.direction==='listen')box.append(el('p',word.en,'translation'));
    feedback.append(box);showStrength(word,item);
    const next=button(!s.continuous&&s.index===s.queue.length-1?'Finish':'Next',advance,'primary');next.id='vocab-next';feedback.append(next);
    feedback.append(learningNotes(word,item));
    host.querySelector('#vocab-answer').disabled=true;host.querySelector('#vocab-check').disabled=true;host.querySelector('#vocab-reveal').disabled=true;host.querySelector('#vocab-tip').disabled=true;host.querySelectorAll('.vocab-accent').forEach(b=>b.disabled=true);
    host.querySelector('#vocab-answer-form').hidden=true;host.querySelector('#vocab-tip-text').hidden=true;next.focus({preventScroll:true});
    host.querySelector('#vocab-turn').textContent=trackLabel[item.direction];
    host.querySelector('#vocab-round-progress').max=s.queue.length;
  }
  function advance(){
    const s=data.session;if(!s)return;context.stop?.();s.index++;s.answer=null;
    if(s.continuous){
      // Keep a small rolling queue; successfully recalled words are excluded by their due date.
      if(s.queue.length-s.index<=3){
        const exclude=new Set([...s.queue.slice(Math.max(0,s.index-3)).map(i=>i.id),...(s.skipped||[])]);
        const added=selectWords(undefined,exclude,s.config);
        for(const item of added){s.reviews[item.id+'|'+item.direction]=1;s.queue.push(item);}
        s.original+=added.length;
      }
      if(s.index>=20){const remove=s.index-6;s.queue.splice(0,remove);s.index-=remove;}
    }
    persist();renderSession();
    const input=host.querySelector('#vocab-answer');if(input)input.focus();else focusHeading();
  }
  function renderResult(){
    document.body.dataset.practice='false';const s=data.session;if(!s){renderHome();return;}
    host.innerHTML='<section class="vocab-result"><div class="eyebrow">ROUND COMPLETE</div><h1 data-vocab-heading>Done.</h1><p id="vocab-result-score"></p><p id="vocab-result-summary" class="sub"></p><div class="vocab-result-actions"></div><div id="vocab-result-words"></div><p id="vocab-notice" role="status"></p></section>';
    if(s.continuous){host.querySelector('.eyebrow').textContent='ALL CAUGHT UP';host.querySelector('h1').textContent='Caught up.';}
    if(s.skipped?.length){host.querySelector('h1').textContent='Audio skipped.';}
    host.querySelector('#vocab-result-score').textContent=s.correctCount+' correct / '+s.answered+' answered';
    host.querySelector('#vocab-result-summary').textContent=s.skipped?.length?'Skipped audio did not change strength. Try Recall or Sentence, or test audio while online.':s.continuous?'No words due. Change topic or come back later.':s.recalled.length+' words recalled by the end of the round. '+(s.missed.length?'The words you missed are listed below.':'Come back tomorrow for a fresh recall test.');
    const actions=host.querySelector('.vocab-result-actions');actions.append(button('Back',()=>{data.session=null;persist();renderHome();},'primary'));
    if(s.missed.length)actions.append(button('Review mistakes',()=>{const turns=s.missedTurns.length?s.missedTurns:s.queue.filter(i=>!i.retry&&s.missed.includes(i.id)).map(i=>({id:i.id,direction:i.direction}));data.session=null;startRound(turns,s.config);}));
    const target=host.querySelector('#vocab-result-words');for(const id of s.missed){const w=words().find(w=>w.id===id);if(w){const card=el('div',undefined,'phrase');const text=el('div');const french=el('h3',w.fr);french.lang='fr';text.append(french,el('p',w.en));card.append(text,audioButtons(w));target.append(card);}}
    storageNote();
  }
  window.VocabularyTrainer={
    render(element,options={}){host=element;context=options;if(data.session&&!library)renderSession();else renderHome();},
    summary,
    reviewDue(){startReview(true);},
    reviewKnown(){startReview(false);},
    snapshot(){return structuredClone({progress:data.progress,introduced:data.introduced,custom:data.custom});},
    acceptSync(incoming){
      if(!incoming)return false;
      data.progress=structuredClone(incoming.progress);data.introduced=structuredClone(incoming.introduced);data.custom=structuredClone(incoming.custom);
      const ids=new Set(words().map(w=>w.id));
      const invalid=!!data.session?.queue.some(i=>!ids.has(i.id));
      if(invalid){data.session=null;library=true;persist();}
      if(library&&host?.querySelector('#vocab-word-list')){renderCollection();renderReviewControls();}
      return invalid;
    },
    resetProgress(){data.progress={};data.introduced={};data.session=null;persist();},
    // Pure matcher exposed for meaningful vocabulary-content regression checks.
    matches
  };
})();
