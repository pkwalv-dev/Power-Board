/**
 * Question generators for the three power standards.
 * Runs only on the server: answers and explanations never reach the browser
 * until a quiz has been submitted and graded.
 */

const ri=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const pick=a=>a[ri(0,a.length-1)];
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=ri(0,i);[a[i],a[j]]=[a[j],a[i]]}return a};
const N=x=>String(x).replace('-','−');
const n2=x=>N(Number.isInteger(x)?x:+x.toFixed(2));
const ab=Math.abs, sg=d=>d<0?'−':'+';
const rt=r=>r===0.5?'(½)':(Number.isInteger(r)?String(r):r.toFixed(2));
const co=k=>ab(k)===1?'':String(ab(k));
const lin=(a,d,v='n')=>({t:`${N(a)} ${sg(d)} ${co(d)}${v}`,f:x=>a+d*x});
const expo=(a,r,v='n')=>({t:`${N(a)}·${rt(r)}<sup>${v}</sup>`,f:x=>a*Math.pow(r,x)});
const mul=(a,r,v)=>({t:`${N(a)}·${rt(r)}${v}`,f:x=>a*r*x});
const swapexp=(a,r,v)=>({t:`${rt(r)}·${N(a)}<sup>${v}</sup>`,f:x=>r*Math.pow(a,x)});
const rec=(nm,a,op,v)=>{const s=[a];for(let i=1;i<5;i++)s.push(op==='+'?s[i-1]+v:s[i-1]*v);
  const step=op==='+'?`${nm}(n − 1) ${sg(v)} ${n2(ab(v))}`:`${rt(v)}·${nm}(n − 1)`;
  return {t:`${nm}(0) = ${N(a)}; ${nm}(n) = ${step}`,f:x=>s[x]};};
const same=(a,b)=>[0,1,2,3,4].every(i=>Math.abs(a.f(i)-b.f(i))<1e-9);
const seqStr=(c,k=4)=>[...Array(k).keys()].map(i=>n2(c.f(i))).join(', ');

function mk(stem,correct,foils,exp,keep){
  const seen=new Set([correct]);const fs=[];
  for(const f of foils){if(f!=null&&!seen.has(f)){seen.add(f);fs.push(f)}}
  if(fs.length<3)return null;
  const o=[correct,...shuffle(fs).slice(0,keep?fs.length:3)];
  const opts=keep?o:shuffle(o);
  return {stem,opts,ans:opts.indexOf(correct),exp};
}
function mkC(stem,correct,foils,exp,pre=''){
  const P=c=>pre+c.t;
  return mk(stem,P(correct),foils.filter(c=>c&&!same(c,correct)).map(P),exp);
}
const tbl=(xs,ys)=>`<table class="t"><tr><th>x</th>${xs.map(x=>`<td>${N(x)}</td>`).join('')}</tr><tr><th>y</th>${ys.map(y=>`<td>${n2(y)}</td>`).join('')}</tr></table>`;

// ---------- BF.1 ----------
const LU=[
 {A:[20,25,30,40],D:[10,15,20,25],nm:'C',v:'m',s:(A,D)=>`A gym charges $${A} to join and $${D} per month. Which function gives the total cost C(m), in dollars, after m months?`},
 {A:[5,8,10,12],D:[2,3,4,5],nm:'h',v:'w',s:(A,D)=>`A plant is ${A} cm tall and grows ${D} cm each week. Which function gives its height h(w), in cm, after w weeks?`},
 {A:[3,4,5],D:[2,3],nm:'F',v:'m',s:(A,D)=>`A taxi ride costs $${A} plus $${D} for each mile. Which function gives the fare F(m) for m miles?`},
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
 ()=>{const c=pick(LU),A=pick(c.A),D=pick(c.D),v=c.v,P=`${c.nm}(${v}) = `,ans=lin(A,D,v);
  return mkC(c.s(A,D),ans,[lin(D,A,v),{t:`(${A} + ${D})${v}`,f:x=>(A+D)*x},lin(A,-D,v),{t:`${A}·${D}${v}`,f:x=>A*D*x}],`Start value ${A}, plus ${D} for each ${v}: ${P}${ans.t}.`,P);},
 ()=>{const c=pick(LD),A=pick(c.A),D=pick(c.D),v=c.v,P=`${c.nm}(${v}) = `,ans=lin(A,-D,v);
  return mkC(c.s(A,D),ans,[lin(A,D,v),lin(D,-A,v),{t:`(${A} − ${D})${v}`,f:x=>(A-D)*x},{t:`${A}${v} − ${D}`,f:x=>A*x-D}],`Start at ${A} and subtract ${D} for each ${v}: ${P}${ans.t}.`,P);},
 ()=>{const c=pick(EX),P0=pick(c.P),r=pick([2,3]),v=c.v,P=`${c.nm}(${v}) = `,ans=expo(P0,r,v);
  return mkC(c.s(P0,r),ans,[lin(P0,r,v),mul(P0,r,v),swapexp(P0,r,v),expo(P0,r+1,v)],`Start at ${P0} and multiply by ${r} each ${v}: ${P}${ans.t}.`,P);},
 ()=>{const p=pick([3,4,5,6,8]),A=pick([200,500,1000,2000]),ans=expo(A,1+p/100,'t');
  return mkC(`An account has $${A} and grows ${p}% each year. Which function gives the balance B(t) after t years?`,ans,[expo(A,p/100,'t'),expo(A,p,'t'),lin(A,p,'t'),mul(A,1+p/100,'t')],`Growing ${p}% means multiplying by ${(1+p/100).toFixed(2)} each year.`,'B(t) = ');},
 ()=>{const p=pick([10,15,20,25]),V=pick([12000,20000,25000]),ans=expo(V,1-p/100,'t');
  return mkC(`A car is worth $${V} and loses ${p}% of its value each year. Which function gives its value V(t) after t years?`,ans,[expo(V,p/100,'t'),expo(V,1+p/100,'t'),lin(V,-p,'t'),expo(V,p,'t')],`Losing ${p}% keeps ${100-p}%, so multiply by ${(1-p/100).toFixed(2)} each year.`,'V(t) = ');},
 ()=>{const A=pick([80,120,160,200]),ans=expo(A,0.5,'t');
  return mkC(`A ${A} mg sample of a medicine loses half its mass every hour. Which function gives the mass M(t) after t hours?`,ans,[lin(A,-0.5,'t'),mul(A,0.5,'t'),swapexp(A,0.5,'t'),expo(A,2,'t')],`Half remains each hour: multiply by ½ each hour.`,'M(t) = ');},
 ()=>{const A=pick([4,6,8,10,12]),D=pick([2,3,4,5]),down=Math.random()<.4,
   ctx=down?`A pool has ${A*10} gallons and loses ${D*10} gallons each day. Which recursive process describes its volume p(n) after n days?`:pick([`A sapling is ${A} inches tall and grows ${D} inches each year. Which recursive process describes its height h(n) after n years?`,`Maria has $${A} and saves $${D} each week. Which recursive process describes her savings s(n) after n weeks?`]);
   const nm=down?'p':ctx.startsWith('A sapling')?'h':'s',a0=down?A*10:A,d0=down?D*10:D,vv=down?-d0:d0,ans=rec(nm,a0,'+',vv);
  return mkC(ctx,ans,[rec(nm,ab(vv),'+',a0),rec(nm,a0,'×',ab(vv)),rec(nm,a0+vv,'+',vv),rec(nm,a0,'+',-vv)],`Start at ${a0}; each step ${vv<0?'subtracts':'adds'} ${ab(vv)}.`);},
 ()=>{const geo=pick([{a:[2,3,4,5],r:2,s:(a)=>`A colony starts with ${a} bacteria and doubles every hour. Which recursive process describes its size b(n) after n hours?`,nm:'b'},{a:[16,32,64,80],r:0.5,s:(a)=>`A ball is dropped from ${a} feet, and each bounce reaches half the previous height. Which recursive process describes the height b(n) of bounce n, with b(0) = ${a}?`,nm:'b'}]),
   a=pick(geo.a),r=geo.r,ans=rec(geo.nm,a,'×',r);
  return mkC(geo.s(a),ans,[rec(geo.nm,a,'+',r),rec(geo.nm,r,'×',a),rec(geo.nm,a*r,'×',r),rec(geo.nm,a,'×',r===0.5?2:0.5)],`Start at ${a}; multiply by ${rt(r)} each step.`);},
 ()=>{const a=pick([2,3,4,5]),d=pick([2,3,4,5,6]),c=lin(a,d,'x'),xs=[0,1,2,3];
  return mkC(`Which function fits the table?${tbl(xs,xs.map(c.f))}`,c,[lin(d,a,'x'),lin(a,d+1,'x'),lin(a+d,d,'x'),expo(a,d,'x')],`y starts at ${a} when x = 0 and rises ${d} per step.`,'y = ');},
 ()=>{const a=pick([2,3,4,5]),r=pick([2,3]),c=expo(a,r,'x'),xs=[0,1,2,3];
  return mkC(`Which function fits the table?${tbl(xs,xs.map(c.f))}`,c,[lin(a,r,'x'),lin(a,a*(r-1),'x'),swapexp(a,r,'x'),expo(a,r+1,'x')],`y starts at ${a} and is multiplied by ${r} each step.`,'y = ');},
 ()=>{const A=pick([10,15,20,25,30,40,50]),D=pick([3,4,5,6,8,10]),k=ri(4,9);
  return mk(`Jordan starts with $${A} and adds $${D} each week. How much does Jordan have after ${k} weeks?`,`$${A+D*k}`,[`$${(A+D)*k}`,`$${A+D+k}`,`$${A+D*(k-1)}`,`$${A+D*(k+1)}`],`${A} + ${D} × ${k} = ${A+D*k}.`);},
 ()=>{const A=pick([2,3,4,5]),r=pick([2,3]),k=pick([3,4]);
  return mk(`A lab starts with ${A} bacteria. The number ${r===2?'doubles':'triples'} every hour. How many bacteria are there after ${k} hours?`,String(A*Math.pow(r,k)),[String(A*r*k),String(A+r*k),String(A*Math.pow(r,k-1)),String(A*Math.pow(r,k+1))],`${A} × ${r}<sup>${k}</sup> = ${A*Math.pow(r,k)}.`);},
 ()=>{const b=pick([-6,-4,-3,-2,2,3,4,5,6,7]),m=pick([-6,-5,-4,-3,-2,2,3,4,5,6]),c=lin(b,m,'x');
  return mkC(`A line crosses the y-axis at (0, ${N(b)}) and ${m>0?'rises':'falls'} ${ab(m)} units for every 1 unit to the right. Which function describes the line?`,c,[lin(m,b,'x'),lin(b,-m,'x'),{t:`${N(m)}(x ${sg(b)} ${ab(b)})`,f:x=>m*(x+b)},lin(b,ab(m),'x')],`y-intercept ${N(b)}, slope ${N(m)}.`,'y = ');}
];

// ---------- BF.2 ----------
const rd=()=>{const a=ri(2,20),d=pick([-6,-5,-4,-3,-2,2,3,4,5,6,7,8]);return [a,d]};
const rg=()=>Math.random()<.2?[pick([48,64,80,96]),0.5]:[ri(2,7),pick([2,3,4])];
const BF2=[
 ()=>{const [a,d]=rd(),c=lin(a,d);
  return mkC(`The sequence ${seqStr(c)}, … is arithmetic. If f(0) is the first term, which explicit formula gives f(n)?`,c,[lin(d,a),{t:`${a} ${sg(d)} ${ab(d)}(n + 1)`,f:x=>a+d*(x+1)},{t:`${a} ${sg(d)} ${ab(d)}(n − 1)`,f:x=>a+d*(x-1)},expo(a,ab(d))],`f(0) = ${a}; common difference ${N(d)}. So f(n) = ${c.t}.`,'f(n) = ');},
 ()=>{const [a,r]=rg(),c=expo(a,r);
  return mkC(`The sequence ${seqStr(c)}, … is geometric. If f(0) is the first term, which explicit formula gives f(n)?`,c,[lin(a,r),{t:`${a}·${rt(r)}<sup>n − 1</sup>`,f:x=>a*Math.pow(r,x-1)},swapexp(a,r,'n'),{t:`${a}·${rt(r)}<sup>n + 1</sup>`,f:x=>a*Math.pow(r,x+1)}],`f(0) = ${a}; common ratio ${rt(r)}. So f(n) = ${c.t}.`,'f(n) = ');},
 ()=>{const [a,d]=rd(),c=rec('f',a,'+',d);
  return mkC(`A sequence begins ${seqStr(c)}, … Which recursive rule describes it?`,c,[rec('f',d,'+',a),rec('f',a,'×',ab(d)===1?2:ab(d)),rec('f',a+d,'+',d),rec('f',a,'+',a)],`Start at ${a}; add ${N(d)} each step.`);},
 ()=>{const [a,r]=rg(),c=rec('f',a,'×',r);
  return mkC(`A sequence begins ${seqStr(c)}, … Which recursive rule describes it?`,c,[rec('f',a,'+',r),rec('f',r,'×',a),rec('f',a*r,'×',r),rec('f',a,'×',r===0.5?2:0.5)],`Start at ${a}; multiply by ${rt(r)} each step.`);},
 ()=>{const [a,d]=rd(),e=lin(a,d),c=rec('f',a,'+',d);
  return mkC(`f(n) = ${e.t}. Which recursive rule gives the same sequence?`,c,[rec('f',d,'+',a),rec('f',a+d,'+',d),rec('f',a,'×',ab(d)===1?2:ab(d)),rec('f',a,'+',-d)],`f(0) = ${a}, and each term adds ${N(d)}.`);},
 ()=>{const [a,r]=rg(),e=expo(a,r),c=rec('f',a,'×',r);
  return mkC(`f(n) = ${e.t}. Which recursive rule gives the same sequence?`,c,[rec('f',r,'×',a),rec('f',a,'+',r),rec('f',a*r,'×',r),rec('f',a,'×',r===0.5?2:0.5)],`f(0) = ${a}, and each term is ${rt(r)} times the one before.`);},
 ()=>{const [a,d]=rd(),r=rec('f',a,'+',d),c=lin(a,d);
  return mkC(`${r.t}. Which explicit formula gives the same sequence?`,c,[lin(d,a),{t:`${a} ${sg(d)} ${ab(d)}(n + 1)`,f:x=>a+d*(x+1)},{t:`${a} ${sg(d)} ${ab(d)}(n − 1)`,f:x=>a+d*(x-1)},expo(a,ab(d))],`Start ${a}, add ${N(d)} each step: f(n) = ${c.t}.`,'f(n) = ');},
 ()=>{const [a,r]=rg(),q=rec('f',a,'×',r),c=expo(a,r);
  return mkC(`${q.t}. Which explicit formula gives the same sequence?`,c,[lin(a,r),{t:`${a}·${rt(r)}<sup>n − 1</sup>`,f:x=>a*Math.pow(r,x-1)},swapexp(a,r,'n'),{t:`${a}·${rt(r)}<sup>n + 1</sup>`,f:x=>a*Math.pow(r,x+1)}],`Start ${a}, multiply by ${rt(r)} each step: f(n) = ${c.t}.`,'f(n) = ');},
 ()=>{const [a,d]=rd(),k=ri(6,12),f=x=>a+d*x;
  return mk(`f(n) = ${lin(a,d).t}. What is f(${k})?`,n2(f(k)),[n2(f(k-1)),n2(f(k+1)),n2((a+d)*k),n2(a*d*k)],`${a} ${sg(d)} ${ab(d)} × ${k} = ${n2(f(k))}.`);},
 ()=>{const a=ri(2,5),r=pick([2,3]),k=pick([3,4,5]),f=x=>a*Math.pow(r,x);
  return mk(`f(n) = ${expo(a,r).t}. What is f(${k})?`,n2(f(k)),[n2(f(k-1)),n2(f(k+1)),n2(a*r*k),n2(Math.pow(a*r,k))],`${a} × ${r}<sup>${k}</sup> = ${f(k)}.`);},
 ()=>{const a=pick([100,200,300,500]),d=pick([25,50,75]),c=lin(a,d),nm='s';
  return mkC(`A gym has ${a} members today and adds ${d} members each month. Which explicit formula gives the members ${nm}(n) after n months?`,c,[lin(d,a),{t:`${a} ${sg(d)} ${d}(n + 1)`,f:x=>a+d*(x+1)},expo(a,d),mul(a,d,'n')],`Start ${a}; add ${d} per month.`,'s(n) = ');},
 ()=>{const a=ri(2,6),r=pick([2,3]),c=expo(a,r);
  return mkC(`A post has ${a} shares at hour 0, and its shares ${r===2?'double':'triple'} each hour. Which explicit formula gives the shares p(n) after n hours?`,c,[lin(a,r),mul(a,r,'n'),swapexp(a,r,'n'),expo(a,r+1)],`Start ${a}; multiply by ${r} each hour.`,'p(n) = ');}
];

// ---------- LE.1 ----------
const LINCTX=[()=>`A candle burns down ${ri(2,5)} inches every hour.`,()=>`A savings jar gets $${ri(4,15)} added each week.`,()=>`A trail gains ${pick([30,40,50,60])} feet of elevation with every mile.`,()=>`A streaming service charges $${ri(7,15)} each month.`,()=>`A snail crawls ${ri(3,9)} centimeters every minute.`,()=>`A tank drains ${ri(4,12)} gallons every minute.`];
const EXPCTX=[()=>`The views on a video double every hour.`,()=>`A car loses ${pick([10,12,15,20])}% of its value each year.`,()=>`An investment grows ${pick([3,4,5,6,8])}% each year.`,()=>`A bacteria colony triples every day.`,()=>`The number of people who have heard a rumor doubles each day.`,()=>`A sample loses half of its mass every ${pick([2,3,5])} years.`];
const pickN=(fns,k)=>shuffle(fns).slice(0,k).map(f=>f());
const LE1=[
 ()=>{const s=pick([0,1]),st=pick([1,2]),xs=[0,1,2,3].map(i=>s+st*i),kind=pick(['lin','exp','none']);let ys,ex;
  if(kind==='lin'){const a=ri(1,9),d=pick([-4,-3,-2,2,3,4,5,6]);ys=[0,1,2,3].map(i=>a+d*i);ex=`y changes by ${N(d)} every time: a constant difference. Linear.`}
  else if(kind==='exp'){const r=pick([2,3,4,0.5]),a=r===0.5?pick([48,64,80]):ri(1,5);ys=[0,1,2,3].map(i=>a*Math.pow(r,i));ex=`y is multiplied by ${rt(r)} every time: a constant ratio. Exponential.`}
  else{const a=ri(0,5),b=ri(1,4);ys=[0,1,2,3].map(i=>a+b*i*i);ex=`The differences (${ys[1]-ys[0]}, ${ys[2]-ys[1]}, ${ys[3]-ys[2]}) and the ratios both change. Neither.`}
  const ans={lin:'Linear',exp:'Exponential',none:'Neither'}[kind];
  return mk(`Is the relationship in the table linear, exponential, or neither?${tbl(xs,ys)}`,ans,['Linear','Exponential','Neither','Both'].filter(x=>x!==ans),ex,false);},
 ()=>{const c=EXPCTX[ri(0,5)](),o=pickN(LINCTX,3);return mk(`Which situation is best modeled by an exponential function?`,c,o,`It changes by a constant percent or factor each time. The others change by a fixed amount.`);},
 ()=>{const c=LINCTX[ri(0,5)](),o=pickN(EXPCTX,3);return mk(`Which situation is best modeled by a linear function?`,c,o,`It changes by a fixed amount each time. The others change by a constant percent or factor.`);},
 ()=>{const p=pick([5,8,10,12,15,20,25,30,40]),f=(1+p/100).toFixed(2);
  return mk(`A quantity grows by ${p}% each year. By what factor is it multiplied each year?`,f,[(p/100).toFixed(2),String(p),(1-p/100).toFixed(2)],`Keep 100% and add ${p}%: 1 + ${(p/100).toFixed(2)} = ${f}.`);},
 ()=>{const p=pick([5,8,10,12,15,20,25,30,40]),f=(1-p/100).toFixed(2);
  return mk(`A quantity decreases by ${p}% each year. By what factor is it multiplied each year?`,f,[(p/100).toFixed(2),String(p),(1+p/100).toFixed(2)],`Keep ${100-p}%: 1 − ${(p/100).toFixed(2)} = ${f}.`);},
 ()=>{const a=ri(2,6),b=ri(2,5),c=ri(2,9),x=`y = ${a}·${b}<sup>x</sup>`;
  return mk(`Which equation represents an exponential function?`,x,[`y = ${a} + ${b}x`,`y = ${b}x − ${c}`,`y = ${a}x<sup>2</sup>`],`The variable x is in the exponent.`);},
 ()=>{const a=ri(2,9),b=ri(2,6),c=ri(2,9),x=`y = ${b}x + ${a}`;
  return mk(`Which equation represents a linear function?`,x,[`y = ${a}·${b}<sup>x</sup>`,`y = ${c}·${b+1}<sup>x</sup>`,`y = ${b}x<sup>2</sup>`],`It has a constant rate of change ${b}: y = mx + b form.`);},
 ()=>{const isLin=Math.random()<.5,
   L='y changes by the same amount each time x increases by 1',E='y is multiplied by the same factor each time x increases by 1',F1='y changes by a larger amount each time x increases by 1',F2='y is multiplied by a different factor each time x increases by 1';
  return isLin?mk(`Which statement describes a linear function?`,L,[E,F1,F2],`Equal differences over equal intervals mean linear.`):mk(`Which statement describes an exponential function?`,E,[L,F1,F2],`Equal factors over equal intervals mean exponential.`);}
];

const STDGEN={BF1,BF2,LE1};
function makeQuiz(id){
  const gens=STDGEN[id],out=[],seen=new Set();let pool=[],g=0;
  while(out.length<10&&g++<600){if(!pool.length)pool=shuffle(gens);const q=pool.pop()();if(q&&!seen.has(q.stem)){seen.add(q.stem);out.push(q)}}
  return out;
}
