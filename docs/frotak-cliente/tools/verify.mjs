import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const docs=path.resolve(import.meta.dirname,'..');
const repo=path.resolve(docs,'../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(docs,p),'utf8'));
const write=(p,x)=>fs.writeFileSync(path.join(docs,p),JSON.stringify(x,null,2)+'\n');
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
const failures=[];
const check=(ok,message)=>{if(!ok)failures.push(message);};
const rules=[
 ['RULE-AUTH','modulos/acesso-administracao.md','MOD-ACCESS'],
 ['RULE-USERS','modulos/acesso-administracao.md','MOD-USERS'],
 ['RULE-DRIVER-ACCESS','modulos/acesso-administracao.md','MOD-DRIVER-ACCESS'],
 ['RULE-CRUD','modulos/cadastros.md','Cadastros'],
 ['RULE-STAGE','modulos/operacao.md','RULE-STAGE'],
 ['RULE-CREATE','modulos/operacao.md','RULE-CREATE'],
 ['RULE-ASSET','modulos/operacao.md','RULE-ASSET'],
 ['RULE-ICMS','modulos/operacao.md','RULE-ICMS'],
 ['RULE-DOCUMENT','modulos/operacao.md','FLOW-DOC'],
 ['RULE-MANUAL','modulos/operacao.md','FLOW-MANUAL'],
 ['RULE-RETURN','modulos/operacao.md','FLOW-END'],
 ['RULE-HISTORY','modulos/consultas-consumo.md','MOD-HISTORY'],
 ['RULE-KML-INTERVAL','modulos/consultas-consumo.md','RULE-KML-INTERVAL'],
 ['RULE-KML-CYCLE','modulos/consultas-consumo.md','RULE-KML-CYCLE'],
 ['RULE-CASH','modulos/consultas-consumo.md','RULE-CASH'],
 ['RULE-SASCAR','modulos/consultas-consumo.md','MOD-MAP'],
 ['RULE-FIN-ACCESS','dados-permissoes.md','AUTHZ-02'],
 ['RULE-FIN-SETTLE','modulos/financeiro.md','FLOW-SETTLE'],
 ['RULE-FIN-BULK','modulos/financeiro.md','FLOW-BULK'],
 ['RULE-FIN-REPORT','modulos/financeiro.md','MOD-FIN-DRE'],
 ['RULE-FIN-RECUR','modulos/financeiro.md','MOD-FIN-RECUR'],
 ['RULE-FIN-PAYROLL','modulos/financeiro.md','MOD-FIN-PAYROLL'],
 ['RULE-ALLOWANCE','modulos/financeiro.md','MOD-ALLOWANCE'],
 ['RULE-AI-SCOPE','modulos/ia-suporte.md','RULE-AI-SCOPE'],
 ['RULE-AI-ACTION','modulos/ia-suporte.md','FLOW-AI-ACTION'],
 ['RULE-AI-VOICE','modulos/ia-suporte.md','MOD-AI-VOICE'],
 ['RULE-SUPPORT','modulos/ia-suporte.md','MOD-SUPPORT'],
 ['RULE-UI','padroes.md','UI-01'],
 ['RULE-IDLE','versao-publicada.md','MOD-IDLE'],
 ['RULE-PUSH','versao-publicada.md','MOD-PUSH'],
 ['RULE-LIVE-DELTA','versao-publicada.md','MOD-LIVE-DELTA'],
].map(([id,document,section])=>({id,document,section,evidence:'COD; OBS/TEST apenas quando explicitamente apontados no modulo ou evidencias'}));
write('inventarios/regras.json',rules);
for(const r of rules)check(fs.readFileSync(path.join(docs,r.document),'utf8').includes(r.section),`Regra sem secao: ${r.id}`);
const navMap={
 '/gestao-frota':'EV-NAV-00','/':'EV-NAV-01','/veiculos':'EV-NAV-02','/motoristas':'EV-NAV-03','/carretas':'EV-NAV-04','/clientes':'EV-NAV-05','/produtos':'EV-NAV-06','/abastecimentos':'EV-NAV-07','/historicos':'EV-NAV-08','/mapa':'EV-NAV-09','/frotak-ia':'EV-NAV-10','/manual':'EV-NAV-11','/usuarios':'EV-NAV-12','/financeiro':'EV-NAV-13','/financeiro/fluxo-caixa':'EV-NAV-14','/financeiro/dre':'EV-NAV-15','/financeiro/rentabilidade':'EV-NAV-16','/financeiro/contas':'EV-NAV-17','/financeiro/salarios':'EV-NAV-18','/financeiro/recorrencias':'EV-NAV-19','/financeiro/plano-contas':'EV-NAV-20','/financeiro/centros-custo':'EV-NAV-21','/lucros-despesas':'EV-NAV-22','/vinculacao':'EV-NAV-23','/remetentes':'EV-NAV-24','/destinatarios':'EV-NAV-25','/login':'EV-NAV-26'
};
const blocked=new Set(['/financeiro/pagar','/financeiro/receber','/financeiro/contas-pagar','/financeiro/contas-receber']);
const routeCoverage=r=>({routeId:r.id,route:r.route,evidence:navMap[r.route]??(r.route==='/financeiro/'?'EV-NAV-13':null),status:blocked.has(r.route)?'BLQ-NAV-TITLES':r.route.startsWith('/api/')?'NE-API':r.route==='/financeiro/'?'OBS-index-compartilhado':navMap[r.route]?'OBS-interface':'NE',limitation:blocked.has(r.route)?'Montagem pode gerar titulos reais automaticamente.':r.route.startsWith('/api/')?'Endpoint mutavel; nao chamado.':'OBS nao comprova acao de negocio, todos os estados ou perfis.'});
const observedSurfaceIds={
 'SUP-14358a94d5c4':['EV-SUP-01','EV-SUP-02','EV-SUP-03'],
 'SUP-337d4f6c2ef5':['EV-SUP-04'],'SUP-170ba7828db7':['EV-SUP-05'],
 'SUP-57e4c33520a7':['EV-SUP-06'],'SUP-17f20ca1f543':['EV-SUP-07'],
 'SUP-8320102ecc6c':['EV-SUP-08'],'SUP-40751caa6cff':['EV-SUP-10'],
 'SUP-83e3f48277ad':['EV-SUP-11','EV-SUP-12'],'SUP-595645ace353':['EV-SUP-13'],
 'SUP-d5b645d0e010':['EV-SUP-14'],'SUP-a1292291461d':['EV-SUP-15'],
 'SUP-6ad363a677c1':['EV-SUP-17'],'SUP-f1c4b10f461f':['EV-SUP-21'],
};
const suites=[];
for(const folder of ['inventarios','inventarios/deploy-974adae']){
 const routes=read(folder+'/rotas.json'),controls=read(folder+'/controles.json'),surfaces=read(folder+'/superficies.json'),groups=read(folder+'/grupos-rastreabilidade.json'),matrix=read(folder+'/matriz-controles.json');
 const ids=new Set(controls.map(x=>x.id)),groupIds=new Set(groups.map(x=>x.id));
 for(const [name,rows] of [['routes',routes],['controls',controls],['surfaces',surfaces],['groups',groups]])check(new Set(rows.map(x=>x.id)).size===rows.length,`${folder}: IDs duplicados em ${name}`);
 check(matrix.length===controls.length,`${folder}: tamanho da matriz difere dos controles`);
 for(const row of matrix){check(ids.has(row.controlId),`CTL sem controle: ${row.controlId}`);check(groupIds.has(row.groupId),`GRP inexistente: ${row.groupId}`);}
 for(const g of groups)for(const rule of g.ruleRefs)check(rules.some(r=>r.id===rule),`Regra inexistente ${rule}`);
 for(const r of routes)check(fs.existsSync(path.join(repo,r.source))||folder.includes('deploy-'),`Fonte ausente ${r.source}`);
 const coverage=routes.map(routeCoverage);
 write(folder+'/rotas-navegacao.json',coverage);
 const surfaceCoverage=surfaces.map(s=>{const ev=observedSurfaceIds[s.id]??(s.source.endsWith('/manual.tsx')&&s.tag==='details'?['EV-SUP-18']:[]);return{surfaceId:s.id,status:ev.length?'OBS-variante-especifica':/Content$/.test(s.tag)||s.source.endsWith('/Modal.tsx')?'COD-wrapper':'COD-NE',evidence:ev,limitation:ev.length?'Apenas variantes explicitadas em evidencias/navegacao.md; nao todos os estados/edicoes.':'Implementacao inventariada; abertura nao certificada. Restricao de browser ou condicao de perfil/registro.'};});
 write(folder+'/superficies-cobertura.json',surfaceCoverage);
 const stats=read(folder+'/cobertura-estatica.json');
 suites.push({...stats,routeCoverage:{observedDeclarations:coverage.filter(r=>r.status.startsWith('OBS')).length,blockedByMutation:coverage.filter(r=>r.status==='BLQ-NAV-TITLES').length,apiNotExecuted:coverage.filter(r=>r.status==='NE-API').length},surfaceCoverage:{observedTemplateDeclarations:surfaceCoverage.filter(x=>x.status.startsWith('OBS')).length,wrappers:surfaceCoverage.filter(x=>x.status==='COD-wrapper').length,codeOnly:surfaceCoverage.filter(x=>x.status==='COD-NE').length}});
}
const catalog=read('evidencias/schema-remoto-metadados.json').catalog;
const remoteTables=new Set(catalog.tables.filter(t=>['r','p'].includes(t.kind)).map(t=>t.name));
const remoteMigrations=read('evidencias/ambiente-remoto.json').database.migrations;
const diff=execFileSync('git',['diff','--name-status','9acb059','974adae','--','central-dias-main','supabase'],{cwd:repo,encoding:'utf8'}).trim().split('\n').map(l=>{const[status,...p]=l.split('\t');return{status,path:p.join('\t')};});
write('inventarios/diferencas-versoes.json',diff);
const deployedMigrations=execFileSync('git',['ls-tree','-r','--name-only','974adae','--','supabase/migrations'],{cwd:repo,encoding:'utf8'}).trim().split('\n').map(p=>{const m=path.basename(p).match(/^(\d+)_(.+)\.sql$/);return{version:m[1],name:m[2],path:p};});
write('inventarios/comparacao-migrations.json',deployedMigrations.map(m=>({...m,remoteSameVersion:remoteMigrations.find(r=>r.version===m.version)??null,remoteSameName:remoteMigrations.filter(r=>r.name===m.name),status:remoteMigrations.some(r=>r.version===m.version)?'versao-presente-conferir-nome':remoteMigrations.some(r=>r.name===m.name)?'nome-presente-com-versao-diferente':'ausente-no-projeto-consultado'})));
check(!remoteTables.has('public.frotak_push_subscriptions'),'Rever afirmacao de ausencia da tabela push: catalogo mudou');
let links=0,jsonFiles=0;
for(const file of walk(docs)){
 const text=fs.readFileSync(file,'utf8');
 if(file.endsWith('.json')){JSON.parse(text);jsonFiles++;}
 if(file.endsWith('.md'))for(const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
   const target=m[1].split('#')[0];if(!target||/^(https?:|mailto:)/.test(target))continue;
   links++;check(fs.existsSync(path.resolve(path.dirname(file),target)),`Link quebrado: ${path.relative(docs,file)} -> ${target}`);
 }
 if(!file.endsWith('.mjs'))check(!/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}|sb_secret_[A-Za-z0-9_-]{15,}|sk-proj-[A-Za-z0-9_-]{15,}/.test(text),`Padrao de segredo encontrado em ${path.relative(docs,file)}`);
}
const corpus=fs.readFileSync(path.join(repo,'central-dias-main/scripts/frotak-ai-v2-cases.ts'),'utf8');
const result={evidenceId:'EV-DOC-CHECK',date:'2026-10-19',ok:failures.length===0,checks:{jsonFilesParsed:jsonFiles,localMarkdownLinksChecked:links,individualControlsLinked:suites.map(s=>({revision:s.revision,count:s.controls})),uniqueIds:true,modelQuestionFixtures:(corpus.match(/\bquestion\s*:/g)??[]).length-1},coverage:suites,remoteSchema:{baseTables:remoteTables.size,views:catalog.tables.filter(t=>['v','m'].includes(t.kind)).length,columns:catalog.columns.length,policies:catalog.policies.length,triggers:catalog.triggers.length,functions:catalog.functions.length,constraints:catalog.constraints.length},failures,limitations:['Checagem documental nao executa aplicativo, queries de negocio ou integracoes.','Verifica estrutura/links/IDs/padroes de segredo, nao garante semantica individual completa nem ausencia de todos os dados pessoais.','OBS e TEST nao sao herdados automaticamente entre revisoes.']};
write('evidencias/validacao-documental.json',result);
console.log(JSON.stringify(result,null,2));
if(failures.length)process.exitCode=1;
