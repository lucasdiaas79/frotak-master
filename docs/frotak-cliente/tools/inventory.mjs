import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(path.join(root, 'central-dias-main/package.json'));
const ts = require('typescript');
const targetRevision = process.argv.find(a=>a.startsWith('--revision='))?.slice(11);
const revision = targetRevision || execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const out = path.join(root, 'docs/frotak-cliente/inventarios', targetRevision ? 'deploy-974adae' : '');
fs.mkdirSync(out, { recursive: true });
const rel = p => path.relative(root, p).replaceAll('\\', '/');
const walk = p => fs.existsSync(p) ? fs.readdirSync(p, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(p, e.name)) : [path.join(p, e.name)]) : [];
const id = (prefix, s) => `${prefix}-${crypto.createHash('sha256').update(s).digest('hex').slice(0, 12)}`;
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim().replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]').replace(/\b[A-Z]{3}[- ]?\d[A-Z0-9]\d{2}\b/g, '[placa]').replace(/\b123456\b/g, '[credencial-omitida]').replace(/\b\d{10,14}\b/g, '[numero]').slice(0, 220);
const save = (name, rows) => fs.writeFileSync(path.join(out, `${name}.json`), (Array.isArray(rows) ? '[\n'+rows.map(r=>JSON.stringify(r)).join(',\n')+'\n]' : JSON.stringify(rows, null, 2)) + '\n');
const revisionPaths = targetRevision ? execFileSync('git',['ls-tree','-r','--name-only',targetRevision,'--','central-dias-main/src','central-dias-main/server','central-dias-main/scripts','supabase/migrations'],{cwd:root,encoding:'utf8'}).trim().split('\n') : [];
const readSource = p => targetRevision ? execFileSync('git',['show',`${targetRevision}:${rel(p)}`],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}) : fs.readFileSync(p,'utf8');
const files = (targetRevision ? revisionPaths.filter(p=>/^central-dias-main\/(src|server)\//.test(p)).map(p=>path.join(root,p)) : [...walk(path.join(root, 'central-dias-main/src')), ...walk(path.join(root, 'central-dias-main/server'))]).filter(p => /\.tsx?$/.test(p) && !p.endsWith('routeTree.gen.ts'));
const routes = [], controls = [], surfaces = [], symbols = [], calls = [], imports = [], types = [], effects = [], guards = [], feedback = [], environment = [];
const controlTags = /^(button|Button|Input|input|select|Select|textarea|Textarea|Checkbox|Switch|TabsTrigger|Toggle|ToggleGroupItem|Link|a|form|TableHead|th|Label|label|SelectItem|option|DropdownMenuItem|CommandItem|SheetTrigger|DialogTrigger|AccordionTrigger|summary|SimpleSelect|SelectorField|IconButton|Field|CheckLine|KpiButton)$/;
const surfaceTags = /^(Modal|Dialog|DialogContent|Sheet|SheetContent|Drawer|DrawerContent|AlertDialog|Popover|PopoverContent|TabsContent|AccordionItem|Collapsible|DropdownMenuContent|details)$/;
for (const file of files) {
  const text = readSource(file);
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const source = rel(file), line = n => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const occurrences = new Map();
  function stable(prefix, seed) { const key = `${prefix}:${seed}`, ordinal = occurrences.get(key) ?? 0; occurrences.set(key, ordinal + 1); return id(prefix, `${source}:${seed}:${ordinal}`); }
  function owner(n) { for(let p=n.parent; p; p=p.parent) { if(ts.isFunctionDeclaration(p) && p.name) return p.name.text; if(ts.isVariableDeclaration(p) && (ts.isArrowFunction(p.initializer ?? sf) || ts.isFunctionExpression(p.initializer ?? sf))) return p.name.getText(sf); } return 'module'; }
  function attrs(n) { return Object.fromEntries(n.attributes.properties.filter(ts.isJsxAttribute).map(a => [a.name.getText(sf), a.initializer ? clean(ts.isStringLiteral(a.initializer) ? a.initializer.text : a.initializer.getText(sf)) : true])); }
  function conditions(n) { const c=[]; for(let p=n.parent;p;p=p.parent){if(ts.isConditionalExpression(p)) c.push(clean(p.condition.getText(sf))); else if(ts.isBinaryExpression(p) && p.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken)c.push(clean(p.left.getText(sf))); if(c.length===3)break;} return c; }
  function visit(n) {
    if (ts.isImportDeclaration(n)) imports.push({source, line:line(n), module:n.moduleSpecifier.text});
    if(ts.isIfStatement(n)) guards.push({id:stable('GUARD',`${owner(n)}:${clean(n.expression.getText(sf))}`),source,line:line(n),owner:owner(n),condition:clean(n.expression.getText(sf)),consequence:ts.isBlock(n.thenStatement)?n.thenStatement.statements.map(s=>ts.SyntaxKind[s.kind]):[ts.SyntaxKind[n.thenStatement.kind]]});
    if(ts.isPropertyAccessExpression(n) && /^(process\.env|import\.meta\.env)$/.test(n.expression.getText(sf)))environment.push({name:n.name.text,source,line:line(n)});
    if (ts.isFunctionDeclaration(n) && n.name || ts.isVariableDeclaration(n) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isCallExpression(n.initializer))) {
      const name = n.name?.getText(sf);
      if(name) symbols.push({id:stable('SYM',name),source,line:line(n),name,kind:ts.isFunctionDeclaration(n)?'function':'variable/call',calls:[...n.getText(sf).matchAll(/(?:\b(?:await\s+)?)([a-zA-Z_$][\w$]*(?:\.[\w$]+)*)\s*\(/g)].map(m=>m[1]).filter((v,i,a)=>a.indexOf(v)===i).slice(0,100)});
    }
    if (ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) {
      const entry = {id:stable('TYPE',n.name.text), source,line:line(n),name:n.name.text};
      if(ts.isInterfaceDeclaration(n))entry.fields=n.members.map(m=>({name:m.name?.getText(sf),optional:!!m.questionToken,type:clean(m.type?.getText(sf))}));
      else entry.type=clean(n.type.getText(sf));
      types.push(entry);
    }
    if(ts.isCallExpression(n)) {
      const callee=n.expression.getText(sf), first=n.arguments[0];
      if(/^toast\.(success|error|info|warning)$/.test(callee))feedback.push({source,line:line(n),owner:owner(n),kind:callee,message:first&&ts.isStringLiteral(first)?clean(first.text):'[dinamica; consultar fonte]'});
      if(callee==='createFileRoute' && first && ts.isStringLiteral(first)) routes.push({id:id('ROT',first.text),route:first.text,source,line:line(n),module:first.text.startsWith('/financeiro')?'financeiro':first.text.split('/')[1]||'dashboard',redirects:[...text.matchAll(/throw redirect\(\{\s*to:\s*["']([^"']+)/g)].map(m=>m[1])});
      if(/\.(rpc|from|invoke|upload|createSignedUrl)$/.test(callee) || callee==='createServerFn') calls.push({id:stable('CALL',`${owner(n)}:${callee}:${first && ts.isStringLiteral(first)?first.text:''}`),source,line:line(n),owner:owner(n),callee,target:first && ts.isStringLiteral(first)?first.text:'[dinamico/objeto]',operation:callee.split('.').at(-1)});
      if(callee==='useEffect' || callee==='setInterval') effects.push({id:stable('EFF',owner(n)),source,line:line(n),owner:owner(n),kind:callee,calls:[...(n.arguments[0]?.getText(sf)??'').matchAll(/\b([a-zA-Z_$][\w$]*(?:\.[\w$]+)*)\s*\(/g)].map(m=>m[1]).filter((v,i,a)=>a.indexOf(v)===i)});
    }
    if(ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag=n.tagName.getText(sf), a=attrs(n), own=owner(n), parent=ts.isJsxElement(n.parent)?n.parent:null;
      const isControl=controlTags.test(tag)||Object.keys(a).some(k=>/^on(?:Click|Submit|Change|ValueChange|KeyDown|CheckedChange)$/.test(k));
      const label=clean([a['aria-label'],a.title,a.placeholder,a.label,parent?.children?.filter(ts.isJsxText).map(c=>c.text).join(' ')].filter(Boolean).join(' | '));
      const entry={id:stable(isControl?'CTL':'SUP',`${own}:${tag}:${label}`),source,line:line(n),owner:own,tag,label:label||'[dinamico/icone; consultar fonte]',conditions:conditions(n),attributes:Object.fromEntries(Object.entries(a).filter(([k])=>/^(type|required|min|max|step|pattern|accept|multiple|disabled|name|id|value|on\w+|open|title|placeholder|aria-label|to|href)$/.test(k) && !/password|secret|token/i.test(k))),handlers:Object.fromEntries(Object.entries(a).filter(([k])=>/^on[A-Z]/.test(k)))};
      if(isControl)controls.push(entry);
      if(surfaceTags.test(tag))surfaces.push({...entry,id:stable('SUP',`${own}:${tag}:${a.title??a.value??''}`)});
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
}

const migrations = (targetRevision ? revisionPaths.filter(p=>p.startsWith('supabase/migrations/')).map(p=>path.join(root,p)) : walk(path.join(root,'supabase/migrations'))).filter(p=>p.endsWith('.sql')).sort();
const sqlObjects=[], columns=[], relations=[], declarations=[], sqlContracts=[];
function splitSql(s) { let depth=0, quote=false, start=0,parts=[]; for(let i=0;i<s.length;i++){if(s[i]==="'"){if(quote&&s[i+1]==="'"){i++;continue;}quote=!quote;}if(!quote){if(s[i]==='(')depth++;if(s[i]===')')depth--;if(s[i]===','&&depth===0){parts.push(s.slice(start,i));start=i+1;}}}parts.push(s.slice(start));return parts; }
for(const file of migrations){
  const text=readSource(file),source=rel(file),ln=i=>text.slice(0,i).split('\n').length;
  const patterns = [
    ['table',/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w.\"]+)/gi],
    ['function',/create\s+(?:or\s+replace\s+)?function\s+([\w.\"]+)\s*\(/gi],
    ['view',/create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+([\w.\"]+)/gi],
    ['trigger',/create\s+(?:or\s+replace\s+)?trigger\s+([\w.\"]+)/gi],
    ['policy',/create\s+policy\s+("[^"]+"|[\w.]+)/gi],
    ['enum',/create\s+type\s+([\w.\"]+)\s+as\s+enum/gi],
    ['index',/create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([\w.\"]+)/gi],
    ['rls',/alter\s+table\s+([\w.\"]+)\s+enable\s+row\s+level\s+security/gi],
    ['drop',/drop\s+(?:function|table|policy|trigger|view|index|type)\s+(?:if\s+exists\s+)?("[^"]+"|[\w.]+)/gi]
  ];
  for(const[kind,re]of patterns)for(const m of text.matchAll(re))sqlObjects.push({id:id('SQL',`${source}:${kind}:${m[1]}:${m.index}`),kind,name:m[1],source,line:ln(m.index),status:'declaracao historica; conferir ultima redefinicao e drops'});
  for(const m of text.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w.\"]+)\s*\(([\s\S]*?)\)\s*returns\s+([\s\S]*?)\bas\s+\$[\w]*\$/gi))sqlContracts.push({kind:'function-signature',name:m[1],arguments:clean(m[2]),returnsAndOptions:clean(m[3]),source,line:ln(m.index)});
  for(const m of text.matchAll(/create\s+policy\s+("[^"]+"|[\w.]+)\s+on\s+([\w.]+)([\s\S]*?);/gi))sqlContracts.push({kind:'policy',name:m[1],table:m[2],expression:clean(m[3]),source,line:ln(m.index)});
  for(const m of text.matchAll(/create\s+(?:or\s+replace\s+)?trigger\s+([\w.]+)([\s\S]*?);/gi))sqlContracts.push({kind:'trigger',name:m[1],expression:clean(m[2]),source,line:ln(m.index)});
  for(const m of text.matchAll(/constraint\s+(\w+)\s+check\s*\(([\s\S]*?)\)(?:\s*[,;]|\s*$)/gi))sqlContracts.push({kind:'check',name:m[1],expression:clean(m[2]),source,line:ln(m.index)});
  for(const m of text.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w.\"]+)\s*\(/gi)){
    const start=m.index+m[0].length;let depth=1,i=start,quote=false;for(;i<text.length&&depth;i++){if(text[i]==="'"){if(quote&&text[i+1]==="'"){i++;continue;}quote=!quote;}if(!quote){if(text[i]==='(')depth++;if(text[i]===')')depth--;}}
    for(const part of splitSql(text.slice(start,i-1))) {const c=part.trim().match(/^([a-z_]\w*)\s+([\s\S]*)/i);if(!c)continue;if(/^(constraint|primary|unique|foreign|check|exclude)$/i.test(c[1]))continue;const definition=c[2];columns.push({table:m[1],field:c[1],type:clean(definition.split(/\b(?:not\s+null|null|default|references|constraint|check|primary|unique)\b/i)[0]),notNull:/not\s+null/i.test(definition),reference:definition.match(/references\s+([\w.]+)\s*\(([^)]+)\)/i)?.slice(1)??[],source,line:ln(m.index)});}
  }
  for(const m of text.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?([\w.]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)\s+([^;\n]+)/gi))columns.push({table:m[1],field:m[2],type:clean(m[3].split(/\b(?:not\s+null|null|default|references|constraint|check|primary|unique)\b/i)[0]),source,line:ln(m.index),alter:true});
  for(const m of text.matchAll(/references\s+([\w.]+)\s*\(([^)]+)\)/gi))relations.push({target:m[1],fields:clean(m[2]),source,line:ln(m.index)});
  for(const m of text.matchAll(/(?:cron\.schedule|cron\.unschedule|create\s+publication|alter\s+publication|grant\s+execute|revoke\s+execute|security\s+definer|create\s+policy|create\s+(?:or\s+replace\s+)?trigger)/gi))declarations.push({kind:clean(m[0]),source,line:ln(m.index)});
}
save('rotas',routes);save('controles',controls);save('superficies',surfaces);save('simbolos',symbols);save('chamadas-dados',calls);save('imports',imports);save('tipos',types);save('efeitos-automaticos',effects);save('validacoes',guards);save('feedback',feedback);save('ambiente-referencias',environment);save('sql-declaracoes',sqlObjects);save('sql-colunas',columns);save('sql-relacoes',relations);save('sql-seguranca-jobs',declarations);save('sql-contratos',sqlContracts);
const sources=new Set(files.map(rel));
function importedSources(source){return imports.filter(i=>i.source===source).flatMap(i=>{const base=i.module.startsWith('@/')?'central-dias-main/src/'+i.module.slice(2):i.module.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(source),i.module)):'';return [base,base+'.ts',base+'.tsx',base+'/index.ts',base+'/index.tsx'].filter(p=>sources.has(p));});}
function closure(source,seen=new Set()){if(seen.has(source))return seen;seen.add(source);for(const next of importedSources(source))closure(next,seen);return seen;}
save('rotas-componentes',routes.map(r=>{const reach=closure(r.source);return{routeId:r.id,route:r.route,source:r.source,componentSources:[...reach].filter(p=>/\/components\//.test(p)&&!p.includes('/ui/')),controlIds:controls.filter(c=>reach.has(c.source)&&!c.source.includes('/ui/')).map(c=>c.id),surfaceIds:surfaces.filter(c=>reach.has(c.source)&&!c.source.includes('/ui/')).map(c=>c.id),limitation:'grafo estatico de imports; nao prova renderizacao nem ramo executado'};}));
save('rpc-sql-rastreio',calls.filter(c=>c.operation==='rpc').map(c=>({...c,definitions:sqlObjects.filter(s=>s.kind==='function'&&s.name.replaceAll('"','').split('.').at(-1)===c.target).map(s=>({source:s.source,line:s.line})),limitation:'Ultima declaracao lexical nao inclui patches dinamicos por pg_get_functiondef/replace.'})));
const ruleFor=source=>source.includes('FrotakPushToggle')?['RULE-PUSH']:source.includes('/daily-allowances/')?['RULE-ALLOWANCE']:source.includes('/financial/')?['RULE-FIN-ACCESS','RULE-FIN-SETTLE','RULE-FIN-REPORT']:source.includes('gestao-frota')||source.includes('ManualMove')?['RULE-STAGE','RULE-CREATE','RULE-ASSET','RULE-DOCUMENT','RULE-MANUAL','RULE-RETURN']:source.includes('abastecimentos')?['RULE-KML-INTERVAL','RULE-KML-CYCLE','RULE-CASH']:source.includes('motoristas')?['RULE-DRIVER-ACCESS']:source.includes('usuarios')?['RULE-USERS']:source.includes('frotak-ia')?['RULE-AI-SCOPE','RULE-AI-ACTION','RULE-AI-VOICE']:source.includes('manual')?['RULE-SUPPORT']:source.includes('mapa')?['RULE-SASCAR']:source.includes('historicos')?['RULE-HISTORY']:source.includes('AppLayout')?['RULE-AUTH']:source.includes('/components/ui/')||source.includes('/components/frotak/')||source.includes('/Modal.tsx')?['RULE-UI']:['RULE-CRUD'];
const groups=[...new Set(controls.map(c=>c.source+'#'+c.owner))].map(key=>{const [source,owner]=key.split('#');return{id:id('GRP',key),source,owner,ruleRefs:ruleFor(source),controlIds:controls.filter(c=>c.source===source&&c.owner===owner).map(c=>c.id),guards:guards.filter(c=>c.source===source&&c.owner===owner).map(c=>c.id),symbolRefs:symbols.filter(s=>s.source===source&&s.name===owner).map(s=>s.id),dataCallRefs:calls.filter(c=>c.source===source&&c.owner===owner).map(c=>c.id),importGraphRef:source};});
save('grupos-rastreabilidade',groups);
save('component-data-sources',[...new Set(groups.map(g=>g.source))].map(source=>({source,candidates:[...closure(source)].filter(s=>/\/lib\/|\/server\//.test(s))})));
save('matriz-controles',controls.map(c=>({controlId:c.id,groupId:id('GRP',c.source+'#'+c.owner)})));
const tests=(targetRevision ? revisionPaths.filter(p=>p.startsWith('central-dias-main/scripts/')).map(p=>path.join(root,p)) : walk(path.join(root,'central-dias-main/scripts'))).filter(p=>/test-|cases/.test(p));
save('testes',tests.map(p=>({source:rel(p),status:'existente; execucao consultar evidencias',names:[...readSource(p).matchAll(/(?:test|it)\(\s*["'`]([^"'`]+)/g)].map(m=>clean(m[1]))})));
const summary={revision,date:'2026-10-19',sourceFiles:files.length,routes:routes.length,controls:controls.length,surfaces:surfaces.length,symbols:symbols.length,dataCalls:calls.length,effects:effects.length,typeDeclarations:types.length,migrations:migrations.length,sqlDeclarations:sqlObjects.length,columnDeclarations:columns.length,relationDeclarations:relations.length,testFiles:tests.length,limitations:['AST nao e runtime; controles dinamicos podem gerar varios itens ou nenhum.','SQL e inventario lexical historico, nao dump de schema aplicado; blocos condicionais, SQL dinamico, redefinicoes e drops exigem leitura humana.','Nao foram lidos valores de ambiente nem dados de usuarios pelo gerador.','IDs estaveis por arquivo/contexto/tipo/rotulo; ocorrencias duplicadas usam ordinal, nao linha.','Matriz CTL -> GRP e candidata por componente; nao implica validacao semantica individual, OBS ou TEST.']};
save('cobertura-estatica',summary);
console.log(JSON.stringify(summary,null,2));
