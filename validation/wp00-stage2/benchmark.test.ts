import { expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { useAnnotationStore } from '@/core/annotations/store';
import type { PdfAnnotation } from '@/core/annotations/types';
import { useSessionStore } from '@/core/session/store';
import { useHistoryStore } from '@/core/document-history/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { enqueueDocumentOperation, resetDocumentOperationQueueForTests } from '@/core/commands/documentOperationQueue';
import { MemoryHistoryJournalStore } from '@/adapters/history-journal/MemoryHistoryJournalStore';
import { MemoryRevisionStore } from '@/adapters/revision-store/MemoryRevisionStore';
import { registerHistoryJournalStore, clearHistoryJournalStoreRegistryForTests } from '@/core/document-history/journal/registry';
import { registerWorkingRevisionStore, clearWorkingRevisionStoreRegistryForTests } from '@/core/revision-store/registry';
import { createInitialHistoryJournalManifest } from '@/core/document-history/journal/types';

const bytes=()=>new Uint8Array(readFileSync(join(process.env.ALT_FIXTURE_DIR!, 'F01-text-mixed-3p.pdf')));
function annotation(id:string):PdfAnnotation{return {id,type:'highlight',pageNumber:1,rect:{x:72,y:129,width:81,height:16},data:{},createdAt:1,updatedAt:1};}
async function open(key:string){
 const rev=new MemoryRevisionStore({id:key+'-rev'}); registerWorkingRevisionStore(rev);
 const j=new MemoryHistoryJournalStore({id:key+'-j'});registerHistoryJournalStore(j);
 await j.save(createInitialHistoryJournalManifest({journalId:key+'-history',revisionStoreId:rev.id,revisionId:key,fileName:key+'.pdf'}));
 useSessionStore.getState().openDocument({documentKey:key,revisionStoreId:rev.id,originalRevisionId:key,activeRevisionId:key,historyJournalStoreId:j.id,historyJournalId:key+'-history',historyJournalPersistent:false,fileName:key+'.pdf',bytes:bytes(),pageCount:3,pageGraph:{pages:[1,2,3].map(n=>({pageId:key+'-p'+n,documentKey:key,originalPageNumber:n,currentIndex:n-1,width:612,height:792,rotation:0 as const}))}});
 return j;
}
function reset(){
 resetDocumentOperationQueueForTests();useSessionStore.getState().clearDocument();useHistoryStore.getState().clear();
 useAnnotationStore.getState().setAnnotations([]);useWriterV2Store.getState().clearWriterV2();
 clearHistoryJournalStoreRegistryForTests();clearWorkingRevisionStoreRegistryForTests();
}
it('WP00 20 same-session edits and 20 stale attempts: two warmups and ten measured each',async()=>{
 const rows:{workload:string,iteration:number,warmup:boolean,ms:number,correct:boolean,annotations:number,history:number,journalEntries:number}[]=[];
 for(const workload of ['same-session','stale-session']){
  for(let iteration=0;iteration<12;iteration++){
   reset();let j=await open('sha256:A');const store=useAnnotationStore.getState();
   const started=performance.now();
   if(workload==='same-session'){
    for(let n=0;n<20;n++)store.addAnnotation(annotation('edit-'+n));
    await enqueueDocumentOperation(()=>undefined);
   }else{
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    const blocked=enqueueDocumentOperation(()=>gate);
    for(let n=0;n<20;n++)store.addAnnotation(annotation('stale-'+n));
    try{j=await open('sha256:B');store.setAnnotations([]);useHistoryStore.getState().clear();}
    finally{release();}
    await blocked;await enqueueDocumentOperation(()=>undefined);
   }
   const ms=performance.now()-started;const annotations=useAnnotationStore.getState().annotations.length;
   const history=useHistoryStore.getState().undoStack.length;
   const journalEntries=(await j.load(workload==='same-session'?'sha256:A-history':'sha256:B-history'))!.entries.length;
   const expected=workload==='same-session'?20:0;
   rows.push({workload,iteration,warmup:iteration<2,ms,correct:annotations===expected&&history===expected&&journalEntries===expected,annotations,history,journalEntries});
  }
 }
 const summary=['same-session','stale-session'].map(workload=>{
  const measured=rows.filter(r=>r.workload===workload&&!r.warmup), valid=measured.filter(r=>r.correct).map(r=>r.ms).sort((a,b)=>a-b);
  return {workload,correct:valid.length,total:measured.length,p50:valid.length===10?(valid[4]+valid[5])/2:null,p95:valid.length===10?valid[9]:null};
 });
 writeFileSync(join(process.env.OUT!,'benchmark.json'),JSON.stringify({sha:process.env.PROBE_SHA,rows,summary},null,2));
 expect(summary[0].correct).toBe(10);
 expect(summary[1].correct).toBe(process.env.PROBE_LABEL==='candidate'?10:0);
},120_000);
