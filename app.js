import * as THREE from './vendor/three.module.js';
import { AUDIO_CLIPS } from './speech-clips.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const startedAt = Date.now();
const state = { emotion: 'welcome', selected: 'happy', count: 0, sound: true, speaking: false, speakingUntil: 0, yaw: 0, pitch: 0, gaze: true, wireframe: false, pointerX: 0, pointerY: 0, cameraAngle: 0, cameraTilt: 0, cameraDistance: 7.5, tour: -1, activity: 'colors', colorQuestion: 0, feelingQuestion: 0, breathing: false, breathStart: 0 };
const emotions = {
  welcome: { ar: 'ترحيب', en: 'WELCOME', name: 'تعبير الترحيب', description: 'نظرة فضولية وابتسامة لطيفة.', tags: ['ابتسامة', 'ترحيب'], text: 'مرحبًا، أنا آدا! يسعدني أن أكون صديقتك. كيف تشعر اليوم؟', eyeY: 1, eyeTilt: 0, brow: 0, smile: .14, tilt: 0, hue: '#9be5e8' },
  happy: { ar: 'سعيدة', en: 'HAPPY', name: 'تعبير الفرح', description: 'عينان مبتسمتان، ميل لطيف للرأس، وكلمات تشارك الطفل فرحته.', tags: ['ابتسامة', 'حركة مشجعة', 'صوت ودود'], text: 'يا لها من ابتسامة جميلة! فرحتك تجعل يومي أجمل. هل نتعلّم شيئًا جديدًا معًا؟', eyeY: .72, eyeTilt: .1, brow: .03, smile: .21, tilt: -.09, hue: '#9be5e8' },
  sad: { ar: 'متعاطفة', en: 'EMPATHY', name: 'تعبير التعاطف', description: 'نظرة متعاطفة، ميل هادئ للرأس، وطمأنة دون استعجال الطفل.', tags: ['تعاطف', 'طمأنة', 'حركة هادئة'], text: 'أنا هنا معك. لا بأس أن نشعر بالحزن أحيانًا. خذ وقتك، ويمكننا أن نحكي أو نلعب عندما تكون مستعدًا.', eyeY: .88, eyeTilt: -.13, brow: -.12, smile: .035, tilt: .1, hue: '#9ccff0' },
  surprised: { ar: 'مندهشة', en: 'CURIOUS', name: 'تعبير الدهشة', description: 'عينان واسعتان، ارتفاع للحاجبين، واستجابة فضولية تشجّع الاكتشاف.', tags: ['فضول', 'عينان واسعتان', 'اكتشاف'], text: 'واو، شيء جديد! أحب الاكتشاف معك. ما رأيك أن نبحث عن لونك المفضّل؟', eyeY: 1.24, eyeTilt: 0, brow: .09, smile: .07, tilt: -.035, hue: '#a8e8e3' },
  calm: { ar: 'هادئة', en: 'CALM', name: 'تعبير الهدوء', description: 'حركات أبطأ، عينان مسترخيتان، ودعوة لطيفة لأخذ نفس هادئ.', tags: ['هدوء', 'تنفّس', 'إيقاع بطيء'], text: 'لنأخذ استراحة صغيرة. تخيّل أننا نشمّ وردة، ثم ننفخ برفق على شمعة. أنا أتنفّس معك، بهدوء.', eyeY: .42, eyeTilt: .06, brow: -.01, smile: .09, tilt: .035, hue: '#a4ddd0' }
};

let toastTimer, speechTimer, breathTimer;
function toast(text) { $('#toast').textContent = text; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4500); }
function log(text) { const elapsed = Math.floor((Date.now() - startedAt) / 1000); const time = `${String(Math.floor(elapsed / 60)).padStart(2,'0')}:${String(elapsed % 60).padStart(2,'0')}`; const li = document.createElement('li'); const dot = document.createElement('span'); dot.className = 'log-dot'; const textSpan = document.createElement('span'); textSpan.textContent = text; const t = document.createElement('time'); t.dir = 'ltr'; t.textContent = time; li.append(dot,textSpan,t); $('#event-log').prepend(li); while ($('#event-log').children.length > 6) $('#event-log').lastChild.remove(); }
function count() { state.count++; $('#metric-count').textContent = String(state.count).padStart(2,'0'); }
const speechPlayer = $('#ada-audio');
let speechGeneration = 0;
let activeUtterance = null;
function voiceStatus(text, speaking = false) { $('#voice-state').textContent = text; $('#voice-state').classList.toggle('speaking',speaking); }
function stopSpeech() {
  speechGeneration++; clearTimeout(speechTimer);
  speechPlayer.onplaying = speechPlayer.onended = speechPlayer.onerror = null;
  speechPlayer.pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  activeUtterance = null; state.speaking = false; state.speakingUntil = 0;
  voiceStatus(state.sound ? 'الصوت جاهز' : 'الصوت مكتوم');
  $('#audio-recovery').hidden = true;
}
function audioProblem(message) {
  clearTimeout(speechTimer); state.speaking = false; state.speakingUntil = 0;
  voiceStatus('اضغط لتشغيل الصوت');
  $('#audio-recovery-message').textContent = message;
  $('#audio-recovery').hidden = false;
}
function startedSpeaking(token) {
  if(token !== speechGeneration || !state.sound) return;
  clearTimeout(speechTimer); state.speaking = true; state.speakingUntil = 0;
  voiceStatus('آدا تتحدث',true); $('#audio-recovery').hidden = true;
}
function finishedSpeaking(token) {
  if(token !== speechGeneration) return;
  clearTimeout(speechTimer); state.speaking = false; state.speakingUntil = 0;
  activeUtterance = null; voiceStatus('الصوت جاهز للتفاعل التالي');
}
async function speakBrowser(text, token) {
  if(!('speechSynthesis' in window)) { audioProblem('تعذّر تشغيل هذا المقطع. أعد المحاولة بزر تجربة الصوت.'); return; }
  let voices = speechSynthesis.getVoices();
  if(!voices.length) {
    await new Promise(resolve => { const done=()=>{clearTimeout(timer);speechSynthesis.removeEventListener('voiceschanged',done);resolve();};const timer=setTimeout(done,1200);speechSynthesis.addEventListener('voiceschanged',done); });
    voices = speechSynthesis.getVoices();
  }
  if(token !== speechGeneration || !state.sound) return;
  const arabic = voices.find(v => /^ar(?:[-_]|$)/i.test(v.lang));
  if(!arabic) { audioProblem('تعذّر تشغيل الصوت. اضغط التشغيل في المشغّل أو أعد تجربة الصوت.'); return; }
  activeUtterance = new SpeechSynthesisUtterance(text);
  activeUtterance.voice=arabic;activeUtterance.lang=arabic.lang;activeUtterance.rate=.87;activeUtterance.pitch=1.1;
  activeUtterance.onstart=()=>startedSpeaking(token);
  activeUtterance.onend=()=>finishedSpeaking(token);
  activeUtterance.onerror=()=>{if(token===speechGeneration)audioProblem('تعذّر تشغيل الصوت. جرّب مشغّل الصوت أدناه.');};
  speechSynthesis.resume();speechSynthesis.speak(activeUtterance);
}
function speak(text) {
  stopSpeech();
  if(!state.sound) return;
  const token=speechGeneration;
  voiceStatus('جارٍ تشغيل الصوت…');
  const clip=AUDIO_CLIPS[text];
  if(!clip) { void speakBrowser(text,token); return; }
  speechPlayer.src=clip; speechPlayer.volume=1; speechPlayer.muted=false;
  speechPlayer.onplaying=()=>startedSpeaking(token);
  speechPlayer.onended=()=>finishedSpeaking(token);
  speechPlayer.onerror=()=>{if(token===speechGeneration)void speakBrowser(text,token);};
  // Start directly inside the user's click; no delayed voice discovery is needed.
  speechPlayer.play().catch(error=>{
    if(token!==speechGeneration || error.name==='AbortError') return;
    if(error.name==='NotAllowedError') audioProblem('اضغط زر التشغيل أدناه للسماح بالصوت في المتصفح.');
    else void speakBrowser(text,token);
  });
  speechTimer=setTimeout(()=>{if(token===speechGeneration&&!state.speaking)audioProblem('لم يبدأ الصوت. اضغط التشغيل مباشرة أو جرّب زر تجربة الصوت.');},10000);
}
function setSound(value) { state.sound=value;$('#sound-toggle').setAttribute('aria-pressed',String(value));$('#sound-toggle').setAttribute('aria-label',value?'كتم الصوت':'تشغيل الصوت');$('#sound-toggle use').setAttribute('href',value?'#i-volume':'#i-muted');if(!value)stopSpeech();else voiceStatus('الصوت جاهز'); }
function say(text, emotion = state.emotion, shouldCount = false) {
  state.emotion = emotion;
  const data = emotions[emotion]; $('#model-mood').textContent = data.name;
  $('#metric-emotion').innerHTML = `${data.ar} <small>${data.en}</small>`;
  $('#speech-text').textContent = text;
  $('#robot-state').textContent = emotion === 'calm' ? 'مساحة صغيرة للهدوء' : emotion === 'sad' ? 'كل شعور يستحق الإصغاء' : 'لحظة تواصل مع آدا';
  speak(text);
  if (shouldCount) count();
}
function selectEmotion(id) { state.selected = id; $$('.emotion').forEach(el => { const selected = el.dataset.emotion === id; el.classList.toggle('selected',selected); el.setAttribute('aria-pressed',String(selected)); }); $('#response-description').textContent = emotions[id].description; $('#response-tags').innerHTML = emotions[id].tags.map(t => `<span>${t}</span>`).join(''); }
$$('.emotion').forEach(el => el.addEventListener('click',() => selectEmotion(el.dataset.emotion)));
function interact() { const id = state.selected; say(emotions[id].text,id,true); log(`شعور مختار: ${id === 'sad' ? 'حزن' : id === 'happy' ? 'فرح' : id === 'surprised' ? 'دهشة' : 'حاجة للهدوء'} ← استجابة ${emotions[id].ar}`); }
$('#interact').addEventListener('click',interact);
$('#sound-toggle').addEventListener('click',() => { setSound(!state.sound); if(state.sound) speak($('#speech-text').textContent); });
$('#replay').addEventListener('click',() => { setSound(true); speak($('#speech-text').textContent); });
$('#test-sound').addEventListener('click',() => { setSound(true); speak($('#speech-text').textContent); });
setSound(true);

function setTab(tab, focus = false) { if(state.breathing && tab !== 'learning') stopBreathing(); $$('.panel-tabs button').forEach(el => { const selected = el.dataset.tab === tab; el.setAttribute('aria-selected',String(selected)); el.tabIndex = selected ? 0 : -1; if(selected && focus) el.focus(); }); $$('.tab-content').forEach(el => { el.hidden = el.id !== `${tab}-panel`; }); }
$$('[data-tab]').forEach(el => el.addEventListener('click',() => setTab(el.dataset.tab)));
$('.panel-tabs').addEventListener('keydown', e => { if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return; e.preventDefault(); const tabs = $$('[data-tab]'); let current = tabs.findIndex(x => x.getAttribute('aria-selected') === 'true'); current = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (current + (e.key === 'ArrowLeft' ? 1 : 2)) % 3; setTab(tabs[current].dataset.tab,true); });
setTab('interaction');
$$('[data-open]').forEach(el => el.addEventListener('click',() => $(`#${el.dataset.open}-dialog`).showModal()));
$$('[data-close]').forEach(el => el.addEventListener('click',() => el.closest('dialog').close()));
$$('dialog').forEach(el => el.addEventListener('click', e => { if(e.target !== el) return; const r=el.getBoundingClientRect(); if(e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) el.close(); }));
$('#nav-sim').addEventListener('click',() => $('#stage').scrollIntoView({behavior: reducedMotion ? 'instant' : 'smooth',block:'center'}));
document.addEventListener('keydown',e => { if(e.key === 'Escape' && state.tour >= 0) endTour(); if(e.key === 'Enter' && !['BUTTON','INPUT','TEXTAREA','SELECT','A'].includes(e.target.tagName) && !document.querySelector('dialog[open]')) { if(state.tour >= 0) nextTour(); else interact(); } });

const colorQuestions = [{name:'الأزرق', english:'Blue', value:'blue'},{name:'الأصفر',english:'Yellow',value:'yellow'},{name:'الأحمر',english:'Red',value:'red'}];
function showActivity(activity) { stopBreathing(); state.activity = activity; $$('.activity-picker button').forEach(el => el.classList.toggle('selected',el.dataset.activity === activity)); const area = $('#activity-area');
  if(activity === 'colors') {
    const q = colorQuestions[state.colorQuestion];
    area.innerHTML = `<div class="activity-question"><span class="activity-eyebrow">نكتشف الألوان مع آدا</span><h3>أين اللون ${q.name}؟</h3><p>انقر اللون، ولنكتشف اسمه معًا.</p><div class="color-options"><button class="color-choice red" data-color="red" aria-label="أحمر"></button><button class="color-choice blue" data-color="blue" aria-label="أزرق"></button><button class="color-choice yellow" data-color="yellow" aria-label="أصفر"></button></div><p class="activity-feedback" aria-live="polite">خذ وقتك، أنا هنا معك.</p><button class="text-btn" id="next-question">لون آخر ←</button></div>`;
    area.querySelectorAll('[data-color]').forEach(el => el.addEventListener('click',() => { if(el.dataset.color === q.value) { if(area.dataset.answered === 'yes') return; area.dataset.answered='yes'; area.querySelector('.activity-feedback').textContent=`رائع! هذا هو ${q.name}. بالإنجليزية: ${q.english}`; say(`أحسنت! هذا هو اللون ${q.name}. أنا فخورة بمحاولتك!`,'happy',true); log(`نشاط الألوان: اكتشاف ${q.name}`); } else { area.querySelector('.activity-feedback').textContent='محاولة جميلة. لنجرّب لونًا آخر معًا.'; say('شكرًا لمحاولتك! لنبحث معًا مرة أخرى.','welcome'); } }));
    $('#next-question').addEventListener('click',() => { state.colorQuestion=(state.colorQuestion+1)%colorQuestions.length; showActivity('colors'); say(`هل تستطيع أن تجد اللون ${colorQuestions[state.colorQuestion].name}؟`,'welcome'); });
  } else if(activity === 'feelings') {
    const ids=['happy','sad','surprised']; const id=ids[state.feelingQuestion%3]; const labels={happy:'سعيد',sad:'حزين',surprised:'مندهش'};
    area.innerHTML = `<div class="activity-question"><span class="activity-eyebrow">نسمّي مشاعرنا</span><h3>بماذا يشعر هذا الوجه؟</h3><div class="feeling-large"><span class="emotion-face ${id}"><i></i><i></i><b></b></span></div><div class="feeling-choices">${ids.map(key=>`<button data-feeling="${key}">${labels[key]}</button>`).join('')}</div><p class="activity-feedback" aria-live="polite">كل شعور له مكان.</p><button class="text-btn" id="next-feeling">شعور آخر ←</button></div>`;
    area.querySelectorAll('[data-feeling]').forEach(el=>el.addEventListener('click',()=> { if(el.dataset.feeling===id) { if(area.dataset.answered==='yes') return; area.dataset.answered='yes'; area.querySelector('.activity-feedback').textContent=`أحسنت، يبدو ${labels[id]}!`; say(`أحسنت! يبدو هذا الوجه ${labels[id]}. من الجميل أن نتعلّم التعبير عن مشاعرنا.`,'happy',true); log('نشاط المشاعر: إجابة مشجّعة'); } else { area.querySelector('.activity-feedback').textContent='لننظر إلى العينين والفم، ثم نحاول معًا.'; say('محاولة جميلة. لننظر إلى العينين والفم معًا.','welcome'); } }));
    $('#next-feeling').addEventListener('click',()=>{ state.feelingQuestion++; showActivity('feelings'); });
  } else {
    area.innerHTML='<div class="activity-question"><span class="activity-eyebrow">استراحة لطيفة</span><h3>نتنفّس مع آدا.</h3><p>تابع الدائرة بإيقاع مريح لك.</p><div class="breath-orb" id="breath-orb">بهدوء</div><p class="activity-feedback" id="breath-feedback" aria-live="polite">لحظة صغيرة لنرتاح معًا.</p><button class="primary-btn breath-start" id="breath-start">لنبدأ معًا</button></div>';
    $('#breath-start').addEventListener('click',()=>{ if(state.breathing) { stopBreathing(); return; } state.breathing=true; state.breathStart=performance.now(); $('#breath-orb').classList.add('active'); $('#breath-start').textContent='إنهاء الاستراحة'; say('لنتنفّس بهدوء، كأننا نشم وردة، ثم ننفخ برفق على شمعة. يمكنك التوقّف متى أحببت.','calm',true); log('بدء استراحة هادئة'); updateBreath(); breathTimer=setInterval(updateBreath,150); });
  }
  delete area.dataset.answered;
}
function updateBreath(){ if(!state.breathing) return; const t=(performance.now()-state.breathStart)/1000; const inhale=t%8<4; $('#breath-orb').textContent=inhale?'شهيق لطيف':'زفير هادئ'; $('#breath-feedback').textContent=inhale?'نشمّ وردة…':'ننفخ برفق على شمعة…'; if(t>=24) { stopBreathing(); $('#breath-feedback').textContent='أحسنت، كانت لحظة لطيفة معًا.'; say('أحسنت! شكرًا لأنك شاركتني هذه اللحظة الهادئة.','happy'); } }
function stopBreathing(){ clearInterval(breathTimer); state.breathing=false; $('#breath-orb')?.classList.remove('active'); if($('#breath-start')) $('#breath-start').textContent='لنبدأ معًا'; if($('#breath-orb')) $('#breath-orb').textContent='بهدوء'; }
$$('[data-activity]').forEach(el=>el.addEventListener('click',()=>showActivity(el.dataset.activity)));
showActivity('colors');

$('#yaw').addEventListener('input',e=>{ state.yaw=Number(e.target.value); $('#yaw-output').textContent=`${state.yaw}°`; });
$('#pitch').addEventListener('input',e=>{ state.pitch=Number(e.target.value); $('#pitch-output').textContent=`${state.pitch}°`; });
$('#gaze').addEventListener('change',e=>{ state.gaze=e.target.checked; });
$('#wireframe').addEventListener('change',e=>{ state.wireframe=e.target.checked; shellMaterials.forEach(m=>m.wireframe=state.wireframe); log(state.wireframe?'إظهار شبكة النموذج':'إخفاء شبكة النموذج'); });
function resetMotion(){ state.yaw=0; state.pitch=0; state.gaze=true; state.wireframe=false; $('#yaw').value=0; $('#pitch').value=0; $('#yaw-output').textContent='0°'; $('#pitch-output').textContent='0°'; $('#gaze').checked=true; $('#wireframe').checked=false; shellMaterials.forEach(m=>m.wireframe=false); }
$('#reset-motion').addEventListener('click',resetMotion);
function setView(view){ state.cameraAngle=view==='side'?Math.PI/2.4:view==='three'?Math.PI/5.5:0; state.cameraTilt=0; state.cameraDistance=7.5; $$('[data-view]').forEach(el=>el.classList.toggle('selected',el.dataset.view===view)); }
$$('[data-view]').forEach(el=>el.addEventListener('click',()=>setView(el.dataset.view)));
$('#reset-view').addEventListener('click',()=>{ setView('front'); resetMotion(); say(emotions.welcome.text,'welcome'); log('إعادة المشهد إلى وضع الترحيب'); });
$('#fullscreen').addEventListener('click',async()=>{ try { if(document.fullscreenElement) await document.exitFullscreen(); else if($('#stage').requestFullscreen) await $('#stage').requestFullscreen(); else toast('استخدم خيار ملء الشاشة في المتصفح لعرض أكبر.'); } catch { toast('ملء الشاشة غير متاح هنا. افتح الموقع في نافذة مستقلة.'); } });

const tourSteps=[
  { title:'مرحبًا، أنا آدا.', copy:'رفيق روبوتي قيد التطوير، يضع التواصل الإنساني في قلب التقنية. ابدأ بابتسامة وتعرّف إلى صديقة صغيرة.', emotion:'welcome',tab:'interaction',text:emotions.welcome.text },
  { title:'كل شعور يستحق الإصغاء.', copy:'نفترض أن الطفل حزين. تقابل آدا هذا الشعور بتعبير متعاطف وكلمات مطمئنة وحركة هادئة.', emotion:'sad',tab:'interaction',text:emotions.sad.text },
  { title:'اللعب يفتح باب التعلّم.', copy:'جرّب نشاط الألوان في مساحة التعلّم. الإجابة الصحيحة تلقى تشجيعًا، وكل محاولة تستحق فرصة أخرى.', emotion:'happy',tab:'learning',text:'لنتعلّم معًا! هل تستطيع أن تجد اللون الأزرق؟' },
  { title:'تصوّر اليوم. إمكانات الغد.', copy:'هذه محاكاة لتوضيح الفكرة. الروبوت الفعلي قيد التطوير، والعمل على العربية والأنشطة المساندة جزء من رؤيته.', emotion:'welcome',tab:'interaction',text:'كل لحظة تواصل قد تكون بداية جميلة. أنا آدا، إننا نهمس بالأمل.' }
];
function startTour(){ $$('dialog[open]').forEach(el=>el.close()); stopBreathing(); resetMotion(); setView('front'); state.tour=0; $('#tour-overlay').hidden=false; $('#stage').classList.add('touring'); $('#stage').scrollIntoView({behavior:reducedMotion?'instant':'smooth',block:'center'}); showTourStep(); log('بدء العرض الموجّه للجنة'); }
function showTourStep(){ const step=tourSteps[state.tour]; $('#tour-step').textContent=`0${state.tour+1} / 04`; $('#tour-title').textContent=step.title; $('#tour-copy').textContent=step.copy; $$('.tour-progress i').forEach((el,i)=>el.classList.toggle('done',i<=state.tour)); $('#tour-next').innerHTML=`${state.tour===3?'إنهاء العرض':'التالي'} <svg class="icon"><use href="#i-arrow"/></svg>`; setTab(step.tab); if(state.tour===1) selectEmotion('sad'); if(state.tour===2){state.colorQuestion=0;showActivity('colors');} say(step.text,step.emotion,true); }
function nextTour(){ if(state.tour>=3) endTour(); else {state.tour++;showTourStep();} }
function endTour(){ state.tour=-1; $('#tour-overlay').hidden=true; $('#stage').classList.remove('touring'); stopSpeech(); stopBreathing(); log('اكتمل العرض، الاستكشاف الحر متاح'); }
$('#start-tour').addEventListener('click',startTour); $('#guide-start').addEventListener('click',startTour); $('#tour-next').addEventListener('click',nextTour); $('#end-tour').addEventListener('click',endTour);

// A procedural, articulated interpretation of the reference illustration.
const canvas=$('#robot-canvas');
const shellMaterials=[];
let renderer, scene, camera, headPivot, robot, eyes=[], brows=[], mouth=[], antennaGlow, chestGlow, faceGlow;
const motor={yaw:0,pitch:0,tilt:0};
const expression={eyeY:1,eyeTilt:0,brow:0,smile:.14};
let width=1,height=1,camAngle=0,camTilt=0,camDistance=7.5,lastTime=0;
function roundedGeometry(w,h,d,r=.2,bevel=.045){
  const x=-w/2+bevel,y=-h/2+bevel,ww=w-2*bevel,hh=h-2*bevel,rr=Math.min(r,ww/2,hh/2);
  const shape=new THREE.Shape(); shape.moveTo(x+rr,y);shape.lineTo(x+ww-rr,y);shape.quadraticCurveTo(x+ww,y,x+ww,y+rr);shape.lineTo(x+ww,y+hh-rr);shape.quadraticCurveTo(x+ww,y+hh,x+ww-rr,y+hh);shape.lineTo(x+rr,y+hh);shape.quadraticCurveTo(x,y+hh,x,y+hh-rr);shape.lineTo(x,y+rr);shape.quadraticCurveTo(x,y,x+rr,y);
  const geo=new THREE.ExtrudeGeometry(shape,{depth:Math.max(.005,d-2*bevel),bevelEnabled:true,bevelSegments:5,steps:1,bevelSize:bevel,bevelThickness:bevel,curveSegments:18});geo.translate(0,0,-d/2+bevel);geo.computeVertexNormals();return geo;
}
function mesh(geometry,material,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function cylinder(r1,r2,h,material,parent,x,y,z){return mesh(new THREE.CylinderGeometry(r1,r2,h,64),material,parent,x,y,z);}
function glowTexture(){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');const g=ctx.createRadialGradient(64,64,1,64,64,64);g.addColorStop(0,'rgba(155,240,255,.7)');g.addColorStop(.25,'rgba(119,215,255,.25)');g.addColorStop(1,'rgba(100,200,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);}
function labelTexture(text){const c=document.createElement('canvas');c.width=512;c.height=160;const ctx=c.getContext('2d');ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#6c657e';ctx.font='600 65px Manrope, sans-serif';ctx.fillText(text,256,80);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function init3D(){
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.24;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.fog=new THREE.FogExp2('#211e2c',.035);camera=new THREE.PerspectiveCamera(39,1,.1,60);
  const envCanvas=document.createElement('canvas');envCanvas.width=1024;envCanvas.height=512;const ctx=envCanvas.getContext('2d');const grad=ctx.createLinearGradient(0,0,0,512);grad.addColorStop(0,'#c5c3de');grad.addColorStop(.45,'#606073');grad.addColorStop(1,'#17151e');ctx.fillStyle=grad;ctx.fillRect(0,0,1024,512);ctx.fillStyle='#f9f7ff';ctx.fillRect(140,100,100,220);ctx.fillStyle='#c8c5ff';ctx.fillRect(710,100,90,260);const envTex=new THREE.CanvasTexture(envCanvas);envTex.mapping=THREE.EquirectangularReflectionMapping;envTex.colorSpace=THREE.SRGBColorSpace;const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromEquirectangular(envTex).texture;envTex.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#dfd7ff','#201b32',2.3));
  const key=new THREE.DirectionalLight('#f5eeff',3.6);key.position.set(-3,6,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-5;key.shadow.camera.right=5;key.shadow.camera.top=6;key.shadow.camera.bottom=-4;key.shadow.normalBias=.025;key.shadow.bias=-.0002;key.shadow.radius=4;scene.add(key);
  const rim=new THREE.DirectionalLight('#a393f1',3.5);rim.position.set(4,3,-2);scene.add(rim);
  const fill=new THREE.PointLight('#8bdde6',8,8);fill.position.set(-3,2,2);scene.add(fill);
  const shell=new THREE.MeshPhysicalMaterial({color:'#d4d0e0',metalness:.25,roughness:.31,clearcoat:.7,clearcoatRoughness:.22});
  const shellDark=new THREE.MeshPhysicalMaterial({color:'#aaa3c6',metalness:.35,roughness:.29,clearcoat:.5});
  const chrome=new THREE.MeshStandardMaterial({color:'#7e779a',metalness:.85,roughness:.25});
  const dark=new THREE.MeshStandardMaterial({color:'#161422',metalness:.6,roughness:.32});
  const visor=new THREE.MeshPhysicalMaterial({color:'#080d19',metalness:.28,roughness:.25,clearcoat:1,clearcoatRoughness:.18});
  shellMaterials.push(shell,shellDark,chrome,dark,visor);
  const led=new THREE.MeshBasicMaterial({color:'#a2eff5'});const lavender=new THREE.MeshBasicMaterial({color:'#c2b0f5'});const ledLow=new THREE.MeshStandardMaterial({color:'#766aa3',emissive:'#7f65b0',emissiveIntensity:.55,roughness:.3,metalness:.2});
  robot=new THREE.Group();scene.add(robot);robot.position.y=.08;
  cylinder(1.25,1.3,.10,dark,robot,0,.03,0);cylinder(1.21,1.25,.055,chrome,robot,0,.1,0);cylinder(1.18,1.18,.012,lavender,robot,0,.135,0);cylinder(1.15,1.18,.07,dark,robot,0,.17,0);
  const torso=mesh(roundedGeometry(1.77,1.04,.99,.34,.09),shell,robot,0,.72,-.02);
  const shoulderL=mesh(roundedGeometry(.43,.78,.73,.18,.055),shellDark,robot,-.96,.75,-.02);shoulderL.rotation.z=-.16;
  const shoulderR=mesh(roundedGeometry(.43,.78,.73,.18,.055),shellDark,robot,.96,.75,-.02);shoulderR.rotation.z=.16;
  mesh(roundedGeometry(.12,.50,.04,.04,.012),chrome,robot,-1.03,.69,.37);mesh(roundedGeometry(.12,.50,.04,.04,.012),chrome,robot,1.03,.69,.37);
  cylinder(.38,.48,.12,chrome,robot,0,1.29,0);cylinder(.27,.30,.29,dark,robot,0,1.46,0);cylinder(.30,.30,.08,shellDark,robot,0,1.56,0);cylinder(.29,.29,.025,lavender,robot,0,1.61,0);
  for(let i=0;i<4;i++) cylinder(.282,.282,.014,chrome,robot,0,1.35+i*.056,0);
  const chestText=mesh(new THREE.PlaneGeometry(.54,.17),new THREE.MeshBasicMaterial({map:labelTexture('A D A'),transparent:true,depthWrite:false}),robot,0,.79,.491);
  chestGlow=mesh(new THREE.SphereGeometry(.045,24,16),led,robot,0,.52,.50);
  const chestRing=mesh(new THREE.TorusGeometry(.075,.008,10,40),chrome,robot,0,.52,.499);
  headPivot=new THREE.Group();headPivot.position.set(0,1.65,0);robot.add(headPivot);
  const head=new THREE.Group();head.position.y=.94;headPivot.add(head);
  mesh(roundedGeometry(2.05,1.86,1.34,.49,.12),shell,head,0,0,0);
  mesh(roundedGeometry(1.84,1.43,.13,.39,.045),chrome,head,0,.01,.671);
  mesh(roundedGeometry(1.77,1.36,.12,.36,.035),visor,head,0,.02,.729);
  mesh(new THREE.SphereGeometry(.028,24,16),dark,head,0,.79,.56);
  mesh(new THREE.SphereGeometry(.012,16,12),new THREE.MeshBasicMaterial({color:'#58728b'}),head,.003,.791,.583);
  for(const side of [-1,1]){
    const ear=cylinder(.35,.35,.17,shellDark,head,side*1.08,-.03,-.04);ear.rotation.z=Math.PI/2;
    const disc=cylinder(.28,.28,.185,chrome,head,side*1.1,-.03,-.04);disc.rotation.z=Math.PI/2;
    const ring=mesh(new THREE.TorusGeometry(.285,.018,12,64),lavender,head,side*1.20,-.03,-.04);ring.rotation.y=Math.PI/2;
    const outer=cylinder(.22,.22,.193,dark,head,side*1.11,-.03,-.04);outer.rotation.z=Math.PI/2;
    for(let i=0;i<5;i++){const grille=mesh(roundedGeometry(.018,.14,.014,.005,.003),chrome,head,side*.998+(i-2)*.045,-.03,.28);grille.visible=false;}
  }
  cylinder(.028,.028,.30,chrome,head,0,1.055,-.04);antennaGlow=mesh(new THREE.SphereGeometry(.084,32,24),led,head,0,1.23,-.04);
  const antLight=new THREE.PointLight('#9cdbff',.35,1);antLight.position.set(0,1.25,0);head.add(antLight);
  const glowTex=glowTexture();
  for(const side of [-1,1]){
    const eyeGroup=new THREE.Group();eyeGroup.position.set(side*.39,.11,.802);head.add(eyeGroup);
    const eye=mesh(roundedGeometry(.255,.36,.034,.12,.012),led,eyeGroup,0,0,0);
    const light=mesh(new THREE.PlaneGeometry(.83,.83),new THREE.MeshBasicMaterial({map:glowTex,transparent:true,opacity:.42,depthWrite:false,blending:THREE.AdditiveBlending}),eyeGroup,0,0,-.007);
    const glint=mesh(new THREE.SphereGeometry(.025,16,12),new THREE.MeshBasicMaterial({color:'#efffff'}),eyeGroup,-.06,.075,.026);glint.scale.z=.3;
    eyes.push({group:eyeGroup,eye,light,side});
    const dots=[];for(let i=0;i<16;i++)dots.push(mesh(new THREE.SphereGeometry(.012,8,6),led,head,0,0,.80));brows.push({dots,side});
    const cheek=mesh(new THREE.PlaneGeometry(.35,.17),new THREE.MeshBasicMaterial({map:glowTex,transparent:true,opacity:.10,depthWrite:false,blending:THREE.AdditiveBlending,color:'#cba9fb'}),head,side*.64,-.22,.808);
  }
  for(let i=0;i<42;i++) mouth.push(mesh(new THREE.SphereGeometry(.017,10,8),led,head,0,0,.807));
  const reflectedLight=mesh(roundedGeometry(.47,.027,.006,.01,.001),new THREE.MeshBasicMaterial({color:'#96a4c1',transparent:true,opacity:.16}),head,-.43,.57,.797);reflectedLight.rotation.z=.06;
  faceGlow=new THREE.PointLight('#8ce5f3',.02,2);faceGlow.position.set(0,0,1.2);head.add(faceGlow);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(50,50),new THREE.ShadowMaterial({opacity:.25}));ground.rotation.x=-Math.PI/2;ground.position.y=-.01;ground.receiveShadow=true;scene.add(ground);
  const grid=new THREE.GridHelper(24,48,'#534363','#43384f');grid.material.transparent=true;grid.material.opacity=.11;grid.position.y=-.025;scene.add(grid);
  for(const radius of [1.60,1.87,2.55]){const ring=mesh(new THREE.RingGeometry(radius,radius+.008,128),new THREE.MeshBasicMaterial({color:'#9d83cb',transparent:true,opacity:radius>2?.06:.18,side:THREE.DoubleSide}),scene,0,.003,0);ring.rotation.x=-Math.PI/2;}
  const particlesGeo=new THREE.BufferGeometry();const positions=[];let seed=641;const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};for(let i=0;i<70;i++)positions.push((random()-.5)*14,random()*6-1,-3-random()*5);particlesGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));scene.add(new THREE.Points(particlesGeo,new THREE.PointsMaterial({color:'#b6a3d5',size:.013,transparent:true,opacity:.35})));
  const resize=()=>{const r=$('#stage').getBoundingClientRect();width=r.width;height=r.height;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();};new ResizeObserver(resize).observe($('#stage'));resize();
  $('#loading').hidden=true;canvas.dataset.ready='true';requestAnimationFrame(animate);
}
function animate(now){
  requestAnimationFrame(animate);if(document.hidden) return;
  const dt=Math.min((now-lastTime)/1000||.016,.06);lastTime=now;const t=now/1000;const smooth=1-Math.exp(-dt*6);const data=emotions[state.emotion];
  for(const key of Object.keys(expression)) expression[key]=lerp(expression[key],data[key],smooth);
  const idle=reducedMotion?0:Math.sin(t*.75)*.018;const breath=reducedMotion?0:Math.sin(t*1.25)*.012;
  robot.position.y=.08+breath;
  motor.yaw=lerp(motor.yaw,THREE.MathUtils.degToRad(state.yaw)+(state.gaze?state.pointerX*.12:0)+idle,smooth);
  motor.pitch=lerp(motor.pitch,THREE.MathUtils.degToRad(state.pitch)+(state.gaze?state.pointerY*.045:0)+idle*.5,smooth);
  motor.tilt=lerp(motor.tilt,data.tilt+idle*.4,smooth);
  headPivot.rotation.set(motor.pitch,motor.yaw,motor.tilt);
  $('#metric-angle').innerHTML=`${Math.round(THREE.MathUtils.radToDeg(motor.yaw))}° <small>YAW</small>`;
  const blinkPhase=(t%4.6);const blink=reducedMotion?1:blinkPhase<.13?Math.max(.065,Math.abs(blinkPhase-.065)/.065):1;
  const talking=state.speaking || now<state.speakingUntil;
  const talkAmount=talking&&!reducedMotion?(Math.sin(t*18)+1)*.025:0;
  eyes.forEach(({group,eye,light,side})=>{group.position.x=side*.39+(state.gaze?state.pointerX*.035:0);group.position.y=.11+(state.gaze?-state.pointerY*.02:0);eye.scale.y=Math.max(.06,expression.eyeY*blink);eye.rotation.z=-side*expression.eyeTilt;light.material.opacity=.36+Math.sin(t)*.03;});
  brows.forEach(({dots,side})=>{dots.forEach((dot,i)=>{const x=i/(dots.length-1)*.30-.15;dot.position.x=side*.39+x;dot.position.y=.415+expression.brow+Math.sin(i/(dots.length-1)*Math.PI)*.025+side*x*(state.emotion==='sad'?-.55:.04);dot.scale.set(1.3,.8,1);});});
  mouth.forEach((dot,i)=>{const p=i/(mouth.length-1);if(state.emotion==='surprised'){const a=p*Math.PI*2;dot.position.set(Math.cos(a)*.085,-.295+Math.sin(a)*(.105+talkAmount),.807);}else{const x=(p-.5)*.63;dot.position.set(x,-.23-Math.sin(p*Math.PI)*expression.smile-talkAmount*Math.sin(p*Math.PI),.807);} });
  antennaGlow.material.color.set(data.hue);chestGlow.scale.setScalar(1+Math.sin(t*2)*.07);faceGlow.intensity=talking?.025:.012;
  camAngle=lerp(camAngle,state.cameraAngle,smooth*.7);camTilt=lerp(camTilt,state.cameraTilt,smooth*.7);camDistance=lerp(camDistance,state.cameraDistance,smooth*.7);
  const portrait=width<520;const distance=camDistance+(portrait?.35:0);const targetY=1.64;camera.position.set(Math.sin(camAngle)*distance,2.8+camTilt*3,Math.cos(camAngle)*distance);camera.lookAt(0,targetY,0);
  renderer.render(scene,camera);
}
let pointerStart=null;
canvas.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY,angle:state.cameraAngle,tilt:state.cameraTilt};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();state.pointerX=clamp((e.clientX-r.left)/r.width*2-1,-1,1);state.pointerY=clamp((e.clientY-r.top)/r.height*2-1,-1,1);if(pointerStart){state.cameraAngle=clamp(pointerStart.angle-(e.clientX-pointerStart.x)*.007,-Math.PI*.8,Math.PI*.8);state.cameraTilt=clamp(pointerStart.tilt+(e.clientY-pointerStart.y)*.002,-.35,.4);$$('[data-view]').forEach(el=>el.classList.remove('selected'));}});
canvas.addEventListener('pointerup',()=>{pointerStart=null;});canvas.addEventListener('pointercancel',()=>{pointerStart=null;});canvas.addEventListener('pointerleave',()=>{if(!pointerStart){state.pointerX=0;state.pointerY=0;}});
canvas.addEventListener('wheel',e=>{e.preventDefault();state.cameraDistance=clamp(state.cameraDistance+e.deltaY*.004,5.5,10);},{passive:false});
canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')state.cameraAngle-=.12;if(e.key==='ArrowRight')state.cameraAngle+=.12;if(e.key==='ArrowUp')state.cameraTilt=clamp(state.cameraTilt+.04,-.35,.4);if(e.key==='ArrowDown')state.cameraTilt=clamp(state.cameraTilt-.04,-.35,.4);if(e.key==='+')state.cameraDistance=clamp(state.cameraDistance-.3,5.5,10);if(e.key==='-')state.cameraDistance=clamp(state.cameraDistance+.3,5.5,10);}});
$('#capture').addEventListener('click',()=>{if(!renderer){toast('المشهد غير متاح للحفظ حاليًا.');return;}try{renderer.render(scene,camera);const out=document.createElement('canvas');out.width=canvas.width;out.height=canvas.height;const context=out.getContext('2d');context.fillStyle='#1c1928';context.fillRect(0,0,out.width,out.height);context.drawImage(canvas,0,0);context.fillStyle='#b3a0f2';context.font=`${Math.round(out.width*.024)}px sans-serif`;context.textAlign='right';context.fillText('ADA · محاكاة رقمية',out.width*.96,out.height*.94);const link=document.createElement('a');link.download='ADA-digital-simulator.png';link.href=out.toDataURL('image/png');link.click();toast('حُفظت صورة من مشهد آدا.');log('التقاط صورة من المحاكي');}catch{toast('تعذّر حفظ الصورة في هذا المتصفح.');}});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();$('#loading').hidden=false;$('#loading').classList.add('error');$('#loading').textContent='توقف الرسم ثلاثي الأبعاد. أعد تحميل الصفحة لاستعادة آدا.';});
try {init3D();}catch(error){console.error('ADA scene:',error);$('#loading').classList.add('error');$('#loading').textContent='يتطلّب المشهد دعم WebGL. جرّب متصفحًا حديثًا مع تفعيل تسريع الرسوم. يمكنك تجربة الرسائل والأنشطة من لوحة التفاعل.';}
document.addEventListener('visibilitychange',()=>{lastTime=performance.now();if(document.hidden)stopSpeech();});
window.addEventListener('pagehide',()=>{stopSpeech();clearInterval(breathTimer);});
