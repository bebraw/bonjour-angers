/* Local vocabulary practice: no account, API, or network required. */
(() => {
  'use strict';
  const KEY='bonjour-angers-vocabulary-v1';
  const DAY=86400000;
  const categories={all:'All words',essentials:'Everyday essentials',travel:'Travel & getting around',food:'Cafés & restaurants',conference:'Academic conferences',custom:'My own words'};
  const directions={'en-fr':'English → French','fr-en':'French → English',mixed:'Both directions'};
  const base=window.VOCABULARY_WORDS;
  const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
  let storageOK=true,host,context={},library=false,query='';
  function load() {
    const clean={progress:{},custom:[],settings:{category:'all',direction:'en-fr',length:0,pool:'smart'},session:null};
    try {
      const saved=JSON.parse(localStorage.getItem(KEY));
      if(!saved||typeof saved!=='object')return clean;
      if(Array.isArray(saved.custom)) {
        const seen=new Set();
        clean.custom=saved.custom.filter(w=>w&&typeof w.id==='string'&&/^own-[a-z0-9-]{1,80}$/.test(w.id)&&!seen.has(w.id)&&seen.add(w.id)&&typeof w.fr==='string'&&w.fr.trim()&&w.fr.length<=100&&typeof w.en==='string'&&w.en.trim()&&w.en.length<=100).slice(0,100).map(w=>({id:w.id,category:'custom',fr:w.fr,en:w.en,pronunciation:'',example:'',exampleEn:'',frAccepted:[],enAccepted:[]}));
      }
      const ids=new Set([...base,...clean.custom].map(w=>w.id));
      if(saved.progress&&typeof saved.progress==='object')for(const id of ids) {
        const source=saved.progress[id];if(!source||typeof source!=='object')continue;
        clean.progress[id]={};
        for(const direction of ['en-fr','fr-en']) {
          const p=source[direction];if(!p||typeof p!=='object')continue;
          clean.progress[id][direction]={right:count(p.right),wrong:count(p.wrong),streak:Math.min(5,count(p.streak)),strength:Math.min(100,p.strength===undefined?Math.min(5,count(p.streak))*20:count(p.strength)),due:count(p.due),last:count(p.last)};
        }
      }
      const settings=saved.settings||{};
      if(Object.hasOwn(categories,settings.category))clean.settings.category=settings.category;
      if(Object.hasOwn(directions,settings.direction))clean.settings.direction=settings.direction;
      if([0,5,10,20].includes(settings.length))clean.settings.length=settings.length;
      if(['smart','all','tricky'].includes(settings.pool))clean.settings.pool=settings.pool;
      const s=saved.session;
      if(s&&Array.isArray(s.queue)&&s.queue.length>0&&s.queue.length<=60&&s.queue.every(i=>i&&ids.has(i.id)&&['en-fr','fr-en'].includes(i.direction)&&typeof i.retry==='boolean')&&Number.isInteger(s.index)&&s.index>=0&&s.index<=s.queue.length) {
        const answer=s.answer&&typeof s.answer.ok==='boolean'&&typeof s.answer.text==='string'?{ok:s.answer.ok,text:s.answer.text.slice(0,200),revealed:!!s.answer.revealed}:null;
        clean.session={queue:s.queue.map(i=>({id:i.id,direction:i.direction,retry:i.retry})),index:s.index,original:Math.min(20,count(s.original)),firstCorrect:count(s.firstCorrect),xp:count(s.xp),continuous:!!s.continuous,answered:count(s.answered),correctCount:count(s.correctCount),reviews:{},missedTurns:Array.isArray(s.missedTurns)?s.missedTurns.filter(i=>i&&ids.has(i.id)&&['en-fr','fr-en'].includes(i.direction)).map(i=>({id:i.id,direction:i.direction})).slice(0,ids.size*2):[],config:{...clean.settings},answer,missed:Array.isArray(s.missed)?[...new Set(s.missed.filter(id=>ids.has(id)))]:[],recalled:Array.isArray(s.recalled)?[...new Set(s.recalled.filter(id=>ids.has(id)))]:[]};
        if(s.config&&Object.hasOwn(categories,s.config.category)&&Object.hasOwn(directions,s.config.direction)&&['smart','all','tricky'].includes(s.config.pool))clean.session.config={category:s.config.category,direction:s.config.direction,pool:s.config.pool,length:0};
        if(s.reviews&&typeof s.reviews==='object')for(const id of ids)for(const d of ['en-fr','fr-en']){const key=id+'|'+d;if(s.reviews[key])clean.session.reviews[key]=Math.min(3,count(s.reviews[key]));}
      }
    }catch {storageOK=false;}
    return clean;
  }
  let data=load();
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(data));storageOK=true;}catch{storageOK=false;}}
  function words(){return [...base,...data.custom];}
  function progress(id,direction){return data.progress[id]?.[direction]||{right:0,wrong:0,streak:0,strength:0,due:0,last:0};}
  function summary(){let learned=0,due=0,seen=0;const now=Date.now();for(const w of words()){const p=['en-fr','fr-en'].map(d=>progress(w.id,d));if(p.some(x=>x.last))seen++;if(p.some(x=>x.strength>=80))learned++;if(p.some(x=>x.last&&x.due<=now))due++;}return {total:words().length,learned,due,new:words().length-seen};}
  function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
  function button(text,action,className='secondary'){const b=el('button',text,className);b.type='button';b.onclick=action;return b;}
  function audioButtons(word){const row=el('div',undefined,'audio-row');row.append(button('▶ Listen',()=>context.speak?.(word.fr)),button('◷ Slow',()=>context.speak?.(word.fr,true)));row.children[0].setAttribute('aria-label','Listen: '+word.fr);row.children[1].setAttribute('aria-label','Listen slowly: '+word.fr);return row;}
  function focusHeading(){const h=host.querySelector('[data-vocab-heading]');if(h){h.tabIndex=-1;h.focus({preventScroll:true});}}
  function normalize(text){return text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/œ/g,'oe').replace(/æ/g,'ae').replace(/[’']/g,'').replace(/[-‐‑]/g,' ').replace(/[.,!?;:]/g,'').replace(/\s+/g,' ').trim();}
  function matches(word,direction,input) {
    const target=direction==='en-fr'?[word.fr,...word.frAccepted]:[word.en,...word.enAccepted];
    const forms=direction==='en-fr'?target.flatMap(t=>[t,t.replace(/^le /i,'un ').replace(/^la /i,'une ').replace(/^les /i,'des ')]):target;
    let candidates=forms.flatMap(t=>[t,t.replace(direction==='en-fr'?/^(?:le |la |les |un |une |des |l[’'])/i:/^(?:the |a |an |to )/i,'')]);
    return candidates.some(t=>normalize(t)===normalize(input));
  }
  function strengthLabel(value){return value>=80?'Well known':value>=40?'Building':value>0?'Learning':'New';}
  function stateLabel(word) {const p=['en-fr','fr-en'].map(d=>progress(word.id,d));const best=Math.max(...p.map(x=>x.strength));return strengthLabel(best)+' · '+best+'%';}
  function interval(strength){return strength>=100?30*DAY:strength>=80?14*DAY:strength>=60?7*DAY:strength>=40?3*DAY:strength>=20?DAY:10*60000;}
  function showStrength(word,item){
    const target=host.querySelector('#vocab-strength');if(!target)return;
    const p=progress(word.id,item.direction);target.replaceChildren();
    target.append(el('span','Learning strength: '+p.strength+'% · '+strengthLabel(p.strength)));
    const meter=el('progress');meter.max=100;meter.value=p.strength;meter.setAttribute('aria-label','Word learning strength');target.append(meter);
    if(p.last){const delay=p.due-Date.now();target.append(el('small',delay<=0?'Ready to review':delay<DAY?'Next review in about '+Math.max(1,Math.round(delay/60000))+' minutes':'Next review in about '+Math.max(1,Math.round(delay/DAY))+' days'));}
  }
  function directionFor(word,pool='all',direction=data.settings.direction) {
    const now=Date.now();
    const available=(direction==='mixed'?['en-fr','fr-en']:[direction]).filter(d=>{
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
    const pool=words().filter(w=>!exclude.has(w.id)&&(requested?requested.has(w.id):config.category==='all'||w.category===config.category)).map(word=>({word,direction:requested?.get(word.id)||directionFor(word,requested?'all':config.pool,config.direction),random:Math.random()})).filter(x=>!!x.direction);
    pool.sort((a,b)=>{
      const rank=x=>{const p=progress(x.word.id,x.direction);return p.last&&p.due<=now?0:!p.last?1:2;};
      return rank(a)-rank(b)||(rank(a)===0?progress(a.word.id,a.direction).strength-progress(b.word.id,b.direction).strength:0)||a.random-b.random;
    });
    return pool.slice(0,config.length||10).map(x=>({id:x.word.id,direction:x.direction,retry:false}));
  }
  function startRound(ids) {
    const queue=selectWords(ids);
    if(!queue.length){host.querySelector('#vocab-notice').textContent='No words in this selection right now. Choose “All words, any time” or another topic.';return;}
    if(data.session&&data.session.index<data.session.queue.length&&!confirm('Replace the paused round? Answers already practiced will stay saved.'))return;
    data.session={queue,index:0,original:queue.length,firstCorrect:0,xp:0,continuous:data.settings.length===0&&!ids,answered:0,correctCount:0,missedTurns:[],reviews:Object.fromEntries(queue.map(i=>[i.id+'|'+i.direction,1])),config:{...data.settings},answer:null,missed:[],recalled:[]};library=false;persist();renderSession();focusHeading();
  }
  function settingsSelect(label,id,options,value,onchange){const field=el('div',undefined,'vocab-field');const caption=el('label',label);caption.htmlFor=id;field.append(caption);const select=el('select');select.id=id;for(const [key,text]of Object.entries(options)){const o=el('option',text);o.value=key;select.append(o);}select.value=String(value);select.onchange=()=>{onchange(select.value);persist();};field.append(select);return field;}
  function storageNote(){if(!storageOK){const p=el('p','Storage is unavailable. This round works now, but progress may not survive closing the app.','vocab-warning');p.setAttribute('role','status');host.prepend(p);}}
  function renderHome() {
    library=true;const stats=summary();
    host.innerHTML='<h1>One word at a time.</h1><p class="sub">See a word. Recall its translation. Keep the useful ones with you.</p><div class="vocab-summary"></div><section class="vocab-setup"><div class="eyebrow">YOUR VOCABULARY WORKOUT</div><h2>Keep the words you need.</h2><p>Keep learning for as long as you like. Weak and new words come first. Words you know well rest until their next review.</p><form id="vocab-settings"><div class="vocab-fields"></div><div class="vocab-start"></div></form><p id="vocab-notice" role="status"></p><p class="metrics">French articles are shown with nouns. You can answer without the article; a wrong article is still checked. Accents and punctuation are optional.</p></section><details class="vocab-strength-help"><summary>How learning strength works</summary><p>Each direction has a 0–100 practice score. Correct recall adds 20 points; a correct repeat after a mistake adds 5; a mistake or revealing the answer removes 30. At 80 points a word is well known. Successful words rest for 1, 3, 7, 14 or 30 days as strength grows. Correct repeats and words missed three times rest for 10 minutes. Default practice skips resting words.</p></details><div class="section-heading"><h2>Your word collection</h2><span id="vocab-word-count"></span></div><label class="vocab-search-label" for="vocab-search">Find a French or English word</label><input id="vocab-search" class="search" type="search" placeholder="Try gare, coffee, presentation…"><div id="vocab-word-list"></div><details class="vocab-add"><summary>Add your own word pairs</summary><p>Build a personal list for your research field or words you hear in Angers.</p><form id="vocab-add-form"><label>French word or phrase<input name="french" lang="fr" maxlength="100" required placeholder="la recherche" autocomplete="off"></label><label>English meaning<input name="english" lang="en" maxlength="100" required placeholder="research" autocomplete="off"></label><button class="primary" type="submit">Add word pair</button><p id="vocab-add-status" role="status"></p></form></details><p class="metrics">Progress is saved on this device. Strength is tracked separately in each direction. Words reach “well known” at 80%; due words return to keep them fresh. Audio uses your device’s French voice; pronunciation hints and all quizzes work offline.</p>';
    const metrics=host.querySelector('.vocab-summary');
    for(const [value,label]of [[stats.total,'Words in your collection'],[stats.due,'Ready to review'],[stats.learned,'Well-known words']]){const box=el('div',undefined,'vocab-metric');box.append(el('strong',String(value)),el('span',label));metrics.append(box);}
    const fields=host.querySelector('.vocab-fields');
    fields.append(settingsSelect('Topic','vocab-topic',categories,data.settings.category,v=>{data.settings.category=v;renderCollection();}),settingsSelect('Direction','vocab-direction',directions,data.settings.direction,v=>data.settings.direction=v),settingsSelect('Session length','vocab-length',{0:'Continuous · stop anytime',5:'5 words',10:'10 words',20:'20 words'},data.settings.length,v=>data.settings.length=+v),settingsSelect('Practice','vocab-pool',{smart:'Due words & new words',all:'All words, any time',tricky:'Words I have missed'},data.settings.pool,v=>data.settings.pool=v));
    const start=host.querySelector('.vocab-start');
    const submit=el('button','Start learning →','primary');submit.type='submit';start.append(submit);
    if(data.session&&data.session.index<data.session.queue.length)start.append(button('Resume learning',()=>{library=false;renderSession();focusHeading();}));
    host.querySelector('#vocab-settings').onsubmit=e=>{e.preventDefault();startRound();};
    host.querySelector('#vocab-search').value=query;
    host.querySelector('#vocab-search').oninput=e=>{query=e.target.value;renderCollection();};
    host.querySelector('#vocab-add-form').onsubmit=addWord;
    host.insertBefore(host.querySelector('.vocab-add'),host.querySelector('.section-heading'));
    renderCollection();storageNote();
  }
  function renderCollection(){
    const target=host.querySelector('#vocab-word-list');if(!target)return;
    target.replaceChildren();const q=normalize(query);const list=words().filter(w=>(data.settings.category==='all'||w.category===data.settings.category)&&(!q||normalize(w.fr+' '+w.en).includes(q)));
    host.querySelector('#vocab-word-count').textContent=list.length+' WORDS';
    if(!list.length){target.append(el('p','No matching words. Change the topic or search, or add your own pair.','empty'));return;}
    for(const word of list){
      const card=el('details',undefined,'vocab-word');const title=el('summary');const name=el('span',word.fr);name.lang='fr';title.append(name,el('span',word.en,'vocab-word-meaning'),el('small',stateLabel(word),'vocab-word-state'));card.append(title);
      if(word.pronunciation)card.append(el('p',word.pronunciation,'phonetic'));
      if(word.example){const p=el('p',word.example);p.lang='fr';card.append(p,el('p',word.exampleEn,'translation'));}
      card.append(audioButtons(word));
      const p=el('p',['en-fr','fr-en'].map(d=>directions[d]+': '+progress(word.id,d).strength+'% strength · '+progress(word.id,d).right+' correct').join(' · '),'metrics');card.append(p);
      if(word.category==='custom')card.append(button('Remove my word',()=>{if(!confirm('Remove this word pair and its vocabulary progress?'))return;data.custom=data.custom.filter(w=>w.id!==word.id);delete data.progress[word.id];if(data.session?.queue.some(i=>i.id===word.id))data.session=null;persist();renderHome();}));
      target.append(card);
    }
  }
  function addWord(event){
    event.preventDefault();const form=event.currentTarget,status=host.querySelector('#vocab-add-status');const fr=form.elements.french.value.trim(),en=form.elements.english.value.trim();
    if(!fr||!en)return;
    if(data.custom.length>=100){status.textContent='Your personal list holds up to 100 pairs. Remove one to add another.';return;}
    if(words().some(w=>normalize(w.fr)===normalize(fr)&&normalize(w.en)===normalize(en))){status.textContent='That word pair is already in your collection.';return;}
    const word={id:'own-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),category:'custom',fr,en,frAccepted:[],enAccepted:[],example:'',exampleEn:'',pronunciation:''};
    data.custom.push(word);persist();form.reset();status.textContent=storageOK?'Added to My own words. Choose that topic to practice it.':'Added for this visit; storage is unavailable.';renderCollection();
    host.querySelectorAll('.vocab-metric strong')[0].textContent=String(words().length);
  }
  function renderSession(){
    const session=data.session;
    if(!session||session.index>=session.queue.length){renderResult();return;}
    const item=session.queue[session.index],word=words().find(w=>w.id===item.id);
    if(!word){data.session=null;persist();renderHome();return;}
    const toFrench=item.direction==='en-fr';
    host.innerHTML='<div class="vocab-session-top"><button id="vocab-pause" class="secondary">← Pause & word collection</button><span class="eyebrow" id="vocab-turn"></span></div><section class="vocab-quiz" aria-labelledby="vocab-prompt"><div class="vocab-question-meta"></div><div id="vocab-strength" class="vocab-strength"></div><progress id="vocab-round-progress" aria-label="Quiz turns completed"></progress><p class="vocab-instruction"></p><h1 id="vocab-prompt" data-vocab-heading></h1><form id="vocab-answer-form"><label for="vocab-answer">Your translation</label><input id="vocab-answer" class="search" maxlength="200" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="done"><div id="vocab-accents"></div><div class="vocab-answer-actions"><button id="vocab-check" class="primary" type="submit">Check answer</button><button id="vocab-reveal" class="secondary" type="button">Show answer</button></div></form><div id="vocab-feedback" aria-live="polite"></div></section><p class="metrics">Enter checks your answer. Press Enter again for the next word. Missed words return up to twice more before taking a short rest. You can pause anytime.</p>';
    host.querySelector('#vocab-pause').onclick=()=>{persist();renderHome();};
    host.querySelector('#vocab-turn').textContent=session.continuous?'CONTINUOUS · '+session.answered+' ANSWERED':'TURN '+(session.index+1)+' / '+session.queue.length;
    host.querySelector('.vocab-question-meta').append(el('span',directions[item.direction],'level'),el('span',item.retry?'BACK FOR ANOTHER TRY':categories[word.category],'eyebrow'));
    showStrength(word,item);
    const bar=host.querySelector('#vocab-round-progress');bar.hidden=session.continuous;bar.max=session.queue.length;bar.value=session.index;bar.setAttribute('aria-valuetext',session.index+' of '+session.queue.length+' turns completed, including reviews');
    host.querySelector('.vocab-instruction').textContent=toFrench?'How do you say this in French?':'What does this mean in English?';
    const prompt=host.querySelector('#vocab-prompt');prompt.textContent=toFrench?word.en:word.fr;prompt.lang=toFrench?'en':'fr';
    const input=host.querySelector('#vocab-answer');input.lang=toFrench?'fr':'en';input.placeholder=toFrench?'Type the French…':'Type the English…';
    if(toFrench){const row=host.querySelector('#vocab-accents');row.setAttribute('aria-label','French accented letters');for(const letter of ['é','è','ê','à','ç','ù','œ']){const b=button(letter,()=>{const start=input.selectionStart??input.value.length,end=input.selectionEnd??start;input.value=input.value.slice(0,start)+letter+input.value.slice(end);input.focus();input.setSelectionRange(start+letter.length,start+letter.length);},'vocab-accent');b.setAttribute('aria-label','Insert '+letter);row.append(b);}}
    else{host.querySelector('.vocab-question-meta').append(audioButtons(word));}
    host.querySelector('#vocab-answer-form').onsubmit=e=>{e.preventDefault();if(session.answer)return;if(!input.value.trim()){input.setAttribute('aria-invalid','true');host.querySelector('#vocab-feedback').textContent='Type a translation first, or choose Show answer.';input.focus();return;}grade(word,item,input.value,false);};
    host.querySelector('#vocab-reveal').onclick=()=>grade(word,item,'',true);
    if(session.answer){input.value=session.answer.text;showFeedback(word,item);}
    storageNote();
  }
  function grade(word,item,text,revealed){
    const s=data.session;if(!s||s.answer)return;
    const ok=!revealed&&matches(word,item.direction,text);s.answer={ok,text,revealed};
    const p={...progress(word.id,item.direction)};p.last=Date.now();
    s.answered=(s.answered||0)+1;
    if(ok){
      p.right++;p.streak=Math.min(5,p.streak+1);p.strength=Math.min(100,(p.strength||0)+(item.retry?5:20));p.due=p.last+(item.retry?10*60000:interval(p.strength));
      s.correctCount=(s.correctCount||0)+1;
      if(!s.recalled.includes(word.id))s.recalled.push(word.id);
      if(!item.retry){s.firstCorrect++;s.xp+=5;}
    }else{
      p.wrong++;p.streak=0;p.strength=Math.max(0,(p.strength||0)-30);p.due=p.last;
      if(!s.missed.includes(word.id))s.missed.push(word.id);
      if(!s.missedTurns.some(i=>i.id===word.id&&i.direction===item.direction))s.missedTurns.push({id:word.id,direction:item.direction});
      const key=item.id+'|'+item.direction;
      const appearances=s.continuous?(s.reviews[key]||1):s.queue.filter(i=>i.id===item.id&&i.direction===item.direction).length;
      if(appearances<3){s.queue.splice(Math.min(s.queue.length,s.index+3),0,{...item,retry:true});s.reviews[key]=appearances+1;}
      else p.due=p.last+10*60000;
    }
    if(!data.progress[word.id])data.progress[word.id]={};data.progress[word.id][item.direction]=p;
    persist();context.onPractice?.(ok&&!item.retry?5:0);showFeedback(word,item);
    if(!storageOK)storageNote();
  }
  function showFeedback(word,item){
    const s=data.session,a=s.answer,answer=item.direction==='en-fr'?word.fr:word.en;
    const feedback=host.querySelector('#vocab-feedback');feedback.replaceChildren();
    const box=el('div',undefined,'feedback '+(a.ok?'vocab-correct':'vocab-retry'));
    box.append(el('strong',a.ok?'Très bien ! ✓':a.revealed?'Let’s learn this one.':'A word to revisit.'));
    const target=el('p',answer,'vocab-correct-answer');target.lang=item.direction==='en-fr'?'fr':'en';box.append(target);
    if(a.ok&&item.direction==='en-fr'&&normalize(a.text)!==normalize(word.fr))box.append(el('p','Useful full form: '+word.fr));
    if(!a.ok)box.append(el('p',s.queue.slice(s.index+1).some(i=>i.id===word.id)?'This word will come back later in this round.':'You’ve tried this word three times. It will be ready for review in about 10 minutes.'));
    if(word.pronunciation)box.append(el('p',word.pronunciation,'phonetic'));
    if(word.example){const example=el('p',word.example);example.lang='fr';box.append(example,el('p',word.exampleEn,'translation'));}
    box.append(audioButtons(word));feedback.append(box);
    showStrength(word,item);
    const next=button(!s.continuous&&s.index===s.queue.length-1?'Finish round →':'Next word →',advance,'primary');next.id='vocab-next';feedback.append(next);
    host.querySelector('#vocab-answer').disabled=true;host.querySelector('#vocab-check').disabled=true;host.querySelector('#vocab-reveal').disabled=true;host.querySelectorAll('.vocab-accent').forEach(b=>b.disabled=true);
    next.focus({preventScroll:true});
    host.querySelector('#vocab-turn').textContent=s.continuous?'CONTINUOUS · '+s.answered+' ANSWERED':'TURN '+(s.index+1)+' / '+s.queue.length;
    host.querySelector('#vocab-round-progress').max=s.queue.length;
  }
  function advance(){
    const s=data.session;if(!s)return;s.index++;s.answer=null;
    if(s.continuous){
      // Keep a small rolling queue; successfully recalled words are excluded by their due date.
      if(s.queue.length-s.index<=3){
        const exclude=new Set(s.queue.slice(Math.max(0,s.index-3)).map(i=>i.id));
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
    const s=data.session;if(!s){renderHome();return;}
    host.innerHTML='<section class="vocab-result"><div class="eyebrow">ROUND COMPLETE</div><h1 data-vocab-heading>A few more words to take with you.</h1><p id="vocab-result-score"></p><p id="vocab-result-summary" class="sub"></p><div class="vocab-result-actions"></div><div id="vocab-result-words"></div><p id="vocab-notice" role="status"></p></section>';
    if(s.continuous){host.querySelector('.eyebrow').textContent='ALL CAUGHT UP';host.querySelector('h1').textContent='Your words are resting.';}
    host.querySelector('#vocab-result-score').textContent=s.continuous?s.correctCount+' / '+s.answered+' correct recalls · +'+s.xp+' XP':s.firstCorrect+' / '+s.original+' correct on the first try · +'+s.xp+' XP';
    host.querySelector('#vocab-result-summary').textContent=s.continuous?'No more eligible words in this selection right now. Known words stay out of the queue until due. Come back later, change topic, or choose “All words, any time” to practice early.':s.recalled.length+' words recalled by the end of the round. '+(s.missed.length?'The words you missed are listed below.':'Come back tomorrow for a fresh recall test.');
    const actions=host.querySelector('.vocab-result-actions');actions.append(button('Back to vocabulary',()=>{data.session=null;persist();renderHome();},'primary'));
    if(s.missed.length)actions.append(button('Practice the words I missed',()=>{const turns=s.missedTurns.length?s.missedTurns:s.queue.filter(i=>!i.retry&&s.missed.includes(i.id)).map(i=>({id:i.id,direction:i.direction}));data.session=null;startRound(turns);}));
    const target=host.querySelector('#vocab-result-words');for(const id of s.missed){const w=words().find(w=>w.id===id);if(w){const card=el('div',undefined,'phrase');const text=el('div');const french=el('h3',w.fr);french.lang='fr';text.append(french,el('p',w.en));card.append(text,audioButtons(w));target.append(card);}}
    storageNote();
  }
  window.VocabularyTrainer={
    render(element,options={}){host=element;context=options;if(data.session&&!library)renderSession();else renderHome();},
    summary,
    resetProgress(){data.progress={};data.session=null;persist();},
    // Pure matcher exposed for meaningful vocabulary-content regression checks.
    matches
  };
})();
