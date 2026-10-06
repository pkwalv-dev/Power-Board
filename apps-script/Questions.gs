// Question generators. Wrapped so none of these functions can be called from a browser.
var QGEN = (function () {
// ---------- question generators ----------
const ri=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const pick=a=>a[ri(0,a.length-1)];
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=ri(0,i);[a[i],a[j]]=[a[j],a[i]]}return a};
const N=x=>String(x).replace('-','−');
const n2=x=>N(Number.isInteger(x)?x:+x.toFixed(2));
const ab=Math.abs, sg=d=>d<0?'−':'+';
const rt=r=>r===0.5?'(½)':(Number.isInteger(r)?String(r):String(+r.toFixed(2)));
const co=k=>ab(k)===1?'':n2(ab(k));
const tbl=(xs,ys)=>`<table class="t"><tr><th>x</th>${xs.map(x=>`<td>${N(x)}</td>`).join('')}</tr><tr><th>y</th>${ys.map(y=>`<td>${n2(y)}</td>`).join('')}</tr></table>`;
const plain=s=>s.replace(/<[^>]+>/g,'');

// ----- formula models -----
// m = {k:'lin'|'exp'|'mul', a, r, sh}   explicit: lin a+r(x+sh) | exp a·r^(x+sh) | mul a·r·x
const clone=m=>Object.assign({},m);
const val=(m,x)=>m.k==='lin'?m.a+m.r*(x+m.sh):m.k==='exp'?m.a*Math.pow(m.r,x+m.sh):m.a*m.r*x;
const vv=v=>v==='n'?'n':v;
function explicit(m,v){
  const idx=m.sh===0?v:`(${v} ${m.sh<0?'−':'+'} ${ab(m.sh)})`;
  if(m.k==='lin')return m.a===0?`${m.r<0?'−':''}${co(m.r)}${idx}`:`${N(m.a)} ${sg(m.r)} ${co(m.r)}${idx}`;
  if(m.k==='mul')return m.a===1?`${rt(m.r)}${v}`:`${N(m.a)}·${rt(m.r)}${v}`;
  return `${m.a===1?'':N(m.a)+'·'}${rt(m.r)}<sup>${m.sh===0?v:`${v} ${m.sh<0?'−':'+'} ${ab(m.sh)}`}</sup>`;
}
// recursive: start f(0)=a (shifted start when sh=1), step +r (lin) or ×r (exp)
const rstart=m=>m.sh?val({k:m.k,a:m.a,r:m.r,sh:0},m.sh):m.a;
function recursive(m,nm){
  const a=rstart(m);
  const step=m.k==='lin'?`${nm}(n − 1) ${sg(m.r)} ${n2(ab(m.r))}`:`${rt(m.r)}·${nm}(n − 1)`;
  return `${nm}(0) = ${n2(a)}; ${nm}(n) = ${step}`;
}
const rval=(m,x)=>{let y=rstart(m);for(let i=0;i<x;i++)y=m.k==='lin'?y+m.r:y*m.r;return y};
// transforms (each is one common mistake)
const T={
  swap:m=>{const o=clone(m);[o.a,o.r]=[o.r,o.a];return o},
  kind:m=>{const o=clone(m);o.k=m.k==='lin'?'exp':'lin';if(o.k==='exp')o.r=ab(o.r);return o},
  mul:m=>{const o=clone(m);o.k=m.k==='exp'?'mul':'exp';return o},
  start:m=>{const o=clone(m);o.a=+(m.k==='lin'?m.a+m.r:m.a*m.r).toFixed(4);return o},   // starts from the second term
  rshift:m=>{const o=clone(m);o.sh=m.sh?0:1;return o},
  sign:m=>{const o=clone(m);o.r=-m.r;return o},
  pct:m=>{const o=clone(m);o.r=+(m.r>1?m.r-1:1-m.r).toFixed(4);return o},     // 1.06 → 0.06, 0.85 → 0.15
  flip:m=>{const o=clone(m);o.r=+(2-m.r).toFixed(4);return o},                  // 1.06 ↔ 0.94 (growth vs decay)
  inv:m=>{const o=clone(m);o.r=1/m.r;return o},
  noa:m=>{const o=clone(m);o.a=m.k==='lin'?0:1;return o},                     // forgets the starting value                                 // ½ ↔ 2
};
// Balanced 2×2: options = {base, A, B, A+B}. Each option differs from two others by one mistake,
// so "pick the option most like the others" gives no advantage.
function grid(stem,base,names,render,value,exp,prefix=''){
  const ok=[];
  for(const [p,q] of names.flatMap((x,i)=>names.slice(i+1).map(y=>[x,y]))){
    const ms=[base,T[p](base),T[q](base),T[q](T[p](base))];
    if(ms.some(m=>[0,1,2,3,4].some(x=>!isFinite(value(m,x)))))continue;
    const texts=ms.map(m=>prefix+render(m));
    const sig=ms.map(m=>[0,1,2,3,4].map(x=>+value(m,x).toFixed(6)).join(','));
    if(new Set(texts.map(plain)).size<4||new Set(sig).size<4)continue;
    const L=texts.map(t=>plain(t).length),mn=Math.min(...L),mx=Math.max(...L);
    const cat=L[0]===mn&&L.filter(x=>x===mn).length===1?'short':L[0]===mx&&L.filter(x=>x===mx).length===1?'long':'mid';
    ok.push({texts,cat});
  }
  if(!ok.length)return null;
  // Aim for the correct answer to be uniquely shortest ~¼ of the time, uniquely longest ~¼, otherwise neither.
  const want=Math.random()<.25?'short':Math.random()<1/3?'long':'mid';
  const pool=ok.filter(o=>o.cat===want).length?ok.filter(o=>o.cat===want):ok.filter(o=>o.cat==='mid').length?ok.filter(o=>o.cat==='mid'):ok;
  const {texts}=pick(pool),order=shuffle([0,1,2,3]);
  return {stem,opts:order.map(i=>texts[i]),ans:order.indexOf(0),exp};
}
const gE=(stem,base,names,v,exp,prefix)=>grid(stem,base,names,m=>explicit(m,v),val,exp,prefix);
const gR=(stem,base,names,nm,exp)=>grid(stem,base,names,m=>recursive(m,nm),rval,exp);
// Numeric answers: correct lands at a random rank among the four values.
function mkNum(stem,correct,errs,exp,fmt=n2,step=null){
  const pool=[...new Set(errs.filter(x=>isFinite(x)&&x!==correct))];
  step=step||Math.max(1,Math.round(ab(correct)*0.1));
  for(let k=1;k<=3;k++)pool.push(+(correct+k*step).toFixed(4),+(correct-k*step).toFixed(4));
  const lo=shuffle(pool.filter(x=>x<correct)),hi=shuffle(pool.filter(x=>x>correct));
  const ranks=shuffle([0,1,2,3]).filter(r=>lo.length>=r&&hi.length>=3-r);
  if(!ranks.length)return null;
  const r=ranks[0],vals=[...lo.slice(0,r),correct,...hi.slice(0,3-r)].sort((a,b)=>a-b);
  const texts=vals.map(fmt);if(new Set(texts).size<4)return null;
  const order=shuffle([0,1,2,3]);
  return {stem,opts:order.map(i=>texts[i]),ans:order.indexOf(r),exp};
}
function mkText(stem,correct,foils,exp){
  const fs=shuffle([...new Set(foils.filter(f=>f!==correct))]).slice(0,3);if(fs.length<3)return null;
  const o=shuffle([correct,...fs]);return {stem,opts:o,ans:o.indexOf(correct),exp};
}

// ----- contexts -----
const LU=[
 {A:[20,25,30,40],D:[10,15,20,25],nm:'C',v:'m',s:(A,D)=>`A gym charges $${A} to join and $${D} per month. Which function gives the total cost C(m), in dollars, after m months?`},
 {A:[5,8,10,12],D:[2,3,4,5],nm:'h',v:'w',s:(A,D)=>`A plant is ${A} cm tall and grows ${D} cm each week. Which function gives its height h(w), in cm, after w weeks?`},
 {A:[3,4,5,6],D:[2,3],nm:'F',v:'m',s:(A,D)=>`A taxi ride costs $${A} plus $${D} for each mile. Which function gives the fare F(m) for m miles?`},
 {A:[15,20,25,30],D:[4,5,8,10],nm:'P',v:'g',s:(A,D)=>`A phone plan costs $${A} per month plus $${D} for each GB of data. Which function gives the monthly cost P(g) for g GB?`},
 {A:[30,45,60,75],D:[5,10,15],nm:'S',v:'w',s:(A,D)=>`Priya has $${A} saved and adds $${D} each week. Which function gives her savings S(w) after w weeks?`}];
const LD=[
 {A:[60,80,100,120],D:[4,5,6,8],nm:'g',v:'t',s:(A,D)=>`A tank holds ${A} gallons and drains ${D} gallons each minute. Which function gives the amount g(t) left after t minutes?`},
 {A:[9000,12000,15000],D:[600,800,1000],nm:'V',v:'t',s:(A,D)=>`A car is worth $${A} and loses $${D} in value each year. Which function gives its value V(t) after t years?`},
 {A:[20,24,30],D:[2,3,4],nm:'c',v:'t',s:(A,D)=>`A candle is ${A} cm tall and burns down ${D} cm each hour. Which function gives its height c(t) after t hours?`},
 {A:[50,60,80,100],D:[5,8,10,12],nm:'B',v:'w',s:(A,D)=>`A gift card starts with $${A}. Each week, $${D} is spent. Which function gives the balance B(w) after w weeks?`}];
const EX=[
 {P:[20,50,100],nm:'V',v:'d',s:(P,r)=>`A video has ${P} views today, and its views ${r===2?'double':'triple'} each day. Which function gives the views V(d) after d days?`},
 {P:[10,25,40],nm:'B',v:'h',s:(P,r)=>`A culture starts with ${P} bacteria, and the number ${r===2?'doubles':'triples'} every hour. Which function gives the count B(h) after h hours?`},
 {P:[3,5,10],nm:'K',v:'d',s:(P,r)=>`${P} students hear a rumor. Each day, the number of students who know it ${r===2?'doubles':'triples'}. Which function gives the number K(d) after d days?`}];

const BF1=[
 ()=>{const c=pick(LU),A=pick(c.A),D=pick(c.D);
  return gE(c.s(A,D),{k:'lin',a:A,r:D,sh:0},['swap','sign','kind','start'],c.v,`Start value ${A}, plus ${D} for each ${c.v}.`,`${c.nm}(${c.v}) = `);},
 ()=>{const c=pick(LD),A=pick(c.A),D=pick(c.D);
  return gE(c.s(A,D),{k:'lin',a:A,r:-D,sh:0},['swap','sign','start'],c.v,`Start at ${A} and subtract ${D} for each ${c.v}.`,`${c.nm}(${c.v}) = `);},
 ()=>{const c=pick(EX),P0=pick(c.P),r=pick([2,3]);
  return gE(c.s(P0,r),{k:'exp',a:P0,r,sh:0},['swap','kind','mul','start','noa'],c.v,`Start at ${P0} and multiply by ${r} each ${c.v}.`,`${c.nm}(${c.v}) = `);},
 ()=>{const p=pick([3,4,5,6,8]),A=pick([200,500,1000,2000]);
  return gE(`An account has $${A} and grows ${p}% each year. Which function gives the balance B(t) after t years?`,{k:'exp',a:A,r:1+p/100,sh:0},['pct','mul','flip'],'t',`Growing ${p}% means multiplying by ${(1+p/100).toFixed(2)} each year.`,'B(t) = ');},
 ()=>{const p=pick([10,15,20,25]),V=pick([12000,20000,25000]);
  return gE(`A car is worth $${V} and loses ${p}% of its value each year. Which function gives its value V(t) after t years?`,{k:'exp',a:V,r:1-p/100,sh:0},['pct','mul','flip'],'t',`Losing ${p}% keeps ${100-p}%, so multiply by ${(1-p/100).toFixed(2)} each year.`,'V(t) = ');},
 ()=>{const A=pick([80,120,160,200]);
  return gE(`A ${A} mg sample of a medicine loses half its mass every hour. Which function gives the mass M(t) after t hours?`,{k:'exp',a:A,r:0.5,sh:0},['inv','mul','swap'],'t',`Half remains each hour: multiply by ½ each hour.`,'M(t) = ');},
 ()=>{const opt=pick([
    {s:(a,d)=>`A sapling is ${a} inches tall and grows ${d} inches each year. Which recursive process describes its height h(n) after n years?`,nm:'h',a:[4,6,8,10,12],d:[2,3,4,5],sgn:1},
    {s:(a,d)=>`Maria has $${a} and saves $${d} each week. Which recursive process describes her savings s(n) after n weeks?`,nm:'s',a:[5,10,15,20],d:[2,3,4,5],sgn:1},
    {s:(a,d)=>`A pool has ${a} gallons and loses ${d} gallons each day. Which recursive process describes its volume p(n) after n days?`,nm:'p',a:[400,600,800],d:[20,30,40,50],sgn:-1}]);
  const a=pick(opt.a),d=pick(opt.d);
  return gR(opt.s(a,d),{k:'lin',a,r:opt.sgn*d,sh:0},['swap','kind','rshift','sign'],opt.nm,`Start at ${a}; each step ${opt.sgn<0?'subtracts':'adds'} ${d}.`);},
 ()=>{const geo=pick([{a:[2,3,4,5],r:2,s:a=>`A colony starts with ${a} bacteria and doubles every hour. Which recursive process describes its size b(n) after n hours?`},
    {a:[16,32,64,80],r:0.5,s:a=>`A ball is dropped from ${a} feet, and each bounce reaches half the previous height. Which recursive process describes the height b(n) of bounce n, where b(0) is the drop height?`}]);
  const a=pick(geo.a);
  return gR(geo.s(a),{k:'exp',a,r:geo.r,sh:0},['swap','kind','rshift','inv'],'b',`Start at ${a}; multiply by ${rt(geo.r)} each step.`);},
 ()=>{const a=pick([2,3,4,5]),d=pick([2,3,4,5,6]),xs=[0,1,2,3],m={k:'lin',a,r:d,sh:0};
  return gE(`Which function fits the table?${tbl(xs,xs.map(x=>val(m,x)))}`,m,['swap','kind','start','noa'],'x',`y starts at ${a} when x = 0 and rises ${d} per step.`,'y = ');},
 ()=>{const a=pick([2,3,4,5]),r=pick([2,3]),xs=[0,1,2,3],m={k:'exp',a,r,sh:0};
  return gE(`Which function fits the table?${tbl(xs,xs.map(x=>val(m,x)))}`,m,['swap','kind','mul','start','noa'],'x',`y starts at ${a} and is multiplied by ${r} each step.`,'y = ');},
 ()=>{const A=pick([10,15,20,25,30,40,50]),D=pick([3,4,5,6,8,10]),k=ri(4,9);
  return mkNum(`Jordan starts with $${A} and adds $${D} each week. How much does Jordan have after ${k} weeks?`,A+D*k,[(A+D)*k,A+D*(k-1),A+D*(k+1),D*k,A*k+D,A+D+k],`${A} + ${D} × ${k} = ${A+D*k}.`,x=>'$'+x,D);},
 ()=>{const A=pick([2,3,4,5]),r=pick([2,3]),k=pick([3,4]),c=A*Math.pow(r,k);
  return mkNum(`A lab starts with ${A} bacteria. The number ${r===2?'doubles':'triples'} every hour. How many bacteria are there after ${k} hours?`,c,[A*r*k,A+r*k,A*Math.pow(r,k-1),A*Math.pow(r,k+1),Math.pow(A*r,k),Math.pow(r,k)],`${A} × ${r}<sup>${k}</sup> = ${c}.`,String);},
 ()=>{const b=pick([-6,-4,-3,-2,2,3,4,5,6,7]),m=pick([-6,-5,-4,-3,-2,2,3,4,5,6]);
  return gE(`A line crosses the y-axis at (0, ${N(b)}) and ${m>0?'rises':'falls'} ${ab(m)} units for every 1 unit to the right. Which function describes the line?`,{k:'lin',a:b,r:m,sh:0},['swap','sign','start'],'x',`y-intercept ${N(b)}, slope ${N(m)}.`,'y = ');}
];

// ----- BF.2 -----
const rd=()=>[ri(2,20),pick([-6,-5,-4,-3,-2,2,3,4,5,6,7,8])];
const rg=()=>Math.random()<.25?[pick([48,64,80,96]),0.5]:[ri(2,7),pick([2,3,4])];
const seq=m=>[0,1,2,3].map(x=>n2(val(m,x))).join(', ');
const BF2=[
 ()=>{const [a,d]=rd(),m={k:'lin',a,r:d,sh:0};
  return gE(`The sequence ${seq(m)}, … is arithmetic. If f(0) is the first term, which explicit formula gives f(n)?`,m,['swap','start','kind','sign','noa'],'n',`f(0) = ${a}; common difference ${N(d)}. So f(n) = ${explicit(m,'n')}.`,'f(n) = ');},
 ()=>{const [a,r]=rg(),m={k:'exp',a,r,sh:0};
  return gE(`The sequence ${seq(m)}, … is geometric. If f(0) is the first term, which explicit formula gives f(n)?`,m,['swap','start','kind','mul','noa'],'n',`f(0) = ${a}; common ratio ${rt(r)}. So f(n) = ${explicit(m,'n')}.`,'f(n) = ');},
 ()=>{const [a,d]=rd(),m={k:'lin',a,r:d,sh:0};
  return gR(`A sequence begins ${seq(m)}, … Which recursive rule describes it?`,m,['swap','kind','rshift','sign'],'f',`Start at ${a}; add ${N(d)} each step.`);},
 ()=>{const [a,r]=rg(),m={k:'exp',a,r,sh:0};
  return gR(`A sequence begins ${seq(m)}, … Which recursive rule describes it?`,m,['swap','kind','rshift','inv'],'f',`Start at ${a}; multiply by ${rt(r)} each step.`);},
 ()=>{const [a,d]=rd(),m={k:'lin',a,r:d,sh:0};
  return gR(`f(n) = ${explicit(m,'n')}. Which recursive rule gives the same sequence?`,m,['swap','kind','rshift','sign'],'f',`f(0) = ${a}, and each term adds ${N(d)}.`);},
 ()=>{const [a,r]=rg(),m={k:'exp',a,r,sh:0};
  return gR(`f(n) = ${explicit(m,'n')}. Which recursive rule gives the same sequence?`,m,['swap','kind','rshift','inv'],'f',`f(0) = ${a}, and each term is ${rt(r)} times the one before.`);},
 ()=>{const [a,d]=rd(),m={k:'lin',a,r:d,sh:0};
  return gE(`${recursive(m,'f')}. Which explicit formula gives the same sequence?`,m,['swap','start','kind','sign','noa'],'n',`Start ${a}, add ${N(d)} each step: f(n) = ${explicit(m,'n')}.`,'f(n) = ');},
 ()=>{const [a,r]=rg(),m={k:'exp',a,r,sh:0};
  return gE(`${recursive(m,'f')}. Which explicit formula gives the same sequence?`,m,['swap','start','kind','mul','noa'],'n',`Start ${a}, multiply by ${rt(r)} each step: f(n) = ${explicit(m,'n')}.`,'f(n) = ');},
 ()=>{const [a,d]=rd(),k=ri(6,12),f=x=>a+d*x;
  return mkNum(`f(n) = ${explicit({k:'lin',a,r:d,sh:0},'n')}. What is f(${k})?`,f(k),[f(k-1),f(k+1),(a+d)*k,a*d*k,d+a*k,a-d*k],`${a} ${sg(d)} ${ab(d)} × ${k} = ${n2(f(k))}.`,n2,ab(d));},
 ()=>{const a=ri(2,5),r=pick([2,3]),k=pick([3,4,5]),f=x=>a*Math.pow(r,x);
  return mkNum(`f(n) = ${explicit({k:'exp',a,r,sh:0},'n')}. What is f(${k})?`,f(k),[f(k-1),f(k+1),a*r*k,Math.pow(a*r,k),a+r*k,Math.pow(a,k)*r],`${a} × ${r}<sup>${k}</sup> = ${f(k)}.`,String);},
 ()=>{const a=pick([100,200,300,500]),d=pick([25,50,75]);
  return gE(`A gym has ${a} members today and adds ${d} members each month. Which explicit formula gives the members s(n) after n months?`,{k:'lin',a,r:d,sh:0},['swap','kind','start','noa'],'n',`Start ${a}; add ${d} per month.`,'s(n) = ');},
 ()=>{const a=ri(2,6),r=pick([2,3]);
  return gE(`A post has ${a} shares at hour 0, and its shares ${r===2?'double':'triple'} each hour. Which explicit formula gives the shares p(n) after n hours?`,{k:'exp',a,r,sh:0},['swap','kind','mul','start','noa'],'n',`Start ${a}; multiply by ${r} each hour.`,'p(n) = ');}
];

// ----- LE.1 -----
const LINCTX=[()=>`A candle burns down ${ri(2,5)} inches every hour.`,()=>`A savings jar gets $${ri(4,15)} added to it at the end of each week.`,()=>`A hiking trail gains ${pick([30,40,50,60])} feet of elevation with every mile.`,()=>`A streaming service charges $${ri(7,15)} each month.`,()=>`A snail crawls ${ri(3,9)} cm per minute.`,()=>`A tank drains ${ri(4,12)} gallons every minute until it is empty.`,()=>`A school's enrollment grows by ${ri(20,60)} students each year.`,()=>`Each ticket sold adds $${ri(5,12)} to a fundraiser.`];
const EXPCTX=[()=>`Views on a video double every hour.`,()=>`A car loses ${pick([10,12,15,20])}% of its value each year.`,()=>`An investment grows ${pick([3,4,5,6,8])}% each year.`,()=>`A bacteria colony triples in size every day.`,()=>`The number of people who have heard a rumor doubles each day.`,()=>`A sample loses half of its mass every ${pick([2,3,5])} years.`,()=>`A town's population grows by ${pick([2,3,4])}% every year.`,()=>`Each round of a tournament eliminates half the players.`];
const pickN=(fns,k)=>shuffle(fns).slice(0,k).map(f=>f());
const LINEQ=()=>{const a=ri(2,9),b=ri(2,6);return pick([`y = ${b}x + ${a}`,`y = ${a} − ${b}x`,`y = ${b}x`,`y = ${a}x − ${b}`,`${b}x + y = ${a}`])};
const EXPEQ=()=>{const a=ri(2,6),b=ri(2,5);return pick([`y = ${a}·${b}<sup>x</sup>`,`y = ${b}<sup>x</sup>`,`y = ${a}(½)<sup>x</sup>`,`y = ${a}(1.${ri(1,9)})<sup>x</sup>`,`y = ${b}<sup>x</sup> + ${a}`])};
const NEQ=()=>{const a=ri(2,6),b=ri(2,5);return pick([`y = ${a}x<sup>2</sup>`,`y = x<sup>2</sup> + ${b}`,`y = ${a}/x`,`y = x<sup>3</sup>`,`y = ${a}x<sup>2</sup> − ${b}x`])};
const LE1=[
 ()=>{const s=pick([0,1]),st=pick([1,2]),xs=[0,1,2,3].map(i=>s+st*i),kind=pick(['lin','exp','none']);let ys,ex;
  if(kind==='lin'){const a=ri(1,9),d=pick([-4,-3,-2,2,3,4,5,6]);ys=[0,1,2,3].map(i=>a+d*i);ex=`y changes by ${N(d)} every time: a constant difference. Linear.`}
  else if(kind==='exp'){const r=pick([2,3,4,0.5]),a=r===0.5?pick([48,64,80]):ri(1,5);ys=[0,1,2,3].map(i=>a*Math.pow(r,i));ex=`y is multiplied by ${rt(r)} every time: a constant ratio. Exponential.`}
  else{const a=ri(1,5),b=ri(1,4);ys=[0,1,2,3].map(i=>a+b*i*i);ex=`The differences (${ys[1]-ys[0]}, ${ys[2]-ys[1]}, ${ys[3]-ys[2]}) and the ratios both change. Neither.`}
  const ans={lin:'Linear',exp:'Exponential',none:'Neither'}[kind];
  return mkText(`Is the relationship in the table linear, exponential, or neither?${tbl(xs,ys)}`,ans,['Linear','Exponential','Neither','Both linear and exponential'],ex);},
 ()=>mkText(`Which situation is best modeled by an exponential function?`,pick(EXPCTX)(),pickN(LINCTX,3),`It changes by a constant percent or factor each time. The others change by a fixed amount.`),
 ()=>mkText(`Which situation is best modeled by a linear function?`,pick(LINCTX)(),pickN(EXPCTX,3),`It changes by a fixed amount each time. The others change by a constant percent or factor.`),
 ()=>{const p=pick([5,8,10,12,15,20,25,30,40]);
  return mkNum(`A quantity grows by ${p}% each year. By what factor is it multiplied each year?`,1+p/100,[p/100,1-p/100,p,1+p/10,p/10,2*p/100],`Keep 100% and add ${p}%: 1 + ${(p/100).toFixed(2)} = ${(1+p/100).toFixed(2)}.`,x=>x>=5?String(x):x.toFixed(2),0.1);},
 ()=>{const p=pick([5,8,10,12,15,20,25,30,40]);
  return mkNum(`A quantity decreases by ${p}% each year. By what factor is it multiplied each year?`,+(1-p/100).toFixed(2),[p/100,1+p/100,p,+(1-p/10).toFixed(2),p/10],`Keep ${100-p}%: 1 − ${(p/100).toFixed(2)} = ${(1-p/100).toFixed(2)}.`,x=>x>=5?String(x):x.toFixed(2),0.1);},
 ()=>mkText(`Which equation represents an exponential function?`,EXPEQ(),[LINEQ(),LINEQ(),NEQ(),NEQ()],`The variable x is in the exponent, with a constant base.`),
 ()=>mkText(`Which equation represents a linear function?`,LINEQ(),[EXPEQ(),EXPEQ(),NEQ(),NEQ()],`x appears only to the first power, so the rate of change is constant.`),
 ()=>{const lin=Math.random()<.5,L='y goes up or down by a constant amount each time x increases by 1',E='y gets multiplied by a constant factor each time x increases by 1',L2='y goes up or down by a changing amount each time x increases by 1',E2='y gets multiplied by a changing factor each time x increases by 1';
  return lin?mkText(`Which statement describes a linear function?`,L,[E,L2,E2],`Equal differences over equal intervals mean linear.`):mkText(`Which statement describes an exponential function?`,E,[L,L2,E2],`Equal factors over equal intervals mean exponential.`);}
];


// =================== Shared helpers (Math 1 Q2–Q4 and Math 8) ===================
const nz=(a,b)=>{let x;do{x=ri(a,b)}while(x===0);return x};
const isInt=Number.isInteger;
const r1=x=>Math.round(x*10)/10;
const gcd=(a,b)=>{a=ab(a);b=ab(b);while(b)[a,b]=[b,a%b];return a||1};
function fr(p,q){if(q<0){p=-p;q=-q}const g=gcd(p,q);p/=g;q/=g;return q===1?N(p):`${p<0?'−':''}<sup>${ab(p)}</sup>⁄<sub>${q}</sub>`}
const rv=m=>Array.isArray(m)?m[0]/m[1]:m;
function cf(c,v){const s=Array.isArray(c)?fr(c[0],c[1]):n2(c);return (s==='1'?'':s==='−1'?'−':s)+v}
function linT(m,b,v='x'){if(rv(m)===0)return n2(b);const t=cf(m,v);return b===0?t:`${t} ${sg(b)} ${n2(ab(b))}`}
function stdT(A,B){const t=cf(A,'x');return B===0?t:`${t} ${B<0?'−':'+'} ${cf(ab(B),'y')}`}
const pt=(x,y)=>`(${n2(x)}, ${n2(y)})`;
function polyT(cs,v='x'){const d=cs.length-1;let s='';cs.forEach((c,i)=>{if(!c)return;const p=d-i,t=(ab(c)===1&&p>0?'':n2(ab(c)))+(p===0?'':p===1?v:`${v}<sup>${p}</sup>`);s+=s?` ${c<0?'−':'+'} ${t}`:(c<0?'−':'')+t});return s||'0'}
const fac=r=>r===0?'x':`(x ${r>0?'−':'+'} ${ab(r)})`;
const aT=a=>a===1?'':a===-1?'−':n2(a);
const vtx=(a,h,k)=>`${aT(a)}${h===0?'x':`(x ${h>0?'−':'+'} ${ab(h)})`}<sup>2</sup>${k?` ${sg(k)} ${ab(k)}`:''}`;
const tblR=rows=>`<table class="t">${rows.map(r=>`<tr><th>${r[0]}</th>${r.slice(1).map(v=>`<td>${typeof v==='number'?n2(v):v}</td>`).join('')}</tr>`).join('')}</table>`;
const br=(...l)=>l.join('<br>');
const sq=x=>`${x}<sup>2</sup>`;
// Numeric choices like mkNum, with a floor (e.g. lengths stay positive).
function mkN(stem,correct,errs,exp,o={}){
  const fmt=o.fmt||n2,min=o.min==null?-Infinity:o.min,step=o.step||Math.max(1,Math.round(ab(correct)*0.1));
  const key=x=>fmt(x);
  const pool=[];const seen=new Set([key(correct)]);
  const add=x=>{if(!isFinite(x)||x<min)return;const k=key(x);if(seen.has(k))return;seen.add(k);pool.push(x)};
  errs.forEach(add);
  for(let k=1;k<=4;k++){add(+(correct+k*step).toFixed(4));add(+(correct-k*step).toFixed(4))}
  const lo=shuffle(pool.filter(x=>x<correct)),hi=shuffle(pool.filter(x=>x>correct));
  const ranks=shuffle([0,1,2,3]).filter(r=>lo.length>=r&&hi.length>=3-r);
  if(!ranks.length)return null;
  const r=ranks[0],vals=[...lo.slice(0,r),correct,...hi.slice(0,3-r)].sort((a,b)=>a-b);
  const texts=vals.map(fmt);if(new Set(texts).size<4)return null;
  const order=shuffle([0,1,2,3]);
  return {stem,opts:order.map(i=>texts[i]),ans:order.indexOf(r),exp};
}
// Fixed answer list (keeps its order, e.g. Parallel / Perpendicular / Neither).
function mkFixed(stem,opts,correct,exp){const i=opts.indexOf(correct);return i<0?null:{stem,opts:opts.slice(),ans:i,exp}}

// ----- graphs (inline SVG, styled by the page) -----
function nice(span,target){for(const s of [0.5,1,2,4,5,10,20,25,50,100,200,250,500,1000])if(span/s<=target)return s;return 1000}
function plot(o){
  const W=300,H=250,L=38,R=12,T0=22,B=30,[x0,x1]=o.xr,[y0,y1]=o.yr;
  const xs=o.xs||nice(x1-x0,10),ys=o.ys||nice(y1-y0,8);
  const X=x=>+(L+(x-x0)/(x1-x0)*(W-L-R)).toFixed(1),Y=y=>+(H-B-(y-y0)/(y1-y0)*(H-T0-B)).toFixed(1);
  const ticks=(a,b,st)=>{const t=[];for(let v=Math.ceil(a/st-1e-9)*st;v<=b+1e-9;v+=st)t.push(+v.toFixed(6));return t};
  const gx=ticks(x0,x1,xs),gy=ticks(y0,y1,ys);let s='';
  gx.forEach(v=>s+=`<line class="gl" x1="${X(v)}" y1="${T0}" x2="${X(v)}" y2="${H-B}"/>`);
  gy.forEach(v=>s+=`<line class="gl" x1="${L}" y1="${Y(v)}" x2="${W-R}" y2="${Y(v)}"/>`);
  const ax=x0<=0&&x1>=0?X(0):L,ay=y0<=0&&y1>=0?Y(0):H-B;
  s+=`<line class="ax" x1="${L}" y1="${ay}" x2="${W-R}" y2="${ay}"/><line class="ax" x1="${ax}" y1="${T0}" x2="${ax}" y2="${H-B}"/>`;
  const ex=gx.length>11?2:1,ey=gy.length>9?2:1;
  gx.forEach((v,i)=>{if(i%ex===0)s+=`<text x="${X(v)}" y="${H-B+14}" text-anchor="middle">${n2(v)}</text>`});
  gy.forEach((v,i)=>{if(i%ey===0)s+=`<text x="${L-5}" y="${Y(v)+4}" text-anchor="end">${n2(v)}</text>`});
  if(o.xl)s+=`<text class="lab" x="${W-R}" y="${H-2}" text-anchor="end">${o.xl}</text>`;
  if(o.yl)s+=`<text class="lab" x="4" y="13">${o.yl}</text>`;
  (o.fns||[]).forEach((f,i)=>{let d='',pen=false;for(let k=0;k<=160;k++){const x=x0+(x1-x0)*k/160,y=f(x);if(!isFinite(y)||y<y0-1e-9||y>y1+1e-9){pen=false;continue}d+=(pen?'L':'M')+X(x)+' '+Y(y);pen=true}if(d)s+=`<path class="ln${i?' ln2':''}" d="${d}"/>`});
  (o.pts||[]).forEach(([x,y])=>s+=`<circle class="pt" cx="${X(x)}" cy="${Y(y)}" r="3.6"/>`);
  (o.labels||[]).forEach(([x,y,t])=>s+=`<text class="lab" x="${X(x)+6}" y="${Y(y)-6}">${t}</text>`);
  return `<svg class="plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="${o.alt||'Graph'}">${s}</svg>`;
}
function yrOf(pts,pad=5){const v=pts.map(p=>p[1]);let lo=Math.floor(Math.min(...v)/pad)*pad,hi=Math.ceil(Math.max(...v)/pad)*pad;if(lo>0&&lo<=pad*2)lo=0;if(hi===lo)hi+=pad;return [lo,hi]}
function corr(p){const n=p.length,mx=p.reduce((s,q)=>s+q[0],0)/n,my=p.reduce((s,q)=>s+q[1],0)/n;let a=0,b=0,c=0;p.forEach(([x,y])=>{a+=(x-mx)*(y-my);b+=(x-mx)**2;c+=(y-my)**2});return a/Math.sqrt(b*c)}
// Scatter data: 'pos' | 'neg' | 'curve' | 'none'
function scat(kind,n=13){
  for(let t=0;t<40;t++){
    const m=pick([1.5,2,2.5,3]),b=ri(2,6),p=[];
    for(let i=0;i<n;i++){const x=r1(ri(5,95)/10);let y;
      if(kind==='pos')y=b+m*x+(Math.random()-.5)*4;
      else if(kind==='neg')y=b+m*10-m*x+(Math.random()-.5)*4;
      else if(kind==='curve')y=0.5*Math.pow(1.6,x)+(Math.random()-.5);
      else y=ri(3,27)+Math.random();
      p.push([x,r1(Math.max(0,y))])}
    const r=corr(p);
    if((kind==='pos'&&r>.9)||(kind==='neg'&&r<-.9)||(kind==='none'&&ab(r)<.2)||kind==='curve')return p;
  }
  return null;
}
function scatR(target,n=14){
  let best=null;
  for(let t=0;t<80;t++){
    const sl=Math.sign(target)*pick([1.5,2,2.5]),ns=ab(target)>.7?pick([0.8,1.2,1.6]):pick([6,8,10]),base=target>0?6:26;
    const p=[...Array(n)].map(()=>{const x=r1(ri(5,95)/10);return [x,r1(base+sl*x+(Math.random()-.5)*2*ns)]});
    const r=corr(p);if(!best||ab(r-target)<ab(best.r-target))best={p,r};if(ab(r-target)<.06)break;
  }
  return ab(best.r-target)<.12?best.p:null;
}
// Statistics (quartiles use the median of each half, leaving out the middle value)
const sortN=a=>a.slice().sort((x,y)=>x-y);
const med=a=>{const s=sortN(a),n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2};
const quart=a=>{const s=sortN(a),n=s.length,h=Math.floor(n/2);return [med(s.slice(0,h)),med(s.slice(n-h))]};
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const sdev=a=>{const m=mean(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/a.length)};
const listT=a=>a.join(', ');
const cmpOpts=['f(x)','g(x)','They are equal','There is not enough information'];
const cmpAns=(fv,gv)=>ab(fv-gv)<1e-9?cmpOpts[2]:fv>gv?cmpOpts[0]:cmpOpts[1];
const nSol=['One solution','No solution','Infinitely many solutions','Two solutions'];

// =================== Math 1, Q2 ===================
const FNCTX=[
 {s:'C(t) is the cost, in dollars, to rent a kayak for t hours.',f:'C',a:[2,3,4,5,6],b:[30,36,42,48,55],
  ok:(a,b)=>`Renting a kayak for ${a} hours costs $${b}.`,sw:(a,b)=>`Renting a kayak for ${b} hours costs $${a}.`,r1:(a,b)=>`Renting a kayak costs $${a} per hour.`,r2:(a,b)=>`Renting a kayak costs $${b} per hour.`},
 {s:'H(w) is the height, in cm, of a plant w weeks after it is planted.',f:'H',a:[3,4,5,6,8],b:[12,15,18,20,24],
  ok:(a,b)=>`${a} weeks after planting, the plant is ${b} cm tall.`,sw:(a,b)=>`${b} weeks after planting, the plant is ${a} cm tall.`,r1:(a,b)=>`The plant grows ${a} cm each week.`,r2:(a,b)=>`The plant grows ${b} cm each week.`},
 {s:'P(n) is the profit, in dollars, from selling n tickets to a school dance.',f:'P',a:[40,50,80,100],b:[150,220,300,410],
  ok:(a,b)=>`Selling ${a} tickets gives a profit of $${b}.`,sw:(a,b)=>`Selling ${b} tickets gives a profit of $${a}.`,r1:(a,b)=>`Each ticket earns $${a} in profit.`,r2:(a,b)=>`Each ticket earns $${b} in profit.`},
 {s:'T(m) is the temperature of an oven, in °F, m minutes after it is turned on.',f:'T',a:[5,8,10,12],b:[250,300,325,350],
  ok:(a,b)=>`${a} minutes after the oven is turned on, it is ${b}°F.`,sw:(a,b)=>`${b} minutes after the oven is turned on, it is ${a}°F.`,r1:(a,b)=>`The oven heats up ${a}°F each minute.`,r2:(a,b)=>`The oven heats up ${b}°F each minute.`}];
const IF2=[
 ()=>{const m=nz(-5,6),b=nz(-9,9),k=nz(-4,6),y=m*k+b;
  return mkN(`f(x) = ${linT(m,b)}. What is f(${N(k)})?`,y,[m*k-b,m+k+b,-m*k+b,(m+b)*k,m*k],`Replace x with ${N(k)}: ${N(m)}(${N(k)}) ${sg(b)} ${ab(b)} = ${N(y)}.`,{step:Math.max(1,ab(m))});},
 ()=>{const a=pick([1,2,3,-1,-2]),b=nz(-6,6),c=ri(-9,9),k=-ri(1,4),y=a*k*k+b*k+c;
  return mkN(`g(x) = ${polyT([a,b,c])}. What is g(${N(k)})?`,y,[-a*k*k+b*k+c,a*k*k-b*k+c,2*a*k+b*k+c,a*k*k+b*k-c],`Replace x with ${N(k)}. Square first: (${N(k)})<sup>2</sup> = ${k*k}. So g(${N(k)}) = ${N(a)}(${k*k}) ${sg(b*k)} ${ab(b*k)} ${sg(c)} ${ab(c)} = ${N(y)}.`,{step:ab(a)+1});},
 ()=>{const a=pick([2,3,4,5]),b=pick([2,3]),k=pick([2,3,4]),y=a*b**k;
  return mkN(`h(x) = ${a}·${b}<sup>x</sup>. What is h(${k})?`,y,[(a*b)**k,a*b*k,a*b**(k-1),a+b**k,a*b**(k+1)],`Find the power first: ${b}<sup>${k}</sup> = ${b**k}. Then ${a} × ${b**k} = ${y}.`,{fmt:String});},
 ()=>{const m=pick([2,3,4,5,-2,-3]),b=nz(-9,9),x=ri(-5,9),K=m*x+b;
  return mkN(`f(x) = ${linT(m,b)}. For what value of x is f(x) = ${N(K)}?`,x,[m*K+b,(K+b)/m,K/m-b,(K-b)*m].filter(isInt),`Set ${linT(m,b)} = ${N(K)}. Undo the ${sg(b)} ${ab(b)}, then divide by ${N(m)}: x = ${N(x)}.`,{step:1});},
 ()=>{const c=pick(FNCTX),a=pick(c.a),b=pick(c.b);
  return mkText(`${c.s} What does ${c.f}(${a}) = ${b} mean?`,c.ok(a,b),[c.sw(a,b),c.r1(a,b),c.r2(a,b)],`The value inside the parentheses (${a}) is the input. The ${b} is the output.`);},
 ()=>{const xs=[-2,-1,0,1,2,3],ys=shuffle([...Array(18).keys()].map(i=>i-4)).slice(0,6),i=ri(0,5),table=tblR([['x',...xs],['g(x)',...ys]]);
  if(Math.random()<.5){const k=xs[i],j=ys.indexOf(k);
   return mkN(`Use the table.${table}What is g(${N(k)})?`,ys[i],[j>=0?xs[j]:NaN,ys[i-1],ys[i+1],k],`Find x = ${N(k)} in the top row. The value under it is g(${N(k)}) = ${N(ys[i])}.`,{step:1});}
  const Y=ys[i],j=xs.indexOf(Y);
  return mkN(`Use the table.${table}For what value of x is g(x) = ${N(Y)}?`,xs[i],[j>=0?ys[j]:NaN,Y,xs[i-1],xs[i+1]],`Find ${N(Y)} in the g(x) row. The x above it is ${N(xs[i])}.`,{step:1});}
];

const IF4=[
 ()=>{const p=pick([1,2,3]),d=p+ri(1,3),L=p+d,[k,ys]=pick([[20,4],[24,4],[32,4],[36,4],[40,5],[48,8],[60,10],[64,8],[80,10]]),a=k/(d*d),h=t=>k-a*(t-p)**2;
  const g=plot({xr:[0,L+1],yr:[0,k+ys],ys,fns:[t=>t<=L?h(t):NaN],xl:'t (seconds)',yl:'h (feet)',alt:'Parabola showing the height of a ball over time'});
  const stem=`A ball is thrown upward from a balcony. The graph shows its height h, in feet, t seconds after it is thrown.${g}`;
  switch(ri(0,4)){
   case 0:return mkN(stem+'What is the maximum height of the ball, in feet?',k,[p,L,k-ys,d],`The highest point on the graph is (${p}, ${k}), so the maximum height is ${k} feet.`,{step:ys,min:0});
   case 1:return mkN(stem+'After how many seconds does the ball reach its maximum height?',p,[k,L,d,0],`The highest point on the graph is (${p}, ${k}): the ball is highest after ${p} seconds.`,{min:0});
   case 2:return mkN(stem+'After how many seconds does the ball hit the ground?',L,[p,d,k,L+1],`The graph reaches h = 0 at t = ${L}.`,{min:0});
   case 3:return mkText(stem+'Over which interval is the height of the ball increasing?',`0 < t < ${p}`,[`${p} < t < ${L}`,`0 < t < ${L}`,`0 < h < ${k}`],`The graph rises from t = 0 until its peak at t = ${p}.`);
   default:return mkText(stem+'What does the h-intercept (where the graph crosses the vertical axis) represent?',`The height of the ball when it was thrown`,[`The time when the ball lands`,`The maximum height of the ball`,`How fast the ball is moving`],`The h-intercept is where t = 0: the moment the ball is thrown.`);
  }},
 ()=>{const r=pick([2,4,5,10]),T=pick([4,5,6,8,10]),A=r*T,ys=[1,2,4,5,10,20,25].find(s=>A%s===0&&A/s<=10);
  const g=plot({xr:[0,T+2],yr:[0,A+ys],ys,fns:[t=>t<=T?A-r*t:NaN],xl:'t (minutes)',yl:'w (gallons)',alt:'Line showing water in a tank decreasing to zero'});
  const stem=`A tank is drained at a steady rate. The graph shows the water w, in gallons, left after t minutes.${g}`;
  switch(ri(0,2)){
   case 0:return mkText(stem+`What does the t-intercept, (${T}, 0), represent?`,`The tank is empty after ${T} minutes.`,[`The tank starts with ${T} gallons.`,`The tank drains ${T} gallons per minute.`,`The tank holds ${A} gallons after ${T} minutes.`],`At the t-intercept, w = 0: there is no water left after ${T} minutes.`);
   case 1:return mkN(stem+'How many gallons drain each minute?',r,[A,T,A-r,r*2],`The water drops from ${A} to 0 in ${T} minutes: ${A} ÷ ${T} = ${r} gallons per minute.`,{min:1});
   default:return mkText(stem+`What does the w-intercept, (0, ${A}), represent?`,`The tank started with ${A} gallons.`,[`The tank is empty after ${A} minutes.`,`The tank drains ${A} gallons per minute.`,`The tank holds ${A} gallons after ${T} minutes.`],`At the w-intercept, t = 0: the amount of water at the start.`);
  }},
 ()=>{const h=ri(-1,3),k=ri(-6,4),a=pick([1,2]),xs=[-3,-2,-1,0,1,2,3].map(i=>h+i),ys=xs.map(x=>a*(x-h)**2+k),table=tblR([['x',...xs],['f(x)',...ys]]);
  if(Math.random()<.5)return mkN(`The table shows values of a quadratic function f.${table}What is the minimum value of f?`,k,[h,ys[2],ys[0],k-1],`The smallest output is ${N(k)}, at x = ${N(h)}.`,{step:1});
  return mkText(`The table shows values of a quadratic function f.${table}Based on the table, over which interval is f decreasing?`,`${N(h-3)} < x < ${N(h)}`,[`${N(h)} < x < ${N(h+3)}`,`${N(h-3)} < x < ${N(h+3)}`,`${N(k)} < f(x) < ${N(ys[0])}`],`The outputs get smaller from x = ${N(h-3)} until x = ${N(h)}, then grow.`);}
];

const CED3=[
 ()=>{const c=pick([{s:(a,s,n,t)=>`A school play sells adult tickets for $${a} and student tickets for $${s}. It sells ${n} tickets and collects $${t}. Which system models x adult tickets and y student tickets?`,a:[6,8,10,12],b:[3,4,5]},
   {s:(a,s,n,t)=>`Almonds cost $${a} per pound and raisins cost $${s} per pound. A ${n}-pound snack mix costs $${t}. Which system models x pounds of almonds and y pounds of raisins?`,a:[7,8,9,10],b:[2,3,4]}]);
  const a=pick(c.a),s=pick(c.b),x=ri(3,20),y=ri(3,20),n=x+y,t=a*x+s*y;
  return mkText(c.s(a,s,n,t),br(`x + y = ${n}`,`${a}x + ${s}y = ${t}`),[br(`x + y = ${t}`,`${a}x + ${s}y = ${n}`),br(`x + y = ${n}`,`${s}x + ${a}y = ${t}`),br(`x + y = ${n}`,`${a+s}(x + y) = ${t}`)],`One equation counts the total amount (x + y = ${n}). The other adds up the cost (${a}x + ${s}y = ${t}).`);},
 ()=>{const p=pick([12,15,18]),q=pick([9,10,11]),H=pick([15,18,20,24]),E=pick([180,200,240,250]);
  return mkText(`Maya earns $${p} an hour tutoring and $${q} an hour as a lifeguard. She can work at most ${H} hours a week and wants to earn at least $${E}. Which system models x hours tutoring and y hours lifeguarding?`,
   br(`x + y ≤ ${H}`,`${p}x + ${q}y ≥ ${E}`),[br(`x + y ≥ ${H}`,`${p}x + ${q}y ≤ ${E}`),br(`x + y ≤ ${H}`,`${p}x + ${q}y ≤ ${E}`),br(`x + y ≥ ${H}`,`${p}x + ${q}y ≥ ${E}`),br(`x + y ≤ ${E}`,`${p}x + ${q}y ≥ ${H}`)],
   `"At most ${H} hours" means x + y ≤ ${H}. "At least $${E}" means ${p}x + ${q}y ≥ ${E}.`);},
 ()=>{const p=pick([12,15,18]),q=pick([8,9,10]),H=pick([15,18,20]),E=Math.round(p*H*ri(55,75)/1000)*10;
  const ok=[],f1=[],f2=[];
  for(let x=0;x<=H+4;x++)for(let y=0;y<=H+4;y++){const a=x+y<=H,b=p*x+q*y>=E;(a&&b?ok:!a&&b?f1:a&&!b?f2:[]).push([x,y])}
  if(!ok.length||!f1.length||!f2.length)return null;
  const c=pick(ok),foils=[pick(f1),pick(f2),pick(f1.concat(f2))].map(([x,y])=>pt(x,y));
  return mkText(`Maya's hours must satisfy${'<br>'}x + y ≤ ${H}<br>${p}x + ${q}y ≥ ${E}<br>where x is hours tutoring and y is hours lifeguarding. Which combination meets both conditions?`,pt(c[0],c[1]),foils,`Check both: ${c[0]} + ${c[1]} = ${c[0]+c[1]} ≤ ${H}, and ${p}(${c[0]}) + ${q}(${c[1]}) = ${p*c[0]+q*c[1]} ≥ ${E}.`);},
 ()=>{const c=pick([{s:(p,q,M)=>`Chips cost $${p} a bag and drinks cost $${q} each. You can spend at most $${M}. Which inequality models x bags of chips and y drinks?`,op:'≤'},
   {s:(p,q,M)=>`Quizzes are worth ${p} points and projects are worth ${q} points. Leo needs at least ${M} points. Which inequality models x quizzes and y projects?`,op:'≥'},
   {s:(p,q,M)=>`A van can carry at most ${M} pounds. Boxes weigh ${p} pounds and bags weigh ${q} pounds. Which inequality models x boxes and y bags?`,op:'≤'},
   {s:(p,q,M)=>`A club needs to raise more than $${M}. It sells shirts for $${p} and hats for $${q}. Which inequality models x shirts and y hats sold?`,op:'>'}]);
  const p=ri(3,12),q=ri(2,9);if(p===q)return null;const M=pick([40,60,80,120,150,200]);
  const opp={'≤':'≥','≥':'≤','>':'<','<':'>'},str={'≤':'<','≥':'>','>':'≥','<':'≤'};
  return mkText(c.s(p,q,M),`${p}x + ${q}y ${c.op} ${M}`,[`${p}x + ${q}y ${opp[c.op]} ${M}`,`${p}x + ${q}y ${str[c.op]} ${M}`,`${q}x + ${p}y ${c.op} ${M}`,`x + y ${c.op} ${M}`],`Multiply each price or weight by its amount and add. ${c.op==='≤'?'"At most" means ≤.':c.op==='≥'?'"At least" means ≥.':'"More than" means >.'}`);},
 ()=>{const a=pick([6,8,10,12]),s=pick([3,4,5]),x=ri(10,40),y=ri(10,40),n=x+y,t=a*x+s*y,first=Math.random()<.5;
  return mkText(`A play sells adult tickets for $${a} and student tickets for $${s}. The system<br>x + y = ${n}<br>${a}x + ${s}y = ${t}<br>models the sales, where x is adult tickets and y is student tickets. What does ${first?`x + y = ${n}`:`${a}x + ${s}y = ${t}`} represent?`,
   first?`The total number of tickets sold is ${n}.`:`The total money collected is $${t}.`,
   [first?`The total money collected is $${n}.`:`The total number of tickets sold is ${t}.`,`The price of one adult ticket is $${a}.`,first?`The number of student tickets sold is ${n}.`:`The total money collected from adults is $${t}.`],
   first?'x + y adds the two kinds of tickets.':`${a}x is money from adults and ${s}y is money from students; together they make the total.`);}
];

const SLOPES=[[1,1],[2,1],[3,1],[-1,1],[-2,1],[-3,1],[1,2],[1,3],[2,3],[3,2],[-1,2],[-1,3],[-2,3],[3,4],[-3,4],[4,3],[-4,3],[1,4],[4,1],[-1,4]];
const sNorm=m=>{let[p,q]=m;if(q<0){p=-p;q=-q}const g=gcd(p,q);return [p/g,q/g]};
const perp=m=>sNorm([-m[1],m[0]]),negS=m=>[-m[0],m[1]],recS=m=>sNorm([m[1],m[0]]);
const sEq=(a,b)=>a[0]*b[1]===a[1]*b[0];
const yEq=(m,b)=>'y = '+linT(sNorm(m),b);
const slT=m=>fr(m[0],m[1]);
const relOpts=['Parallel','Perpendicular','Neither parallel nor perpendicular','The same line'];
const GPE5=[
 ()=>{const m=pick(SLOPES),pp=Math.random()<.6;
  return pp?mkText(`Line ℓ has slope ${slT(m)}. What is the slope of a line perpendicular to ℓ?`,slT(perp(m)),[slT(m),slT(negS(m)),slT(recS(m))],`Perpendicular slopes are opposite reciprocals: flip ${slT(m)} and change its sign to get ${slT(perp(m))}.`)
   :mkText(`Line ℓ has slope ${slT(m)}. What is the slope of a line parallel to ℓ?`,slT(m),[slT(perp(m)),slT(negS(m)),slT(recS(m))],`Parallel lines have equal slopes.`);},
 ()=>{const m=pick(SLOPES),b=nz(-8,8),c=nz(-8,8);if(b===c)return null;
  return mkText(`Which line is parallel to y = ${linT(m,b)}?`,yEq(m,c),[yEq(negS(m),b),yEq(perp(m),b),yEq(recS(m),c)],`Parallel lines have the same slope, ${slT(m)}, and a different y-intercept.`);},
 ()=>{const m=pick(SLOPES),b=nz(-8,8),c=nz(-8,8);
  return mkText(`Which line is perpendicular to y = ${linT(m,b)}?`,yEq(perp(m),c),[yEq(m,c),yEq(negS(m),b),yEq(recS(m),b)],`Perpendicular lines have opposite reciprocal slopes: ${slT(m)} → ${slT(perp(m))}.`);},
 ()=>{const m=pick(SLOPES),[p,q]=m,h=q*nz(-3,3),k=ri(-6,6),b=nz(-8,8),b2=k-p*h/q;if(b===b2)return null;
  return mkText(`Which line passes through ${pt(h,k)} and is parallel to y = ${linT(m,b)}?`,yEq(m,b2),[yEq(m,k+p*h/q),yEq(m,b),yEq(perp(m),b2),yEq(m,k)],`Keep slope ${slT(m)}. Substitute ${pt(h,k)}: ${N(k)} = ${slT(m)}(${N(h)}) + b, so b = ${N(b2)}.`);},
 ()=>{const m=pick(SLOPES),s=perp(m),h=s[1]*nz(-3,3),k=ri(-6,6),b=nz(-8,8),b2=k-s[0]*h/s[1];
  return mkText(`Which line passes through ${pt(h,k)} and is perpendicular to y = ${linT(m,b)}?`,yEq(s,b2),[yEq(s,k+s[0]*h/s[1]),yEq(m,b2),yEq(negS(m),b2),yEq(s,k)],`The perpendicular slope is ${slT(s)}. Substitute ${pt(h,k)}: ${N(k)} = ${slT(s)}(${N(h)}) + b, so b = ${N(b2)}.`);},
 ()=>{const m=sNorm(pick(SLOPES)),rel=pick(['par','perp','neither','same']);
  const std=(sl,C)=>{let A=sl[0],B=-sl[1];if(A<0){A=-A;B=-B;C=-C}return [A,B,C]};
  const [A,B,C]=std(m,nz(-9,9));let A2,B2,C2;
  if(rel==='par'||rel==='same'){const k=pick([2,3,-2]);A2=k*A;B2=k*B;C2=k*C+(rel==='par'?pick([1,2,-1,3]):0);if(A2<0){A2=-A2;B2=-B2;C2=-C2}}
  else{let s=perp(m);if(rel==='neither'){const o=SLOPES.filter(r=>!sEq(r,m)&&!sEq(r,perp(m)));s=sNorm(pick(o))}[A2,B2,C2]=std(s,nz(-9,9))}
  const ans={par:relOpts[0],perp:relOpts[1],neither:relOpts[2],same:relOpts[3]}[rel],s2=sNorm([-A2,B2]);
  return mkFixed(`How are the lines ${stdT(A,B)} = ${N(C)} and ${stdT(A2,B2)} = ${N(C2)} related?`,relOpts,ans,`Solve each for y. The slopes are ${slT(m)} and ${slT(s2)}${rel==='same'?', and the y-intercepts match too':''}.`);},
 ()=>{const m=sNorm(pick(SLOPES)),rel=pick(['par','perp','neither']),x1=ri(-6,2),y1=ri(-6,2),k=pick([1,2]);
  let s=rel==='perp'?perp(m):m;if(rel==='neither'){s=sNorm(pick(SLOPES.filter(r=>!sEq(r,m)&&!sEq(r,perp(m)))))}
  const A=[x1,y1],B=[x1+m[1]*k,y1+m[0]*k],Cp=[ri(-6,3),ri(-6,3)],D=[Cp[0]+s[1],Cp[1]+s[0]];
  if((B[0]-A[0])*(Cp[1]-A[1])-(B[1]-A[1])*(Cp[0]-A[0])===0)return null;
  const ans={par:relOpts[0],perp:relOpts[1],neither:relOpts[2]}[rel];
  return mkFixed(`Line 1 passes through ${pt(...A)} and ${pt(...B)}. Line 2 passes through ${pt(...Cp)} and ${pt(...D)}. How are the lines related?`,relOpts,ans,`Slope of line 1: ${slT(m)}. Slope of line 2: ${slT(s)}.`);}
];

// =================== Math 1, Q3 ===================
const xi=(a,b)=>{const[l,h]=a<b?[a,b]:[b,a];return `x = ${N(l)} and x = ${N(h)}`};
const IF7=[
 ()=>{const a=pick([1,2,-1,3,-2]),r=nz(-6,6),s=nz(-6,6);if(r===s||r===-s)return null;
  return mkText(`What are the x-intercepts of f(x) = ${aT(a)}${fac(r)}${fac(s)}?`,xi(r,s),[xi(-r,-s),xi(-r,s),xi(r,-s),`x = 0 and x = ${N(a*r*s)}`],`Set each factor equal to 0: x = ${N(r)} or x = ${N(s)}.`);},
 ()=>{const a=pick([1,-1,2,-2,3]),h=nz(-5,5),k=nz(-8,8);
  return mkText(`What is the vertex of f(x) = ${vtx(a,h,k)}?`,pt(h,k),[pt(-h,k),pt(h,-k),pt(-h,-k),pt(k,h)],`In f(x) = a(x − h)<sup>2</sup> + k, the vertex is (h, k) = ${pt(h,k)}.`);},
 ()=>{const a=pick([1,-1,2,-2]),h=nz(-4,4),c=ri(-8,8),b=-2*a*h,k=c-a*h*h;
  return mkText(`What is the vertex of f(x) = ${polyT([a,b,c])}?`,pt(h,k),[pt(-h,3*a*h*h+c),pt(h,c),pt(-h,k),pt(k,h)],`x = −b ÷ (2a) = ${N(-b)} ÷ ${N(2*a)} = ${N(h)}. Then f(${N(h)}) = ${N(k)}.`);},
 ()=>{const a=pick([1,-1,2,-2,3,-3]),h=nz(-5,5),k=nz(-8,8);if(h===k)return null;const w=a<0?'maximum':'minimum',o=a<0?'minimum':'maximum';
  return mkText(`Does f(x) = ${vtx(a,h,k)} have a maximum or a minimum, and what is it?`,`A ${w} value of ${N(k)}`,[`A ${o} value of ${N(k)}`,`A ${w} value of ${N(h)}`,`A ${o} value of ${N(h)}`],`a = ${N(a)} is ${a<0?'negative, so the parabola opens down':'positive, so the parabola opens up'}. The ${w} is the y-value of the vertex, ${N(k)}.`);},
 ()=>{const a=pick([1,-1,2,-2]),h=nz(-5,5),k=nz(-8,8);if(h===k)return null;
  return mkText(`What is the range of f(x) = ${vtx(a,h,k)}?`,a>0?`y ≥ ${N(k)}`:`y ≤ ${N(k)}`,[a>0?`y ≤ ${N(k)}`:`y ≥ ${N(k)}`,a>0?`x ≥ ${N(h)}`:`x ≤ ${N(h)}`,'All real numbers',a>0?`y ≥ ${N(h)}`:`y ≤ ${N(h)}`],`The parabola opens ${a>0?'up':'down'} from its vertex ${pt(h,k)}, so y is ${a>0?'at least':'at most'} ${N(k)}.`);},
 ()=>{const a=pick([2,3,4,5,10,20]),b=pick([2,3,4,0.5]),f=`f(x) = ${a}·${rt(b)}<sup>x</sup>`;
  switch(ri(0,2)){
   case 0:return mkText(`What is the y-intercept of ${f}?`,pt(0,a),[pt(0,b),pt(0,a*b),pt(a,0)],`At x = 0, ${rt(b)}<sup>0</sup> = 1, so f(0) = ${a}.`);
   case 1:{const ok=b>1?'f(x) increases without bound.':'f(x) gets closer and closer to 0.';
    return mkText(`For ${f}, what happens to f(x) as x increases?`,ok,[b>1?'f(x) gets closer and closer to 0.':'f(x) increases without bound.','f(x) decreases without bound.',`f(x) gets closer and closer to ${a}.`],b>1?`The base ${rt(b)} is greater than 1, so the function grows.`:`The base ${rt(b)} is between 0 and 1, so each step multiplies by less than 1.`);}
   default:return mkText(`What is the range of ${f}?`,'y > 0',[`y ≥ ${a}`,'All real numbers',`y > ${a}`],`${rt(b)}<sup>x</sup> is always positive, and multiplying by ${a} keeps it positive. It never reaches 0.`);
  }},
 ()=>{const A=pick([2,3,4,5,6]),B=pick([2,3,4,5,6]);if(A===B)return null;const k=pick([1,2]),C=A*B*k;
  return mkText(`What are the x-intercept and y-intercept of ${A}x + ${B}y = ${C}?`,`${pt(B*k,0)} and ${pt(0,A*k)}`,[`${pt(A*k,0)} and ${pt(0,B*k)}`,`${pt(C,0)} and ${pt(0,C)}`,`${pt(-B*k,0)} and ${pt(0,-A*k)}`],`Set y = 0: ${A}x = ${C}, so x = ${B*k}. Set x = 0: ${B}y = ${C}, so y = ${A*k}.`);},
 ()=>{const a=pick([1,-1,2,-2]),h=ri(-3,3),k=ri(-4,4),yr=a>0?[k-2,k+8]:[k-8,k+2];
  const g=plot({xr:[h-4,h+4],yr,xs:1,ys:1,fns:[x=>a*(x-h)**2+k],alt:'Parabola'});
  return mkText(`Which function is shown in the graph?${g}`,'f(x) = '+vtx(a,h,k),['f(x) = '+vtx(a,-h,k),'f(x) = '+vtx(-a,h,k),'f(x) = '+vtx(a,h,-k),'f(x) = '+vtx(a,-h,-k)],`The vertex is ${pt(h,k)} and the parabola opens ${a>0?'up':'down'}${ab(a)===2?', twice as steep as x<sup>2</sup>':''}.`);}
];

const IF9=[
 ()=>{const m1=ri(1,6),b1=ri(-6,8),m2=Math.random()<.2?m1:ri(1,6),b2=ri(-6,8);
  return mkFixed(`f(x) = ${linT(m1,b1)}. The table shows g(x).${tblR([['x',0,1,2,3],['g(x)',...[0,1,2,3].map(x=>b2+m2*x)]])}Which function has the greater rate of change?`,cmpOpts,cmpAns(m1,m2),`f has slope ${m1}. g changes by ${m2} each time x increases by 1.`);},
 ()=>{const m1=pick([-2,-1,1,2,3]),b1=ri(-5,5),m2=nz(-4,4),b2=Math.random()<.2?b1:ri(-6,6);
  const g=plot({xr:[-5,5],yr:[-8,8],xs:1,ys:1,fns:[x=>m1*x+b1],alt:'Line'});
  return mkFixed(`The graph shows f(x). g(x) = ${linT(m2,b2)}.${g}Which function has the greater y-intercept?`,cmpOpts,cmpAns(b1,b2),`f crosses the y-axis at ${N(b1)}. g has y-intercept ${N(b2)}.`);},
 ()=>{const h1=ri(-3,3),k1=ri(-2,9),h2=ri(-2,2),k2=Math.random()<.2?k1:ri(-2,9);
  return mkFixed(`f(x) = ${vtx(-1,h1,k1)}. The table shows values of a quadratic function g.${tblR([['x',...[-2,-1,0,1,2].map(i=>h2+i)],['g(x)',...[-2,-1,0,1,2].map(i=>k2-i*i)]])}Which function has the greater maximum value?`,cmpOpts,cmpAns(k1,k2),`f has a maximum of ${N(k1)} at its vertex. g's largest value, ${N(k2)}, is in the middle of the table.`);},
 ()=>{const a=pick([1,2,3]),b=ri(5,30),m=ri(2,9),n=ri(3,6),fv=a*2**n,gv=b+m*n;if(fv===gv)return null;
  return mkFixed(`f(x) = ${a===1?'':a+'·'}2<sup>x</sup>. g(x) starts at ${b} when x = 0 and increases by ${m} each time x increases by 1. Which function has the greater value at x = ${n}?`,cmpOpts,cmpAns(fv,gv),`f(${n}) = ${fv} and g(${n}) = ${b} + ${m}(${n}) = ${gv}.`);},
 ()=>{const expF=Math.random()<.5,a=ri(1,4),m=ri(5,20),b=ri(0,20);
  const fE=`${a===1?'':a+'·'}3<sup>x</sup>`,gL=linT(m,b);
  return mkFixed(`f(x) = ${expF?fE:gL} and g(x) = ${expF?gL:fE}. Which function will have greater values for very large x?`,cmpOpts,expF?cmpOpts[0]:cmpOpts[1],`An increasing exponential function eventually grows faster than any linear function.`);}
];

const sys=(m1,b1,m2,b2)=>plot({xr:[-6,6],yr:[-6,6],xs:1,ys:1,fns:[x=>m1*x+b1,x=>m2*x+b2],alt:'Two lines'});
const REI6=[
 ()=>{const x0=ri(-5,6),y0=ri(-5,6),m=nz(-4,4),b=y0-m*x0,A=ri(1,5),B=nz(-4,4),C=A*x0+B*y0;
  return mkText(`Solve the system:<br>y = ${linT(m,b)}<br>${stdT(A,B)} = ${N(C)}`,pt(x0,y0),[pt(y0,x0),pt(-x0,y0),pt(x0+1,y0+m),pt(x0,-y0)],`Substitute ${linT(m,b)} for y in the second equation and solve: x = ${N(x0)}. Then y = ${N(y0)}.`);},
 ()=>{const x0=ri(-5,6),y0=ri(-5,6),a1=ri(1,5),a2=ri(1,5),b=ri(1,5);if(a1===-a2)return null;const c1=a1*x0+b*y0,c2=a2*x0-b*y0;
  return mkText(`Solve the system:<br>${stdT(a1,b)} = ${N(c1)}<br>${stdT(a2,-b)} = ${N(c2)}`,pt(x0,y0),[pt(y0,x0),pt(-x0,y0),pt(x0,-y0),pt(x0+1,y0)],`Add the equations to eliminate y: ${a1+a2}x = ${N(c1+c2)}, so x = ${N(x0)}. Substitute to get y = ${N(y0)}.`);},
 ()=>{const t=ri(3,12),r1_=ri(8,15),r2_=r1_-ri(2,6),F1=ri(10,40),F2=F1+(r1_-r2_)*t,C=F1+r1_*t,ask=Math.random()<.5;
  const stem=`Plan A costs $${F1} to join plus $${r1_} per month. Plan B costs $${F2} to join plus $${r2_} per month.`;
  return ask?mkN(stem+' After how many months do the plans cost the same?',t,[(F2+F1)/(r1_-r2_),(F2-F1)/(r1_+r2_),t+1,C].filter(isInt),`Solve ${F1} + ${r1_}m = ${F2} + ${r2_}m: ${r1_-r2_}m = ${F2-F1}, so m = ${t}.`,{min:1,step:1})
   :mkN(stem+' When the plans cost the same, what is that cost, in dollars?',C,[t,F1+F2,F2+r1_*t,C+r1_],`The plans match after ${t} months: ${F1} + ${r1_}(${t}) = $${C}.`,{min:1,step:r2_});},
 ()=>{const m=nz(-3,3),b=nz(-6,6),k=pick([1,2,3]),rel=pick(['one','none','inf']);let A=-m*k,B=k,C=k*b;
  if(rel==='none')C+=pick([1,2,-1,-2])*k;if(rel==='one')A+=pick([1,-1,2]);
  const ans=rel==='one'?nSol[0]:rel==='none'?nSol[1]:nSol[2];
  return mkFixed(`How many solutions does this system have?<br>y = ${linT(m,b)}<br>${stdT(A,B)} = ${N(C)}`,nSol,ans,rel==='one'?'The slopes are different, so the lines cross once.':rel==='none'?'Solving the second for y gives the same slope but a different y-intercept: parallel lines never meet.':'Solving the second for y gives the same line, so every point on it is a solution.');},
 ()=>{const x0=ri(-4,4),y0=ri(-4,4),ms=shuffle([-3,-2,-1,0,1,2,3]),m1=ms[0],m2=ms[1],b1=y0-m1*x0,b2=y0-m2*x0;
  return mkText(`What is the solution to the system graphed below?${sys(m1,b1,m2,b2)}`,pt(x0,y0),[pt(y0,x0),pt(0,b1),pt(0,b2),pt(-x0,-y0)],`The lines cross at ${pt(x0,y0)}.`);},
 ()=>{const x0=ri(1,4),m1=ri(1,5),m2=-ri(1,4),y0=ri(4,15),b1=y0-m1*x0,b2=y0-m2*x0,xs=[0,1,2,3,4,5];
  return mkText(`The table shows two linear functions.${tblR([['x',...xs],['f(x)',...xs.map(x=>b1+m1*x)],['g(x)',...xs.map(x=>b2+m2*x)]])}At what point do f and g have the same value?`,pt(x0,y0),[pt(y0,x0),pt(x0+1,b1+m1*(x0+1)),pt(0,b1),pt(x0,b2)],`At x = ${x0}, both functions equal ${y0}.`);}
];

// =================== Math 1, Q4 ===================
const rc=()=>ri(-7,7);
const APR1=[
 ()=>{const P=[nz(-5,6),rc(),rc()],Q=[nz(-5,6),rc(),rc()],S=P.map((c,i)=>c+Q[i]);if(!S[0])return null;
  const ok=polyT(S),i=ri(1,2),bad=S.slice();bad[i]=P[i]-Q[i];
  return mkText(`Simplify: (${polyT(P)}) + (${polyT(Q)})`,ok,[polyT(bad),ok.replace('x<sup>2</sup>','x<sup>4</sup>'),polyT([S[0]+S[1],0,S[2]]),polyT([S[0],S[1],P[2]*Q[2]])],`Add like terms: x<sup>2</sup> terms, then x terms, then constants.`);},
 ()=>{const P=[nz(-5,6),rc(),rc()],Q=[nz(-5,6),nz(-7,7),nz(-7,7)],D=P.map((c,i)=>c-Q[i]);if(!D[0])return null;
  return mkText(`Simplify: (${polyT(P)}) − (${polyT(Q)})`,polyT(D),[polyT([P[0]-Q[0],P[1]+Q[1],P[2]+Q[2]]),polyT(P.map((c,i)=>c+Q[i])),polyT([D[0],D[1],P[2]+Q[2]])],`Subtracting means changing the sign of every term in the second polynomial, then combining like terms.`);},
 ()=>{const p=nz(-7,7),q=nz(-7,7);if(p+q===0)return null;
  return mkText(`Multiply: (x ${sg(p)} ${ab(p)})(x ${sg(q)} ${ab(q)})`,polyT([1,p+q,p*q]),[polyT([1,0,p*q]),polyT([1,p*q,p+q]),polyT([1,p+q,-p*q]),polyT([1,p-q,p*q])],`x·x = x<sup>2</sup>, the outer and inner products give ${N(q)}x ${sg(p)} ${ab(p)}x = ${N(p+q)}x, and ${N(p)}·${N(q)} = ${N(p*q)}.`);},
 ()=>{const a=pick([2,3,4,-2]),b=pick([1,2,3,5]),p=nz(-6,6),q=nz(-6,6),mid=a*q+b*p;
  return mkText(`Multiply: (${cf(a,'x')} ${sg(p)} ${ab(p)})(${cf(b,'x')} ${sg(q)} ${ab(q)})`,polyT([a*b,mid,p*q]),[polyT([a*b,a*p+b*q,p*q]),polyT([a+b,mid,p*q]),polyT([a*b,mid,p+q]),polyT([a*b,0,p*q])],`First ${N(a)}x·${N(b)}x = ${N(a*b)}x<sup>2</sup>. Outer + inner: ${N(a*q)}x ${sg(b*p)} ${ab(b*p)}x = ${N(mid)}x. Last: ${N(p*q)}.`);},
 ()=>{const c=pick([2,3,4,-2,-3]),a=nz(-5,5),b=nz(-6,6),d=nz(-6,6);
  return mkText(`Multiply: ${cf(c,'x')}(${polyT([a,b,d])})`,polyT([c*a,c*b,c*d,0]),[polyT([c*a,c*b,c*d]),polyT([c*a,c*b,d,0]),polyT([c+a,c+b,c+d,0])],`Multiply every term by ${cf(c,'x')}: the exponents go up by 1 and the coefficients multiply by ${N(c)}.`);},
 ()=>{const p=nz(-8,8);
  return mkText(`Expand: (x ${sg(p)} ${ab(p)})<sup>2</sup>`,polyT([1,2*p,p*p]),[polyT([1,0,p*p]),polyT([1,p,p*p]),polyT([1,2*p,2*p]),polyT([1,2*p,-p*p])],`(x ${sg(p)} ${ab(p)})(x ${sg(p)} ${ab(p)}) = x<sup>2</sup> ${sg(p)} ${ab(p)}x ${sg(p)} ${ab(p)}x + ${p*p}. Don't forget the middle term.`);},
 ()=>{const a=pick([2,3]),p=ri(1,6),q=-ri(1,5),area=Math.random()<.5;
  const L=`${a}x + ${p}`,W=`x − ${-q}`;
  return area?mkText(`A rectangle has length ${L} and width ${W}. Which expression gives its area?`,polyT([a,a*q+p,p*q]),[polyT([a,0,p*q]),polyT([a,a*p+q,p*q]),polyT([2*(a+1),2*(p+q)]),polyT([a,a*q+p,p+q])],`Area = (${L})(${W}) = ${polyT([a,a*q+p,p*q])}.`)
   :mkText(`A rectangle has length ${L} and width ${W}. Which expression gives its perimeter?`,polyT([2*(a+1),2*(p+q)]),[polyT([a+1,p+q]),polyT([2*(a+1),p+q]),polyT([a,a*q+p,p*q])],`Perimeter = 2(length + width) = 2(${polyT([a+1,p+q])}) = ${polyT([2*(a+1),2*(p+q)])}.`);}
];

const SETS=['quiz scores','minutes of homework','points scored per game','daily high temperatures (°F)'];
const data=(n,lo,hi)=>[...Array(n)].map(()=>ri(lo,hi));
const SID2=[
 ()=>{const d=data(pick([7,9]),4,40),ok=med(d),mid=d[(d.length-1)/2];if(mid===ok)return null;
  return mkN(`What is the median of these ${pick(SETS)}?<br>${listT(d)}`,ok,[mid,r1(mean(d)),Math.max(...d)-Math.min(...d)],`Order the values first: ${listT(sortN(d))}. The middle value is ${ok}.`,{min:0});},
 ()=>{const d=data(8,10,50),[q1,q3]=quart(d),iqr=q3-q1;if(iqr<=0)return null;
  return mkN(`What is the interquartile range (IQR) of this data?<br>${listT(d)}`,iqr,[Math.max(...d)-Math.min(...d),q3,q1,med(d)],`Ordered: ${listT(sortN(d))}. Q1 = ${n2(q1)} (median of the lower half) and Q3 = ${n2(q3)} (median of the upper half). IQR = ${n2(q3)} − ${n2(q1)} = ${n2(iqr)}.`,{min:0,step:2});},
 ()=>{const sk=pick(['skewed right','skewed left','symmetric','has an outlier']),robust=sk!=='symmetric';
  return mkText(`A data set's distribution ${sk==='has an outlier'?'is mostly symmetric but has an extreme outlier':'is '+sk}. Which statistics best describe its center and spread?`,robust?'Median and IQR':'Mean and standard deviation',robust?['Mean and standard deviation','Mean and IQR','Median and standard deviation']:['Median and IQR','Mean and IQR','Median and standard deviation'],robust?'Skew and outliers pull the mean and standard deviation; the median and IQR resist them.':'For symmetric data without outliers, the mean and standard deviation use every value and describe the data well.');},
 ()=>{const d=data(7,60,85),o=pick([5,12,98,140]);d.push(o);const mn=mean(d),md=med(d);
  return mkFixed(`The data set ${listT(d)} contains an outlier. Which is greater, the mean or the median?`,['The mean','The median','They are equal','There is not enough information'],mn>md?'The mean':'The median',`The outlier ${o} pulls the mean ${o>md?'up':'down'} (mean ≈ ${r1(mn)}) but barely moves the median (${n2(md)}).`);},
 ()=>{const A=data(7,10,40),B=data(7,10,40),st=pick(['median','IQR','mean']);
  const f=st==='median'?med:st==='mean'?mean:(a=>{const[q1,q3]=quart(a);return q3-q1});
  const a=f(A),b=f(B);if(ab(a-b)<1e-9)return null;
  return mkFixed(`Set A: ${listT(A)}<br>Set B: ${listT(B)}<br>Which set has the greater ${st}?`,['Set A','Set B','They are equal','There is not enough information'],a>b?'Set A':'Set B',`Set A: ${n2(r1(a))}. Set B: ${n2(r1(b))}.`);},
 ()=>{const c=ri(20,40),tight=[-2,-1,-1,0,0,1,1,2].map(x=>c+x),wide=[-9,-6,-3,0,0,3,6,9].map(x=>c+x),aW=Math.random()<.5;
  const A=shuffle(aW?wide:tight),B=shuffle(aW?tight:wide);
  return mkFixed(`Both sets have a mean of ${c}.<br>Set A: ${listT(A)}<br>Set B: ${listT(B)}<br>Which set has the greater standard deviation?`,['Set A','Set B','They are equal','There is not enough information'],aW?'Set A':'Set B',`Standard deviation measures how far values typically are from the mean. Set ${aW?'A':'B'}'s values are much more spread out from ${c}.`);}
];

const REG=[
 {x:'the number of hours studied',xu:'hour studied',y:'test score',yu:'points',y1:'point',m:[2.5,3,4,5],b:[52,55,58,60],xv:[2,9]},
 {x:'the age of the car in years',xu:'year',y:'value of the car',yd:'in thousands of dollars',yu:'thousand dollars',y1:'thousand dollars',m:[-1.5,-2,-2.5],b:[24,26,30],xv:[1,9]},
 {x:'the number of weeks since planting',xu:'week',y:'plant height',yd:'in cm',yu:'cm',y1:'cm',m:[1.5,2,2.5,3],b:[3,4,5],xv:[2,10]},
 {x:'the number of minutes of video streamed',xu:'minute',y:'battery charge',yd:'in percent',yu:'percentage points',y1:'percentage point',m:[-0.5,-0.4,-0.25],b:[95,100],xv:[20,120]},
 {x:'the outside temperature in °F',xu:'degree',y:'number of cups of cocoa sold',yu:'cups',y1:'cup',m:[-1.5,-2,-2.5],b:[120,140,150],xv:[20,50]}];
const regPick=()=>{const c=pick(REG);return {c,m:pick(c.m),b:pick(c.b)}};
const regStem=(c,m,b)=>`A line of best fit for some data is y = ${linT(m,b)}, where x is ${c.x} and y is the ${c.y}${c.yd?` ${c.yd}`:''}.`;
const REGQ=[
 ()=>{const {c,m,b}=regPick(),x=ri(...c.xv),y=+(b+m*x).toFixed(2);
  return mkN(regStem(c,m,b)+` What does the model predict for x = ${x}?`,y,[+(m*x).toFixed(2),+(b-m*x).toFixed(2),+((x-b)/m).toFixed(2)],`Substitute x = ${x}: ${n2(m)}(${x}) ${sg(b)} ${ab(b)} = ${n2(y)}.`,{min:0});},
 ()=>{const {c,m,b}=regPick(),u=m>0?'increases':'decreases',w=m>0?'decreases':'increases';
  return mkText(regStem(c,m,b)+` What does the slope, ${n2(m)}, mean?`,`For each additional ${c.xu}, the predicted ${c.y} ${u} by ${n2(ab(m))} ${c.yu}.`,[`For each additional ${c.xu}, the predicted ${c.y} ${w} by ${n2(ab(m))} ${c.yu}.`,`When x is 0, the predicted ${c.y} is ${n2(m)} ${c.yu}.`,`For each additional ${c.y1} of ${c.y}, x ${u} by ${n2(ab(m))}.`],`Slope is the change in y for each 1-unit increase in x.`);},
 ()=>{const {c,m,b}=regPick();
  return mkText(regStem(c,m,b)+` What does the y-intercept, ${n2(b)}, mean?`,`When x is 0, the predicted ${c.y} is ${n2(b)} ${c.yu}.`,[`For each additional ${c.xu}, the predicted ${c.y} changes by ${n2(b)} ${c.yu}.`,`x is ${n2(b)} when the predicted ${c.y} is 0.`,`The greatest possible ${c.y} is ${n2(b)} ${c.yu}.`],`The y-intercept is the predicted y when x = 0.`);},
 ()=>{const {c,m,b}=regPick(),x=ri(...c.xv),yh=+(b+m*x).toFixed(2),res=nz(-6,6)*(ab(m)<1?1:2),act=+(yh+res).toFixed(2);
  return mkN(regStem(c,m,b)+` One data point is (${x}, ${n2(act)}). What is its residual?`,res,[-res,yh,act,+(res*2).toFixed(2)],`Residual = actual − predicted = ${n2(act)} − ${n2(yh)} = ${n2(res)}.`,{step:1});},
 ()=>{const {c,m,b}=regPick(),x=ri(...c.xv),y=+(b+m*x).toFixed(2);
  return mkN(regStem(c,m,b)+` According to the model, what x-value gives a predicted y of ${n2(y)}?`,x,[+(m*y+b).toFixed(2),+((y+b)/m).toFixed(2),+(y/m).toFixed(2)],`Solve ${n2(y)} = ${linT(m,b)}: subtract ${n2(b)}, then divide by ${n2(m)} to get x = ${x}.`,{min:0,step:1});},
 ()=>{const {c,m,b}=regPick(),d=pick([2,3,4,5,10]);
  return mkN(regStem(c,m,b)+` By how much does the predicted y change when x increases by ${d}?`,+(m*d).toFixed(2),[m,+(m+d).toFixed(2),+(b+m*d).toFixed(2)],`Each 1-unit increase changes y by ${n2(m)}, so ${d} units change it by ${n2(m)} × ${d} = ${n2(m*d)}.`,{step:1});}
];
function fitEq(){
  const m=pick([2,3,-2,-3,1.5,-1.5,2.5]),b=m>0?ri(3,10):ri(28,36),p=[...Array(12)].map(()=>{const x=ri(1,10);return [x,r1(b+m*x+(Math.random()-.5)*4)]});
  const g=plot({xr:[0,11],yr:yrOf(p),xs:1,pts:p,alt:'Scatter plot'});
  return mkText(`Which equation best fits the data in the scatter plot?${g}`,'y = '+linT(m,b),['y = '+linT(-m,b),'y = '+linT(m,b+(m>0?14:-14)),'y = '+linT(m*3,b),'y = '+linT(-m,b+10*m)],`The points trend ${m>0?'up':'down'} by about ${n2(ab(m))} per 1 unit of x and start near ${b}.`);
}
const SID6=[REGQ[0],REGQ[1],REGQ[3],REGQ[4],fitEq,
 ()=>{const curve=Math.random()<.5,p=[...Array(12)].map((_,i)=>{const x=i+1;return [x,r1(curve?0.25*(x-6.5)**2-3+(Math.random()-.5)*1.2:(Math.random()-.5)*6)]});
  const g=plot({xr:[0,13],yr:[-6,6],xs:1,ys:1,pts:p,xl:'x',yl:'residual',alt:'Residual plot'});
  const yes='Yes. The residuals are scattered randomly above and below 0.',no='No. The residuals form a curved pattern.';
  return mkText(`The residual plot for a linear model is shown. Is a linear model appropriate?${g}`,curve?no:yes,[curve?yes:no,'Yes. Some residuals are positive and some are negative.','No. Some of the residuals are not 0.'],curve?'A clear curve in the residuals means the data have a nonlinear pattern the line misses.':'Random scatter with no pattern means the line captures the trend.');},
 ()=>{const a=pick([50,80,120,200]),b=pick([1.05,1.1,1.2,0.9,0.85]),x=pick([2,3,4,5]),y=r1(a*b**x);
  return mkN(`An exponential model for the data is y = ${a}(${b})<sup>x</sup>. What does the model predict for x = ${x}? Round to the nearest tenth.`,y,[r1(a*b*x),r1(a*b**(x-1)),r1((a*b)**x/a**(x-1)),r1(a+b**x)],`${a} × ${b}<sup>${x}</sup> ≈ ${y}.`,{fmt:v=>v.toFixed(1),min:0,step:Math.max(1,Math.round(y*.08))});}
];

const SID8=[
 ()=>{const vals=shuffle([-0.95,-0.88,-0.72,-0.41,-0.15,0.1,0.33,0.58,0.79,0.91]).slice(0,4),strong=Math.random()<.65;
  const by=vals.slice().sort((x,y)=>ab(y)-ab(x)),c=strong?by[0]:by[3];
  if(ab(ab(by[0])-ab(by[1]))<.02||ab(ab(by[2])-ab(by[3]))<.02)return null;
  return mkText(`Which correlation coefficient shows the ${strong?'strongest':'weakest'} linear relationship?`,n2(c),vals.filter(v=>v!==c).map(n2),`Strength depends on how close r is to 1 or −1, not on its sign. |${n2(c)}| is the ${strong?'largest':'smallest'}.`);},
 ()=>{const st=pick(['strong','moderate']),r=(st==='strong'?ri(82,97):ri(48,66))/100*(Math.random()<.5?-1:1),d=r>0?'positive':'negative',od=r>0?'negative':'positive',os=st==='strong'?'weak':'strong';
  return mkText(`The correlation coefficient for a data set is r = ${n2(r)}. Which describes the relationship?`,`A ${st} ${d} linear relationship`,[`A ${os} ${d} linear relationship`,`A ${st} ${od} linear relationship`,'No linear relationship'],`The sign of r gives the direction (${d}); how close |r| is to 1 gives the strength.`);},
 ()=>{const t=pick([0.95,0.4,-0.4,-0.95]),p=scatR(t);if(!p)return null;
  const g=plot({xr:[0,10],yr:yrOf(p),xs:1,pts:p,alt:'Scatter plot'});
  return mkFixed(`Which value is closest to the correlation coefficient for this scatter plot?${g}`,['0.95','0.40','−0.40','−0.95'],t>0?(t>.7?'0.95':'0.40'):(t<-.7?'−0.95':'−0.40'),`The points trend ${t>0?'up':'down'} and are ${ab(t)>.7?'tightly packed around a line (strong)':'loosely scattered (weak)'}.`);},
 ()=>{const c=pick([['ice cream sales','sunburns','eating ice cream causes sunburns','Hot, sunny weather'],['the number of firefighters at a fire','the damage done','firefighters cause more damage','The size of the fire'],['shoe size','reading level among elementary students','bigger feet make students read better','Age'],['hours of TV watched','test scores','watching TV lowers test scores','Many other factors']]);
  return mkText(`There is a strong correlation between ${c[0]} and ${c[1]}. Which statement is true?`,'The two are associated, but this does not show that one causes the other.',[`This shows that ${c[2]}.`,'Because r is close to ±1, one variable must cause the other.','There is no relationship between the two variables.'],`Correlation is not causation. ${c[3]} could affect both.`);},
 ()=>{const curve=Math.random()<.5,r=n2(ri(88,97)/100);
  const yes='Yes. The residuals show no pattern, so a line fits well.',no='No. The residuals show a curve, so a nonlinear model fits better.';
  return mkText(`A data set has r = ${r}, and its residual plot ${curve?'shows a clear U-shaped curve':'shows points scattered randomly around 0'}. Is a linear model appropriate?`,curve?no:yes,[curve?yes:no,`Yes. Because r = ${r} is close to 1, a line always fits.`,'No. A linear model needs r to be exactly 1.'],'A high r is not enough on its own. Check the residual plot for patterns.');}
];

// =================== Math 8 ===================
const pw=(b,e)=>`${b<0?'('+N(b)+')':b}<sup>${N(e)}</sup>`;
const pv=(b,k)=>k>=0?N(b**k):fr(1,b**(-k));      // value of b^k as text
const EE1=[
 ()=>{const b=pick([2,3,5,7,10]),e1=nz(-6,6),e2=nz(-6,6);if(e1+e2===e1*e2||e1===e2)return null;
  return mkText(`Which expression is equivalent to ${pw(b,e1)} · ${pw(b,e2)}?`,pw(b,e1+e2),[pw(b,e1*e2),pw(b*b,e1+e2),pw(b,e1-e2)],`Same base: add the exponents. ${N(e1)} + ${N(e2)} = ${N(e1+e2)}.`);},
 ()=>{const b=pick([2,3,4,5,6]),e1=nz(-5,7),e2=nz(-5,5);if(e1===e2||e1-e2===e1+e2)return null;
  return mkText(`Which expression is equivalent to ${pw(b,e1)} ÷ ${pw(b,e2)}?`,pw(b,e1-e2),[pw(b,e1+e2),pw(b,e2-e1),pw(1,e1-e2)],`Same base: subtract the exponents. ${N(e1)} − ${N(e2)} = ${N(e1-e2)}.`);},
 ()=>{const b=pick([2,3,5,7]),e1=nz(-4,5),e2=nz(-3,4);if(e1*e2===e1+e2||ab(e1)===1&&ab(e2)===1)return null;
  return mkText(`Which expression is equivalent to (${pw(b,e1)})<sup>${N(e2)}</sup>?`,pw(b,e1*e2),[pw(b,e1+e2),pw(b,e1-e2),pw(b*ab(e2),e1)],`Power of a power: multiply the exponents. ${N(e1)} × ${N(e2)} = ${N(e1*e2)}.`);},
 ()=>{const b=pick([2,3,4,5,10]),e=pick([1,2,3]);if(b**e>1000)return null;
  return mkText(`What is the value of ${pw(b,-e)}?`,fr(1,b**e),[N(-(b**e)),N(-b*e),fr(1,b*e),fr(-1,b**e)],`A negative exponent means a reciprocal: ${pw(b,-e)} = 1 ÷ ${pw(b,e)} = ${fr(1,b**e)}.`);},
 ()=>{const b=pick([2,3,5]),k=ri(-2,3),e1=nz(-5,6),e3=nz(-4,5),e2=k-e1+e3;if(!e2)return null;
  return mkText(`What is the value of (${pw(b,e1)} · ${pw(b,e2)}) ÷ ${pw(b,e3)}?`,pv(b,k),[pv(b,k+1),pv(b,-k),pv(b,e1+e2+e3),pv(b,k-1)],`Add then subtract exponents: ${N(e1)} + ${N(e2)} − ${N(e3)} = ${N(k)}, and ${pw(b,k)} = ${pv(b,k)}.`);},
 ()=>{const a=nz(-9,9),c=pick([2,3,4,5]),v=Math.random()<.5;
  return v?mkText(`What is the value of ${pw(a,0)} + ${pw(c,0)}?`,'2',['0','1',N(a+c)],`Any nonzero number to the 0 power is 1, so 1 + 1 = 2.`)
   :mkText(`What is the value of ${pw(c,0)} × ${c}?`,N(c),['0','1',N(c*c)],`${pw(c,0)} = 1, and 1 × ${c} = ${c}.`);},
 ()=>{const b=pick([2,3,4,5,7]),e=pick([2,3,4]);
  return mkText(`Which expression is equivalent to ${pw(b,-e)}?`,`<sup>1</sup>⁄<sub>${pw(b,e)}</sub>`,[`−${pw(b,e)}`,`−${b*e}`,`<sup>1</sup>⁄<sub>${pw(-b,e)}</sub>`].filter(s=>!(e%2===0&&s.includes('('))),`A negative exponent moves the power to the denominator: ${pw(b,-e)} = 1 ÷ ${pw(b,e)}.`);}
];

const opp={'<':'>','>':'<','≤':'≥','≥':'≤'},incl={'<':'≤','>':'≥','≤':'<','≥':'>'};
const EE7=[
 ()=>{const a=nz(-5,9),x=ri(-9,12),b=nz(-12,12),c=a*x+b;if(ab(a)===1)return null;
  return mkN(`Solve: ${linT(a,b)} = ${N(c)}`,x,[(c+b)/a,c/a-b,(c-b)*a,c-b-a].filter(isInt),`${b>0?'Subtract '+b+' from':'Add '+(-b)+' to'} both sides: ${cf(a,'x')} = ${N(c-b)}. Divide by ${N(a)}: x = ${N(x)}.`,{step:1});},
 ()=>{const a=ri(2,9),c=ri(-6,8),x=ri(-8,10),b=nz(-12,12);if(a===c)return null;const d=a*x+b-c*x;
  return mkN(`Solve: ${linT(a,b)} = ${linT(c,d)}`,x,[(d-b)/(a+c),(d+b)/(a-c),(b-d)/(a-c)].filter(isInt),`Collect x terms: ${N(a-c)}x = ${N(d-b)}, so x = ${N(x)}.`,{step:1});},
 ()=>{const a=pick([2,3,4,5,-2,-3]),b=nz(-8,8),x=ri(-6,10),c=a*(x+b);
  return mkN(`Solve: ${N(a)}(x ${sg(b)} ${ab(b)}) = ${N(c)}`,x,[(c-b)/a,c/a+b,c-a*b,(c+a*b)/a].filter(isInt),`Distribute: ${linT(a,a*b)} = ${N(c)}. Then ${cf(a,'x')} = ${N(c-a*b)}, so x = ${N(x)}.`,{step:1});},
 ()=>{const rel=pick(['one','none','inf']),a=pick([2,3,4,5]),p=nz(-6,6);let L,R;
  if(rel==='one'){const c=a+pick([1,-1,2]);L=`${a}(x ${sg(p)} ${ab(p)})`;R=linT(c,nz(-9,9))}
  else if(rel==='none'){L=`${a}(x ${sg(p)} ${ab(p)})`;R=linT(a,a*p+pick([1,2,-1,-3]))}
  else{const r=ri(1,3);L=`${a}(x ${sg(p)} ${ab(p)}) + ${r}x`;R=linT(a+r,a*p)}
  return mkFixed(`How many solutions does ${L} = ${R} have?`,nSol,rel==='one'?nSol[0]:rel==='none'?nSol[1]:nSol[2],rel==='one'?'The x terms have different coefficients, so there is exactly one value of x that works.':rel==='none'?'The x terms match but the constants do not, which ends in a false statement like 0 = 3.':'Both sides simplify to the same expression, so every x works.');},
 ()=>{const c=pick([{s:(F,r,T)=>`A gym charges a $${F} sign-up fee plus $${r} per class. Ana paid $${T} in all. How many classes did she take?`,F:[20,25,30,40],r:[8,10,12,15]},
   {s:(F,r,T)=>`A taxi charges $${F} plus $${r} per mile. A ride costs $${T}. How many miles long was the ride?`,F:[3,4,5],r:[2,3]},
   {s:(F,r,T)=>`Jamal has $${F} saved and adds $${r} each week. After how many weeks will he have $${T}?`,F:[40,55,70],r:[15,20,25]}]);
  const F=pick(c.F),r=pick(c.r),n=ri(3,12),T=F+r*n;
  return mkN(c.s(F,r,T),n,[(T+F)/r,T/r,T-F,(T-r)/F].filter(isInt),`Solve ${F} + ${r}n = ${T}: ${r}n = ${T-F}, so n = ${n}.`,{min:1,step:1});},
 ()=>{const a=nz(-5,6),b=nz(-9,9),k=ri(-6,8),c=a*k+b,op=pick(['<','>','≤','≥']);if(ab(a)===1)return null;
  const sol=a<0?opp[op]:op;
  return mkText(`Solve: ${linT(a,b)} ${op} ${N(c)}`,`x ${sol} ${N(k)}`,[`x ${opp[sol]} ${N(k)}`,`x ${incl[sol]} ${N(k)}`,`x ${sol} ${N(-k)}`,`x ${opp[sol]} ${N(-k)}`],`${b>0?'Subtract '+b:'Add '+(-b)}, then divide by ${N(a)}${a<0?'. Dividing by a negative number flips the inequality sign':''}: x ${sol} ${N(k)}.`);},
 ()=>{const q=pick([2,3,4,5]),b=nz(-8,8),x=q*ri(-4,6),c=x/q+b;
  return mkN(`Solve: ${fr(1,q)}x ${sg(b)} ${ab(b)} = ${N(c)}`,x,[(c-b)/q,c*q-b,(c+b)*q].filter(isInt),`${b>0?'Subtract '+b:'Add '+(-b)}: ${fr(1,q)}x = ${N(c-b)}. Multiply by ${q}: x = ${N(x)}.`,{step:q});}
];

const EE8=[
 ()=>{const x0=ri(-5,6),y0=ri(-6,6),m1=nz(-4,4),m2=nz(-4,4);if(m1===m2)return null;const b1=y0-m1*x0,b2=y0-m2*x0;
  return mkText(`Solve the system:<br>y = ${linT(m1,b1)}<br>y = ${linT(m2,b2)}`,pt(x0,y0),[pt(y0,x0),pt(x0+1,m1*(x0+1)+b1),pt(0,b1),pt(-x0,y0)],`Set the expressions equal: ${linT(m1,b1)} = ${linT(m2,b2)} gives x = ${N(x0)}. Then y = ${N(y0)}.`);},
 ()=>{const m=nz(-4,4),b=nz(-8,8),rel=pick(['one','none','inf']);let m2=m,b2=b,show=`y = ${linT(m2,b2)}`;
  if(rel==='one')m2=m+pick([1,-1,2]);if(rel==='none')b2=b+pick([2,3,-2,-4]);
  show=rel==='inf'?`y = ${N(b)} ${m<0?'−':'+'} ${cf(ab(m),'x')}`:`y = ${linT(m2,b2)}`;
  return mkFixed(`How many solutions does this system have?<br>y = ${linT(m,b)}<br>${show}`,nSol,rel==='one'?nSol[0]:rel==='none'?nSol[1]:nSol[2],rel==='one'?'Different slopes: the lines cross at exactly one point.':rel==='none'?'Same slope, different y-intercepts: the lines are parallel and never meet.':'Same slope and same y-intercept: it is the same line.');},
 ()=>{const x0=ri(-4,4),y0=ri(-4,4),ms=shuffle([-3,-2,-1,1,2,3]),b1=y0-ms[0]*x0,b2=y0-ms[1]*x0;
  return mkText(`What is the solution to the system graphed below?${sys(ms[0],b1,ms[1],b2)}`,pt(x0,y0),[pt(y0,x0),pt(0,b1),pt(0,b2),pt(-x0,-y0)],`The solution is where the lines cross: ${pt(x0,y0)}.`);},
 ()=>{const t=ri(3,10),r2=ri(5,15),r1_=r2+ri(2,8),a=ri(10,40),b=a+(r1_-r2)*t,ask=Math.random()<.5,amt=a+r1_*t;
  const stem=`Ana has $${a} and saves $${r1_} each week. Ben has $${b} and saves $${r2} each week.`;
  return ask?mkN(stem+' After how many weeks will they have the same amount?',t,[(b+a)/(r1_-r2),(b-a)/(r1_+r2),t+1].filter(isInt),`Solve ${a} + ${r1_}w = ${b} + ${r2}w: ${r1_-r2}w = ${b-a}, so w = ${t}.`,{min:1,step:1})
   :mkN(stem+' How much will each of them have when their amounts are equal?',amt,[t,a+b,b+r1_*t],`They match after ${t} weeks: ${a} + ${r1_}(${t}) = $${amt}.`,{min:1,step:r2});},
 ()=>{const x0=ri(-5,5),y0=ri(-5,5),m1=nz(-3,3),m2=nz(-3,3);if(m1===m2)return null;const b1=y0-m1*x0,b2=y0-m2*x0;
  return mkText(`Which point is a solution to both equations?<br>y = ${linT(m1,b1)}<br>y = ${linT(m2,b2)}`,pt(x0,y0),[pt(x0+1,m1*(x0+1)+b1),pt(x0+1,m2*(x0+1)+b2),pt(y0,x0)],`${pt(x0,y0)} makes both equations true. The other points are on at most one line.`);}
];

const relSet=pairs=>`{${pairs.map(([x,y])=>pt(x,y)).join(', ')}}`;
const FNPAIRS=[['each student in your class','their birthday',1],['each month','a student born that month',0],['each person','their height',1],['each height','a person who is that tall',0],['each car','its license plate number',1],['each street name','a house on that street',0],['each number x','2x + 1',1],['each positive number x','a number whose square is x',0],['each day','that day’s high temperature',1],['each test score','a student who earned it',0]];
const F1=[
 ()=>{const not=Math.random()<.4;const mk1=bad=>{const xs=shuffle([...Array(9).keys()].map(i=>i-2)).slice(0,4),ys=xs.map(()=>ri(-3,9));if(bad){xs[3]=xs[ri(0,2)];if(ys[3]===ys[xs.indexOf(xs[3])])ys[3]+=2}else ys[3]=ys[0];return relSet(xs.map((x,i)=>[x,ys[i]]))};
  const good=mk1(false),bads=[mk1(true),mk1(true),mk1(true)];
  if(!not)return mkText('Which relation is a function?',good,bads,'In a function, no input (x-value) is paired with two different outputs. Repeated outputs are fine.');
  return mkText('Which relation is NOT a function?',bads[0],[mk1(false),mk1(false),mk1(false)],'An x-value that appears with two different y-values breaks the function rule.');},
 ()=>{const isF=Math.random()<.5,xs=shuffle([1,2,3,4,5,6,7]).slice(0,5),ys=xs.map(()=>ri(1,9));
  if(isF){ys[4]=ys[1]}else{xs[4]=xs[2];if(ys[4]===ys[2])ys[4]=ys[2]%9+1}
  const t=tblR([['Input',...xs],['Output',...ys]]);
  const dup=ys.find((y,i)=>ys.indexOf(y)!==i);
  return mkText(`Does this table represent a function?${t}`,isF?'Yes. Each input has exactly one output.':`No. The input ${xs[4]} has two different outputs.`,
   isF?[`No. The output ${dup} appears twice.`,'No. The inputs are not in order.','Yes. Each output has exactly one input.']:['Yes. Each input has exactly one output.','No. The inputs are not in order.','Yes. The outputs are all different numbers.'],
   isF?'Outputs may repeat. What matters is that no input has two outputs.':`The input ${xs[4]} is paired with both ${ys[2]} and ${ys[4]}.`);},
 ()=>{const not=Math.random()<.4,yes=FNPAIRS.filter(p=>p[2]),no=FNPAIRS.filter(p=>!p[2]),t=([a,b])=>`Input: ${a} → Output: ${b}`;
  return not?mkText('Which relationship is NOT a function?',t(pick(no)),shuffle(yes).slice(0,3).map(t),'A relationship is not a function when one input can have more than one output.')
   :mkText('Which relationship is a function?',t(pick(yes)),shuffle(no).slice(0,3).map(t),'Each input must have exactly one output.');},
 ()=>{const isF=Math.random()<.5,xs=shuffle([1,2,3,4,5,6,7,8]).slice(0,6),p=xs.map(x=>[x,ri(1,9)]);
  if(!isF){p.push([p[2][0],p[2][1]>5?p[2][1]-3:p[2][1]+3])}
  const g=plot({xr:[0,9],yr:[0,10],xs:1,ys:1,pts:p,alt:'Points on a coordinate grid'}),dupx=isF?null:p[2][0];
  return mkText(`Does the graph represent a function?${g}`,isF?'Yes. Each x-value has only one y-value.':`No. The x-value ${dupx} has two y-values.`,
   isF?['No. Two of the points have the same y-value.','No. The points are not connected.','Yes. The points go up from left to right.']:['Yes. Each x-value has only one y-value.','No. Two of the points have the same y-value.','Yes. The points are not connected.'],
   isF?'No vertical line passes through two points.':`A vertical line at x = ${dupx} passes through two points.`);},
 ()=>{const m=pick([2,3,4,5,-2]),b=nz(-6,8),x=ri(-3,8),y=m*x+b;
  return mkN(`A function's rule is "multiply the input by ${N(m)}, then ${b>0?'add':'subtract'} ${ab(b)}." What is the output when the input is ${N(x)}?`,y,[(x+b)*m,m*x-b,x*m*b,m+x+b],`${N(m)} × ${N(x)} ${sg(b)} ${ab(b)} = ${N(y)}.`,{step:Math.max(1,ab(m))});}
];

const F2=[IF9[0],IF9[1],
 ()=>{const a=ri(10,40),r=ri(3,9),b=ri(5,45),s=ri(3,9),n=ri(4,10),ask=pick(['faster','start','after']);
  const t=tblR([['Week',0,1,2,3],['Savings ($)',...[0,1,2,3].map(w=>b+s*w)]]);
  const stem=`Mia starts with $${a} and saves $${r} each week. The table shows Leo's savings.${t}`;
  const o=['Mia','Leo','They are the same','There is not enough information'];
  if(ask==='faster')return mkFixed(stem+'Who saves money at a faster rate?',o,r===s?o[2]:r>s?'Mia':'Leo',`Mia saves $${r} per week. Leo's savings grow $${s} per week.`);
  if(ask==='start')return mkFixed(stem+'Who started with more money?',o,a===b?o[2]:a>b?'Mia':'Leo',`Mia started with $${a}. Leo started with $${b} (week 0).`);
  const mv=a+r*n,lv=b+s*n;return mkFixed(stem+`Who will have more money after ${n} weeks?`,o,mv===lv?o[2]:mv>lv?'Mia':'Leo',`Mia: ${a} + ${r}(${n}) = $${mv}. Leo: ${b} + ${s}(${n}) = $${lv}.`);},
 ()=>{const m1=pick([1,2,3,-1,-2]),b1=ri(-4,4),m2=Math.random()<.2?m1:nz(-4,4),b2=ri(-5,5);
  const g=plot({xr:[-5,5],yr:[-8,8],xs:1,ys:1,fns:[x=>m1*x+b1],alt:'Line'});
  return mkFixed(`The graph shows f(x). g(x) has a slope of ${N(m2)} and a y-intercept of ${N(b2)}.${g}Which function has the greater slope?`,cmpOpts,cmpAns(m1,m2),`f rises ${N(m1)} for each 1 unit right, so its slope is ${N(m1)}. g's slope is ${N(m2)}.`);}
];

const LINS=[(a,b)=>`y = ${linT(a,b)}`,(a,b)=>`y = ${N(b)} − ${cf(ab(a),'x')}`,(a,b)=>`${linT(a,0)} + y = ${N(b)}`,(a,b)=>`y = ${fr(1,a)}x ${sg(b)} ${ab(b)}`];
const NONL=[(a,b)=>`y = x<sup>2</sup> ${sg(b)} ${ab(b)}`,(a,b)=>`y = <sup>${a}</sup>⁄<sub>x</sub>`,(a,b)=>`y = ${a}<sup>x</sup>`,(a,b)=>`y = x<sup>3</sup>`,(a,b)=>`y = x(x ${sg(b)} ${ab(b)})`,(a,b)=>`xy = ${a*ab(b)}`];
const LSIT=[()=>`The cost of buying p pizzas at $${ri(8,14)} each`,()=>`The distance a car travels in t hours at ${ri(40,65)} mph`,()=>`A phone plan that costs $${ri(20,40)} plus $${ri(5,10)} per GB`,()=>`The height of a candle that burns ${ri(1,3)} cm each hour`];
const NSIT=[()=>'The area of a square with side length s',()=>`An investment that doubles every ${ri(5,9)} years`,()=>'The height of a ball t seconds after it is thrown upward',()=>'The volume of a cube with edge length e'];
const F3=[
 ()=>{const a=ri(2,6),b=nz(-8,8);
  return mkText('Which equation represents a linear function?',pick(LINS)(a,b),shuffle(NONL).slice(0,3).map(f=>f(a,b)),'A linear function can be written as y = mx + b: x appears only to the first power and not in a denominator or exponent.');},
 ()=>{const a=ri(2,6),b=nz(-8,8);
  return mkText('Which equation represents a nonlinear function?',pick(NONL)(a,b),shuffle(LINS).slice(0,3).map(f=>f(a,b)),'Squaring x, putting x in a denominator, or putting x in an exponent makes a function nonlinear.');},
 ()=>{const lin=Math.random()<.5,st=pick([1,2]),x0=ri(0,2),xs=[0,1,2,3,4].map(i=>x0+st*i),a=ri(1,6),d=nz(-5,6),ys=lin?xs.map(x=>a+d*(x-x0)/st):xs.map(x=>a+(x-x0)*(x-x0));
  const L=`Linear. y changes by the same amount each time x increases by ${st}.`,Nn='Nonlinear. y does not change by the same amount each time.';
  return mkText(`Is the function in the table linear or nonlinear?${tblR([['x',...xs],['y',...ys]])}`,lin?L:Nn,[lin?Nn:L,`Linear. The x-values increase by ${st} each time.`,'Nonlinear. The table has more than two rows.'],lin?`Each step, y changes by ${N(d)}.`:`The changes in y are ${ys.slice(1).map((y,i)=>N(y-ys[i])).join(', ')}: not constant.`);},
 ()=>{const lin=Math.random()<.5;
  return lin?mkText('Which situation can be modeled by a linear function?',pick(LSIT)(),shuffle(NSIT).slice(0,3).map(f=>f()),'It changes by a constant amount per unit, so it can be written as y = mx + b.')
   :mkText('Which situation is NOT linear?',pick(NSIT)(),shuffle(LSIT).slice(0,3).map(f=>f()),'Areas, volumes, doubling, and thrown objects do not change at a constant rate.');},
 ()=>{const lin=Math.random()<.5,m=pick([1,2,-1]),b=ri(2,4),p=[0,1,2,3,4,5].map(x=>[x,lin?b+m*x:b+0.5*x*x-(m<0?3*x:0)]);
  const g=plot({xr:[0,6],yr:yrOf(p,2),xs:1,pts:p,alt:'Points'});
  const L='Linear. The points lie on a straight line.',Nn='Nonlinear. The points do not lie on a straight line.';
  return mkText(`Is the function shown linear or nonlinear?${g}`,lin?L:Nn,[lin?Nn:L,lin?'Nonlinear. The graph does not pass through (0, 0).':'Linear. The points go up from left to right.','Linear. Every point has a whole-number x-value.'],lin?'Equal steps in x give equal steps in y.':'The rise between points keeps changing.');}
];

const F4CTX=[{s:(r,F)=>`A plumber charges $${F} for a visit plus $${r} per hour.`,v:'C',x:'h',r:[40,50,65],F:[35,45,60]},{s:(r,F)=>`A taxi ride costs $${F} plus $${r} per mile.`,v:'C',x:'m',r:[2,3],F:[3,4,5]},{s:(r,F)=>`A phone plan costs $${F} per month plus $${r} per GB of data.`,v:'C',x:'g',r:[5,8,10],F:[15,20,25]},{s:(r,F)=>`A candle is ${F} cm tall and burns ${r} cm each hour.`,v:'H',x:'t',r:[2,3,4],F:[18,24,30],neg:1}];
const F4=[
 ()=>{const m=nz(-6,7),x1=ri(-4,3),dx=ri(1,4),x2=x1+dx,y1=ri(-8,8),y2=y1+m*dx;
  return mkN(`What is the rate of change of the linear function through ${pt(x1,y1)} and ${pt(x2,y2)}?`,m,[-m,y2-y1,dx,m+1],`Rate of change = (change in y) ÷ (change in x) = ${N(y2-y1)} ÷ ${dx} = ${N(m)}.`,{step:1});},
 ()=>{const m=nz(-5,6),b=ri(-8,10),s=pick([0,1]),xs=[0,1,2,3].map(i=>i+s);
  return mkText(`Which equation represents the linear function in the table?${tblR([['x',...xs],['y',...xs.map(x=>b+m*x)]])}`,'y = '+linT(m,b),['y = '+linT(b,m),'y = '+linT(m,b+m*s+(s?0:m)),'y = '+linT(-m,b)],`y changes by ${N(m)} each time x increases by 1, and y = ${N(b)} when x = 0${s?` (go back one step from x = 1)`:''}.`);},
 ()=>{const c=pick(F4CTX),r=pick(c.r),F=pick(c.F),mm=c.neg?-r:r;
  return mkText(c.s(r,F)+` Which equation gives ${c.v} in terms of ${c.x}?`,`${c.v} = ${linT(mm,F,c.x)}`,[`${c.v} = ${linT(F,mm,c.x)}`,`${c.v} = ${cf(r+F,c.x)}`,`${c.v} = ${linT(c.neg?r:-r,F,c.x)}`],`The starting amount is ${F}, and it changes by ${N(mm)} for each ${c.x}.`);},
 ()=>{const r=ri(8,20),F=ri(20,60),ask=Math.random()<.5;
  const stem=`The equation y = ${r}x + ${F} gives the total cost y, in dollars, of a gym membership for x months.`;
  return ask?mkText(stem+` What does ${F} represent?`,`A one-time starting fee of $${F}`,[`The cost per month`,`The total cost after ${r} months`,`The number of months`],`${F} is the value of y when x = 0: the cost before any months.`)
   :mkText(stem+` What does ${r} represent?`,`The cost per month, $${r}`,[`A one-time starting fee of $${r}`,`The total cost after one month`,`The number of months`],`${r} is the rate of change: the cost goes up $${r} for each month.`);},
 ()=>{const m=pick([-3,-2,-1,1,2,3]),b=ri(-4,4),g=plot({xr:[-5,5],yr:[-8,8],xs:1,ys:1,fns:[x=>m*x+b],alt:'Line'});
  return Math.random()<.5?mkN(`What is the rate of change (slope) of the line?${g}`,m,[-m,b,1/m].filter(isInt),`The line moves ${m>0?'up':'down'} ${ab(m)} for every 1 unit to the right.`,{step:1})
   :mkText(`Which equation represents the line?${g}`,'y = '+linT(m,b),['y = '+linT(b||5,m),'y = '+linT(-m,b),'y = '+linT(m,-b||3)],`The line crosses the y-axis at ${N(b)} and has slope ${N(m)}.`);},
 ()=>{const m=nz(-5,5),b=nz(-8,8),x1=ri(1,4),x2=x1+ri(1,3),y1=m*x1+b,y2=m*x2+b;
  return mkText(`Which equation represents the line through ${pt(x1,y1)} and ${pt(x2,y2)}?`,'y = '+linT(m,b),['y = '+linT(m,y1),'y = '+linT(b,m),'y = '+linT(-m,b)],`Slope = ${N(y2-y1)} ÷ ${x2-x1} = ${N(m)}. Then ${N(y1)} = ${N(m)}(${x1}) + b, so b = ${N(b)}.`);}
];

const TRIP=[[3,4,5],[5,12,13],[8,15,17],[7,24,25],[6,8,10],[20,21,29],[9,12,15]];
const trip=()=>{const t=pick(TRIP),k=t[2]<=15?pick([1,2]):1;return t.map(v=>v*k)};
const G7=[
 ()=>{const [a,b,c]=trip(),u=pick(['cm','in','ft','m']);
  return mkN(`A right triangle has legs of ${a} ${u} and ${b} ${u}. How long is the hypotenuse, in ${u}?`,c,[a+b,a*a+b*b,r1(Math.sqrt(ab(b*b-a*a))),(a+b)/2].filter(v=>v>0),`${sq(a)} + ${sq(b)} = ${a*a} + ${b*b} = ${c*c}, and √${c*c} = ${c}.`,{min:1});},
 ()=>{const [a,b,c]=trip(),u=pick(['cm','in','ft','m']);
  return mkN(`A right triangle has a hypotenuse of ${c} ${u} and one leg of ${a} ${u}. How long is the other leg, in ${u}?`,b,[c-a,r1(Math.sqrt(c*c+a*a)),c*c-a*a,c+a],`${sq(c)} − ${sq(a)} = ${c*c-a*a}, and √${c*c-a*a} = ${b}.`,{min:1});},
 ()=>{const [a,b,c]=trip();
  return mkN(`A ${c}-foot ladder leans against a wall. Its base is ${a} feet from the wall. How high up the wall does the ladder reach, in feet?`,b,[c-a,r1(Math.sqrt(c*c+a*a)),c+a],`The ladder is the hypotenuse: √(${sq(c)} − ${sq(a)}) = √${b*b} = ${b} feet.`,{min:1});},
 ()=>{const [l,w,h,d]=pick([[1,2,2,3],[2,3,6,7],[1,4,8,9],[2,6,9,11],[4,4,7,9],[2,10,11,15],[6,6,7,11],[3,4,12,13]]),k=d<=9?pick([1,2]):1;
  return mkN(`A box is ${l*k} in long, ${w*k} in wide, and ${h*k} in tall. How long is the diagonal from a bottom corner to the opposite top corner, in inches?`,d*k,[(l+w+h)*k,r1(Math.sqrt(l*l+w*w)*k),(l*l+w*w+h*h)*k*k],`First the floor diagonal: ${sq(l*k)} + ${sq(w*k)} = ${(l*l+w*w)*k*k}. Then add ${sq(h*k)}: ${(l*l+w*w+h*h)*k*k}, and the square root is ${d*k}.`,{min:1});},
 ()=>{const right=Math.random()<.5,[a,b,c0]=trip(),c=right?c0:c0+pick([1,-1]);
  const eq=`${sq(a)} + ${sq(b)} ${right?'=':'≠'} ${sq(c)}`;
  return mkText(`A triangle has sides of ${a}, ${b}, and ${c}. Is it a right triangle?`,right?`Yes, because ${eq}.`:`No, because ${eq}.`,[right?`No, because ${sq(a)} + ${sq(b)} ≠ ${sq(c)}.`:`Yes, because ${sq(a)} + ${sq(b)} = ${sq(c)}.`,`Yes, because ${a} + ${b} > ${c}.`,`No, because ${c} ≠ ${a} + ${b}.`],`${a*a} + ${b*b} = ${a*a+b*b}, and ${c}<sup>2</sup> = ${c*c}.`);},
 ()=>{const a=ri(2,9),b=ri(2,9),s=a*a+b*b;if(isInt(Math.sqrt(s)))return null;const c=r1(Math.sqrt(s));
  return mkN(`A right triangle has legs of ${a} units and ${b} units. How long is the hypotenuse? Round to the nearest tenth.`,c,[a+b,r1(Math.sqrt(ab(a*a-b*b))),s,r1(s/2)].filter(v=>v>0),`√(${sq(a)} + ${sq(b)}) = √${s} ≈ ${c.toFixed(1)}.`,{fmt:v=>v.toFixed(1),min:0.1,step:1});}
];

const G8=[
 ()=>{const [dx,dy,c]=pick([[3,4,5],[4,3,5],[6,8,10],[8,6,10],[5,12,13],[12,5,13]]),sx=pick([1,-1]),sy=pick([1,-1]),x1=ri(-6,2),y1=ri(-6,2),x2=x1+sx*dx,y2=y1+sy*dy;
  return mkN(`What is the distance between ${pt(x1,y1)} and ${pt(x2,y2)}?`,c,[dx+dy,dx*dx+dy*dy,r1(Math.sqrt(ab(dx*dx-dy*dy))),ab(x1+x2)+ab(y1+y2)].filter(v=>v>0),`Horizontal change ${dx}, vertical change ${dy}: √(${sq(dx)} + ${sq(dy)}) = √${c*c} = ${c}.`,{min:1});},
 ()=>{const [dx,dy,c]=pick([[3,4,5],[4,3,5],[6,8,10],[8,6,10]]),x1=ri(-5,-1),y1=ri(-5,-1),x2=x1+dx,y2=y1+dy;
  const g=plot({xr:[-6,6],yr:[-6,6],xs:1,ys:1,pts:[[x1,y1],[x2,y2]],labels:[[x1,y1,'A'],[x2,y2,'B']],alt:'Two points A and B'});
  return mkN(`What is the distance between points A and B?${g}`,c,[dx+dy,dx*dx+dy*dy,ab(dx-dy)||9].filter(v=>v>0),`Draw a right triangle: legs ${dx} and ${dy}. √(${sq(dx)} + ${sq(dy)}) = ${c}.`,{min:1});},
 ()=>{const dx=ri(1,7),dy=ri(1,7),s=dx*dx+dy*dy;if([4,9,16,25,36,49].some(q=>s%q===0))return null;const x1=ri(-5,3),y1=ri(-5,3);
  return mkText(`What is the exact distance between ${pt(x1,y1)} and ${pt(x1+dx,y1-dy)}?`,`√${s}`,[N(dx+dy),`√${dx+dy}`,`√${ab(dx*dx-dy*dy)}`,N(s)].filter(t=>t!=='√0'),`√(${sq(dx)} + ${sq(dy)}) = √${s}.`);},
 ()=>{const x=ri(-4,3),y=ri(-4,3),[dx,dy]=pick([[3,4],[4,3],[-3,4],[4,-3],[-4,-3]]);
  return mkText(`Which point is exactly 5 units from ${pt(x,y)}?`,pt(x+dx,y+dy),[pt(x+5,y+5),pt(x+2,y+3),pt(x+dy+1,y+ab(dx)+1),pt(x+1,y+4)],`The changes are ${ab(dx)} and ${ab(dy)}: √(${sq(ab(dx))} + ${sq(ab(dy))}) = √25 = 5.`);}
];

const U3=()=>pick(['cm','in','ft','m']);
const piT=v=>`${n2(v)}π`;
const G9=[
 ()=>{const r=ri(2,6),h=ri(2,10),u=U3(),dia=Math.random()<.4;
  return mkText(`A cylinder has a ${dia?'diameter':'radius'} of ${dia?2*r:r} ${u} and a height of ${h} ${u}. What is its volume?`,`${piT(r*r*h)} ${u}<sup>3</sup>`,[`${piT(2*r*h)} ${u}<sup>3</sup>`,`${piT(dia?4*r*r*h:r*h)} ${u}<sup>3</sup>`,`${piT(r*r*h*3)} ${u}<sup>3</sup>`,`${piT(r*h*h)} ${u}<sup>3</sup>`],`V = πr<sup>2</sup>h${dia?` with r = ${2*r} ÷ 2 = ${r}`:''}: π(${r}<sup>2</sup>)(${h}) = ${piT(r*r*h)}.`);},
 ()=>{const r=ri(2,6),h=3*ri(1,4),u=U3();
  return mkText(`A cone has a radius of ${r} ${u} and a height of ${h} ${u}. What is its volume?`,`${piT(r*r*h/3)} ${u}<sup>3</sup>`,[`${piT(r*r*h)} ${u}<sup>3</sup>`,`${piT(4*r*r*h/3)} ${u}<sup>3</sup>`,`${piT(r*h/3)} ${u}<sup>3</sup>`,`${piT(r*r*h/2)} ${u}<sup>3</sup>`],`V = ⅓πr<sup>2</sup>h = ⅓π(${r*r})(${h}) = ${piT(r*r*h/3)}.`);},
 ()=>{const r=pick([3,6,9]),u=U3();
  return mkText(`A sphere has a radius of ${r} ${u}. What is its volume?`,`${piT(4*r**3/3)} ${u}<sup>3</sup>`,[`${piT(4*r*r)} ${u}<sup>3</sup>`,`${piT(r**3)} ${u}<sup>3</sup>`,`${piT(4*r**3)} ${u}<sup>3</sup>`,`${piT(32*r**3/3)} ${u}<sup>3</sup>`],`V = (4/3)πr<sup>3</sup> = (4/3)π(${r**3}) = ${piT(4*r**3/3)}.`);},
 ()=>{const V=3*ri(10,60),u=U3();
  return Math.random()<.5?mkN(`A cone and a cylinder have the same radius and height. The cylinder holds ${V} ${u}<sup>3</sup>. How much does the cone hold, in ${u}<sup>3</sup>?`,V/3,[V*3,V/2,V,2*V/3],`A cone holds one-third of a cylinder with the same base and height: ${V} ÷ 3 = ${V/3}.`,{min:1})
   :mkN(`A sphere fits exactly inside a cylinder (same radius, and the cylinder's height equals the sphere's diameter). The cylinder holds ${V} ${u}<sup>3</sup>. What is the volume of the sphere, in ${u}<sup>3</sup>?`,2*V/3,[V/3,V,V/2,V*4/3],`A sphere is two-thirds of the cylinder that fits around it: ⅔ × ${V} = ${2*V/3}.`,{min:1});},
 ()=>{const r=ri(2,5),h=ri(2,10),cone=Math.random()<.5,V=cone?r*r*h/3:r*r*h;if(!isInt(V))return null;
  return mkN(`A ${cone?'cone':'cylinder'} has a volume of ${piT(V)} cubic inches and a radius of ${r} inches. What is its height, in inches?`,h,[V/r,cone?V/(r*r):3*V/(r*r),V/(2*r)].filter(v=>v>0&&isInt(v)),`${cone?`⅓π(${r*r})h = ${piT(V)}, so h = 3 × ${V} ÷ ${r*r}`:`π(${r*r})h = ${piT(V)}, so h = ${V} ÷ ${r*r}`} = ${h}.`,{min:1});},
 ()=>{const r=ri(2,6),h=ri(3,10),V=+(3.14*r*r*h).toFixed(2);
  return mkN(`A cylindrical can has a radius of ${r} cm and a height of ${h} cm. Using 3.14 for π, what is its volume in cm<sup>3</sup>?`,V,[+(3.14*2*r*h).toFixed(2),+(3.14*r*r*h/3).toFixed(2),+(3.14*4*r*r*h).toFixed(2)],`3.14 × ${r}<sup>2</sup> × ${h} = ${n2(V)}.`,{min:1,step:Math.round(V*.1)});}
];

const ASSOC=['Positive linear association','Negative linear association','Nonlinear association','No association'];
const SP1=[
 ()=>{const kind=pick(['pos','neg','curve','none']),p=scat(kind);if(!p)return null;
  const g=plot({xr:[0,10],yr:yrOf(p),xs:1,pts:p,alt:'Scatter plot'});
  const ans={pos:ASSOC[0],neg:ASSOC[1],curve:ASSOC[2],none:ASSOC[3]}[kind];
  return mkFixed(`Which best describes the association in the scatter plot?${g}`,ASSOC,ans,{pos:'As x increases, y tends to increase along a straight-line pattern.',neg:'As x increases, y tends to decrease along a straight-line pattern.',curve:'The points follow a curve, not a straight line.',none:'The points show no clear pattern.'}[kind]);},
 ()=>{const m=pick([1.5,2,-1.5,-2]),b=m>0?ri(2,5):ri(20,24),xs=shuffle([1,2,3,4,5,6,7,8,9,10]),p=xs.slice(0,9).map(x=>[x,Math.round(b+m*x+(Math.random()-.5)*2)]),ox=xs[9],ty=b+m*ox,oy=Math.max(0,Math.round(ty+(ty>12?-1:1)*ri(9,12)));
  const all=p.concat([[ox,oy]]),g=plot({xr:[0,11],yr:yrOf(all),xs:1,pts:all,alt:'Scatter plot with one outlier'});
  return mkText(`Which point is an outlier in the scatter plot?${g}`,pt(ox,oy),shuffle(p).slice(0,3).map(q=>pt(...q)),`${pt(ox,oy)} is far from the pattern the other points follow.`);},
 ()=>{const c=pick([['As hours of practice increase, the number of mistakes decreases.',1],['Taller students tend to have longer arm spans.',0],['There is no pattern between shoe size and the number of pets a student has.',3],['The more minutes a phone is used, the lower its battery charge.',1],['Students who read more books tend to score higher on vocabulary tests.',0]]);
  const o=['Positive association','Negative association','Nonlinear association','No association'];
  return mkFixed(`${c[0]} Which type of association does this describe?`,o,o[c[1]],['Both quantities increase together.','One quantity decreases as the other increases.','','The quantities do not move together.'][c[1]]);},
 ()=>{const kind=pick(['pos','neg','none']),p=scat(kind);if(!p)return null;
  const g=plot({xr:[0,10],yr:yrOf(p),xs:1,pts:p,alt:'Scatter plot'});
  const o=['y tends to increase.','y tends to decrease.','y shows no clear trend.','y increases, then decreases.'];
  return mkFixed(`Based on the scatter plot, as x increases, what happens to y?${g}`,o,o[{pos:0,neg:1,none:2}[kind]],'Look at the overall direction of the points from left to right.');}
];

const SP2=[fitEq,
 ()=>{const m=pick([1.5,2,2.5,-1.5,-2]),b=m>0?ri(3,8):ri(24,30),p=[...Array(12)].map(()=>{const x=ri(1,10);return [x,r1(b+m*x+(Math.random()-.5)*3)]}),k=pick(['good','high','low','dir']);
  const f=k==='good'?x=>b+m*x:k==='high'?x=>b+7+m*x:k==='low'?x=>b-7+m*x:x=>(b+5.5*m)-m*(x-5.5);
  const g=plot({xr:[0,11],yr:yrOf(p.concat([[0,f(0)],[11,f(11)]])),xs:1,pts:p,fns:[f],alt:'Scatter plot with a line'});
  const o=['Good fit. The points are close to the line, with about as many above as below.','Poor fit. Most of the points are below the line.','Poor fit. Most of the points are above the line.','Poor fit. The line does not follow the direction of the points.'];
  return mkFixed(`How well does the line fit the data?${g}`,o,o[{good:0,high:1,low:2,dir:3}[k]],'A good line of best fit follows the trend and has points balanced on both sides.');},
 ()=>{const v=Math.random()<.5;
  return v?mkText('Which is the best way to draw a line of best fit for a scatter plot with a linear pattern?','Draw a line that follows the trend, close to the points, with about as many points above it as below it.',['Connect the first point to the last point.','Draw the line so it passes through the origin.','Draw a line through as many points as possible, even if most other points end up on one side.'],'The line should capture the overall trend and balance the points on either side.')
   :mkText('Two students drew lines of best fit for the same data. How can they tell which line fits better?','The better line has points closer to it overall, scattered evenly on both sides.',['The better line is steeper.','The better line passes through more of the plotted points exactly.','The better line starts at (0, 0).'],'Fit is about how close the points are to the line overall.');},
 ()=>{const m=pick([1,2,3,-1,-2]),b=m>0?ri(2,6):ri(18,24),x=ri(4,9),y=b+m*x,p=[...Array(10)].map(()=>{const t=ri(1,10);return [t,r1(b+m*t+(Math.random()-.5)*3)]});
  const g=plot({xr:[0,11],yr:yrOf(p.concat([[0,b],[11,b+11*m]])),xs:1,pts:p,fns:[t=>b+m*t],alt:'Scatter plot with a trend line'});
  return mkN(`Use the trend line to estimate y when x = ${x}.${g}`,y,[b,m*x,y+m,y-2*m],`The line passes through ${pt(x,y)}.`,{step:Math.max(1,ab(m))});}
];
const SP3=REGQ;

const STDGEN={BF1,BF2,LE1,IF2,IF4,CED3,GPE5,IF7,IF9,REI6,APR1,SID2,SID6,SID8,EE1,EE7,EE8,F1,F2,F3,F4,G7,G8,G9,SP1,SP2,SP3};
function makeQuiz(id){
  const gens=STDGEN[id];if(!gens)throw new Error('BAD: Unknown standard.');
  const out=[],seen=new Set();let pool=[],g=0;
  while(out.length<10&&g++<800){if(!pool.length)pool=shuffle(gens);const q=pool.pop()();if(q&&!seen.has(q.stem)){seen.add(q.stem);out.push(q)}}
  return out;
}
return { makeQuiz: makeQuiz };
})();
