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

const STDGEN={BF1,BF2,LE1};
function makeQuiz(id){
  const gens=STDGEN[id],out=[],seen=new Set();let pool=[],g=0;
  while(out.length<10&&g++<800){if(!pool.length)pool=shuffle(gens);const q=pool.pop()();if(q&&!seen.has(q.stem)){seen.add(q.stem);out.push(q)}}
  return out;
}
return { makeQuiz: makeQuiz };
})();
