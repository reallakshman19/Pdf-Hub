import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useEditorStore } from '@/core/editor/store';
import { assertToolAllowed } from '@/core/tool-policy/disabledTools';
import { useAnnotationStore } from '@/core/annotations/store';
import type { PdfAnnotation } from '@/core/annotations/types';
import { useSessionStore } from '@/core/session/store';
import { useHistoryStore } from '@/core/document-history/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { commandBus } from '@/core/commands/bus';
import { materializePdfCommand } from '@/core/commands/types';
import { enqueueDocumentOperation, resetDocumentOperationQueueForTests } from '@/core/commands/documentOperationQueue';
import { MemoryHistoryJournalStore } from '@/adapters/history-journal/MemoryHistoryJournalStore';
import { MemoryRevisionStore } from '@/adapters/revision-store/MemoryRevisionStore';
import { registerHistoryJournalStore, clearHistoryJournalStoreRegistryForTests } from '@/core/document-history/journal/registry';
import { registerWorkingRevisionStore, clearWorkingRevisionStoreRegistryForTests } from '@/core/revision-store/registry';
import { createInitialHistoryJournalManifest } from '@/core/document-history/journal/types';
import { reviewThreadFromAnnotation } from '@/core/review/threadAdapter';

const fixture = () => new Uint8Array(readFileSync(join(process.env.ALT_FIXTURE_DIR!, 'F01-text-mixed-3p.pdf')));
function annotation(id:string,pageNumber=1):PdfAnnotation {return {id,type:'highlight',pageNumber,rect:{x:72,y:129,width:81,height:16},data:{},createdAt:1,updatedAt:1};}
function graph(key:string){return {pages:[1,2,3].map((n)=>({pageId:key+'-p'+n,documentKey:key,originalPageNumber:n,currentIndex:n-1,width:612,height:792,rotation:0 as const}))};}
function open(key:string){useSessionStore.getState().openDocument({documentKey:key,fileName:key+'.pdf',bytes:fixture(),pageCount:3,pageGraph:graph(key)});}
async function durable(key:string){
 const revisions=new MemoryRevisionStore({id:key+'-revisions'});registerWorkingRevisionStore(revisions);
 const journal=new MemoryHistoryJournalStore({id:key+'-journal'});registerHistoryJournalStore(journal);
 await journal.save(createInitialHistoryJournalManifest({journalId:key+'-history',revisionStoreId:revisions.id,revisionId:key,fileName:key+'.pdf'}));
 useSessionStore.getState().openDocument({documentKey:key,revisionStoreId:revisions.id,originalRevisionId:key,activeRevisionId:key,historyJournalStoreId:journal.id,historyJournalId:key+'-history',historyJournalPersistent:false,fileName:key+'.pdf',bytes:fixture(),pageCount:3,pageGraph:graph(key)});
 return journal;
}
beforeEach(()=>{
 resetDocumentOperationQueueForTests();useSessionStore.getState().clearDocument();useHistoryStore.getState().clear();
 useAnnotationStore.getState().setAnnotations([]);useWriterV2Store.getState().clearWriterV2();clearHistoryJournalStoreRegistryForTests();clearWorkingRevisionStoreRegistryForTests();
});
describe('ALT coordinator supplemental assertions, immutable app',()=>{
 it('A05 direct legacy stamp activation normalizes to select and policy throws',()=>{
  open('sha256:A');useEditorStore.getState().setActiveTool('highlight');
  useEditorStore.getState().setActiveTool('stamp');
  expect(useEditorStore.getState().activeTool).toBe('select');
  expect(()=>assertToolAllowed('stamp')).toThrow(/disabled/);
  expect(useAnnotationStore.getState().annotations).toEqual([]);
  expect(useHistoryStore.getState().undoStack).toHaveLength(0);
 });
 it('A08 duplicate annotation identity across physical pages must not create two records with one ID',async()=>{
  await durable('sha256:A');const store=useAnnotationStore.getState();
  store.addAnnotation(annotation('same-id',1));await enqueueDocumentOperation(()=>undefined);
  expect(useAnnotationStore.getState().annotations).toMatchObject([{id:'same-id',pageId:'sha256:A-p1'}]);
  store.addAnnotation(annotation('same-id',2));await enqueueDocumentOperation(()=>undefined);
  const rows=useAnnotationStore.getState().annotations;
  expect(new Set(rows.map(a=>a.id)).size).toBe(rows.length);
  expect(rows.filter(a=>a.id==='same-id')).toHaveLength(1);
  expect(rows.find(a=>a.id==='same-id')?.pageId).toBe('sha256:A-p1');
 });
 it('A08 stale revision command is rejected without state or history mutation',async()=>{
  open('sha256:A');const old=materializePdfCommand({type:'ANNOTATION_CHANGE',payload:{action:'add',annotationIds:['stale']}},'annotation-store','sha256:A');
  open('sha256:B');const result=await commandBus.execute({command:old});
  expect(result).toMatchObject({success:false,mutated:false,error:{code:'STALE_DOCUMENT'}});
  expect(useAnnotationStore.getState().annotations).toEqual([]);expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  expect(useSessionStore.getState().documentKey).toBe('sha256:B');
 });
 it('A08 queued annotation from previous revision must not land on newly opened document',async()=>{
  await durable('sha256:A');
  let release!:()=>void;const blocker=new Promise<void>(resolve=>{release=resolve;});
  const queued=enqueueDocumentOperation(()=>blocker);
  useAnnotationStore.getState().addAnnotation(annotation('stale-queued'));
  let newJournal;
  try {newJournal=await durable('sha256:B');useAnnotationStore.getState().setAnnotations([]);useHistoryStore.getState().clear();}
  finally {release();}
  await queued;await enqueueDocumentOperation(()=>undefined);
  expect(useSessionStore.getState().documentKey).toBe('sha256:B');
  expect(useAnnotationStore.getState().annotations).toEqual([]);
  expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  expect((await newJournal!.load('sha256:B-history'))?.entries).toHaveLength(0);
 });
 it('R04 actual nested reply projection preserves parent identity independent of native serialization',()=>{
  const root:PdfAnnotation={...annotation('root'),type:'comment',data:{text:'Root',review:{author:'A',createdAt:1,updatedAt:3,status:'open',replies:[{id:'reply-a',author:'B',content:'Same text',createdAt:2},{id:'reply-b',author:'C',content:'Same text',createdAt:3,parentReplyId:'reply-a'}]}}};
  const thread=reviewThreadFromAnnotation(root);
  expect(thread?.messages.map(m=>m.id)).toEqual(['root:root','reply-a','reply-b']);
  expect(thread?.messages.find(m=>m.id==='reply-a')?.parentReplyId).toBeUndefined();
  expect(thread?.messages.find(m=>m.id==='reply-b')?.parentReplyId).toBe('reply-a');
  expect(root.data.review?.replies[1].parentReplyId).toBe('reply-a');
 });
});
